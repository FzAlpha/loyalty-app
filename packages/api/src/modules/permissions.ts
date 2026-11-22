// Permission checks for showing or hiding UI. The server still checks every call.
import { z } from "zod";
import { NonEmpty, Uuid } from "@rewards/shared";
import { withInput, type Ctx } from "../client.ts";

const HasInput = z.object({ permission: NonEmpty, businessId: Uuid.optional() });
const HasAnyInput = z.object({ permission: NonEmpty });

export function permissionsModule(ctx: Ctx) {
  return {
    has: (input: z.input<typeof HasInput>) => withInput(HasInput, input, (v) =>
      ctx.rpc("has_permission", { p_permission: v.permission, p_business_id: v.businessId }, z.boolean())),

    hasAny: (input: z.input<typeof HasAnyInput>) => withInput(HasAnyInput, input, (v) =>
      ctx.rpc("has_any_permission", { p_permission: v.permission }, z.boolean())),
  };
}
