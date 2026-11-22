// Claim QR and redemption (plan §6, §8). Redemption is never offline (FRONTEND_PLAN §2).
import { z } from "zod";
import { ClaimStatus, CustomerMasked, DateTime, Num, QrPayload, Uuid } from "./common.ts";

export const CreateClaimTokenInput = z.object({ offerId: Uuid });
export const CreateClaimTokenOutput = z.object({ claim_id: Uuid, qr_payload: z.string().min(1), expires_at: DateTime });

export const PreviewFlag = z.enum(["USED", "REVOKED", "EXPIRED", "NOT_ELIGIBLE", "WRONG_BUSINESS"]);
export const PreviewClaimInput = z.object({ qrPayload: QrPayload });
// For WRONG_BUSINESS the server returns only claim_id + flags (no customer details).
export const PreviewClaimOutput = z.object({
  claim_id: Uuid,
  flags: z.array(PreviewFlag),
  status: ClaimStatus.optional(),
  expires_at: DateTime.optional(),
  reason_code: z.string().nullable().optional(),
  offer: z.object({
    offer_id: Uuid, title: z.string(), min_purchase_amount: Num.nullable(), max_discount_amount: Num.nullable(),
  }).optional(),
  customer: CustomerMasked.nullable().optional(),
  business_id: Uuid.optional(),
  bill_number_required: z.boolean().optional(),
  bill_amount_required: z.boolean().optional(),
});

export const RedeemClaimInput = z.object({
  qrPayload: QrPayload,
  idempotencyKey: z.string().min(1),
  billNumber: z.string().optional(),
  billAmount: z.number().nonnegative().optional(),
});
export const RedeemClaimOutput = z.object({
  redemption_id: Uuid,
  claim_id: Uuid,
  offer_id: Uuid,
  customer_id: Uuid,
  card_id: Uuid,
  business_id: Uuid,
  executive_id: Uuid,
  bill_number: z.string().nullable(),
  bill_amount: Num.nullable(),
  redeemed_at: DateTime,
  replayed: z.boolean(),
});
