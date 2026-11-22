// Business profile updates (owner).
import type { z } from "zod";
import { UpdateBusinessInput, UpdateBusinessOutput, type Json } from "@rewards/shared";
import { withInput, type Ctx } from "../client.ts";

export function businessModule(ctx: Ctx) {
  return {
    update: (input: z.input<typeof UpdateBusinessInput>) => withInput(UpdateBusinessInput, input, (v) =>
      ctx.rpc("update_business", { p_business_id: v.businessId, p_patch: v.patch as Json }, UpdateBusinessOutput)),
  };
}
