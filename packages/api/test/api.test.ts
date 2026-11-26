import { describe, expect, it } from "vitest";
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { createApi } from "../src/index.ts";
import { fake, ok, pgError } from "./fake.ts";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const TS = "2026-11-22T10:00:00.123456+00:00";
const masked = { customer_id: U1, full_name: "A", phone_masked: null, identity_checked_at: null, membership_status: "none" };

const httpError = (status: number, body: unknown) =>
  new FunctionsHttpError(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

describe("rpc error mapping", () => {
  it("PT<status> with a catalogue message becomes that code with detail", async () => {
    const { client } = fake({ rpc: () => pgError(409, "PT409", "CARD_ALREADY_LINKED", "card") });
    const r = await createApi(client).cards.link({ qrPayload: "v1.abc" });
    expect(r).toEqual({ error: { code: "CARD_ALREADY_LINKED", detail: "card" } });
  });
  it("no detail is left out rather than sent as null", async () => {
    const { client } = fake({ rpc: () => pgError(401, "PT401", "UNAUTHENTICATED") });
    expect(await createApi(client).offers.listEligible()).toEqual({ error: { code: "UNAUTHENTICATED" } });
  });
  it("status 0 (fetch failed) is NETWORK_ERROR", async () => {
    const { client } = fake({ rpc: () => pgError(0, "", "TypeError: fetch failed", "stack") });
    expect((await createApi(client).offers.listEligible()).error?.code).toBe("NETWORK_ERROR");
  });
  it("non-catalogue errors are UNKNOWN_ERROR_CODE with the SQLSTATE", async () => {
    const { client } = fake({ rpc: () => pgError(404, "PGRST202", "Could not find the function") });
    expect(await createApi(client).offers.listEligible())
      .toEqual({ error: { code: "UNKNOWN_ERROR_CODE", detail: "PGRST202: Could not find the function" } });
  });
  it("a thrown client error is NETWORK_ERROR", async () => {
    const { client } = fake({ rpc: () => { throw new TypeError("offline"); } });
    expect((await createApi(client).offers.listEligible()).error?.code).toBe("NETWORK_ERROR");
  });
  it("an unexpected response shape is INVALID_RESPONSE", async () => {
    const { client } = fake({ rpc: () => ok({ card_id: "nope" }) });
    const r = await createApi(client).cards.link({ qrPayload: "v1.abc" });
    expect(r.error?.code).toBe("INVALID_RESPONSE");
  });
});

describe("input validation", () => {
  it("bad input fails with VALIDATION_FAILED and makes no call", async () => {
    const { client, calls } = fake();
    const r = await createApi(client).cards.approve({ cardId: "x", businessId: U2, evidence: [] });
    expect(r).toEqual({ error: { code: "VALIDATION_FAILED", detail: "cardId,evidence" } });
    expect(calls).toEqual([]);
  });
});

describe("edge function mapping", () => {
  it("unwraps the { data } envelope", async () => {
    const { client, calls } = fake({ fn: () => ({ data: { data: { user_id: U1 } }, error: null }) });
    const r = await createApi(client).auth.register({
      phone: "+919800000001", password: "pw", fullName: "A", dateOfBirth: "1990-01-31",
    });
    expect(r).toEqual({ data: { user_id: U1 } });
    expect(calls[0]).toEqual({
      kind: "fn", name: "auth-register",
      args: { phone: "+919800000001", password: "pw", full_name: "A", date_of_birth: "1990-01-31" },
    });
  });
  it("catalogue error bodies keep code and detail", async () => {
    const { client } = fake({
      fn: () => ({ data: null, error: httpError(423, { error: { code: "ACCOUNT_LOCKED", detail: TS } }) }),
    });
    expect(await createApi(client).auth.signIn({ phone: "+919800000001", password: "pw" }))
      .toEqual({ error: { code: "ACCOUNT_LOCKED", detail: TS } });
  });
  it("other bodies report the HTTP status", async () => {
    const { client } = fake({ fn: () => ({ data: null, error: httpError(401, { msg: "Invalid JWT" }) }) });
    expect(await createApi(client).accounts.requestDeletion())
      .toEqual({ error: { code: "UNKNOWN_ERROR_CODE", detail: "http_401" } });
  });
  it("fetch and relay failures", async () => {
    const f1 = fake({ fn: () => ({ data: null, error: new FunctionsFetchError(new TypeError("x")) }) });
    expect((await createApi(f1.client).accounts.requestDeletion()).error?.code).toBe("NETWORK_ERROR");
    const f2 = fake({ fn: () => ({ data: null, error: new FunctionsRelayError({}) }) });
    expect(await createApi(f2.client).accounts.requestDeletion())
      .toEqual({ error: { code: "UNKNOWN_ERROR_CODE", detail: "relay_error" } });
  });
  it("a 2xx body without the envelope is INVALID_RESPONSE", async () => {
    const { client } = fake({ fn: () => ({ data: "plain text", error: null }) });
    expect((await createApi(client).accounts.requestDeletion()).error?.code).toBe("INVALID_RESPONSE");
  });
});

describe("auth session", () => {
  const signedIn = { access_token: "at", refresh_token: "rt", expires_at: 1, user_id: U1 };
  it("signIn stores the returned session", async () => {
    const { client, calls } = fake({ fn: () => ({ data: { data: signedIn }, error: null }) });
    expect(await createApi(client).auth.signIn({ phone: "+919800000001", password: "pw" })).toEqual({ data: { userId: U1 } });
    expect(calls[1]).toEqual({ kind: "auth", name: "setSession", args: { access_token: "at", refresh_token: "rt" } });
  });
  it("setSession network failure is NETWORK_ERROR", async () => {
    const { client } = fake({
      fn: () => ({ data: { data: signedIn }, error: null }),
      auth: { setSession: () => ({ error: { name: "AuthRetryableFetchError", message: "x", status: 0 } }) },
    });
    expect((await createApi(client).auth.signIn({ phone: "+919800000001", password: "pw" })).error?.code).toBe("NETWORK_ERROR");
  });
  it("weak password on change maps like auth-register", async () => {
    const { client } = fake({ auth: { updateUser: () => ({ error: { name: "AuthApiError", message: "weak", status: 422, code: "weak_password" } }) } });
    expect(await createApi(client).auth.changePassword({ newPassword: "a" }))
      .toEqual({ error: { code: "VALIDATION_FAILED", detail: "password" } });
  });
});

// Every operation is wired to the right RPC / Edge Function with the right argument names.
type Case = { call: (api: ReturnType<typeof createApi>) => Promise<{ data?: unknown; error?: unknown }>;
  kind: "rpc" | "fn"; name: string; args: unknown; reply: unknown };
const cases: Record<string, Case> = {
  "auth.recover": { call: (a) => a.auth.recover({ phone: "+919800000001", code: "1234", newPassword: "pw" }),
    kind: "fn", name: "auth-recover", args: { phone: "+919800000001", code: "1234", new_password: "pw" },
    reply: { recovered: true } },
  "auth.staffPasswordChanged": { call: (a) => a.auth.staffPasswordChanged(), kind: "rpc", name: "staff_password_changed",
    args: {}, reply: null },
  "identity.recordCheck": { call: (a) => a.identity.recordCheck({ customerId: U1, businessId: U2,
    evidence: ["account_info"], result: "passed" }), kind: "rpc", name: "record_identity_check",
    args: { p_customer_id: U1, p_business_id: U2, p_evidence: ["account_info"], p_result: "passed", p_note: undefined },
    reply: U1 },
  "identity.requestPhoneRelease": { call: (a) => a.identity.requestPhoneRelease({ phoneE164: "+919800000001",
    businessId: U2, reason: "r" }), kind: "rpc", name: "request_phone_release",
    args: { p_phone_e164: "+919800000001", p_business_id: U2, p_reason: "r" }, reply: U1 },
  "identity.decidePhoneRelease": { call: (a) => a.identity.decidePhoneRelease({ requestId: U1, approve: true }),
    kind: "rpc", name: "decide_phone_release", args: { p_request_id: U1, p_approve: true, p_note: undefined },
    reply: "approved" },
  "identity.issueRecoveryCode": { call: (a) => a.identity.issueRecoveryCode({ customerId: U1, channel: "in_store",
    businessId: U2 }), kind: "rpc", name: "issue_recovery_code", args: { p_customer_id: U1, p_channel: "in_store",
    p_business_id: U2, p_reason: undefined, p_evidence: undefined }, reply: { code: "123456", expires_at: TS } },
  "cards.scan": { call: (a) => a.cards.scan({ qrPayload: "v1.x", businessId: U2 }), kind: "rpc", name: "scan_card",
    args: { p_qr_payload: "v1.x", p_business_id: U2 },
    reply: { card_id: U1, card_number: "C-1", status: "pending", customer: masked,
      pending_request: { assignment_id: U2, requested_at: TS } } },
  "cards.approve": { call: (a) => a.cards.approve({ cardId: U1, businessId: U2, evidence: ["registration_details"],
    note: "n" }), kind: "rpc", name: "approve_card",
    args: { p_card_id: U1, p_business_id: U2, p_evidence: ["registration_details"], p_note: "n" },
    reply: { card_id: U1, assignment_id: U2, status: "active", identity_check_id: U1 } },
  "cards.reject": { call: (a) => a.cards.reject({ cardId: U1, businessId: U2, reason: "r" }), kind: "rpc",
    name: "reject_card", args: { p_card_id: U1, p_business_id: U2, p_reason: "r" },
    reply: { card_id: U1, assignment_id: U2, status: "rejected" } },
  "cards.block": { call: (a) => a.cards.block({ cardId: U1, businessId: U2, reason: "lost" }), kind: "rpc",
    name: "block_card", args: { p_card_id: U1, p_business_id: U2, p_reason: "lost" },
    reply: { card_id: U1, status: "blocked", customer_id: null } },
  "cards.reissue": { call: (a) => a.cards.reissue({ oldCardId: U1, newQrPayload: "v1.y", businessId: U2, reason: "r" }),
    kind: "rpc", name: "reissue_card",
    args: { p_old_card_id: U1, p_new_qr_payload: "v1.y", p_business_id: U2, p_reason: "r" },
    reply: { old_card_id: U1, card_id: U2, card_number: "C-2", assignment_id: U1, status: "active" } },
  "cards.createBatch": { call: (a) => a.cards.createBatch({ label: "b", quantity: 2 }), kind: "fn", name: "card-batches",
    args: { label: "b", quantity: 2 }, reply: { count: 0, cards: [], csv: "" } },
  "offers.upsert": { call: (a) => a.offers.upsert({ business_id: U2, title: "T", group_ids: [U1] }), kind: "rpc",
    name: "upsert_offer", args: { p_offer: { business_id: U2, title: "T", group_ids: [U1] } },
    reply: { offer_id: U1, status: "draft" } },
  "offers.setStatus": { call: (a) => a.offers.setStatus({ offerId: U1, status: "active" }), kind: "rpc",
    name: "set_offer_status", args: { p_offer_id: U1, p_status: "active" }, reply: { offer_id: U1, status: "active" } },
  "claims.create": { call: (a) => a.claims.create({ offerId: U1 }), kind: "rpc", name: "create_claim_token",
    args: { p_offer_id: U1 }, reply: { claim_id: U2, qr_payload: "c1.x", expires_at: TS } },
  "claims.preview": { call: (a) => a.claims.preview({ qrPayload: "c1.x" }), kind: "rpc", name: "preview_claim",
    args: { p_qr_payload: "c1.x" }, reply: { claim_id: U2, flags: ["WRONG_BUSINESS"] } },
  "claims.redeem": { call: (a) => a.claims.redeem({ qrPayload: "c1.x", idempotencyKey: "k1", billAmount: 120.5 }),
    kind: "rpc", name: "redeem_claim",
    args: { p_qr_payload: "c1.x", p_idempotency_key: "k1", p_bill_number: undefined, p_bill_amount: 120.5 },
    reply: { redemption_id: U1, claim_id: U2, offer_id: U1, customer_id: U2, card_id: U1, business_id: U2,
      executive_id: U1, bill_number: null, bill_amount: 120.5, redeemed_at: TS, replayed: false } },
  "business.update": { call: (a) => a.business.update({ businessId: U2, patch: { name: "N" } }), kind: "rpc",
    name: "update_business", args: { p_business_id: U2, p_patch: { name: "N" } },
    reply: { id: U2, slug: "s", name: "N", timezone: "UTC" } },
  "settings.set": { call: (a) => a.settings.set({ key: "claims.ttl_seconds", value: 600 }), kind: "rpc",
    name: "set_setting", args: { p_key: "claims.ttl_seconds", p_value: 600, p_business_id: undefined },
    reply: { key: "claims.ttl_seconds", business_id: null, value: 600, updated_at: TS } },
  "staff.create": { call: (a) => a.staff.create({ phone: "+919800000002", tempPassword: "t", displayName: "E",
    role: "executive", businessId: U2 }), kind: "fn", name: "staff-admin",
    args: { action: "create", phone: "+919800000002", temp_password: "t", display_name: "E", role: "executive",
      business_id: U2 }, reply: { user_id: U1 } },
  "staff.reassign": { call: (a) => a.staff.reassign({ userId: U1, role: "owner", businessId: null, displayName: "O" }),
    kind: "fn", name: "staff-admin",
    args: { action: "reassign", user_id: U1, role: "owner", business_id: null, display_name: "O" }, reply: { user_id: U1 } },
  "staff.enable": { call: (a) => a.staff.enable({ userId: U1 }), kind: "fn", name: "staff-admin",
    args: { action: "enable", user_id: U1 }, reply: { user_id: U1 } },
  "staff.disable": { call: (a) => a.staff.disable({ userId: U1 }), kind: "fn", name: "staff-admin",
    args: { action: "disable", user_id: U1 }, reply: { user_id: U1 } },
  "staff.resetPassword": { call: (a) => a.staff.resetPassword({ userId: U1, tempPassword: "t" }), kind: "fn",
    name: "staff-admin", args: { action: "reset_password", user_id: U1, temp_password: "t" }, reply: { user_id: U1 } },
  "reports.summary": { call: (a) => a.reports.summary({ businessId: null, from: TS, to: TS }), kind: "rpc",
    name: "report_summary", args: { p_business_id: null, p_from: TS, p_to: TS },
    reply: { redemptions: 1, unique_customers: 1, bill_total: 0, active_offers: 2, new_customers: 3, active_members: 1,
      pending_members: 0, business_id: null, from: TS, to: TS } },
  "reports.redemptions": { call: (a) => a.reports.redemptions({ businessId: U2, from: TS, to: TS, groupBy: "day" }),
    kind: "rpc", name: "report_redemptions", args: { p_business_id: U2, p_from: TS, p_to: TS, p_group_by: "day" },
    reply: [{ bucket: "2026-11-22", label: null, redemptions: 1, unique_customers: 1, bill_total: 10 }] },
  "reports.signups": { call: (a) => a.reports.signups({ from: TS, to: TS }), kind: "rpc", name: "report_signups",
    args: { p_from: TS, p_to: TS }, reply: [{ month: "2026-11-01", new_customers: 2, now_active_members: 1 }] },
  "reports.birthdays": { call: (a) => a.reports.birthdays({ month: 11 }), kind: "rpc", name: "report_birthdays",
    args: { p_month: 11 }, reply: [{ birth_day: 22, customer: masked }] },
  "reports.exportCsv": { call: (a) => a.reports.exportCsv({ report: "redemptions", businessId: null, from: TS, to: TS }),
    kind: "fn", name: "reports-export",
    args: { report: "redemptions", business_id: null, from: TS, to: TS, group_by: undefined },
    reply: { report: "redemptions", rows: 0, truncated: false, csv: "" } },
  "audit.list": { call: (a) => a.audit.list({ limit: 50, beforeAt: TS, beforeId: U1 }), kind: "rpc", name: "list_audit_logs",
    args: { p_action: undefined, p_actor_id: undefined, p_business_id: undefined, p_entity_id: undefined,
      p_entity_type: undefined, p_from: undefined, p_to: undefined, p_limit: 50, p_before_at: TS, p_before_id: U1 },
    reply: [{ id: U1, action: "card.approved", actor_id: U2, actor_role: "executive", business_id: U2,
      entity_type: "card", entity_id: U1, before: null, after: {}, ip: null, request_id: null, created_at: TS }] },
  "accounts.requestDeletion": { call: (a) => a.accounts.requestDeletion(), kind: "fn", name: "account-deletion", args: {},
    reply: { request_id: U1, status: "requested", process_after: TS } },
  "permissions.has": { call: (a) => a.permissions.has({ permission: "cards.approve", businessId: U2 }), kind: "rpc",
    name: "has_permission", args: { p_permission: "cards.approve", p_business_id: U2 }, reply: true },
  "permissions.hasAny": { call: (a) => a.permissions.hasAny({ permission: "reports.view" }), kind: "rpc",
    name: "has_any_permission", args: { p_permission: "reports.view" }, reply: false },
  "cards.createPass": { call: (a) => a.cards.createPass(), kind: "rpc", name: "create_card_pass", args: {},
    reply: { qr_payload: "p1.x", expires_at: TS, card_number: "C-1", card_status: "active" } },
  "offers.listCategories": { call: (a) => a.offers.listCategories(), kind: "rpc", name: "list_offer_categories",
    args: {}, reply: [] },
  "partners.listOffers": { call: (a) => a.partners.listOffers(), kind: "rpc", name: "list_partner_offers", args: {},
    reply: [] },
  "partners.upsert": { call: (a) => a.partners.upsert({ name: "P" }), kind: "rpc", name: "upsert_partner",
    args: { p_partner: { name: "P" } }, reply: { partner_id: U1, is_active: true } },
  "partners.upsertOffer": { call: (a) => a.partners.upsertOffer({ partner_id: U1, title: "T" }), kind: "rpc",
    name: "upsert_partner_offer", args: { p_offer: { partner_id: U1, title: "T" } },
    reply: { partner_offer_id: U2, status: "draft" } },
  "partners.setOfferStatus": { call: (a) => a.partners.setOfferStatus({ offerId: U2, status: "active" }), kind: "rpc",
    name: "set_partner_offer_status", args: { p_offer_id: U2, p_status: "active" },
    reply: { partner_offer_id: U2, status: "active" } },
  "claims.listMine": { call: (a) => a.claims.listMine({ before: TS, limit: 20 }), kind: "rpc",
    name: "list_my_redemptions", args: { p_before: TS, p_limit: 20 }, reply: [] },
  "claims.listMineToday": { call: (a) => a.claims.listMineToday({ businessId: U2 }), kind: "rpc",
    name: "list_my_redemptions_today", args: { p_business_id: U2, p_before: undefined, p_limit: undefined }, reply: [] },
  "business.list": { call: (a) => a.business.list(), kind: "rpc", name: "list_businesses", args: {}, reply: [] },
  "business.listManaged": { call: (a) => a.business.listManaged(), kind: "rpc", name: "list_managed_businesses",
    args: {}, reply: [] },
  "business.create": { call: (a) => a.business.create({ name: "N", timezone: null }), kind: "rpc",
    name: "create_business", args: { p_business: { name: "N", timezone: null } },
    reply: { id: U2, slug: "n", name: "N", is_active: true } },
  "staff.me": { call: (a) => a.staff.me(), kind: "rpc", name: "get_my_staff", args: {},
    reply: { user_id: U1, display_name: "E", role: "executive", business_id: U2, business_name: "B", is_active: true,
      must_change_password: false } },
  "accounts.me": { call: (a) => a.accounts.me(), kind: "rpc", name: "get_my_account", args: {},
    reply: { full_name: "A", phone_e164: "+919800000001", date_of_birth: null, membership_status: "active",
      account_status: "active", identity_checked_at: null, member_since: TS, card: null } },
};

describe("business.remove (row delete, then Storage clean-up)", () => {
  const rpc = () => ok({ asset_bucket: "business-assets", asset_prefix: U2 });
  it("removes every file under the business folder, including subfolders", async () => {
    const { client, calls } = fake({
      rpc,
      storage: {
        list: (dir) => dir === U2
          ? { data: [{ id: "f1", name: "logo.png" }, { id: null, name: "old" }], error: null }
          : { data: [{ id: "f2", name: "a.png" }], error: null },
      },
    });
    expect(await createApi(client).business.remove({ businessId: U2 })).toEqual({ data: { filesLeft: false } });
    expect(calls[0]).toMatchObject({ kind: "rpc", name: "delete_business", args: { p_business_id: U2 } });
    expect(calls.at(-1)).toEqual({ kind: "storage", name: "remove",
      args: { bucket: "business-assets", paths: [`${U2}/logo.png`, `${U2}/old/a.png`] } });
  });
  it("an empty folder needs no remove call", async () => {
    const { client, calls } = fake({ rpc });
    expect(await createApi(client).business.remove({ businessId: U2 })).toEqual({ data: { filesLeft: false } });
    expect(calls.filter((c) => c.name === "remove")).toEqual([]);
  });
  it("a Storage failure still reports the delete, with filesLeft", async () => {
    const f1 = fake({ rpc, storage: { list: () => ({ data: null, error: { message: "x" } }) } });
    expect(await createApi(f1.client).business.remove({ businessId: U2 })).toEqual({ data: { filesLeft: true } });
    const f2 = fake({
      rpc,
      storage: { list: () => ({ data: [{ id: "f1", name: "logo.png" }], error: null }), remove: () => ({ error: { message: "x" } }) },
    });
    expect(await createApi(f2.client).business.remove({ businessId: U2 })).toEqual({ data: { filesLeft: true } });
  });
  it("a refused delete touches no files", async () => {
    const { client, calls } = fake({ rpc: () => pgError(409, "PT409", "BUSINESS_IN_USE") });
    expect(await createApi(client).business.remove({ businessId: U2 })).toEqual({ error: { code: "BUSINESS_IN_USE" } });
    expect(calls).toHaveLength(1);
  });
});

describe("operation wiring", () => {
  for (const [label, c] of Object.entries(cases)) {
    it(label, async () => {
      const { client, calls } = fake({
        rpc: () => ok(c.reply),
        fn: () => ({ data: { data: c.reply }, error: null }),
      });
      const r = await c.call(createApi(client));
      expect(r.error).toBeUndefined();
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ kind: c.kind, name: c.name, args: c.args });
      if (c.kind === "rpc") expect(calls[0]?.schema).toBe("api");
    });
  }

  it("every api function has a wiring case or a dedicated test", () => {
    const api = createApi(fake().client) as unknown as Record<string, Record<string, unknown>>;
    const all = Object.entries(api).flatMap(([m, fns]) => Object.keys(fns).map((f) => `${m}.${f}`));
    const covered = new Set([...Object.keys(cases), "auth.register", "auth.signIn", "auth.changePassword",
      "auth.signOut", "cards.link", "offers.listEligible", "business.remove"]);
    expect(all.filter((n) => !covered.has(n))).toEqual([]);
  });
});
