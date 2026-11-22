// In-store identity checks, phone release and recovery codes (plan §7.3, §7.4).
import type { z } from "zod";
import {
  DecidePhoneReleaseInput, DecidePhoneReleaseOutput, IssueRecoveryCodeInput, IssueRecoveryCodeOutput,
  RecordIdentityCheckInput, RecordIdentityCheckOutput, RequestPhoneReleaseInput, RequestPhoneReleaseOutput,
} from "@rewards/shared";
import { withInput, type Ctx } from "../client.ts";

export function identityModule(ctx: Ctx) {
  return {
    recordCheck: (input: z.input<typeof RecordIdentityCheckInput>) => withInput(RecordIdentityCheckInput, input, (v) =>
      ctx.rpc("record_identity_check", {
        p_customer_id: v.customerId, p_business_id: v.businessId, p_evidence: v.evidence, p_result: v.result,
        p_note: v.note,
      }, RecordIdentityCheckOutput)),

    requestPhoneRelease: (input: z.input<typeof RequestPhoneReleaseInput>) =>
      withInput(RequestPhoneReleaseInput, input, (v) => ctx.rpc("request_phone_release", {
        p_phone_e164: v.phoneE164, p_business_id: v.businessId, p_reason: v.reason,
      }, RequestPhoneReleaseOutput)),

    decidePhoneRelease: (input: z.input<typeof DecidePhoneReleaseInput>) =>
      withInput(DecidePhoneReleaseInput, input, (v) => ctx.rpc("decide_phone_release", {
        p_request_id: v.requestId, p_approve: v.approve, p_note: v.note,
      }, DecidePhoneReleaseOutput)),

    issueRecoveryCode: (input: z.input<typeof IssueRecoveryCodeInput>) =>
      withInput(IssueRecoveryCodeInput, input, (v) => ctx.rpc("issue_recovery_code", {
        p_customer_id: v.customerId, p_channel: v.channel, p_business_id: v.businessId, p_reason: v.reason,
        p_evidence: v.evidence,
      }, IssueRecoveryCodeOutput)),
  };
}
