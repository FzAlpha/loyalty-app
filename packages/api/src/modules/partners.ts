// Partner offers (F1): member list and owner management (partner.manage). Info only.
import type { z } from "zod";
import {
  ListPartnerOffersOutput, SetPartnerOfferStatusInput, SetPartnerOfferStatusOutput, UpsertPartnerInput,
  UpsertPartnerOfferInput, UpsertPartnerOfferOutput, UpsertPartnerOutput, type Json,
} from "@rewards/shared";
import { withInput, type Ctx } from "../client.ts";

export function partnersModule(ctx: Ctx) {
  return {
    listOffers: () => ctx.rpc("list_partner_offers", {}, ListPartnerOffersOutput),

    upsert: (input: z.input<typeof UpsertPartnerInput>) => withInput(UpsertPartnerInput, input, (v) =>
      ctx.rpc("upsert_partner", { p_partner: v as Json }, UpsertPartnerOutput)),

    upsertOffer: (input: z.input<typeof UpsertPartnerOfferInput>) => withInput(UpsertPartnerOfferInput, input, (v) =>
      ctx.rpc("upsert_partner_offer", { p_offer: v as Json }, UpsertPartnerOfferOutput)),

    setOfferStatus: (input: z.input<typeof SetPartnerOfferStatusInput>) =>
      withInput(SetPartnerOfferStatusInput, input, (v) =>
        ctx.rpc("set_partner_offer_status", { p_offer_id: v.offerId, p_status: v.status }, SetPartnerOfferStatusOutput)),
  };
}
