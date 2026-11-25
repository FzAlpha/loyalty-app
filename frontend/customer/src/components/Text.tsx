// App-wide Text: applies the theme typeface. Custom fonts ship one family per weight, so a bold
// weight (from className "font-bold"/"font-semibold" or style fontWeight) maps to theme fonts.bold.
import { StyleSheet, Text as RNText, type TextProps } from "react-native";
import { fonts } from "../theme";

const BOLD_CLASS = /\bfont-(semibold|bold|extrabold|black)\b/;
const BOLD_WEIGHTS = new Set(["bold", "600", "700", "800", "900"]);

export function Text({ className, style, ...rest }: TextProps) {
  const weight = StyleSheet.flatten(style)?.fontWeight;
  const bold = BOLD_CLASS.test(className ?? "") || (weight != null && BOLD_WEIGHTS.has(String(weight)));
  return (
    <RNText
      {...rest}
      className={className}
      style={[style, {
        fontFamily: bold ? fonts.bold : fonts.regular,
        // A real bold family needs no extra weight; a single-weight family needs "bold" to thicken.
        fontWeight: bold && fonts.bold === fonts.regular ? "bold" : "normal",
      }]}
    />
  );
}
