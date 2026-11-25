// The gold membership card (client design), wrapped in the Tilted Card effect.
import { LinearGradient } from "expo-linear-gradient";
import { View } from "react-native";
import { Text } from "./Text";
import { TiltedCard } from "../fx/TiltedCard";
import { strings } from "../strings";
import { gradients } from "../theme";
import { fmtMonthYear } from "./ui";

type Props = { name: string; memberSince: string; cardNumber: string | null };

export function MembershipCard({ name, memberSince, cardNumber }: Props) {
  const since = strings.home.memberSince(fmtMonthYear(memberSince));
  return (
    <TiltedCard accessibilityLabel={`${strings.brand.member}, ${name}, ${since}, ${cardNumber ?? strings.home.noCard}`}>
      <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 18, minHeight: 180 }}>
        <Text className="text-onGold text-xs font-bold tracking-widest">{strings.brand.member}</Text>
        <Text className="text-onGold text-xl font-bold mt-2" numberOfLines={1}>{name}</Text>
        <Text className="text-onGold text-xs">{since}</Text>
        <View className="flex-1" />
        <Text className="text-onGold text-lg font-bold tracking-widest mt-6" style={{ fontVariant: ["tabular-nums"] }}>
          {cardNumber ?? strings.home.noCard}
        </Text>
        <Text className="text-onGold text-xs mt-1 opacity-80">{strings.brand.program}</Text>
      </LinearGradient>
    </TiltedCard>
  );
}
