import { describe, expect, it } from "vitest";
import { build } from "esbuild";
import path from "node:path";

describe("AdminPortalLayout client compilation", () => {
  it("bundles without a duplicate icon declaration", async () => {
    await expect(build({
      entryPoints: [path.resolve(process.cwd(), "client/src/components/AdminPortalLayout.tsx")],
      bundle: true,
      write: false,
      platform: "browser",
      format: "esm",
      packages: "external",
      jsx: "automatic",
      tsconfig: path.resolve(process.cwd(), "tsconfig.json"),
    })).resolves.toBeDefined();
  });
});
