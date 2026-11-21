// Password reset with a staff-issued recovery code (plan §6.3). Sets the new password, then signs
// the user out everywhere.
import { z } from "npm:zod@3.23.8";
import { handle, clientIp } from "../_shared/http/index.ts";
import { AppError, unwrap } from "../_shared/errors/index.ts";
import { adminClient } from "../_shared/supabase/index.ts";
import { assertPasswordPolicy, Password, PhoneE164, rateLimit } from "../_shared/credentials/index.ts";

const Body = z.object({
  phone: PhoneE164,
  code: z.string().trim().min(4).max(32),
  new_password: Password,
});

Deno.serve(handle(Body, async (b, req) => {
  await rateLimit("recover_ip", clientIp(req));
  await rateLimit("recover_phone", b.phone);
  await assertPasswordPolicy(b.new_password);

  const admin = adminClient();
  const res = unwrap(
    await admin.schema("api").rpc("svc_consume_recovery_code", { p_phone_e164: b.phone, p_code: b.code }),
  ) as { ok: boolean; user_id?: string };
  if (!res.ok || !res.user_id) throw new AppError("RECOVERY_CODE_INVALID");

  // The code is spent at this point. If this update fails, staff must issue a new code.
  const { error } = await admin.auth.admin.updateUserById(res.user_id, { password: b.new_password });
  if (error) {
    if (error.code === "weak_password") throw new AppError("VALIDATION_FAILED", "password");
    console.error("updateUserById failed", error.code, error.status);
    throw new AppError("AUTH_UNAVAILABLE");
  }

  unwrap(await admin.schema("api").rpc("svc_revoke_user_sessions", {
    p_actor_id: res.user_id, p_user_id: res.user_id, p_reason: "password_recovered",
  }));
  return { recovered: true };
}));
