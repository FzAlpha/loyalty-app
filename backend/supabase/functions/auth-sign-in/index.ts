// Phone + password sign-in with lockout (plan §6.2). Lockout state lives in ops.login_attempts.
// Limitation: clients can still call Supabase Auth /token directly with the anon key and skip this
// lockout; Auth's own rate limits are the only guard there (documented in BACKEND_PLAN §17).
import { z } from "npm:zod@3.23.8";
import { handle, clientIp } from "../_shared/http/index.ts";
import { AppError, unwrap } from "../_shared/errors/index.ts";
import { adminClient, anonClient } from "../_shared/supabase/index.ts";
import { Password, PhoneE164, rateLimit } from "../_shared/credentials/index.ts";

const Body = z.object({ phone: PhoneE164, password: Password });

Deno.serve(handle(Body, async (b, req) => {
  const ip = clientIp(req);
  await rateLimit("sign_in_ip", ip);
  await rateLimit("sign_in_phone", b.phone);

  const api = adminClient().schema("api");
  const lockedUntil = unwrap(await api.rpc("svc_login_guard", { p_phone_e164: b.phone }));
  if (lockedUntil) throw new AppError("ACCOUNT_LOCKED", String(lockedUntil));

  const { data, error } = await anonClient().auth.signInWithPassword({ phone: b.phone, password: b.password });
  if (error) {
    if (error.code === "invalid_credentials") {
      const until = unwrap(await api.rpc("svc_login_result", { p_phone_e164: b.phone, p_success: false, p_ip: ip }));
      if (until) throw new AppError("ACCOUNT_LOCKED", String(until));
      throw new AppError("INVALID_CREDENTIALS");
    }
    if (error.code === "user_banned") throw new AppError("FORBIDDEN", "account_disabled");
    console.error("signInWithPassword failed", error.code, error.status);
    throw new AppError("AUTH_UNAVAILABLE");
  }

  unwrap(await api.rpc("svc_login_result", { p_phone_e164: b.phone, p_success: true, p_ip: ip }));
  const s = data.session!;
  return {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_at: s.expires_at,
    user_id: data.user!.id,
  };
}));
