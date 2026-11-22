// Building blocks. Only formats live here; business limits (password minimum, batch size, report
// range...) come from app_settings and are checked by the server.
import { z } from "zod";
import { Constants } from "../contracts.ts";

const E = Constants.public.Enums;

export const Uuid = z.string().uuid();
// Same pattern as the profiles.phone_e164 check and the Edge Functions' PhoneE164.
export const PhoneE164 = z.string().regex(/^\+[1-9][0-9]{6,14}$/);
// Upper bound only (bcrypt limit, same as the Edge Functions); the minimum is auth.password.min_length.
export const Password = z.string().min(1).max(72);
export const DateTime = z.string().datetime({ offset: true });
export const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const NonEmpty = z.string().trim().min(1);
export const Name = NonEmpty.max(200);
// The QR payload format is versioned and parsed by the server (plan §6.2), so only shape is checked.
export const QrPayload = NonEmpty;

export const AccountStatus = z.enum(E.account_status);
export const CardStatus = z.enum(E.card_status);
export const ClaimStatus = z.enum(E.claim_status);
export const DeletionStatus = z.enum(E.deletion_status);
export const IdentityCheckResult = z.enum(E.identity_check_result);
export const IdentityEvidence = z.enum(E.identity_evidence);
export const MembershipStatus = z.enum(E.membership_status);
export const OfferStatus = z.enum(E.offer_status);
export const PhoneReleaseStatus = z.enum(E.phone_release_status);
export const RecoveryChannel = z.enum(E.recovery_channel);

// Postgres numeric and bigint values arrive as JSON numbers.
export const Num = z.number();

// private.customer_masked (10_identity): no full phone number, ever.
export const CustomerMasked = z.object({
  customer_id: Uuid,
  full_name: z.string(),
  phone_masked: z.string().nullable(),
  identity_checked_at: DateTime.nullable(),
  membership_status: MembershipStatus,
});
