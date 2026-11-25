import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { View } from "react-native";
import { PageHeader } from "../../components/Brand";
import { Text } from "../../components/Text";
import { ErrorBox, Loading, MenuRow, Muted, Screen, SectionTitle, fmtDate, fmtMonthYear } from "../../components/ui";
import { FadeContent } from "../../fx/FadeContent";
import { StarBorder } from "../../fx/StarBorder";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { apiErrorOf, useHistory, useMe } from "../../lib/queries";
import { strings } from "../../strings";
import { colors, gradients } from "../../theme";

function Row({ icon, label, value, last }: {
  icon: "call-outline" | "calendar-outline" | "ribbon-outline" | "person-circle-outline"; label: string; value: string; last?: boolean;
}) {
  return (
    <View className={`flex-row items-center py-3 ${last ? "" : "border-b border-surface2"}`}>
      <Ionicons name={icon} size={16} color={colors.gold} />
      <Text className="text-muted text-sm ml-2 flex-1">{label}</Text>
      <Text className="text-text text-sm capitalize">{value}</Text>
    </View>
  );
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

export default function Account() {
  const me = useMe();
  const history = useHistory();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    await api.auth.signOut();
    qc.clear();
    setBusy(false);
  };

  return (
    <Screen>
      <PageHeader title={strings.account.title} />

      {me.isPending ? <Loading /> : me.error ? (
        <ErrorBox message={errorMessage(apiErrorOf(me.error))} onRetry={() => me.refetch()} />
      ) : me.data ? (
        <FadeContent className="bg-surface rounded-3xl px-4 pt-4 pb-1 border border-line mt-2">
          <View className="flex-row items-center mb-2">
            <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" }}>
              <Text className="text-onGold text-xl font-bold">{initials(me.data.full_name) || "?"}</Text>
            </LinearGradient>
            <View className="ml-3 flex-1">
              <Text className="text-text text-lg font-bold" numberOfLines={1}>{me.data.full_name}</Text>
              <Text className="text-goldLight text-xs">{strings.account.memberSince(fmtMonthYear(me.data.member_since))}</Text>
            </View>
          </View>
          <Row icon="call-outline" label={strings.account.phone} value={me.data.phone_e164} />
          {me.data.date_of_birth ? <Row icon="calendar-outline" label={strings.account.dob} value={fmtDate(me.data.date_of_birth)} /> : null}
          <Row icon="ribbon-outline" label={strings.account.membership} value={me.data.membership_status} />
          <Row icon="person-circle-outline" label={strings.account.status} value={me.data.account_status} last />
        </FadeContent>
      ) : null}

      <SectionTitle>{strings.account.history}</SectionTitle>
      {history.isPending ? <Loading /> : history.error ? (
        <ErrorBox message={errorMessage(apiErrorOf(history.error))} onRetry={() => history.refetch()} />
      ) : (history.data?.length ?? 0) === 0 ? <Muted>{strings.account.noHistory}</Muted> : (
        history.data!.map((h, i) => (
          <FadeContent key={h.id} index={i} className="bg-surface rounded-xl p-3 mb-2 border border-surface2 flex-row items-center">
            <View className="rounded-full items-center justify-center bg-surface2" style={{ width: 34, height: 34 }}>
              <Ionicons name="checkmark-done" size={16} color={colors.success} />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-text font-bold">{h.offer_title ?? "—"}</Text>
              <Text className="text-muted text-xs mt-1">
                {[h.business_name, fmtDate(h.redeemed_at), h.bill_amount != null ? strings.account.bill(String(h.bill_amount)) : null]
                  .filter(Boolean).join(" · ")}
              </Text>
            </View>
          </FadeContent>
        ))
      )}

      <SectionTitle>{strings.account.security}</SectionTitle>
      <MenuRow icon="key-outline" label={strings.account.changePassword} hint={strings.more.passwordHint}
        onPress={() => router.push("/change-password")} />
      <MenuRow icon="trash-outline" label={strings.account.deleteAccount} danger
        onPress={() => router.push("/delete-account")} />

      <View style={{ marginTop: 20 }}>
        <StarBorder label={strings.account.signOut} onPress={signOut} loading={busy} variant="dark" />
      </View>
    </Screen>
  );
}
