import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { getServerSupabase } from "@/lib/supabaseServer";
import {
  ADMIN_COOKIE,
  REMOTE_SLUG_HEADER,
  isRemoteSlugValid,
  verifyAdminToken,
} from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

/**
 * Reset the current raffle round: delete its winners but keep the round
 * and its frozen entry pool. Lets the host redraw the same raffle if a
 * mistake was made (wrong winner announced, wheel mis-clicked, etc.).
 *
 *  - Does NOT delete entries.
 *  - Does NOT touch the entry pool (raffle_round_entries).
 *  - Does NOT create a new round.
 *  - Does NOT affect any other round.
 */
export async function POST() {
  // Accept either the admin cookie (browser dashboard) or the
  // REMOTE_CONTROL_SLUG header (phone remote-control page).
  const cookieOk = await verifyAdminToken(cookies().get(ADMIN_COOKIE)?.value);
  const remoteOk = isRemoteSlugValid(headers().get(REMOTE_SLUG_HEADER));
  if (!cookieOk && !remoteOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supa = getServerSupabase();

  const { data: rounds, error: roundErr } = await supa
    .from("raffle_rounds")
    .select("id, round_number")
    .order("round_number", { ascending: false })
    .limit(1);

  if (roundErr) {
    return NextResponse.json({ error: roundErr.message }, { status: 500 });
  }
  const round = rounds?.[0];
  if (!round) {
    return NextResponse.json(
      { error: "No active raffle round to reset." },
      { status: 409 }
    );
  }

  const { error: delErr, count } = await supa
    .from("winners")
    .delete({ count: "exact" })
    .eq("round_id", round.id);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({
    round_id: round.id,
    round_number: round.round_number,
    winners_cleared: count ?? 0,
  });
}
