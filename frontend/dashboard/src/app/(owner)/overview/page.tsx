// Totals (reports.summary) and redemptions grouped by day/month/business/offer/executive, with CSV export.
"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RangeFilter, useRangeState } from "@/components/filters";
import { Button, Card, ErrorBox, Loading, Notice, PageHeader, Select, Stat } from "@/components/ui";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { apiErrorOf, useRecheckAccess, useRedemptions, useSummary, type GroupBy } from "@/lib/queries";
import { strings } from "@/lib/strings";

const GROUPS: GroupBy[] = ["day", "month", "business", "offer", "executive"];
const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString());

function downloadCsv(csv: string, name: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Overview() {
  const state = useRangeState(30);
  const [groupBy, setGroupBy] = useState<GroupBy>("day");
  const summary = useSummary(state.range);
  const rows = useRedemptions(state.range, groupBy);
  const recheck = useRecheckAccess();
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);

  const exportCsv = async (report: "redemptions" | "redemptions_grouped") => {
    setExporting(report);
    setExportErr(null);
    setExportMsg(null);
    const r = await api.reports.exportCsv({ report, ...state.range, ...(report === "redemptions_grouped" ? { groupBy } : {}) });
    setExporting(null);
    if (r.error) {
      recheck(r.error);
      return setExportErr(errorMessage(r.error));
    }
    const suffix = report === "redemptions_grouped" ? `-by-${groupBy}` : "";
    downloadCsv(r.data.csv, `redemptions${suffix}-${state.fromDay}-to-${state.toDay}.csv`);
    if (r.data.truncated) setExportMsg(strings.reports.truncated(r.data.rows));
  };

  const s = summary.data;
  const data = (rows.data ?? []).map((r) => ({ ...r, name: r.label ?? r.bucket }));

  return (
    <div>
      <PageHeader title={strings.reports.title} subtitle={strings.reports.subtitle} />
      <RangeFilter state={state} />

      {summary.isPending ? <Loading /> : summary.isError ? (
        <ErrorBox message={errorMessage(apiErrorOf(summary.error))} onRetry={() => summary.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={strings.reports.redemptions} value={fmt(s?.redemptions)} />
            <Stat label={strings.reports.uniqueCustomers} value={fmt(s?.unique_customers)} />
            <Stat label={strings.reports.billTotal} value={fmt(s?.bill_total)} />
            <Stat label={strings.reports.activeOffers} value={fmt(s?.active_offers)} />
            {s?.new_customers !== undefined && <Stat label={strings.reports.newCustomers} value={fmt(s.new_customers)} />}
            {s?.active_members !== undefined && <Stat label={strings.reports.activeMembers} value={fmt(s.active_members)} />}
            {s?.pending_members !== undefined && <Stat label={strings.reports.pendingMembers} value={fmt(s.pending_members)} />}
          </div>
          {state.businessId && <p className="mt-2 text-xs text-muted">{strings.reports.groupOnly}</p>}
        </>
      )}

      <div className="mt-6">
        <Card
          title={`${strings.reports.byLabel} ${strings.reports.groupBy[groupBy].toLowerCase()}`}
          actions={
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-40">
                <Select label="" aria-label={strings.reports.byLabel} value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
                  {GROUPS.map((g) => <option key={g} value={g}>{strings.reports.groupBy[g]}</option>)}
                </Select>
              </div>
              <Button tone="plain" loading={exporting === "redemptions"} onClick={() => exportCsv("redemptions")}>
                {strings.reports.exportCsv}
              </Button>
              <Button tone="plain" loading={exporting === "redemptions_grouped"} onClick={() => exportCsv("redemptions_grouped")}>
                {strings.reports.exportGrouped}
              </Button>
            </div>
          }>
          {exportErr && <ErrorBox message={exportErr} />}
          {exportMsg && <Notice message={exportMsg} />}
          {rows.isPending ? <Loading /> : rows.isError ? (
            <ErrorBox message={errorMessage(apiErrorOf(rows.error))} onRetry={() => rows.refetch()} />
          ) : data.length === 0 ? (
            <p className="py-6 text-sm text-muted">{strings.common.none}</p>
          ) : (
            <>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                    <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" stroke="var(--color-muted)" fontSize={12} />
                    <YAxis stroke="var(--color-muted)" fontSize={12} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "var(--color-panel)", border: "1px solid var(--color-line)", color: "var(--color-fg)" }}
                      cursor={{ fill: "rgba(212,175,55,0.08)" }} />
                    <Bar dataKey="redemptions" name={strings.reports.redemptions} fill="var(--color-gold)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-muted">
                    <tr>
                      <th className="py-2 pr-4">{strings.reports.groupBy[groupBy]}</th>
                      <th className="py-2 pr-4 text-right">{strings.reports.redemptions}</th>
                      <th className="py-2 pr-4 text-right">{strings.reports.uniqueCustomers}</th>
                      <th className="py-2 text-right">{strings.reports.billTotal}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((r) => (
                      <tr key={r.bucket} className="border-t border-line">
                        <td className="py-2 pr-4">{r.name}</td>
                        <td className="py-2 pr-4 text-right">{fmt(r.redemptions)}</td>
                        <td className="py-2 pr-4 text-right">{fmt(r.unique_customers)}</td>
                        <td className="py-2 text-right">{fmt(r.bill_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
