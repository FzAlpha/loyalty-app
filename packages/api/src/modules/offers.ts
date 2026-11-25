// Offers: customer feed and owner management (plan §6, §6.1).
import type { z } from "zod";
import {
  ListEligibleOffersOutput, ListOfferCategoriesOutput, SetOfferStatusInput, SetOfferStatusOutput, UpsertOfferInput, UpsertOfferOutput, type Json,
} from "@rewards/shared";
import { withInput, type Ctx } from "../client.ts";

export function offersModule(ctx: Ctx) {
  return {
    listEligible: () => ctx.rpc("list_eligible_offers", {}, ListEligibleOffersOutput),

    listCategories: () => ctx.rpc("list_offer_categories", {}, ListOfferCategoriesOutput),

    upsert: (input: z.input<typeof UpsertOfferInput>) => withInput(UpsertOfferInput, input, (v) =>
      ctx.rpc("upsert_offer", { p_offer: v as Json }, UpsertOfferOutput)),

    setStatus: (input: z.input<typeof SetOfferStatusInput>) => withInput(SetOfferStatusInput, input, (v) =>
      ctx.rpc("set_offer_status", { p_offer_id: v.offerId, p_status: v.status }, SetOfferStatusOutput)),
  };
}
