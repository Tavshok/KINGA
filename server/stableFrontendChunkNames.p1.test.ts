import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("stable frontend chunk naming", () => {
  it("keeps lazy JavaScript entry and chunk paths stable across deployments", () => {
    const viteConfig = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");

    expect(viteConfig).toContain('entryFileNames: "assets/[name].js"');
    expect(viteConfig).toContain('chunkFileNames: "assets/[name].js"');
    expect(viteConfig).toContain('assetFileNames: "assets/[name]-[hash][extname]"');
  });
});
