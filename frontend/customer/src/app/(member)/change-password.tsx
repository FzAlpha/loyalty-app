// Signed-in password change through Supabase Auth (api.auth.changePassword).
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { PageHeader } from "../../components/Brand";
import { Text } from "../../components/Text";
import { ErrorBox, Field, Screen } from "../../components/ui";
import { FadeContent } from "../../fx/FadeContent";
import { StarBorder } from "../../fx/StarBorder";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { strings } from "../../strings";

export default function ChangePassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async () => {
    if (!password || !confirm) return setError(strings.auth.required);
    if (password !== confirm) return setError(strings.password.mismatch);
    setBusy(true);
    setError(null);
    const r = await api.auth.changePassword({ newPassword: password });
    setBusy(false);
    if (r.error) {
      const e = r.error;
      if (e.code === "VALIDATION_FAILED" && e.detail?.split(",").includes("password")) return setError(strings.auth.weakPassword);
      if (e.code === "UNKNOWN_ERROR_CODE" && e.detail === "same_password") return setError(strings.password.samePassword);
      return setError(errorMessage(e));
    }
    setPassword("");
    setConfirm("");
    setSaved(true);
  };

  return (
    <Screen>
      <PageHeader back title={strings.password.title} subtitle={strings.password.subtitle} />
      <FadeContent style={{ marginTop: 12 }}>
        <Field label={strings.auth.newPassword} value={password} onChangeText={(t) => { setPassword(t); setSaved(false); }}
          secureTextEntry autoComplete="new-password" textContentType="newPassword" />
        <Field label={strings.password.confirm} value={confirm} onChangeText={(t) => { setConfirm(t); setSaved(false); }}
          secureTextEntry autoComplete="new-password" textContentType="newPassword" />
        {error && <ErrorBox message={error} />}
        {saved && (
          <View className="bg-surface rounded-2xl p-4 border border-lineSoft my-2" accessibilityLiveRegion="polite">
            <Text className="text-success text-sm">{strings.password.saved}</Text>
          </View>
        )}
      </FadeContent>
      <View style={{ marginTop: 8, gap: 10 }}>
        <StarBorder label={strings.password.save} onPress={submit} loading={busy} />
        {saved && <StarBorder label={strings.link.done} onPress={() => router.back()} variant="dark" />}
      </View>
    </Screen>
  );
}
