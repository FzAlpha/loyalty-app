// Cards: link, scan, approve/reject, block/reissue, batches (plan §6).
import { z } from "zod";
import { CardStatus, CustomerMasked, DateTime, IdentityEvidence, Name, NonEmpty, QrPayload, Uuid } from "./common.ts";

export const LinkCardInput = z.object({ qrPayload: QrPayload });
export const LinkCardOutput = z.object({
  card_id: Uuid, card_number: z.string(), assignment_id: Uuid, status: z.literal("pending"),
});

export const ScanCardInput = z.object({ qrPayload: QrPayload, businessId: Uuid });
export const ScanCardOutput = z.object({
  card_id: Uuid,
  card_number: z.string(),
  status: CardStatus,
  customer: CustomerMasked.nullable(),
  pending_request: z.object({ assignment_id: Uuid, requested_at: DateTime }).nullable(),
});

export const ApproveCardInput = z.object({
  cardId: Uuid, businessId: Uuid, evidence: z.array(IdentityEvidence).min(1), note: z.string().optional(),
});
export const ApproveCardOutput = z.object({
  card_id: Uuid, assignment_id: Uuid, status: z.literal("active"), identity_check_id: Uuid,
});

export const RejectCardInput = z.object({ cardId: Uuid, businessId: Uuid, reason: NonEmpty });
export const RejectCardOutput = z.object({ card_id: Uuid, assignment_id: Uuid, status: z.literal("rejected") });

export const BlockCardInput = z.object({ cardId: Uuid, businessId: Uuid, reason: NonEmpty });
export const BlockCardOutput = z.object({ card_id: Uuid, status: z.literal("blocked"), customer_id: Uuid.nullable() });

export const ReissueCardInput = z.object({ oldCardId: Uuid, newQrPayload: QrPayload, businessId: Uuid, reason: NonEmpty });
export const ReissueCardOutput = z.object({
  old_card_id: Uuid, card_id: Uuid, card_number: z.string(), assignment_id: Uuid,
  status: z.enum(["pending", "active"]),
});

// card-batches Edge Function. The upper bound on quantity is a server setting.
export const CreateCardBatchInput = z.object({ label: Name, quantity: z.number().int().positive() });
export const CreateCardBatchOutput = z.object({
  count: z.number().int(),
  cards: z.array(z.object({ card_number: z.string(), qr_payload: z.string() })),
  csv: z.string(),
});
