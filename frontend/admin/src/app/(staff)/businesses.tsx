// Owner only: manage group companies. Add (api.create_business), edit and deactivate/reactivate
// (api.update_business), delete one that was never used (api.delete_business; BUSINESS_IN_USE otherwise).
// The server checks business.manage at owner scope on every call; this screen is only the UI.
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, View } from "react-native";
import type { ApiError } from "@rewards/shared";
import { colors, Text } from "@rewards/ui";
import { Button, ErrorBox, Field, Header, Loading, Screen } from "../../components/ui";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { apiErrorOf, keys, useManagedBusinesses, useRecheckAccess } from "../../lib/queries";
import { setWorkplace, useWorkplace } from "../../lib/workplace";
import { strings } from "../../strings";

const s = strings.manage;
type Form = { id?: string; name: string; category: string; address: string; phone: string; website: string; timezone: string };
const EMPTY: Form = { name: "", category: "", address: "", phone: "", website: "", timezone: "" };
const orNull = (v: string) => (v.trim() === "" ? null : v.trim());

export default function Businesses() {
  const qc = useQueryClient();
  const recheck = useRecheckAccess();
  const list = useManagedBusinesses();
  const workplaceId = useWorkplace((w) => w.businessId);
  const [form, setForm] = useState<Form | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: keys.managedBusinesses }),
    qc.invalidateQueries({ queryKey: keys.businesses }),
  ]);
  const fail = (e: ApiError | null) => { recheck(e); setError(errorMessage(e)); };

  const save = async () => {
    if (!form) return;
    setError(null); setNotice(null);
    if (form.name.trim() === "") return setError(s.nameRequired);
    if (form.website.trim() !== "" && !form.website.trim().startsWith("https://")) return setError(s.badWebsite);
    const fields = {
      category: orNull(form.category), address: orNull(form.address), phone: orNull(form.phone),
      website_url: orNull(form.website),
    };
    setBusyId("form");
    const r = form.id
      ? await api.business.update({
        businessId: form.id,
        patch: { name: form.name.trim(), ...fields, ...(orNull(form.timezone) ? { timezone: form.timezone.trim() } : {}) },
      })
      : await api.business.create({ name: form.name.trim(), ...fields, timezone: orNull(form.timezone) });
    setBusyId(null);
    if (r.error) return fail(r.error);
    if (form.id && form.id === workplaceId) setWorkplace(form.id, form.name.trim());
    setForm(null); setNotice(s.saved);
    await refresh();
  };

  const setActive = async (id: string, name: string, active: boolean) => {
    setError(null); setNotice(null); setBusyId(id);
    const r = await api.business.update({ businessId: id, patch: { is_active: active } });
    setBusyId(null);
    if (r.error) return fail(r.error);
    if (!active && id === workplaceId) setWorkplace(null, null);
    setNotice(`${name}: ${active ? s.active : s.inactive}`);
    await refresh();
  };

  const remove = async (id: string) => {
    setError(null); setNotice(null); setBusyId(id);
    const r = await api.business.remove({ businessId: id });
    setBusyId(null);
    if (r.error) return fail(r.error);
    if (id === workplaceId) setWorkplace(null, null);
    setNotice(r.data.filesLeft ? s.deletedFilesLeft : s.deleted);
    await refresh();
  };

  const confirm = (title: string, body: string, action: string, run: () => void) =>
    Alert.alert(title, body, [
      { text: strings.common.cancel, style: "cancel" },
      { text: action, style: "destructive", onPress: run },
    ]);

  if (form) {
    const set = (k: keyof Form) => (v: string) => setForm({ ...form, [k]: v });
    return (
      <Screen>
        <Header title={form.id ? s.editTitle : s.newTitle} />
        <Field label={s.name} value={form.name} onChangeText={set("name")} maxLength={200} />
        <Field label={`${s.category} (${strings.common.optional})`} value={form.category} onChangeText={set("category")} maxLength={100} />
        <Field label={`${s.address} (${strings.common.optional})`} value={form.address} onChangeText={set("address")} multiline />
        <Field label={`${s.phone} (${strings.common.optional})`} value={form.phone} onChangeText={set("phone")} keyboardType="phone-pad" />
        <Field label={`${s.website} (${strings.common.optional})`} value={form.website} onChangeText={set("website")}
          autoCapitalize="none" keyboardType="url" maxLength={500} />
        <Field label={`${s.timezone} (${strings.common.optional})`} value={form.timezone} onChangeText={set("timezone")}
          autoCapitalize="none" />
        {error ? <ErrorBox message={error} /> : null}
        <View style={{ gap: 12, marginTop: 8 }}>
          <Button label={s.save} icon="save-outline" loading={busyId === "form"} onPress={save} />
          <Button label={strings.common.cancel} variant="secondary" onPress={() => { setForm(null); setError(null); }} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen onRefresh={() => list.refetch()} refreshing={list.isRefetching}>
      <Header back title={s.title} subtitle={s.subtitle} />
      <Button label={s.add} icon="add-circle-outline" onPress={() => { setError(null); setNotice(null); setForm({ ...EMPTY }); }} />
      <View style={{ height: 12 }} />
      {notice ? <Text className="text-gold text-base mb-2">{notice}</Text> : null}
      {error ? <ErrorBox message={error} /> : null}
      {list.isPending ? <Loading /> : list.isError ? (
        <ErrorBox message={errorMessage(apiErrorOf(list.error))} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <Text className="text-muted text-base">{s.empty}</Text>
      ) : (
        list.data.map((b) => (
          <View key={b.id} className="bg-surface rounded-2xl p-4 mb-3 border border-line">
            <View className="flex-row items-center">
              <Text className="text-text text-lg font-bold flex-1">{b.name}</Text>
              <Text className="text-sm font-bold" style={{ color: b.is_active ? colors.gold : colors.danger }}>
                {b.is_active ? s.active : s.inactive}
              </Text>
            </View>
            {b.category ? <Text className="text-muted text-sm">{b.category}</Text> : null}
            {b.address ? <Text className="text-muted text-sm">{b.address}</Text> : null}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <View style={{ flexGrow: 1 }}>
                <Button label={s.edit} variant="secondary" icon="create-outline" disabled={!!busyId}
                  onPress={() => {
                    setError(null); setNotice(null);
                    setForm({
                      id: b.id, name: b.name, category: b.category ?? "", address: b.address ?? "", phone: b.phone ?? "",
                      website: b.website_url ?? "", timezone: b.timezone ?? "",
                    });
                  }} />
              </View>
              <View style={{ flexGrow: 1 }}>
                {b.is_active ? (
                  <Button label={s.deactivate} variant="secondary" icon="pause-circle-outline" loading={busyId === b.id}
                    disabled={!!busyId && busyId !== b.id}
                    onPress={() => confirm(s.confirmDeactivateTitle, s.confirmDeactivate(b.name), s.deactivate,
                      () => setActive(b.id, b.name, false))} />
                ) : (
                  <Button label={s.reactivate} variant="secondary" icon="play-circle-outline" loading={busyId === b.id}
                    disabled={!!busyId && busyId !== b.id} onPress={() => setActive(b.id, b.name, true)} />
                )}
              </View>
              <View style={{ flexGrow: 1 }}>
                <Button label={s.delete} variant="danger" icon="trash-outline" disabled={!!busyId}
                  onPress={() => confirm(s.confirmDeleteTitle, s.confirmDelete(b.name), s.delete, () => remove(b.id))} />
              </View>
            </View>
          </View>
        ))
      )}
    </Screen>
  );
}
