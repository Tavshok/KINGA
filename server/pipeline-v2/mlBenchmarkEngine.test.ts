/**
 * mlBenchmarkEngine.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the hybrid ML + statistical benchmark inference engine.
 *
 * Tests cover:
 *   1. GBM tree evaluation (leaf traversal)
 *   2. Feature vector construction (make encoding, age clipping)
 *   3. Model routing (ML → statistical → none)
 *   4. Verdict computation (IN_RANGE, ABOVE_RANGE, BELOW_RANGE)
 *   5. assessCostBatch correctness
 *   6. getModelInfo metadata
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ─── Mock fs so we don't need real model files in CI ─────────────────────────

// Minimal GBM model with a single tree that always returns the same leaf value
function makeMockGBMModel(leafValue: number, makeCategories: string[] = ["Toyota", "Nissan", "Honda"]) {
  return {
    learning_rate: 1.0,
    init_prediction: 0.0,
    feature_names: ["make_ordinal", "vehicle_age"],
    make_categories: makeCategories,
    trees: [
      {
        // Single-node tree: node 0 is a leaf (children = -1)
        children_left: [-1],
        children_right: [-1],
        feature: [-2], // TREE_UNDEFINED for leaf
        threshold: [-2.0],
        value: [leafValue],
      },
    ],
  };
}

function makeMockMLModelFile(componentId: string, p25Leaf: number, p50Leaf: number, p75Leaf: number) {
  return JSON.stringify({
    component_id: componentId,
    n_training: 500,
    model_version: "1.0.0",
    trained_at: "2026-05-14T00:00:00.000Z",
    insample_iqr_coverage: 0.501,
    insample_mape_p50: 45.0,
    p25: makeMockGBMModel(p25Leaf),
    p50: makeMockGBMModel(p50Leaf),
    p75: makeMockGBMModel(p75Leaf),
  });
}

// Mock statistical benchmarks file
const mockBenchmarks = JSON.stringify({
  generated_at: "2026-05-14T00:00:00.000Z",
  total_benchmarks: 2,
  benchmarks: [
    {
      component_id: "front_bumper",
      make: null,
      n: 120,
      p25: 150,
      median: 300,
      p75: 500,
      p95: 800,
      confidence: "HIGH",
    },
    {
      component_id: "front_bumper",
      make: "Toyota",
      n: 45,
      p25: 140,
      median: 280,
      p75: 460,
      p95: 750,
      confidence: "MEDIUM",
    },
    {
      component_id: "windscreen",
      make: null,
      n: 80,
      p25: 200,
      median: 350,
      p75: 600,
      p95: 900,
      confidence: "HIGH",
    },
  ],
});

// We need to mock fs.existsSync and fs.readFileSync before importing the module
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    existsSync: vi.fn((filePath: string) => {
      const p = String(filePath);
      if (p.includes("ml-models/engine.json")) return true;
      if (p.includes("ml-models/front_bumper.json")) return false;
      if (p.includes("component_benchmarks.json")) return true;
      return false;
    }),
    readFileSync: vi.fn((filePath: string, _encoding?: string) => {
      const p = String(filePath);
      if (p.includes("ml-models/engine.json")) {
        // log(1) = 0, so expm1(0) = 0; use actual log values
        // log1p(999) ≈ 6.908, log1p(1999) ≈ 7.601, log1p(3999) ≈ 8.294
        return makeMockMLModelFile("engine", 6.908, 7.601, 8.294);
      }
      if (p.includes("component_benchmarks.json")) {
        return mockBenchmarks;
      }
      return actual.readFileSync(filePath, _encoding as any);
    }),
  };
});

// Import after mocking
const { assessCost, assessCostBatch, getModelInfo } = await import("./mlBenchmarkEngine");

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("mlBenchmarkEngine — GBM tree evaluation", () => {
  it("evaluates a single-leaf tree correctly", async () => {
    // engine model: p25 ≈ expm1(6.908) ≈ 999, p75 ≈ expm1(8.294) ≈ 3999
    const result = assessCost({
      componentId: "engine",
      quotedCostUsd: 2000,
      vehicleMake: "Toyota",
      vehicleYear: 2015,
    });
    expect(result.modelSource).toBe("ml");
    expect(result.p25).toBeGreaterThan(900);
    expect(result.p25).toBeLessThan(1100);
    expect(result.p75).toBeGreaterThan(3500);
    expect(result.p75).toBeLessThan(4500);
  });

  it("returns IN_RANGE when quoted cost is between p25 and p75", () => {
    const result = assessCost({
      componentId: "engine",
      quotedCostUsd: 2000,
      vehicleMake: "Toyota",
      vehicleYear: 2015,
    });
    expect(result.verdict).toBe("IN_RANGE");
  });

  it("returns ABOVE_RANGE when quoted cost exceeds p75", () => {
    const result = assessCost({
      componentId: "engine",
      quotedCostUsd: 9999,
      vehicleMake: "Toyota",
      vehicleYear: 2015,
    });
    expect(result.verdict).toBe("ABOVE_RANGE");
  });

  it("returns BELOW_RANGE when quoted cost is below p25", () => {
    const result = assessCost({
      componentId: "engine",
      quotedCostUsd: 50,
      vehicleMake: "Toyota",
      vehicleYear: 2015,
    });
    expect(result.verdict).toBe("BELOW_RANGE");
  });
});

describe("mlBenchmarkEngine — statistical fallback", () => {
  it("falls back to statistical model for front_bumper (no ML model)", () => {
    const result = assessCost({
      componentId: "front_bumper",
      quotedCostUsd: 350,
      vehicleMake: "Toyota",
      vehicleYear: 2018,
    });
    // Toyota-specific benchmark should be used (p25=140, p75=460)
    expect(result.modelSource).toBe("statistical");
    expect(result.p25).toBe(140);
    expect(result.p75).toBe(460);
    expect(result.confidence).toBe("MEDIUM");
  });

  it("uses global benchmark when make-specific not found", () => {
    const result = assessCost({
      componentId: "front_bumper",
      quotedCostUsd: 350,
      vehicleMake: "Subaru", // not in mock data
      vehicleYear: 2018,
    });
    expect(result.modelSource).toBe("statistical");
    expect(result.p25).toBe(150); // global benchmark
    expect(result.p75).toBe(500);
    expect(result.confidence).toBe("HIGH");
  });

  it("returns IN_RANGE for front_bumper at median price", () => {
    const result = assessCost({
      componentId: "front_bumper",
      quotedCostUsd: 300,
      vehicleMake: "Subaru",
      vehicleYear: 2020,
    });
    expect(result.verdict).toBe("IN_RANGE");
  });

  it("returns ABOVE_RANGE for front_bumper at 2x p75", () => {
    const result = assessCost({
      componentId: "front_bumper",
      quotedCostUsd: 1500,
      vehicleMake: "Subaru",
      vehicleYear: 2020,
    });
    expect(result.verdict).toBe("ABOVE_RANGE");
  });
});

describe("mlBenchmarkEngine — no data fallback", () => {
  it("returns INSUFFICIENT_DATA for unknown component", () => {
    const result = assessCost({
      componentId: "flux_capacitor",
      quotedCostUsd: 9999,
    });
    expect(result.verdict).toBe("INSUFFICIENT_DATA");
    expect(result.modelSource).toBe("none");
    expect(result.p25).toBeNull();
    expect(result.p50).toBeNull();
    expect(result.p75).toBeNull();
  });
});

describe("mlBenchmarkEngine — assessCostBatch", () => {
  it("processes multiple items correctly", () => {
    const results = assessCostBatch([
      { componentId: "engine", quotedCostUsd: 2000, vehicleMake: "Toyota", vehicleYear: 2015 },
      { componentId: "front_bumper", quotedCostUsd: 350, vehicleMake: "Toyota", vehicleYear: 2018 },
      { componentId: "flux_capacitor", quotedCostUsd: 9999 },
    ]);
    expect(results).toHaveLength(3);
    expect(results[0].modelSource).toBe("ml");
    expect(results[1].modelSource).toBe("statistical");
    expect(results[2].modelSource).toBe("none");
  });

  it("returns correct verdicts for batch", () => {
    const results = assessCostBatch([
      { componentId: "engine", quotedCostUsd: 2000, vehicleMake: "Toyota", vehicleYear: 2015 },
      { componentId: "engine", quotedCostUsd: 50000, vehicleMake: "Toyota", vehicleYear: 2015 },
    ]);
    expect(results[0].verdict).toBe("IN_RANGE");
    expect(results[1].verdict).toBe("ABOVE_RANGE");
  });
});

describe("mlBenchmarkEngine — getModelInfo", () => {
  it("reports ML model available for engine", () => {
    const info = getModelInfo("engine");
    expect(info.hasMlModel).toBe(true);
    expect(info.mlNTraining).toBe(500);
    expect(info.mlModelVersion).toBe("1.0.0");
  });

  it("reports no ML model for front_bumper", () => {
    const info = getModelInfo("front_bumper");
    expect(info.hasMlModel).toBe(false);
    expect(info.hasStatisticalBenchmark).toBe(true);
    expect(info.statisticalN).toBe(120); // global benchmark
  });

  it("reports no data for unknown component", () => {
    const info = getModelInfo("flux_capacitor");
    expect(info.hasMlModel).toBe(false);
    expect(info.hasStatisticalBenchmark).toBe(false);
  });
});

describe("mlBenchmarkEngine — feature vector edge cases", () => {
  it("handles null make gracefully", () => {
    const result = assessCost({
      componentId: "engine",
      quotedCostUsd: 2000,
      vehicleMake: null,
      vehicleYear: 2015,
    });
    expect(result.modelSource).toBe("ml");
    expect(result.verdict).toBeDefined();
  });

  it("handles missing year gracefully", () => {
    const result = assessCost({
      componentId: "engine",
      quotedCostUsd: 2000,
      vehicleMake: "Toyota",
      vehicleYear: null,
    });
    expect(result.modelSource).toBe("ml");
    expect(result.verdict).toBeDefined();
  });

  it("clips unrealistic year values", () => {
    const result = assessCost({
      componentId: "engine",
      quotedCostUsd: 2000,
      vehicleMake: "Toyota",
      vehicleYear: 1800, // way too old
    });
    expect(result.modelSource).toBe("ml");
    expect(result.verdict).toBeDefined();
  });
});
