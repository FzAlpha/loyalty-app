// Reports and CSV export (owner dashboard). Range limits and row caps are server settings.
import type { z } from "zod";
import {
  ExportReportInput, ExportReportOutput, ReportBirthdaysInput, ReportBirthdaysOutput, ReportRange,
  ReportRedemptionsInput, ReportRedemptionsOutput, ReportSignupsInput, ReportSignupsOutput, ReportSummaryOutput,
} from "@rewards/shared";
import { withInput, type Ctx } from "../client.ts";

// businessId null = group-wide. The generated contract types SQL arguments as non-null, so this
// cast only widens the TypeScript type; the report RPCs accept null.
const biz = (id: string | null) => id as string;

export function reportsModule(ctx: Ctx) {
  return {
    summary: (input: z.input<typeof ReportRange>) => withInput(ReportRange, input, (v) =>
      ctx.rpc("report_summary", { p_business_id: biz(v.businessId), p_from: v.from, p_to: v.to }, ReportSummaryOutput)),

    redemptions: (input: z.input<typeof ReportRedemptionsInput>) => withInput(ReportRedemptionsInput, input, (v) =>
      ctx.rpc("report_redemptions", {
        p_business_id: biz(v.businessId), p_from: v.from, p_to: v.to, p_group_by: v.groupBy,
      }, ReportRedemptionsOutput)),

    signups: (input: z.input<typeof ReportSignupsInput>) => withInput(ReportSignupsInput, input, (v) =>
      ctx.rpc("report_signups", { p_from: v.from, p_to: v.to }, ReportSignupsOutput)),

    birthdays: (input: z.input<typeof ReportBirthdaysInput>) => withInput(ReportBirthdaysInput, input, (v) =>
      ctx.rpc("report_birthdays", { p_month: v.month }, ReportBirthdaysOutput)),

    exportCsv: (input: z.input<typeof ExportReportInput>) => withInput(ExportReportInput, input, (v) =>
      ctx.fn("reports-export", {
        report: v.report, business_id: v.businessId, from: v.from, to: v.to, group_by: v.groupBy,
      }, ExportReportOutput)),
  };
}
