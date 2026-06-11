import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSupabase } from "@/lib/supabaseServer";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export async function GET() {
  if (!(await verifyAdminToken(cookies().get(ADMIN_COOKIE)?.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supa = getServerSupabase();

  // Total entries
  const { count: totalEntries, error: e1 } = await supa
    .from("entries")
    .select("id", { count: "exact", head: true });
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  // Demo entry count
  const { count: demoEntries, error: e1b } = await supa
    .from("entries")
    .select("id", { count: "exact", head: true })
    .eq("is_demo", true);
  if (e1b) return NextResponse.json({ error: e1b.message }, { status: 500 });

  // Latest round. .limit(1) + arr[0] for the same reason as the raffle/pool
  // route — .maybeSingle() was returning null on Vercel even when the row
  // existed.
  const { data: lastRounds, error: e2 } = await supa
    .from("raffle_rounds")
    .select("id, round_number, started_at, frozen_at")
    .order("round_number", { ascending: false })
    .limit(1);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  const lastRound = lastRounds?.[0];

  // Entries-in-any-round. We only need the count, so HEAD with `count:exact`
  // — much cheaper than streaming every row back, especially with 2,000+
  // entries per round.
  const { count: usedCount, error: e3 } = await supa
    .from("raffle_round_entries")
    .select("entry_id", { count: "exact", head: true });
  if (e3) return NextResponse.json({ error: e3.message }, { status: 500 });

  // Winners drawn (all-time)
  const { count: winnersAll, error: e4 } = await supa
    .from("winners")
    .select("id", { count: "exact", head: true });
  if (e4) return NextResponse.json({ error: e4.message }, { status: 500 });

  // Recent entries
  const { data: recentEntries, error: e5 } = await supa
    .from("entries")
    .select("id, full_name, phone_display, email, created_at, is_demo")
    .order("created_at", { ascending: false })
    .limit(20);
  if (e5) return NextResponse.json({ error: e5.message }, { status: 500 });

  // Winners list
  const { data: winners, error: e6 } = await supa
    .from("winners")
    .select(
      "id, prize, won_at, round_id, entries:entries(full_name, phone_display), rounds:raffle_rounds(round_number)"
    )
    .order("won_at", { ascending: false })
    .limit(50);
  if (e6) return NextResponse.json({ error: e6.message }, { status: 500 });

  const entriesSinceLastRaffle = (totalEntries ?? 0) - (usedCount ?? 0);

  return NextResponse.json({
    totalEntries: totalEntries ?? 0,
    demoEntries: demoEntries ?? 0,
    entriesSinceLastRaffle,
    winnersDrawn: winnersAll ?? 0,
    currentRound: lastRound
      ? {
          id: lastRound.id,
          round_number: lastRound.round_number,
          started_at: lastRound.started_at,
          frozen_at: lastRound.frozen_at,
        }
      : null,
    recentEntries: recentEntries ?? [],
    winners: (winners ?? []).map((w: any) => ({
      id: w.id,
      prize: w.prize,
      won_at: w.won_at,
      round_number: w.rounds?.round_number ?? null,
      full_name: w.entries?.full_name ?? "",
      phone_display: w.entries?.phone_display ?? "",
    })),
  });
}
