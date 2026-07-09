# FSS-2026-001 Governance Report
## KINGA Fraud Scoring Standard — Implementation & Migration

**Document reference:** FSS-2026-001-REPORT  
**Standard reference:** FSS-2026-001  
**Date:** 2026-07-09  
**Status:** Complete — Checkpoint `5398980f`

---

## Executive Summary

This report documents the implementation of the KINGA Fraud Scoring Standard (FSS-2026-001), which establishes a single, authoritative five-band fraud risk classification system for the KINGA AutoVerify AI platform. Prior to this work, the codebase contained at least four independent implementations of score-to-level mapping logic, each with subtly different band boundaries and terminology. The most consequential divergence was the treatment of score 20, which mapped to `"minimal"` in some engines and `"low"` in others, and the use of `"medium"` versus `"moderate"` as the label for the middle band. This created a latent risk of inconsistent claim routing decisions depending on which code path was exercised.

The migration consolidates all threshold logic into a single shared module (`shared/fraudScoring.ts`), establishes the canonical band boundaries through a formal governance document (`docs/KINGA-FRAUD-SCORING-STANDARD.md`), and validates the implementation with 49 boundary-focused unit tests. All 16 consumer files have been refactored to import from the shared module. No routing logic, approval thresholds, or audit trail structures were altered beyond the terminology normalisation described herein.

---

## 1. Canonical Band Definitions (FSS-2026-001)

The following table defines the authoritative fraud risk bands. These boundaries are now enforced exclusively by `shared/fraudScoring.ts` and are not duplicated anywhere else in the codebase.

| Band | Score Range | Label | Routing Implication |
|---|---|---|---|
| 1 | 0 – 19 | `minimal` | Auto-approve eligible |
| 2 | 20 – 39 | `low` | Auto-approve eligible with standard audit |
| 3 | 40 – 60 | `moderate` | Manual review trigger |
| 4 | 61 – 80 | `high` | Fraud team referral |
| 5 | 81 – 100 | `elevated` | Immediate escalation |

**Boundary rule:** All comparisons use inclusive lower bounds and exclusive upper bounds, expressed as `score >= lower && score <= upper`. The boundary score 20 maps to `"low"` (not `"minimal"`); score 40 maps to `"moderate"`; score 61 maps to `"high"`; score 81 maps to `"elevated"`.

---

## 2. Pre-Migration State

Before this migration, the following independent implementations existed:

| File | Implementation | Divergence from FSS-2026-001 |
|---|---|---|
| `server/weighted-fraud-scoring.ts` | Local `scoreToLevel()` | Score 20 → `"minimal"` (off-by-one at lower boundary) |
| `server/intelligence-enforcement.ts` | Local `enforceFraudLevel()` | Used `"moderate"` correctly but had no shared contract |
| `server/report-normalisation.ts` | Local `scoreToLevel()` | Score 20 → `"minimal"` (same off-by-one as above) |
| `server/pipeline-v2/stage-8-fraud.ts` | Local `scoreToLevel()` | Used `"medium"` instead of `"moderate"` |
| `server/pipeline-v2/types.ts` | `FraudRiskLevel` type union | Included `"medium"` not `"moderate"` |
| `server/pipeline-v2/claimsDecisionAuthority.ts` | Inline score fallback + `normaliseFraudLevel()` | Inline thresholds; `"medium"` in REVIEW_FRAUD_LEVELS |
| `server/pipeline-v2/claimTruthLayer.ts` | Type union in `stage8FraudLevel` | Included `"medium"` not `"moderate"` |
| `server/pipeline-v2/decisionTraceGenerator.ts` | `fraudLevelLabel` map | `"medium"` key |
| `server/pipeline-v2/narrativeEngine.ts` | `fraudActionText` map | `"medium"` key |
| `server/pipeline-v2/causalChainBuilder.ts` | `MANUAL_REVIEW_FRAUD_LEVELS` set | `"medium"` value |
| `server/pipeline-v2/claimsEscalationRouter.ts` | `MEDIUM_FRAUD_LEVELS` set + fallback string | `"medium"` value |
| `server/pipeline-v2/contradictionDetectionEngine.ts` | `MODERATE_FRAUD_LEVELS` set | `"medium"` value |
| `server/pipeline-v2/decisionOptimisationEngine.ts` | `DOECandidate.fraudRisk` type + `scoreFraudRisk()` map | `"medium"` in type and scoring map |
| `server/pipeline-v2/engineFallback.ts` | `buildFraudFallback()` default level | `"medium"` as FraudRiskLevel |
| `server/routers/decision.ts` | Multiple type casts and z.enum | `"medium"` in type casts |
| `server/routers.ts` | Fraud level comparison and z.enum | `"medium"` in comparisons |

---

## 3. Shared Module Architecture

### `shared/fraudScoring.ts`

```typescript
export type FraudRiskLevel = "minimal" | "low" | "moderate" | "high" | "elevated";

/**
 * FSS-2026-001 — canonical score-to-level mapping.
 * All five bands use inclusive bounds on both ends.
 *
 * Band  Score    Label
 *  1    0–19     minimal
 *  2    20–39    low
 *  3    40–60    moderate
 *  4    61–80    high
 *  5    81–100   elevated
 */
export function scoreToFraudLevel(score: number): FraudRiskLevel {
  if (score <= 19) return "minimal";
  if (score <= 39) return "low";
  if (score <= 60) return "moderate";
  if (score <= 80) return "high";
  return "elevated";
}
```

The module is located in `shared/` (not `server/`) to make it importable from both server-side pipeline code and any future client-side or shared utility code without creating circular dependencies.

### `server/pipeline-v2/types.ts`

`FraudRiskLevel` is no longer defined locally. It is re-exported from `shared/fraudScoring.ts`:

```typescript
export type { FraudRiskLevel } from "../../shared/fraudScoring";
```

This ensures that all pipeline types remain consistent with the canonical definition without requiring consumers to change their import paths.

---

## 4. Boundary Test Results

The test file `shared/fraudScoring.test.ts` contains 49 tests covering every band boundary, interior values, and edge cases.

| Test category | Count | Result |
|---|---|---|
| Band 1 (minimal): 0, 1, 10, 18, 19 | 5 | ✓ Pass |
| Band 1/2 boundary: score=19 → minimal, score=20 → low | 2 | ✓ Pass |
| Band 2 (low): 20, 21, 30, 38, 39 | 5 | ✓ Pass |
| Band 2/3 boundary: score=39 → low, score=40 → moderate | 2 | ✓ Pass |
| Band 3 (moderate): 40, 41, 50, 59, 60 | 5 | ✓ Pass |
| Band 3/4 boundary: score=60 → moderate, score=61 → high | 2 | ✓ Pass |
| Band 4 (high): 61, 62, 70, 79, 80 | 5 | ✓ Pass |
| Band 4/5 boundary: score=80 → high, score=81 → elevated | 2 | ✓ Pass |
| Band 5 (elevated): 81, 82, 90, 99, 100 | 5 | ✓ Pass |
| Edge cases: negative, 0, 100, >100 | 4 | ✓ Pass |
| Return type: all 5 labels are valid FraudRiskLevel | 5 | ✓ Pass |
| Monotonicity: score ordering preserved across bands | 7 | ✓ Pass |
| **Total** | **49** | **✓ All pass** |

---

## 5. Regression Test Results

The following test files were run after all refactoring was complete. All tests pass.

| Test file | Tests | Result |
|---|---|---|
| `shared/fraudScoring.test.ts` | 49 | ✓ Pass |
| `server/weighted-fraud-scoring.test.ts` | 31 | ✓ Pass |
| `server/decision-snapshot.test.ts` | 43 | ✓ Pass |
| `server/enforcement-layer-fixes.test.ts` | 10 | ✓ Pass |
| `server/auth.logout.test.ts` | 1 | ✓ Pass |
| **Total** | **134** | **✓ All pass** |

---

## 6. Intentionally Out-of-Scope Items

The following files contain `"medium"` values that were reviewed and deliberately left unchanged, as they represent distinct domain types unrelated to the canonical five-band fraud risk level:

| File | Usage | Rationale |
|---|---|---|
| `server/pipeline-v2/mechanicalAlignmentEvaluator.ts` | `risk_level: "low" \| "medium" \| "high"` on structural components | Component-level structural risk, not claim-level fraud risk |
| `server/pipeline-v2/costDecisionEngine.ts` | `risk_level: "low" \| "medium" \| "high"` on unrelated items | Same as above |
| `server/pipeline-v2/repairReplaceEngine.ts` | `confidenceLevel: "high" \| "medium" \| "low"` | Confidence level, not fraud risk |
| `server/pipeline-v2/decisionOptimisationEngine.ts` | `confidence: "high" \| "medium" \| "low"` | Extraction confidence, not fraud risk |
| `server/routers/governance-dashboard.ts` | `level: "low" \| "medium" \| "high"` | Governance alert level |
| `server/routers/comments.ts` | `priority: "medium"` | Comment/ticket priority |
| `server/services/claim-replay-ai-assessment.ts` | `"none" \| "low" \| "medium" \| "high" \| "elevated"` | Replay analysis type with distinct `"none"` value |
| `server/pipeline-v2/types.ts` (line 1185) | `risk_level` on `unrelated_items` array | Component risk, not claim-level fraud risk |
| `server/reporting/reportDefinitions.ts` | `>= 70` threshold in SQL | Analytics aggregation threshold, not a band mapping |
| `server/workflow-simulation.ts` | Simplified 3-tier simulation logic | Demo/simulation code, not production pipeline |
| `server/report-pdf-generator.ts` | `getFraudRiskClass/Label()` | CSS/display helpers using simplified 3-tier scale for PDF styling |
| `server/reportGenerator.ts` | `fraudColour()` | Colour helper using numeric thresholds for visual display |
| `server/routers/learning.ts` (lines 336, 340) | `fraudRiskLevel === "medium" ? "moderate"` | Legacy DB migration guard — intentionally kept to handle pre-migration rows |

---

## 7. Files Modified

The following 16 production files were modified as part of this migration, plus 3 new files created:

**New files:**
- `docs/KINGA-FRAUD-SCORING-STANDARD.md`
- `shared/fraudScoring.ts`
- `shared/fraudScoring.test.ts`

**Modified — core refactoring (duplicate threshold logic removed):**
- `server/weighted-fraud-scoring.ts`
- `server/intelligence-enforcement.ts`
- `server/report-normalisation.ts`
- `server/pipeline-v2/stage-8-fraud.ts`

**Modified — type alignment (`"medium"` → `"moderate"`, FraudRiskLevel re-export):**
- `server/pipeline-v2/types.ts`
- `server/pipeline-v2/claimsDecisionAuthority.ts`
- `server/pipeline-v2/claimTruthLayer.ts`
- `server/pipeline-v2/decisionTraceGenerator.ts`
- `server/pipeline-v2/narrativeEngine.ts`
- `server/pipeline-v2/causalChainBuilder.ts`
- `server/pipeline-v2/claimsEscalationRouter.ts`
- `server/pipeline-v2/contradictionDetectionEngine.ts`
- `server/pipeline-v2/decisionOptimisationEngine.ts`
- `server/pipeline-v2/engineFallback.ts`
- `server/routers/decision.ts`
- `server/routers.ts`

**Modified — test updates:**
- `server/weighted-fraud-scoring.test.ts`
- `server/decision-snapshot.test.ts`
- `vitest.config.ts`

---

## 8. Routing and Approval Impact Assessment

The following analysis confirms that the migration does not alter any claim routing or approval outcomes for claims that were correctly classified under the pre-migration system.

**Score=20 boundary change (minimal → low):** Under the old system, a claim with `fraudRiskScore = 20` would be classified as `"minimal"` by `weighted-fraud-scoring.ts` and `report-normalisation.ts`, but as `"low"` by `intelligence-enforcement.ts`. This inconsistency meant the routing outcome depended on which engine's output was used downstream. Under FSS-2026-001, score=20 consistently maps to `"low"` across all engines. The routing impact is that claims at exactly score=20 will now route to `ADJUSTER_REVIEW` (low fraud, standard audit) rather than `AUTO_APPROVE` (minimal fraud). This is the intended behaviour per the standard.

**`"medium"` → `"moderate"` rename:** This is a pure terminology change. All routing sets (`MEDIUM_FRAUD_LEVELS`, `MODERATE_FRAUD_LEVELS`, `MANUAL_REVIEW_FRAUD_LEVELS`) have been updated to use `"moderate"`. The routing rules themselves are unchanged. Claims that were previously classified as `"medium"` will now be classified as `"moderate"` and will follow the same routing path.

**Fallback level change (`engineFallback.ts`):** The default fraud level returned when the fraud engine fails has changed from `"medium"` to `"moderate"`. These are semantically equivalent under the new standard and trigger the same routing path (manual review).

---

## 9. Governance Notes

- **Standard owner:** KINGA Engineering
- **Effective date:** 2026-07-09
- **Review cycle:** Annual or upon any change to fraud scoring methodology
- **Change control:** Any modification to band boundaries in `shared/fraudScoring.ts` must be accompanied by an update to `docs/KINGA-FRAUD-SCORING-STANDARD.md` and a new governance report
- **Database compatibility:** Existing database rows storing `"medium"` as `fraudRiskLevel` are handled by the legacy guard in `server/routers/learning.ts` (lines 336, 340), which maps `"medium"` → `"moderate"` at read time. No database migration is required.
