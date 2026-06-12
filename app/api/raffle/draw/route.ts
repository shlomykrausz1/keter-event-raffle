import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { getServerSupabase } from "@/lib/supabaseServer";
import { selectAllPaged } from "@/lib/supabasePagination";
import { maskPhoneLast4 } from "@/lib/phone";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

// The raffle screen is on a hidden URL; we don't gate by admin auth here
// because the LED-screen browser doesn't have an admin session. Auth is
// enforced by the slug check on the page route.

const VALID_PRIZES = new Set(["$100 Gift Card", "Any Book In Store"]);

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const prize: string = String(body?.prize || "").trim();
  if (!VALID_PRIZES.has(prize)) {
    return NextResponse.json({ error: "Invalid prize." }, { status: 400 });
  }

  const supa = getServerSupabase();

  // Latest round. Using .limit(1) + arr[0] instead of .maybeSingle() — the
  // same .maybeSingle() pattern was silently returning null on Vercel even
  // when the row existed (see pool route for details).
  const { data: rounds, error: roundErr } = await supa
    .from("raffle_rounds")
    .select("id, round_number")
    .order("round_number", { ascending: false })
    .limit(1);

  if (roundErr) return NextResponse.json({ error: roundErr.message }, { status: 500 });
  const round = rounds?.[0];
  if (!round) {
    return NextResponse.json({ error: "No active raffle round." }, { status: 409 });
  }

  // Pool entries. PostgREST caps any single response at `db-max-rows`
  // regardless of `.range()`, so page through the table — otherwise the
  // random pick would be drawn from only the first ~1,000 entries and
  // every entry after that could never win.
  let rre: Array<{ entry_id: string }>;
  try {
    rre = await selectAllPaged<{ entry_id: string }>((from, to) =>
      supa
        .from("raffle_round_entries")
        .select("entry_id")
        .eq("round_id", round.id)
        .range(from, to)
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to load pool." },
      { status: 500 }
    );
  }
  if (rre.length === 0) {
    return NextResponse.json({ error: "Raffle pool is empty." }, { status: 409 });
  }

  // Already-won entry IDs in this round (must be excluded)
  const { data: roundWinners, error: rwErr } = await supa
    .from("winners")
    .select("entry_id, prize")
    .eq("round_id", round.id);

  if (rwErr) return NextResponse.json({ error: rwErr.message }, { status: 500 });

  // Block the same prize from being drawn twice in one round
  if (roundWinners?.some((w: any) => w.prize === prize)) {
    return NextResponse.json(
      { error: `${prize} has already been drawn this round.` },
      { status: 409 }
    );
  }

  const wonSet = new Set((roundWinners ?? []).map((w: any) => w.entry_id));
  const eligible = rre.filter((r: any) => !wonSet.has(r.entry_id));

  if (eligible.length === 0) {
    return NextResponse.json(
      { error: "No eligible entries remain in this round." },
      { status: 409 }
    );
  }

  // Cryptographic random pick
  const idx = randomInt(0, eligible.length);
  const winnerEntryId = eligible[idx].entry_id;

  // Insert winner; the unique (round_id, entry_id) constraint protects
  // against a person winning twice in the same round under any race.
  // We capture won_at so the LED screen can tell newly-appeared winners
  // (e.g. triggered from the phone remote) apart from already-shown ones
  // when polling /api/raffle/pool.
  const { data: insertedRows, error: insErr } = await supa
    .from("winners")
    .insert({ round_id: round.id, entry_id: winnerEntryId, prize })
    .select("won_at");

  if (insErr) {
    if ((insErr as any).code === "23505") {
      return NextResponse.json(
        { error: "This person already won in this round. Try drawing again." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }
  const wonAt = insertedRows?.[0]?.won_at ?? new Date().toISOString();

  const { data: entry, error: entryErr } = await supa
    .from("entries")
    .select("full_name, phone_display")
    .eq("id", winnerEntryId)
    .single();

  if (entryErr || !entry) {
    return NextResponse.json({ error: "Drew a winner but could not load record." }, { status: 500 });
  }

  return NextResponse.json({
    winner: {
      full_name: entry.full_name,
      // Public endpoint (LED screen + remote both call it without admin
      // auth) — never return the full phone number here.
      phone_display: maskPhoneLast4(entry.phone_display),
      prize,
      won_at: wonAt,
    },
  });
}
