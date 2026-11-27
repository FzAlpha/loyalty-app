// Partner: its own offers (api.list_offers for its business). Create or edit (api.upsert_offer); new offers
// are published straight away (api.set_offer_status 'active'), and the partner can pause or republish,
// except offers the owner paused (owner_paused): only the owner can publish those again.
// The owner can still pause any offer or revoke the partner. The server checks offer.manage every call.
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import type { z } from "zod";
import type { OwnerOffer, UpsertOfferInput } from "@rewards/shared";
import { Text } from "@rewards/ui";
import { Button, ErrorBox, Field, Header, Loading, Panel, Screen, fmtAmount } from "../../components/ui";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { apiErrorOf, keys, useOffers, useRecheckAccess } from "../../lib/queries";
import { useWorkplace } from "../../lib/workplace";
import { strings } from "../../strings";

const s = strings.partner;
type Offer = z.infer<typeof OwnerOffer>;
type Form = {
  id?: string; title: string; description: string; terms: string; ends_on: string;
  min_purchase: string; max_discount: string; max_uses: string;
};
const EMPTY: Form = { title: "", description: "", terms: "", ends_on: "", min_purchase: "", max_discount: "", max_uses: "" };

const pad = (n: number) => String(n).padStart(2, "0");
// Local calendar day <-> end of that day as an ISO time.
const isoToDay = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const dayToIso = (day: string) => new Date(`${day}T23:59:59`).toISOString();
const numText = (n: number | null) => (n == null ? "" : String(n));

export default function Offers() {
  const qc = useQueryClient();
  const recheck = useRecheckAccess();
  const businessId = useWorkplace((w) => w.businessId);
  const list = useOffers(businessId ?? "");
  const [form, setForm] = useState<Form | null>(null);
  const [editing, setEditing] = useState<Offer | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const set = (k: keyof Form) => (v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const refresh = () => qc.invalidateQueries({ queryKey: keys.offers(businessId ?? "") });
  const fail = (e: Parameters<typeof errorMessage>[0]) => {
    recheck(e);
    setError(errorMessage(e));
  };

  const open = (o: Offer | null) => {
    setError(null);
    setNotice(null);
    setEditing(o);
    setForm(o ? {
      id: o.id, title: o.title, description: o.description ?? "", terms: o.terms ?? "", ends_on: isoToDay(o.ends_at),
      min_purchase: numText(o.min_purchase_amount), max_discount: numText(o.max_discount_amount),
      max_uses: numText(o.max_uses_per_customer),
    } : EMPTY);
  };

  const save = async () => {
    if (!form || !businessId) return;
    if (!form.title.trim()) return setError(s.titleRequired);
    if (form.ends_on && !/^\d{4}-\d{2}-\d{2}$/.test(form.ends_on.trim())) return setError(s.badDate);
    const nums: [string, string, boolean][] = [
      [form.min_purchase, s.minPurchase, false], [form.max_discount, s.maxDiscount, false], [form.max_uses, s.maxUses, true],
    ];
    const parsed: (number | null)[] = [];
    for (const [v, label, int] of nums) {
      if (!v.trim()) { parsed.push(null); continue; }
      const n = Number(v.trim());
      if (!Number.isFinite(n) || (int && !Number.isInteger(n))) return setError(s.badNumber(label));
      parsed.push(n);
    }
    const [min_purchase_amount, max_discount_amount, max_uses_per_customer] = parsed;
    // upsert_offer replaces every column on edit, so carry over the fields this screen does not show.
    const input: z.input<typeof UpsertOfferInput> = {
      ...(editing ? {
        id: editing.id, banner_path: editing.banner_path, category_id: editing.category_id,
        total_usage_limit: editing.total_usage_limit, birthday_window_days: editing.birthday_window_days,
      } : { business_id: businessId }),
      title: form.title.trim(),
      description: form.description.trim() || null,
      terms: form.terms.trim() || null,
      ends_at: form.ends_on.trim() ? dayToIso(form.ends_on.trim()) : null,
      min_purchase_amount, max_discount_amount, max_uses_per_customer,
    };
    setError(null);
    setBusy("save");
    const r = await api.offers.upsert(input);
    if (r.error) {
      setBusy(null);
      return fail(r.error);
    }
    let msg: string = s.saved;
    // New offers start as drafts on the server; partners publish them straight away.
    if (!editing) {
      const pub = await api.offers.setStatus({ offerId: r.data.offer_id, status: "active" });
      msg = pub.error ? s.savedDraft : s.published;
    }
    setBusy(null);
    setForm(null);
    setEditing(null);
    setNotice(msg);
    await refresh();
  };

  const setStatus = async (o: Offer, status: "active" | "paused") => {
    setError(null);
    setNotice(null);
    setBusy(o.id);
    const r = await api.offers.setStatus({ offerId: o.id, status });
    setBusy(null);
    if (r.error) return fail(r.error);
    await refresh();
  };

  if (form) {
    return (
      <Screen>
        <Header title={editing ? s.editOffer : s.newOffer} />
        <Field label={s.title} value={form.title} onChangeText={set("title")} />
        <Field label={`${s.description} (${strings.common.optional})`} value={form.description} onChangeText={set("description")}
          multiline style={{ minHeight: 96, textAlignVertical: "top", paddingTop: 12 }} />
        <Field label={`${s.terms} (${strings.common.optional})`} value={form.terms} onChangeText={set("terms")}
          multiline style={{ minHeight: 80, textAlignVertical: "top", paddingTop: 12 }} />
        <Field label={`${s.endsOn} (${strings.common.optional})`} value={form.ends_on} onChangeText={set("ends_on")}
          placeholder="2026-12-31" autoCapitalize="none" />
        <Field label={`${s.minPurchase} (${strings.common.optional})`} value={form.min_purchase}
          onChangeText={set("min_purchase")} keyboardType="decimal-pad" />
        <Field label={`${s.maxDiscount} (${strings.common.optional})`} value={form.max_discount}
          onChangeText={set("max_discount")} keyboardType="decimal-pad" />
        <Field label={`${s.maxUses} (${strings.common.optional})`} value={form.max_uses}
          onChangeText={set("max_uses")} keyboardType="number-pad" />
        {error && <ErrorBox message={error} />}
        <View style={{ marginTop: 8, gap: 10 }}>
          <Button label={editing ? s.saveChanges : s.save} onPress={save} loading={busy === "save"} />
          <Button label={strings.common.cancel} variant="secondary" disabled={busy === "save"}
            onPress={() => { setForm(null); setEditing(null); setError(null); }} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen onRefresh={() => list.refetch()} refreshing={list.isRefetching}>
      <Header back title={s.offersTitle} subtitle={s.offersSubtitle} />
      <Button label={s.newOffer} icon="add-outline" onPress={() => open(null)} disabled={!businessId} />
      {notice && <Panel tone="success" title={notice} />}
      {error && <ErrorBox message={error} />}
      <View style={{ marginTop: 16 }}>
        {!businessId ? null : list.isPending ? <Loading /> : list.isError ? (
          <ErrorBox message={errorMessage(apiErrorOf(list.error))} onRetry={() => list.refetch()} />
        ) : list.data.length === 0 ? (
          <Text className="text-muted text-base">{s.empty}</Text>
        ) : (
          list.data.map((o) => (
            <View key={o.id} className="bg-surface rounded-2xl p-4 mb-3 border border-line">
              <View className="flex-row items-start">
                <Text className="text-text text-lg font-bold flex-1">{o.title}</Text>
                <Text className={o.status === "active" ? "text-gold text-base font-bold" : "text-muted text-base"}>
                  {s.statuses[o.status] ?? o.status}
                </Text>
              </View>
              {o.description ? <Text className="text-muted text-base mt-1">{o.description}</Text> : null}
              <Text className="text-muted text-sm mt-2">
                {o.ends_at ? s.until(isoToDay(o.ends_at)) : s.noEnd} · {s.redeemed(o.total_redeemed)}
                {o.min_purchase_amount != null ? ` · ${s.minPurchase} ${fmtAmount(o.min_purchase_amount)}` : ""}
              </Text>
              {o.owner_paused && o.status === "paused" ? (
                <Text className="text-muted text-sm mt-2">{s.ownerPaused}</Text>
              ) : null}
              {o.status !== "archived" && (
                <View className="flex-row mt-3" style={{ gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Button label={s.edit} variant="secondary" disabled={!!busy} onPress={() => open(o)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    {o.status === "active" ? (
                      <Button label={s.pause} variant="danger" loading={busy === o.id} disabled={!!busy}
                        onPress={() => setStatus(o, "paused")} />
                    ) : o.owner_paused ? null : (
                      <Button label={s.publish} loading={busy === o.id} disabled={!!busy}
                        onPress={() => setStatus(o, "active")} />
                    )}
                  </View>
                </View>
              )}
            </View>
          ))
        )}
      </View>
    </Screen>
  );
}
