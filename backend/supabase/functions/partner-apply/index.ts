// Partner business self sign-up (plan §4 partners). Creates a staff Auth account with the
// applicant's own password, then a pending partner application. The owner decides in the dashboard.
import { z } from "npm:zod@3.23.8";
import { handle, clientIp } from "../_shared/http/index.ts";
import { AppError, unwrap } from "../_shared/errors/index.ts";
import { adminClient } from "../_shared/supabase/index.ts";
import { assertPasswordPolicy, Password, PhoneE164, rateLimit } from "../_shared/credentials/index.ts";

const Text = (max: number) => z.string().trim().max(max).optional();

const Body = z.object({
  phone: PhoneE164,
  password: Password,
  contact_name: z.string().trim().min(1).max(200),
  business_name: z.string().trim().min(1).max(200),
  category: Text(100),
  address: Text(500),
  business_phone: Text(30),
  website_url: Text(500),
  message: Text(2000),
});

Deno.serve(handle(Body, async (b, req) => {
  await rateLimit("partner_apply", clientIp(req));
  await assertPasswordPolicy(b.password);

  const admin = adminClient();
  // account_type 'staff' keeps the signup trigger from granting the customer role (10_identity).
  const { data, error } = await admin.auth.admin.createUser({
    phone: b.phone,
    password: b.password,
    phone_confirm: true,
    app_metadata: { account_type: "staff" },
    user_metadata: { full_name: b.contact_name },
  });
  if (error) {
    if (error.code === "phone_exists") throw new AppError("PHONE_TAKEN");
    if (error.code === "weak_password") throw new AppError("VALIDATION_FAILED", "password");
    console.error("createUser failed", error.code, error.status);
    throw new AppError("AUTH_UNAVAILABLE");
  }

  const res = await admin.schema("api").rpc("svc_partner_register", {
    p_user_id: data.user.id,
    p_application: {
      business_name: b.business_name,
      contact_name: b.contact_name,
      category: b.category || null,
      address: b.address || null,
      phone: b.business_phone || null,
      website_url: b.website_url || null,
      message: b.message || null,
    },
  });
  if (res.error) {
    // Do not leave an Auth user without an application.
    await admin.auth.admin.deleteUser(data.user.id);
    unwrap(res);
  }
  return { user_id: data.user.id, ...(res.data as Record<string, unknown>) };
}));
