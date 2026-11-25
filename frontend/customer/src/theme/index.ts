// The one theme file. Tailwind classes (bg-gold, text-muted, ...) read the same colors.json.
import colors from "./colors.json";

export { colors };

export const gradients = {
  gold: [colors.goldDark, colors.goldLight, colors.goldDark] as const,
  goldShine: [colors.gold, "#fff6d6", colors.gold] as const,
  dark: ["#1b1b1b", colors.bg] as const,
  // Line that fades in from transparent to gold (dividers).
  fadeInGold: ["transparent", colors.gold] as const,
  // Soft gold light at the top of a screen.
  glow: ["rgba(212,175,55,0.16)", "transparent"] as const,
};

export const brand = {
  logo: require("../../assets/brand/chirag-logo.png"),
  // C + flame cut out of chirag-logo.png, transparent background (for small badges).
  emblem: require("../../assets/brand/chirag-emblem.png"),
  wordmark: require("../../assets/brand/chirag-group-wordmark.png"),
};

// App typeface: Delius (SIL Open Font License 1.1, free to bundle). Delius ships one weight only, so
// bold text uses the same family and the platform thickens it (see components/Text.tsx).
// Family names must match the keys loaded with useFonts in src/app/_layout.tsx.
export const fonts = {
  regular: "Delius_400Regular",
  bold: "Delius_400Regular",
} as const;
