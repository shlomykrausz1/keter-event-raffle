/**
 * File-backed local "Supabase" shim.
 *
 * Implements only the query patterns this app uses, in a way that matches the
 * shape of `@supabase/supabase-js` responses (`{ data, error, count? }`) so the
 * existing API routes do not need to change.
 *
 * Activated by `lib/supabaseServer.ts` when the real Supabase env vars are
 * missing. Persists to `.data/store.json` (gitignored).
 *
 * Supported chains (per the routes in this app):
 *   .from(t).select(cols, opts?).eq(c, v).order(c, opts).limit(n).single()/maybeSingle()
 *   .from(t).insert(rowOrRows).select(cols).single()
 *   .from(t).delete(opts?).eq(c, v)
 * Embedded FK selects: "alias:table(col1, col2)" for entries / raffle_rounds.
 * Unique constraint violations return `{ code: "23505" }` to match Postgres.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import path from "path";
import crypto from "crypto";

type Row = Record<string, any>;

type DBState = {
  entries: Row[];
  raffle_rounds: Row[];
  raffle_round_entries: Row[];
  winners: Row[];
  _seeded?: boolean;
};

type TableName = "entries" | "raffle_rounds" | "raffle_round_entries" | "winners";

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

function emptyDb(): DBState {
  return {
    entries: [],
    raffle_rounds: [],
    raffle_round_entries: [],
    winners: [],
  };
}

function loadSync(): DBState {
  // On Vercel the function filesystem is read-only, so `mkdirSync` /
  // `readFileSync` throw at module-init time and would crash the entire
  // route lambda before any of our config-guard logic ever runs. Wrap
  // EVERY filesystem touch so the module is safe to import anywhere; if
  // we end up using the local store on a writable FS we just lose
  // disk persistence, which is fine for dev.
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (!existsSync(STORE_FILE)) return emptyDb();
    const raw = readFileSync(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return { ...emptyDb(), ...parsed };
  } catch {
    return emptyDb();
  }
}

// Single in-process state. The Next.js dev server runs in one process, so a
// plain module-scope variable is enough.
let db: DBState = loadSync();

function persist(): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(STORE_FILE, JSON.stringify(db, null, 2));
  } catch {
    // Read-only filesystem (e.g. Vercel): keep state in memory only.
  }
}

function uuid(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------- Foreign-key map for embedded selects ----------
// Keyed by parent table, then by the *table name* used in the embed spec
// (the right side of "alias:table(...)").

const FK_MAP: Record<string, Record<string, { fk: string; table: TableName }>> = {
  raffle_round_entries: {
    entries: { fk: "entry_id", table: "entries" },
    raffle_rounds: { fk: "round_id", table: "raffle_rounds" },
  },
  winners: {
    entries: { fk: "entry_id", table: "entries" },
    raffle_rounds: { fk: "round_id", table: "raffle_rounds" },
  },
};

function seedIfFresh(): void {
  // Intentional no-op. The local store starts empty; raffle rounds and demo
  // entries must be created explicitly via the admin page. Auto-seeding a
  // round on first load was causing the raffle screen to "start itself" on
  // reload.
  if (db._seeded) return;
  db._seeded = true;
  persist();
}

// ---------- Select-spec parser ----------

type SelectSpec = {
  topLevel: string[] | "*";
  joins: Array<{ alias: string; table: string; columns: string[] }>;
};

function parseSelect(spec: string): SelectSpec {
  const top: string[] = [];
  const joins: SelectSpec["joins"] = [];
  let depth = 0;
  let buf = "";

  const flush = () => {
    const c = buf.trim();
    buf = "";
    if (!c) return;
    const m = c.match(/^([\w]+)\s*:\s*([\w]+)\s*\(([\s\S]*)\)$/);
    if (m) {
      const cols = m[3]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      joins.push({ alias: m[1], table: m[2], columns: cols });
    } else {
      top.push(c);
    }
  };

  for (let i = 0; i < spec.length; i += 1) {
    const ch = spec[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      flush();
      continue;
    }
    buf += ch;
  }
  flush();

  if (top.length === 1 && top[0] === "*") {
    return { topLevel: "*", joins };
  }
  return { topLevel: top, joins };
}

function pickRow(row: Row, cols: string[] | "*"): Row {
  if (cols === "*") return { ...row };
  const out: Row = {};
  for (const c of cols) out[c] = row[c];
  return out;
}

function joinRow(parentTable: string, row: Row, spec: SelectSpec): Row {
  const out: Row = pickRow(row, spec.topLevel);
  for (const j of spec.joins) {
    const fkInfo = FK_MAP[parentTable]?.[j.table];
    if (!fkInfo) {
      out[j.alias] = null;
      continue;
    }
    const fkValue = row[fkInfo.fk];
    const targetRow = db[fkInfo.table].find((r) => r.id === fkValue);
    out[j.alias] = targetRow ? pickRow(targetRow, j.columns) : null;
  }
  return out;
}

function cascadeDeleteEntry(entryId: string): void {
  db.raffle_round_entries = db.raffle_round_entries.filter(
    (r) => r.entry_id !== entryId
  );
  db.winners = db.winners.filter((r) => r.entry_id !== entryId);
}

function cascadeDeleteRound(roundId: string): void {
  db.raffle_round_entries = db.raffle_round_entries.filter(
    (r) => r.round_id !== roundId
  );
  db.winners = db.winners.filter((r) => r.round_id !== roundId);
}

// ---------- Errors ----------

type PgError = {
  message: string;
  code: string;
  details: string;
  hint: string;
};

function pgError(message: string, code = "PGRST000"): PgError {
  return { message, code, details: "", hint: "" };
}

function uniqueViolation(table: string, cols: string): PgError {
  return {
    message: `duplicate key value violates unique constraint on ${table}(${cols})`,
    code: "23505",
    details: "",
    hint: "",
  };
}

// ---------- Query builder ----------

type ExecResult = { data: any; error: any; count?: number | null };

class Query implements PromiseLike<ExecResult> {
  private table: TableName;
  private op: "select" | "insert" | "delete" | null = null;
  private selectSpec: SelectSpec | null = null;
  private wantCount: "exact" | null = null;
  private headOnly = false;
  private orderBy: { col: string; ascending: boolean } | null = null;
  private limitN: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private filters: Array<{ col: string; val: any }> = [];
  private insertRows: Row[] = [];
  private singleMode: "single" | "maybeSingle" | null = null;

  constructor(table: string) {
    this.table = table as TableName;
  }

  select(
    cols: string = "*",
    opts?: { count?: "exact"; head?: boolean }
  ): this {
    if (this.op === null) this.op = "select";
    this.selectSpec = parseSelect(cols);
    if (opts?.count) this.wantCount = opts.count;
    if (opts?.head) this.headOnly = true;
    return this;
  }

  insert(rows: Row | Row[]): this {
    this.op = "insert";
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  delete(_opts?: { count?: "exact" }): this {
    this.op = "delete";
    // We always return a count for delete to match the existing route's
    // expectations regardless of opts.
    this.wantCount = "exact";
    return this;
  }

  eq(col: string, val: any): this {
    this.filters.push({ col, val });
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderBy = { col, ascending: opts?.ascending !== false };
    return this;
  }

  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  range(from: number, to: number): this {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  single(): this {
    this.singleMode = "single";
    return this;
  }

  maybeSingle(): this {
    this.singleMode = "maybeSingle";
    return this;
  }

  private exec(): ExecResult {
    if (this.op === "insert") return this.execInsert();
    if (this.op === "delete") return this.execDelete();
    return this.execSelect();
  }

  private execInsert(): ExecResult {
    const inserted: Row[] = [];
    for (const raw of this.insertRows) {
      const row: Row = { ...raw };
      if (!row.id) row.id = uuid();
      if (!row.created_at) row.created_at = nowIso();

      // Unique-key checks per table
      if (this.table === "entries") {
        if (
          db.entries.some(
            (e) => e.phone_normalized === row.phone_normalized
          )
        ) {
          return {
            data: null,
            error: uniqueViolation("entries", "phone_normalized"),
          };
        }
      } else if (this.table === "raffle_rounds") {
        if (
          db.raffle_rounds.some((e) => e.round_number === row.round_number)
        ) {
          return {
            data: null,
            error: uniqueViolation("raffle_rounds", "round_number"),
          };
        }
      } else if (this.table === "raffle_round_entries") {
        if (
          db.raffle_round_entries.some(
            (e) =>
              e.round_id === row.round_id && e.entry_id === row.entry_id
          )
        ) {
          return {
            data: null,
            error: uniqueViolation(
              "raffle_round_entries",
              "round_id,entry_id"
            ),
          };
        }
      } else if (this.table === "winners") {
        if (
          db.winners.some(
            (e) =>
              e.round_id === row.round_id && e.entry_id === row.entry_id
          )
        ) {
          return {
            data: null,
            error: uniqueViolation("winners", "round_id,entry_id"),
          };
        }
      }

      db[this.table].push(row);
      inserted.push(row);
    }
    persist();

    if (this.selectSpec) {
      const projected = inserted.map((r) =>
        pickRow(r, this.selectSpec!.topLevel)
      );
      if (this.singleMode === "single") {
        return { data: projected[0] ?? null, error: null };
      }
      return { data: projected, error: null };
    }

    if (this.singleMode === "single") {
      return { data: inserted[0] ?? null, error: null };
    }
    return { data: inserted, error: null };
  }

  private execDelete(): ExecResult {
    const remaining: Row[] = [];
    const removed: Row[] = [];
    for (const r of db[this.table]) {
      const match = this.filters.every((f) => r[f.col] === f.val);
      if (match) removed.push(r);
      else remaining.push(r);
    }
    db[this.table] = remaining;

    if (this.table === "entries") {
      for (const r of removed) cascadeDeleteEntry(r.id);
    } else if (this.table === "raffle_rounds") {
      for (const r of removed) cascadeDeleteRound(r.id);
    }

    persist();
    return {
      data: null,
      error: null,
      count: this.wantCount === "exact" ? removed.length : null,
    };
  }

  private execSelect(): ExecResult {
    let rows = db[this.table].filter((r) =>
      this.filters.every((f) => r[f.col] === f.val)
    );

    if (this.orderBy) {
      const { col, ascending } = this.orderBy;
      rows = [...rows].sort((a, b) => {
        const av = a[col];
        const bv = b[col];
        if (av == null && bv == null) return 0;
        if (av == null) return ascending ? -1 : 1;
        if (bv == null) return ascending ? 1 : -1;
        if (av < bv) return ascending ? -1 : 1;
        if (av > bv) return ascending ? 1 : -1;
        return 0;
      });
    }

    if (this.limitN != null) rows = rows.slice(0, this.limitN);
    if (this.rangeFrom != null && this.rangeTo != null) {
      rows = rows.slice(this.rangeFrom, this.rangeTo + 1);
    }

    const count = this.wantCount === "exact" ? rows.length : undefined;

    if (this.headOnly) {
      return { data: null, error: null, count: count ?? null };
    }

    const spec = this.selectSpec ?? { topLevel: "*" as const, joins: [] };
    const out = rows.map((r) => joinRow(this.table as string, r, spec));

    if (this.singleMode === "single") {
      if (out.length === 1) return { data: out[0], error: null };
      return {
        data: null,
        error: pgError(
          out.length === 0 ? "Row not found" : "Multiple rows returned",
          out.length === 0 ? "PGRST116" : "PGRST301"
        ),
      };
    }
    if (this.singleMode === "maybeSingle") {
      return { data: out[0] ?? null, error: null };
    }

    return { data: out, error: null, count: count ?? null };
  }

  then<TResult1 = ExecResult, TResult2 = never>(
    onfulfilled?:
      | ((value: ExecResult) => TResult1 | PromiseLike<TResult1>)
      | null
      | undefined,
    onrejected?:
      | ((reason: any) => TResult2 | PromiseLike<TResult2>)
      | null
      | undefined
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.exec()).then(onfulfilled, onrejected);
  }
}

class LocalSupabase {
  from(table: string): Query {
    return new Query(table);
  }
}

let cachedClient: LocalSupabase | null = null;

export function getLocalSupabase(): LocalSupabase {
  if (!cachedClient) {
    seedIfFresh();
    cachedClient = new LocalSupabase();
  }
  return cachedClient;
}
