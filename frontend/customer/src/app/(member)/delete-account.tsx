// Customer account deletion (account-deletion Edge Function). Irreversible: typed word + final dialog.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Platform, View } from "react-native";
import { PageHeader } from "../../components/Brand";
import { Text } from "../../components/Text";
import { ErrorBox, Field, Screen, fmtDate } from "../../components/ui";
import { FadeContent } from "../../fx/FadeContent";
import { StarBorder } from "../../fx/StarBorder";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { strings } from "../../strings";
import { colors } from "../../theme";

const t = strings.deletion;

export default function DeleteAccount() {
  const qc = useQueryClient();
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const armed = word.trim().toUpperCase() === t.confirmWord;

  const finish = async () => {
    await api.auth.signOut();
    qc.clear(); // the guards send the user to sign-in once the session is gone
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    const r = await api.accounts.requestDeletion();
    if (r.error) {
      setBusy(false);
      // Already requested: nothing left to do here except sign out.
      if (r.error.code === "ACCOUNT_DELETION_PENDING") return finish();
      return setError(errorMessage(r.error));
    }
    setDoneMsg(t.done(fmtDate(r.data.process_after)));
    setTimeout(finish, 2500);
  };

  const confirm = () => {
    if (!armed) return;
    if (Platform.OS === "web") return run(); // RN Alert has no buttons on web; the typed word is the confirmation
    Alert.alert(t.finalTitle, t.finalBody, [
      { text: strings.common.cancel, style: "cancel" },
      { text: t.submit, style: "destructive", onPress: run },
    ]);
  };

  return (
    <Screen>
      <PageHeader back title={t.title} subtitle={t.subtitle} />
      <FadeContent className="bg-surface rounded-2xl p-4 mt-3 border" style={{ borderColor: colors.danger }}>
        {t.what.map((line) => (
          <View key={line} className="flex-row mb-2">
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} style={{ marginTop: 2 }} />
            <Text className="text-text text-sm ml-2 flex-1">{line}</Text>
          </View>
        ))}
      </FadeContent>

      {doneMsg ? (
        <View className="bg-surface rounded-xl p-4 border border-line mt-4" accessibilityLiveRegion="polite">
          <Text className="text-text text-sm">{doneMsg}</Text>
        </View>
      ) : (
        <FadeContent index={1} style={{ marginTop: 16 }}>
          <Field label={t.typeToConfirm(t.confirmWord)} value={word} onChangeText={setWord}
            autoCapitalize="characters" autoCorrect={false} placeholder={t.confirmWord} />
          {error && <ErrorBox message={error} />}
          <View style={{ marginTop: 8, opacity: armed ? 1 : 0.5 }}>
            <StarBorder label={t.submit} onPress={confirm} loading={busy} disabled={!armed} variant="dark" />
          </View>
        </FadeContent>
      )}
    </Screen>
  );
}
