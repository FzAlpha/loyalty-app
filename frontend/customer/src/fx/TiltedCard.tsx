// React Native take on React Bits "Tilted Card": tilts toward the finger with a soft glare, springs back on release.
import { LinearGradient } from "expo-linear-gradient";
import { useState, type ReactNode } from "react";
import { View, type GestureResponderEvent, type ViewStyle } from "react-native";
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

type Props = { children: ReactNode; maxTiltDeg?: number; style?: ViewStyle; accessibilityLabel?: string };

export function TiltedCard({ children, maxTiltDeg = 12, style, accessibilityLabel }: Props) {
  const [size, setSize] = useState({ w: 1, h: 1 });
  const px = useSharedValue(0); // -1..1
  const py = useSharedValue(0);
  const pressed = useSharedValue(0);

  const track = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    px.value = withSpring(Math.max(-1, Math.min(1, (locationX / size.w) * 2 - 1)));
    py.value = withSpring(Math.max(-1, Math.min(1, (locationY / size.h) * 2 - 1)));
  };
  const release = () => {
    px.value = withSpring(0);
    py.value = withSpring(0);
    pressed.value = withSpring(0);
  };

  const card = useAnimatedStyle(() => ({
    transform: [
      { perspective: 800 },
      { rotateX: `${-py.value * maxTiltDeg}deg` },
      { rotateY: `${px.value * maxTiltDeg}deg` },
      { scale: 1 + pressed.value * 0.03 },
    ],
  }));
  const glare = useAnimatedStyle(() => ({
    opacity: pressed.value * 0.35,
    transform: [{ translateX: interpolate(px.value, [-1, 1], [-size.w / 2, size.w / 2]) }],
  }));

  return (
    <View
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width || 1, h: e.nativeEvent.layout.height || 1 })}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => { pressed.value = withSpring(1); track(e); }}
      onResponderMove={track}
      onResponderRelease={release}
      onResponderTerminate={release}
    >
      <Animated.View style={[{ borderRadius: 18, overflow: "hidden" }, style, card]}>
        {children}
        <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }, glare]}>
          <LinearGradient
            colors={["transparent", "#ffffff", "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}
