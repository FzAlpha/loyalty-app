// Reports, CSV export and audit log viewer (plan §6). Range and row caps are server settings.
import { z } from "zod";
import { CustomerMasked, DateTime, Num, Uuid } from "./common.ts";

export const ReportRange = z.object({ businessId: Uuid.nullable(), from: DateTime, to: DateTime });
export const GroupBy = z.enum(["day", "month", "business", "offer", "executive"]);

export const ReportSummaryOutput = z.object({
  redemptions: Num,
  unique_customers: Num,
  bill_total: Num,
  active_offers: Num,
  // Only in the group-wide view (business_id = null).
  new_customers: Num.optional(),
  active_members: Num.optional(),
  pending_members: Num.optional(),
  business_id: Uuid.nullable(),
  from: DateTime,
  to: DateTime,
});

export const ReportRedemptionsInput = ReportRange.extend({ groupBy: GroupBy });
export const ReportRedemptionsOutput = z.array(z.object({
  bucket: z.string(), label: z.string().nullable(), redemptions: Num, unique_customers: Num, bill_total: Num.nullable(),
}));

export const ReportSignupsInput = z.object({ from: DateTime, to: DateTime });
export const ReportSignupsOutput = z.array(z.object({ month: z.string(), new_customers: Num, now_active_members: Num }));

export const ReportBirthdaysInput = z.object({ month: z.number().int().min(1).max(12) });
export const ReportBirthdaysOutput = z.array(z.object({ birth_day: Num, customer: CustomerMasked }));

export const ExportReport = z.enum(["redemptions", "redemptions_grouped"]);
export const ExportReportInput = ReportRange.extend({ report: ExportReport, groupBy: GroupBy.optional() });
export const ExportReportOutput = z.object({
  report: ExportReport, rows: z.number().int(), truncated: z.boolean(), csv: z.string(),
});

export const ListAuditLogsInput = z.object({
  action: z.string().optional(),
  actorId: Uuid.optional(),
  businessId: Uuid.optional(),
  entityId: Uuid.optional(),
  entityType: z.string().optional(),
  from: DateTime.optional(),
  to: DateTime.optional(),
  limit: z.number().int().positive().optional(),
  // Keyset paging: pass the last row's created_at and id.
  beforeAt: DateTime.optional(),
  beforeId: Uuid.optional(),
});
export const AuditLogRow = z.object({
  id: Uuid,
  action: z.string(),
  actor_id: Uuid.nullable(),
  actor_role: z.string().nullable(),
  business_id: Uuid.nullable(),
  entity_type: z.string(),
  entity_id: Uuid.nullable(),
  before: z.unknown(),
  after: z.unknown(),
  ip: z.unknown(),
  request_id: z.string().nullable(),
  created_at: DateTime,
});
export const ListAuditLogsOutput = z.array(AuditLogRow);
