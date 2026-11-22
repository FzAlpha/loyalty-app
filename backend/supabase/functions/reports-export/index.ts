// CSV export of reports (plan §5 reports-export). Runs the report RPCs as the caller, so
// report.view, scope and range checks all happen in the database. The CSV is returned inside the
// usual { data } envelope (not streamed); size is capped by the report.export_max_rows setting.
import { z } from "npm:zod@3.23.8";
import { bearer, handle } from "../_shared/http/index.ts";
import { unwrap } from "../_shared/errors/index.ts";
import { userClient } from "../_shared/supabase/index.ts";

const Body = z.object({
  report: z.enum(["redemptions", "redemptions_grouped"]),
  business_id: z.string().uuid().nullable().default(null),
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  group_by: z.enum(["day", "month", "business", "offer", "executive"]).optional(),
});

// Quote every field; prefix spreadsheet formula starters so a cell is never evaluated.
function cell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replaceAll('"', '""')}"`;
}
function toCsv(cols: string[], rows: Record<string, unknown>[]): string {
  return [cols.map(cell).join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
}

Deno.serve(handle(Body, async (b, req) => {
  const db = userClient(bearer(req)).schema("api");
  const base = { p_business_id: b.business_id, p_from: b.from, p_to: b.to };

  if (b.report === "redemptions_grouped") {
    const rows = unwrap(
      await db.rpc("report_redemptions", { ...base, p_group_by: b.group_by ?? "day" }),
    ) as Record<string, unknown>[];
    const cols = ["bucket", "label", "redemptions", "unique_customers", "bill_total"];
    return { report: b.report, rows: rows.length, truncated: false, csv: toCsv(cols, rows) };
  }

  const all = unwrap(await db.rpc("report_redemption_rows", base)) as Record<string, unknown>[];
  const max = Number(unwrap(await db.rpc("report_export_max_rows")));
  const rows = all.slice(0, max);
  const cols = ["redeemed_at", "business", "offer", "executive", "customer_name", "phone_masked",
                "card_number", "bill_number", "bill_amount", "redemption_id"];
  return { report: b.report, rows: rows.length, truncated: all.length > max, csv: toCsv(cols, rows) };
}));
