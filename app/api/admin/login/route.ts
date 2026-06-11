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

  const password: string = String(body?.password || "");
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected) {
    return NextResponse.json(
      { error: "Server admin password not configured." },
      { status: 500 }
    );
  }

  if (!password || password !== expected) {
    // small constant-time-ish delay to slow brute force
    await new Promise((r) => setTimeout(r, 350));
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const token = await makeAdminToken();
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
