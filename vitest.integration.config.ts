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
    include: [
      "server/pipeline-v2/regression.CI-024NATPHARM.test.ts",
      "server/workflow-integration.test.ts",
    ],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 180_000,
  },
});
