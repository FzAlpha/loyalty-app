// Small shared building blocks for the customer screens.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useState, type ComponentProps, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View, type TextInputProps } from "react-native";
import { Text } from "./Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { colors, fonts, gradients } from "../theme";
import { strings } from "../strings";

// Bottom space so content clears the floating tab bar (tabs/_layout.tsx).
export const TAB_BAR_SPACE = 112;

// Side padding of every screen. Non-scrolling screens (e.g. a FlatList) apply it themselves so rows
// such as chip strips can scroll edge to edge.
export const SCREEN_PAD = 20;
const GLOW_HEIGHT = 320;

export function Screen({ children, scroll = true, tabBar = false }: { children: ReactNode; scroll?: boolean; tabBar?: boolean }) {
  return (
    <SafeAreaView className="flex-1 bg-bg" style={{ overflow: "hidden" }} edges={["top", "left", "right"]}>
      {/* Soft gold glow across the top, full width so it never has side edges or widens the page. */}
      <LinearGradient colors={gradients.glow} pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: GLOW_HEIGHT }} />
      {scroll ? (
        <ScrollView contentContainerStyle={{ padding: SCREEN_PAD, paddingBottom: tabBar ? TAB_BAR_SPACE : 32 }}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View className="flex-1" style={{ paddingTop: SCREEN_PAD }}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function SectionTitle({ children, action }: { children: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View className="mt-7 mb-3 flex-row items-center justify-between">
      <Text accessibilityRole="header" className="text-gold text-xs font-bold" style={{ letterSpacing: 2 }}>{children}</Text>
      {action && (
        <Pressable onPress={action.onPress} accessibilityRole="link" hitSlop={8} className="flex-row items-center">
          <Text className="text-goldLight text-sm font-semibold">{action.label}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.goldLight} />
        </Pressable>
      )}
    </View>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View className="mb-4">
      <Text className="text-muted text-xs font-semibold mb-2" style={{ letterSpacing: 1 }}>{label.toUpperCase()}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        className="bg-surface text-text rounded-2xl px-4 text-base"
        {...props}
        onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
        style={[{ fontFamily: fonts.regular, paddingVertical: 14, borderWidth: 1, borderColor: focused ? colors.gold : colors.lineSoft }, props.style]}
      />
    </View>
  );
}

export function Loading() {
  return (
    <View className="py-10 items-center" accessibilityLabel={strings.common.loading}>
      <ActivityIndicator color={colors.gold} />
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View className="bg-surface rounded-2xl p-4 border border-lineSoft my-2" accessibilityRole="alert">
      <Text className="text-danger text-sm">{message}</Text>
      {onRetry && (
        <Pressable onPress={onRetry} accessibilityRole="button" className="mt-2">
          <Text className="text-gold font-bold">{strings.common.retry}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text className="text-muted text-sm">{children}</Text>;
}

export function LinkText({ children, onPress }: { children: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8} className="py-2 items-center">
      <Text className="text-goldLight font-semibold">{children}</Text>
    </Pressable>
  );
}

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
export const fmtMonthYear = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", year: "numeric" });

// A tappable settings-style row: gold icon chip, label, optional hint, chevron. Put rows in a MenuGroup
// to draw them as one rounded panel with hairline separators.
export function MenuRow({ icon, label, hint, onPress, danger, last }: {
  icon: ComponentProps<typeof Ionicons>["name"]; label: string; hint?: string; onPress: () => void; danger?: boolean; last?: boolean;
}) {
  const tint = danger ? colors.danger : colors.gold;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityHint={hint}
      style={({ pressed }) => ({ backgroundColor: pressed ? colors.surface2 : "transparent" })}
      className="px-4 py-3.5 flex-row items-center">
      <View className="rounded-xl items-center justify-center"
        style={{ width: 36, height: 36, backgroundColor: danger ? "rgba(255,107,107,0.12)" : colors.goldSoft }}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <View className="flex-1 ml-3">
        <Text className={danger ? "text-danger text-base font-semibold" : "text-text text-base font-semibold"}>{label}</Text>
        {hint ? <Text className="text-muted text-xs mt-0.5">{hint}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      {!last && <View className="bg-lineSoft" style={{ position: "absolute", left: 64, right: 0, bottom: 0, height: 1 }} />}
    </Pressable>
  );
}

export function MenuGroup({ children }: { children: ReactNode }) {
  return <View className="bg-surface rounded-3xl border border-lineSoft overflow-hidden">{children}</View>;
}

// A label / value line inside a grouped panel.
export function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View className="px-4 py-3.5 flex-row items-center justify-between">
      <Text className="text-muted text-sm">{label}</Text>
      <Text className="text-text text-sm font-semibold" numberOfLines={1} style={{ flexShrink: 1, marginLeft: 12 }}>{value}</Text>
      {!last && <View className="bg-lineSoft" style={{ position: "absolute", left: 16, right: 0, bottom: 0, height: 1 }} />}
    </View>
  );
}
