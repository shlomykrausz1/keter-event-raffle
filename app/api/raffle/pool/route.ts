import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabaseServer";
import { selectAllPaged } from "@/lib/supabasePagination";
import { maskPhoneLast4 } from "@/lib/phone";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

// Belt-and-suspenders cache control. `dynamic = "force-dynamic"` already
// disables Next's data cache, but production was still seeing stale responses
// (`/api/raffle/pool` reported `round_id: null` while the same query in
// `/api/admin/stats` saw the freshly-created round). Adding explicit headers
// guarantees no Vercel edge / browser / CDN caches the response.
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

function json(data: unknown, init: { status?: number } = {}) {
  return NextResponse.json(data, {
    status: init.status ?? 200,
    headers: NO_STORE_HEADERS,
  });
}

export async function GET() {
  const supa = getServerSupabase();

  // Latest round. We deliberately do NOT use `.maybeSingle()` here — on
  // Vercel that call was silently returning `data: null` even when the row
  // existed (the same code path works fine locally with identical packages,
  // so the safest course is to ask PostgREST for an array and take the
  // first element ourselves).
  const { data: rounds, error: roundErr } = await supa
    .from("raffle_rounds")
    .select("id, round_number, frozen_at")
    .order("round_number", { ascending: false })
    .limit(1);

  if (roundErr) {
    return json({ error: roundErr.message }, { status: 500 });
  }
  const roundRow = rounds?.[0];
  if (!roundRow) {
    return json({
      round_id: null,
      round_number: null,
      frozen_at: null,
      total: 0,
      remaining: 0,
      names: [],
      winners: [],
    });
  }

  // Snapshot entries in round. PostgREST silently caps any single response
  // at the server-side `db-max-rows` setting (often 1,000 rows on hosted
  // Supabase) regardless of `.range()` — page through the table instead so
  // a 3,000-row frozen pool actually surfaces all 3,000.
  let rre: Array<{ entry_id: string; entries: any }>;
  try {
    rre = await selectAllPaged<{ entry_id: string; entries: any }>((from, to) =>
      supa
        .from("raffle_round_entries")
        .select("entry_id, entries:entries(id, full_name)")
        .eq("round_id", roundRow.id)
        .range(from, to)
    );
  } catch (e: any) {
    return json({ error: e?.message || "Failed to load pool." }, { status: 500 });
  }

  // Winners in this round
  const { data: winners, error: wErr } = await supa
    .from("winners")
    .select("entry_id, prize, won_at, entries:entries(full_name, phone_display)")
    .eq("round_id", roundRow.id)
    .order("won_at", { ascending: true });

  if (wErr) {
    return json({ error: wErr.message }, { status: 500 });
  }

  const wonIds = new Set((winners ?? []).map((w: any) => w.entry_id));
  const total = rre.length;
  const remaining = total - wonIds.size;

  const names: string[] = rre
    .filter((r) => !wonIds.has(r.entry_id))
    .map((r) => r.entries?.full_name || "")
    .filter(Boolean);

  return json({
    round_id: roundRow.id,
    round_number: roundRow.round_number,
    frozen_at: roundRow.frozen_at,
    total,
    remaining,
    names,
    winners: (winners ?? []).map((w: any) => ({
      prize: w.prize,
      full_name: w.entries?.full_name || "",
      // This endpoint is public (the LED screen polls it without auth), so
      // never expose the full phone number — last 4 digits only.
      phone_display: maskPhoneLast4(w.entries?.phone_display || ""),
      won_at: w.won_at,
    })),
  });
}
