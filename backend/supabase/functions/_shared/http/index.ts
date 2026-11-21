// Request handling, CORS and JSON responses (plan §1.2). Every response is { data } or { error: { code } }.
import { z } from "npm:zod@3.23.8";
import { config } from "../config/index.ts";
import { AppError, statusFor } from "../errors/index.ts";

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowed = config().CORS_ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-request-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

// Client IP for rate limiting. Takes the first X-Forwarded-For entry. Which header the Edge
// runtime sets to the real client IP (Sb-Forwarded-For?) is NOT verified yet (deferred M0 item).
export function clientIp(req: Request): string | null {
  const first = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || null;
}

export function bearer(req: Request): string {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) throw new AppError("UNAUTHENTICATED");
  return m[1];
}

// validate → handler → map result/error.
export function handle<S extends z.ZodTypeAny>(
  schema: S,
  fn: (body: z.infer<S>, req: Request) => Promise<unknown>,
) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
    try {
      if (req.method !== "POST") throw new AppError("METHOD_NOT_ALLOWED");
      const raw = await req.json().catch(() => undefined);
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        throw new AppError("VALIDATION_FAILED", parsed.error.issues.map((i) => i.path.join(".")).join(","));
      }
      return json(req, 200, { data: (await fn(parsed.data, req)) ?? null });
    } catch (e) {
      const err = e instanceof AppError ? e : new AppError("INTERNAL_ERROR");
      if (!(e instanceof AppError)) console.error(e);
      return json(req, await statusFor(err.code), { error: { code: err.code, detail: err.detail } });
    }
  };
}
