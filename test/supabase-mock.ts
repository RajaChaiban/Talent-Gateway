import { vi } from "vitest";

export type QueryResult = { data: unknown; error: unknown; count?: number | null };

/**
 * A chainable stand-in for a Supabase query builder: every filter method
 * returns the same builder, and awaiting it (or calling `single` /
 * `maybeSingle`) yields `result`.
 */
export function queryBuilder(result: QueryResult, options: { updateResult?: QueryResult } = {}) {
  const builder: Record<string, unknown> = {};
  let updating = false;
  for (const method of ["select", "insert", "delete", "eq", "neq", "is", "gte", "order", "limit"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.update = vi.fn(() => {
    updating = true;
    return builder;
  });
  builder.single = vi.fn(async () => result);
  builder.maybeSingle = vi.fn(async () => result);
  /** Awaiting an update yields `updateResult`, by default one affected row (or the same error). */
  const updated = (): QueryResult =>
    options.updateResult ?? (result.error ? result : { data: [{ id: "updated" }], error: null });
  builder.then = (resolve: (value: QueryResult) => unknown) => resolve(updating ? updated() : result);
  return builder;
}

export const ok = (data: unknown): QueryResult => ({ data, error: null });
export const failed: QueryResult = { data: null, error: { message: "db down" } };

export const SIGNED_IN = { data: { user: { id: "user-1" } }, error: null };

export type StorageResult = { data: unknown; error: unknown };

/**
 * A stand-in for `supabase.storage`: `from(bucket)` returns the same bucket
 * api every time, so tests can assert on its calls.
 */
export function storageMock(results: Partial<Record<"download" | "remove" | "createSignedUploadUrl", StorageResult>> = {}) {
  const bucket = {
    download: vi.fn<(path: string) => Promise<StorageResult>>(async () => results.download ?? ok(null)),
    remove: vi.fn<(paths: string[]) => Promise<StorageResult>>(async () => results.remove ?? ok([])),
    createSignedUploadUrl: vi.fn<(path: string) => Promise<StorageResult>>(
      async () => results.createSignedUploadUrl ?? ok(null),
    ),
  };
  return { storage: { from: vi.fn(() => bucket) }, bucket };
}
