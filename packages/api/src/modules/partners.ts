// Partner businesses: public sign-up (partner-apply) and owner decisions (partner.manage).
// Approved partners manage offers through the offers module and redeem through claims.
import type { z } from "zod";
import {
  DecidePartnerInput, DecidePartnerOutput, ListPartnerApplicationsInput, ListPartnerApplicationsOutput,
  PartnerApplyInput, PartnerApplyOutput, RevokePartnerInput, RevokePartnerOutput,
} from "@rewards/shared";
import { withInput, type Ctx } from "../client.ts";

export function partnersModule(ctx: Ctx) {
  return {
    apply: (input: z.input<typeof PartnerApplyInput>) => withInput(PartnerApplyInput, input, (v) =>
      ctx.fn("partner-apply", v, PartnerApplyOutput)),

    listApplications: (input: z.input<typeof ListPartnerApplicationsInput> = {}) =>
      withInput(ListPartnerApplicationsInput, input, (v) =>
        ctx.rpc("list_partner_applications", v.status ? { p_status: v.status } : {}, ListPartnerApplicationsOutput)),

    decide: (input: z.input<typeof DecidePartnerInput>) => withInput(DecidePartnerInput, input, (v) =>
      ctx.rpc("decide_partner", { p_business_id: v.businessId, p_approve: v.approve, p_note: v.note || undefined },
        DecidePartnerOutput)),

    revoke: (input: z.input<typeof RevokePartnerInput>) => withInput(RevokePartnerInput, input, (v) =>
      ctx.rpc("revoke_partner", { p_business_id: v.businessId, p_note: v.note || undefined }, RevokePartnerOutput)),
  };
}
