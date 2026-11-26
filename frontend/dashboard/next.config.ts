import type { NextConfig } from "next";

// Workspace packages ship TypeScript source (with .ts import extensions), so Next compiles them.
const config: NextConfig = {
  transpilePackages: ["@rewards/api", "@rewards/shared", "@rewards/backend"],
};

export default config;
