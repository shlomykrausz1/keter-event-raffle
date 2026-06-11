/**
 * Admin session token helpers.
 *
 * Uses the Web Crypto API (SubtleCrypto) so this module works in both
 * the Node.js runtime (API routes) AND the Edge runtime (middleware).
 *
 * Token format: "<timestamp>.<hex hmac-sha256>"
 * Tokens are valid for 12 hours.
 */

const COOKIE_NAME = "keter_admin_session";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("ADMIN_SESSION_SECRET must be set and at least 16 chars.");
  }
  return secret;
}

async function hmac(message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return bufferToHex(new Uint8Array(sig));
}

function bufferToHex(buf: Uint8Array): string {
  let out = "";
  for (let i = 0; i < buf.length; i += 1) {
    out += buf[i].toString(16).padStart(2, "0");
  }
  return out;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Returns the signed token to store in the admin cookie. */
export async function makeAdminToken(): Promise<string> {
  const ts = Date.now().toString();
  const sig = await hmac(`admin:${ts}`);
  return `${ts}.${sig}`;
}

/** Verify a token from a cookie. */
export async function verifyAdminToken(
  token: string | undefined | null
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [ts, sig] = parts;

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  const ageMs = Date.now() - tsNum;
  if (ageMs < 0 || ageMs > MAX_AGE_MS) return false;

  const expected = await hmac(`admin:${ts}`);
  return timingSafeEqualHex(sig, expected);
}

export const ADMIN_COOKIE = COOKIE_NAME;

/**
 * Header name the remote-control phone page uses to prove it knows
 * REMOTE_CONTROL_SLUG. Routes accept this OR the admin cookie.
 */
export const REMOTE_SLUG_HEADER = "x-remote-slug";

/** Returns true if the header carries the configured remote slug. */
export function isRemoteSlugValid(slug: string | null | undefined): boolean {
  const expected = process.env.REMOTE_CONTROL_SLUG;
  if (!expected || expected.length < 4) return false;
  if (!slug) return false;
  return slug === expected;
}
