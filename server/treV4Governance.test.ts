/**
 * Vitest tests for TRE v4.0 — Autonomous Trust Operations Platform
 *
 * Coverage:
 *  E1 — Trust Event Bus
 *   1. trustEventBus emits events and getClaimEvents returns them
 *   2. getRecentEvents returns events
 *   3. getStats returns correct totals
 *   4. subscribe/unsubscribe lifecycle
 *
 *  E2 — Trust Impact Analysis Engine
 *   5. analyseImpact returns a result with required sections
 *   6. analyseMultiEventImpact handles empty array gracefully
 *
 *  E3 — Autonomous Resolution Queue
 *   7. createConflictResolutionTask creates a task with correct shape
 *   8. enqueue → getPendingTasks returns the task
 *   9. resolve marks task RESOLVED
 *  10. escalate marks task ESCALATED
 *  11. getStats reflects queue state
 *
 *  E4 — Human-in-the-Loop Governance
 *  12. request() creates a pending approval request
 *  13. decide() APPROVE transitions status to APPROVED
 *  14. decide() REJECT transitions status to REJECTED
 *  15. getPendingRequests returns only PENDING requests
 *  16. getClaimRequests filters by claimId
 *
 *  E5 — Trust Memory Engine
 *  17. record() stores an entry
 *  18. getConflictPatterns returns patterns for recorded entries
 *  19. generateInsights returns an array (may be empty)
 *  20. getSimilarClaims returns matching entries
 *  21. getSnapshot reflects recorded entries
 *
 *  E6 — AI Model Governance
 *  22. registerModel stores a model
 *  23. getActiveModels returns registered ACTIVE models
 *  24. generateGovernanceReport has required fields
 *
 *  E7 — Trust SLA Management
 *  25. start() creates an ON_TRACK SLA record
 *  26. complete() transitions SLA to COMPLETED
 *  27. waive() transitions SLA to WAIVED
 *  28. generatePerformanceReport has required fields
 *
 *  E8 — Trust Simulation Engine
 *  29. defineScenario returns a scenario with correct shape
 *  30. simulate returns a result with originalCTO and simulatedCTO
 *  31. simulate changes fraudRiskScore when parameter is set
 *  32. runBatch returns one result per scenario
 *  33. getStandardScenarios returns at least 2 scenarios
 *
 *  Integration
 *  34. Full E1→E3 chain: emit event → analyse impact → enqueue resolution task
 */

import { describe, it, expect, beforeEach } from "vitest";

// ── E1 ──────────────────────────────────────────────────────────────────────
import {
  trustEventBus,
  conflictDetectedEvent,
  slaBreachEvent,
} from "./pipeline-v2/trustEventBus";

// ── E2 ──────────────────────────────────────────────────────────────────────
import {
  analyseImpact,
  analyseMultiEventImpact,
} from "./pipeline-v2/trustImpactEngine";

// ── E3 ──────────────────────────────────────────────────────────────────────
import {
  trustResolutionQueue,
  createConflictResolutionTask,
} from "./pipeline-v2/trustResolutionQueue";

// ── E4 ──────────────────────────────────────────────────────────────────────
import { humanTrustApprovalEngine } from "./pipeline-v2/humanTrustApproval";

// ── E5 ──────────────────────────────────────────────────────────────────────
import {
  trustMemoryEngine,
  type ConflictPatternType,
} from "./pipeline-v2/trustMemoryEngine";

// ── E6 ──────────────────────────────────────────────────────────────────────
import { aiModelGovernanceEngine } from "./pipeline-v2/aiModelGovernance";

// ── E7 ──────────────────────────────────────────────────────────────────────
import { trustSLAManager } from "./pipeline-v2/trustSLAManager";

// ── E8 ──────────────────────────────────────────────────────────────────────
import { trustSimulationEngine } from "./pipeline-v2/trustSimulationEngine";

// ── CTO types ─────────────────────────────────────────────────────────────────
import type { ClaimTruthObject } from "./pipeline-v2/truthReconciliationEngine";

// ─────────────────────────────────────────────────────────────────────────────
// CTO stub factory — matches the full ClaimTruthObject interface
// ─────────────────────────────────────────────────────────────────────────────
function makeCTOStub(): ClaimTruthObject {
  return {
    treVersion: "4.0.0",
    ctoSchemaVersion: "2.0.0",
    generatedAt: new Date().toISOString(),
    claimIdentity: {
      claimId: 99001,
      assessmentId: 1,
      policyNumber: "POL-001",
      insurer: "Test Insurer",
      claimReference: "CLM-2024-001",
      _provenance: { owner: "CTL", confidence: 90, sources: ["CTL"], resolvedAt: new Date().toISOString() },
    },
    vehicle: {
      make: "Toyota",
      model: "Corolla",
      year: 2020,
      vin: null,
      registration: "ABC-123",
      bodyType: "sedan",
      massKg: 1300,
      marketValueUsd: 15000,
      marketValueSource: "market_data",
      repairToValueRatio: 0.3,
      isEconomicWriteOff: false,
      _provenance: { owner: "CTL", confidence: 90, sources: ["CTL"], resolvedAt: new Date().toISOString() },
    },
    driver: {
      name: "John Doe",
      licenseNumber: "DL-001",
      idNumber: "ID-001",
      _provenance: { owner: "CTL", confidence: 80, sources: ["CTL"], resolvedAt: new Date().toISOString() },
    },
    incident: {
      date: "2024-01-15",
      location: "Johannesburg",
      incidentType: "collision",
      collisionDirection: "front",
      claimedSpeedKmh: 60,
      narrativeDescription: "Rear-end collision at traffic light",
      _provenance: { owner: "CTL", confidence: 85, sources: ["CTL"], resolvedAt: new Date().toISOString() },
    },
    damage: {
      severity: "MODERATE",
      severitySource: "CTL",
      zones: ["front"],
      components: [],
      structuralDamageDetected: false,
      damageAreaM2: null,
      visionSourceReliability: "HIGH",
      _provenance: { owner: "CTL", confidence: 75, sources: ["CTL"], resolvedAt: new Date().toISOString() },
    },
    physics: {
      estimatedSpeedKmh: 60,
      deltaVKmh: null,
      impactForceKn: null,
      kineticEnergyJ: null,
      decelerationG: null,
      physicsStatus: "EXECUTED",
      damageConsistencyScore: 80,
      physicsConfidence: 75,
      speedInferenceEnsemble: null,
      _provenance: { owner: "physics", confidence: 75, sources: ["physics"], resolvedAt: new Date().toISOString() },
    },
    fraud: {
      fraudRiskScore: 25,
      fraudRiskLevel: "low",
      indicators: [],
      quoteDeviation: null,
      _provenance: { owner: "fraud", confidence: 80, sources: ["fraud"], resolvedAt: new Date().toISOString() },
    },
    cost: {
      optimisedCostUsd: 5000,
      optimisedCostSource: "panel_beater",
      expectedRepairCostCents: 500000,
      costRecommendation: "APPROVE",
      quoteDeviationPct: null,
      recommendedCostRange: { lowCents: 400000, highCents: 600000 },
      currency: "USD",
      _provenance: { owner: "cost", confidence: 70, sources: ["cost"], resolvedAt: new Date().toISOString() },
    },
    workflow: {
      claimAgeDays: 1,
      submissionDate: "2024-01-16",
      incidentDate: "2024-01-15",
      lateSubmission: false,
      estimatedTurnaroundDays: 5,
      _provenance: { owner: "CTL", confidence: 90, sources: ["CTL"], resolvedAt: new Date().toISOString() },
    },
    decision: {
      recommendation: "APPROVE",
      primaryReason: "All checks passed",
      confidence: 75,
      reviewTriggers: [],
      approvalConditions: [],
      isBlocked: false,
      blockingReasons: [],
      _provenance: { owner: "TRE", confidence: 75, sources: ["TRE"], resolvedAt: new Date().toISOString() },
    },
    evidence: {
      photoCount: 3,
      documentCount: 2,
      quotationCount: 1,
      completenessScore: 80,
      completenessBreakdown: [],
      _provenance: { owner: "CTL", confidence: 80, sources: ["CTL"], resolvedAt: new Date().toISOString() },
    },
    confidence: {
      overallConfidence: 75,
      physicsConfidence: 75,
      fraudConfidence: 80,
      costConfidence: 70,
      evidenceConfidence: 80,
      decayApplied: 0,
      decayBreakdown: {
        numericConflicts: 0,
        semanticConflicts: 0,
        temporalConflicts: 0,
        logicalConflicts: 0,
        missingEvidence: 0,
      },
      _provenance: { owner: "TRE", confidence: 75, sources: ["TRE"], resolvedAt: new Date().toISOString() },
    },
    consistency: {
      consistencyScore: 90,
      blockAutoApproval: false,
      criticalConflictCount: 0,
      highConflictCount: 0,
      flagSummary: "No conflicts",
      _provenance: { owner: "TRE", confidence: 90, sources: ["TRE"], resolvedAt: new Date().toISOString() },
    },
    auditTrail: {
      conflicts: [],
      reconciliationEvents: [],
      systemInterventions: [],
      recoveryActions: [],
      stageDurations: {},
      pipelineRunId: null,
    },
    certification: {
      certificate: {
        certificateId: "CERT-001",
        claimId: 99001,
        assessmentId: 1,
        treVersion: "4.0.0",
        ctoSchemaVersion: "2.0.0",
        generatedAt: new Date().toISOString(),
        consistencyScore: 90,
        conflictsDetected: 0,
        conflictsResolved: 0,
        outstandingConflicts: 0,
        canonicalFieldCount: 20,
        overallConfidence: 75,
        certified: "CERTIFIED",
        blockingReasons: [],
        warnings: [],
        ownershipSummary: {},
        ctoHash: "abc123",
        integrityScore: {
          score: 85,
          penalties: [],
          label: "GOOD",
          summary: "Good integrity",
        },
        stabilityIndex: {
          score: 90,
          label: "STABLE",
          reconciliationCount: 0,
          conflictCount: 0,
          warningCount: 0,
          confidenceSpread: 10,
          overriddenValueCount: 0,
          interpretation: "Stable",
        },
        analytics: {
          treVersion: "4.0.0",
          ctoSchemaVersion: "2.0.0",
          integrityScore: 85,
          stabilityScore: 90,
          conflictCount: 0,
          conflictsByType: {},
          confidenceDecayPoints: 0,
          overallConfidence: 75,
          overriddenValueCount: 0,
          certificationStatus: "CERTIFIED",
          conflictingFields: [],
          overriddenEngines: [],
        },
        governancePolicyName: "DEFAULT",
        reconciliationExplanation: [],
        sectionCertification: {},
      },
      truthGraph: {
        nodes: {},
        edges: [],
        generatedAt: new Date().toISOString(),
        totalNodes: 0,
        totalConflicts: 0,
      },
    },
  } as ClaimTruthObject;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset singletons between tests
// ─────────────────────────────────────────────────────────────────────────────
beforeEach(() => {
  trustEventBus.clearHistory();
  trustEventBus.resetStats();
  trustResolutionQueue.clear();
  humanTrustApprovalEngine.clear();
  trustMemoryEngine.clear();
  aiModelGovernanceEngine.clear();
  trustSLAManager.clear();
});

// ─────────────────────────────────────────────────────────────────────────────
// E1 — Trust Event Bus
// ─────────────────────────────────────────────────────────────────────────────
describe("E1 — Trust Event Bus", () => {
  it("1. emits events and getClaimEvents returns them", async () => {
    const event = conflictDetectedEvent("CLAIM-100", "Speed mismatch", ["physics"], "HIGH");
    await trustEventBus.publish(event);
    const events = trustEventBus.getClaimEvents("CLAIM-100");
    expect(events).toHaveLength(1);
    expect(events[0].claimId).toBe("CLAIM-100");
    expect(events[0].type).toBe("CONFLICT_DETECTED");
  });

  it("2. getRecentEvents returns events", async () => {
    const e1 = conflictDetectedEvent("CLAIM-101", "desc1", ["fraud"], "LOW");
    const e2 = slaBreachEvent("CLAIM-101", "FULL_PIPELINE", 120, 130);
    await trustEventBus.publish(e1);
    await trustEventBus.publish(e2);
    const recent = trustEventBus.getRecentEvents(10);
    expect(recent.length).toBeGreaterThanOrEqual(2);
  });

  it("3. getStats returns correct totals", async () => {
    const event = conflictDetectedEvent("CLAIM-102", "test", ["physics"], "MEDIUM");
    await trustEventBus.publish(event);
    const stats = trustEventBus.getStats();
    expect(stats.totalPublished).toBeGreaterThanOrEqual(1);
    expect(typeof stats.eventTypeCounts).toBe("object");
  });

  it("4. subscribe/unsubscribe lifecycle", async () => {
    let received = 0;
    const subId = trustEventBus.subscribe(["CONFLICT_DETECTED"], () => {
      received++;
    });
    const event = conflictDetectedEvent("CLAIM-103", "test", ["fraud"], "LOW");
    await trustEventBus.publish(event);
    expect(received).toBe(1);
    trustEventBus.unsubscribe(subId);
    await trustEventBus.publish(event);
    expect(received).toBe(1); // no additional calls after unsubscribe
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E2 — Trust Impact Analysis Engine
// ─────────────────────────────────────────────────────────────────────────────
describe("E2 — Trust Impact Analysis Engine", () => {
  it("5. analyseImpact returns a result with required sections", () => {
    const event = conflictDetectedEvent("CLAIM-200", "Speed mismatch", ["physics"], "HIGH");
    const result = analyseImpact(event);
    expect(result).toBeDefined();
    expect(result.claimId).toBe("CLAIM-200");
    expect(Array.isArray(result.affectedSections)).toBe(true);
    expect(typeof result.impactSeverity).toBe("string");
    expect(result.triggeringEvent).toBeDefined();
  });

  it("6. analyseMultiEventImpact handles empty array gracefully", () => {
    const result = analyseMultiEventImpact([]);
    expect(result).toBeDefined();
    expect(result.claimId).toBe("UNKNOWN");
    expect(result.impactSeverity).toBe("MINIMAL");
    expect(Array.isArray(result.individualImpacts)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E3 — Autonomous Resolution Queue
// ─────────────────────────────────────────────────────────────────────────────
describe("E3 — Autonomous Resolution Queue", () => {
  it("7. createConflictResolutionTask creates a task with correct shape", () => {
    const task = createConflictResolutionTask(
      "CLAIM-300",
      "Speed vs physics mismatch",
      ["physics", "fraud"],
      "HIGH"
    );
    expect(task.claimId).toBe("CLAIM-300");
    expect(task.type).toBe("CONFLICT_RESOLUTION");
    expect(task.priority).toBe("HIGH");
    expect(task.status).toBe("PENDING");
    expect(task.taskId).toBeTruthy();
  });

  it("8. enqueue → getPendingTasks returns the task", () => {
    const task = createConflictResolutionTask(
      "CLAIM-301",
      "Fraud score inconsistency",
      ["fraud"],
      "MEDIUM"
    );
    trustResolutionQueue.enqueue(task);
    const pending = trustResolutionQueue.getPendingTasks();
    expect(pending.some((t) => t.taskId === task.taskId)).toBe(true);
  });

  it("9. resolve marks task RESOLVED", () => {
    const task = createConflictResolutionTask(
      "CLAIM-302",
      "Cost mismatch",
      ["cost"],
      "LOW"
    );
    trustResolutionQueue.enqueue(task);
    const resolved = trustResolutionQueue.resolve(
      task.taskId,
      "Resolved by assessor review",
      ["Quote document"]
    );
    expect(resolved?.status).toBe("RESOLVED");
    expect(resolved?.resolutionNotes).toContain("Resolved by assessor review");
  });

  it("10. escalate marks task ESCALATED", () => {
    const task = createConflictResolutionTask(
      "CLAIM-303",
      "Critical fraud pattern",
      ["fraud"],
      "CRITICAL"
    );
    trustResolutionQueue.enqueue(task);
    const escalated = trustResolutionQueue.escalate(task.taskId, "Requires manager review");
    expect(escalated?.status).toBe("ESCALATED");
  });

  it("11. getStats reflects queue state", () => {
    const t1 = createConflictResolutionTask("CLAIM-304", "desc1", ["physics"], "LOW");
    const t2 = createConflictResolutionTask("CLAIM-304", "desc2", ["fraud"], "HIGH");
    trustResolutionQueue.enqueue(t1);
    trustResolutionQueue.enqueue(t2);
    trustResolutionQueue.resolve(t1.taskId, "done", []);
    const stats = trustResolutionQueue.getStats();
    expect(stats.totalTasks).toBeGreaterThanOrEqual(2);
    expect(stats.byStatus["RESOLVED"]).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E4 — Human-in-the-Loop Governance
// ─────────────────────────────────────────────────────────────────────────────
describe("E4 — Human-in-the-Loop Governance", () => {
  it("12. request() creates a pending approval request", async () => {
    const req = await humanTrustApprovalEngine.request(
      "CLAIM-400",
      "FRAUD_SCORE_HIGH",
      "Fraud score 85 exceeds threshold"
    );
    expect(req.requestId).toBeTruthy();
    expect(req.claimId).toBe("CLAIM-400");
    expect(req.status).toBe("PENDING");
  });

  it("13. decide() APPROVE transitions status to APPROVED", async () => {
    const req = await humanTrustApprovalEngine.request(
      "CLAIM-401",
      "COST_THRESHOLD_EXCEEDED",
      "Cost exceeds $50,000 threshold"
    );
    const result = humanTrustApprovalEngine.decide(
      req.requestId,
      "APPROVE",
      "assessor-001",
      "Reviewed and approved after documentation check"
    );
    expect(result?.status).toBe("APPROVED");
    expect(result?.decision).toBe("APPROVE");
    expect(result?.decisionBy).toBe("assessor-001");
  });

  it("14. decide() REJECT transitions status to REJECTED", async () => {
    const req = await humanTrustApprovalEngine.request(
      "CLAIM-402",
      "CERTIFICATE_BLOCKED",
      "Certificate blocked due to integrity failure"
    );
    const result = humanTrustApprovalEngine.decide(
      req.requestId,
      "REJECT",
      "manager-001",
      "Insufficient evidence to support claim"
    );
    expect(result?.status).toBe("REJECTED");
  });

  it("15. getPendingRequests returns only PENDING requests", async () => {
    const req1 = await humanTrustApprovalEngine.request(
      "CLAIM-403",
      "MANUAL_ESCALATION",
      "Manual escalation requested"
    );
    await humanTrustApprovalEngine.request(
      "CLAIM-404",
      "MANUAL_ESCALATION",
      "Another escalation"
    );
    // Approve one
    humanTrustApprovalEngine.decide(
      req1.requestId,
      "APPROVE",
      "assessor-002",
      "Approved after review"
    );
    const pending = humanTrustApprovalEngine.getPendingRequests();
    expect(pending.every((r) => r.status === "PENDING")).toBe(true);
    expect(pending.some((r) => r.claimId === "CLAIM-404")).toBe(true);
    expect(pending.some((r) => r.requestId === req1.requestId)).toBe(false);
  });

  it("16. getClaimRequests filters by claimId", async () => {
    await humanTrustApprovalEngine.request(
      "CLAIM-405",
      "FRAUD_SCORE_HIGH",
      "Fraud score high"
    );
    await humanTrustApprovalEngine.request(
      "CLAIM-999",
      "FRAUD_SCORE_HIGH",
      "Different claim"
    );
    const claimReqs = humanTrustApprovalEngine.getClaimRequests("CLAIM-405");
    expect(claimReqs.every((r) => r.claimId === "CLAIM-405")).toBe(true);
    expect(claimReqs.length).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E5 — Trust Memory Engine
// ─────────────────────────────────────────────────────────────────────────────
describe("E5 — Trust Memory Engine", () => {
  it("17. record() stores an entry", () => {
    const entry = trustMemoryEngine.record({
      claimId: "CLAIM-500",
      conflictPatterns: ["SPEED_PHYSICS_MISMATCH"],
      resolutionStrategy: "PHYSICS_WINS",
      resolutionOutcome: "SUCCESS",
      confidenceBeforeReconciliation: 60,
      confidenceAfterReconciliation: 80,
      integrityScoreBefore: 70,
      integrityScoreAfter: 85,
      humanInterventionRequired: false,
      resolutionTimeMinutes: 2,
      engineVersions: { TRE: "4.0.0" },
    });
    expect(entry.entryId).toBeTruthy();
    expect(entry.claimId).toBe("CLAIM-500");
    expect(entry.timestamp).toBeTruthy();
  });

  it("18. getConflictPatterns returns patterns for recorded entries", () => {
    trustMemoryEngine.record({
      claimId: "CLAIM-501",
      conflictPatterns: ["FRAUD_COST_INCONSISTENCY"],
      resolutionStrategy: "FRAUD_WINS",
      resolutionOutcome: "SUCCESS",
      confidenceBeforeReconciliation: 55,
      confidenceAfterReconciliation: 75,
      integrityScoreBefore: 65,
      integrityScoreAfter: 80,
      humanInterventionRequired: false,
      resolutionTimeMinutes: 3,
      engineVersions: { TRE: "4.0.0" },
    });
    const patterns = trustMemoryEngine.getConflictPatterns();
    expect(Array.isArray(patterns)).toBe(true);
    expect(patterns.some((p) => p.patternType === "FRAUD_COST_INCONSISTENCY")).toBe(true);
  });

  it("19. generateInsights returns an array (may be empty)", () => {
    const insights = trustMemoryEngine.generateInsights();
    expect(Array.isArray(insights)).toBe(true);
  });

  it("20. getSimilarClaims returns matching entries", () => {
    trustMemoryEngine.record({
      claimId: "CLAIM-502",
      conflictPatterns: ["EVIDENCE_QUALITY_LOW"],
      resolutionStrategy: "MANUAL",
      resolutionOutcome: "PARTIAL",
      confidenceBeforeReconciliation: 40,
      confidenceAfterReconciliation: 60,
      integrityScoreBefore: 50,
      integrityScoreAfter: 65,
      humanInterventionRequired: true,
      resolutionTimeMinutes: 15,
      engineVersions: { TRE: "4.0.0" },
    });
    const similar = trustMemoryEngine.getSimilarClaims(
      ["EVIDENCE_QUALITY_LOW"],
      undefined,
      5
    );
    expect(Array.isArray(similar)).toBe(true);
    expect(similar.some((e) => e.claimId === "CLAIM-502")).toBe(true);
  });

  it("21. getSnapshot reflects recorded entries", () => {
    trustMemoryEngine.record({
      claimId: "CLAIM-503",
      conflictPatterns: ["UNKNOWN"],
      resolutionStrategy: "SYSTEM",
      resolutionOutcome: "SUCCESS",
      confidenceBeforeReconciliation: 70,
      confidenceAfterReconciliation: 85,
      integrityScoreBefore: 75,
      integrityScoreAfter: 88,
      humanInterventionRequired: false,
      resolutionTimeMinutes: 1,
      engineVersions: { TRE: "4.0.0" },
    });
    const snapshot = trustMemoryEngine.getSnapshot();
    expect(snapshot.totalEntries).toBeGreaterThanOrEqual(1);
    expect(snapshot.snapshotAt).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E6 — AI Model Governance
// ─────────────────────────────────────────────────────────────────────────────
describe("E6 — AI Model Governance", () => {
  it("22. registerModel stores a model", () => {
    const model = aiModelGovernanceEngine.registerModel({
      modelName: "FraudDetector",
      modelVersion: "1.0.0",
      category: "FRAUD_DETECTION",
      status: "ACTIVE",
      deployedAt: new Date().toISOString(),
      description: "Test fraud detection model",
      performanceBaseline: {
        accuracy: 0.92,
        precision: 0.90,
        recall: 0.88,
        f1Score: 0.89,
        averageConfidence: 0.85,
        calibrationError: 0.05,
        establishedAt: new Date().toISOString(),
        sampleSize: 1000,
      },
      governanceApproval: {
        approved: true,
        approvedBy: "admin",
        approvedAt: new Date().toISOString(),
      },
      affectedCTOSections: ["fraud"],
    });
    expect(model.modelId).toBeTruthy();
    expect(model.modelName).toBe("FraudDetector");
    expect(model.status).toBe("ACTIVE");
  });

  it("23. getActiveModels returns registered ACTIVE models", () => {
    aiModelGovernanceEngine.registerModel({
      modelName: "PhysicsEstimator",
      modelVersion: "2.0.0",
      category: "PHYSICS_ESTIMATION",
      status: "ACTIVE",
      deployedAt: new Date().toISOString(),
      description: "Test physics model",
      performanceBaseline: {
        accuracy: 0.88,
        precision: 0.85,
        recall: 0.87,
        f1Score: 0.86,
        averageConfidence: 0.82,
        calibrationError: 0.06,
        establishedAt: new Date().toISOString(),
        sampleSize: 500,
      },
      governanceApproval: { approved: true },
      affectedCTOSections: ["physics"],
    });
    const active = aiModelGovernanceEngine.getActiveModels();
    expect(active.length).toBeGreaterThanOrEqual(1);
    expect(active.every((m) => m.status === "ACTIVE")).toBe(true);
  });

  it("24. generateGovernanceReport has required fields", () => {
    const report = aiModelGovernanceEngine.generateGovernanceReport();
    expect(report).toBeDefined();
    expect(typeof report.totalModels).toBe("number");
    expect(typeof report.activeModels).toBe("number");
    expect(Array.isArray(report.modelSummaries)).toBe(true);
    expect(report.generatedAt).toBeTruthy();
    expect(typeof report.governanceHealthStatus).toBe("string");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E7 — Trust SLA Management
// ─────────────────────────────────────────────────────────────────────────────
describe("E7 — Trust SLA Management", () => {
  it("25. start() creates an ON_TRACK SLA record", () => {
    const record = trustSLAManager.start("CLAIM-700", "FULL_PIPELINE");
    expect(record.slaId).toBeTruthy();
    expect(record.claimId).toBe("CLAIM-700");
    expect(record.status).toBe("ON_TRACK");
    expect(record.operationType).toBe("FULL_PIPELINE");
  });

  it("26. complete() transitions SLA to COMPLETED", () => {
    const record = trustSLAManager.start("CLAIM-701", "TRE_RECONCILIATION");
    const completed = trustSLAManager.complete(record.slaId);
    expect(completed?.status).toBe("COMPLETED");
    expect(completed?.completedAt).toBeTruthy();
  });

  it("27. waive() transitions SLA to WAIVED", () => {
    const record = trustSLAManager.start("CLAIM-702", "HUMAN_REVIEW");
    const waived = trustSLAManager.waive(record.slaId, "manager-001", "Claim withdrawn");
    expect(waived?.status).toBe("WAIVED");
    expect(waived?.waivedBy).toBe("manager-001");
    expect(waived?.waivedReason).toBe("Claim withdrawn");
  });

  it("28. generatePerformanceReport has required fields", () => {
    trustSLAManager.start("CLAIM-703", "STAGE_8_FRAUD");
    const report = trustSLAManager.generatePerformanceReport();
    expect(report).toBeDefined();
    expect(typeof report.totalOperations).toBe("number");
    expect(report.periodStartAt).toBeTruthy();
    expect(report.periodEndAt).toBeTruthy();
    expect(report.generatedAt).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E8 — Trust Simulation Engine
// ─────────────────────────────────────────────────────────────────────────────
describe("E8 — Trust Simulation Engine", () => {
  it("29. defineScenario returns a scenario with correct shape", () => {
    const scenario = trustSimulationEngine.defineScenario(
      "High Fraud Scenario",
      "Simulates a high fraud risk claim",
      [{ key: "fraudRiskScore", simulatedValue: 90, description: "Elevated fraud score" }]
    );
    expect(scenario.scenarioId).toBeTruthy();
    expect(scenario.scenarioName).toBe("High Fraud Scenario");
    expect(scenario.parameters).toHaveLength(1);
    expect(scenario.parameters[0].key).toBe("fraudRiskScore");
  });

  it("30. simulate returns a result with originalCTO and simulatedCTO", () => {
    const cto = makeCTOStub();
    const scenario = trustSimulationEngine.defineScenario(
      "Speed Test",
      "Simulates higher speed",
      [{ key: "estimatedSpeedKmh", simulatedValue: 120, description: "High speed" }]
    );
    const result = trustSimulationEngine.simulate("CLAIM-800", cto, scenario);
    expect(result.originalCTO).toBeDefined();
    expect(result.simulatedCTO).toBeDefined();
    expect(result.claimId).toBe("CLAIM-800");
    expect(result.scenarioName).toBe("Speed Test");
  });

  it("31. simulate changes fraudRiskScore when parameter is set", () => {
    const cto = makeCTOStub();
    const scenario = trustSimulationEngine.defineScenario(
      "Fraud Spike",
      "Simulates fraud spike",
      [{ key: "fraudRiskScore", simulatedValue: 85, description: "Fraud spike" }]
    );
    const result = trustSimulationEngine.simulate("CLAIM-801", cto, scenario);
    expect(result.simulatedCTO.fraudRiskScore).toBe(85);
    expect(result.originalCTO.fraudRiskScore).toBe(cto.fraud.fraudRiskScore);
  });

  it("32. runBatch returns one result per scenario", () => {
    const cto = makeCTOStub();
    const s1 = trustSimulationEngine.defineScenario("S1", "desc1", [
      { key: "fraudRiskScore", simulatedValue: 50, description: "medium fraud" },
    ]);
    const s2 = trustSimulationEngine.defineScenario("S2", "desc2", [
      { key: "estimatedSpeedKmh", simulatedValue: 80, description: "medium speed" },
    ]);
    const results = trustSimulationEngine.runBatch("CLAIM-802", cto, [s1, s2]);
    expect(results).toHaveLength(2);
  });

  it("33. getStandardScenarios returns at least 2 scenarios", () => {
    const scenarios = trustSimulationEngine.getStandardScenarios();
    expect(scenarios.length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration — E1 → E2 → E3 chain
// ─────────────────────────────────────────────────────────────────────────────
describe("Integration — E1 → E2 → E3 chain", () => {
  it("34. emit event → analyse impact → enqueue resolution task", async () => {
    // E1: Emit a conflict event
    const event = conflictDetectedEvent(
      "CLAIM-INT-001",
      "Speed vs physics mismatch detected",
      ["physics", "fraud"],
      "HIGH"
    );
    await trustEventBus.publish(event);

    // Verify event was stored
    const claimEvents = trustEventBus.getClaimEvents("CLAIM-INT-001");
    expect(claimEvents).toHaveLength(1);
    expect(claimEvents[0].type).toBe("CONFLICT_DETECTED");

    // E2: Analyse impact of the event
    const impact = analyseImpact(event);
    expect(impact).toBeDefined();
    expect(impact.claimId).toBe("CLAIM-INT-001");
    expect(typeof impact.impactSeverity).toBe("string");

    // E3: Create and enqueue a resolution task
    const task = createConflictResolutionTask(
      "CLAIM-INT-001",
      "Speed vs physics mismatch detected",
      ["physics", "fraud"],
      "HIGH"
    );
    trustResolutionQueue.enqueue(task);

    // Verify task is in queue
    const pending = trustResolutionQueue.getPendingTasks();
    expect(pending.some((t) => t.claimId === "CLAIM-INT-001")).toBe(true);

    // Resolve the task
    const resolved = trustResolutionQueue.resolve(
      task.taskId,
      "Physics evidence confirmed by assessor",
      ["Assessor report", "Photo evidence"]
    );
    expect(resolved?.status).toBe("RESOLVED");

    // Verify stats
    const stats = trustResolutionQueue.getStats();
    expect(stats.byStatus["RESOLVED"]).toBeGreaterThanOrEqual(1);
  });
});
