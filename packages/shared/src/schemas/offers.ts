// Offers: feed, upsert, status (plan §6, §6.1).
import { z } from "zod";
import { DateTime, Num, OfferStatus, Uuid } from "./common.ts";

export const EligibleOffer = z.object({
  id: Uuid,
  business_id: Uuid,
  title: z.string(),
  description: z.string().nullable(),
  banner_path: z.string().nullable(),
  terms: z.string().nullable(),
  starts_at: DateTime,
  ends_at: DateTime.nullable(),
  min_purchase_amount: Num.nullable(),
  max_discount_amount: Num.nullable(),
  category_key: z.string().nullable(),
});
export const ListEligibleOffersOutput = z.array(EligibleOffer);

const Time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);
export const OfferSchedule = z.object({ weekday: z.number().int(), start_time: Time, end_time: Time });

// Keys read by api.upsert_offer (50_offers). schedules / group_ids omitted = left unchanged.
// Ranges and required-on-create rules are checked by the server.
export const UpsertOfferInput = z.object({
  id: Uuid.optional(),
  business_id: Uuid.optional(),
  title: z.string().trim().min(1).optional(),
  description: z.string().nullable().optional(),
  banner_path: z.string().nullable().optional(),
  terms: z.string().nullable().optional(),
  starts_at: DateTime.nullable().optional(),
  ends_at: DateTime.nullable().optional(),
  max_uses_per_customer: z.number().int().nullable().optional(),
  total_usage_limit: z.number().int().nullable().optional(),
  min_purchase_amount: z.number().nullable().optional(),
  max_discount_amount: z.number().nullable().optional(),
  birthday_window_days: z.number().int().nullable().optional(),
  category_id: Uuid.nullable().optional(),
  schedules: z.array(OfferSchedule).optional(),
  group_ids: z.array(Uuid).optional(),
}).strict();
export const UpsertOfferOutput = z.object({ offer_id: Uuid, status: OfferStatus });

export const SetOfferStatusInput = z.object({ offerId: Uuid, status: OfferStatus });
export const SetOfferStatusOutput = z.object({ offer_id: Uuid, status: OfferStatus });

// api.list_offer_categories (F1). Rows come from database/seed/reference/offer_categories.sql.
export const OfferCategory = z.object({ id: Uuid, key: z.string(), name: z.string(), sort_order: z.number().int() });
export const ListOfferCategoriesOutput = z.array(OfferCategory);

// api.list_offers (owner): every offer row, any status, optionally for one business.
export const OwnerOffer = z.object({
  id: Uuid, business_id: Uuid, title: z.string(), description: z.string().nullable(),
  banner_path: z.string().nullable(), terms: z.string().nullable(), status: OfferStatus,
  // Paused by the owner: only the owner can republish it (api.set_offer_status).
  owner_paused: z.boolean(),
  category_id: Uuid.nullable(), starts_at: DateTime, ends_at: DateTime.nullable(),
  max_uses_per_customer: z.number().int().nullable(), total_usage_limit: z.number().int().nullable(),
  total_redeemed: z.number().int(), min_purchase_amount: Num.nullable(), max_discount_amount: Num.nullable(),
  birthday_window_days: z.number().int().nullable(), created_at: DateTime,
}).passthrough();
export const ListOffersOutput = z.array(OwnerOffer);
export const ListOffersInput = z.object({ businessId: Uuid.optional() });
