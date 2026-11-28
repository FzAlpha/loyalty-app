// Customer account deletion (plan §6, retention §17.5).
import { z } from "zod";
import { AccountStatus, CardStatus, DateOnly, DateTime, MembershipStatus, Uuid } from "./common.ts";

export const RequestAccountDeletionOutput = z.object({
  request_id: Uuid, status: z.literal("requested"), process_after: DateTime,
});

// Profile photo (plan §10, 2026-11-28): private bucket, path null = no photo; shown via a signed URL.
export const AvatarInfo = z.object({
  bucket: z.string(),
  path: z.string().nullable(),
  url_ttl_seconds: z.number().int().positive(),
  max_bytes: z.number().int().positive(),
});
export type AvatarInfo = z.infer<typeof AvatarInfo>;

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
  avatar: AvatarInfo,
});

// api.set_my_avatar / api.clear_my_avatar: previous_path is the file the app should now remove.
export const SetAvatarOutput = z.object({ avatar: AvatarInfo, previous_path: z.string().nullable() });
