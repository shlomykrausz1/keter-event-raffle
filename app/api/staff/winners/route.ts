import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { getServerSupabase } from "@/lib/supabaseServer";
import {
  ADMIN_COOKIE,
  STAFF_SLUG_HEADER,
  isStaffSlugValid,
  verifyAdminToken,
} from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

/**
 * All winners with full entry details for the staff pickup page.
 * Auth: STAFF_PAGE_SLUG header (staff page) OR admin cookie.
 */
export async function GET() {
  const cookieOk = await verifyAdminToken(cookies().get(ADMIN_COOKIE)?.value);
  const staffOk = isStaffSlugValid(headers().get(STAFF_SLUG_HEADER));
  if (!cookieOk && !staffOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supa = getServerSupabase();

  const SELECT_FULL =
    "id, prize, won_at, picked_up, picked_up_at, " +
    "entries:entries(full_name, phone_display, email, street_address, zip_code), " +
    "rounds:raffle_rounds(round_number)";
  const SELECT_NO_PICKUP =
    "id, prize, won_at, " +
    "entries:entries(full_name, phone_display, email, street_address, zip_code), " +
    "rounds:raffle_rounds(round_number)";

  let { data, error } = await supa
    .from("winners")
    .select(SELECT_FULL)
    .order("won_at", { ascending: false });

  let migrationNeeded = false;
  if (error && /picked_up/.test(error.message || "")) {
    // The pickup-tracking migration hasn't been applied yet. Still serve the
    // winner list (read-only) so the staff page works; flag it so the UI can
    // tell the operator to run the migration.
    migrationNeeded = true;
    const retry = await supa
      .from("winners")
      .select(SELECT_NO_PICKUP)
      .order("won_at", { ascending: false });
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    migration_needed: migrationNeeded,
    winners: (data ?? []).map((w: any) => ({
      id: w.id,
      prize: w.prize,
      won_at: w.won_at,
      picked_up: w.picked_up ?? false,
      picked_up_at: w.picked_up_at ?? null,
      round_number: w.rounds?.round_number ?? null,
      full_name: w.entries?.full_name ?? "",
      phone_display: w.entries?.phone_display ?? "",
      email: w.entries?.email ?? "",
      street_address: w.entries?.street_address ?? "",
      zip_code: w.entries?.zip_code ?? "",
    })),
  });
}
