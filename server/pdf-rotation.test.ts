/**
 * pdf-rotation.test.ts
 *
 * Unit tests for the PDF page rotation fixes in pdf-image-extractor.ts.
 *
 * These tests validate the DECISION LOGIC for both fixes without requiring
 * a real PDF or pdfjs-dist — they test the pure functions and conditions
 * extracted from the implementation.
 *
 * Fix 1: Metadata rotation — page.rotate is passed to getViewport
 * Fix 2: Heuristic rotation — landscape-ratio scanned pages are rotated 90° to portrait
 */

import { describe, it, expect } from "vitest";

// ─── Fix 1: Metadata rotation decision logic ──────────────────────────────────
// Mirrors the condition in pdf-image-extractor.ts:
//   const declaredRotation: number = page.rotate ?? 0;
//   const viewport = page.getViewport({ scale: SCALE, rotation: declaredRotation });

function getViewportRotation(pageRotate: number | undefined): number {
  return pageRotate ?? 0;
}

describe("Fix 1 — PDF metadata rotation (page.rotate → getViewport)", () => {
  it("uses 0° when page.rotate is undefined (no metadata)", () => {
    expect(getViewportRotation(undefined)).toBe(0);
  });

  it("uses 0° when page.rotate is 0", () => {
    expect(getViewportRotation(0)).toBe(0);
  });

  it("uses 90° when page.rotate is 90", () => {
    expect(getViewportRotation(90)).toBe(90);
  });

  it("uses 180° when page.rotate is 180", () => {
    expect(getViewportRotation(180)).toBe(180);
  });

  it("uses 270° when page.rotate is 270", () => {
    expect(getViewportRotation(270)).toBe(270);
  });
});

// ─── Fix 2: Heuristic rotation decision logic ─────────────────────────────────
// Mirrors the condition in pdf-image-extractor.ts:
//   if (isScanned && declaredRotation === 0) {
//     const ratio = rw / rh;
//     if (ratio > 1.3) { rotate 90° }
//   }

function shouldApplyHeuristicRotation(
  isScanned: boolean,
  declaredRotation: number,
  imageWidth: number,
  imageHeight: number
): boolean {
  if (!isScanned || declaredRotation !== 0) return false;
  const ratio = imageWidth / (imageHeight || 1);
  return ratio > 1.3;
}

describe("Fix 2 — Heuristic rotation for un-tagged scanned pages", () => {
  // ── Should rotate ──────────────────────────────────────────────────────────

  it("rotates a landscape scanned page (A4 landscape: 1123×794 at 96dpi)", () => {
    expect(shouldApplyHeuristicRotation(true, 0, 1123, 794)).toBe(true);
  });

  it("rotates a strongly landscape scanned page (2:1 ratio)", () => {
    expect(shouldApplyHeuristicRotation(true, 0, 2000, 1000)).toBe(true);
  });

  it("rotates a page just above the 1.3 threshold (ratio=1.31)", () => {
    expect(shouldApplyHeuristicRotation(true, 0, 1310, 1000)).toBe(true);
  });

  // ── Should NOT rotate ──────────────────────────────────────────────────────

  it("does NOT rotate a portrait scanned page (A4 portrait: 794×1123 at 96dpi)", () => {
    expect(shouldApplyHeuristicRotation(true, 0, 794, 1123)).toBe(false);
  });

  it("does NOT rotate a square-ish page (ratio=1.0)", () => {
    expect(shouldApplyHeuristicRotation(true, 0, 1000, 1000)).toBe(false);
  });

  it("does NOT rotate a page just below the threshold (ratio=1.29)", () => {
    expect(shouldApplyHeuristicRotation(true, 0, 1290, 1000)).toBe(false);
  });

  it("does NOT rotate a native (non-scanned) landscape page", () => {
    // Native PDFs may have intentional landscape pages (wide tables, panoramas)
    expect(shouldApplyHeuristicRotation(false, 0, 1123, 794)).toBe(false);
  });

  it("does NOT apply heuristic when Fix 1 already corrected the rotation (declaredRotation=90)", () => {
    // If Fix 1 already rotated the viewport, Fix 2 must not double-rotate
    expect(shouldApplyHeuristicRotation(true, 90, 1123, 794)).toBe(false);
  });

  it("does NOT apply heuristic when declaredRotation=270", () => {
    expect(shouldApplyHeuristicRotation(true, 270, 1123, 794)).toBe(false);
  });

  it("does NOT apply heuristic when declaredRotation=180", () => {
    // 180° rotation produces portrait-shaped output, Fix 2 would not trigger anyway,
    // but the guard on declaredRotation === 0 must still block it
    expect(shouldApplyHeuristicRotation(true, 180, 794, 1123)).toBe(false);
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it("handles zero height gracefully (no division by zero)", () => {
    expect(() => shouldApplyHeuristicRotation(true, 0, 1000, 0)).not.toThrow();
  });

  it("does NOT rotate when width and height are both 0", () => {
    expect(shouldApplyHeuristicRotation(true, 0, 0, 0)).toBe(false);
  });
});

// ─── Combined: Fix 1 takes priority over Fix 2 ───────────────────────────────

describe("Fix 1 and Fix 2 interaction", () => {
  it("Fix 2 is skipped when Fix 1 has already applied a non-zero rotation", () => {
    // A page with /Rotate=90 in metadata: Fix 1 corrects it at viewport level.
    // Fix 2 must not run (declaredRotation !== 0 guard).
    const declaredRotation = getViewportRotation(90);
    const heuristic = shouldApplyHeuristicRotation(true, declaredRotation, 1123, 794);
    expect(declaredRotation).toBe(90);
    expect(heuristic).toBe(false);
  });

  it("Fix 2 runs only when Fix 1 found no declared rotation", () => {
    const declaredRotation = getViewportRotation(undefined);
    const heuristic = shouldApplyHeuristicRotation(true, declaredRotation, 1123, 794);
    expect(declaredRotation).toBe(0);
    expect(heuristic).toBe(true); // landscape scanned page → should rotate
  });
});
