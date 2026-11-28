// Jest resolver: same rules as react-native-reanimated/jest/resolver (and the worklets resolver it calls),
// but it decides by the package that owns `basedir`, not by a substring of the whole path.
// Why: pnpm names reanimated's store folder ".pnpm/react-native-reanimated@x_react-native-worklets@y_...",
// so the upstream `basedir.includes('react-native-worklets')` check also matches every reanimated file and
// loads its web variants (e.g. ReducedMotion.ts → window.matchMedia), which crashes on Linux CI.
// WEB_ONLY mirrors reanimated 4.7.1's list; src/__tests__/jestResolver.test.ts fails if upstream changes it.

const WEB_ONLY_IN_JEST = [
  "initializers",
  "mutables",
  "mappers",
  "ConfigHelper",
  "UpdateLayoutAnimations",
  "useAnimatedRef",
  "useAnimatedStyle",
  "WorkletEventHandler",
  "JSPropsUpdater",
  "updateProps",
  "util",
  "css/component/AnimatedComponent",
];

/** Name of the package that owns `dir` (the segment after the last node_modules/). */
function ownerPackage(dir) {
  const parts = dir.replace(/\\/g, "/").split("/node_modules/");
  if (parts.length < 2) return null;
  const rest = parts[parts.length - 1].split("/");
  return rest[0].startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0];
}

const withoutNative = (options) => ({
  ...options,
  extensions: options.extensions?.filter((ext) => !ext.includes("native")),
});

/** @type {import('jest-resolve').SyncResolver} */
function resolver(request, options) {
  const owner = ownerPackage(options.basedir);
  const basename = request.split("/").pop();
  const webOnly = WEB_ONLY_IN_JEST.some((e) => (e.includes("/") ? request.endsWith(e) : basename === e));
  if (owner === "react-native-reanimated" && request.startsWith(".") && webOnly) {
    return options.defaultResolver(request, withoutNative(options));
  }
  if (owner === "react-native-worklets" || request.includes("react-native-worklets")) {
    return options.defaultResolver(request, withoutNative(options));
  }
  return options.defaultResolver(request, options);
}

module.exports = resolver;
module.exports.WEB_ONLY_IN_JEST = WEB_ONLY_IN_JEST;
module.exports.ownerPackage = ownerPackage;
