import { requireUser } from "@/lib/auth/require-user";
import { jsonError } from "@/lib/http";
import { inputErrorMessage, resumeIdSchema } from "@/lib/jobs/schemas";
import { failureResponse, resumeNotFoundResponse } from "@/lib/resumes/api";
import { createSignedDownload, getResume } from "@/lib/resumes/queries";

/** One read and one signing call. */
export const maxDuration = 30;

/**
 * Sends the browser to a 60-second link to the stored file, saved under its
 * original name. A read, so it has no origin check: a link from another site
 * only downloads the file to the signed-in recruiter's own browser.
 *
 * DECISION: the row is read with the recruiter's own client, so row-level
 * security decides who may download, and the file never passes through the
 * function: storage serves the bytes.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/resumes/[id]/file">) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const id = resumeIdSchema.safeParse((await ctx.params).id);
  if (!id.success) {
    return jsonError("invalid_input", inputErrorMessage(id.error), 400);
  }

  try {
    const resume = await getResume(auth.supabase, id.data);
    if (!resume) return resumeNotFoundResponse();

    const url = await createSignedDownload(auth.supabase, resume.storage_path, resume.file_name);
    if (!url) return resumeNotFoundResponse();

    return new Response(null, {
      status: 303,
      headers: { Location: url, "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failureResponse(error);
  }
}
