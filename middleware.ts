import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, verifyAdminToken } from "./lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only guard /admin (NOT /admin/login redirect — login lives at /login)
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const token = req.cookies.get(ADMIN_COOKIE)?.value;
    if (!(await verifyAdminToken(token))) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("from", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
