// React Native take on React Bits "Fade Content" / "Animated List": fade + rise in on mount, staggered by index.
import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";

type Props = {
  children: ReactNode; index?: number; delayMs?: number; staggerMs?: number; style?: ViewStyle; className?: string;
  /** Items at this index or later render without an entering animation. */
  maxAnimated?: number;
};

// Only the first screenful animates: long lists would otherwise start one spring per row, which stalls
// low-end phones and delays the later rows by index × stagger.
export const MAX_ANIMATED_ITEMS = 8;

export function FadeContent({ children, index = 0, delayMs = 0, staggerMs = 70, style, className, maxAnimated = MAX_ANIMATED_ITEMS }: Props) {
  if (index >= maxAnimated) {
    return <View style={style} className={className}>{children}</View>;
  }
  return (
    <Animated.View
      style={style}
      entering={FadeInDown.delay(delayMs + index * staggerMs).duration(450).springify().damping(18)
        .reduceMotion(ReduceMotion.System)}
    >
      {/* NativeWind classes go on a plain View; the animated wrapper only handles motion. */}
      {className ? <View className={className}>{children}</View> : children}
    </Animated.View>
  );
}
