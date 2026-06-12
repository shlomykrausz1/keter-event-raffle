import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { getServerSupabase } from "@/lib/supabaseServer";
import { selectAllPaged } from "@/lib/supabasePagination";
import {
  ADMIN_COOKIE,
  REMOTE_SLUG_HEADER,
  isRemoteSlugValid,
  verifyAdminToken,
} from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

const log = (...args: unknown[]) =>
  // eslint-disable-next-line no-console
  console.log("[raffle/start]", ...args);

export async function POST() {
  // Accept either the admin cookie (browser dashboard) or the
  // REMOTE_CONTROL_SLUG header (phone remote-control page).
  const cookieOk = await verifyAdminToken(cookies().get(ADMIN_COOKIE)?.value);
  const remoteOk = isRemoteSlugValid(headers().get(REMOTE_SLUG_HEADER));
  if (!cookieOk && !remoteOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supa = getServerSupabase();

  // ---- 1. Authoritative counts (HEAD requests bypass db-max-rows) ----
  const [{ count: totalEntries, error: cTotalErr }, { count: totalUsed, error: cUsedErr }] =
    await Promise.all([
      supa.from("entries").select("id", { count: "exact", head: true }),
      supa.from("raffle_round_entries").select("entry_id", { count: "exact", head: true }),
    ]);

  if (cTotalErr) {
    log("count(entries) failed:", cTotalErr.message);
    return NextResponse.json({ error: cTotalErr.message }, { status: 500 });
  }
  if (cUsedErr) {
    log("count(raffle_round_entries) failed:", cUsedErr.message);
    return NextResponse.json({ error: cUsedErr.message }, { status: 500 });
  }
  log(
    `counts -> entries=${totalEntries ?? 0}, raffle_round_entries=${totalUsed ?? 0}, ` +
      `expected eligible=${(totalEntries ?? 0) - (totalUsed ?? 0)}`
  );

  // ---- 2. Pull every entry id and every already-used entry id ----
  //
  // We MUST page through these tables. A single `.range(0, 99999)` is
  // silently capped at PostgREST's `db-max-rows` (often 1,000 rows) — that
  // was the bug: the start route would freeze only the first ~1k entries
  // while admin (which uses HEAD count queries that bypass the cap)
  // correctly reported the full 3,000+. The two numbers MUST agree.
  let usedRows: Array<{ entry_id: string }>;
  let allEntries: Array<{ id: string; created_at: string }>;
  try {
    [usedRows, allEntries] = await Promise.all([
      selectAllPaged<{ entry_id: string }>((from, to) =>
        supa.from("raffle_round_entries").select("entry_id").range(from, to)
      ),
      selectAllPaged<{ id: string; created_at: string }>((from, to) =>
        supa
          .from("entries")
          .select("id, created_at")
          .order("created_at", { ascending: true })
          .range(from, to)
      ),
    ]);
  } catch (e: any) {
    log("paged fetch failed:", e?.message || e);
    return NextResponse.json(
      { error: e?.message || "Failed to load entries." },
      { status: 500 }
    );
  }

  // Sanity-check the paged fetch against the HEAD counts. If they disagree
  // the round we're about to create would be wrong, so bail loudly instead
  // of silently freezing a too-small pool.
  if (allEntries.length !== (totalEntries ?? 0)) {
    log(
      `MISMATCH: fetched ${allEntries.length} entries but count says ${totalEntries}; aborting`
    );
    return NextResponse.json(
      {
        error: `Could not load all entries (got ${allEntries.length} of ${totalEntries}). Please try again.`,
      },
      { status: 500 }
    );
  }
  if (usedRows.length !== (totalUsed ?? 0)) {
    log(
      `MISMATCH: fetched ${usedRows.length} used-entry rows but count says ${totalUsed}; aborting`
    );
    return NextResponse.json(
      {
        error: `Could not load prior round entries (got ${usedRows.length} of ${totalUsed}). Please try again.`,
      },
      { status: 500 }
    );
  }

  const usedIds = new Set(usedRows.map((r) => r.entry_id));
  const newEntryIds = allEntries.filter((e) => !usedIds.has(e.id)).map((e) => e.id);
  log(
    `eligible computed -> entries=${allEntries.length}, alreadyUsed=${usedIds.size}, eligible=${newEntryIds.length}`
  );

  if (newEntryIds.length === 0) {
    return NextResponse.json(
      {
        error:
          "No new entries since the last raffle. Add entries before starting a new round.",
      },
      { status: 400 }
    );
  }

  // ---- 3. Determine next round number ----
  const { data: lastRounds, error: lastErr } = await supa
    .from("raffle_rounds")
    .select("round_number")
    .order("round_number", { ascending: false })
    .limit(1);

  if (lastErr) {
    log("lookup last round failed:", lastErr.message);
    return NextResponse.json({ error: lastErr.message }, { status: 500 });
  }
  const nextNumber = (lastRounds?.[0]?.round_number ?? 0) + 1;
  const now = new Date().toISOString();

  // ---- 4. Create the round ----
  const { data: round, error: roundErr } = await supa
    .from("raffle_rounds")
    .insert({ round_number: nextNumber, started_at: now, frozen_at: now })
    .select("id, round_number, frozen_at")
    .single();

  if (roundErr || !round) {
    log("create round failed:", roundErr?.message);
    return NextResponse.json(
      { error: roundErr?.message ?? "Failed to start round" },
      { status: 500 }
    );
  }
  log(`created round ${round.round_number} (${round.id})`);

  // ---- 5. Snapshot the frozen pool into raffle_round_entries ----
  const snapshotRows = newEntryIds.map((id) => ({
    round_id: round.id,
    entry_id: id,
  }));
  const CHUNK = 500;
  const totalBatches = Math.ceil(snapshotRows.length / CHUNK);
  let batchesRun = 0;
  log(`inserting ${snapshotRows.length} rows in ${totalBatches} batches of ${CHUNK}`);

  for (let i = 0; i < snapshotRows.length; i += CHUNK) {
    const slice = snapshotRows.slice(i, i + CHUNK);
    const { error: snapErr } = await supa
      .from("raffle_round_entries")
      .insert(slice);
    batchesRun += 1;
    if (snapErr) {
      log(
        `batch ${batchesRun}/${totalBatches} (rows ${i}..${i + slice.length - 1}) failed: ${snapErr.message}; rolling back round`
      );
      await supa.from("raffle_rounds").delete().eq("id", round.id);
      return NextResponse.json({ error: snapErr.message }, { status: 500 });
    }
    log(`batch ${batchesRun}/${totalBatches} ok (${slice.length} rows)`);
  }

  // ---- 6. Verify the snapshot matches what we intended ----
  //
  // Even though every batch came back without an error, ask the DB how many
  // rows are actually in the round. If anything was silently dropped (eg.
  // unique-violation buried by the client, network mid-flight retry, etc.)
  // we'd rather fail and rollback than open a raffle with the wrong pool.
  const { count: snapshotCount, error: snapCountErr } = await supa
    .from("raffle_round_entries")
    .select("entry_id", { count: "exact", head: true })
    .eq("round_id", round.id);

  if (snapCountErr) {
    log("post-insert count failed:", snapCountErr.message);
    await supa.from("raffle_rounds").delete().eq("id", round.id);
    return NextResponse.json({ error: snapCountErr.message }, { status: 500 });
  }
  log(
    `post-insert count -> raffle_round_entries(round_id=${round.id})=${snapshotCount}; expected=${newEntryIds.length}`
  );

  if ((snapshotCount ?? 0) !== newEntryIds.length) {
    log(
      `MISMATCH after insert: have ${snapshotCount}, expected ${newEntryIds.length}; rolling back round`
    );
    await supa.from("raffle_rounds").delete().eq("id", round.id);
    return NextResponse.json(
      {
        error: `Pool snapshot inserted ${snapshotCount ?? 0} of ${newEntryIds.length} rows. Please try again.`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    round_id: round.id,
    round_number: round.round_number,
    frozen_at: round.frozen_at,
    pool_size: newEntryIds.length,
  });
}
