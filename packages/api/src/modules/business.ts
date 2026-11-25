// Group companies list (public, F1) and business profile updates (owner).
import type { z } from "zod";
import { ListBusinessesOutput, UpdateBusinessInput, UpdateBusinessOutput, type Json } from "@rewards/shared";
import { withInput, type Ctx } from "../client.ts";

export function businessModule(ctx: Ctx) {
  return {
    list: () => ctx.rpc("list_businesses", {}, ListBusinessesOutput),

    update: (input: z.input<typeof UpdateBusinessInput>) => withInput(UpdateBusinessInput, input, (v) =>
      ctx.rpc("update_business", { p_business_id: v.businessId, p_patch: v.patch as Json }, UpdateBusinessOutput)),
  };
}
