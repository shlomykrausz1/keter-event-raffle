import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import ExcelJS from "exceljs";
import { getServerSupabase } from "@/lib/supabaseServer";
import { selectAllPaged } from "@/lib/supabasePagination";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!(await verifyAdminToken(cookies().get(ADMIN_COOKIE)?.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supa = getServerSupabase();

  // Page every table — see export-csv route for the db-max-rows backstory.
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
          .select("entry_id, prize, won_at, rounds:raffle_rounds(round_number)")
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

  const winnerMap = new Map<string, { prize: string; round_number: number | null; won_at: string }>();
  winners.forEach((w) => {
    winnerMap.set(w.entry_id, {
      prize: w.prize,
      round_number: w.rounds?.round_number ?? null,
      won_at: w.won_at,
    });
  });

  const roundMap = new Map<string, number>();
  rre.forEach((r) => {
    const rn = r.rounds?.round_number;
    if (rn != null && !roundMap.has(r.entry_id)) {
      roundMap.set(r.entry_id, rn);
    }
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "The Big Keter Event - Monsey";
  wb.created = new Date();

  // ---- Entries sheet ----
  const ws = wb.addWorksheet("Entries");
  ws.columns = [
    { header: "Full Name", key: "full_name", width: 26 },
    { header: "Phone (Display)", key: "phone_display", width: 18 },
    { header: "Phone (Normalized)", key: "phone_normalized", width: 16 },
    { header: "Email", key: "email", width: 30 },
    { header: "Street Address", key: "street_address", width: 32 },
    { header: "ZIP Code", key: "zip_code", width: 12 },
    { header: "Created At", key: "created_at", width: 22 },
    { header: "Demo", key: "is_demo", width: 8 },
    { header: "Winner", key: "winner", width: 10 },
    { header: "Prize", key: "prize", width: 22 },
    { header: "Raffle Round", key: "raffle_round", width: 14 },
    { header: "Terms Accepted", key: "terms_accepted", width: 14 },
    { header: "Terms Accepted At", key: "terms_accepted_at", width: 22 },
    { header: "Terms Version", key: "terms_version", width: 14 },
    { header: "Marketing Email Consent", key: "marketing_email_consent", width: 22 },
    { header: "Marketing Consent Source", key: "marketing_consent_source", width: 24 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFF8EC" } };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF3E1F52" },
  };
  ws.getRow(1).height = 22;
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const e of entries) {
    const w = winnerMap.get(e.id);
    ws.addRow({
      full_name: e.full_name,
      phone_display: e.phone_display,
      phone_normalized: e.phone_normalized,
      email: e.email,
      street_address: e.street_address,
      zip_code: e.zip_code,
      created_at: e.created_at,
      is_demo: e.is_demo ? "Yes" : "No",
      winner: w ? "Yes" : "No",
      prize: w?.prize ?? "",
      raffle_round: w?.round_number ?? roundMap.get(e.id) ?? "",
      terms_accepted: e.terms_accepted ? "Yes" : "No",
      terms_accepted_at: e.terms_accepted_at ?? "",
      terms_version: e.terms_version ?? "",
      marketing_email_consent: e.marketing_email_consent ? "Yes" : "No",
      marketing_consent_source: e.marketing_consent_source ?? "",
    });
  }

  // ---- Winners sheet ----
  const ws2 = wb.addWorksheet("Winners");
  ws2.columns = [
    { header: "Round", key: "round", width: 10 },
    { header: "Prize", key: "prize", width: 22 },
    { header: "Full Name", key: "full_name", width: 26 },
    { header: "Phone", key: "phone_display", width: 18 },
    { header: "Won At", key: "won_at", width: 22 },
  ];
  ws2.getRow(1).font = { bold: true, color: { argb: "FFFFF8EC" } };
  ws2.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF3E1F52" },
  };
  ws2.views = [{ state: "frozen", ySplit: 1 }];

  // Pull winners with entry info
  let winnersFull: any[];
  try {
    winnersFull = await selectAllPaged<any>((from, to) =>
      supa
        .from("winners")
        .select(
          "prize, won_at, entries:entries(full_name, phone_display), rounds:raffle_rounds(round_number)"
        )
        .order("won_at", { ascending: true })
        .range(from, to)
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to load winners." },
      { status: 500 }
    );
  }

  for (const w of winnersFull) {
    ws2.addRow({
      round: (w as any).rounds?.round_number ?? "",
      prize: (w as any).prize,
      full_name: (w as any).entries?.full_name ?? "",
      phone_display: (w as any).entries?.phone_display ?? "",
      won_at: (w as any).won_at,
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const ts = new Date().toISOString().replace(/[:.]/g, "-");

  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="keter-raffle-${ts}.xlsx"`,
    },
  });
}
