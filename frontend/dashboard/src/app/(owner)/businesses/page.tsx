// Owner: manage group companies (same flows as frontend/admin businesses.tsx). Add (api.create_business),
// edit and deactivate/reactivate (api.update_business), delete one that was never used
// (api.delete_business; BUSINESS_IN_USE otherwise), and upload a logo (Storage, then logo_path via
// api.update_business). The server checks business.manage on every call.
"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ApiError } from "@rewards/shared";
import { Badge, Button, Dialog, ErrorBox, Field, Loading, Notice, PageHeader, TextArea } from "@/components/ui";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { imageUrl, uploadImage } from "@/lib/images";
import { apiErrorOf, keys, useBuckets, useManagedBusinesses, useRecheckAccess } from "@/lib/queries";
import { strings } from "@/lib/strings";

const s = strings.businesses;
type Form = { id?: string; name: string; category: string; address: string; phone: string; website: string; timezone: string };
const EMPTY: Form = { name: "", category: "", address: "", phone: "", website: "", timezone: "" };
const orNull = (v: string) => (v.trim() === "" ? null : v.trim());
const opt = (label: string) => `${label} (${strings.common.optional})`;

export default function Businesses() {
  const qc = useQueryClient();
  const recheck = useRecheckAccess();
  const list = useManagedBusinesses();
  const buckets = useBuckets();
  const logoBucket = buckets.data?.business_assets;
  const [form, setForm] = useState<Form | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: keys.managedBusinesses });
  const fail = (e: ApiError | null, inForm = false) => {
    recheck(e);
    (inForm ? setFormError : setError)(errorMessage(e));
  };
  const reset = () => { setError(null); setNotice(null); setFormError(null); };

  const save = async () => {
    if (!form) return;
    setFormError(null);
    if (form.name.trim() === "") return setFormError(s.nameRequired);
    if (form.website.trim() !== "" && !form.website.trim().startsWith("https://")) return setFormError(s.badWebsite);
    const fields = {
      category: orNull(form.category), address: orNull(form.address), phone: orNull(form.phone),
      website_url: orNull(form.website),
    };
    setBusyId("form");
    const r = form.id
      ? await api.business.update({
        businessId: form.id,
        // timezone is NOT NULL on the server: only send it when filled in.
        patch: { name: form.name.trim(), ...fields, ...(orNull(form.timezone) ? { timezone: form.timezone.trim() } : {}) },
      })
      : await api.business.create({ name: form.name.trim(), ...fields, timezone: orNull(form.timezone) });
    setBusyId(null);
    if (r.error) return fail(r.error, true);
    setForm(null);
    setNotice(s.saved);
    await refresh();
  };

  const setActive = async (id: string, name: string, active: boolean) => {
    if (!active && !window.confirm(s.confirmDeactivate(name))) return;
    reset();
    setBusyId(id);
    const r = await api.business.update({ businessId: id, patch: { is_active: active } });
    setBusyId(null);
    if (r.error) return fail(r.error);
    setNotice(`${name}: ${active ? s.active : s.inactive}`);
    await refresh();
  };

  const remove = async (id: string, name: string) => {
    if (!window.confirm(s.confirmDelete(name))) return;
    reset();
    setBusyId(id);
    const r = await api.business.remove({ businessId: id });
    setBusyId(null);
    if (r.error) return fail(r.error);
    setNotice(r.data.filesLeft ? s.deletedFilesLeft : s.deleted);
    await refresh();
  };

  const uploadLogo = async (id: string, file: File | undefined) => {
    if (!file) return;
    reset();
    if (!logoBucket) return setError(s.noBucket);
    setBusyId(id);
    const up = await uploadImage(logoBucket, id, "logo", file);
    if (up.error) { setBusyId(null); return fail(up.error); }
    const r = await api.business.update({ businessId: id, patch: { logo_path: up.data.path } });
    setBusyId(null);
    if (r.error) return fail(r.error);
    setNotice(s.logoSaved);
    await refresh();
  };

  const set = (k: keyof Form) => (v: string) => form && setForm({ ...form, [k]: v });

  return (
    <div>
      <PageHeader title={s.title} subtitle={s.subtitle}
        actions={<Button onClick={() => { reset(); setForm({ ...EMPTY }); }}>{s.add}</Button>} />
      {notice && <Notice message={notice} />}
      {error && <ErrorBox message={error} />}

      {list.isPending ? <Loading /> : list.isError ? (
        <ErrorBox message={errorMessage(apiErrorOf(list.error))} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <p className="text-sm text-muted">{s.empty}</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.data.map((b) => (
            <div key={b.id} className="rounded-xl border border-line bg-panel p-4">
              <div className="flex items-start justify-between gap-3">
                {b.logo_path && logoBucket && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl(logoBucket, b.logo_path) ?? ""} alt={s.logo}
                    className="h-14 w-14 shrink-0 rounded-lg border border-line bg-white object-contain" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-lg font-semibold">{b.name}</div>
                  {b.category && <div className="text-sm text-muted">{b.category}</div>}
                  {b.address && <div className="text-sm text-muted">{b.address}</div>}
                  {b.phone && <div className="text-sm text-muted">{b.phone}</div>}
                  {b.website_url && <div className="truncate text-sm text-muted">{b.website_url}</div>}
                  {b.timezone && <div className="text-xs text-muted">{b.timezone}</div>}
                </div>
                <Badge tone={b.is_active ? "ok" : "warn"}>{b.is_active ? s.active : s.inactive}</Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button tone="plain" disabled={!!busyId} onClick={() => {
                  reset();
                  setForm({
                    id: b.id, name: b.name, category: b.category ?? "", address: b.address ?? "", phone: b.phone ?? "",
                    website: b.website_url ?? "", timezone: b.timezone ?? "",
                  });
                }}>{strings.common.edit}</Button>
                <Button tone="plain" loading={busyId === b.id} disabled={!!busyId && busyId !== b.id}
                  onClick={() => setActive(b.id, b.name, !b.is_active)}>
                  {b.is_active ? s.deactivate : s.reactivate}
                </Button>
                <label className={`inline-flex cursor-pointer items-center rounded-lg border border-line px-3 py-2 text-sm hover:bg-line ${busyId ? "pointer-events-none opacity-50" : ""}`}>
                  {b.logo_path ? s.changeLogo : s.uploadLogo}
                  <input type="file" accept="image/*" className="hidden"
                    onChange={(e) => { void uploadLogo(b.id, e.target.files?.[0]); e.target.value = ""; }} />
                </label>
                <Button tone="danger" disabled={!!busyId} onClick={() => remove(b.id, b.name)}>{s.delete}</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <Dialog title={form.id ? s.editTitle : s.newTitle} onClose={() => setForm(null)}>
          <div className="space-y-3">
            <Field label={s.name} value={form.name} maxLength={200} onChange={(e) => set("name")(e.target.value)} />
            <Field label={opt(s.category)} value={form.category} maxLength={100} onChange={(e) => set("category")(e.target.value)} />
            <TextArea label={opt(s.address)} value={form.address} onChange={(e) => set("address")(e.target.value)} />
            <Field label={opt(s.phone)} type="tel" value={form.phone} onChange={(e) => set("phone")(e.target.value)} />
            <Field label={opt(s.website)} type="url" value={form.website} maxLength={500} onChange={(e) => set("website")(e.target.value)} />
            <Field label={opt(s.timezone)} value={form.timezone} onChange={(e) => set("timezone")(e.target.value)} />
            {formError && <ErrorBox message={formError} />}
            <div className="flex gap-2 pt-2">
              <Button loading={busyId === "form"} onClick={save}>{strings.common.save}</Button>
              <Button tone="plain" onClick={() => setForm(null)}>{strings.common.cancel}</Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
