// Staff accounts through the staff-admin Edge Function (api.staff.*): create, reassign, enable/disable and
// reset password. The owner types every temporary password; the person must change it at first sign-in.
// The list comes from api.list_staff (owner only).
"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ApiError } from "@rewards/shared";
import { Badge, Button, Card, Dialog, ErrorBox, Field, Loading, Notice, PageHeader, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { toE164 } from "@/lib/phone";
import { apiErrorOf, keys, useManagedBusinesses, useRecheckAccess, useStaffList } from "@/lib/queries";
import { strings } from "@/lib/strings";

const s = strings.staff;
type Role = "executive" | "owner";
type CreateForm = { phone: string; displayName: string; role: Role; businessId: string; tempPassword: string };
const EMPTY: CreateForm = { phone: "", displayName: "", role: "executive", businessId: "", tempPassword: "" };
type Managed = { userId: string; displayName: string; role: Role; businessId: string | null; isActive: boolean };

function message(e: ApiError | null): string {
  if (e?.code === "VALIDATION_FAILED" && e.detail?.split(",").includes("password")) return s.weakTemp;
  return errorMessage(e);
}

export default function Executives() {
  const businesses = useManagedBusinesses();
  const recheck = useRecheckAccess();
  const qc = useQueryClient();
  const staff = useStaffList();
  const refresh = () => qc.invalidateQueries({ queryKey: keys.staffList });
  const [create, setCreate] = useState<CreateForm | null>(null);
  const [manage, setManage] = useState<Managed | null>(null);
  const [tempPassword, setTempPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const bizName = new Map((businesses.data ?? []).map((b) => [b.id, b.name]));
  const activeBiz = (businesses.data ?? []).filter((b) => b.is_active);

  const fail = (e: ApiError | null) => { recheck(e); setFormError(message(e)); };
  const open = (st: Managed) => { setFormError(null); setTempPassword(""); setManage(st); };

  const submitCreate = async () => {
    if (!create) return;
    setFormError(null);
    const phone = toE164(create.phone);
    if (!phone) return setFormError(strings.auth.invalidPhone);
    if (!create.displayName.trim() || !create.tempPassword) return setFormError(strings.auth.required);
    if (create.role === "executive" && !create.businessId) return setFormError(s.needBusiness);
    setBusy("create");
    const businessId = create.businessId || null;
    const r = await api.staff.create({
      phone, tempPassword: create.tempPassword, displayName: create.displayName.trim(), role: create.role, businessId,
    });
    setBusy(null);
    if (r.error) return fail(r.error);
    await refresh();
    setCreate(null);
    setNotice(s.created);
  };

  const run = async (key: string, call: () => Promise<{ error?: ApiError | null }>, after: () => void) => {
    setFormError(null);
    setNotice(null);
    setBusy(key);
    const r = await call();
    setBusy(null);
    if (r.error) return fail(r.error);
    after();
    await refresh();
    setNotice(s.done);
  };

  const reassign = (m: Managed) => {
    if (!m.displayName.trim()) return setFormError(strings.auth.required);
    if (m.role === "executive" && !m.businessId) return setFormError(s.needBusiness);
    const businessId = m.businessId || null;
    return run("reassign",
      () => api.staff.reassign({ userId: m.userId, role: m.role, businessId, displayName: m.displayName.trim() }),
      () => setManage(null));
  };

  return (
    <div className="space-y-6">
      <PageHeader title={s.title} subtitle={s.subtitle}
        actions={<Button onClick={() => { setFormError(null); setCreate({ ...EMPTY }); }}>{s.create}</Button>} />
      {notice && <Notice message={notice} />}

      <Card title={s.list}>
        {staff.isPending ? <Loading /> : staff.isError ? (
          <ErrorBox message={errorMessage(apiErrorOf(staff.error))} onRetry={() => staff.refetch()} />
        ) : staff.data.length === 0 ? <p className="text-sm text-muted">{strings.common.none}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted">
                <tr>
                  <th className="py-2 pr-4">{s.name}</th><th className="py-2 pr-4">{s.role}</th>
                  <th className="py-2 pr-4">{s.phone}</th><th className="py-2 pr-4">{s.business}</th>
                  <th className="py-2 pr-4" /><th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {staff.data.map((m) => (
                  <tr key={m.user_id} className="border-t border-line">
                    <td className="py-2 pr-4">{m.display_name}</td>
                    <td className="py-2 pr-4">{s.roles[m.role]}</td>
                    <td className="py-2 pr-4">{m.phone_e164 ?? "—"}</td>
                    <td className="py-2 pr-4">{m.business_name ?? (m.business_id ? bizName.get(m.business_id) ?? "—" : "—")}</td>
                    <td className="py-2 pr-4">
                      <Badge tone={m.is_active ? "ok" : "warn"}>{m.is_active ? s.active : s.disabled}</Badge>
                      {m.must_change_password && <span className="ml-2 text-xs text-muted">{s.mustChange}</span>}
                    </td>
                    <td className="py-2 text-right">
                      <Button tone="plain" onClick={() => open({
                        userId: m.user_id, displayName: m.display_name, role: m.role, businessId: m.business_id, isActive: m.is_active,
                      })}>{strings.common.edit}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {create && (
        <Dialog title={s.create} onClose={() => setCreate(null)}>
          <div className="space-y-3">
            <Field label={s.phone} type="tel" value={create.phone} onChange={(e) => setCreate({ ...create, phone: e.target.value })} />
            <Field label={s.name} value={create.displayName} maxLength={200}
              onChange={(e) => setCreate({ ...create, displayName: e.target.value })} />
            <Select label={s.role} value={create.role} onChange={(e) => setCreate({ ...create, role: e.target.value as Role })}>
              <option value="executive">{s.roles.executive}</option>
              <option value="owner">{s.roles.owner}</option>
            </Select>
            <Select label={s.business} value={create.businessId} onChange={(e) => setCreate({ ...create, businessId: e.target.value })}>
              <option value="">—</option>
              {activeBiz.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
            <Field label={s.tempPassword} type="password" autoComplete="new-password" hint={s.tempHint}
              value={create.tempPassword} onChange={(e) => setCreate({ ...create, tempPassword: e.target.value })} />
            {formError && <ErrorBox message={formError} />}
            <div className="flex gap-2 pt-2">
              <Button loading={busy === "create"} onClick={submitCreate}>{s.create}</Button>
              <Button tone="plain" onClick={() => setCreate(null)}>{strings.common.cancel}</Button>
            </div>
          </div>
        </Dialog>
      )}

      {manage && (
        <Dialog title={manage.displayName || manage.userId} onClose={() => setManage(null)}>
          <div className="space-y-5">
            <p className="font-mono text-xs text-muted">{s.userId}: {manage.userId}</p>
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-gold">{s.reassign}</h3>
              <Field label={s.name} value={manage.displayName} maxLength={200}
                onChange={(e) => setManage({ ...manage, displayName: e.target.value })} />
              <Select label={s.role} value={manage.role} onChange={(e) => setManage({ ...manage, role: e.target.value as Role })}>
                <option value="executive">{s.roles.executive}</option>
                <option value="owner">{s.roles.owner}</option>
              </Select>
              <Select label={s.business} value={manage.businessId ?? ""}
                onChange={(e) => setManage({ ...manage, businessId: e.target.value || null })}>
                <option value="">—</option>
                {activeBiz.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
              <Button loading={busy === "reassign"} disabled={!!busy} onClick={() => reassign(manage)}>{s.reassign}</Button>
            </section>
            <section className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button tone="plain" loading={busy === "enable"} disabled={!!busy}
                onClick={() => run("enable", () => api.staff.enable({ userId: manage.userId }),
                  () => setManage({ ...manage, isActive: true }))}>
                {s.enable}
              </Button>
              <Button tone="danger" loading={busy === "disable"} disabled={!!busy}
                onClick={() => run("disable", () => api.staff.disable({ userId: manage.userId }),
                  () => setManage({ ...manage, isActive: false }))}>
                {s.disable}
              </Button>
            </section>
            <section className="space-y-3 border-t border-line pt-4">
              <h3 className="text-sm font-semibold text-gold">{s.resetPassword}</h3>
              <Field label={s.newPassword} type="password" autoComplete="new-password" hint={s.tempHint}
                value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} />
              <Button tone="plain" loading={busy === "reset"} disabled={!!busy || !tempPassword}
                onClick={() => run("reset", () => api.staff.resetPassword({ userId: manage.userId, tempPassword }),
                  () => setTempPassword(""))}>
                {s.resetPassword}
              </Button>
            </section>
            {formError && <ErrorBox message={formError} />}
            {notice && <Notice message={notice} />}
          </div>
        </Dialog>
      )}
    </div>
  );
}
