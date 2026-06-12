import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSupabase } from "@/lib/supabaseServer";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

const PAGE_SIZE = 75;

const ENTRY_COLS =
  "id, full_name, phone_display, email, street_address, zip_code, created_at, is_demo";

/** PostgREST OR clause searching name / email / phone for a free-text query. */
function buildSearchClauses(q: string): string {
  const safe = q.replace(/[,()]/g, " ").trim();
  const clauses = [`full_name.ilike.%${safe}%`, `email.ilike.%${safe}%`];
  const digits = normalizePhone(safe);
  if (digits.length >= 3) {
    clauses.push(`phone_normalized.ilike.%${digits}%`);
  }
  return clauses.join(",");
}

/**
 * GET /api/admin/entries?page=1&q=&filter=all|winners|nonwinners|round&round=2
 * Server-paginated entries table (75/page) with search and filters.
 */
export async function GET(req: Request) {
  if (!(await verifyAdminToken(cookies().get(ADMIN_COOKIE)?.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const q = (url.searchParams.get("q") || "").trim();
  const filter = url.searchParams.get("filter") || "all";
  const roundNumber = Number(url.searchParams.get("round")) || null;

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supa = getServerSupabase();

  // Round numbers for the filter dropdown (rounds table stays tiny).
  const { data: roundRows, error: roundsErr } = await supa
    .from("raffle_rounds")
    .select("id, round_number")
    .order("round_number", { ascending: true });
  if (roundsErr) {
    return NextResponse.json({ error: roundsErr.message }, { status: 500 });
  }
  const rounds = (roundRows ?? []).map((r: any) => r.round_number);

  // Winner entry-ids are needed both for the winners/non-winners filters and
  // to flag rows. The winners table stays small (a couple per round), so one
  // plain select is fine.
  const { data: winnerRows, error: winErr } = await supa
    .from("winners")
    .select("entry_id, prize, won_at, rounds:raffle_rounds(round_number)");
  if (winErr) {
    return NextResponse.json({ error: winErr.message }, { status: 500 });
  }
  const winnersByEntry = new Map<string, { prize: string; round_number: number | null }>();
  for (const w of winnerRows ?? []) {
    winnersByEntry.set((w as any).entry_id, {
      prize: (w as any).prize,
      round_number: (w as any).rounds?.round_number ?? null,
    });
  }
  const winnerIds = [...winnersByEntry.keys()];

  let pageEntries: any[] = [];
  let total = 0;

  if (filter === "round" && roundNumber != null) {
    // Paginate from the frozen round pool with an inner join to entries so
    // search still applies. Each entry belongs to at most one round.
    const round = (roundRows ?? []).find((r: any) => r.round_number === roundNumber);
    if (!round) {
      return NextResponse.json({ error: `Round ${roundNumber} not found.` }, { status: 404 });
    }
    let query = supa
      .from("raffle_round_entries")
      .select(`entry:entries!inner(${ENTRY_COLS})`, { count: "exact" })
      .eq("round_id", (round as any).id);
    if (q) {
      query = query.or(buildSearchClauses(q), { foreignTable: "entry" });
    }
    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    pageEntries = (data ?? []).map((r: any) => r.entry).filter(Boolean);
    total = count ?? 0;
  } else if (filter === "winners" && winnerIds.length === 0) {
    pageEntries = [];
    total = 0;
  } else {
    let query = supa.from("entries").select(ENTRY_COLS, { count: "exact" });
    if (filter === "winners") {
      query = query.in("id", winnerIds);
    } else if (filter === "nonwinners" && winnerIds.length > 0) {
      query = query.not("id", "in", `(${winnerIds.join(",")})`);
    }
    if (q) {
      query = query.or(buildSearchClauses(q));
    }
    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    pageEntries = data ?? [];
    total = count ?? 0;
  }

  // Round membership for the rows on this page (75 ids max).
  const pageIds = pageEntries.map((e) => e.id);
  const roundByEntry = new Map<string, number | null>();
  if (pageIds.length > 0) {
    const { data: rre, error: rreErr } = await supa
      .from("raffle_round_entries")
      .select("entry_id, rounds:raffle_rounds(round_number)")
      .in("entry_id", pageIds);
    if (rreErr) {
      return NextResponse.json({ error: rreErr.message }, { status: 500 });
    }
    for (const r of rre ?? []) {
      roundByEntry.set((r as any).entry_id, (r as any).rounds?.round_number ?? null);
    }
  }

  return NextResponse.json({
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    rounds,
    entries: pageEntries.map((e) => {
      const win = winnersByEntry.get(e.id);
      return {
        id: e.id,
        full_name: e.full_name,
        phone_display: e.phone_display,
        email: e.email,
        street_address: e.street_address,
        zip_code: e.zip_code,
        created_at: e.created_at,
        is_demo: e.is_demo,
        round_number: roundByEntry.get(e.id) ?? null,
        is_winner: !!win,
        prize: win?.prize ?? null,
      };
    }),
  });
}
