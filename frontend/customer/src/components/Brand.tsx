// Brand pieces: the Chirag emblem in a gold-foil ringed badge, a gold ornament divider, the page header.
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Image, Pressable, View, type ViewStyle } from "react-native";
import { Text } from "./Text";
import { strings } from "../strings";
import { brand, colors, gradients } from "../theme";

export function BrandBadge({ size = 56 }: { size?: number }) {
  const ring = Math.max(2, Math.round(size / 24));
  return (
    <LinearGradient colors={gradients.goldFoil} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
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

// Header used by every inner screen: gold eyebrow, large title, optional back button (the glow is in Screen).
export function PageHeader({ title, subtitle, back, eyebrow = strings.brand.group }: {
  title: string; subtitle?: string; back?: boolean; eyebrow?: string;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      {back && (
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/home"))}
          accessibilityRole="button" accessibilityLabel={strings.common.back} hitSlop={10}
          className="bg-surface border border-lineSoft rounded-full items-center justify-center"
          style={{ width: 40, height: 40, marginBottom: 16 }}>
          <Ionicons name="chevron-back" size={20} color={colors.goldLight} />
        </Pressable>
      )}
      <Text className="text-gold text-xs font-bold" style={{ letterSpacing: 2.5 }}>{eyebrow.toUpperCase()}</Text>
      <Text accessibilityRole="header" className="text-text font-extrabold" style={{ fontSize: 30, lineHeight: 36, marginTop: 6 }}>
        {title}
      </Text>
      {subtitle ? <Text className="text-muted text-sm" style={{ marginTop: 4 }}>{subtitle}</Text> : null}
    </View>
  );
}
