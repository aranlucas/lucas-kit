import type { E2EConfig } from "e2e";

// This product exposes CLI processes, not a browser or device surface.
export default {
  tests: "e2e/**/*.e2e.ts",
  targets: [{ name: "cli", platform: "cli" }],
  retries: 0,
} satisfies E2EConfig;
