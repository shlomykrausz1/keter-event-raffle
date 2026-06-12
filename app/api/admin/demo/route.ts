import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomInt } from "crypto";
import { getServerSupabase } from "@/lib/supabaseServer";
import { selectAllPaged } from "@/lib/supabasePagination";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth";
import { formatPhoneDisplay } from "@/lib/phone";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// All demo rows are tagged `is_demo: true` so the "Clear Test Entries"
// button can wipe them in one shot. Default size is 100 (admin "Add 100
// Demo Entries"); the admin can pass `?count=2000` to add the stress-test
// batch. Capped at 5,000 per request so a fat-finger can't lock the DB.
const DEFAULT_COUNT = 100;
const MAX_COUNT = 5000;

const FIRST_NAMES = [
  "Yaakov", "Moshe", "Avraham", "Yitzchak", "Shloime", "Mendy", "Chaim", "Dovid",
  "Yosef", "Boruch", "Aaron", "Ezra", "Naftali", "Reuven", "Shimon", "Levi",
  "Yehuda", "Zevi", "Mordechai", "Pinchas", "Eliezer", "Shmuel", "Yisroel", "Aryeh",
  "Sarah", "Rivka", "Leah", "Rachel", "Esti", "Miriam", "Chana", "Devorah",
  "Tzippy", "Shaindy", "Bracha", "Faiga", "Goldy", "Henny", "Malky", "Nechama",
];

const LAST_NAMES = [
  "Friedman", "Klein", "Goldstein", "Berkowitz", "Kohn", "Stern", "Weiss",
  "Schwartz", "Rosenberg", "Greenfeld", "Spitzer", "Lieberman", "Schneider",
  "Hirsch", "Mandel", "Katz", "Cohen", "Levy", "Rappaport", "Margulis",
  "Feldman", "Birnbaum", "Adler", "Kornreich", "Hellman", "Rosenfeld", "Lipschitz",
  "Brody", "Schwebel", "Roth",
];

const STREETS = [
  "Maple Avenue", "Forshay Road", "Carlton Road", "Main Street", "College Road",
  "Saddle River Road", "Hempstead Road", "Highview Road", "Blueberry Hill",
  "Decatur Avenue", "Smolley Drive", "South Madison Avenue",
];

const ZIPS = ["10952", "10977", "10901", "10954", "10956", "10980"];
const AREAS = ["845", "718", "347", "917", "646"];

function rand<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length)];
}

function parseCount(req: Request): number {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("count");
    if (!raw) return DEFAULT_COUNT;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_COUNT;
    return Math.min(n, MAX_COUNT);
  } catch {
    return DEFAULT_COUNT;
  }
}

export async function POST(req: Request) {
  if (!(await verifyAdminToken(cookies().get(ADMIN_COOKIE)?.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supa = getServerSupabase();
  const count = parseCount(req);

  // Pre-load existing normalized phones so we generate ones we KNOW are
  // free. Page the table — `.range(0, 99999)` alone is silently capped at
  // PostgREST's `db-max-rows`, which would let collisions sneak past the
  // preflight and dump the batch insert into the per-row retry path.
  let existing: Array<{ phone_normalized: string }>;
  try {
    existing = await selectAllPaged<{ phone_normalized: string }>((from, to) =>
      supa.from("entries").select("phone_normalized").range(from, to)
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to load existing phones." },
      { status: 500 }
    );
  }
  const used = new Set<string>(
    existing.map((e) => e.phone_normalized).filter(Boolean)
  );

  const rows: any[] = [];
  let safety = 0;
  while (rows.length < count && safety < count * 6) {
    safety += 1;
    const area = rand(AREAS);
    const mid = String(randomInt(200, 999));
    const tail = String(randomInt(0, 9999)).padStart(4, "0");
    const normalized = area + mid + tail;
    if (used.has(normalized)) continue;
    used.add(normalized);

    const first = rand(FIRST_NAMES);
    const last = rand(LAST_NAMES);
    const seed = rows.length + 1;
    rows.push({
      full_name: `${first} ${last}`,
      phone_display: formatPhoneDisplay(normalized),
      phone_normalized: normalized,
      // Add a per-row token so emails stay unique across repeated stress runs.
      email: `${first.toLowerCase()}.${last.toLowerCase()}${seed}.${randomInt(
        0,
        1_000_000
      )}@demo.test`,
      street_address: `${randomInt(1, 999)} ${rand(STREETS)}`,
      zip_code: rand(ZIPS),
      is_demo: true,
    });
  }

  // Batch-insert in chunks so we don't push huge payloads at the DB at once.
  // Supabase happily takes 500-row batches; 2,000 rows = 4 round-trips.
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const { error } = await supa.from("entries").insert(batch);
    if (error) {
      // If the batch failed (e.g. a duplicate slipped through), fall back to
      // per-row inserts for this chunk so the rest still get in.
      for (const r of batch) {
        const { error: rowErr } = await supa.from("entries").insert(r);
        if (!rowErr) inserted += 1;
      }
    } else {
      inserted += batch.length;
    }
  }

  return NextResponse.json({ inserted });
}
