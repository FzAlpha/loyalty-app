// Offers: create/edit (api.upsert_offer) and change status (api.set_offer_status). Ranges, required fields
// and allowed status changes are checked by the server. Schedules, customer groups and banner upload are
// not in this screen yet (left unchanged on edit). The list is the interim in-tab list (lib/recent.ts).
"use client";
import { useState } from "react";
import type { ApiError } from "@rewards/shared";
import { Badge, Button, Dialog, ErrorBox, Field, Notice, PageHeader, Select, TextArea } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDateTime, isoToLocalInput, localInputToIso } from "@/lib/dates";
import { errorMessage } from "@/lib/errors";
import { useManagedBusinesses, useOfferCategories, useRecheckAccess } from "@/lib/queries";
import { useRecent, type RecentOffer } from "@/lib/recent";
import { strings } from "@/lib/strings";

const s = strings.offers;
const STATUSES = ["draft", "active", "paused", "archived"] as const;
type Status = (typeof STATUSES)[number];

type Form = {
  id?: string; business_id: string; title: string; description: string; terms: string; category_id: string;
  starts_at: string; ends_at: string; min_purchase_amount: string; max_discount_amount: string;
  max_uses_per_customer: string; total_usage_limit: string; birthday_window_days: string;
};
const NUMBERS = [
  ["min_purchase_amount", s.minPurchase, false],
  ["max_discount_amount", s.maxDiscount, false],
  ["max_uses_per_customer", s.maxUsesPerCustomer, true],
  ["total_usage_limit", s.totalLimit, true],
  ["birthday_window_days", s.birthdayWindow, true],
] as const;

const text = (v: string) => (v.trim() === "" ? null : v.trim());
const numStr = (n: number | null | undefined) => (n == null ? "" : String(n));

function emptyForm(): Form {
  return {
    business_id: "", title: "", description: "", terms: "", category_id: "",
    starts_at: isoToLocalInput(new Date().toISOString()), ends_at: "",
    min_purchase_amount: "", max_discount_amount: "", max_uses_per_customer: "", total_usage_limit: "", birthday_window_days: "",
  };
}

function toForm(o: RecentOffer): Form {
  return {
    id: o.id, business_id: o.business_id ?? "", title: o.title ?? "", description: o.description ?? "", terms: o.terms ?? "",
    category_id: o.category_id ?? "", starts_at: isoToLocalInput(o.starts_at), ends_at: isoToLocalInput(o.ends_at),
    min_purchase_amount: numStr(o.min_purchase_amount), max_discount_amount: numStr(o.max_discount_amount),
    max_uses_per_customer: numStr(o.max_uses_per_customer), total_usage_limit: numStr(o.total_usage_limit),
    birthday_window_days: numStr(o.birthday_window_days),
  };
}

export default function Offers() {
  const businesses = useManagedBusinesses();
  const categories = useOfferCategories();
  const recheck = useRecheckAccess();
  const { offers, putOffer } = useRecent();
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const bizName = new Map((businesses.data ?? []).map((b) => [b.id, b.name]));
  const catName = new Map((categories.data ?? []).map((c) => [c.id, c.name]));

  const fail = (e: ApiError | null, inForm: boolean) => { recheck(e); (inForm ? setFormError : setError)(errorMessage(e)); };

  const save = async () => {
    if (!form) return;
    setFormError(null);
    if (!form.business_id) return setFormError(s.needBusiness);
    if (!form.title.trim()) return setFormError(s.needTitle);
    const nums: Record<string, number | null> = {};
    for (const [key, label, int] of NUMBERS) {
      const raw = form[key].trim();
      if (raw === "") { nums[key] = null; continue; }
      const n = Number(raw);
      if (!Number.isFinite(n) || (int && !Number.isInteger(n))) return setFormError(s.badNumber(label));
      nums[key] = n;
    }
    const input = {
      ...(form.id ? { id: form.id } : {}),
      business_id: form.business_id,
      title: form.title.trim(),
      description: text(form.description),
      terms: text(form.terms),
      category_id: form.category_id || null,
      starts_at: localInputToIso(form.starts_at),
      ends_at: localInputToIso(form.ends_at),
      ...nums,
    };
    setBusy("form");
    const r = await api.offers.upsert(input);
    setBusy(null);
    if (r.error) return fail(r.error, true);
    putOffer({ ...input, id: r.data.offer_id, status: r.data.status });
    setForm(null);
    setError(null);
    setNotice(s.saved(s.statuses[r.data.status] ?? r.data.status));
  };

  const setStatus = async (o: RecentOffer, status: Status) => {
    setError(null);
    setNotice(null);
    setBusy(o.id);
    const r = await api.offers.setStatus({ offerId: o.id, status });
    setBusy(null);
    if (r.error) return fail(r.error, false);
    putOffer({ ...o, status: r.data.status });
    setNotice(`${o.title}: ${s.statuses[r.data.status] ?? r.data.status}`);
  };

  const list = Object.values(offers);
  const set = (k: keyof Form, v: string) => form && setForm({ ...form, [k]: v });

  return (
    <div>
      <PageHeader title={s.title} subtitle={s.subtitle}
        actions={<Button onClick={() => { setFormError(null); setForm(emptyForm()); }}>{s.new}</Button>} />
      {notice && <Notice message={notice} />}
      {error && <ErrorBox message={error} />}

      <h2 className="mb-1 text-sm font-semibold text-gold">{s.sessionOnly}</h2>
      <p className="mb-3 text-xs text-muted">{s.sessionOnlyHint}</p>
      {list.length === 0 ? <p className="text-sm text-muted">{strings.common.none}</p> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((o) => (
            <div key={o.id} className="rounded-xl border border-line bg-panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-lg font-semibold">{o.title}</div>
                  <div className="text-sm text-muted">
                    {bizName.get(o.business_id ?? "") ?? "—"}{o.category_id ? ` · ${catName.get(o.category_id) ?? ""}` : ""}
                  </div>
                  <div className="text-xs text-muted">{fmtDateTime(o.starts_at)} → {fmtDateTime(o.ends_at)}</div>
                </div>
                <Badge tone={o.status === "active" ? "ok" : o.status === "draft" ? "muted" : "warn"}>
                  {s.statuses[o.status] ?? o.status}
                </Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button tone="plain" disabled={!!busy} onClick={() => { setFormError(null); setForm(toForm(o)); }}>
                  {strings.common.edit}
                </Button>
                {STATUSES.filter((st) => st !== o.status).map((st) => (
                  <Button key={st} tone={st === "archived" ? "danger" : "plain"} disabled={!!busy}
                    loading={busy === o.id} onClick={() => setStatus(o, st)}>
                    {s.statuses[st]}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <Dialog title={form.id ? s.editTitle : s.newTitle} onClose={() => setForm(null)}>
          <div className="space-y-3">
            <Select label={s.business} value={form.business_id} disabled={!!form.id}
              onChange={(e) => set("business_id", e.target.value)}>
              <option value="">—</option>
              {(businesses.data ?? []).filter((b) => b.is_active || b.id === form.business_id).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
            <Field label={s.titleField} value={form.title} maxLength={200} onChange={(e) => set("title", e.target.value)} />
            <TextArea label={`${s.description} (${strings.common.optional})`} value={form.description}
              onChange={(e) => set("description", e.target.value)} />
            <TextArea label={`${s.terms} (${strings.common.optional})`} value={form.terms}
              onChange={(e) => set("terms", e.target.value)} />
            <Select label={s.category} value={form.category_id} onChange={(e) => set("category_id", e.target.value)}>
              <option value="">{s.noCategory}</option>
              {(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={s.startsAt} type="datetime-local" value={form.starts_at} onChange={(e) => set("starts_at", e.target.value)} />
              <Field label={s.endsAt} type="datetime-local" value={form.ends_at} onChange={(e) => set("ends_at", e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {NUMBERS.map(([key, label]) => (
                <Field key={key} label={label} inputMode="decimal" value={form[key]} placeholder={s.blankNoLimit}
                  onChange={(e) => set(key, e.target.value)} />
              ))}
            </div>
            {formError && <ErrorBox message={formError} />}
            <div className="flex gap-2 pt-2">
              <Button loading={busy === "form"} onClick={save}>{strings.common.save}</Button>
              <Button tone="plain" onClick={() => setForm(null)}>{strings.common.cancel}</Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
