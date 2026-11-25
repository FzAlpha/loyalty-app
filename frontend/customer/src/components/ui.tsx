// Small shared building blocks for the customer screens.
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View, type TextInputProps } from "react-native";
import { Text } from "./Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fonts } from "../theme";
import { strings } from "../strings";

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View className="flex-1 p-4">{children}</View>
      )}
    </SafeAreaView>
  );
}

export function SectionTitle({ children, action }: { children: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View className="mt-6 mb-3 flex-row items-center justify-between">
      <View className="flex-row items-center">
        <View className="bg-gold rounded-full mr-2" style={{ width: 3, height: 14 }} />
        <Text accessibilityRole="header" className="text-goldLight text-sm font-bold tracking-wider">{children}</Text>
      </View>
      {action && (
        <Pressable onPress={action.onPress} accessibilityRole="link" hitSlop={8}>
          <Text className="text-gold text-sm">{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View className="mb-3">
      <Text className="text-muted text-sm mb-1">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        className="bg-surface text-text rounded-xl px-4 py-3 text-base border border-line"
        {...props}
        style={[{ fontFamily: fonts.regular }, props.style]}
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
    <View className="bg-surface rounded-xl p-4 border border-line my-2" accessibilityRole="alert">
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
      <Text className="text-gold">{children}</Text>
    </Pressable>
  );
}

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
export const fmtMonthYear = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", year: "numeric" });

// A tappable settings-style row: gold icon chip, label, optional hint, chevron.
export function MenuRow({ icon, label, hint, onPress, danger }: {
  icon: ComponentProps<typeof Ionicons>["name"]; label: string; hint?: string; onPress: () => void; danger?: boolean;
}) {
  const tint = danger ? colors.danger : colors.gold;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityHint={hint}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
      className="bg-surface rounded-2xl p-4 mb-2 border border-line flex-row items-center">
      <View className="rounded-full items-center justify-center bg-surface2"
        style={{ width: 38, height: 38, borderWidth: 1, borderColor: danger ? colors.danger : colors.line }}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <View className="flex-1 ml-3">
        <Text className={danger ? "text-danger text-base" : "text-text text-base"}>{label}</Text>
        {hint ? <Text className="text-muted text-xs mt-0.5">{hint}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}
