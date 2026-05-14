/**
 * mlBenchmarkEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Hybrid Benchmark Inference Engine
 *
 * Provides cost range assessments (P25/P50/P75) for vehicle repair components
 * using a two-tier routing strategy:
 *
 *   Tier 1 — ML Model (GBM quantile regression)
 *     Available for: engine, boot_lid, roof, dashboard,
 *                    left_front_door, right_front_door
 *     Features: vehicle make (ordinal) + vehicle age (numeric)
 *     Trained on: 7,625-row enriched corpus (May 2026)
 *
 *   Tier 2 — Statistical Benchmark (IQR from training corpus)
 *     Available for: all 33 components with n ≥ 10
 *     Stored in: component_benchmarks.json
 *
 *   Tier 3 — No data
 *     Returns null for all percentiles.
 *
 * The engine is pure TypeScript — no Python dependency at runtime.
 * GBM trees are stored as JSON coefficient files and evaluated here.
 *
 * USAGE:
 *   import { assessCost } from "./mlBenchmarkEngine";
 *
 *   const result = assessCost({
 *     componentId: "engine",
 *     quotedCostUsd: 2500,
 *     vehicleMake: "Toyota",
 *     vehicleYear: 2015,
 *   });
 *   // result.verdict: "IN_RANGE" | "ABOVE_RANGE" | "BELOW_RANGE" | "INSUFFICIENT_DATA"
 *   // result.modelSource: "ml" | "statistical" | "none"
 *   // result.p25, result.p50, result.p75: number | null
 */

import * as fs from "fs";
import * as path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GBMTree {
  children_left: number[];
  children_right: number[];
  feature: number[];
  threshold: number[];
  value: number[];
}

interface GBMModel {
  learning_rate: number;
  init_prediction: number;
  feature_names: string[];
  make_categories: string[];
  trees: GBMTree[];
}

interface MLModelFile {
  component_id: string;
  n_training: number;
  model_version: string;
  trained_at: string;
  insample_iqr_coverage: number;
  insample_mape_p50: number;
  p25: GBMModel;
  p50: GBMModel;
  p75: GBMModel;
}

interface StatisticalBenchmark {
  component_id: string;
  make: string | null;
  n: number;
  p25: number;
  median: number;
  p75: number;
  p95: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

interface BenchmarkFile {
  generated_at: string;
  total_benchmarks: number;
  benchmarks: StatisticalBenchmark[];
}

export interface CostAssessmentInput {
  componentId: string;
  quotedCostUsd: number;
  vehicleMake?: string | null;
  vehicleYear?: number | null;
}

export interface CostAssessmentResult {
  /** Verdict based on P25/P75 band */
  verdict: "IN_RANGE" | "ABOVE_RANGE" | "BELOW_RANGE" | "INSUFFICIENT_DATA";
  /** Source of the benchmark used */
  modelSource: "ml" | "statistical" | "none";
  /** 25th percentile estimate (USD) */
  p25: number | null;
  /** Median (50th percentile) estimate (USD) */
  p50: number | null;
  /** 75th percentile estimate (USD) */
  p75: number | null;
  /** Number of training observations */
  nTraining: number | null;
  /** Confidence tier (only for statistical source) */
  confidence: "HIGH" | "MEDIUM" | "LOW" | null;
  /** Human-readable description of the model used */
  modelDescription: string;
}

// ─── Model registry (lazy-loaded, module-level cache) ─────────────────────────

const ML_MODELS_DIR = path.join(__dirname, "ml-models");
const BENCHMARKS_PATH = path.join(__dirname, "..", "..", "component_benchmarks.json");

const _mlModelCache: Map<string, MLModelFile> = new Map();
let _statisticalBenchmarks: BenchmarkFile | null = null;

function loadMLModel(componentId: string): MLModelFile | null {
  if (_mlModelCache.has(componentId)) {
    return _mlModelCache.get(componentId)!;
  }
  const filePath = path.join(ML_MODELS_DIR, `${componentId}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const model = JSON.parse(raw) as MLModelFile;
    _mlModelCache.set(componentId, model);
    return model;
  } catch {
    return null;
  }
}

function loadStatisticalBenchmarks(): BenchmarkFile | null {
  if (_statisticalBenchmarks) return _statisticalBenchmarks;
  // Try project root first, then pipeline-v2 dir
  const candidates = [
    BENCHMARKS_PATH,
    path.join(__dirname, "component_benchmarks.json"),
    path.join(process.cwd(), "component_benchmarks.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        _statisticalBenchmarks = JSON.parse(fs.readFileSync(p, "utf-8")) as BenchmarkFile;
        return _statisticalBenchmarks;
      } catch {
        continue;
      }
    }
  }
  return null;
}

// ─── GBM tree evaluation ──────────────────────────────────────────────────────

/**
 * Evaluate a single GBM tree for a given feature vector.
 * Returns the leaf value at the terminal node.
 */
function evaluateTree(tree: GBMTree, features: number[]): number {
  let node = 0;
  const LEAF = -1; // sklearn uses -1 for TREE_LEAF
  while (tree.children_left[node] !== LEAF) {
    const featureIdx = tree.feature[node];
    const threshold = tree.threshold[node];
    const featureVal = features[featureIdx] ?? 0;
    if (featureVal <= threshold) {
      node = tree.children_left[node];
    } else {
      node = tree.children_right[node];
    }
  }
  return tree.value[node];
}

/**
 * Run full GBM prediction for a given model and feature vector.
 * Returns the prediction in log-space (apply expm1 to get USD).
 */
function predictGBM(model: GBMModel, features: number[]): number {
  let prediction = model.init_prediction;
  for (const tree of model.trees) {
    prediction += model.learning_rate * evaluateTree(tree, features);
  }
  return prediction;
}

/**
 * Build the feature vector [make_ordinal, vehicle_age] for a given input.
 * make_ordinal: index in make_categories array, or -1 if unknown.
 */
function buildFeatureVector(
  model: GBMModel,
  vehicleMake: string | null | undefined,
  vehicleYear: number | null | undefined
): number[] {
  const makeClean = vehicleMake
    ? vehicleMake.trim().replace(/\b\w/g, c => c.toUpperCase())
    : "Unknown";
  const makeIdx = model.make_categories.indexOf(makeClean);
  const ordinal = makeIdx >= 0 ? makeIdx : -1; // -1 = unknown/other

  const year = vehicleYear && vehicleYear > 1980 && vehicleYear <= 2026
    ? vehicleYear
    : 2015;
  const vehicleAge = Math.max(0, Math.min(35, 2026 - year));

  return [ordinal, vehicleAge];
}

// ─── Statistical benchmark lookup ─────────────────────────────────────────────

function lookupStatisticalBenchmark(
  componentId: string,
  vehicleMake?: string | null
): StatisticalBenchmark | null {
  const bm = loadStatisticalBenchmarks();
  if (!bm) return null;

  // Try make-specific first (if make provided and n ≥ 10)
  if (vehicleMake) {
    const makeClean = vehicleMake.trim().replace(/\b\w/g, c => c.toUpperCase());
    const makeSpecific = bm.benchmarks.find(
      b => b.component_id === componentId && b.make === makeClean && b.n >= 10
    );
    if (makeSpecific) return makeSpecific;
  }

  // Fall back to global benchmark
  return bm.benchmarks.find(
    b => b.component_id === componentId && b.make === null
  ) ?? null;
}

// ─── Main assessment function ─────────────────────────────────────────────────

/**
 * assessCost
 *
 * Assesses whether a quoted repair cost is within the expected range for
 * a given component, using the hybrid ML + statistical model.
 *
 * @param input - Component ID, quoted cost, and optional vehicle metadata
 * @returns CostAssessmentResult with verdict, percentiles, and model source
 */
export function assessCost(input: CostAssessmentInput): CostAssessmentResult {
  const { componentId, quotedCostUsd, vehicleMake, vehicleYear } = input;

  // ── Tier 1: ML Model ──────────────────────────────────────────────────────
  const mlModel = loadMLModel(componentId);
  if (mlModel) {
    const features = buildFeatureVector(mlModel.p50, vehicleMake, vehicleYear);
    const logP25 = predictGBM(mlModel.p25, features);
    const logP50 = predictGBM(mlModel.p50, features);
    const logP75 = predictGBM(mlModel.p75, features);

    const p25 = Math.round(Math.expm1(logP25));
    const p50 = Math.round(Math.expm1(logP50));
    const p75 = Math.round(Math.expm1(logP75));

    // Sanity check: p25 < p75, both positive
    if (p25 > 0 && p75 > p25) {
      const verdict = quotedCostUsd < p25
        ? "BELOW_RANGE"
        : quotedCostUsd > p75
        ? "ABOVE_RANGE"
        : "IN_RANGE";

      const makeLabel = vehicleMake ? ` (${vehicleMake})` : "";
      return {
        verdict,
        modelSource: "ml",
        p25,
        p50,
        p75,
        nTraining: mlModel.n_training,
        confidence: null,
        modelDescription: `ML quantile regression${makeLabel} — trained on ${mlModel.n_training} observations`,
      };
    }
  }

  // ── Tier 2: Statistical Benchmark ─────────────────────────────────────────
  const stat = lookupStatisticalBenchmark(componentId, vehicleMake);
  if (stat) {
    const verdict = quotedCostUsd < stat.p25
      ? "BELOW_RANGE"
      : quotedCostUsd > stat.p75
      ? "ABOVE_RANGE"
      : "IN_RANGE";

    const makeLabel = stat.make ? ` (${stat.make})` : " (global)";
    return {
      verdict,
      modelSource: "statistical",
      p25: stat.p25,
      p50: stat.median,
      p75: stat.p75,
      nTraining: stat.n,
      confidence: stat.confidence,
      modelDescription: `Statistical IQR${makeLabel} — ${stat.n} observations, ${stat.confidence} confidence`,
    };
  }

  // ── Tier 3: No data ────────────────────────────────────────────────────────
  return {
    verdict: "INSUFFICIENT_DATA",
    modelSource: "none",
    p25: null,
    p50: null,
    p75: null,
    nTraining: null,
    confidence: null,
    modelDescription: "No benchmark data available for this component",
  };
}

/**
 * assessCostBatch
 *
 * Batch version of assessCost for processing multiple line items.
 */
export function assessCostBatch(
  items: CostAssessmentInput[]
): CostAssessmentResult[] {
  return items.map(item => assessCost(item));
}

/**
 * getModelInfo
 *
 * Returns metadata about which model is available for a given component.
 * Useful for UI display and debugging.
 */
export function getModelInfo(componentId: string): {
  hasMlModel: boolean;
  hasStatisticalBenchmark: boolean;
  mlModelVersion?: string;
  mlNTraining?: number;
  statisticalN?: number;
  statisticalConfidence?: string;
} {
  const mlModel = loadMLModel(componentId);
  const stat = lookupStatisticalBenchmark(componentId);

  return {
    hasMlModel: mlModel !== null,
    hasStatisticalBenchmark: stat !== null,
    mlModelVersion: mlModel?.model_version,
    mlNTraining: mlModel?.n_training,
    statisticalN: stat?.n,
    statisticalConfidence: stat?.confidence,
  };
}
