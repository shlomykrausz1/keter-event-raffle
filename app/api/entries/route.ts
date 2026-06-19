import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabaseServer";
import { normalizePhone, formatPhoneDisplay, isValid10Digit } from "@/lib/phone";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Version of the Terms & Conditions a submitter is agreeing to. Bump this
// whenever the /terms copy changes so historical consent stays auditable.
const TERMS_VERSION = "2026-06-18";

type Body = {
  full_name?: string;
  phone?: string;
  email?: string;
  street_address?: string;
  zip_code?: string;
  terms_accepted?: boolean;
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
  if (body.terms_accepted !== true) {
    return NextResponse.json(
      { error: "You must agree to the Terms & Conditions to enter the raffle." },
      { status: 400 }
    );
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

  const baseRow = {
    full_name,
    phone_display,
    phone_normalized,
    email,
    street_address,
    zip_code,
    is_demo: false,
  };
  const consentRow = {
    terms_accepted: true,
    terms_accepted_at: new Date().toISOString(),
    terms_version: TERMS_VERSION,
    marketing_email_consent: true,
    marketing_consent_source: "raffle-entry-page",
  };

  const insertEntry = (includeConsent: boolean) =>
    supa
      .from("entries")
      .insert(includeConsent ? { ...baseRow, ...consentRow } : baseRow)
      .select("id")
      .single();

  let data: { id: string } | null = null;
  let error: any = null;
  try {
    let res = await insertEntry(true);
    // 42703 = undefined_column. The consent columns are added by
    // supabase/migration-terms-consent.sql; if that hasn't been run yet,
    // fall back to a plain insert so the entry flow never breaks.
    if (res.error && (res.error as any).code === "42703") {
      console.warn(
        "[entries] Consent columns missing — run supabase/migration-terms-consent.sql. Saving entry without consent fields for now."
      );
      res = await insertEntry(false);
    }
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
      // Log the blocked attempt for the analytics page. Best-effort only —
      // a missing duplicate_attempts table (migration not run yet) must
      // never break the entry flow.
      try {
        await supa.from("duplicate_attempts").insert({
          phone_normalized,
          phone_display,
          attempted_name: full_name,
          attempted_email: email,
        });
      } catch {
        /* ignore */
      }
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
