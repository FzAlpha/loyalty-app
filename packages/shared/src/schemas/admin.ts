// Owner/admin operations: staff-admin Edge Function, business, settings (plan §6).
import { z } from "zod";
import { DateTime, HttpsUrl, Name, Password, PhoneE164, Uuid } from "./common.ts";
import type { Json } from "../contracts.ts";

export const StaffRole = z.enum(["executive", "owner"]);
export const CreateStaffInput = z.object({
  phone: PhoneE164, tempPassword: Password, displayName: Name, role: StaffRole, businessId: Uuid.nullable(),
});
export const ReassignStaffInput = z.object({ userId: Uuid, role: StaffRole, businessId: Uuid.nullable(), displayName: Name });
export const StaffUserInput = z.object({ userId: Uuid });
export const ResetStaffPasswordInput = z.object({ userId: Uuid, tempPassword: Password });
export const StaffAdminOutput = z.object({ user_id: Uuid });

// api.get_my_staff (30_staff, F2): the signed-in staff member's own context, for admin-app routing only.
// Every RPC still checks permissions server side.
export const MyStaffOutput = z.object({
  user_id: Uuid, display_name: z.string(), role: StaffRole, business_id: Uuid.nullable(),
  business_name: z.string().nullable(), is_active: z.boolean(), must_change_password: z.boolean(),
});

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
  category: z.string().nullable(),
  website_url: HttpsUrl.nullable(),
}).partial().strict().refine((p) => Object.keys(p).length > 0, { message: "empty patch" });
export const UpdateBusinessInput = z.object({ businessId: Uuid, patch: BusinessPatch });
// to_jsonb(businesses row): only the stable fields are checked; the rest pass through.
export const UpdateBusinessOutput = z.object({ id: Uuid, slug: z.string(), name: z.string() }).passthrough();

// api.list_businesses (F1): active group companies, public (anon allowed).
export const GroupBusiness = z.object({
  id: Uuid, name: z.string(), category: z.string().nullable(), logo_path: z.string().nullable(),
  brand_color: z.string().nullable(), website_url: z.string().nullable(),
});
export const ListBusinessesOutput = z.array(GroupBusiness);

// Owner adds a business: api.create_business (slug is made from the name on the server).
const OptText = z.string().trim().nullable().optional();
export const CreateBusinessInput = z.object({
  name: z.string().trim().min(1).max(200),
  category: OptText, address: OptText, phone: OptText, timezone: OptText, brand_color: OptText,
  website_url: HttpsUrl.nullable().optional(),
}).strict();
export const DeleteBusinessInput = z.object({ businessId: Uuid });
// api.delete_business: where the deleted business's files live (removed afterwards via the Storage API).
export const DeleteBusinessOutput = z.object({ asset_bucket: z.string().min(1), asset_prefix: Uuid });
// api.list_managed_businesses (owner): every business row, active or not.
export const ManagedBusiness = z.object({
  id: Uuid, slug: z.string(), name: z.string(), category: z.string().nullable(), address: z.string().nullable(),
  phone: z.string().nullable(), website_url: z.string().nullable(), timezone: z.string().nullable(),
  brand_color: z.string().nullable(), is_active: z.boolean(), logo_path: z.string().nullable(),
}).passthrough();
export const ListManagedBusinessesOutput = z.array(ManagedBusiness);

export const JsonValue: z.ZodType<Json> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValue), z.record(JsonValue)]));
export const SetSettingInput = z.object({ key: z.string().min(1), value: JsonValue, businessId: Uuid.optional() });
export const SetSettingOutput = z.object({
  key: z.string(), business_id: Uuid.nullable(), value: JsonValue, updated_at: DateTime,
});

// api.list_staff (owner): every staff account with its business.
export const StaffMember = z.object({
  user_id: Uuid, display_name: z.string(), role: StaffRole, business_id: Uuid.nullable(),
  business_name: z.string().nullable(), phone_e164: z.string().nullable(), is_active: z.boolean(),
  must_change_password: z.boolean(), created_at: DateTime,
});
export const ListStaffOutput = z.array(StaffMember);

// api.get_storage_buckets: bucket names from app_settings (storage.bucket.*).
export const StorageBuckets = z.object({
  business_assets: z.string().min(1), offer_banners: z.string().min(1), partner_images: z.string().min(1),
});
