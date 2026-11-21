// Owner-only staff management (plan §6.5): create, reassign, enable, disable, reset password.
// Auth changes go through the Admin API; the database RPCs re-check staff.manage for the actor.
import { z } from "npm:zod@3.23.8";
import { handle } from "../_shared/http/index.ts";
import { AppError, unwrap } from "../_shared/errors/index.ts";
import { adminClient } from "../_shared/supabase/index.ts";
import { requirePermission } from "../_shared/authz/index.ts";
import { assertPasswordPolicy, Password, PhoneE164 } from "../_shared/credentials/index.ts";

const Role = z.enum(["executive", "owner"]);
const Id = z.string().uuid();

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    phone: PhoneE164,
    temp_password: Password,
    display_name: z.string().trim().min(1).max(200),
    role: Role,
    business_id: Id.nullable(),
  }),
  z.object({ action: z.literal("reassign"), user_id: Id, role: Role, business_id: Id.nullable(), display_name: z.string().trim().min(1).max(200) }),
  z.object({ action: z.literal("enable"), user_id: Id }),
  z.object({ action: z.literal("disable"), user_id: Id }),
  z.object({ action: z.literal("reset_password"), user_id: Id, temp_password: Password }),
]);

// ban_duration "none" lifts a ban; disabling uses a long ban (Auth has no permanent flag).
const BAN_FOREVER = "876000h";

function authFail(error: { code?: string; status?: number }): never {
  if (error.code === "phone_exists") throw new AppError("PHONE_TAKEN");
  if (error.code === "weak_password") throw new AppError("VALIDATION_FAILED", "password");
  if (error.code === "user_not_found") throw new AppError("NOT_FOUND");
  console.error("auth admin call failed", error.code, error.status);
  throw new AppError("AUTH_UNAVAILABLE");
}

Deno.serve(handle(Body, async (b, req) => {
  const actor = await requirePermission(req, "staff.manage");
  const admin = adminClient();
  const api = admin.schema("api");

  switch (b.action) {
    case "create": {
      await assertPasswordPolicy(b.temp_password);
      const { data, error } = await admin.auth.admin.createUser({
        phone: b.phone,
        password: b.temp_password,
        phone_confirm: true,
        app_metadata: { account_type: "staff" },
        user_metadata: { full_name: b.display_name },
      });
      if (error) authFail(error);
      const res = await api.rpc("svc_staff_upsert", {
        p_actor_id: actor, p_user_id: data.user.id, p_role_key: b.role,
        p_business_id: b.business_id, p_display_name: b.display_name,
      });
      if (res.error) {
        // Do not leave an Auth user without a staff row.
        await admin.auth.admin.deleteUser(data.user.id);
        unwrap(res);
      }
      return { user_id: data.user.id };
    }
    case "reassign": {
      unwrap(await api.rpc("svc_staff_upsert", {
        p_actor_id: actor, p_user_id: b.user_id, p_role_key: b.role,
        p_business_id: b.business_id, p_display_name: b.display_name,
      }));
      unwrap(await api.rpc("svc_revoke_user_sessions", { p_actor_id: actor, p_user_id: b.user_id, p_reason: "staff_reassigned" }));
      return { user_id: b.user_id };
    }
    case "enable": {
      unwrap(await api.rpc("svc_staff_set_active", { p_actor_id: actor, p_user_id: b.user_id, p_active: true }));
      const { error } = await admin.auth.admin.updateUserById(b.user_id, { ban_duration: "none" });
      if (error) authFail(error);
      return { user_id: b.user_id };
    }
    case "disable": {
      // DB first: it checks permission and refuses self-disable before Auth is touched.
      unwrap(await api.rpc("svc_staff_set_active", { p_actor_id: actor, p_user_id: b.user_id, p_active: false }));
      const { error } = await admin.auth.admin.updateUserById(b.user_id, { ban_duration: BAN_FOREVER });
      if (error) authFail(error);
      unwrap(await api.rpc("svc_revoke_user_sessions", { p_actor_id: actor, p_user_id: b.user_id, p_reason: "staff_disabled" }));
      return { user_id: b.user_id };
    }
    case "reset_password": {
      await assertPasswordPolicy(b.temp_password);
      unwrap(await api.rpc("svc_staff_mark_password_reset", { p_actor_id: actor, p_user_id: b.user_id }));
      const { error } = await admin.auth.admin.updateUserById(b.user_id, { password: b.temp_password });
      if (error) authFail(error);
      unwrap(await api.rpc("svc_revoke_user_sessions", { p_actor_id: actor, p_user_id: b.user_id, p_reason: "staff_password_reset" }));
      return { user_id: b.user_id };
    }
  }
}));
