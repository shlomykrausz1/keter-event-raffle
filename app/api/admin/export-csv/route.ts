import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSupabase } from "@/lib/supabaseServer";
import { selectAllPaged } from "@/lib/supabasePagination";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function csvEscape(v: any): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET() {
  if (!(await verifyAdminToken(cookies().get(ADMIN_COOKIE)?.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supa = getServerSupabase();

  // Page every table — PostgREST silently caps a single `.range(0, 99999)`
  // at the server-side `db-max-rows` setting, so a 3k-row event would have
  // exported only the first ~1k rows.
  let entries: any[];
  let winners: any[];
  let rre: any[];
  try {
    [entries, winners, rre] = await Promise.all([
      selectAllPaged<any>((from, to) =>
        supa
          .from("entries")
          .select("*")
          .order("created_at", { ascending: true })
          .range(from, to)
      ),
      selectAllPaged<any>((from, to) =>
        supa
          .from("winners")
          .select("entry_id, prize, rounds:raffle_rounds(round_number)")
          .range(from, to)
      ),
      selectAllPaged<any>((from, to) =>
        supa
          .from("raffle_round_entries")
          .select("entry_id, rounds:raffle_rounds(round_number)")
          .range(from, to)
      ),
    ]);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to load export data." },
      { status: 500 }
    );
  }

  const winnerMap = new Map<string, { prize: string; round_number: number | null }>();
  winners.forEach((w) => {
    winnerMap.set(w.entry_id, {
      prize: w.prize,
      round_number: w.rounds?.round_number ?? null,
    });
  });

  const roundMap = new Map<string, number>();
  rre.forEach((r) => {
    const rn = r.rounds?.round_number;
    if (rn != null && !roundMap.has(r.entry_id)) {
      roundMap.set(r.entry_id, rn);
    }
  });

  const header = [
    "full_name",
    "phone_display",
    "phone_normalized",
    "email",
    "street_address",
    "zip_code",
    "created_at",
    "is_demo",
    "winner",
    "prize",
    "raffle_round",
    "Terms Accepted",
    "Terms Accepted At",
    "Terms Version",
    "Marketing Email Consent",
    "Marketing Consent Source",
  ];

  const lines = [header.join(",")];
  for (const e of entries) {
    const w = winnerMap.get(e.id);
    const row = [
      e.full_name,
      e.phone_display,
      e.phone_normalized,
      e.email,
      e.street_address,
      e.zip_code,
      e.created_at,
      e.is_demo ? "yes" : "no",
      w ? "yes" : "no",
      w?.prize ?? "",
      w?.round_number ?? roundMap.get(e.id) ?? "",
      e.terms_accepted ? "yes" : "no",
      e.terms_accepted_at ?? "",
      e.terms_version ?? "",
      e.marketing_email_consent ? "yes" : "no",
      e.marketing_consent_source ?? "",
    ];
    lines.push(row.map(csvEscape).join(","));
  }

  const csv = lines.join("\r\n");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="keter-raffle-entries-${ts}.csv"`,
    },
  });
}
