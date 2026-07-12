/**
 * TRE v4.0 — Enhancement 5: Trust Memory Engine
 *
 * Provides cross-claim pattern learning and institutional memory for the TRE.
 * Tracks reconciliation outcomes, conflict patterns, resolution strategies,
 * and model performance over time to improve future reconciliation decisions.
 *
 * In-process memory store with serialisation support for DB persistence.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ConflictPatternType =
  | "SPEED_PHYSICS_MISMATCH"
  | "FRAUD_COST_INCONSISTENCY"
  | "TIMELINE_IMPOSSIBILITY"
  | "EVIDENCE_QUALITY_LOW"
  | "MULTI_SOURCE_DISAGREEMENT"
  | "MODEL_CONFIDENCE_LOW"
  | "REGULATORY_THRESHOLD_BREACH"
  | "ASSESSOR_OVERRIDE_PATTERN"
  | "CERTIFICATE_BLOCKED_PATTERN"
  | "UNKNOWN";

export interface ReconciliationMemoryEntry {
  entryId: string;
  claimId: string;
  assessmentId?: string;
  timestamp: string;
  conflictPatterns: ConflictPatternType[];
  resolutionStrategy: string;
  resolutionOutcome: "SUCCESS" | "PARTIAL" | "FAILED" | "ESCALATED";
  confidenceBeforeReconciliation: number;
  confidenceAfterReconciliation: number;
  integrityScoreBefore: number;
  integrityScoreAfter: number;
  humanInterventionRequired: boolean;
  resolutionTimeMinutes: number;
  engineVersions: Record<string, string>;
  jurisdictionCode?: string;
  claimTypeCode?: string;
  vehicleCategory?: string;
  fraudRiskScore?: number;
  finalDecision?: string;
}

export interface ConflictPattern {
  patternType: ConflictPatternType;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  averageResolutionTimeMinutes: number;
  successRate: number;
  humanInterventionRate: number;
  commonResolutionStrategies: string[];
  associatedJurisdictions: string[];
  associatedClaimTypes: string[];
}

export interface ModelPerformanceRecord {
  modelName: string;
  modelVersion: string;
  recordedAt: string;
  sampleSize: number;
  averageConfidence: number;
  conflictRate: number;
  humanInterventionRate: number;
  averageIntegrityScore: number;
  jurisdictionBreakdown: Record<string, { sampleSize: number; conflictRate: number }>;
}

export interface TrustMemorySnapshot {
  snapshotAt: string;
  totalEntries: number;
  conflictPatterns: ConflictPattern[];
  modelPerformance: ModelPerformanceRecord[];
  globalStats: {
    averageConfidence: number;
    averageIntegrityScore: number;
    overallConflictRate: number;
    humanInterventionRate: number;
    averageResolutionTimeMinutes: number;
    totalClaims: number;
    resolvedClaims: number;
    escalatedClaims: number;
  };
}

export interface TrustInsight {
  insightId: string;
  generatedAt: string;
  insightType:
    | "CONFLICT_PATTERN_EMERGING"
    | "MODEL_DRIFT_DETECTED"
    | "RESOLUTION_STRATEGY_EFFECTIVE"
    | "JURISDICTION_ANOMALY"
    | "CONFIDENCE_DEGRADATION"
    | "HUMAN_INTERVENTION_SPIKE";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  description: string;
  affectedEntities: string[];
  recommendedAction: string;
  supportingData: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Conflict pattern classifier
// ─────────────────────────────────────────────────────────────────────────────

export function classifyConflictPatterns(params: {
  hasSpeedPhysicsMismatch?: boolean;
  hasFraudCostInconsistency?: boolean;
  hasTimelineImpossibility?: boolean;
  hasLowEvidenceQuality?: boolean;
  hasMultiSourceDisagreement?: boolean;
  hasLowModelConfidence?: boolean;
  hasRegulatoryBreach?: boolean;
  hasAssessorOverride?: boolean;
  hasCertificateBlocked?: boolean;
}): ConflictPatternType[] {
  const patterns: ConflictPatternType[] = [];
  if (params.hasSpeedPhysicsMismatch) patterns.push("SPEED_PHYSICS_MISMATCH");
  if (params.hasFraudCostInconsistency) patterns.push("FRAUD_COST_INCONSISTENCY");
  if (params.hasTimelineImpossibility) patterns.push("TIMELINE_IMPOSSIBILITY");
  if (params.hasLowEvidenceQuality) patterns.push("EVIDENCE_QUALITY_LOW");
  if (params.hasMultiSourceDisagreement) patterns.push("MULTI_SOURCE_DISAGREEMENT");
  if (params.hasLowModelConfidence) patterns.push("MODEL_CONFIDENCE_LOW");
  if (params.hasRegulatoryBreach) patterns.push("REGULATORY_THRESHOLD_BREACH");
  if (params.hasAssessorOverride) patterns.push("ASSESSOR_OVERRIDE_PATTERN");
  if (params.hasCertificateBlocked) patterns.push("CERTIFICATE_BLOCKED_PATTERN");
  if (patterns.length === 0) patterns.push("UNKNOWN");
  return patterns;
}

// ─────────────────────────────────────────────────────────────────────────────
// Trust Memory Engine
// ─────────────────────────────────────────────────────────────────────────────

class TrustMemoryEngineImpl {
  private entries: Map<string, ReconciliationMemoryEntry> = new Map();
  private patternIndex: Map<ConflictPatternType, string[]> = new Map();
  private modelPerformance: Map<string, ModelPerformanceRecord[]> = new Map();

  private nextEntryId(): string {
    return `MEM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  record(
    entry: Omit<ReconciliationMemoryEntry, "entryId" | "timestamp">
  ): ReconciliationMemoryEntry {
    const full: ReconciliationMemoryEntry = {
      entryId: this.nextEntryId(),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    this.entries.set(full.entryId, full);

    // Index by conflict pattern
    for (const pattern of full.conflictPatterns) {
      const existing = this.patternIndex.get(pattern) ?? [];
      existing.push(full.entryId);
      this.patternIndex.set(pattern, existing);
    }

    return full;
  }

  recordModelPerformance(record: Omit<ModelPerformanceRecord, "recordedAt">): void {
    const full: ModelPerformanceRecord = {
      recordedAt: new Date().toISOString(),
      ...record,
    };
    const key = `${record.modelName}:${record.modelVersion}`;
    const existing = this.modelPerformance.get(key) ?? [];
    existing.push(full);
    this.modelPerformance.set(key, existing);
  }

  getConflictPatterns(): ConflictPattern[] {
    const patterns: ConflictPattern[] = [];

    for (const [patternType, entryIds] of this.patternIndex.entries()) {
      const entries = entryIds
        .map((id) => this.entries.get(id))
        .filter((e): e is ReconciliationMemoryEntry => e !== undefined);

      if (entries.length === 0) continue;

      const successCount = entries.filter((e) => e.resolutionOutcome === "SUCCESS").length;
      const humanCount = entries.filter((e) => e.humanInterventionRequired).length;
      const avgResolutionTime =
        entries.reduce((sum, e) => sum + e.resolutionTimeMinutes, 0) / entries.length;

      const strategyCounts: Record<string, number> = {};
      for (const e of entries) {
        strategyCounts[e.resolutionStrategy] = (strategyCounts[e.resolutionStrategy] ?? 0) + 1;
      }
      const commonStrategies = Object.entries(strategyCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([s]) => s);

      const jurisdictions = [...new Set(entries.map((e) => e.jurisdictionCode).filter(Boolean))] as string[];
      const claimTypes = [...new Set(entries.map((e) => e.claimTypeCode).filter(Boolean))] as string[];

      patterns.push({
        patternType,
        occurrenceCount: entries.length,
        firstSeenAt: entries.reduce((min, e) => e.timestamp < min ? e.timestamp : min, entries[0].timestamp),
        lastSeenAt: entries.reduce((max, e) => e.timestamp > max ? e.timestamp : max, entries[0].timestamp),
        averageResolutionTimeMinutes: avgResolutionTime,
        successRate: successCount / entries.length,
        humanInterventionRate: humanCount / entries.length,
        commonResolutionStrategies: commonStrategies,
        associatedJurisdictions: jurisdictions,
        associatedClaimTypes: claimTypes,
      });
    }

    return patterns.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
  }

  getModelPerformance(modelName?: string): ModelPerformanceRecord[] {
    if (modelName) {
      const results: ModelPerformanceRecord[] = [];
      for (const [key, records] of this.modelPerformance.entries()) {
        if (key.startsWith(`${modelName}:`)) {
          results.push(...records);
        }
      }
      return results;
    }
    const all: ModelPerformanceRecord[] = [];
    for (const records of this.modelPerformance.values()) {
      all.push(...records);
    }
    return all;
  }

  generateInsights(): TrustInsight[] {
    const insights: TrustInsight[] = [];
    const patterns = this.getConflictPatterns();
    const allEntries = [...this.entries.values()];

    // Insight 1: Emerging conflict patterns (>5 occurrences in last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    for (const pattern of patterns) {
      const recentCount = [...this.entries.values()].filter(
        (e) =>
          e.conflictPatterns.includes(pattern.patternType) &&
          e.timestamp >= sevenDaysAgo
      ).length;

      if (recentCount >= 5) {
        insights.push({
          insightId: `INS-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          generatedAt: new Date().toISOString(),
          insightType: "CONFLICT_PATTERN_EMERGING",
          severity: recentCount >= 10 ? "HIGH" : "MEDIUM",
          title: `Emerging conflict pattern: ${pattern.patternType}`,
          description: `${recentCount} occurrences of ${pattern.patternType} in the last 7 days (${(pattern.successRate * 100).toFixed(0)}% resolution rate)`,
          affectedEntities: [pattern.patternType],
          recommendedAction: `Review ${pattern.patternType} conflict handling. Common resolution: ${pattern.commonResolutionStrategies[0] ?? "N/A"}`,
          supportingData: { recentCount, successRate: pattern.successRate },
        });
      }
    }

    // Insight 2: Human intervention spike
    const recentEntries = allEntries.filter((e) => e.timestamp >= sevenDaysAgo);
    if (recentEntries.length >= 5) {
      const humanRate = recentEntries.filter((e) => e.humanInterventionRequired).length / recentEntries.length;
      if (humanRate > 0.3) {
        insights.push({
          insightId: `INS-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          generatedAt: new Date().toISOString(),
          insightType: "HUMAN_INTERVENTION_SPIKE",
          severity: humanRate > 0.5 ? "CRITICAL" : "HIGH",
          title: `Human intervention rate elevated: ${(humanRate * 100).toFixed(0)}%`,
          description: `${(humanRate * 100).toFixed(0)}% of recent claims required human intervention (threshold: 30%)`,
          affectedEntities: ["human-review-queue"],
          recommendedAction: "Review automated reconciliation rules and consider rule engine updates",
          supportingData: { humanRate, sampleSize: recentEntries.length },
        });
      }
    }

    // Insight 3: Confidence degradation
    if (allEntries.length >= 10) {
      const recent10 = allEntries.slice(-10);
      const avgConfidence = recent10.reduce((s, e) => s + e.confidenceAfterReconciliation, 0) / 10;
      if (avgConfidence < 0.6) {
        insights.push({
          insightId: `INS-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          generatedAt: new Date().toISOString(),
          insightType: "CONFIDENCE_DEGRADATION",
          severity: avgConfidence < 0.4 ? "CRITICAL" : "HIGH",
          title: `Average confidence degraded to ${(avgConfidence * 100).toFixed(0)}%`,
          description: `Recent claims averaging ${(avgConfidence * 100).toFixed(0)}% post-reconciliation confidence (threshold: 60%)`,
          affectedEntities: ["confidence-engine"],
          recommendedAction: "Investigate evidence quality, model calibration, and data sources",
          supportingData: { avgConfidence, sampleSize: 10 },
        });
      }
    }

    return insights;
  }

  getSnapshot(): TrustMemorySnapshot {
    const allEntries = [...this.entries.values()];
    const patterns = this.getConflictPatterns();
    const modelPerf = this.getModelPerformance();

    const totalResolutionTime = allEntries.reduce((s, e) => s + e.resolutionTimeMinutes, 0);
    const humanCount = allEntries.filter((e) => e.humanInterventionRequired).length;
    const escalatedCount = allEntries.filter((e) => e.resolutionOutcome === "ESCALATED").length;
    const resolvedCount = allEntries.filter((e) => e.resolutionOutcome === "SUCCESS").length;
    const conflictCount = allEntries.filter((e) => e.conflictPatterns[0] !== "UNKNOWN").length;

    return {
      snapshotAt: new Date().toISOString(),
      totalEntries: allEntries.length,
      conflictPatterns: patterns,
      modelPerformance: modelPerf,
      globalStats: {
        averageConfidence: allEntries.length > 0
          ? allEntries.reduce((s, e) => s + e.confidenceAfterReconciliation, 0) / allEntries.length
          : 0,
        averageIntegrityScore: allEntries.length > 0
          ? allEntries.reduce((s, e) => s + e.integrityScoreAfter, 0) / allEntries.length
          : 0,
        overallConflictRate: allEntries.length > 0 ? conflictCount / allEntries.length : 0,
        humanInterventionRate: allEntries.length > 0 ? humanCount / allEntries.length : 0,
        averageResolutionTimeMinutes: allEntries.length > 0 ? totalResolutionTime / allEntries.length : 0,
        totalClaims: allEntries.length,
        resolvedClaims: resolvedCount,
        escalatedClaims: escalatedCount,
      },
    };
  }

  getSimilarClaims(
    conflictPatterns: ConflictPatternType[],
    jurisdictionCode?: string,
    limit = 5
  ): ReconciliationMemoryEntry[] {
    return [...this.entries.values()]
      .filter((e) => {
        const patternMatch = conflictPatterns.some((p) => e.conflictPatterns.includes(p));
        const jurisdictionMatch = !jurisdictionCode || e.jurisdictionCode === jurisdictionCode;
        return patternMatch && jurisdictionMatch;
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
  }

  clear(): void {
    this.entries.clear();
    this.patternIndex.clear();
    this.modelPerformance.clear();
  }
}

export const trustMemoryEngine = new TrustMemoryEngineImpl();
