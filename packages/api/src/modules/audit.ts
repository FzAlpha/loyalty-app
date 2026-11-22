// Audit log viewer (owner). Keyset paging with beforeAt + beforeId.
import type { z } from "zod";
import { ListAuditLogsInput, ListAuditLogsOutput } from "@rewards/shared";
import { withInput, type Ctx } from "../client.ts";

export function auditModule(ctx: Ctx) {
  return {
    list: (input: z.input<typeof ListAuditLogsInput> = {}) => withInput(ListAuditLogsInput, input, (v) =>
      ctx.rpc("list_audit_logs", {
        p_action: v.action, p_actor_id: v.actorId, p_business_id: v.businessId, p_entity_id: v.entityId,
        p_entity_type: v.entityType, p_from: v.from, p_to: v.to, p_limit: v.limit, p_before_at: v.beforeAt,
        p_before_id: v.beforeId,
      }, ListAuditLogsOutput)),
  };
}
