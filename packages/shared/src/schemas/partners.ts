// Partner businesses (55_partners): self sign-up via the partner-apply Edge Function, owner decisions
// in the dashboard (partner.manage). Approved partners use the normal offers and redemption RPCs.
import { z } from "zod";
import { DateTime, Name, Password, PartnerStatus, PhoneE164, Uuid } from "./common.ts";

const OptText = (max: number) => z.string().trim().max(max).optional();

// Body of partner-apply. Length limits match the Edge Function; the password minimum is a server setting.
export const PartnerApplyInput = z.object({
  phone: PhoneE164,
  password: Password,
  contact_name: Name,
  business_name: Name,
  category: OptText(100),
  address: OptText(500),
  business_phone: OptText(30),
  website_url: OptText(500),
  message: OptText(2000),
}).strict();
export const PartnerApplyOutput = z.object({ user_id: Uuid, business_id: Uuid, status: PartnerStatus });

// api.list_partner_applications row.
export const PartnerApplication = z.object({
  business_id: Uuid, business_name: z.string(), category: z.string().nullable(), address: z.string().nullable(),
  business_phone: z.string().nullable(), website_url: z.string().nullable(), logo_path: z.string().nullable(),
  is_active: z.boolean(), applicant_id: Uuid, contact_name: z.string(), applicant_phone: z.string().nullable(),
  status: PartnerStatus, message: z.string().nullable(), decided_at: DateTime.nullable(),
  decision_note: z.string().nullable(), created_at: DateTime,
});
export const ListPartnerApplicationsOutput = z.array(PartnerApplication);
export const ListPartnerApplicationsInput = z.object({ status: PartnerStatus.optional() });

const Note = z.string().trim().max(1000).optional();
export const DecidePartnerInput = z.object({ businessId: Uuid, approve: z.boolean(), note: Note });
export const DecidePartnerOutput = z.object({ business_id: Uuid, status: PartnerStatus });
export const RevokePartnerInput = z.object({ businessId: Uuid, note: Note });
export const RevokePartnerOutput = z.object({ business_id: Uuid, status: PartnerStatus, offers_paused: z.number() });
