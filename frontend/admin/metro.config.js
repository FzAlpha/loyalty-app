const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// @supabase/realtime-js lazily imports the Node-only "ws" package as a fallback when there is no
// global WebSocket. React Native has one, so that code never runs, but Metro still tries to bundle
// "ws" (and fails on its Node "stream" import). Resolve it to an empty module on native only.
const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "ws" && platform !== "web") return { type: "empty" };
  return (upstreamResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
