import { router } from "expo-router";
import { useState } from "react";
import { AuthHeader } from "../../components/AuthHeader";
import { ErrorBox, Field, LinkText, Screen } from "../../components/ui";
import { FadeContent } from "../../fx/FadeContent";
import { StarBorder } from "../../fx/StarBorder";
import { api } from "../../lib/api";
import { env } from "../../lib/env";
import { errorMessage } from "../../lib/errors";
import { toE164 } from "../../lib/phone";
import { strings } from "../../strings";

export default function SignIn() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const e164 = toE164(phone);
    if (!e164) return setError(strings.auth.invalidPhone);
    if (!password) return setError(strings.auth.required);
    setBusy(true);
    setError(null);
    const r = await api.auth.signIn({ phone: e164, password });
    setBusy(false);
    if (r.error) setError(errorMessage(r.error));
    // On success the session listener redirects to the tabs.
  };

  return (
    <Screen>
      <AuthHeader title={strings.auth.signInTitle} subtitle={strings.auth.signInSubtitle} />
      <FadeContent index={1}>
        <Field label={strings.auth.phone} value={phone} onChangeText={setPhone} keyboardType="phone-pad"
          autoComplete="tel" textContentType="telephoneNumber" placeholder={`${env.defaultDialCode} …`} />
        <Field label={strings.auth.password} value={password} onChangeText={setPassword} secureTextEntry
          autoComplete="current-password" textContentType="password" onSubmitEditing={submit} />
        {error && <ErrorBox message={error} />}
      </FadeContent>
      <FadeContent index={2} style={{ marginTop: 8 }}>
        <StarBorder label={strings.auth.signIn} onPress={submit} loading={busy} />
        <LinkText onPress={() => router.push("/(auth)/recover")}>{strings.auth.toRecover}</LinkText>
        <LinkText onPress={() => router.push("/(auth)/register")}>{strings.auth.toRegister}</LinkText>
      </FadeContent>
    </Screen>
  );
}
