// Brand pieces: the Chirag emblem in a gold-ringed badge, and a gold ornament divider.
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Image, Pressable, View, type ViewStyle } from "react-native";
import { ShinyText } from "../fx/ShinyText";
import { Text } from "./Text";
import { strings } from "../strings";
import { brand, colors, gradients } from "../theme";

export function BrandBadge({ size = 56 }: { size?: number }) {
  const ring = Math.max(2, Math.round(size / 24));
  return (
    <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: size / 2, padding: ring }}>
      <LinearGradient colors={gradients.dark} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }}
        style={{ flex: 1, borderRadius: size / 2, alignItems: "center", justifyContent: "center" }}>
        <Image source={brand.emblem} resizeMode="contain" accessibilityLabel={strings.brand.group}
          style={{ width: size * 0.66, height: size * 0.66 }} />
      </LinearGradient>
    </LinearGradient>
  );
}

export function GoldDivider({ style }: { style?: ViewStyle }) {
  const line = { flex: 1, height: 1 } as const;
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 8 }, style]} importantForAccessibility="no">
      <LinearGradient colors={gradients.fadeInGold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={line} />
      <View style={{ width: 6, height: 6, backgroundColor: colors.gold, transform: [{ rotate: "45deg" }] }} />
      <LinearGradient colors={gradients.fadeInGold} start={{ x: 1, y: 0 }} end={{ x: 0, y: 0 }} style={line} />
    </View>
  );
}

// Header used by every inner screen: soft gold glow, badge, shiny title, optional back button.
export function PageHeader({ title, subtitle, back }: { title: string; subtitle?: string; back?: boolean }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <LinearGradient colors={gradients.glow} pointerEvents="none"
        style={{ position: "absolute", top: -96, left: -40, right: -40, height: 260 }} />
      {back && (
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/home"))}
          accessibilityRole="button" accessibilityLabel={strings.common.back} hitSlop={10}
          style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, alignSelf: "flex-start" }}>
          <Ionicons name="chevron-back" size={20} color={colors.gold} />
          <Text className="text-gold">{strings.common.back}</Text>
        </Pressable>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <BrandBadge size={44} />
        <View style={{ flex: 1 }}>
          <ShinyText style={{ fontSize: 24 }} accessibilityRole="header">{title}</ShinyText>
          {subtitle ? <Text className="text-muted text-sm">{subtitle}</Text> : null}
        </View>
      </View>
      <GoldDivider style={{ marginTop: 14 }} />
    </View>
  );
}
