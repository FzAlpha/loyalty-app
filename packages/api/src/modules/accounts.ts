// Customer self-service account deletion (plan §17.5, spec §12 #10).
import { RequestAccountDeletionOutput } from "@rewards/shared";
import type { Ctx } from "../client.ts";

export function accountsModule(ctx: Ctx) {
  return {
    requestDeletion: () => ctx.fn("account-deletion", {}, RequestAccountDeletionOutput),
  };
}
