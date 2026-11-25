// React Native take on React Bits "Shiny Text": a light band sweeps across gold text.
import MaskedViewBase from "@react-native-masked-view/masked-view";
import type { ComponentType } from "react";
import type { ViewProps } from "react-native";

// The library ships a class type that React 19 typings reject; the runtime component is unchanged.
const MaskedView = MaskedViewBase as unknown as ComponentType<ViewProps & { maskElement: React.ReactElement }>;
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { Platform, View, type TextStyle } from "react-native";
import { Text } from "../components/Text";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { colors } from "../theme";

type Props = { children: string; style?: TextStyle; speedMs?: number; accessibilityRole?: "header" };

export function ShinyText({ children, style, speedMs = 2800, accessibilityRole }: Props) {
  const [width, setWidth] = useState(0);
  const x = useSharedValue(-1);

  useEffect(() => {
    x.value = withRepeat(withTiming(1, { duration: speedMs, easing: Easing.inOut(Easing.quad) }), -1, false);
  }, [speedMs, x]);

  const band = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * width }] }));
  const base: TextStyle = { color: colors.gold, fontWeight: "700", ...style };

  // MaskedView is native-only; on web fall back to plain gold text.
  if (Platform.OS === "web") {
    return <Text style={base} accessibilityRole={accessibilityRole}>{children}</Text>;
  }

  return (
    <MaskedView
      accessible
      accessibilityRole={accessibilityRole}
      accessibilityLabel={children}
      maskElement={<Text style={base}>{children}</Text>}
    >
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {/* Invisible copy keeps the size of the text. */}
        <Text style={[base, { opacity: 0 }]}>{children}</Text>
        <View style={{ position: "absolute", inset: 0, backgroundColor: colors.gold }} />
        <Animated.View style={[{ position: "absolute", top: 0, bottom: 0, width: "100%" }, band]}>
          <LinearGradient
            colors={["transparent", "#fff6d6", "transparent"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      </View>
    </MaskedView>
  );
}
