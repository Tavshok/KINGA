/**
 * Wave 4 Integration Tests
 *
 * Verifies:
 * 1. buildValidationPrediction() produces a correctly shaped row from a PhysicsTruth object
 * 2. computeValidationStats() correctly computes MAPE, CI coverage, grade distribution, drift
 * 3. evidencePluginRegistry has the expected stub plugins registered with correct interface
 * 4. runAll() returns empty array for UNAVAILABLE stubs (correct behaviour — not a bug)
 * 5. getStatusSummary() returns one entry per registered plugin
 */
import { describe, it, expect } from "vitest";
import { buildValidationPrediction, computeValidationStats } from "./pipeline-v2/stage-validation-loop";
import { evidencePluginRegistry } from "./pipeline-v2/evidencePluginRegistry";

// ─── Minimal PhysicsTruth stub matching the real PhysicsTruth shape ───────────
const mockPTL: any = {
  claimId: "TEST-001",
  speed: {
    canonical: { value: 65, min: 50, max: 82 },
    deltaVKmh: { value: 58 },
  },
  geometry: {
    crushDepth: {
      canonical: { value: 0.190 }, // metres — buildValidationPrediction multiplies by 1000
    },
  },
  energy: {
    estimatedRepairCostLocal: 48000,
  },
  integrityCheck: {
    flags: [],
  },
  uncertaintyGrade: "B",
  wave3: {
    integrity: { integrityScore: 85 },
    uncertainty: { overallGrade: "B" },
    explainability: {},
  },
};

// ─── buildValidationPrediction() ─────────────────────────────────────────────
describe("Wave 4A — buildValidationPrediction()", () => {
  it("returns a row with all expected prediction fields", () => {
    const row = buildValidationPrediction({ claimId: "TEST-001", assessmentId: 0, physicsTruth: mockPTL });
    expect(row).toBeDefined();
    expect(row.claim_id).toBe("TEST-001");
    expect(typeof row.predicted_speed_kmh).toBe("number");
    expect(row.predicted_speed_kmh).toBeCloseTo(65, 0);
    expect(typeof row.predicted_speed_low_kmh).toBe("number");
    expect(typeof row.predicted_speed_high_kmh).toBe("number");
    expect((row.predicted_speed_low_kmh as number)).toBeLessThan(row.predicted_speed_kmh as number);
    expect((row.predicted_speed_high_kmh as number)).toBeGreaterThan(row.predicted_speed_kmh as number);
    // 0.190 m × 1000 = 190 mm
    expect(row.predicted_crush_depth_mm).toBeCloseTo(190, 0);
    expect(row.uncertainty_grade).toBe("B");
    // No integrity flags → integrityScore = 100
    expect(row.integrity_score).toBe(100);
    expect(row.validation_status).toBe("pending");
  });

  it("returns null uncertainty_grade when root field is absent", () => {
    const ptlNoRootGrade = { ...mockPTL, uncertaintyGrade: undefined };
    const row = buildValidationPrediction({ claimId: "TEST-002", assessmentId: 0, physicsTruth: ptlNoRootGrade });
    expect(row.uncertainty_grade).toBeNull();
  });

  it("handles missing crush depth gracefully (returns null)", () => {
    const ptlNoCrush = { ...mockPTL, geometry: { crushDepth: { canonical: { value: null } } } };
    const row = buildValidationPrediction({ claimId: "TEST-003", assessmentId: 0, physicsTruth: ptlNoCrush });
    expect(row.predicted_crush_depth_mm).toBeNull();
  });

  it("handles missing speed gracefully (returns null)", () => {
    const ptlNoSpeed = { ...mockPTL, speed: undefined };
    const row = buildValidationPrediction({ claimId: "TEST-004", assessmentId: 0, physicsTruth: ptlNoSpeed });
    expect(row.predicted_speed_kmh).toBeNull();
    expect(row.predicted_speed_low_kmh).toBeNull();
    expect(row.predicted_speed_high_kmh).toBeNull();
  });

  it("computes integrity score correctly with CRITICAL and WARNING flags", () => {
    const ptlWithFlags = {
      ...mockPTL,
      integrityCheck: {
        flags: [
          { severity: "CRITICAL", code: "SPEED_MISMATCH" },
          { severity: "WARNING", code: "MILEAGE_INCONSISTENCY" },
        ],
      },
    };
    const row = buildValidationPrediction({ claimId: "TEST-005", assessmentId: 0, physicsTruth: ptlWithFlags });
    // 100 - (1 × 30) - (1 × 10) = 60
    expect(row.integrity_score).toBe(60);
  });
});

// ─── computeValidationStats() ────────────────────────────────────────────────
describe("Wave 4A — computeValidationStats()", () => {
  const makeRecord = (opts: {
    speedDev?: number | null;
    costDev?: number | null;
    withinCI?: number | null;
    grade?: string;
    daysAgo?: number;
  }) => ({
    speedDeviationPct: opts.speedDev ?? null,
    costDeviationPct: opts.costDev ?? null,
    speedWithinCI: opts.withinCI ?? null,
    calibrationFeedbackJson: null,
    uncertaintyGrade: opts.grade ?? "B",
    createdAt: new Date(Date.now() - (opts.daysAgo ?? 0) * 86400000),
  });

  it("returns zero MAPE when no validated records exist (all null deviations)", () => {
    const stats = computeValidationStats([makeRecord({ speedDev: null })]);
    expect(stats.totalValidated).toBe(0);
    expect(stats.speedMAPE).toBe(0);
    expect(stats.ciCoverageRate).toBe(0);
  });

  it("computes MAPE correctly from validated records", () => {
    const records = [
      makeRecord({ speedDev: 10, withinCI: 1, grade: "A" }),
      makeRecord({ speedDev: 20, withinCI: 0, grade: "B" }),
      makeRecord({ speedDev: 30, withinCI: 1, grade: "C" }),
    ];
    const stats = computeValidationStats(records);
    expect(stats.totalValidated).toBe(3);
    expect(stats.speedMAPE).toBeCloseTo(20, 1); // (10+20+30)/3
    expect(stats.ciCoverageRate).toBeCloseTo(66.67, 0); // 2/3
  });

  it("computes grade distribution correctly", () => {
    const records = [
      makeRecord({ grade: "A" }),
      makeRecord({ grade: "A" }),
      makeRecord({ grade: "B" }),
      makeRecord({ grade: "C" }),
    ];
    const stats = computeValidationStats(records);
    expect(stats.gradeDistribution.A).toBe(2);
    expect(stats.gradeDistribution.B).toBe(1);
    expect(stats.gradeDistribution.C).toBe(1);
  });

  it("detects positive calibration drift (recent worse than prior)", () => {
    const recentRecords = Array.from({ length: 10 }, () =>
      makeRecord({ speedDev: 30, withinCI: 0, daysAgo: 5 })
    );
    const priorRecords = Array.from({ length: 10 }, () =>
      makeRecord({ speedDev: 5, withinCI: 1, daysAgo: 60 })
    );
    const stats = computeValidationStats([...recentRecords, ...priorRecords]);
    expect(stats.calibrationDrift).toBeGreaterThan(0);
  });

  it("detects negative calibration drift (recent better than prior)", () => {
    const recentRecords = Array.from({ length: 10 }, () =>
      makeRecord({ speedDev: 5, withinCI: 1, daysAgo: 5 })
    );
    const priorRecords = Array.from({ length: 10 }, () =>
      makeRecord({ speedDev: 30, withinCI: 0, daysAgo: 60 })
    );
    const stats = computeValidationStats([...recentRecords, ...priorRecords]);
    expect(stats.calibrationDrift).toBeLessThan(0);
  });

  it("returns lastUpdated as an ISO string", () => {
    const stats = computeValidationStats([makeRecord({ speedDev: 10, withinCI: 1 })]);
    expect(stats.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ─── evidencePluginRegistry ───────────────────────────────────────────────────
describe("Wave 4B — evidencePluginRegistry", () => {
  it("has exactly 3 stub plugins registered (Telematics, EDR, LiDAR)", () => {
    const plugins = evidencePluginRegistry.getAll();
    expect(plugins.length).toBe(3);
  });

  it("all plugins implement the EvidencePlugin interface correctly", () => {
    const plugins = evidencePluginRegistry.getAll();
    for (const p of plugins) {
      expect(p.pluginId).toBeTruthy();
      expect(p.pluginName).toBeTruthy();
      expect(p.category).toBeTruthy();
      expect(p.version).toBeTruthy();
      // EvidencePlugin uses checkAvailability + extractContribution (not run())
      expect(typeof p.checkAvailability).toBe("function");
      expect(typeof p.extractContribution).toBe("function");
    }
  });

  it("stub plugins return UNAVAILABLE from checkAvailability (no live data source)", async () => {
    const plugins = evidencePluginRegistry.getAll();
    for (const p of plugins) {
      const status = await p.checkAvailability("TEST-001", 0);
      expect(status).toBe("UNAVAILABLE");
    }
  });

  it("runAll() returns empty array for UNAVAILABLE stubs (correct — skips unavailable)", async () => {
    // CORRECT behaviour: runAll() skips UNAVAILABLE plugins to avoid noise in the pipeline
    const contributions = await evidencePluginRegistry.runAll("TEST-001", 0);
    expect(contributions.length).toBe(0);
  });

  it("getStatusSummary() returns one entry per registered plugin with UNAVAILABLE status", async () => {
    const summary = await evidencePluginRegistry.getStatusSummary("TEST-001", 0);
    const plugins = evidencePluginRegistry.getAll();
    expect(summary.length).toBe(plugins.length);
    for (const s of summary) {
      expect(s.pluginId).toBeTruthy();
      expect(s.pluginName).toBeTruthy();
      expect(s.status).toBe("UNAVAILABLE");
    }
  });

  it("plugin IDs are unique across all registered plugins", () => {
    const plugins = evidencePluginRegistry.getAll();
    const ids = plugins.map(p => p.pluginId);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
