// Primary button with a thin gold border. (The animated "Star Border" streak from React Bits was
// removed: Android did not clip it to the button, so it swept across the whole screen.)
import { ActivityIndicator, Pressable } from "react-native";
import { Text } from "../components/Text";
import { colors } from "../theme";

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

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => ({
        opacity: off ? 0.6 : pressed ? 0.85 : 1,
        borderRadius: 14, borderWidth: 1, borderColor: colors.goldLight,
        paddingVertical: 14, paddingHorizontal: 18, alignItems: "center",
        backgroundColor: gold ? colors.gold : colors.surface,
      })}
    >
      {loading ? (
        <ActivityIndicator color={gold ? colors.onGold : colors.gold} />
      ) : (
        <Text style={{ color: gold ? colors.onGold : colors.goldLight, fontWeight: "700", fontSize: 16 }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
