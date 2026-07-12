/**
 * TRE v4.0 — Enhancement 6: AI Model Governance
 *
 * Tracks model versions, detects drift, manages model lifecycle,
 * and ensures all AI-generated truth values are traceable to a
 * specific model version with performance metadata.
 */

import { trustEventBus, modelDriftEvent } from "./trustEventBus";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ModelStatus = "ACTIVE" | "DEPRECATED" | "UNDER_REVIEW" | "RETIRED" | "EXPERIMENTAL";
export type ModelCategory =
  | "FRAUD_DETECTION"
  | "DAMAGE_CLASSIFICATION"
  | "PHYSICS_ESTIMATION"
  | "COST_ESTIMATION"
  | "DOCUMENT_EXTRACTION"
  | "IMAGE_QUALITY"
  | "SPEED_INFERENCE"
  | "REGULATORY_COMPLIANCE";

export interface ModelVersion {
  modelId: string;
  modelName: string;
  modelVersion: string;
  category: ModelCategory;
  status: ModelStatus;
  deployedAt: string;
  deprecatedAt?: string;
  retiredAt?: string;
  description: string;
  performanceBaseline: ModelPerformanceBaseline;
  currentPerformance: ModelPerformanceMetrics;
  driftStatus: ModelDriftStatus;
  governanceApproval: GovernanceApproval;
  affectedCTOSections: string[];
}

export interface ModelPerformanceBaseline {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  averageConfidence: number;
  calibrationError: number;
  establishedAt: string;
  sampleSize: number;
}

export interface ModelPerformanceMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  averageConfidence: number;
  calibrationError: number;
  measuredAt: string;
  sampleSize: number;
  conflictRate: number;
  humanOverrideRate: number;
}

export type DriftSeverity = "NONE" | "MINOR" | "MODERATE" | "SIGNIFICANT" | "CRITICAL";

export interface ModelDriftStatus {
  driftDetected: boolean;
  driftScore: number;
  driftSeverity: DriftSeverity;
  driftDetectedAt?: string;
  affectedMetrics: string[];
  recommendedAction: string;
}

export interface GovernanceApproval {
  approved: boolean;
  approvedBy?: string;
  approvedAt?: string;
  approvalNotes?: string;
  reviewRequiredAt?: string;
}

export interface ModelUsageRecord {
  usageId: string;
  modelId: string;
  claimId: string;
  assessmentId?: string;
  usedAt: string;
  inputHash: string;
  outputConfidence: number;
  outputValue?: unknown;
  wasOverridden: boolean;
  overrideReason?: string;
  processingTimeMs: number;
}

export interface ModelGovernanceReport {
  generatedAt: string;
  totalModels: number;
  activeModels: number;
  modelsWithDrift: number;
  modelsRequiringReview: number;
  modelSummaries: ModelGovernanceSummary[];
  globalDriftScore: number;
  governanceHealthStatus: "HEALTHY" | "ATTENTION_REQUIRED" | "CRITICAL";
}

export interface ModelGovernanceSummary {
  modelId: string;
  modelName: string;
  modelVersion: string;
  category: ModelCategory;
  status: ModelStatus;
  driftSeverity: DriftSeverity;
  usageCount: number;
  overrideRate: number;
  averageConfidence: number;
  lastUsedAt?: string;
  governanceApproved: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Drift detection
// ─────────────────────────────────────────────────────────────────────────────

export function detectDrift(
  baseline: ModelPerformanceBaseline,
  current: ModelPerformanceMetrics
): ModelDriftStatus {
  const accuracyDrift = Math.abs(baseline.accuracy - current.accuracy);
  const confidenceDrift = Math.abs(baseline.averageConfidence - current.averageConfidence);
  const calibrationDrift = Math.abs(baseline.calibrationError - current.calibrationError);
  const f1Drift = Math.abs(baseline.f1Score - current.f1Score);

  const driftScore = (
    accuracyDrift * 0.35 +
    confidenceDrift * 0.25 +
    calibrationDrift * 0.20 +
    f1Drift * 0.20
  );

  const driftSeverity: DriftSeverity =
    driftScore >= 0.20 ? "CRITICAL" :
    driftScore >= 0.15 ? "SIGNIFICANT" :
    driftScore >= 0.08 ? "MODERATE" :
    driftScore >= 0.03 ? "MINOR" :
    "NONE";

  const affectedMetrics: string[] = [];
  if (accuracyDrift > 0.05) affectedMetrics.push("accuracy");
  if (confidenceDrift > 0.05) affectedMetrics.push("confidence");
  if (calibrationDrift > 0.05) affectedMetrics.push("calibration");
  if (f1Drift > 0.05) affectedMetrics.push("f1Score");

  const recommendedAction =
    driftSeverity === "CRITICAL" ? "Immediate model review and potential rollback required" :
    driftSeverity === "SIGNIFICANT" ? "Schedule model retraining within 48 hours" :
    driftSeverity === "MODERATE" ? "Monitor closely and plan retraining" :
    driftSeverity === "MINOR" ? "Continue monitoring" :
    "No action required";

  return {
    driftDetected: driftSeverity !== "NONE",
    driftScore,
    driftSeverity,
    driftDetectedAt: driftSeverity !== "NONE" ? new Date().toISOString() : undefined,
    affectedMetrics,
    recommendedAction,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Model Governance Engine
// ─────────────────────────────────────────────────────────────────────────────

class AIModelGovernanceEngineImpl {
  private models: Map<string, ModelVersion> = new Map();
  private usageRecords: Map<string, ModelUsageRecord[]> = new Map();

  private nextModelId(): string {
    return `MODEL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  }

  registerModel(
    params: Omit<ModelVersion, "modelId" | "driftStatus" | "currentPerformance"> & {
      currentPerformance?: Partial<ModelPerformanceMetrics>;
    }
  ): ModelVersion {
    const modelId = this.nextModelId();
    const driftStatus = detectDrift(params.performanceBaseline, {
      accuracy: params.performanceBaseline.accuracy,
      precision: params.performanceBaseline.precision,
      recall: params.performanceBaseline.recall,
      f1Score: params.performanceBaseline.f1Score,
      averageConfidence: params.performanceBaseline.averageConfidence,
      calibrationError: params.performanceBaseline.calibrationError,
      measuredAt: new Date().toISOString(),
      sampleSize: 0,
      conflictRate: 0,
      humanOverrideRate: 0,
      ...params.currentPerformance,
    });

    // Destructure to exclude currentPerformance from the spread (it's already built above)
    const { currentPerformance: _cp, ...restParams } = params;
    const model: ModelVersion = {
      modelId,
      driftStatus,
      currentPerformance: {
        accuracy: _cp?.accuracy ?? params.performanceBaseline.accuracy,
        precision: _cp?.precision ?? params.performanceBaseline.precision,
        recall: _cp?.recall ?? params.performanceBaseline.recall,
        f1Score: _cp?.f1Score ?? params.performanceBaseline.f1Score,
        averageConfidence: _cp?.averageConfidence ?? params.performanceBaseline.averageConfidence,
        calibrationError: _cp?.calibrationError ?? params.performanceBaseline.calibrationError,
        measuredAt: _cp?.measuredAt ?? new Date().toISOString(),
        sampleSize: _cp?.sampleSize ?? 0,
        conflictRate: _cp?.conflictRate ?? 0,
        humanOverrideRate: _cp?.humanOverrideRate ?? 0,
      },
      ...restParams,
    };

    this.models.set(modelId, model);
    return model;
  }

  async updatePerformance(
    modelId: string,
    metrics: Partial<ModelPerformanceMetrics>,
    affectedClaimIds: string[] = []
  ): Promise<ModelVersion | null> {
    const model = this.models.get(modelId);
    if (!model) return null;

    const updatedMetrics: ModelPerformanceMetrics = {
      accuracy: metrics.accuracy ?? model.currentPerformance.accuracy,
      precision: metrics.precision ?? model.currentPerformance.precision,
      recall: metrics.recall ?? model.currentPerformance.recall,
      f1Score: metrics.f1Score ?? model.currentPerformance.f1Score,
      averageConfidence: metrics.averageConfidence ?? model.currentPerformance.averageConfidence,
      calibrationError: metrics.calibrationError ?? model.currentPerformance.calibrationError,
      sampleSize: metrics.sampleSize ?? model.currentPerformance.sampleSize,
      conflictRate: metrics.conflictRate ?? model.currentPerformance.conflictRate,
      humanOverrideRate: metrics.humanOverrideRate ?? model.currentPerformance.humanOverrideRate,
      measuredAt: new Date().toISOString(),
    };

    const driftStatus = detectDrift(model.performanceBaseline, updatedMetrics);

    const updated: ModelVersion = {
      ...model,
      currentPerformance: updatedMetrics,
      driftStatus,
    };

    this.models.set(modelId, updated);

    // Publish drift event if significant
    if (driftStatus.driftSeverity === "SIGNIFICANT" || driftStatus.driftSeverity === "CRITICAL") {
      await trustEventBus.publish(
        modelDriftEvent(model.modelName, model.modelVersion, driftStatus.driftScore, affectedClaimIds)
      );
    }

    return updated;
  }

  recordUsage(
    modelId: string,
    claimId: string,
    inputHash: string,
    outputConfidence: number,
    processingTimeMs: number,
    outputValue?: unknown,
    assessmentId?: string
  ): ModelUsageRecord {
    const record: ModelUsageRecord = {
      usageId: `USAGE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      modelId,
      claimId,
      assessmentId,
      usedAt: new Date().toISOString(),
      inputHash,
      outputConfidence,
      outputValue,
      wasOverridden: false,
      processingTimeMs,
    };

    const existing = this.usageRecords.get(modelId) ?? [];
    existing.push(record);
    this.usageRecords.set(modelId, existing);

    return record;
  }

  recordOverride(usageId: string, modelId: string, reason: string): void {
    const records = this.usageRecords.get(modelId);
    if (!records) return;
    const idx = records.findIndex((r) => r.usageId === usageId);
    if (idx >= 0) {
      records[idx] = { ...records[idx], wasOverridden: true, overrideReason: reason };
    }
  }

  getModel(modelId: string): ModelVersion | undefined {
    return this.models.get(modelId);
  }

  getActiveModels(category?: ModelCategory): ModelVersion[] {
    return [...this.models.values()].filter(
      (m) => m.status === "ACTIVE" && (!category || m.category === category)
    );
  }

  getModelsWithDrift(): ModelVersion[] {
    return [...this.models.values()].filter((m) => m.driftStatus.driftDetected);
  }

  generateGovernanceReport(): ModelGovernanceReport {
    const allModels = [...this.models.values()];
    const activeModels = allModels.filter((m) => m.status === "ACTIVE");
    const driftModels = allModels.filter((m) => m.driftStatus.driftDetected);
    const reviewRequired = allModels.filter(
      (m) =>
        m.driftStatus.driftSeverity === "SIGNIFICANT" ||
        m.driftStatus.driftSeverity === "CRITICAL" ||
        !m.governanceApproval.approved
    );

    const globalDriftScore =
      allModels.length > 0
        ? allModels.reduce((s, m) => s + m.driftStatus.driftScore, 0) / allModels.length
        : 0;

    const governanceHealthStatus =
      globalDriftScore > 0.15 || driftModels.some((m) => m.driftStatus.driftSeverity === "CRITICAL")
        ? "CRITICAL"
        : reviewRequired.length > 0
          ? "ATTENTION_REQUIRED"
          : "HEALTHY";

    const modelSummaries: ModelGovernanceSummary[] = allModels.map((m) => {
      const usageRecs = this.usageRecords.get(m.modelId) ?? [];
      const overrideCount = usageRecs.filter((r) => r.wasOverridden).length;
      const lastUsed = usageRecs.length > 0
        ? usageRecs.reduce((max, r) => r.usedAt > max ? r.usedAt : max, usageRecs[0].usedAt)
        : undefined;

      return {
        modelId: m.modelId,
        modelName: m.modelName,
        modelVersion: m.modelVersion,
        category: m.category,
        status: m.status,
        driftSeverity: m.driftStatus.driftSeverity,
        usageCount: usageRecs.length,
        overrideRate: usageRecs.length > 0 ? overrideCount / usageRecs.length : 0,
        averageConfidence: m.currentPerformance.averageConfidence,
        lastUsedAt: lastUsed,
        governanceApproved: m.governanceApproval.approved,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      totalModels: allModels.length,
      activeModels: activeModels.length,
      modelsWithDrift: driftModels.length,
      modelsRequiringReview: reviewRequired.length,
      modelSummaries,
      globalDriftScore,
      governanceHealthStatus,
    };
  }

  clear(): void {
    this.models.clear();
    this.usageRecords.clear();
  }
}

export const aiModelGovernanceEngine = new AIModelGovernanceEngineImpl();
