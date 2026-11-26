// Building blocks for the admin screens: the customer app's black/gold theme, with plainer and larger
// controls for quick use at the counter.
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, TextInput, View, type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fonts, Text } from "@rewards/ui";
import { strings } from "../strings";

type IconName = ComponentProps<typeof Ionicons>["name"];

export function Screen({ children, onRefresh, refreshing = false }: {
  children: ReactNode; onRefresh?: () => void; refreshing?: boolean;
}) {
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh
          ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} colors={[colors.gold]} />
          : undefined}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Header({ title, subtitle, back }: { title: string; subtitle?: string; back?: boolean }) {
  return (
    <View className="mb-4">
      {back && (
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))}
          accessibilityRole="button" accessibilityLabel={strings.common.back} hitSlop={12}
          className="flex-row items-center mb-3" style={{ alignSelf: "flex-start" }}>
          <Ionicons name="chevron-back" size={22} color={colors.gold} />
          <Text className="text-gold text-base">{strings.common.back}</Text>
        </Pressable>
      )}
      <Text accessibilityRole="header" className="text-goldLight text-2xl font-bold">{title}</Text>
      {subtitle ? <Text className="text-muted text-base mt-1">{subtitle}</Text> : null}
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <Text accessibilityRole="header" className="text-gold text-sm font-bold tracking-wider mt-6 mb-2">{children}</Text>;
}

type ButtonVariant = "primary" | "secondary" | "danger";
export function Button({ label, onPress, variant = "primary", loading, disabled, icon }: {
  label: string; onPress: () => void; variant?: ButtonVariant; loading?: boolean; disabled?: boolean; icon?: IconName;
}) {
  const off = disabled || loading;
  const bg = variant === "primary" ? colors.gold : colors.surface;
  const fg = variant === "primary" ? colors.onGold : variant === "danger" ? colors.danger : colors.text;
  const border = variant === "danger" ? colors.danger : variant === "primary" ? colors.gold : colors.line;
  return (
    <Pressable onPress={onPress} disabled={off} accessibilityRole="button" accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => ({
        backgroundColor: bg, borderColor: border, borderWidth: 1, opacity: off ? 0.5 : pressed ? 0.85 : 1,
        minHeight: 56, borderRadius: 14, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center",
      })}>
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon ? <Ionicons name={icon} size={20} color={fg} style={{ marginRight: 8 }} /> : null}
          <Text className="text-lg font-bold" style={{ color: fg }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

// Large tappable action on the home screen.
export function ActionTile({ icon, label, hint, onPress, disabled }: {
  icon: IconName; label: string; hint: string; onPress: () => void; disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({ opacity: disabled ? 0.45 : pressed ? 0.85 : 1 })}
      className="bg-surface rounded-2xl p-5 mb-3 border border-line flex-row items-center">
      <View className="rounded-full items-center justify-center bg-surface2"
        style={{ width: 52, height: 52, borderWidth: 1, borderColor: colors.gold }}>
        <Ionicons name={icon} size={26} color={colors.gold} />
      </View>
      <View className="flex-1 ml-4">
        <Text className="text-text text-lg font-bold">{label}</Text>
        <Text className="text-muted text-sm mt-0.5">{hint}</Text>
      </View>
      <Ionicons name="chevron-forward" size={22} color={colors.muted} />
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View className="mb-3">
      <Text className="text-muted text-base mb-1">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        className="bg-surface text-text rounded-xl px-4 border border-line"
        {...props}
        style={[{ fontFamily: fonts.regular, fontSize: 18, minHeight: 54 }, props.style]}
      />
    </View>
  );
}

export function Checkbox({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <Pressable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked }}
      className="flex-row items-center bg-surface rounded-xl border border-line px-4 mb-2" style={{ minHeight: 56 }}>
      <Ionicons name={checked ? "checkbox" : "square-outline"} size={26} color={checked ? colors.gold : colors.muted} />
      <Text className="text-text text-base ml-3 flex-1">{label}</Text>
    </Pressable>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View className="py-10 items-center" accessibilityLabel={label ?? strings.common.loading}>
      <ActivityIndicator color={colors.gold} size="large" />
      {label ? <Text className="text-muted text-base mt-3">{label}</Text> : null}
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View className="bg-surface rounded-xl p-4 border my-2" style={{ borderColor: colors.danger }} accessibilityRole="alert">
      <Text className="text-danger text-base">{message}</Text>
      {onRetry && (
        <Pressable onPress={onRetry} accessibilityRole="button" className="mt-3" hitSlop={8}>
          <Text className="text-gold text-base font-bold">{strings.common.retry}</Text>
        </Pressable>
      )}
    </View>
  );
}

// Big status panel: success, refusal or a notice, with optional actions below.
export function Panel({ tone, title, body, children }: {
  tone: "success" | "danger" | "info"; title: string; body?: string; children?: ReactNode;
}) {
  const icon: IconName = tone === "success" ? "checkmark-circle" : tone === "danger" ? "close-circle" : "information-circle";
  const tint = tone === "success" ? colors.success : tone === "danger" ? colors.danger : colors.gold;
  return (
    <View className="bg-surface border border-line rounded-2xl p-6 mt-2 items-center" accessibilityLiveRegion="polite">
      <Ionicons name={icon} size={56} color={tint} />
      <Text className="text-text text-xl font-bold mt-3 text-center">{title}</Text>
      {body ? <Text className="text-muted text-base mt-2 text-center">{body}</Text> : null}
      {children ? <View style={{ alignSelf: "stretch", marginTop: 18, gap: 10 }}>{children}</View> : null}
    </View>
  );
}

// Label/value rows for scan results.
export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between py-3 border-b border-line">
      <Text className="text-muted text-base">{label}</Text>
      <Text className="text-text text-base font-bold flex-1 text-right ml-4">{value}</Text>
    </View>
  );
}

export function InfoCard({ children }: { children: ReactNode }) {
  return <View className="bg-surface rounded-2xl px-4 border border-line mb-3">{children}</View>;
}

export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
export const fmtAmount = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
