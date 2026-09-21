import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("Stage 7 governing VGE boundary", () => {
  it("does not substitute raw Stage 6 visual crush for insufficient VGE/VGR", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "stage-7-physics.ts"),
      "utf8"
    );
    expect(source).toContain("function resolveCalibratedCrushDepth");
    expect(source).toContain("const visionCrushDepthM = calibratedCrushDepthM");
    expect(source).toContain("documentCrushDepthM: null");
    expect(source).toContain("inferredCrushDepthM: null");
    expect(source).not.toContain("inferCrushDepth");
    expect(source).not.toContain("_rawLlmMax");
    expect(source).not.toContain("visionDepthsFromParts");
  });
});
