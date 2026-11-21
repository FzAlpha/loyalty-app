// Phone and password input rules. Phones must already be E.164 (+ and digits); the apps format them.
import { z } from "npm:zod@3.23.8";
import { adminClient } from "../supabase/index.ts";
import { AppError, unwrap } from "../errors/index.ts";

// Same pattern as the profiles.phone_e164 check constraint.
export const PhoneE164 = z.string().regex(/^\+[1-9][0-9]{6,14}$/);

// Password text is bounded here; the real policy minimum comes from auth.password.min_length.
export const Password = z.string().min(1).max(72);

export async function assertPasswordPolicy(password: string): Promise<void> {
  const min = unwrap(await adminClient().schema("api").rpc("svc_get_setting", { p_key: "auth.password.min_length" }));
  if (password.length < Number(min)) throw new AppError("VALIDATION_FAILED", "password");
}

export async function rateLimit(action: string, key: string | null): Promise<void> {
  unwrap(await adminClient().schema("api").rpc("svc_rate_limit", { p_action: action, p_key: key ?? "unknown" }));
}
