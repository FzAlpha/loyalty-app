// Customer account deletion (plan §6, retention §17.5).
import { z } from "zod";
import { DateTime, Uuid } from "./common.ts";

export const RequestAccountDeletionOutput = z.object({
  request_id: Uuid, status: z.literal("requested"), process_after: DateTime,
});
