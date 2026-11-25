// Customer account: profile view (F1) and self-service deletion (plan §17.5, spec §12 #10).
import { MyAccountOutput, RequestAccountDeletionOutput } from "@rewards/shared";
import type { Ctx } from "../client.ts";

export function accountsModule(ctx: Ctx) {
  return {
    me: () => ctx.rpc("get_my_account", {}, MyAccountOutput),

    requestDeletion: () => ctx.fn("account-deletion", {}, RequestAccountDeletionOutput),
  };
}
