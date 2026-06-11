import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabaseServer";
import { normalizePhone, formatPhoneDisplay, isValid10Digit } from "@/lib/phone";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  full_name?: string;
  phone?: string;
  email?: string;
  street_address?: string;
  zip_code?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const full_name = (body.full_name || "").trim();
  const phoneRaw = (body.phone || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  const street_address = (body.street_address || "").trim();
  const zip_code = (body.zip_code || "").trim();

  if (!full_name || full_name.length < 2) {
    return NextResponse.json({ error: "Please enter your full name." }, { status: 400 });
  }
  if (!isValid10Digit(phoneRaw)) {
    return NextResponse.json({ error: "Please enter a valid 10-digit phone number." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  }
  if (!street_address || street_address.length < 3) {
    return NextResponse.json({ error: "Please enter your street address." }, { status: 400 });
  }
  if (!/^\d{5}(-\d{4})?$/.test(zip_code)) {
    return NextResponse.json({ error: "Please enter a valid ZIP code." }, { status: 400 });
  }

  const phone_normalized = normalizePhone(phoneRaw);
  const phone_display = formatPhoneDisplay(phoneRaw);

  let supa;
  try {
    supa = getServerSupabase();
  } catch (e: any) {
    console.error(
      "\n[entries] Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local and restart the dev server.\n",
      e?.message || e
    );
    return NextResponse.json(
      {
        error:
          "The raffle database is not configured yet. Ask the event operator to set up Supabase before opening entries.",
      },
      { status: 503 }
    );
  }

  let data: { id: string } | null = null;
  let error: any = null;
  try {
    const res = await supa
      .from("entries")
      .insert({
        full_name,
        phone_display,
        phone_normalized,
        email,
        street_address,
        zip_code,
        is_demo: false,
      })
      .select("id")
      .single();
    data = res.data as any;
    error = res.error;
  } catch (e: any) {
    console.error("[entries] Supabase insert threw:", e?.message || e);
    return NextResponse.json(
      { error: "Could not reach the database. Please try again." },
      { status: 502 }
    );
  }

  if (error) {
    // unique violation -> duplicate phone
    if ((error as any).code === "23505") {
      return NextResponse.json(
        { error: "This phone number has already entered the raffle." },
        { status: 409 }
      );
    }
    console.error("[entries] Insert entry failed:", error);
    return NextResponse.json({ error: "Could not save your entry. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data?.id });
}
