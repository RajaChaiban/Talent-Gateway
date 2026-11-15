import type { ServerClient } from "@/lib/auth/verified-user";
import { RESUME_BUCKET } from "./bucket";
import type { ResumeListItem, StoredResume } from "./types";

/** A failed database or storage call. `cause` keeps the error for the server log only. */
export class ResumesDataError extends Error {
  constructor(operation: string, cause?: unknown) {
    super(`Resumes call failed: ${operation}`, { cause });
    this.name = "ResumesDataError";
  }
}

/** Storage could not be reached or answered with a server error: worth trying again shortly. */
export class StorageUnavailableError extends Error {
  constructor(operation: string, cause?: unknown) {
    super(`Storage unavailable: ${operation}`, { cause });
    this.name = "StorageUnavailableError";
  }
}

type StorageFailureShape = { message: string; status?: number; statusCode?: string };

/** The object is not there: a 404 that is not about the bucket (a missing bucket is a configuration fault). */
export function isMissingObject(error: StorageFailureShape): boolean {
  const notFound = error.status === 404 || error.statusCode === "404";
  return notFound && !/bucket/i.test(error.message);
}

/** No response at all, a timeout, a rate limit or a 5xx: transient. Any other 4xx is a fault to log, not to retry. */
function isTransient(error: StorageFailureShape): boolean {
  const { status } = error;
  return status === undefined || status >= 500 || status === 408 || status === 429;
}

function storageFailure(operation: string, error: StorageFailureShape): Error {
  return isTransient(error)
    ? new StorageUnavailableError(operation, error)
    : new ResumesDataError(operation, error);
}

type Client = Pick<ServerClient, "from" | "storage">;

export async function countResumes(
  supabase: Pick<ServerClient, "from">,
  jobId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("resumes")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId);
  if (error) throw new ResumesDataError("count resumes", error);
  return count ?? 0;
}

/**
 * The job's resumes for its page, oldest first, without their text.
 *
 * DECISION: queries take the caller's client. The page passes the signed-in
 * recruiter's client, so row-level security decides what comes back, and
 * `extracted_text` stays on the server because the list never shows it.
 */
export async function listResumes(
  supabase: Pick<ServerClient, "from">,
  jobId: string,
): Promise<ResumeListItem[]> {
  const { data, error } = await supabase
    .from("resumes")
    .select("id, file_name, status, created_at")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new ResumesDataError("list resumes", error);
  return data;
}

export type NewResume = { id: string; jobId: string; fileName: string; storagePath: string };

/** Postgres' unique-violation code: the id or the storage path is already taken. */
const UNIQUE_VIOLATION = "23505";

/** `"exists"` means a row with this id (or path) is already there; the caller decides whether it is the same file. */
export async function createPendingResume(
  supabase: Pick<ServerClient, "from">,
  input: NewResume,
): Promise<"created" | "exists"> {
  const { error } = await supabase.from("resumes").insert({
    id: input.id,
    job_id: input.jobId,
    file_name: input.fileName,
    storage_path: input.storagePath,
    status: "pending",
  });
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return "exists";
    throw new ResumesDataError("create pending resume", error);
  }
  return "created";
}

export async function getResume(
  supabase: Pick<ServerClient, "from">,
  id: string,
): Promise<StoredResume | null> {
  const { data, error } = await supabase
    .from("resumes")
    .select("id, job_id, storage_path, file_name, status, extracted_text")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new ResumesDataError("get resume", error);
  return data;
}

export type Completion =
  | { status: "extracted"; extractedText: string }
  | { status: "failed" };

/** Saves the outcome. Returns false when no row was updated, because the resume was removed in the meantime. */
export async function completeResume(
  supabase: Pick<ServerClient, "from">,
  id: string,
  completion: Completion,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("resumes")
    .update({
      status: completion.status,
      extracted_text: completion.status === "extracted" ? completion.extractedText : null,
    })
    .eq("id", id)
    .select("id");
  if (error) throw new ResumesDataError("complete resume", error);
  return (data?.length ?? 0) > 0;
}

/** The stored bytes of a resume, or null when the object is not there. */
export async function downloadResumeFile(
  supabase: Pick<ServerClient, "storage">,
  storagePath: string,
): Promise<Uint8Array | null> {
  const { data, error } = await supabase.storage.from(RESUME_BUCKET).download(storagePath);
  if (error) {
    if (isMissingObject(error)) return null;
    throw storageFailure("download resume file", error);
  }
  return new Uint8Array(await data.arrayBuffer());
}

export type SignedUpload = { token: string; path: string };

export async function createSignedUpload(
  supabase: Pick<ServerClient, "storage">,
  storagePath: string,
): Promise<SignedUpload> {
  const { data, error } = await supabase.storage
    .from(RESUME_BUCKET)
    .createSignedUploadUrl(storagePath);
  if (error) throw storageFailure("create signed upload", error);
  return { token: data.token, path: data.path };
}

/**
 * Deletes the stored file, then the row. Null when no resume has this id.
 *
 * DECISION: the file goes first, so a storage failure leaves the row in
 * place and the recruiter can still see and remove it. The other order could
 * leave a file in storage that no row points to.
 */
export async function removeResume(supabase: Client, id: string): Promise<{ jobId: string } | null> {
  const resume = await getResume(supabase, id);
  if (!resume) return null;

  const removedFile = await supabase.storage.from(RESUME_BUCKET).remove([resume.storage_path]);
  if (removedFile.error) throw storageFailure("remove resume file", removedFile.error);

  const { error } = await supabase.from("resumes").delete().eq("id", id);
  if (error) throw new ResumesDataError("delete resume", error);
  return { jobId: resume.job_id };
}

/** Removes a row that was just inserted, for example when it turned out to exceed the cap. */
export async function deleteResumeRow(
  supabase: Pick<ServerClient, "from">,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("resumes").delete().eq("id", id);
  if (error) throw new ResumesDataError("delete resume row", error);
}
