// Maps supabase-js results to Result<T> (plan §12). Behaviour checked against the library source
// (supabase-js 2.45.4: postgrest-js 1.16.1, functions-js 2.4.1, auth-js 2.65.0):
// - postgrest-js does not throw on network failure; it returns an error with status 0.
// - RPCs raise SQLSTATE PT<http status>, message = catalogue code, details = detail.
// - functions-js returns FunctionsHttpError (context = Response) for non-2xx, FunctionsFetchError
//   when the request fails, FunctionsRelayError when the relay fails.
// - Edge Functions answer { data } or { error: { code, detail } }.
import type { z } from "zod";
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { isServerErrorCode, type ApiError, type Result } from "@rewards/shared";

export const fail = (code: ApiError["code"], detail?: string): { error: ApiError } =>
  ({ error: detail === undefined || detail === "" ? { code } : { code, detail } });

const issuePaths = (e: z.ZodError) => e.issues.map((i) => i.path.join(".")).join(",");

// Same detail format as the Edge Functions: the failing paths, comma separated.
export function validate<S extends z.ZodTypeAny>(schema: S, input: unknown): Result<z.output<S>> {
  const r = schema.safeParse(input);
  return r.success ? { data: r.data } : fail("VALIDATION_FAILED", issuePaths(r.error));
}

export function parseOutput<S extends z.ZodTypeAny>(schema: S, data: unknown): Result<z.output<S>> {
  const r = schema.safeParse(data);
  return r.success ? { data: r.data } : fail("INVALID_RESPONSE", issuePaths(r.error));
}

export type PostgrestLike = {
  data: unknown;
  error: { message: string; details?: string | null; code?: string } | null;
  status: number;
};

export function fromPostgrest(res: PostgrestLike): Result<unknown> {
  if (!res.error) return { data: res.data };
  const { message, details, code } = res.error;
  if (res.status === 0) return fail("NETWORK_ERROR", message);
  if (code && /^PT\d{3}$/.test(code) && isServerErrorCode(message)) return fail(message, details ?? undefined);
  return fail("UNKNOWN_ERROR_CODE", `${code ?? ""}: ${message}`);
}

export async function fromFunction(res: { data: unknown; error: unknown }): Promise<Result<unknown>> {
  const err = res.error;
  if (!err) {
    const body = res.data;
    if (body && typeof body === "object" && "data" in body) return { data: (body as { data: unknown }).data };
    return fail("INVALID_RESPONSE", "envelope");
  }
  if (err instanceof FunctionsFetchError) return fail("NETWORK_ERROR");
  if (err instanceof FunctionsRelayError) return fail("UNKNOWN_ERROR_CODE", "relay_error");
  if (err instanceof FunctionsHttpError) {
    const resp = err.context as Response;
    const body = await resp.json().catch(() => undefined) as { error?: { code?: unknown; detail?: unknown } } | undefined;
    const code = body?.error?.code;
    const detail = typeof body?.error?.detail === "string" ? body.error.detail : undefined;
    // A non-catalogue body (e.g. the gateway's own JWT check) is reported with its HTTP status.
    return isServerErrorCode(code) ? fail(code, detail) : fail("UNKNOWN_ERROR_CODE", `http_${resp.status}`);
  }
  return fail("UNKNOWN_ERROR_CODE", err instanceof Error ? err.message : String(err));
}

export type AuthErrorLike = { message: string; status?: number; code?: string; name?: string };

// Supabase Auth errors from client calls (setSession, updateUser, signOut).
export function fromAuthError(e: AuthErrorLike): { error: ApiError } {
  if (e.name === "AuthRetryableFetchError" || e.status === 0) return fail("NETWORK_ERROR", e.message);
  if (e.code === "weak_password") return fail("VALIDATION_FAILED", "password"); // same as auth-register
  if (e.code === "session_not_found" || e.code === "bad_jwt" || e.name === "AuthSessionMissingError") {
    return fail("UNAUTHENTICATED");
  }
  return fail("UNKNOWN_ERROR_CODE", e.code ?? e.message);
}

// Network failures that throw instead of returning (defensive: the libraries above do not).
export function fromThrown(e: unknown): { error: ApiError } {
  return fail("NETWORK_ERROR", e instanceof Error ? e.message : String(e));
}
