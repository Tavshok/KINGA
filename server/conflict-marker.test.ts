import { describe, expect, it } from "vitest";
import { findConflictMarkers, run } from "../scripts/check-conflict-markers.mjs";

describe("conflict-marker safeguard", () => {
  it("detects every standard Git conflict marker at the correct source line", () => {
    expect(findConflictMarkers("one\n<<<<<<< HEAD\ntwo\n=======\nthree\n>>>>>>> feature\n")).toEqual([
      { line: "<<<<<<< HEAD", lineNumber: 2 },
      { line: "=======", lineNumber: 4 },
      { line: ">>>>>>> feature", lineNumber: 6 },
    ]);
  });

  it("permits clean staged content and blocks a staged conflict", () => {
    expect(run({ files: ["clean.ts"], contentForFile: () => "export const clean = true;\n" })).toBe(0);
    expect(run({ files: ["broken.ts"], contentForFile: () => "<<<<<<< HEAD\nold\n=======\nnew\n>>>>>>> branch\n" })).toBe(1);
  });
});
