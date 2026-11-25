// Partner offers (55_partners, F1): info only, no claim QR and no redemption tracking.
import { z } from "zod";
import { DateTime, HttpsUrl, PartnerOfferStatus, Uuid } from "./common.ts";

export const PartnerOffer = z.object({
  id: Uuid,
  partner_id: Uuid,
  partner_name: z.string(),
  partner_logo_path: z.string().nullable(),
  partner_website_url: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  banner_path: z.string().nullable(),
  terms: z.string().nullable(),
  discount_text: z.string().nullable(),
  claim_url: z.string().nullable(),
  claim_code: z.string().nullable(),
  starts_at: DateTime,
  ends_at: DateTime.nullable(),
});
export const ListPartnerOffersOutput = z.array(PartnerOffer);

// Keys read by api.upsert_partner. Updates replace every field. Lengths are checked by the server.
export const UpsertPartnerInput = z.object({
  id: Uuid.optional(),
  name: z.string().trim().min(1),
  logo_path: z.string().nullable().optional(),
  website_url: HttpsUrl.nullable().optional(),
  is_active: z.boolean().optional(),
}).strict();
export const UpsertPartnerOutput = z.object({ partner_id: Uuid, is_active: z.boolean() });

// Keys read by api.upsert_partner_offer. partner_id is required on create and cannot change.
export const UpsertPartnerOfferInput = z.object({
  id: Uuid.optional(),
  partner_id: Uuid.optional(),
  title: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  banner_path: z.string().nullable().optional(),
  terms: z.string().nullable().optional(),
  discount_text: z.string().nullable().optional(),
  claim_url: z.string().trim().regex(/^https:\/\/\S+$/).max(1000).nullable().optional(),
  claim_code: z.string().nullable().optional(),
  starts_at: DateTime.nullable().optional(),
  ends_at: DateTime.nullable().optional(),
}).strict().refine((o) => o.id !== undefined || o.partner_id !== undefined, { path: ["partner_id"] });
export const UpsertPartnerOfferOutput = z.object({ partner_offer_id: Uuid, status: PartnerOfferStatus });

export const SetPartnerOfferStatusInput = z.object({ offerId: Uuid, status: PartnerOfferStatus });
export const SetPartnerOfferStatusOutput = z.object({ partner_offer_id: Uuid, status: PartnerOfferStatus });
