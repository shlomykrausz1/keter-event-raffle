import { NextResponse } from "next/server";
import { ADMIN_COOKIE, makeAdminToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // Trim both sides — Vercel's env editor occasionally collects trailing
  // whitespace or a newline from a paste, which would silently break the
  // password compare otherwise.
  const password: string = String(body?.password || "").trim();
  const expected = (process.env.ADMIN_PASSWORD || "").trim();

  if (!expected) {
    return NextResponse.json(
      {
        error:
          "Server admin password not configured. Set ADMIN_PASSWORD in the Vercel project settings and redeploy.",
      },
      { status: 500 }
    );
  }
  if (!process.env.ADMIN_SESSION_SECRET) {
    return NextResponse.json(
      {
        error:
          "Server session secret not configured. Set ADMIN_SESSION_SECRET (32+ chars) in the Vercel project settings and redeploy.",
      },
      { status: 500 }
    );
  }

  if (!password || password !== expected) {
    // small constant-time-ish delay to slow brute force
    await new Promise((r) => setTimeout(r, 350));
    return NextResponse.json({ error: "Incorrect code." }, { status: 401 });
  }

  let token: string;
  try {
    token = await makeAdminToken();
  } catch (e: any) {
    console.error("[admin/login] makeAdminToken failed:", e?.message || e);
    return NextResponse.json(
      {
        error:
          "Could not sign session. ADMIN_SESSION_SECRET must be at least 16 chars.",
      },
      { status: 500 }
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  return res;
}
