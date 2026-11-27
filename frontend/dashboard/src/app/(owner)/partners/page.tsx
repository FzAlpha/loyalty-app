// Owner: partner businesses that signed up in the staff app (partner-apply). Approve or reject a pending
// application (api.decide_partner), or revoke an approved partner (api.revoke_partner: role removed,
// business hidden, active offers paused). The server checks partner.manage on every call.
"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ApiError, Result } from "@rewards/shared";
import { Badge, Button, ErrorBox, Loading, Notice, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/dates";
import { errorMessage } from "@/lib/errors";
import { apiErrorOf, keys, usePartnerApplications, useRecheckAccess, type PartnerFilter } from "@/lib/queries";
import { strings } from "@/lib/strings";

const s = strings.partners;
const FILTERS: PartnerFilter[] = ["pending", "approved", "rejected", "revoked", "all"];
const TONE = { pending: "warn", approved: "ok", rejected: "muted", revoked: "muted" } as const;

export default function Partners() {
  const qc = useQueryClient();
  const recheck = useRecheckAccess();
  const [filter, setFilter] = useState<PartnerFilter>("pending");
  const list = usePartnerApplications(filter);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // A note is optional; null means the owner pressed Cancel.
  const askNote = (action: string, name: string) => window.prompt(s.notePrompt(action, name), "");

  const run = async <T,>(id: string, call: () => Promise<Result<T>>, done: (d: T) => string) => {
    setError(null);
    setNotice(null);
    setBusyId(id);
    const r = await call();
    setBusyId(null);
    if (r.error) {
      recheck(r.error as ApiError);
      return setError(errorMessage(r.error as ApiError));
    }
    setNotice(done(r.data as T));
    // Decisions change businesses (active flag) and offers (paused) too.
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["partner-applications"] }),
      qc.invalidateQueries({ queryKey: keys.managedBusinesses }),
      qc.invalidateQueries({ queryKey: keys.offers }),
    ]);
  };

  const decide = (id: string, name: string, approve: boolean) => {
    const note = askNote(approve ? s.approve : s.reject, name);
    if (note === null) return;
    void run(id, () => api.partners.decide({ businessId: id, approve, note: note.trim() || undefined }),
      () => (approve ? s.approved(name) : s.rejected(name)));
  };

  const revoke = (id: string, name: string) => {
    if (!window.confirm(s.confirmRevoke(name))) return;
    const note = askNote(s.revoke, name);
    if (note === null) return;
    void run(id, () => api.partners.revoke({ businessId: id, note: note.trim() || undefined }),
      (d) => s.revoked(name, d.offers_paused));
  };

  return (
    <div>
      <PageHeader title={s.title} subtitle={s.subtitle} />
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-sm ${filter === f ? "bg-gold text-black" : "border border-line hover:bg-line"}`}>
            {s.filters[f]}
          </button>
        ))}
      </div>
      {notice && <Notice message={notice} />}
      {error && <ErrorBox message={error} />}

      {list.isPending ? <Loading /> : list.isError ? (
        <ErrorBox message={errorMessage(apiErrorOf(list.error))} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <p className="text-sm text-muted">{s.empty}</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.data.map((a) => (
            <div key={a.business_id} className="rounded-xl border border-line bg-panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="truncate text-lg font-semibold">{a.business_name}</div>
                  {a.category && <div className="text-sm text-muted">{a.category}</div>}
                  {a.address && <div className="text-sm text-muted">{a.address}</div>}
                  {a.website_url && <div className="truncate text-sm text-muted">{a.website_url}</div>}
                  <div className="pt-2 text-sm">{s.contact}: {a.contact_name}</div>
                  <div className="text-sm text-muted">{s.applicantPhone}: {a.applicant_phone ?? "—"}</div>
                  {a.business_phone && <div className="text-sm text-muted">{s.businessPhone}: {a.business_phone}</div>}
                  {a.message && <div className="whitespace-pre-wrap pt-2 text-sm">{s.message}: {a.message}</div>}
                  <div className="pt-2 text-xs text-muted">{s.applied}: {fmtDateTime(a.created_at)}</div>
                  {a.decided_at && <div className="text-xs text-muted">{s.decided}: {fmtDateTime(a.decided_at)}</div>}
                  {a.decision_note && <div className="text-xs text-muted">{s.note}: {a.decision_note}</div>}
                </div>
                <Badge tone={TONE[a.status]}>{s.statuses[a.status] ?? a.status}</Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {a.status === "pending" && (
                  <>
                    <Button loading={busyId === a.business_id} disabled={!!busyId}
                      onClick={() => decide(a.business_id, a.business_name, true)}>{s.approve}</Button>
                    <Button tone="plain" disabled={!!busyId}
                      onClick={() => decide(a.business_id, a.business_name, false)}>{s.reject}</Button>
                  </>
                )}
                {a.status === "approved" && (
                  <Button tone="danger" loading={busyId === a.business_id} disabled={!!busyId}
                    onClick={() => revoke(a.business_id, a.business_name)}>{s.revoke}</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
