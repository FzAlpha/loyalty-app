// One offer in a list: a compact dark row with a thin gold-foil top edge and a category icon badge.
// Banner images need the storage bucket (not wired yet), so the icon badge stands in.
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import type { z } from "zod";
import type { EligibleOffer } from "@rewards/shared";
import { memo } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./Text";
import { strings } from "../strings";
import { colors, gradients } from "../theme";
import { fmtDate } from "./ui";

type Offer = z.output<typeof EligibleOffer>;
type Icon = "pricetag" | "people" | "star";

// Icons per seeded category key; unknown keys fall back to a star.
export const categoryIcon: Record<string, Icon> = {
  member_discounts: "pricetag",
  friends_family: "people",
  exclusive_deals: "star",
};
export const iconFor = (key: string | null | undefined): Icon => (key && categoryIcon[key]) || "star";

export const OfferCard = memo(function OfferCard({ offer, businessName, onPress }: { offer: Offer; businessName?: string; onPress?: () => void }) {
  const validity = offer.ends_at ? strings.offers.validTill(fmtDate(offer.ends_at)) : strings.offers.noEnd;
  const value = [
    offer.max_discount_amount != null ? strings.offers.maxDiscount(String(offer.max_discount_amount)) : null,
    offer.min_purchase_amount != null ? strings.offers.minPurchase(String(offer.min_purchase_amount)) : null,
  ].filter(Boolean).join(" · ");
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${offer.title}. ${businessName ?? ""}. ${validity}`}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      className="bg-surface rounded-3xl overflow-hidden mb-3 border border-lineSoft"
    >
      <LinearGradient colors={gradients.goldFoil} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 3 }} />
      <View className="p-4 flex-row">
        <View className="rounded-2xl items-center justify-center" style={{ width: 48, height: 48, backgroundColor: colors.goldSoft }}>
          <Ionicons name={iconFor(offer.category_key)} size={22} color={colors.gold} />
        </View>
        <View className="flex-1 ml-3">
          {businessName ? (
            <Text className="text-gold text-xs font-bold" style={{ letterSpacing: 1 }} numberOfLines={1}>
              {businessName.toUpperCase()}
            </Text>
          ) : null}
          <Text className="text-text text-base font-bold mt-0.5">{offer.title}</Text>
          {offer.description ? <Text className="text-muted text-sm mt-1" numberOfLines={2}>{offer.description}</Text> : null}
          {value ? <Text className="text-goldLight text-sm font-semibold mt-2">{value}</Text> : null}
          <Text className="text-muted text-xs mt-1">{validity}</Text>
        </View>
        {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.muted} style={{ alignSelf: "center" }} /> : null}
      </View>
    </Pressable>
  );
});
