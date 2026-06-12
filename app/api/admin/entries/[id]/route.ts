import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSupabase } from "@/lib/supabaseServer";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth";
import { normalizePhone, formatPhoneDisplay, isValid10Digit } from "@/lib/phone";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

async function requireAdmin(): Promise<NextResponse | null> {
  if (!(await verifyAdminToken(cookies().get(ADMIN_COOKIE)?.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * PATCH /api/admin/entries/:id — edit an entry in place.
 * Re-checks the duplicate-phone rule when the phone changes.
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const full_name = String(body?.full_name || "").trim();
  const phoneRaw = String(body?.phone || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const street_address = String(body?.street_address || "").trim();
  const zip_code = String(body?.zip_code || "").trim();

  if (!full_name || full_name.length < 2) {
    return NextResponse.json({ error: "Name must be at least 2 characters." }, { status: 400 });
  }
  if (!isValid10Digit(phoneRaw)) {
    return NextResponse.json({ error: "Phone must be a valid 10-digit number." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email is not valid." }, { status: 400 });
  }
  if (!street_address || street_address.length < 3) {
    return NextResponse.json({ error: "Street address is too short." }, { status: 400 });
  }
  if (!/^\d{5}(-\d{4})?$/.test(zip_code)) {
    return NextResponse.json({ error: "ZIP code is not valid." }, { status: 400 });
  }

  const phone_normalized = normalizePhone(phoneRaw);
  const phone_display = formatPhoneDisplay(phoneRaw);

  const supa = getServerSupabase();

  // Duplicate-phone rule: no other entry may already use this number.
  const { data: dupes, error: dupErr } = await supa
    .from("entries")
    .select("id, full_name")
    .eq("phone_normalized", phone_normalized)
    .neq("id", params.id)
    .limit(1);
  if (dupErr) {
    return NextResponse.json({ error: dupErr.message }, { status: 500 });
  }
  if (dupes && dupes.length > 0) {
    return NextResponse.json(
      {
        error: `This phone number is already used by ${(dupes[0] as any).full_name}.`,
      },
      { status: 409 }
    );
  }

  const { data: updated, error: updErr } = await supa
    .from("entries")
    .update({ full_name, phone_display, phone_normalized, email, street_address, zip_code })
    .eq("id", params.id)
    .select("id, full_name, phone_display, email, street_address, zip_code");

  if (updErr) {
    // Race: another entry grabbed this phone between our check and the write.
    if ((updErr as any).code === "23505") {
      return NextResponse.json(
        { error: "This phone number is already used by another entry." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }
  const row = updated?.[0];
  if (!row) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, entry: row });
}

/**
 * DELETE /api/admin/entries/:id — remove an entry completely.
 * FK cascades clean up raffle_round_entries and winners rows.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const supa = getServerSupabase();

  const { error, count } = await supa
    .from("entries")
    .delete({ count: "exact" })
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, deleted: count });
}
