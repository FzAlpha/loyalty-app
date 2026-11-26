// Claim QR (customer) and preview / redeem (executive). Never offline: a claim is redeemed only
// when redeem() returns data (FRONTEND_PLAN §2).
import type { z } from "zod";
import {
  CreateClaimTokenInput, CreateClaimTokenOutput, ListMyRedemptionsInput, ListMyRedemptionsOutput, ListMyRedemptionsTodayInput,
  ListMyRedemptionsTodayOutput, PreviewClaimInput, PreviewClaimOutput, RedeemClaimInput,
  RedeemClaimOutput,
} from "@rewards/shared";
import { withInput, type Ctx } from "../client.ts";

export function claimsModule(ctx: Ctx) {
  return {
    // Customer redemption history (F1).
    listMine: (input: z.input<typeof ListMyRedemptionsInput> = {}) => withInput(ListMyRedemptionsInput, input, (v) =>
      ctx.rpc("list_my_redemptions", { p_before: v.before, p_limit: v.limit }, ListMyRedemptionsOutput)),

    // Executive's own redemptions today at one business (F2 admin "Today").
    listMineToday: (input: z.input<typeof ListMyRedemptionsTodayInput>) =>
      withInput(ListMyRedemptionsTodayInput, input, (v) =>
        ctx.rpc("list_my_redemptions_today", { p_business_id: v.businessId, p_before: v.before, p_limit: v.limit },
          ListMyRedemptionsTodayOutput)),

    create: (input: z.input<typeof CreateClaimTokenInput>) => withInput(CreateClaimTokenInput, input, (v) =>
      ctx.rpc("create_claim_token", { p_offer_id: v.offerId }, CreateClaimTokenOutput)),

    preview: (input: z.input<typeof PreviewClaimInput>) => withInput(PreviewClaimInput, input, (v) =>
      ctx.rpc("preview_claim", { p_qr_payload: v.qrPayload }, PreviewClaimOutput)),

    // Reuse the same idempotencyKey when retrying after NETWORK_ERROR; the server replays the result.
    redeem: (input: z.input<typeof RedeemClaimInput>) => withInput(RedeemClaimInput, input, (v) =>
      ctx.rpc("redeem_claim", {
        p_qr_payload: v.qrPayload, p_idempotency_key: v.idempotencyKey, p_bill_number: v.billNumber,
        p_bill_amount: v.billAmount,
      }, RedeemClaimOutput)),
  };
}
