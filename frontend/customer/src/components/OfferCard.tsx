// One offer in a list. Banner images need the storage bucket (not wired yet), so a gold gradient stands in.
import { LinearGradient } from "expo-linear-gradient";
import type { z } from "zod";
import type { EligibleOffer } from "@rewards/shared";
import { Pressable, View } from "react-native";
import { Text } from "./Text";
import { strings } from "../strings";
import { colors } from "../theme";
import { fmtDate } from "./ui";

type Offer = z.output<typeof EligibleOffer>;

export function OfferCard({ offer, businessName, onPress }: { offer: Offer; businessName?: string; onPress?: () => void }) {
  const validity = offer.ends_at ? strings.offers.validTill(fmtDate(offer.ends_at)) : strings.offers.noEnd;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${offer.title}. ${businessName ?? ""}. ${validity}`}
      className="bg-surface rounded-2xl overflow-hidden mb-3 border border-surface2"
    >
      <LinearGradient colors={["#3a2c0c", colors.goldDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 64 }} />
      <View className="p-3">
        <Text className="text-text text-base font-bold">{offer.title}</Text>
        {offer.description ? <Text className="text-muted text-sm mt-1" numberOfLines={2}>{offer.description}</Text> : null}
        <Text className="text-muted text-xs mt-2">{[businessName, validity].filter(Boolean).join(" · ")}</Text>
        {offer.min_purchase_amount != null || offer.max_discount_amount != null ? (
          <Text className="text-goldLight text-xs mt-1">
            {[
              offer.max_discount_amount != null ? strings.offers.maxDiscount(String(offer.max_discount_amount)) : null,
              offer.min_purchase_amount != null ? strings.offers.minPurchase(String(offer.min_purchase_amount)) : null,
            ].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
