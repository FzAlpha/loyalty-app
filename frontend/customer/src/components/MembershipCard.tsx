// The gold-foil membership card, wrapped in the Tilted Card effect.
import { LinearGradient } from "expo-linear-gradient";
import { Image, View } from "react-native";
import { Text } from "./Text";
import { TiltedCard } from "../fx/TiltedCard";
import { strings } from "../strings";
import { brand, colors, gradients } from "../theme";
import { fmtMonthYear } from "./ui";

type Props = { name: string; memberSince: string; cardNumber: string | null; active?: boolean };

// Groups of four for the card number, like a printed card.
const spaced = (n: string) => n.replace(/\s+/g, "").replace(/(.{4})(?=.)/g, "$1  ");

export function MembershipCard({ name, memberSince, cardNumber, active }: Props) {
  const since = strings.home.memberSince(fmtMonthYear(memberSince));
  const ink = { color: colors.onGold };
  return (
    <TiltedCard style={{ borderRadius: 24 }}
      accessibilityLabel={`${strings.brand.member}, ${name}, ${since}, ${cardNumber ?? strings.home.noCard}`}>
      <LinearGradient colors={gradients.goldFoil} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ padding: 20, minHeight: 196 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text className="text-xs font-extrabold" style={[ink, { letterSpacing: 2.5 }]}>{strings.brand.member}</Text>
          <Image source={brand.emblem} resizeMode="contain" style={{ width: 30, height: 30, opacity: 0.85 }}
            accessibilityIgnoresInvertColors />
        </View>
        {/* Card chip */}
        <LinearGradient colors={[colors.cream, colors.goldDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ width: 42, height: 30, borderRadius: 7, marginTop: 18, borderWidth: 1, borderColor: "rgba(26,19,0,0.25)" }} />
        <View style={{ flex: 1 }} />
        <Text className="text-lg font-bold" style={[ink, { letterSpacing: 1.5, marginTop: 16, fontVariant: ["tabular-nums"] }]}>
          {cardNumber ? spaced(cardNumber) : strings.home.noCard}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 10 }}>
          <View style={{ flex: 1 }}>
            <Text className="text-base font-extrabold" style={ink} numberOfLines={1}>{name}</Text>
            <Text className="text-xs font-semibold" style={[ink, { opacity: 0.75 }]}>{since}</Text>
          </View>
          {active != null && (
            <View style={{ backgroundColor: "rgba(26,19,0,0.85)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text className="text-xs font-bold" style={{ color: active ? colors.goldLight : colors.muted }}>
                {active ? strings.card.active : strings.card.pendingShort}
              </Text>
            </View>
          )}
        </View>
      </LinearGradient>
    </TiltedCard>
  );
}
