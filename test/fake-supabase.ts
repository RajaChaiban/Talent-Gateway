import { randomUUID } from "node:crypto";

/**
 * A small in-memory stand-in for the Supabase query builder, for the screening
 * pipeline and its routes. It keeps real rows and enforces the schema's unique
 * constraints, so races between calls behave as they would in Postgres: each
 * statement runs atomically after an `await`, and a duplicate key is error
 * 23505 (or nothing, for an upsert that ignores duplicates).
 *
 * Supported: select (column list), insert, update, upsert (onConflict,
 * ignoreDuplicates), eq, neq, in, not(column, "is", null), order, limit, single,
 * maybeSingle. Anything else throws, so a test never passes on a silently
 * ignored filter.
 */

export type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code: string; message: string } | null };
type Op = "select" | "insert" | "update" | "upsert";

const UNIQUE: Readonly<Record<string, readonly (readonly string[])[]>> = {
  jobs: [["id"]],
  resumes: [["id"], ["storage_path"], ["id", "job_id"]],
  candidates: [["id"], ["job_id", "resume_id"], ["resume_id"]],
};

let clock = Date.parse("2026-11-01T00:00:00Z");
function nextTimestamp(): string {
  clock += 1000;
  return new Date(clock).toISOString();
}

const DEFAULTS: Readonly<Record<string, () => Row>> = {
  jobs: () => ({ status: "CREATED", top_talent_threshold: 80, invite_threshold: 70 }),
  resumes: () => ({
    status: "pending",
    extracted_text: null,
    ats_status: null,
    ats_score: null,
    ats_reasons: [],
    ats_override: false,
  }),
  candidates: () => ({ email: null, invite_status: "NONE", strengths: [], gaps: [], radar_results: {} }),
};

export type Call = { table: string; op: Op };

export class FakeDb {
  readonly tables: Record<string, Row[]> = {
    jobs: [],
    resumes: [],
    candidates: [],
  };
  readonly calls: Call[] = [];
  /** Return a code to make the matching statement fail with that Postgres error code. */
  failWhen: ((call: Call) => string | null) | null = null;

  from = (table: string) => new FakeQuery(this, table);

  insertRow(table: string, row: Row): Row {
    const full: Row = {
      id: randomUUID(),
      created_at: nextTimestamp(),
      ...DEFAULTS[table]?.(),
      ...row,
    };
    this.tables[table].push(full);
    return full;
  }

  rows(table: string): Row[] {
    return this.tables[table];
  }

  /** The constraint `row` breaks against the other rows of `table`, if any. */
  conflict(table: string, row: Row, ignore?: Row): readonly string[] | null {
    for (const columns of UNIQUE[table] ?? []) {
      const clash = this.tables[table].some(
        (other) => other !== ignore && columns.every((column) => other[column] === row[column]),
      );
      if (clash) return columns;
    }
    return null;
  }
}

function project(row: Row, columns: string | undefined): Row {
  if (!columns || columns.trim() === "*") return { ...row };
  const out: Row = {};
  for (const column of columns.split(",").map((part) => part.trim())) {
    if (!/^[a-z_]+$/.test(column)) throw new Error(`FakeDb: unsupported column "${column}"`);
    out[column] = row[column];
  }
  return out;
}

class FakeQuery {
  private op: Op = "select";
  private payload: Row | null = null;
  private options: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private filters: ((row: Row) => boolean)[] = [];
  private columns: string | undefined;
  private returning = false;
  private orderBy: { column: string; ascending: boolean } | null = null;
  private max: number | null = null;

  constructor(
    private readonly db: FakeDb,
    private readonly table: string,
  ) {
    if (!(table in db.tables)) throw new Error(`FakeDb: unknown table ${table}`);
  }

  select(columns?: string) {
    if (this.op === "select") this.columns = columns;
    else {
      this.returning = true;
      this.columns = columns;
    }
    return this;
  }

  insert(row: Row) {
    this.op = "insert";
    this.payload = row;
    return this;
  }

  update(values: Row) {
    this.op = "update";
    this.payload = values;
    return this;
  }

  upsert(row: Row, options: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = "upsert";
    this.payload = row;
    this.options = options;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }

  in(column: string, values: readonly unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    if (operator !== "is" || value !== null) throw new Error("FakeDb: only not(column, 'is', null)");
    this.filters.push((row) => row[column] !== null && row[column] !== undefined);
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}) {
    this.orderBy = { column, ascending: options.ascending ?? true };
    return this;
  }

  limit(count: number) {
    this.max = count;
    return this;
  }

  async single(): Promise<Result> {
    const result = await this.run();
    if (result.error) return result;
    const rows = result.data as Row[];
    return rows.length === 1
      ? { data: rows[0], error: null }
      : { data: null, error: { code: "PGRST116", message: "not exactly one row" } };
  }

  async maybeSingle(): Promise<Result> {
    const result = await this.run();
    if (result.error) return result;
    const rows = result.data as Row[];
    if (rows.length > 1) return { data: null, error: { code: "PGRST116", message: "many rows" } };
    return { data: rows[0] ?? null, error: null };
  }

  then<T>(resolve: (value: Result) => T, reject?: (reason: unknown) => T): Promise<T> {
    return this.run().then(resolve, reject);
  }

  private matching(): Row[] {
    return this.db.rows(this.table).filter((row) => this.filters.every((filter) => filter(row)));
  }

  private async run(): Promise<Result> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const call = { table: this.table, op: this.op };
    this.db.calls.push(call);
    const failure = this.db.failWhen?.(call);
    if (failure) return { data: null, error: { code: failure, message: "injected failure" } };

    switch (this.op) {
      case "select":
        return { data: this.selectRows(), error: null };
      case "update":
        return this.updateRows();
      case "insert":
        return this.insertRow(false);
      case "upsert":
        return this.insertRow(true);
    }
  }

  private selectRows(): Row[] {
    let rows = this.matching();
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      rows = rows.toSorted((a, b) => {
        const order = String(a[column]).localeCompare(String(b[column]));
        return ascending ? order : -order;
      });
    }
    if (this.max !== null) rows = rows.slice(0, this.max);
    return rows.map((row) => project(row, this.columns));
  }

  private updateRows(): Result {
    const rows = this.matching();
    for (const row of rows) {
      const next = { ...row, ...this.payload };
      const clash = this.db.conflict(this.table, next, row);
      if (clash) return { data: null, error: { code: "23505", message: `duplicate ${clash.join(",")}` } };
    }
    for (const row of rows) Object.assign(row, this.payload);
    return { data: this.returning ? rows.map((row) => project(row, this.columns)) : null, error: null };
  }

  private insertRow(upsert: boolean): Result {
    const candidate: Row = { ...this.payload };
    if (upsert) {
      const keys = (this.options.onConflict ?? "id").split(",").map((key) => key.trim());
      const existing = this.db
        .rows(this.table)
        .find((row) => keys.every((key) => row[key] === candidate[key]));
      if (existing) {
        if (!this.options.ignoreDuplicates) throw new Error("FakeDb: only ignoreDuplicates upserts");
        return { data: this.returning ? [] : null, error: null };
      }
    }
    const clash = this.db.conflict(this.table, candidate);
    if (clash) return { data: null, error: { code: "23505", message: `duplicate ${clash.join(",")}` } };
    const row = this.db.insertRow(this.table, candidate);
    return { data: this.returning ? [project(row, this.columns)] : null, error: null };
  }
}
