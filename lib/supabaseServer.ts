import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLocalSupabase } from "./localStore";

let cached: SupabaseClient | null = null;
let warnedLocal = false;

/**
 * Server-side Supabase client.
 *
 * If real Supabase env vars are set, use the real client.
 * Otherwise fall back to a file-backed local shim (see lib/localStore.ts) so
 * the app is fully functional during local development without needing a
 * Supabase project.
 *
 * Never import this from a "use client" component.
 */
export function getServerSupabase(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && serviceKey) {
    cached = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return cached;
  }

  // The file-backed local store writes to `<cwd>/.data/store.json`. That works
  // in `npm run dev` but on Vercel the function filesystem is read-only, so a
  // write would crash the function and Next.js would return an HTML 500
  // (which the form code then surfaces as a vague "Network error"). Refuse
  // the fallback in production so API routes can return a clean JSON 503
  // explaining what's actually wrong.
  const isProduction =
    process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  if (isProduction) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the Vercel project settings, then redeploy."
    );
  }

  if (!warnedLocal) {
    warnedLocal = true;
    // eslint-disable-next-line no-console
    console.log(
      "[supabaseServer] Supabase env vars are unset — using file-backed local store at .data/store.json"
    );
  }
  // The local shim implements only the surface the app uses, but its responses
  // match @supabase/supabase-js's `{ data, error, count? }` shape.
  cached = getLocalSupabase() as unknown as SupabaseClient;
  return cached;
}
