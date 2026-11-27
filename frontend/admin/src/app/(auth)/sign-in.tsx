// Staff sign-in: phone + password through Supabase Auth. Staff accounts are created by the owner;
// partner businesses sign up themselves (partner-apply).
import { router } from "expo-router";
import { useState } from "react";
import { Image, Pressable, View } from "react-native";
import { brand, Text } from "@rewards/ui";
import { Button, ErrorBox, Field, Screen } from "../../components/ui";
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
    // On success the session listener redirects to home.
  };

  return (
    <Screen>
      <View className="items-center mt-6 mb-6">
        <Image source={brand.logo} style={{ width: 96, height: 96 }} resizeMode="contain" accessibilityIgnoresInvertColors />
        <Text className="text-gold text-base mt-2">{strings.brand.app}</Text>
      </View>
      <Text accessibilityRole="header" className="text-goldLight text-2xl font-bold">{strings.auth.signInTitle}</Text>
      <Text className="text-muted text-base mt-1 mb-5">{strings.auth.signInSubtitle}</Text>
      <Field label={strings.auth.phone} value={phone} onChangeText={setPhone} keyboardType="phone-pad"
        autoComplete="tel" textContentType="telephoneNumber" placeholder={`${env.defaultDialCode} …`} />
      <Field label={strings.auth.password} value={password} onChangeText={setPassword} secureTextEntry
        autoComplete="current-password" textContentType="password" onSubmitEditing={submit} />
      {error && <ErrorBox message={error} />}
      <View style={{ marginTop: 8 }}>
        <Button label={strings.auth.signIn} onPress={submit} loading={busy} />
      </View>
      <Pressable onPress={() => router.push("/partner-apply")} accessibilityRole="link" hitSlop={10} className="mt-6 items-center">
        <Text className="text-gold text-base">{strings.auth.applyLink}</Text>
      </Pressable>
    </Screen>
  );
}
