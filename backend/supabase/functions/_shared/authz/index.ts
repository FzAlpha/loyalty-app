// Caller identity and permission checks. Never trusts ids from the request body.
import { adminClient, userClient } from "../supabase/index.ts";
import { AppError, unwrap } from "../errors/index.ts";
import { bearer } from "../http/index.ts";

// Verifies the JWT with Supabase Auth, then asks the database as the caller (session must be live,
// staff must be active). Returns the caller's user id for service-role RPCs (p_actor_id).
export async function requirePermission(req: Request, permission: string, businessId: string | null = null): Promise<string> {
  const jwt = bearer(req);
  const { data, error } = await adminClient().auth.getUser(jwt);
  if (error || !data.user) throw new AppError("UNAUTHENTICATED");
  const ok = unwrap(
    await userClient(jwt).schema("api").rpc("has_permission", { p_permission: permission, p_business_id: businessId }),
  );
  if (ok !== true) throw new AppError("FORBIDDEN", permission);
  return data.user.id;
}
