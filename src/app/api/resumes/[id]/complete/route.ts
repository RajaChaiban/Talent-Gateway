import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { jsonData, jsonError } from "@/lib/http";
import { requireSameOrigin } from "@/lib/http-origin";
import { inputErrorMessage, resumeIdSchema } from "@/lib/jobs/schemas";
import { failureResponse, resumeNotFoundResponse } from "@/lib/resumes/api";
import { completeUpload } from "@/lib/resumes/complete";
import { getResume } from "@/lib/resumes/queries";

/** Reading a file is bounded by its own time guard (8 s); this keeps a stuck function from running to the platform default. */
export const maxDuration = 30;

const retryQuerySchema = z.object({ retry: z.literal("1").optional() });

/**
 * Reads back the file the browser uploaded, extracts its text and saves the
 * outcome on the row: `extracted` with the text, or `failed` with a reason
 * the recruiter can act on. `?retry=1` judges a failed file once more.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/resumes/[id]/complete">,
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const refused = requireSameOrigin(request);
  if (refused) return refused;

  const id = resumeIdSchema.safeParse((await ctx.params).id);
  if (!id.success) {
    return jsonError("invalid_input", inputErrorMessage(id.error), 400);
  }

  const query = retryQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success) {
    return jsonError("invalid_input", inputErrorMessage(query.error), 400);
  }

  try {
    const resume = await getResume(auth.supabase, id.data);
    if (!resume) return resumeNotFoundResponse();

    const result = await completeUpload(auth.supabase, resume, {
      retry: query.data.retry === "1",
    });
    if (result.state === "gone") return resumeNotFoundResponse();
    if (result.state === "missing") {
      return jsonError("conflict", "The upload has not finished. Try the file again.", 409);
    }

    revalidatePath(`/app/jobs/${resume.job_id}`);
    revalidatePath("/app");
    return jsonData({
      resume_id: resume.id,
      status: result.status,
      characters: result.characters,
      ...(result.status === "failed" ? { message: result.message } : {}),
    });
  } catch (error) {
    return failureResponse(error);
  }
}
