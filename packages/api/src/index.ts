// Typed client for every operation in BACKEND_PLAN.md §6. Apps call only this, never supabase.rpc
// directly (FRONTEND_PLAN §2). The caller creates the supabase client with the anon/publishable key.
import { makeCtx, type Client } from "./client.ts";
import { accountsModule } from "./modules/accounts.ts";
import { auditModule } from "./modules/audit.ts";
import { authModule } from "./modules/auth.ts";
import { businessModule } from "./modules/business.ts";
import { cardsModule } from "./modules/cards.ts";
import { claimsModule } from "./modules/claims.ts";
import { identityModule } from "./modules/identity.ts";
import { offersModule } from "./modules/offers.ts";
import { permissionsModule } from "./modules/permissions.ts";
import { reportsModule } from "./modules/reports.ts";
import { settingsModule } from "./modules/settings.ts";
import { staffModule } from "./modules/staff.ts";

export function createApi(supabase: Client) {
  const ctx = makeCtx(supabase);
  return {
    auth: authModule(ctx),
    identity: identityModule(ctx),
    cards: cardsModule(ctx),
    offers: offersModule(ctx),
    claims: claimsModule(ctx),
    business: businessModule(ctx),
    settings: settingsModule(ctx),
    staff: staffModule(ctx),
    reports: reportsModule(ctx),
    audit: auditModule(ctx),
    accounts: accountsModule(ctx),
    permissions: permissionsModule(ctx),
  };
}

export type Api = ReturnType<typeof createApi>;
export type { Client } from "./client.ts";
export { fromAuthError, fromFunction, fromPostgrest } from "./result.ts";
