// AppError + HTTP status lookup. Codes and statuses come from public.error_codes (plan §3.3),
// loaded once per isolate, so nothing here duplicates the catalogue.
import type { PostgrestError } from "npm:@supabase/supabase-js@2.45.4";
import { adminClient } from "../supabase/index.ts";

export class AppError extends Error {
  constructor(public code: string, public detail?: string) {
    super(code);
  }
}

let catalogue: Map<string, number> | undefined;

export async function statusFor(code: string): Promise<number> {
  if (!catalogue) {
    const { data, error } = await adminClient().from("error_codes").select("code, http_status");
    if (error) throw new Error(`error catalogue unavailable: ${error.message}`);
    catalogue = new Map(data.map((r: { code: string; http_status: number }) => [r.code, r.http_status]));
  }
  return catalogue.get(code) ?? 500;
}

// Our RPCs raise SQLSTATE 'PT<status>' with message = catalogue code (00_core raise_error).
export function fromPostgrest(error: PostgrestError): AppError {
  if (/^PT\d{3}$/.test(error.code ?? "")) return new AppError(error.message, error.details ?? undefined);
  console.error("unexpected database error", error);
  return new AppError("INTERNAL_ERROR");
}

// Throws on error, returns data otherwise.
export function unwrap<T>(res: { data: T; error: PostgrestError | null }): T {
  if (res.error) throw fromPostgrest(res.error);
  return res.data;
}
