// Owner/admin operations: staff-admin Edge Function, business, settings (plan §6).
import { z } from "zod";
import { DateTime, Name, Password, PhoneE164, Uuid } from "./common.ts";
import type { Json } from "../contracts.ts";

export const StaffRole = z.enum(["executive", "owner"]);
export const CreateStaffInput = z.object({
  phone: PhoneE164, tempPassword: Password, displayName: Name, role: StaffRole, businessId: Uuid.nullable(),
});
export const ReassignStaffInput = z.object({ userId: Uuid, role: StaffRole, businessId: Uuid.nullable(), displayName: Name });
export const StaffUserInput = z.object({ userId: Uuid });
export const ResetStaffPasswordInput = z.object({ userId: Uuid, tempPassword: Password });
export const StaffAdminOutput = z.object({ user_id: Uuid });

// Keys accepted by api.update_business (20_businesses).
export const BusinessPatch = z.object({
  name: z.string().trim().min(1),
  logo_path: z.string().nullable(),
  brand_color: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  timezone: z.string().min(1),
  opening_hours: z.union([z.record(z.unknown()), z.array(z.unknown())]).nullable(),
  is_active: z.boolean(),
}).partial().strict().refine((p) => Object.keys(p).length > 0, { message: "empty patch" });
export const UpdateBusinessInput = z.object({ businessId: Uuid, patch: BusinessPatch });
// to_jsonb(businesses row): only the stable fields are checked; the rest pass through.
export const UpdateBusinessOutput = z.object({ id: Uuid, slug: z.string(), name: z.string() }).passthrough();

export const JsonValue: z.ZodType<Json> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValue), z.record(JsonValue)]));
export const SetSettingInput = z.object({ key: z.string().min(1), value: JsonValue, businessId: Uuid.optional() });
export const SetSettingOutput = z.object({
  key: z.string(), business_id: Uuid.nullable(), value: JsonValue, updated_at: DateTime,
});
