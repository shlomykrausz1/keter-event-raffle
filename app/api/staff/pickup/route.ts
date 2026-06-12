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
 * Mark a winner picked up (or undo it).
 * Body: { winner_id: string, picked_up: boolean }
 * Auth: STAFF_PAGE_SLUG header (staff page) OR admin cookie.
 */
export async function POST(req: Request) {
  const cookieOk = await verifyAdminToken(cookies().get(ADMIN_COOKIE)?.value);
  const staffOk = isStaffSlugValid(headers().get(STAFF_SLUG_HEADER));
  if (!cookieOk && !staffOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const winnerId = String(body?.winner_id || "").trim();
  const pickedUp = body?.picked_up === true;
  if (!winnerId) {
    return NextResponse.json({ error: "Missing winner_id." }, { status: 400 });
  }

  const supa = getServerSupabase();

  const { data, error } = await supa
    .from("winners")
    .update(
      pickedUp
        ? {
            picked_up: true,
            picked_up_at: new Date().toISOString(),
            picked_up_by: cookieOk ? "admin" : "staff",
          }
        : { picked_up: false, picked_up_at: null, picked_up_by: null }
    )
    .eq("id", winnerId)
    .select("id, picked_up, picked_up_at");

  if (error) {
    if (/picked_up/.test(error.message || "")) {
      return NextResponse.json(
        {
          error:
            "Pickup tracking is not set up yet. Run supabase/migration-event-controls.sql in the Supabase SQL editor.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const row = data?.[0];
  if (!row) {
    return NextResponse.json({ error: "Winner not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    winner: { id: row.id, picked_up: row.picked_up, picked_up_at: row.picked_up_at },
  });
}
