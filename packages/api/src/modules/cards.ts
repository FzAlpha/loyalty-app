// Physical cards: link, scan, approve/reject, block/reissue, batches (plan §6).
import type { z } from "zod";
import {
  ApproveCardInput, ApproveCardOutput, BlockCardInput,
  CreateCardPassOutput, BlockCardOutput, CreateCardBatchInput, CreateCardBatchOutput,
  LinkCardInput, LinkCardOutput, ReissueCardInput, ReissueCardOutput, RejectCardInput, RejectCardOutput,
  ScanCardInput, ScanCardOutput,
} from "@rewards/shared";
import { withInput, type Ctx } from "../client.ts";

export function cardsModule(ctx: Ctx) {
  return {
    // Digital card QR (F1). Ask for a new one before expires_at; each call replaces the previous pass.
    createPass: () => ctx.rpc("create_card_pass", {}, CreateCardPassOutput),

    link: (input: z.input<typeof LinkCardInput>) => withInput(LinkCardInput, input, (v) =>
      ctx.rpc("link_card", { p_qr_payload: v.qrPayload }, LinkCardOutput)),

    scan: (input: z.input<typeof ScanCardInput>) => withInput(ScanCardInput, input, (v) =>
      ctx.rpc("scan_card", { p_qr_payload: v.qrPayload, p_business_id: v.businessId }, ScanCardOutput)),

    approve: (input: z.input<typeof ApproveCardInput>) => withInput(ApproveCardInput, input, (v) =>
      ctx.rpc("approve_card", {
        p_card_id: v.cardId, p_business_id: v.businessId, p_evidence: v.evidence, p_note: v.note,
      }, ApproveCardOutput)),

    reject: (input: z.input<typeof RejectCardInput>) => withInput(RejectCardInput, input, (v) =>
      ctx.rpc("reject_card", { p_card_id: v.cardId, p_business_id: v.businessId, p_reason: v.reason }, RejectCardOutput)),

    block: (input: z.input<typeof BlockCardInput>) => withInput(BlockCardInput, input, (v) =>
      ctx.rpc("block_card", { p_card_id: v.cardId, p_business_id: v.businessId, p_reason: v.reason }, BlockCardOutput)),

    reissue: (input: z.input<typeof ReissueCardInput>) => withInput(ReissueCardInput, input, (v) =>
      ctx.rpc("reissue_card", {
        p_old_card_id: v.oldCardId, p_new_qr_payload: v.newQrPayload, p_business_id: v.businessId, p_reason: v.reason,
      }, ReissueCardOutput)),

    // Through the card-batches Edge Function, which also returns the printable CSV.
    createBatch: (input: z.input<typeof CreateCardBatchInput>) => withInput(CreateCardBatchInput, input, (v) =>
      ctx.fn("card-batches", { label: v.label, quantity: v.quantity }, CreateCardBatchOutput)),
  };
}
