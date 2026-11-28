/// <reference types="jest" />
// Guards the custom Jest resolver (jest.resolver.js) that fixes the Linux-CI-only failure
// "window.matchMedia is not a function" caused by pnpm's store folder names.
import fs from "fs";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const resolver = require("../../jest.resolver.js");

const EXT = [".native.ts", ".ts", ".native.js", ".js"];
// The folder name pnpm uses on Linux CI (peer names appended), which broke the upstream check.
const CI_BASEDIR =
  "/home/runner/work/app/node_modules/.pnpm/react-native-reanimated@4.7.1_react-native-worklets@0.13.0_x/node_modules/react-native-reanimated/src/animation";

function extsUsed(request: string, basedir: string): string[] {
  let seen: string[] = [];
  resolver(request, {
    basedir,
    extensions: EXT,
    defaultResolver: (_r: string, o: { extensions: string[] }) => {
      seen = o.extensions;
      return "x";
    },
  });
  return seen;
}

describe("jest.resolver", () => {
  it("keeps native files for reanimated even when the pnpm folder name mentions worklets", () => {
    expect(extsUsed("../ReducedMotion", CI_BASEDIR)).toEqual(EXT);
  });

  it("uses web files for reanimated's web-only modules", () => {
    expect(extsUsed("./util", CI_BASEDIR)).toEqual([".ts", ".js"]);
  });

  it("uses web files inside react-native-worklets", () => {
    const dir = "C:\\repo\\node_modules\\.pnpm\\react-native-worklets@0.13.0\\node_modules\\react-native-worklets\\src";
    expect(extsUsed("./index", dir)).toEqual([".ts", ".js"]);
  });

  it("finds the owning package, including scoped ones", () => {
    expect(resolver.ownerPackage(CI_BASEDIR)).toBe("react-native-reanimated");
    expect(resolver.ownerPackage("/a/node_modules/@scope/pkg/lib")).toBe("@scope/pkg");
  });

  it("mirrors reanimated's web-only list (fails if reanimated changes it)", () => {
    const src = fs.readFileSync(require.resolve("react-native-reanimated/jest/resolver"), "utf8");
    const block = src.match(/WEB_ONLY_IN_JEST = new Set\(\[([\s\S]*?)\]\)/);
    expect(block).not.toBeNull();
    const upstream = [...block![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect([...resolver.WEB_ONLY_IN_JEST].sort()).toEqual(upstream.sort());
  });
});
