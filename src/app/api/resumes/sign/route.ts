import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { RESUME_LIMITS, UPLOAD_LIMITS } from "@/lib/config";
import { jsonData, jsonError } from "@/lib/http";
import { requireSameOrigin } from "@/lib/http-origin";
import { notFoundResponse, readJsonBody } from "@/lib/jobs/api";
import { getJob } from "@/lib/jobs/queries";
import { inputErrorMessage } from "@/lib/jobs/schemas";
import { failureResponse } from "@/lib/resumes/api";
import { isAllowedMimeType, storagePath } from "@/lib/resumes/files";
import { FILE_RULE_MESSAGE, JOB_FULL_MESSAGE } from "@/lib/resumes/messages";
import {
  countResumes,
  createPendingResume,
  createSignedUpload,
  deleteResumeRow,
  getResume,
} from "@/lib/resumes/queries";
import type { StoredResume } from "@/lib/resumes/types";
import { signBodySchema } from "@/lib/resumes/schemas";

/** A few short database calls and one storage call. */
export const maxDuration = 30;

const ID_CLASH_MESSAGE = "This resume id is already used for a different file.";

/** The same job, name and path: signing it again is a retry of the same upload. */
function isSameUpload(row: StoredResume, jobId: string, fileName: string, path: string): boolean {
  return row.job_id === jobId && row.file_name === fileName && row.storage_path === path;
}

/**
 * Creates the `pending` row for one file and hands back a signed upload token
 * for its storage path.
 *
 * DECISION: the browser uploads the file straight to Storage with this signed
 * token, so the file never passes through a function: a function request body
 * is capped at 4.5 MB, and relaying 5 MB files would cost time and memory here.
 * This route only checks the request and reserves the path.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const refused = requireSameOrigin(request);
  if (refused) return refused;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = signBodySchema.safeParse(body.value);
  if (!parsed.success) {
    return jsonError("invalid_input", inputErrorMessage(parsed.error), 400);
  }
  const {
    resume_id: suppliedId,
    job_id: jobId,
    file_name: fileName,
    content_type: contentType,
    size,
  } = parsed.data;

  if (!isAllowedMimeType(contentType)) {
    return jsonError("unsupported_media_type", FILE_RULE_MESSAGE, 415);
  }
  if (size > UPLOAD_LIMITS.maxBytes) {
    return jsonError("payload_too_large", FILE_RULE_MESSAGE, 413);
  }

  try {
    // The browser may have signed this same file before and lost the answer: give it a fresh signed
    // URL for the row that exists, whatever the job's count says now.
    if (suppliedId) {
      const existing = await getResume(auth.supabase, suppliedId);
      if (existing) {
        if (!isSameUpload(existing, jobId, fileName, storagePath(jobId, suppliedId, fileName))) {
          return jsonError("conflict", ID_CLASH_MESSAGE, 409);
        }
        const again = await createSignedUpload(auth.supabase, existing.storage_path);
        return jsonData({ resume_id: existing.id, path: again.path, token: again.token });
      }
    }

    if (!(await getJob(auth.supabase, jobId))) return notFoundResponse();

    if ((await countResumes(auth.supabase, jobId)) >= RESUME_LIMITS.maxPerJob) {
      return jsonError("conflict", JOB_FULL_MESSAGE, 409);
    }

    const resumeId = suppliedId ?? randomUUID();
    const path = storagePath(jobId, resumeId, fileName);
    const upload = await createSignedUpload(auth.supabase, path);
    const created = await createPendingResume(auth.supabase, {
      id: resumeId,
      jobId,
      fileName,
      storagePath: path,
    });
    if (created === "exists") {
      // Two signs of the same id arrived together and the other one won the insert.
      const winner = await getResume(auth.supabase, resumeId);
      if (!winner || !isSameUpload(winner, jobId, fileName, path)) {
        return jsonError("conflict", ID_CLASH_MESSAGE, 409);
      }
      return jsonData({ resume_id: resumeId, path: upload.path, token: upload.token });
    }

    // The check above and the insert are separate statements, so requests that
    // arrive together can all pass it. Counting again after the insert and
    // backing out when over the cap keeps the rows that remain at or under it.
    if ((await countResumes(auth.supabase, jobId)) > RESUME_LIMITS.maxPerJob) {
      await deleteResumeRow(auth.supabase, resumeId);
      return jsonError("conflict", JOB_FULL_MESSAGE, 409);
    }

    revalidatePath(`/app/jobs/${jobId}`);
    revalidatePath("/app");
    return jsonData({ resume_id: resumeId, path: upload.path, token: upload.token }, 201);
  } catch (error) {
    return failureResponse(error);
  }
}
