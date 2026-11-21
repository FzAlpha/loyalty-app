// Owner-only card batch creation (plan §6). The database generates the tokens, keeps only their
// hashes and checks card.batch.create for the caller; the plain QR payloads are returned once here.
import { z } from "npm:zod@3.23.8";
import { bearer, handle } from "../_shared/http/index.ts";
import { unwrap } from "../_shared/errors/index.ts";
import { userClient } from "../_shared/supabase/index.ts";

const Body = z.object({
  label: z.string().trim().min(1).max(200),
  quantity: z.number().int().positive(), // upper bound is the cards.batch_max_quantity setting
});

type Row = { card_number: string; qr_payload: string };

Deno.serve(handle(Body, async (b, req) => {
  const rows = unwrap(
    await userClient(bearer(req)).schema("api").rpc("create_card_batch", { p_label: b.label, p_quantity: b.quantity }),
  ) as Row[];
  const csv = ["card_number,qr_payload", ...rows.map((r) => `${r.card_number},${r.qr_payload}`)].join("\n");
  return { count: rows.length, cards: rows, csv };
}));
