import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSupabase } from "@/lib/supabaseServer";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  if (!(await verifyAdminToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supa = getServerSupabase();

  // Find IDs of entries that are already in any prior round.
  // Note: For very large events we could do a server-side anti-join; the
  // dataset here is small. `.range()` widens the default Supabase page so
  // 2,000+ entries don't get silently truncated to 1,000.
  const { data: usedRows, error: usedErr } = await supa
    .from("raffle_round_entries")
    .select("entry_id")
    .range(0, 99999);

  if (usedErr) {
    return NextResponse.json({ error: usedErr.message }, { status: 500 });
  }
  const usedIds = new Set((usedRows ?? []).map((r: any) => r.entry_id));

  // All entries (non-demo? include demo so admin can test; demo is just a flag).
  const { data: allEntries, error: allErr } = await supa
    .from("entries")
    .select("id, created_at")
    .order("created_at", { ascending: true })
    .range(0, 99999);

  if (allErr) {
    return NextResponse.json({ error: allErr.message }, { status: 500 });
  }

  const newEntryIds = (allEntries ?? [])
    .filter((e: any) => !usedIds.has(e.id))
    .map((e: any) => e.id);

  if (newEntryIds.length === 0) {
    return NextResponse.json(
      {
        error:
          "No new entries since the last raffle. Add entries before starting a new round.",
      },
      { status: 400 }
    );
  }

  // Determine next round number
  const { data: lastRound, error: lastErr } = await supa
    .from("raffle_rounds")
    .select("round_number")
    .order("round_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastErr) {
    return NextResponse.json({ error: lastErr.message }, { status: 500 });
  }

  const nextNumber = (lastRound?.round_number ?? 0) + 1;
  const now = new Date().toISOString();

  // Create round
  const { data: round, error: roundErr } = await supa
    .from("raffle_rounds")
    .insert({ round_number: nextNumber, started_at: now, frozen_at: now })
    .select("id, round_number, frozen_at")
    .single();

  if (roundErr || !round) {
    return NextResponse.json({ error: roundErr?.message ?? "Failed to start round" }, { status: 500 });
  }

  // Snapshot entries. Chunk so a 2,000-entry payload doesn't go in one shot.
  const snapshotRows = newEntryIds.map((id) => ({
    round_id: round.id,
    entry_id: id,
  }));
  const CHUNK = 500;
  for (let i = 0; i < snapshotRows.length; i += CHUNK) {
    const { error: snapErr } = await supa
      .from("raffle_round_entries")
      .insert(snapshotRows.slice(i, i + CHUNK));
    if (snapErr) {
      // rollback: delete the round we just created (cascade clears any
      // raffle_round_entries we already inserted).
      await supa.from("raffle_rounds").delete().eq("id", round.id);
      return NextResponse.json({ error: snapErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    round_id: round.id,
    round_number: round.round_number,
    frozen_at: round.frozen_at,
    pool_size: newEntryIds.length,
  });
}
