// Colours come from the single theme file (src/theme/colors.json).
const colors = require("./src/theme/colors.json");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: { extend: { colors } },
  plugins: [],
};
