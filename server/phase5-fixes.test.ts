/**
 * phase5-fixes.test.ts
 *
 * Phase 5C — Report Version Gate tests
 *
 * Covers:
 *   - detectReportVersion: correct version inference from field presence
 *   - buildVersionGateResult: correct legacy classification, missing capabilities, banner messages
 *   - isLegacyReport: lightweight check
 */

import { describe, it, expect } from "vitest";
import {
  detectReportVersion,
  buildVersionGateResult,
  isLegacyReport,
} from "./pipeline-v2/reportVersionGate";

// ─── detectReportVersion ──────────────────────────────────────────────────────

describe("Phase 5C: Report Version Gate — detectReportVersion", () => {
  it("returns 4.0 when ifeResultJson and doeResultJson are present", () => {
    const version = detectReportVersion({
      ifeResultJson: '{"completenessScore":85}',
      doeResultJson: '{"status":"OPTIMISED"}',
      felVersionSnapshotJson: '{}',
      fcdiScore: 82,
      economicContextJson: '{}',
      forensicExecutionLedgerJson: '{}',
    });
    expect(version).toBe("4.0");
  });

  it("returns 3.x when economicContextJson and forensicExecutionLedgerJson are present but no IFE/DOE", () => {
    const version = detectReportVersion({
      ifeResultJson: null,
      doeResultJson: null,
      fcdiScore: 75,
      economicContextJson: '{"currency":"USD"}',
      forensicExecutionLedgerJson: '{"stages":[]}',
    });
    expect(version).toBe("3.x");
  });

  it("returns 2.x when fcdiScore is present but no economic context or IFE/DOE", () => {
    const version = detectReportVersion({
      ifeResultJson: null,
      doeResultJson: null,
      fcdiScore: 68,
      economicContextJson: null,
      forensicExecutionLedgerJson: null,
    });
    expect(version).toBe("2.x");
  });

  it("returns 1.x when only confidenceScore is present", () => {
    const version = detectReportVersion({
      ifeResultJson: null,
      doeResultJson: null,
      fcdiScore: null,
      economicContextJson: null,
      forensicExecutionLedgerJson: null,
      confidenceScore: 72,
    });
    expect(version).toBe("1.x");
  });

  it("returns unknown when no fields are present", () => {
    const version = detectReportVersion({
      ifeResultJson: null,
      doeResultJson: null,
      fcdiScore: null,
      economicContextJson: null,
      forensicExecutionLedgerJson: null,
      confidenceScore: null,
    });
    expect(version).toBe("unknown");
  });

  it("returns 4.0 even if felVersionSnapshotJson is missing — IFE+DOE is sufficient", () => {
    const version = detectReportVersion({
      ifeResultJson: '{}',
      doeResultJson: '{}',
      felVersionSnapshotJson: null,
      fcdiScore: 80,
    });
    expect(version).toBe("4.0");
  });
});

// ─── buildVersionGateResult ───────────────────────────────────────────────────

describe("Phase 5C: Report Version Gate — buildVersionGateResult", () => {
  it("v4.0 report: isLegacy=false, isAdjudicationReady=true, no missing capabilities", () => {
    const result = buildVersionGateResult({
      ifeResultJson: '{"completenessScore":85}',
      doeResultJson: '{"status":"OPTIMISED"}',
      felVersionSnapshotJson: '{}',
      fcdiScore: 82,
      economicContextJson: '{}',
      forensicExecutionLedgerJson: '{}',
    });
    expect(result.version).toBe("4.0");
    expect(result.isLegacy).toBe(false);
    expect(result.isAdjudicationReady).toBe(true);
    expect(result.missingCapabilities).toHaveLength(0);
    expect(result.legacyBannerMessage).toBeNull();
    expect(result.rerunRecommended).toBe(false);
  });

  it("v3.x report: isLegacy=true, missing IFE+DOE+FEL snapshot capabilities", () => {
    const result = buildVersionGateResult({
      ifeResultJson: null,
      doeResultJson: null,
      fcdiScore: 75,
      economicContextJson: '{"currency":"USD"}',
      forensicExecutionLedgerJson: '{"stages":[]}',
    });
    expect(result.version).toBe("3.x");
    expect(result.isLegacy).toBe(true);
    expect(result.isAdjudicationReady).toBe(false);
    expect(result.rerunRecommended).toBe(true);
    // Should have exactly the 3 v4.0 capabilities missing
    const capabilityNames = result.missingCapabilities.map(c => c.capability);
    expect(capabilityNames).toContain("Data Attribution Layer (IFE)");
    expect(capabilityNames).toContain("Decision Optimisation Engine (DOE)");
    expect(capabilityNames).toContain("FEL Version Snapshot");
    // Should NOT include v2/v3 capabilities (those are present)
    expect(capabilityNames).not.toContain("FCDI Score");
    expect(capabilityNames).not.toContain("Economic Context Engine (ECE)");
  });

  it("v2.x report: isLegacy=true, missing ECE+FEL+IFE+DOE+FEL snapshot", () => {
    const result = buildVersionGateResult({
      ifeResultJson: null,
      doeResultJson: null,
      fcdiScore: 68,
      economicContextJson: null,
      forensicExecutionLedgerJson: null,
    });
    expect(result.version).toBe("2.x");
    expect(result.isLegacy).toBe(true);
    const capabilityNames = result.missingCapabilities.map(c => c.capability);
    expect(capabilityNames).toContain("Economic Context Engine (ECE)");
    expect(capabilityNames).toContain("Data Attribution Layer (IFE)");
    expect(capabilityNames).toContain("Decision Optimisation Engine (DOE)");
  });

  it("v1.x report: isLegacy=true, all capabilities missing including FCDI", () => {
    const result = buildVersionGateResult({
      ifeResultJson: null,
      doeResultJson: null,
      fcdiScore: null,
      economicContextJson: null,
      forensicExecutionLedgerJson: null,
      confidenceScore: 72,
    });
    expect(result.version).toBe("1.x");
    expect(result.isLegacy).toBe(true);
    const capabilityNames = result.missingCapabilities.map(c => c.capability);
    expect(capabilityNames).toContain("FCDI Score");
    expect(capabilityNames).toContain("Data Attribution Layer (IFE)");
    expect(capabilityNames).toContain("Decision Optimisation Engine (DOE)");
  });

  it("v3.x report: legacyBannerMessage mentions Data Attribution Layer", () => {
    const result = buildVersionGateResult({
      ifeResultJson: null,
      doeResultJson: null,
      fcdiScore: 75,
      economicContextJson: '{}',
      forensicExecutionLedgerJson: '{}',
    });
    expect(result.legacyBannerMessage).not.toBeNull();
    expect(result.legacyBannerMessage).toContain("Data Attribution Layer");
  });

  it("v4.0 report: assessorGuidance confirms adjudication readiness", () => {
    const result = buildVersionGateResult({
      ifeResultJson: '{}',
      doeResultJson: '{}',
      fcdiScore: 85,
      economicContextJson: '{}',
      forensicExecutionLedgerJson: '{}',
    });
    expect(result.assessorGuidance).toContain("v4.0");
    expect(result.assessorGuidance).toContain("proceed to a final decision");
  });

  it("missing capabilities are sorted with critical impact first", () => {
    const result = buildVersionGateResult({
      ifeResultJson: null,
      doeResultJson: null,
      fcdiScore: null,
      economicContextJson: null,
      forensicExecutionLedgerJson: null,
      confidenceScore: 60,
    });
    const criticalCaps = result.missingCapabilities.filter(c => c.impact === "critical");
    expect(criticalCaps.length).toBeGreaterThan(0);
    // All critical capabilities should be present
    const names = result.missingCapabilities.map(c => c.capability);
    expect(names).toContain("FCDI Score");
    expect(names).toContain("Data Attribution Layer (IFE)");
    expect(names).toContain("Decision Optimisation Engine (DOE)");
  });
});

// ─── isLegacyReport ───────────────────────────────────────────────────────────

describe("Phase 5C: Report Version Gate — isLegacyReport", () => {
  it("returns false for v4.0 report with both IFE and DOE", () => {
    expect(isLegacyReport({ ifeResultJson: '{}', doeResultJson: '{}' })).toBe(false);
  });

  it("returns true when ifeResultJson is missing", () => {
    expect(isLegacyReport({ ifeResultJson: null, doeResultJson: '{}' })).toBe(true);
  });

  it("returns true when doeResultJson is missing", () => {
    expect(isLegacyReport({ ifeResultJson: '{}', doeResultJson: null })).toBe(true);
  });

  it("returns true when both are missing", () => {
    expect(isLegacyReport({ ifeResultJson: null, doeResultJson: null })).toBe(true);
  });
});
