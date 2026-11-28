import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import type { ComponentProps } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Avatar } from "../../components/Avatar";
import { BrandBadge } from "../../components/Brand";
import { Text } from "../../components/Text";
import { MembershipCard } from "../../components/MembershipCard";
import { iconFor, OfferCard } from "../../components/OfferCard";
import { ErrorBox, Loading, Muted, Screen, SectionTitle } from "../../components/ui";
import { FadeContent } from "../../fx/FadeContent";
import { ShinyText } from "../../fx/ShinyText";
import { useAvatarUrl } from "../../lib/avatar";
import { errorMessage } from "../../lib/errors";
import { apiErrorOf, useBusinesses, useBusinessNames, useCategories, useHistory, useMe, useOffers } from "../../lib/queries";
import { strings } from "../../strings";
import { colors, gradients } from "../../theme";

type Icon = ComponentProps<typeof Ionicons>["name"];

function QuickAction({ icon, label, onPress, primary }: { icon: Icon; label: string; onPress: () => void; primary?: boolean }) {
  const inner = (
    <>
      <Ionicons name={icon} size={22} color={primary ? colors.onGold : colors.gold} />
      <Text className="text-xs font-bold mt-1.5" style={{ color: primary ? colors.onGold : colors.text }}>{label}</Text>
    </>
  );
  const box = { borderRadius: 22, paddingVertical: 14, alignItems: "center" as const };
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.85 : 1 })}>
      {primary ? (
        <LinearGradient colors={gradients.goldFoil} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={box}>{inner}</LinearGradient>
      ) : (
        <View className="bg-surface border border-lineSoft" style={box}>{inner}</View>
      )}
    </Pressable>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View className="bg-surface border border-lineSoft rounded-3xl p-4" style={{ flex: 1 }}>
      <Text className="text-goldLight font-extrabold" style={{ fontSize: 28, fontVariant: ["tabular-nums"] }}>{value}</Text>
      <Text className="text-muted text-xs font-semibold mt-1">{label}</Text>
    </View>
  );
}

export default function Home() {
  const me = useMe();
  const categories = useCategories();
  const businesses = useBusinesses();
  const offers = useOffers();
  const history = useHistory();
  const businessName = useBusinessNames();
  // Group companies and partner businesses are shown separately (businesses.kind).
  const groups = (businesses.data ?? []).filter((b) => b.kind === "group");
  const partnerIds = new Set((businesses.data ?? []).filter((b) => b.kind === "partner").map((b) => b.id));
  const partnerOffers = (offers.data ?? []).filter((o) => partnerIds.has(o.business_id));
  const name = me.data?.full_name ?? strings.brand.group;
  const photoUrl = useAvatarUrl(me.data?.avatar);

  return (
    <Screen tabBar>
      <FadeContent style={{ marginBottom: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Pressable onPress={() => router.push("/(tabs)/account")} accessibilityRole="button" accessibilityLabel={strings.account.title}>
            <Avatar name={name} uri={photoUrl} size={52} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Muted>{strings.home.welcome}</Muted>
            <ShinyText style={{ fontSize: 24, fontWeight: "800" }} accessibilityRole="header">
              {me.data?.full_name.split(" ")[0] ?? strings.brand.group}
            </ShinyText>
          </View>
          <BrandBadge size={40} />
        </View>
      </FadeContent>

      <FadeContent index={1}>
        {me.isPending ? <Loading /> : me.error ? (
          <ErrorBox message={errorMessage(apiErrorOf(me.error))} onRetry={() => me.refetch()} />
        ) : me.data ? (
          <Pressable onLongPress={() => router.push("/(tabs)/card")} accessibilityHint={strings.card.title}>
            <MembershipCard name={me.data.full_name} memberSince={me.data.member_since}
              cardNumber={me.data.card?.card_number ?? null}
              active={me.data.card ? me.data.card.status === "active" : undefined} />
          </Pressable>
        ) : null}
      </FadeContent>

      <FadeContent index={2} style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
        <QuickAction primary icon="qr-code" label={strings.home.showCard} onPress={() => router.push("/(tabs)/card")} />
        <QuickAction icon="gift" label={strings.home.quickOffers} onPress={() => router.push("/(tabs)/offers")} />
        <QuickAction icon="storefront" label={strings.home.quickPartners} onPress={() => router.push("/partners")} />
      </FadeContent>

      <FadeContent index={3} style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
        <Stat value={offers.data ? String(offers.data.length) : "–"} label={strings.home.statOffers} />
        <Stat value={history.data ? String(history.data.length) : "–"} label={strings.home.statRedeemed} />
      </FadeContent>

      <SectionTitle>{strings.home.benefits}</SectionTitle>
      {categories.error ? <ErrorBox message={errorMessage(apiErrorOf(categories.error))} /> : (
        <View style={{ flexDirection: "row", gap: 10 }}>
          {(categories.data ?? []).map((c, i) => (
            <FadeContent key={c.id} index={i} delayMs={150} style={{ flex: 1 }}>
              <Pressable
                onPress={() => router.push({ pathname: "/(tabs)/offers", params: { category: c.key } })}
                accessibilityRole="button"
                className="bg-surface border border-lineSoft rounded-3xl py-4 px-2 items-center"
              >
                <View className="rounded-2xl items-center justify-center" style={{ width: 42, height: 42, backgroundColor: colors.goldSoft }}>
                  <Ionicons name={iconFor(c.key)} size={20} color={colors.gold} />
                </View>
                <Text className="text-text text-xs font-semibold text-center mt-2">{c.name}</Text>
              </Pressable>
            </FadeContent>
          ))}
        </View>
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

      <SectionTitle>{strings.home.companies}</SectionTitle>
      {businesses.isPending ? <Loading /> : groups.length === 0 ? (
        <Muted>{strings.home.noCompanies}</Muted>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {groups.map((b) => (
            <View key={b.id} className="bg-surface border border-lineSoft rounded-3xl p-3 items-center" style={{ width: 112 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: b.brand_color ?? colors.goldDark,
                alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.goldDark }}>
                <Text style={{ color: colors.onGold, fontWeight: "800", fontSize: 18 }}>{b.name.slice(0, 1)}</Text>
              </View>
              <Text className="text-text text-xs font-semibold text-center mt-2" numberOfLines={2}>{b.name}</Text>
            </View>
          ))}
        </ScrollView>
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
