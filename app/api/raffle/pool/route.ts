import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const supa = getServerSupabase();

  // Latest round
  const { data: roundRow, error: roundErr } = await supa
    .from("raffle_rounds")
    .select("id, round_number, frozen_at")
    .order("round_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (roundErr) {
    return NextResponse.json({ error: roundErr.message }, { status: 500 });
  }
  if (!roundRow) {
    return NextResponse.json({
      round_id: null,
      round_number: null,
      frozen_at: null,
      total: 0,
      remaining: 0,
      names: [],
      winners: [],
    });
  }

  // Snapshot entries in round. Supabase caps select responses at 1,000 rows
  // by default; the event expects ~2,000 entries, so we explicitly widen the
  // page.
  const { data: rre, error: rreErr } = await supa
    .from("raffle_round_entries")
    .select("entry_id, entries:entries(id, full_name)")
    .eq("round_id", roundRow.id)
    .range(0, 49999);

  if (rreErr) {
    return NextResponse.json({ error: rreErr.message }, { status: 500 });
  }

  // Winners in this round
  const { data: winners, error: wErr } = await supa
    .from("winners")
    .select("entry_id, prize, won_at, entries:entries(full_name, phone_display)")
    .eq("round_id", roundRow.id)
    .order("won_at", { ascending: true });

  if (wErr) {
    return NextResponse.json({ error: wErr.message }, { status: 500 });
  }

  const wonIds = new Set((winners ?? []).map((w: any) => w.entry_id));
  const total = rre?.length ?? 0;
  const remaining = total - wonIds.size;

  const names: string[] = (rre ?? [])
    .filter((r: any) => !wonIds.has(r.entry_id))
    .map((r: any) => r.entries?.full_name || "")
    .filter(Boolean);

  return NextResponse.json({
    round_id: roundRow.id,
    round_number: roundRow.round_number,
    frozen_at: roundRow.frozen_at,
    total,
    remaining,
    names,
    winners: (winners ?? []).map((w: any) => ({
      prize: w.prize,
      full_name: w.entries?.full_name || "",
      phone_display: w.entries?.phone_display || "",
    })),
  });
}
