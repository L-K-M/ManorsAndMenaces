import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/server/test/**/*.test.ts", "tests/integration/**/*.test.ts", "apps/web/test/**/*.test.ts"],
    environment: "node",
  },
});
