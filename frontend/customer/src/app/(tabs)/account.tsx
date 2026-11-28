import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Avatar } from "../../components/Avatar";
import { PageHeader } from "../../components/Brand";
import { Text } from "../../components/Text";
import {
  ErrorBox, InfoRow, Loading, MenuGroup, MenuRow, Muted, Screen, SectionTitle, fmtDate, fmtMonthYear,
} from "../../components/ui";
import { FadeContent } from "../../fx/FadeContent";
import { StarBorder } from "../../fx/StarBorder";
import { api } from "../../lib/api";
import { useAvatarActions, useAvatarUrl } from "../../lib/avatar";
import { errorMessage } from "../../lib/errors";
import { apiErrorOf, useHistory, useMe } from "../../lib/queries";
import { strings } from "../../strings";
import { colors } from "../../theme";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function Account() {
  const me = useMe();
  const history = useHistory();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const photoUrl = useAvatarUrl(me.data?.avatar);
  const photo = useAvatarActions(me.data?.avatar);
  const photoBusy = photo.change.isPending || photo.remove.isPending;
  const photoError = photo.change.error ?? photo.remove.error;

  const signOut = async () => {
    setBusy(true);
    await api.auth.signOut();
    qc.clear();
    setBusy(false);
  };

  return (
    <Screen tabBar>
      <PageHeader title={strings.account.title} />

      {me.isPending ? <Loading /> : me.error ? (
        <ErrorBox message={errorMessage(apiErrorOf(me.error))} onRetry={() => me.refetch()} />
      ) : me.data ? (
        <FadeContent>
          <View className="items-center mt-2 mb-5">
            <Pressable onPress={() => photo.change.mutate()} disabled={photoBusy} accessibilityRole="button"
              accessibilityLabel={me.data.avatar.path ? strings.account.changePhoto : strings.account.addPhoto}>
              <Avatar name={me.data.full_name} uri={photoUrl} size={104} />
              <View className="items-center justify-center rounded-full border-2 border-bg"
                style={{ position: "absolute", right: 0, bottom: 0, width: 32, height: 32, backgroundColor: colors.gold }}>
                {photoBusy ? <ActivityIndicator size="small" color={colors.bg} />
                  : <Ionicons name="camera" size={16} color={colors.bg} />}
              </View>
            </Pressable>
            <View className="flex-row mt-3" style={{ gap: 16 }}>
              <Pressable onPress={() => photo.change.mutate()} disabled={photoBusy} accessibilityRole="button" hitSlop={8}>
                <Text className="text-goldLight text-xs font-semibold">
                  {photoBusy ? strings.account.photoBusy : me.data.avatar.path ? strings.account.changePhoto : strings.account.addPhoto}
                </Text>
              </Pressable>
              {me.data.avatar.path && !photoBusy ? (
                <Pressable onPress={() => photo.remove.mutate()} accessibilityRole="button" hitSlop={8}>
                  <Text className="text-muted text-xs font-semibold">{strings.account.removePhoto}</Text>
                </Pressable>
              ) : null}
            </View>
            {photoError ? (
              <Text className="text-danger text-xs mt-2 text-center">{errorMessage(apiErrorOf(photoError))}</Text>
            ) : null}
            <Text className="text-text font-extrabold mt-4 text-center" style={{ fontSize: 22 }} numberOfLines={1}>
              {me.data.full_name}
            </Text>
            <View className="flex-row items-center rounded-full px-3 py-1 mt-2" style={{ backgroundColor: colors.goldSoft }}>
              <Ionicons name="ribbon" size={12} color={colors.gold} />
              <Text className="text-goldLight text-xs font-semibold ml-1.5">
                {strings.account.memberSince(fmtMonthYear(me.data.member_since))}
              </Text>
            </View>
          </View>

          <View className="bg-surface rounded-3xl border border-lineSoft overflow-hidden">
            <InfoRow label={strings.account.phone} value={me.data.phone_e164} />
            {me.data.date_of_birth ? <InfoRow label={strings.account.dob} value={fmtDate(me.data.date_of_birth)} /> : null}
            <InfoRow label={strings.account.membership} value={cap(me.data.membership_status)} />
            <InfoRow label={strings.account.status} value={cap(me.data.account_status)} last />
          </View>
        </FadeContent>
      ) : null}

      <SectionTitle>{strings.account.history}</SectionTitle>
      {history.isPending ? <Loading /> : history.error ? (
        <ErrorBox message={errorMessage(apiErrorOf(history.error))} onRetry={() => history.refetch()} />
      ) : (history.data?.length ?? 0) === 0 ? <Muted>{strings.account.noHistory}</Muted> : (
        <View className="bg-surface rounded-3xl border border-lineSoft px-4 pt-4 pb-1">
          {history.data!.map((h, i, all) => (
            <FadeContent key={h.id} index={i} className="flex-row">
              {/* Timeline: gold dot with a line down to the next entry. */}
              <View className="items-center" style={{ width: 20 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.gold, marginTop: 5 }} />
                {i < all.length - 1 && <View className="bg-lineSoft" style={{ width: 2, flex: 1, marginTop: 4 }} />}
              </View>
              <View className="ml-2 flex-1 pb-4">
                <Text className="text-text font-bold">{h.offer_title ?? "—"}</Text>
                <Text className="text-muted text-xs mt-1">
                  {[h.business_name, fmtDate(h.redeemed_at)].filter(Boolean).join(" · ")}
                </Text>
                {h.bill_amount != null ? (
                  <Text className="text-goldLight text-xs font-semibold mt-1">{strings.account.bill(String(h.bill_amount))}</Text>
                ) : null}
              </View>
            </FadeContent>
          ))}
        </View>
      )}

      <SectionTitle>{strings.account.security}</SectionTitle>
      <MenuGroup>
        <MenuRow icon="key-outline" label={strings.account.changePassword} hint={strings.more.passwordHint}
          onPress={() => router.push("/change-password")} />
        <MenuRow icon="trash-outline" label={strings.account.deleteAccount} danger last
          onPress={() => router.push("/delete-account")} />
      </MenuGroup>

      <View style={{ marginTop: 24 }}>
        <StarBorder label={strings.account.signOut} onPress={signOut} loading={busy} variant="dark" />
      </View>
    </Screen>
  );
}
