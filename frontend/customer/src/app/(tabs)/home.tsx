import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, ScrollView, View } from "react-native";
import { BrandBadge, GoldDivider } from "../../components/Brand";
import { Text } from "../../components/Text";
import { MembershipCard } from "../../components/MembershipCard";
import { OfferCard } from "../../components/OfferCard";
import { ErrorBox, Loading, Muted, Screen, SectionTitle } from "../../components/ui";
import { FadeContent } from "../../fx/FadeContent";
import { ShinyText } from "../../fx/ShinyText";
import { errorMessage } from "../../lib/errors";
import { apiErrorOf, useBusinesses, useBusinessNames, useCategories, useMe, useOffers } from "../../lib/queries";
import { strings } from "../../strings";
import { colors, gradients } from "../../theme";

// Icons per seeded category key; unknown keys fall back to a star.
const categoryIcon: Record<string, "pricetag" | "people" | "star"> = {
  member_discounts: "pricetag",
  friends_family: "people",
  exclusive_deals: "star",
};

export default function Home() {
  const me = useMe();
  const categories = useCategories();
  const businesses = useBusinesses();
  const offers = useOffers();
  const businessName = useBusinessNames();
  // Group companies and partner businesses are shown separately (businesses.kind).
  const groups = (businesses.data ?? []).filter((b) => b.kind === "group");
  const partnerIds = new Set((businesses.data ?? []).filter((b) => b.kind === "partner").map((b) => b.id));
  const partnerOffers = (offers.data ?? []).filter((o) => partnerIds.has(o.business_id));

  return (
    <Screen>
      <LinearGradient colors={gradients.glow} pointerEvents="none"
        style={{ position: "absolute", top: -80, left: -40, right: -40, height: 320 }} />
      <FadeContent style={{ marginBottom: 18 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <BrandBadge size={58} />
          <View style={{ flex: 1 }}>
            <Muted>{strings.home.welcome}</Muted>
            <ShinyText style={{ fontSize: 22 }} accessibilityRole="header">
              {me.data?.full_name.split(" ")[0] ?? strings.brand.group}
            </ShinyText>
            <Text className="text-goldDark text-xs tracking-widest mt-0.5" numberOfLines={1}>
              {strings.brand.program.toUpperCase()}
            </Text>
          </View>
        </View>
        <GoldDivider style={{ marginTop: 16 }} />
      </FadeContent>

      <FadeContent index={1}>
        {me.isPending ? <Loading /> : me.error ? (
          <ErrorBox message={errorMessage(apiErrorOf(me.error))} onRetry={() => me.refetch()} />
        ) : me.data ? (
          <Pressable onLongPress={() => router.push("/(tabs)/card")} accessibilityHint={strings.card.title}>
            <MembershipCard name={me.data.full_name} memberSince={me.data.member_since}
              cardNumber={me.data.card?.card_number ?? null} />
          </Pressable>
        ) : null}
      </FadeContent>

      <SectionTitle>{strings.home.benefits}</SectionTitle>
      {categories.error ? <ErrorBox message={errorMessage(apiErrorOf(categories.error))} /> : (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(categories.data ?? []).map((c, i) => (
            <FadeContent key={c.id} index={i} delayMs={150} style={{ flex: 1 }}>
              <Pressable
                onPress={() => router.push({ pathname: "/(tabs)/offers", params: { category: c.key } })}
                accessibilityRole="button"
                className="bg-surface border border-line rounded-xl py-3 px-1 items-center"
              >
                <Ionicons name={categoryIcon[c.key] ?? "star"} size={22} color={colors.gold} />
                <Text className="text-text text-xs text-center mt-2">{c.name}</Text>
              </Pressable>
            </FadeContent>
          ))}
        </View>
      )}

      <SectionTitle>{strings.home.companies}</SectionTitle>
      {businesses.isPending ? <Loading /> : groups.length === 0 ? (
        <Muted>{strings.home.noCompanies}</Muted>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {groups.map((b) => (
            <View key={b.id} className="bg-surface border border-line rounded-xl p-3 items-center" style={{ width: 110 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: b.brand_color ?? colors.goldDark,
                alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: colors.onGold, fontWeight: "700", fontSize: 18 }}>{b.name.slice(0, 1)}</Text>
              </View>
              <Text className="text-text text-xs text-center mt-2" numberOfLines={2}>{b.name}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      <SectionTitle action={{ label: strings.home.seeAll, onPress: () => router.push("/(tabs)/offers") }}>
        {strings.home.latestOffers}
      </SectionTitle>
      {offers.isPending ? <Loading /> : offers.error ? (
        <ErrorBox message={errorMessage(apiErrorOf(offers.error))} onRetry={() => offers.refetch()} />
      ) : (offers.data?.length ?? 0) === 0 ? <Muted>{strings.offers.none}</Muted> : (
        offers.data!.slice(0, 3).map((o, i) => (
          <FadeContent key={o.id} index={i}>
            <OfferCard offer={o} businessName={businessName(o.business_id)}
              onPress={() => router.push({ pathname: "/(tabs)/offers", params: { offer: o.id } })} />
          </FadeContent>
        ))
      )}

      <SectionTitle action={{ label: strings.home.seeAll, onPress: () => router.push("/partners") }}>
        {strings.home.partners}
      </SectionTitle>
      {offers.isPending || businesses.isPending ? <Loading /> : partnerOffers.length === 0 ? <Muted>{strings.partners.none}</Muted> : (
        partnerOffers.slice(0, 2).map((o, i) => (
          <FadeContent key={o.id} index={i}>
            <OfferCard offer={o} businessName={businessName(o.business_id)}
              onPress={() => router.push({ pathname: "/(tabs)/offers", params: { offer: o.id } })} />
          </FadeContent>
        ))
      )}
    </Screen>
  );
}
