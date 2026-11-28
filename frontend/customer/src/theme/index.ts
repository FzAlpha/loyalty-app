// Customer theme: the shared black-and-gold theme (packages/ui, also used by the admin app) plus the
// customer app's "luxury" extras. Extra colours live in luxury.json so Tailwind reads the same values.
import { colors as base, gradients as baseGradients } from "@rewards/ui";
import luxury from "./luxury.json";

export { brand } from "@rewards/ui";

export const colors = { ...base, ...luxury };

export const gradients = {
  ...baseGradients,
  // Metallic gold foil for the member card, primary buttons and the avatar ring.
  goldFoil: [luxury.goldDeep, "#e9c46a", luxury.cream, "#c99a2e", base.goldLight, base.goldDark] as const,
  // Dark panel with a faint warm top edge (cards, sheets).
  panel: [luxury.surface3, base.surface] as const,
};

// Customer typeface: Manrope (SIL Open Font License 1.1). One family per weight; the keys here must
// match the names loaded with useFonts in src/app/_layout.tsx.
export const fonts = {
  regular: "Manrope_400Regular",
  semibold: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
  extrabold: "Manrope_800ExtraBold",
} as const;
