// NativeWind v4 on top of babel-preset-expo (which already configures Reanimated/Worklets).
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
  };
};
