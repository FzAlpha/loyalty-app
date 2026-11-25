import { router } from "expo-router";
import { useState } from "react";
import { Text } from "../../components/Text";
import { AuthHeader } from "../../components/AuthHeader";
import { ErrorBox, Field, LinkText, Screen } from "../../components/ui";
import { FadeContent } from "../../fx/FadeContent";
import { StarBorder } from "../../fx/StarBorder";
import { api } from "../../lib/api";
import { env } from "../../lib/env";
import { errorMessage } from "../../lib/errors";
import { toE164 } from "../../lib/phone";
import { strings } from "../../strings";

export default function Recover() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!phone || !code || !password) return setError(strings.auth.required);
    const e164 = toE164(phone);
    if (!e164) return setError(strings.auth.invalidPhone);
    setBusy(true);
    setError(null);
    const r = await api.auth.recover({ phone: e164, code: code.trim(), newPassword: password });
    setBusy(false);
    if (r.error) return setError(errorMessage(r.error));
    setDone(true);
  };

  return (
    <Screen>
      <AuthHeader title={strings.auth.recoverTitle} subtitle={strings.auth.recoverSubtitle} />
      {done ? (
        <FadeContent>
          <Text className="text-success text-base text-center mb-4" accessibilityRole="alert">{strings.auth.recovered}</Text>
          <StarBorder label={strings.auth.signIn} onPress={() => router.replace("/(auth)/sign-in")} />
        </FadeContent>
      ) : (
        <>
          <FadeContent index={1}>
            <Field label={strings.auth.phone} value={phone} onChangeText={setPhone} keyboardType="phone-pad"
              placeholder={`${env.defaultDialCode} …`} />
            <Field label={strings.auth.recoveryCode} value={code} onChangeText={setCode} autoCapitalize="characters" />
            <Field label={strings.auth.newPassword} value={password} onChangeText={setPassword} secureTextEntry
              autoComplete="new-password" textContentType="newPassword" />
            {error && <ErrorBox message={error} />}
          </FadeContent>
          <FadeContent index={2} style={{ marginTop: 8 }}>
            <StarBorder label={strings.auth.recover} onPress={submit} loading={busy} />
            <LinkText onPress={() => router.back()}>{strings.auth.toSignIn}</LinkText>
          </FadeContent>
        </>
      )}
    </Screen>
  );
}
