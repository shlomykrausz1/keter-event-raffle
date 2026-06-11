import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSupabase } from "@/lib/supabaseServer";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  if (!(await verifyAdminToken(cookies().get(ADMIN_COOKIE)?.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supa = getServerSupabase();

  // Cascade deletes will remove related raffle_round_entries / winners rows.
  const { error, count } = await supa
    .from("entries")
    .delete({ count: "exact" })
    .eq("is_demo", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deleted: count ?? 0 });
}
