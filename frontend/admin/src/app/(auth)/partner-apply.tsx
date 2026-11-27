// Partner business self sign-up (partner-apply Edge Function). Creates the applicant's own staff account
// and a pending application, then signs in so the staff layout shows the application status.
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@rewards/ui";
import { Button, ErrorBox, Field, Header, Screen } from "../../components/ui";
import { api } from "../../lib/api";
import { env } from "../../lib/env";
import { errorMessage } from "../../lib/errors";
import { toE164 } from "../../lib/phone";
import { strings } from "../../strings";

const s = strings.partner;
const opt = (v: string) => v.trim() || undefined;

export default function PartnerApply() {
  const [f, setF] = useState({
    contact_name: "", business_name: "", phone: "", password: "", confirm: "",
    category: "", address: "", business_phone: "", website_url: "", message: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!f.contact_name.trim() || !f.business_name.trim() || !f.phone || !f.password) return setError(s.required);
    const phone = toE164(f.phone);
    if (!phone) return setError(strings.auth.invalidPhone);
    if (f.password !== f.confirm) return setError(strings.password.mismatch);
    if (f.website_url.trim() && !/^https:\/\//i.test(f.website_url.trim())) return setError(s.badWebsite);
    setBusy(true);
    setError(null);
    const r = await api.partners.apply({
      phone, password: f.password, contact_name: f.contact_name.trim(), business_name: f.business_name.trim(),
      category: opt(f.category), address: opt(f.address), business_phone: opt(f.business_phone),
      website_url: opt(f.website_url), message: opt(f.message),
    });
    if (r.error) {
      setBusy(false);
      return setError(errorMessage(r.error));
    }
    // The account exists now; sign in so the staff layout shows "Application received".
    const signIn = await api.auth.signIn({ phone, password: f.password });
    setBusy(false);
    if (signIn.error) router.replace("/sign-in");
  };

  return (
    <Screen>
      <Header back title={s.applyTitle} subtitle={s.applySubtitle} />
      <Field label={s.contactName} value={f.contact_name} onChangeText={set("contact_name")} autoComplete="name" />
      <Field label={s.businessName} value={f.business_name} onChangeText={set("business_name")} />
      <Field label={strings.auth.phone} value={f.phone} onChangeText={set("phone")} keyboardType="phone-pad"
        autoComplete="tel" textContentType="telephoneNumber" placeholder={`${env.defaultDialCode} …`} />
      <Field label={strings.auth.password} value={f.password} onChangeText={set("password")} secureTextEntry
        autoComplete="new-password" textContentType="newPassword" />
      <Field label={s.confirmPassword} value={f.confirm} onChangeText={set("confirm")} secureTextEntry
        autoComplete="new-password" textContentType="newPassword" />
      <Field label={`${s.category} (${strings.common.optional})`} value={f.category} onChangeText={set("category")} />
      <Field label={`${s.address} (${strings.common.optional})`} value={f.address} onChangeText={set("address")} />
      <Field label={`${s.businessPhone} (${strings.common.optional})`} value={f.business_phone}
        onChangeText={set("business_phone")} keyboardType="phone-pad" />
      <Field label={`${s.website} (${strings.common.optional})`} value={f.website_url} onChangeText={set("website_url")}
        autoCapitalize="none" keyboardType="url" />
      <Field label={`${s.message} (${strings.common.optional})`} value={f.message} onChangeText={set("message")}
        multiline style={{ minHeight: 96, textAlignVertical: "top", paddingTop: 12 }} />
      {error && <ErrorBox message={error} />}
      <View style={{ marginTop: 8 }}>
        <Button label={s.submit} onPress={submit} loading={busy} />
      </View>
      <Pressable onPress={() => router.replace("/sign-in")} accessibilityRole="link" hitSlop={10} className="mt-5 items-center">
        <Text className="text-gold text-base">{s.haveAccount}</Text>
      </Pressable>
    </Screen>
  );
}
