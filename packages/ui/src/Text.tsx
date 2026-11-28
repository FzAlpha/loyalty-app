// App-wide Text: applies a typeface. Custom fonts ship one family per weight, so a heavier weight
// (from className "font-semibold"/"font-bold"/"font-extrabold" or style fontWeight) maps to that
// weight's family. createText lets an app pick its own families; Text uses the shared theme fonts.
import { StyleSheet, Text as RNText, type TextProps } from "react-native";
import { fonts as themeFonts } from "./theme";

export type FontFamilies = { regular: string; bold: string; semibold?: string; extrabold?: string };
type Weight = "regular" | "semibold" | "bold" | "extrabold";

const CLASS_WEIGHT: [RegExp, Weight][] = [
  [/\bfont-(extrabold|black)\b/, "extrabold"],
  [/\bfont-bold\b/, "bold"],
  [/\bfont-semibold\b/, "semibold"],
];
const STYLE_WEIGHT: Record<string, Weight> = {
  "600": "semibold", "700": "bold", bold: "bold", "800": "extrabold", "900": "extrabold",
};

function weightOf(className: string | undefined, fontWeight: unknown): Weight {
  for (const [re, w] of CLASS_WEIGHT) if (re.test(className ?? "")) return w;
  return (fontWeight != null && STYLE_WEIGHT[String(fontWeight)]) || "regular";
}

export function createText(f: FontFamilies) {
  const family = (w: Weight) =>
    w === "regular" ? f.regular : w === "bold" ? f.bold : (w === "semibold" ? f.semibold : f.extrabold) ?? f.bold;

  return function Text({ className, style, ...rest }: TextProps) {
    const w = weightOf(className, StyleSheet.flatten(style)?.fontWeight);
    const fontFamily = family(w);
    return (
      <RNText
        {...rest}
        className={className}
        style={[style, {
          fontFamily,
          // A real weight family needs no extra weight; a single-weight family needs "bold" to thicken.
          fontWeight: w !== "regular" && fontFamily === f.regular ? "bold" : "normal",
        }]}
      />
    );
  };
}

export const Text = createText(themeFonts);
