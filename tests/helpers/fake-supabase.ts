import { vi } from "vitest";

/**
 * A small in-memory stand-in for the Supabase client, for route tests.
 *
 * It honours filters instead of returning canned rows, so a query that forgets
 * its tenant predicate behaves differently in a test -- which is the point of
 * the authorization matrix. Every statement is also recorded in `ops`, so a
 * test can assert that a write carried an explicit organization filter.
 *
 * Deliberately not a PostgREST emulator: column lists and embedded resources
 * in select() are ignored and whole rows are returned.
 */
export type Row = Record<string, unknown>;

export interface FakeError {
  message: string;
  code?: string;
}

export interface RecordedOp {
  table: string;
  op: "select" | "insert" | "update" | "upsert" | "delete";
  filters: Array<{ kind: string; column: string; value: unknown }>;
  values?: Row | Row[];
}

type Result = { data: unknown; error: FakeError | null };

interface UniqueRule {
  columns: string[];
  where?: (row: Row) => boolean;
}

export class FakeDb {
  tables = new Map<string, Row[]>();
  ops: RecordedOp[] = [];
  private uniques = new Map<string, UniqueRule[]>();
  private failures: Array<{ table: string; op: RecordedOp["op"]; error: FakeError; once: boolean }> = [];
  private sequence = 0;

  /** Back to an empty database: rows, recorded statements, rules and failures. */
  reset() {
    this.tables.clear();
    this.ops.length = 0;
    this.uniques.clear();
    this.failures.length = 0;
    return this;
  }

  seed(table: string, rows: Row[]) {
    this.tables.set(table, rows.map((row) => ({ ...row })));
    return this;
  }

  rows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  /** Emulates a (partial) unique index: a violating insert returns 23505. */
  unique(table: string, columns: string[], where?: (row: Row) => boolean) {
    this.uniques.set(table, [...(this.uniques.get(table) ?? []), { columns, where }]);
    return this;
  }

  /** Makes statements of one kind against a table fail. */
  fail(table: string, op: RecordedOp["op"], error: FakeError, options: { once?: boolean } = {}) {
    this.failures.push({ table, op, error, once: options.once ?? false });
    return this;
  }

  opsFor(table: string, op?: RecordedOp["op"]) {
    return this.ops.filter((entry) => entry.table === table && (!op || entry.op === op));
  }

  takeFailure(table: string, op: RecordedOp["op"]): FakeError | null {
    const index = this.failures.findIndex((entry) => entry.table === table && entry.op === op);
    if (index === -1) return null;
    const failure = this.failures[index];
    if (failure.once) this.failures.splice(index, 1);
    return failure.error;
  }

  violatesUnique(table: string, candidate: Row): boolean {
    return (this.uniques.get(table) ?? []).some((rule) => {
      if (rule.where && !rule.where(candidate)) return false;
      return this.rows(table).some(
        (row) =>
          (!rule.where || rule.where(row)) &&
          rule.columns.every((column) => row[column] === candidate[column])
      );
    });
  }

  nextId(table: string) {
    this.sequence += 1;
    return `${table}-${String(this.sequence).padStart(6, "0")}`;
  }
}

class Query implements PromiseLike<Result> {
  private filters: RecordedOp["filters"] = [];
  private op: RecordedOp["op"] = "select";
  private values: Row | Row[] | undefined;
  private returning = false;
  private cardinality: "many" | "single" | "maybeSingle" = "many";
  private orderBy: { column: string; ascending: boolean } | null = null;
  private max: number | null = null;
  private conflictColumn = "id";

  constructor(private db: FakeDb, private table: string) {}

  select() {
    if (this.op !== "select") this.returning = true;
    return this;
  }
  insert(values: Row | Row[]) {
    this.op = "insert";
    this.values = values;
    return this;
  }
  update(values: Row) {
    this.op = "update";
    this.values = values;
    return this;
  }
  upsert(values: Row | Row[], options?: { onConflict?: string }) {
    this.op = "upsert";
    this.values = values;
    if (options?.onConflict) this.conflictColumn = options.onConflict;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }

  private filter(kind: string, column: string, value: unknown) {
    this.filters.push({ kind, column, value });
    return this;
  }
  eq(column: string, value: unknown) { return this.filter("eq", column, value); }
  neq(column: string, value: unknown) { return this.filter("neq", column, value); }
  in(column: string, value: unknown[]) { return this.filter("in", column, value); }
  is(column: string, value: unknown) { return this.filter("is", column, value); }
  gt(column: string, value: unknown) { return this.filter("gt", column, value); }
  gte(column: string, value: unknown) { return this.filter("gte", column, value); }
  lt(column: string, value: unknown) { return this.filter("lt", column, value); }
  lte(column: string, value: unknown) { return this.filter("lte", column, value); }
  not(column: string, operator: string, value: unknown) {
    return this.filter(`not.${operator}`, column, value);
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending ?? true };
    return this;
  }
  limit(count: number) {
    this.max = count;
    return this;
  }
  single() {
    this.cardinality = "single";
    return this;
  }
  maybeSingle() {
    this.cardinality = "maybeSingle";
    return this;
  }

  private matches(row: Row): boolean {
    return this.filters.every(({ kind, column, value }) => {
      const actual = row[column] ?? null;
      switch (kind) {
        case "eq": return actual === value;
        case "neq": return actual !== value;
        case "in": return (value as unknown[]).includes(actual);
        case "is": return actual === value;
        case "not.is": return actual !== value;
        case "gt": return actual !== null && (actual as string) > (value as string);
        case "gte": return actual !== null && (actual as string) >= (value as string);
        case "lt": return actual !== null && (actual as string) < (value as string);
        case "lte": return actual !== null && (actual as string) <= (value as string);
        default: throw new Error(`fake-supabase: unsupported filter ${kind}`);
      }
    });
  }

  private run(): Result {
    this.db.ops.push({ table: this.table, op: this.op, filters: this.filters, values: this.values });

    const failure = this.db.takeFailure(this.table, this.op);
    if (failure) return { data: null, error: failure };

    const rows = this.db.rows(this.table);
    let affected: Row[] = [];

    if (this.op === "select") {
      affected = rows.filter((row) => this.matches(row));
      if (this.orderBy) {
        const { column, ascending } = this.orderBy;
        affected = [...affected].sort((a, b) => {
          const left = String(a[column] ?? "");
          const right = String(b[column] ?? "");
          return (left < right ? -1 : left > right ? 1 : 0) * (ascending ? 1 : -1);
        });
      }
      if (this.max !== null) affected = affected.slice(0, this.max);
    } else if (this.op === "insert" || this.op === "upsert") {
      const incoming = Array.isArray(this.values) ? this.values : [this.values!];
      for (const value of incoming) {
        const existing =
          this.op === "upsert"
            ? rows.find((row) => row[this.conflictColumn] === value[this.conflictColumn])
            : undefined;
        if (existing) {
          Object.assign(existing, value);
          affected.push(existing);
          continue;
        }
        if (this.db.violatesUnique(this.table, value)) {
          return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        }
        const row = { id: this.db.nextId(this.table), ...value };
        rows.push(row);
        affected.push(row);
      }
    } else if (this.op === "update") {
      affected = rows.filter((row) => this.matches(row));
      for (const row of affected) Object.assign(row, this.values as Row);
    } else {
      affected = rows.filter((row) => this.matches(row));
      this.db.tables.set(this.table, rows.filter((row) => !affected.includes(row)));
    }

    if (this.op !== "select" && !this.returning) return { data: null, error: null };

    const copies = affected.map((row) => ({ ...row }));
    if (this.cardinality === "many") return { data: copies, error: null };
    if (copies.length === 1) return { data: copies[0], error: null };
    if (copies.length === 0 && this.cardinality === "maybeSingle") return { data: null, error: null };
    return { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } };
  }

  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve().then(() => this.run()).then(onfulfilled, onrejected);
  }
}

export function createFakeSupabase(db: FakeDb = new FakeDb()) {
  const getUser = vi.fn();
  const admin = {
    createUser: vi.fn(),
    deleteUser: vi.fn(),
    getUserById: vi.fn(),
    updateUserById: vi.fn(),
    generateLink: vi.fn(),
    inviteUserByEmail: vi.fn(),
    listUsers: vi.fn(),
  };
  const rpc = vi.fn();
  const client = {
    from: (table: string) => new Query(db, table),
    rpc,
    auth: { getUser, admin },
  };

  return {
    db,
    client,
    getUser,
    admin,
    rpc,
    /** Sets the session the route sees; null means no session. */
    signIn(userId: string | null) {
      getUser.mockResolvedValue({ data: { user: userId ? { id: userId, email: "user@example.test" } : null } });
    },
  };
}
