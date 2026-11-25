import { router } from "expo-router";
import { useState } from "react";
import { DateOnly } from "@rewards/shared";
import { AuthHeader } from "../../components/AuthHeader";
import { ErrorBox, Field, LinkText, Screen } from "../../components/ui";
import { FadeContent } from "../../fx/FadeContent";
import { StarBorder } from "../../fx/StarBorder";
import { api } from "../../lib/api";
import { env } from "../../lib/env";
import { errorMessage } from "../../lib/errors";
import { toE164 } from "../../lib/phone";
import { strings } from "../../strings";

export default function Register() {
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!fullName.trim() || !dob || !phone || !password) return setError(strings.auth.required);
    const e164 = toE164(phone);
    if (!e164) return setError(strings.auth.invalidPhone);
    if (!DateOnly.safeParse(dob).success) return setError(strings.auth.invalidDate);
    setBusy(true);
    setError(null);
    const r = await api.auth.register({ phone: e164, password, fullName: fullName.trim(), dateOfBirth: dob });
    if (r.error) {
      setBusy(false);
      const weakPassword = r.error.code === "VALIDATION_FAILED" && r.error.detail?.split(",").includes("password");
      return setError(weakPassword ? strings.auth.weakPassword : errorMessage(r.error));
    }
    const s = await api.auth.signIn({ phone: e164, password });
    setBusy(false);
    if (s.error) setError(errorMessage(s.error));
  };

  return (
    <Screen>
      <AuthHeader title={strings.auth.registerTitle} subtitle={strings.auth.registerSubtitle} />
      <FadeContent index={1}>
        <Field label={strings.auth.fullName} value={fullName} onChangeText={setFullName} autoComplete="name"
          textContentType="name" />
        <Field label={strings.auth.dateOfBirth} value={dob} onChangeText={setDob} placeholder="1990-01-31"
          keyboardType="numbers-and-punctuation" autoComplete="birthdate-full" />
        <Field label={strings.auth.phone} value={phone} onChangeText={setPhone} keyboardType="phone-pad"
          autoComplete="tel" textContentType="telephoneNumber" placeholder={`${env.defaultDialCode} …`} />
        <Field label={strings.auth.password} value={password} onChangeText={setPassword} secureTextEntry
          autoComplete="new-password" textContentType="newPassword" />
        {error && <ErrorBox message={error} />}
      </FadeContent>
      <FadeContent index={2} style={{ marginTop: 8 }}>
        <StarBorder label={strings.auth.register} onPress={submit} loading={busy} />
        <LinkText onPress={() => router.back()}>{strings.auth.toSignIn}</LinkText>
      </FadeContent>
    </Screen>
  );
}
