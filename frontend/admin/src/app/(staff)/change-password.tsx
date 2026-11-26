// Forced first-sign-in password change: Supabase Auth sets the password, then
// api.staff_password_changed clears must_change_password.
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button, ErrorBox, Field, Header, Screen } from "../../components/ui";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { keys } from "../../lib/queries";
import { strings } from "../../strings";

export default function ChangePassword() {
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setFor, setSetFor] = useState<string | null>(null); // the password Auth already accepted

  const submit = async () => {
    if (!password || !confirm) return setError(strings.auth.required);
    if (password !== confirm) return setError(strings.password.mismatch);
    setBusy(true);
    setError(null);
    // If the password was set but clearing the flag failed, a retry only repeats the flag call.
    if (setFor !== password) {
      const r = await api.auth.changePassword({ newPassword: password });
      if (r.error) {
        setBusy(false);
        const e = r.error;
        if (e.code === "VALIDATION_FAILED" && e.detail?.split(",").includes("password")) return setError(strings.password.weak);
        if (e.code === "UNKNOWN_ERROR_CODE" && e.detail === "same_password") return setError(strings.password.same);
        return setError(errorMessage(e));
      }
      setSetFor(password);
    }
    const done = await api.auth.staffPasswordChanged();
    setBusy(false);
    if (done.error) return setError(errorMessage(done.error));
    await qc.invalidateQueries({ queryKey: keys.staff });
    router.replace("/home");
  };

  return (
    <Screen>
      <Header title={strings.password.forcedTitle} subtitle={strings.password.forcedSubtitle} />
      <Field label={strings.password.newPassword} value={password} onChangeText={setPassword}
        secureTextEntry autoComplete="new-password" textContentType="newPassword" />
      <Field label={strings.password.confirm} value={confirm} onChangeText={setConfirm}
        secureTextEntry autoComplete="new-password" textContentType="newPassword" onSubmitEditing={submit} />
      {error && <ErrorBox message={error} />}
      <View style={{ marginTop: 8 }}>
        <Button label={strings.password.save} onPress={submit} loading={busy} />
      </View>
    </Screen>
  );
}
