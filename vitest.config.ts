import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "server/**/*.spec.ts", "shared/**/*.test.ts", "shared/**/*.spec.ts"],
    exclude: [
      // Integration tests that make real LLM calls — run separately with: pnpm test:integration
      "server/pipeline-v2/regression.CI-024NATPHARM.test.ts",
      "server/workflow-integration.test.ts",
      // Debug/trigger/voltron scripts relocated to server/scripts/ (Fix 7) — not unit tests
      "server/scripts/**",
    ],
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 180_000, // 3 minutes for LLM-heavy integration tests
  },
});
