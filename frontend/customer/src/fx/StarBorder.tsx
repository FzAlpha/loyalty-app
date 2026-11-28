// Primary button. "gold" is a metallic gold-foil pill; "dark" is an outlined gold pill. (The animated
// "Star Border" streak from React Bits was removed: Android did not clip it to the button.)
import { LinearGradient } from "expo-linear-gradient";
import { ActivityIndicator, Pressable } from "react-native";
import { Text } from "../components/Text";
import { colors, gradients } from "../theme";

type Props = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "gold" | "dark";
};

export function StarBorder({ label, onPress, loading, disabled, variant = "gold" }: Props) {
  const off = disabled || loading;
  const gold = variant === "gold";
  const content = loading ? (
    <ActivityIndicator color={gold ? colors.onGold : colors.gold} />
  ) : (
    <Text style={{ color: gold ? colors.onGold : colors.goldLight, fontWeight: "800", fontSize: 16, letterSpacing: 0.3 }}>
      {label}
    </Text>
  );
  const box = { borderRadius: 999, paddingVertical: 16, paddingHorizontal: 20, alignItems: "center" as const };

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => ({ opacity: off ? 0.55 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}
    >
      <LinearGradient
        colors={gold ? gradients.goldFoil : gradients.panel}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={gold ? box : [box, { borderWidth: 1, borderColor: colors.goldDark }]}
      >
        {content}
      </LinearGradient>
    </Pressable>
  );
}
