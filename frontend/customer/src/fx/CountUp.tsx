// React Native take on React Bits "Count Up": counts from 0 to the value with an ease-out.
import { useEffect, useState } from "react";
import { AccessibilityInfo, type TextStyle } from "react-native";
import { Text } from "../components/Text";

type Props = { to: number; durationMs?: number; style?: TextStyle; format?: (n: number) => string };

export function CountUp({ to, durationMs = 1200, style, format = (n) => String(Math.round(n)) }: Props) {
  const [n, setN] = useState(0);

  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) return setN(to);
      const start = Date.now();
      const step = () => {
        const t = Math.min(1, (Date.now() - start) / durationMs);
        setN(to * (1 - Math.pow(1 - t, 3)));
        if (t < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [to, durationMs]);

  return <Text style={style} accessibilityLabel={format(to)}>{format(n)}</Text>;
}
