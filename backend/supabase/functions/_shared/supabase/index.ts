// Client factories (plan §1.2). adminClient uses the service role and must never leave the server.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { config } from "../config/index.ts";

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

let admin: SupabaseClient | undefined;

export function adminClient(): SupabaseClient {
  admin ??= createClient(config().SUPABASE_URL, config().SUPABASE_SERVICE_ROLE_KEY, noSession);
  return admin;
}

// Anonymous client for signInWithPassword (no stored session; one per request).
export function anonClient(): SupabaseClient {
  return createClient(config().SUPABASE_URL, config().SUPABASE_ANON_KEY, noSession);
}

// Client acting as the caller: PostgREST sees the caller's JWT, so RLS and private.can() apply.
export function userClient(jwt: string): SupabaseClient {
  return createClient(config().SUPABASE_URL, config().SUPABASE_ANON_KEY, {
    ...noSession,
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}
