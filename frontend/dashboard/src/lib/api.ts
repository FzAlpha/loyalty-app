// The one Supabase client and the typed API. Pages call `api.*` only, never supabase.rpc (FRONTEND_PLAN §2).
import { createClient } from "@supabase/supabase-js";
import { createApi, type Client } from "@rewards/api";
import type { Database } from "@rewards/shared";
import { env } from "./env";

// Edge Function calls go through this app's own server route (/api/fn/<name>), because the
// functions do not send CORS headers for the dashboard's origin (user decision 2026-11-26).
const FN_PREFIX = `${env.supabaseUrl.replace(/\/$/, "")}/functions/v1/`;
const proxiedFetch: typeof fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return url.startsWith(FN_PREFIX) ? fetch(`/api/fn/${url.slice(FN_PREFIX.length)}`, init) : fetch(input, init);
};

// Used from client components only. supabase-js keeps the session in localStorage.
export const supabase: Client = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  global: { fetch: proxiedFetch },
});

export const api = createApi(supabase);
