// Offers by category, with the claim QR. A claim is redeemed only when the store confirms it online.
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, View } from "react-native";
import { PageHeader } from "../../components/Brand";
import { Text } from "../../components/Text";
import { LinearGradient } from "expo-linear-gradient";
import QRCode from "react-native-qrcode-svg";
import type { ApiError } from "@rewards/shared";
import { OfferCard } from "../../components/OfferCard";
import { ErrorBox, Loading, Muted, Screen } from "../../components/ui";
import { FadeContent } from "../../fx/FadeContent";
import { StarBorder } from "../../fx/StarBorder";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { apiErrorOf, useBusinessNames, useCategories, useOffers } from "../../lib/queries";
import { strings } from "../../strings";
import { gradients } from "../../theme";

type Claim = { qr_payload: string; expires_at: string; title: string };

export default function Offers() {
  const params = useLocalSearchParams<{ category?: string; offer?: string }>();
  const [category, setCategory] = useState<string | null>(params.category ?? null);
  const [selected, setSelected] = useState<string | null>(params.offer ?? null);
  const [claim, setClaim] = useState<Claim | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<ApiError | null>(null);

  useEffect(() => { if (params.category !== undefined) setCategory(params.category); }, [params.category]);
  useEffect(() => { if (params.offer !== undefined) setSelected(params.offer); }, [params.offer]);

  const categories = useCategories();
  const offers = useOffers();
  const businessName = useBusinessNames();
  const list = useMemo(() => (offers.data ?? []).filter((o) => !category || o.category_key === category),
    [offers.data, category]);
  const chosen = offers.data?.find((o) => o.id === selected) ?? null;
  const open = useCallback((id: string) => { setSelected(id); setClaimError(null); }, []);

  const getClaim = async () => {
    if (!chosen) return;
    setClaiming(true);
    setClaimError(null);
    const r = await api.claims.create({ offerId: chosen.id });
    setClaiming(false);
    if (r.error) return setClaimError(r.error);
    setClaim({ qr_payload: r.data.qr_payload, expires_at: r.data.expires_at, title: chosen.title });
  };

  const chips = [{ key: null as string | null, name: strings.offers.all }, ...(categories.data ?? []).map((c) => ({ key: c.key, name: c.name }))];

  const header = (
    <>
      <PageHeader title={strings.offers.title} subtitle={strings.offers.subtitle} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 12 }}>
        {chips.map((c) => {
          const on = c.key === category;
          return (
            <Pressable key={c.key ?? "all"} onPress={() => setCategory(c.key)} accessibilityRole="button"
              accessibilityState={{ selected: on }}
              className={`px-4 py-2 rounded-full border ${on ? "bg-gold border-gold" : "bg-surface border-line"}`}>
              <Text className={on ? "text-onGold font-bold" : "text-text"}>{c.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </>
  );

  return (
    <Screen scroll={false}>
      {/* Virtualized: only rows near the viewport are mounted, so long offer lists stay light on memory. */}
      <FlatList
        testID="offers-list"
        data={offers.isPending || offers.error ? [] : list}
        keyExtractor={(o) => `${category}-${o.id}`}
        ListHeaderComponent={header}
        ListEmptyComponent={offers.isPending ? <Loading /> : offers.error ? (
          <ErrorBox message={errorMessage(apiErrorOf(offers.error))} onRetry={() => offers.refetch()} />
        ) : <Muted>{strings.offers.none}</Muted>}
        renderItem={({ item: o, index: i }) => (
          <FadeContent index={i}>
            <OfferCard offer={o} businessName={businessName(o.business_id)} onPress={() => open(o.id)} />
          </FadeContent>
        )}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      />

      {/* Offer detail + claim */}
      <Modal visible={!!chosen} transparent animationType="slide" onRequestClose={() => { setSelected(null); setClaim(null); }}>
        <View className="flex-1 justify-end" style={{ backgroundColor: "#000a" }}>
          <View className="bg-bg rounded-t-3xl p-5 border-t border-gold">
            <View className="bg-line rounded-full self-center mb-4" style={{ width: 44, height: 4 }} />
            {chosen && !claim && (
              <>
                <Text className="text-goldLight text-xs">{businessName(chosen.business_id)}</Text>
                <Text className="text-text text-xl font-bold mt-1">{chosen.title}</Text>
                {chosen.description ? <Text className="text-muted text-sm mt-2">{chosen.description}</Text> : null}
                {chosen.terms ? <Text className="text-muted text-xs mt-3">{chosen.terms}</Text> : null}
                {claimError && <ErrorBox message={errorMessage(claimError)} />}
                <View style={{ marginTop: 16 }}>
                  <StarBorder label={strings.offers.claim} onPress={getClaim} loading={claiming} />
                </View>
              </>
            )}
            {claim && (
              <View style={{ alignItems: "center" }}>
                <Text className="text-text text-lg font-bold">{strings.offers.claimTitle}</Text>
                <Text className="text-goldLight text-sm mt-1">{claim.title}</Text>
                <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={{ padding: 3, borderRadius: 22, marginTop: 16 }}>
                  <View style={{ backgroundColor: "#fff", padding: 16, borderRadius: 19 }}
                    accessible accessibilityLabel={strings.offers.claimTitle}>
                    <QRCode value={claim.qr_payload} size={200} color="#000" backgroundColor="#fff" />
                  </View>
                </LinearGradient>
                <Text className="text-muted text-xs mt-3">
                  {strings.offers.claimExpires(new Date(claim.expires_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }))}
                </Text>
                <Text className="text-muted text-xs mt-2 text-center">{strings.offers.claimHint}</Text>
              </View>
            )}
            <Pressable onPress={() => { setSelected(null); setClaim(null); }} accessibilityRole="button" className="py-4 items-center">
              <Text className="text-gold">{strings.common.close}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
