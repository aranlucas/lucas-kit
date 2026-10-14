import { join } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@test": join(import.meta.dirname, "test"),
      "@": import.meta.dirname,
    },
  },
  test: {
    include: ["test/**/*.test.mjs"],
    environment: "node",
    // Files share subprocess fixtures and filesystem contracts. Keep ordering predictable.
    fileParallelism: false,
    testTimeout: 5_000,
    hookTimeout: 5_000,
  },
});
