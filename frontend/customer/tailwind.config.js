// Colours come from the single shared theme file (packages/ui/src/theme/colors.json).
const colors = require("../../packages/ui/src/theme/colors.json");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: { extend: { colors } },
  plugins: [],
};
