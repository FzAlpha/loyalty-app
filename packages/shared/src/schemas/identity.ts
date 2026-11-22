// Identity checks, phone release, recovery codes (plan §6, §7.3, §7.4).
import { z } from "zod";
import {
  DateTime, IdentityCheckResult, IdentityEvidence, NonEmpty, PhoneE164, PhoneReleaseStatus, RecoveryChannel, Uuid,
} from "./common.ts";

export const RecordIdentityCheckInput = z.object({
  customerId: Uuid,
  businessId: Uuid,
  evidence: z.array(IdentityEvidence).min(1),
  result: IdentityCheckResult,
  note: z.string().optional(),
});
export const RecordIdentityCheckOutput = Uuid;

export const RequestPhoneReleaseInput = z.object({ phoneE164: PhoneE164, businessId: Uuid, reason: NonEmpty });
export const RequestPhoneReleaseOutput = Uuid;

export const DecidePhoneReleaseInput = z.object({ requestId: Uuid, approve: z.boolean(), note: z.string().optional() });
export const DecidePhoneReleaseOutput = PhoneReleaseStatus;

export const IssueRecoveryCodeInput = z.object({
  customerId: Uuid,
  channel: RecoveryChannel,
  businessId: Uuid.optional(),
  reason: z.string().optional(),
  evidence: z.array(IdentityEvidence).optional(),
});
export const IssueRecoveryCodeOutput = z.object({ code: z.string().min(1), expires_at: DateTime });
