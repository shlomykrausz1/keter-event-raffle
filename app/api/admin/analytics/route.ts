import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSupabase } from "@/lib/supabaseServer";
import { selectAllPaged } from "@/lib/supabasePagination";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

const BUCKET_MS = 15 * 60 * 1000;

export async function GET() {
  if (!(await verifyAdminToken(cookies().get(ADMIN_COOKIE)?.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supa = getServerSupabase();
  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const fiveMinAgo = new Date(now - 5 * 60 * 1000).toISOString();

  // ---- Counts (HEAD requests — cheap) ----
  const [totalRes, lastHourRes, last5Res, winnersRes] = await Promise.all([
    supa.from("entries").select("id", { count: "exact", head: true }),
    supa
      .from("entries")
      .select("id", { count: "exact", head: true })
      .gte("created_at", hourAgo),
    supa
      .from("entries")
      .select("id", { count: "exact", head: true })
      .gte("created_at", fiveMinAgo),
    supa.from("winners").select("id", { count: "exact", head: true }),
  ]);
  for (const r of [totalRes, lastHourRes, last5Res, winnersRes]) {
    if (r.error) {
      return NextResponse.json({ error: r.error.message }, { status: 500 });
    }
  }
  const totalEntries = totalRes.count ?? 0;
  const entriesLastHour = lastHourRes.count ?? 0;
  const entriesLast5Min = last5Res.count ?? 0;
  const winnersDrawn = winnersRes.count ?? 0;

  // ---- Last entry ----
  const { data: lastRows, error: lastErr } = await supa
    .from("entries")
    .select("full_name, created_at")
    .order("created_at", { ascending: false })
    .limit(1);
  if (lastErr) {
    return NextResponse.json({ error: lastErr.message }, { status: 500 });
  }
  const lastEntry = lastRows?.[0] ?? null;

  // ---- Duplicate attempts (table may not exist before the migration) ----
  let duplicateAttempts = 0;
  let duplicateTrackingReady = true;
  try {
    const { count, error } = await supa
      .from("duplicate_attempts")
      .select("id", { count: "exact", head: true });
    // A HEAD request against a missing table comes back with NO error and a
    // null count (the 404 body is empty so supabase-js can't surface it), so
    // a null count means the migration hasn't been run yet.
    if (error || count == null) {
      duplicateTrackingReady = false;
    } else {
      duplicateAttempts = count;
    }
  } catch {
    duplicateTrackingReady = false;
  }

  // ---- Current round + pool ----
  const { data: rounds, error: roundErr } = await supa
    .from("raffle_rounds")
    .select("id, round_number")
    .order("round_number", { ascending: false })
    .limit(1);
  if (roundErr) {
    return NextResponse.json({ error: roundErr.message }, { status: 500 });
  }
  const currentRound = rounds?.[0] ?? null;

  let poolSize = 0;
  if (currentRound) {
    const { count, error } = await supa
      .from("raffle_round_entries")
      .select("entry_id", { count: "exact", head: true })
      .eq("round_id", (currentRound as any).id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    poolSize = count ?? 0;
  }

  const { count: usedCount, error: usedErr } = await supa
    .from("raffle_round_entries")
    .select("entry_id", { count: "exact", head: true });
  if (usedErr) {
    return NextResponse.json({ error: usedErr.message }, { status: 500 });
  }
  const entriesWaiting = totalEntries - (usedCount ?? 0);

  // ---- 15-minute buckets over the FULL database timeline ----
  // created_at timestamps only — paged so >1,000 entries are all counted.
  let stamps: Array<{ created_at: string }>;
  try {
    stamps = await selectAllPaged<{ created_at: string }>((from, to) =>
      supa
        .from("entries")
        .select("created_at")
        .order("created_at", { ascending: true })
        .range(from, to)
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to load timeline." },
      { status: 500 }
    );
  }

  let buckets: Array<{ start: string; count: number }> = [];
  let busiestBucket: { start: string; count: number } | null = null;
  let busiestHour: { start: string; count: number } | null = null;
  let avgPer15Min = 0;

  if (stamps.length > 0) {
    const firstMs = new Date(stamps[0].created_at).getTime();
    const firstBucket = Math.floor(firstMs / BUCKET_MS) * BUCKET_MS;
    const lastBucket = Math.floor(now / BUCKET_MS) * BUCKET_MS;

    const counts = new Map<number, number>();
    const hourCounts = new Map<number, number>();
    for (const s of stamps) {
      const t = new Date(s.created_at).getTime();
      const b = Math.floor(t / BUCKET_MS) * BUCKET_MS;
      counts.set(b, (counts.get(b) ?? 0) + 1);
      const h = Math.floor(t / 3_600_000) * 3_600_000;
      hourCounts.set(h, (hourCounts.get(h) ?? 0) + 1);
    }

    for (let b = firstBucket; b <= lastBucket; b += BUCKET_MS) {
      const count = counts.get(b) ?? 0;
      const bucket = { start: new Date(b).toISOString(), count };
      buckets.push(bucket);
      if (!busiestBucket || count > busiestBucket.count) busiestBucket = bucket;
    }
    // Cap the chart payload at the most recent 96 buckets (24h) so an old
    // stray test row can't blow up the response.
    if (buckets.length > 96) {
      buckets = buckets.slice(-96);
    }

    for (const [h, count] of hourCounts) {
      if (!busiestHour || count > busiestHour.count) {
        busiestHour = { start: new Date(h).toISOString(), count };
      }
    }

    const bucketSpan = Math.max(1, Math.round((lastBucket - firstBucket) / BUCKET_MS) + 1);
    avgPer15Min = Math.round((stamps.length / bucketSpan) * 10) / 10;
  }

  const entriesPerMinute = Math.round((entriesLast5Min / 5) * 10) / 10;

  return NextResponse.json({
    totalEntries,
    entriesPerMinute,
    entriesLastHour,
    lastEntryName: lastEntry?.full_name ?? null,
    lastEntryAt: lastEntry?.created_at ?? null,
    estimatedPerHour: Math.round(entriesPerMinute * 60),
    duplicateAttempts,
    duplicateTrackingReady,
    winnersDrawn,
    currentRoundNumber: currentRound?.round_number ?? null,
    entriesWaiting,
    poolSize,
    buckets,
    busiestBucket,
    busiestHour,
    avgPer15Min,
  });
}
