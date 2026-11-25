// Customer account deletion (plan §6, retention §17.5).
import { z } from "zod";
import { AccountStatus, CardStatus, DateOnly, DateTime, MembershipStatus, Uuid } from "./common.ts";

export const RequestAccountDeletionOutput = z.object({
  request_id: Uuid, status: z.literal("requested"), process_after: DateTime,
});

// api.get_my_account (10_identity, F1). card = private.customer_card_summary, null without a card.
export const MyAccountOutput = z.object({
  full_name: z.string(),
  phone_e164: z.string(),
  date_of_birth: DateOnly.nullable(),
  membership_status: MembershipStatus,
  account_status: AccountStatus,
  identity_checked_at: DateTime.nullable(),
  member_since: DateTime,
  card: z.object({ card_number: z.string(), status: CardStatus }).nullable(),
});
