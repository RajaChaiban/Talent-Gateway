import type { ApiResult } from "./client-api";

/** Whether the row leaves the screen. When it stays, `message` says why. */
export type RemovalVerdict = { removed: true } | { removed: false; message: string };

/**
 * What a DELETE answer means for the row on screen. A 404 means the row is
 * already gone, which is what the recruiter wanted, so it counts as removed;
 * any other failure keeps the row and says why.
 */
export function removalVerdict(result: ApiResult<unknown>): RemovalVerdict {
  if (result.ok || result.status === 404) return { removed: true };
  return { removed: false, message: result.message };
}
