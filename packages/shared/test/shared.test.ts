import { describe, expect, it } from "vitest";
import {
  BusinessPatch, CLIENT_ERROR_CODES, Constants, CustomerMasked, ERROR_CODES, IdentityEvidence, Password, PhoneE164,
  PreviewClaimOutput, RegisterInput, ScanCardOutput, UpsertOfferInput, isClientErrorCode, isServerErrorCode,
} from "../src/index.ts";

const uuid = "11111111-1111-4111-8111-111111111111";
const masked = {
  customer_id: uuid, full_name: "A", phone_masked: "******1234", identity_checked_at: null, membership_status: "pending",
};

describe("error codes", () => {
  it("recognises catalogue codes only", () => {
    expect(isServerErrorCode("VALIDATION_FAILED")).toBe(true);
    expect(isServerErrorCode("NETWORK_ERROR")).toBe(false);
    expect(isServerErrorCode("toString")).toBe(false);
    expect(isServerErrorCode(42)).toBe(false);
  });
  it("client-only codes never collide with the server catalogue", () => {
    for (const c of CLIENT_ERROR_CODES) {
      expect(isClientErrorCode(c)).toBe(true);
      expect(Object.keys(ERROR_CODES)).not.toContain(c);
    }
  });
});

describe("formats", () => {
  it("PhoneE164 matches the server pattern", () => {
    expect(PhoneE164.safeParse("+919800000001").success).toBe(true);
    for (const bad of ["919800000001", "+0123456789", "+12345", "+1234567890123456", "+91 98000"]) {
      expect(PhoneE164.safeParse(bad).success).toBe(false);
    }
  });
  it("Password has only the bcrypt upper bound (minimum is a server setting)", () => {
    expect(Password.safeParse("x").success).toBe(true);
    expect(Password.safeParse("").success).toBe(false);
    expect(Password.safeParse("x".repeat(73)).success).toBe(false);
  });
  it("enums come from the generated contract", () => {
    expect(IdentityEvidence.options).toEqual([...Constants.public.Enums.identity_evidence]);
  });
  it("RegisterInput needs a YYYY-MM-DD birth date", () => {
    const base = { phone: "+919800000001", password: "pw", fullName: "A" };
    expect(RegisterInput.safeParse({ ...base, dateOfBirth: "1990-01-31" }).success).toBe(true);
    expect(RegisterInput.safeParse({ ...base, dateOfBirth: "31/01/1990" }).success).toBe(false);
  });
});

describe("response schemas", () => {
  it("masked customer has no full phone field", () => {
    expect(CustomerMasked.safeParse(masked).success).toBe(true);
    expect(Object.keys(CustomerMasked.shape)).not.toContain("phone_e164");
  });
  it("scan_card with and without a customer", () => {
    const base = { card_id: uuid, card_number: "C-1", status: "unassigned", pending_request: null };
    expect(ScanCardOutput.safeParse({ ...base, customer: null }).success).toBe(true);
    expect(ScanCardOutput.safeParse({ ...base, customer: masked }).success).toBe(true);
    expect(ScanCardOutput.safeParse({ ...base, status: "lost", customer: null }).success).toBe(false);
  });
  it("preview_claim WRONG_BUSINESS shape carries no customer", () => {
    expect(PreviewClaimOutput.safeParse({ claim_id: uuid, flags: ["WRONG_BUSINESS"] }).success).toBe(true);
  });
  it("timestamps with microseconds and an offset parse", () => {
    const r = ScanCardOutput.safeParse({
      card_id: uuid, card_number: "C-1", status: "pending", customer: masked,
      pending_request: { assignment_id: uuid, requested_at: "2026-11-22T10:00:00.123456+00:00" },
    });
    expect(r.success).toBe(true);
  });
});

describe("input schemas", () => {
  it("BusinessPatch rejects unknown keys (slug is immutable) and empty patches", () => {
    expect(BusinessPatch.safeParse({ name: "X" }).success).toBe(true);
    expect(BusinessPatch.safeParse({ slug: "x" }).success).toBe(false);
    expect(BusinessPatch.safeParse({}).success).toBe(false);
  });
  it("UpsertOfferInput rejects keys upsert_offer does not read", () => {
    expect(UpsertOfferInput.safeParse({ business_id: uuid, title: "T" }).success).toBe(true);
    expect(UpsertOfferInput.safeParse({ business_id: uuid, title: "T", status: "active" }).success).toBe(false);
  });
});
