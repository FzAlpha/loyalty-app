// Colours come from the shared theme file (packages/ui/src/theme/colors.json) plus the customer
// app's extras (src/theme/luxury.json).
const colors = {
  ...require("../../packages/ui/src/theme/colors.json"),
  ...require("./src/theme/luxury.json"),
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  // The app is dark-only. "class" avoids a NativeWind web error ("Cannot manually set color scheme,
  // as dark mode is type media") thrown at start-up.
  darkMode: "class",
  theme: { extend: { colors } },
  plugins: [],
};
