// Customer self-signup by phone + password (plan §6.1). No SMS: the phone is marked confirmed and
// ownership disputes go through the in-store phone release flow.
import { z } from "npm:zod@3.23.8";
import { handle, clientIp } from "../_shared/http/index.ts";
import { AppError } from "../_shared/errors/index.ts";
import { adminClient } from "../_shared/supabase/index.ts";
import { assertPasswordPolicy, Password, PhoneE164, rateLimit } from "../_shared/credentials/index.ts";

const Body = z.object({
  phone: PhoneE164,
  password: Password,
  full_name: z.string().trim().min(1).max(200),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((s) => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s), "invalid date")
    .refine((s) => new Date(s) < new Date(), "date in future"),
});

Deno.serve(handle(Body, async (b, req) => {
  await rateLimit("register", clientIp(req));
  await assertPasswordPolicy(b.password);

  // The profile row is created by the auth.users trigger from this metadata (10_identity).
  const { data, error } = await adminClient().auth.admin.createUser({
    phone: b.phone,
    password: b.password,
    phone_confirm: true,
    user_metadata: { full_name: b.full_name, date_of_birth: b.date_of_birth },
  });
  if (error) {
    if (error.code === "phone_exists") throw new AppError("PHONE_TAKEN");
    if (error.code === "weak_password") throw new AppError("VALIDATION_FAILED", "password");
    console.error("createUser failed", error.code, error.status);
    throw new AppError("AUTH_UNAVAILABLE");
  }
  return { user_id: data.user.id };
}));
