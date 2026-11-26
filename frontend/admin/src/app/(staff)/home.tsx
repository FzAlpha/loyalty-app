// Staff home: who you are, where you are working, and the three counter actions.
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Image, Pressable, View } from "react-native";
import { brand, Text } from "@rewards/ui";
import { ActionTile, Button, Loading, Screen, SectionTitle } from "../../components/ui";
import { useStaff } from "../../lib/queries";
import { signOutStaff } from "../../lib/signout";
import { useWorkplace } from "../../lib/workplace";
import { strings } from "../../strings";

export default function Home() {
  const qc = useQueryClient();
  const staff = useStaff(true);
  const { businessId, businessName } = useWorkplace();
  const [signingOut, setSigningOut] = useState(false);
  const me = staff.data;
  if (!me) return <Screen><Loading /></Screen>;
  const isOwner = me.role === "owner";

  return (
    <Screen onRefresh={() => staff.refetch()} refreshing={staff.isRefetching}>
      <View className="flex-row items-center mt-2">
        <Image source={brand.emblem} style={{ width: 44, height: 44 }} resizeMode="contain" accessibilityIgnoresInvertColors />
        <View className="ml-3 flex-1">
          <Text className="text-goldLight text-2xl font-bold">{strings.home.hello(me.display_name)}</Text>
          <Text className="text-muted text-base">{isOwner ? strings.home.owner : strings.home.executive}</Text>
        </View>
      </View>

      <SectionTitle>{strings.home.workingAt}</SectionTitle>
      <View className="bg-surface rounded-2xl p-4 border border-line flex-row items-center">
        <Text className="text-text text-lg font-bold flex-1">{businessName ?? strings.home.noBusiness}</Text>
        {isOwner && (
          <Pressable onPress={() => router.push("/business")} accessibilityRole="button" hitSlop={10}>
            <Text className="text-gold text-base font-bold">
              {businessId ? strings.home.changeBusiness : strings.home.chooseBusiness}
            </Text>
          </Pressable>
        )}
      </View>

      <SectionTitle>{strings.home.actions}</SectionTitle>
      {/* Offer scans need no picked business: the QR names it and the server checks it. */}
      <ActionTile icon="card-outline" label={strings.home.scanCard} hint={strings.home.scanCardHint}
        disabled={!businessId} onPress={() => router.push("/scan-card")} />
      <ActionTile icon="pricetag-outline" label={strings.home.scanOffer} hint={strings.home.scanOfferHint}
        onPress={() => router.push("/scan-offer")} />
      <ActionTile icon="today-outline" label={strings.home.today} hint={strings.home.todayHint}
        disabled={!businessId} onPress={() => router.push("/today")} />
      {isOwner && (
        <ActionTile icon="business-outline" label={strings.manage.tile} hint={strings.manage.tileHint}
          onPress={() => router.push("/businesses")} />
      )}

      <View style={{ marginTop: 24 }}>
        <Button label={strings.common.signOut} variant="secondary" icon="log-out-outline" loading={signingOut}
          onPress={async () => { setSigningOut(true); await signOutStaff(qc); setSigningOut(false); }} />
      </View>
    </Screen>
  );
}
