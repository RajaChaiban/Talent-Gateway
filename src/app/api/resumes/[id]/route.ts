import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { jsonData, jsonError } from "@/lib/http";
import { requireSameOrigin } from "@/lib/http-origin";
import { inputErrorMessage, resumeIdSchema } from "@/lib/jobs/schemas";
import { failureResponse, resumeNotFoundResponse } from "@/lib/resumes/api";
import { removeResume } from "@/lib/resumes/queries";

/** One read, one storage delete and one row delete. */
export const maxDuration = 30;

/** Removes one resume: its stored file first, then its row. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/resumes/[id]">) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const refused = requireSameOrigin(request);
  if (refused) return refused;

  const id = resumeIdSchema.safeParse((await ctx.params).id);
  if (!id.success) {
    return jsonError("invalid_input", inputErrorMessage(id.error), 400);
  }

  try {
    const removed = await removeResume(auth.supabase, id.data);
    if (!removed) return resumeNotFoundResponse();

    revalidatePath(`/app/jobs/${removed.jobId}`);
    revalidatePath("/app");
    return jsonData({ resume_id: id.data, removed: true });
  } catch (error) {
    return failureResponse(error);
  }
}
