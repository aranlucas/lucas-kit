import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "orch/**/*.test.ts",
      "watch-pr/**/*.test.ts",
      "check-plan.test.ts",
      "bootstrap.test.ts",
    ],
    fileParallelism: false,
  },
});
