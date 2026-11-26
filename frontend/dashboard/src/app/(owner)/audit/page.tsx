// Audit log viewer (api.list_audit_logs), newest first, keyset paging ("Load more").
"use client";
import { Fragment, useState, type FormEvent } from "react";
import { Button, ErrorBox, Field, Loading, PageHeader, Select } from "@/components/ui";
import { endExclusiveIso, fmtDateTime, startOfDayIso } from "@/lib/dates";
import { errorMessage } from "@/lib/errors";
import { apiErrorOf, useAudit, useManagedBusinesses, type AuditFilter } from "@/lib/queries";
import { strings } from "@/lib/strings";

const s = strings.audit;
const short = (id: string | null) => (id ? `${id.slice(0, 8)}…` : "—");

export default function Audit() {
  const businesses = useManagedBusinesses();
  const [draft, setDraft] = useState({ action: "", entityType: "", businessId: "", fromDay: "", toDay: "" });
  const [filter, setFilter] = useState<AuditFilter>({});
  const [open, setOpen] = useState<string | null>(null);
  const audit = useAudit(filter);
  const names = new Map((businesses.data ?? []).map((b) => [b.id, b.name]));

  const apply = (e: FormEvent) => {
    e.preventDefault();
    const f: AuditFilter = {};
    if (draft.action.trim()) f.action = draft.action.trim();
    if (draft.entityType.trim()) f.entityType = draft.entityType.trim();
    if (draft.businessId) f.businessId = draft.businessId;
    if (draft.fromDay) f.from = startOfDayIso(draft.fromDay);
    if (draft.toDay) f.to = endExclusiveIso(draft.toDay);
    setFilter(f);
  };
  const clear = () => {
    setDraft({ action: "", entityType: "", businessId: "", fromDay: "", toDay: "" });
    setFilter({});
  };

  const rows = audit.data?.pages.flat() ?? [];

  return (
    <div>
      <PageHeader title={s.title} subtitle={s.subtitle} />
      <form onSubmit={apply} className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-panel p-4">
        <Field label={s.action} value={draft.action} placeholder="e.g. offer.created"
          onChange={(e) => setDraft({ ...draft, action: e.target.value })} />
        <Field label={s.entityType} value={draft.entityType}
          onChange={(e) => setDraft({ ...draft, entityType: e.target.value })} />
        <div className="min-w-44">
          <Select label={strings.common.business} value={draft.businessId}
            onChange={(e) => setDraft({ ...draft, businessId: e.target.value })}>
            <option value="">—</option>
            {(businesses.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </div>
        <Field label={strings.common.from} type="date" value={draft.fromDay}
          onChange={(e) => setDraft({ ...draft, fromDay: e.target.value })} />
        <Field label={strings.common.to} type="date" value={draft.toDay}
          onChange={(e) => setDraft({ ...draft, toDay: e.target.value })} />
        <Button type="submit">{s.filter}</Button>
        <Button type="button" tone="plain" onClick={clear}>{s.clear}</Button>
      </form>

      {audit.isPending ? <Loading /> : audit.isError ? (
        <ErrorBox message={errorMessage(apiErrorOf(audit.error))} onRetry={() => audit.refetch()} />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">{strings.common.none}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-panel">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-2">{s.when}</th>
                <th className="px-4 py-2">{s.action}</th>
                <th className="px-4 py-2">{s.actor}</th>
                <th className="px-4 py-2">{strings.common.business}</th>
                <th className="px-4 py-2">{s.entity}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <tr className="border-t border-line align-top">
                    <td className="whitespace-nowrap px-4 py-2">{fmtDateTime(r.created_at)}</td>
                    <td className="px-4 py-2 font-mono text-xs text-gold-light">{r.action}</td>
                    <td className="px-4 py-2 text-xs">
                      {r.actor_role ?? "—"} <span className="font-mono text-muted" title={r.actor_id ?? ""}>{short(r.actor_id)}</span>
                    </td>
                    <td className="px-4 py-2 text-xs">{r.business_id ? names.get(r.business_id) ?? short(r.business_id) : "—"}</td>
                    <td className="px-4 py-2 text-xs">
                      {r.entity_type} <span className="font-mono text-muted" title={r.entity_id ?? ""}>{short(r.entity_id)}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button className="text-xs text-gold hover:text-gold-light" onClick={() => setOpen(open === r.id ? null : r.id)}>
                        {open === r.id ? strings.common.close : s.details}
                      </button>
                    </td>
                  </tr>
                  {open === r.id && (
                    <tr className="border-t border-line bg-bg">
                      <td colSpan={6} className="px-4 py-3">
                        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-muted">
                          {JSON.stringify({ before: r.before, after: r.after, request_id: r.request_id, ip: r.ip }, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {audit.hasNextPage && (
        <div className="mt-4">
          <Button tone="plain" loading={audit.isFetchingNextPage} onClick={() => audit.fetchNextPage()}>
            {strings.common.loadMore}
          </Button>
        </div>
      )}
    </div>
  );
}
