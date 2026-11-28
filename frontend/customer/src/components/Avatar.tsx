// Member avatar: a gold-foil ring around the profile photo, or the member's initials when there is none.
import { LinearGradient } from "expo-linear-gradient";
import { Image, View } from "react-native";
import { Text } from "./Text";
import { colors, gradients } from "../theme";

export const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "•";

export function Avatar({ name, uri, size = 48 }: { name: string; uri?: string | null; size?: number }) {
  const ring = Math.max(2, Math.round(size / 28));
  const inner = size - ring * 2;
  return (
    <LinearGradient colors={gradients.goldFoil} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: size / 2, padding: ring }}>
      <View style={{ flex: 1, borderRadius: inner / 2, overflow: "hidden", backgroundColor: colors.surface2,
        alignItems: "center", justifyContent: "center" }}>
        {uri ? (
          <Image source={{ uri }} style={{ width: inner, height: inner }} accessibilityIgnoresInvertColors />
        ) : (
          <Text className="text-goldLight font-extrabold" style={{ fontSize: inner * 0.38 }}>{initialsOf(name)}</Text>
        )}
      </View>
    </LinearGradient>
  );
}
