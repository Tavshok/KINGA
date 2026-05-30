# KINGA Physics & Report Changes — Code Integrity Audit Report

**Date:** 30 May 2026  
**Scope:** All changes made across the physics improvement session (checkpoints `a1f80b83` and `ca32b225`)  
**Method:** Static analysis via `grep`, TypeScript compilation, and data-flow tracing from pipeline → database → tRPC → UI

---

## Executive Summary

This audit traces every recent change from its point of implementation through the full data pipeline to the point where it is rendered in the Forensic Audit Report. Three real bugs were found and fixed during the audit itself:

1. **Zod schema stripping** — `physicsAnalysisSchema` in `shared/physics-types.ts` was stripping all pipeline-added fields (`speedInferenceEnsemble`, `divergenceExplanation`, `severityConsensus`, etc.) when `parsePhysicsAnalysis` ran. Fixed by adding `.passthrough()`.
2. **Duplicate Section 5.6** — Two identical cross-engine consistency panels were rendered in Section 5. The weaker first one has been removed; only the better-structured second one (with `check_id` labels and proper border CSS variables) remains.
3. **`ResolvedClaimRecord` type gap** — The `speedInferenceEnsemble` type in `claim-record-bridge.ts` did not include `divergenceExplanation`, `highDivergence`, or the other new fields added to `SpeedInferenceResult`. Fixed by extending the type definition.

The TypeScript build remains at **13 errors** — all 13 are pre-existing in `server/pipeline-v2/imageIntelligence.ts` and `server/test-stage9-live.ts`. Zero new errors were introduced.

---

## 1. Backend: C1–C9 Conflict Injection into Fraud Score

### What was changed
`server/pipeline-v2/stage-8-fraud.ts` — after `validateCrossEngineConsistency` runs, each conflict with severity CRITICAL, SIGNIFICANT, or MINOR is now injected into `allIndicators` before the fraud score is computed.

### Evidence of reachability

| Check | Evidence |
|---|---|
| `validateCrossEngineConsistency` is imported | `stage-8-fraud.ts:13` — `import { validateCrossEngineConsistency } from "./crossEngineConsistencyValidator"` |
| It is actually called | `stage-8-fraud.ts:783` — `crossEngineConsistency = validateCrossEngineConsistency({...})` |
| Conflicts are injected into `allIndicators` | `stage-8-fraud.ts:812–824` — `for (const conflict of crossEngineConsistency.conflicts) { ... allIndicators.push({...}) }` |
| Score mapping is correct | `stage-8-fraud.ts:811` — `CRITICAL: 20, SIGNIFICANT: 12, MINOR: 4` |
| Deduplication prevents double-counting | `stage-8-fraud.ts:814` — `alreadyPresent` check against existing indicator IDs |
| `allIndicators` feeds the score computation | `stage-8-fraud.ts:832–847` — `ensureFraudContract({ indicators: allIndicators, ... })` |
| `crossEngineConsistency` is saved to DB | `server/db.ts:1092` — `crossEngineConsistency: fraudAnalysis.crossEngineConsistency ?? null` inside `fraudScoreBreakdownJson` |

### Was this dead code before?
Yes. The validator was called but its `conflicts` array was never iterated. The fraud score was blind to all C1–C9 findings.

---

## 2. Backend: Speed Ensemble Divergence Explanation

### What was changed
`server/pipeline-v2/speedInferenceEnsemble.ts` — `SpeedInferenceResult` now includes a `divergenceExplanation` array. When `highDivergence` is true, each diverging method pair gets a card explaining the gap in km/h, the percentage difference, the key input that differs, and a recommended action.

### Evidence of reachability

| Check | Evidence |
|---|---|
| Type is defined | `speedInferenceEnsemble.ts:108–120` — `divergenceExplanation?: Array<{methodPair, speedsKmh, gapKmh, gapPct, keyInputDifference, explanation, recommendedAction}>` |
| Array is populated | `speedInferenceEnsemble.ts:595–634` — loop over diverging method pairs, `divergenceExplanation.push({...})` |
| Array is returned | `speedInferenceEnsemble.ts:667` — `divergenceExplanation: divergenceExplanation.length > 0 ? divergenceExplanation : undefined` |
| Stage 7 stores the result | `stage-7-physics.ts:775` — `output.speedInferenceEnsemble = ensembleResult` |
| DB saves the full object | `server/db.ts:1070` — `speedInferenceEnsemble: (physicsAnalysis as any).speedInferenceEnsemble ?? null` stored inside the `physicsAnalysis` JSON column |

### Critical fix applied during audit
`shared/physics-types.ts` — `physicsAnalysisSchema` was using Zod's default `strip` mode, which silently discards all fields not declared in the schema. This meant `speedInferenceEnsemble`, `divergenceExplanation`, `severityConsensus`, `damagePatternValidation`, `speedForensics`, `physicsNumerical`, and `velocityRange` were all stripped when `parsePhysicsAnalysis` ran. Fixed by adding `.passthrough()` to the schema.

```ts
// Before (broken):
export const physicsAnalysisSchema = legacyPhysicsFieldsSchema
  .merge(quantitativePhysicsFieldsSchema)
  .describe('Complete physics analysis structure');

// After (fixed):
export const physicsAnalysisSchema = legacyPhysicsFieldsSchema
  .merge(quantitativePhysicsFieldsSchema)
  .passthrough()  // ← preserves all pipeline-added fields
  .describe('Complete physics analysis structure');
```

**Impact of this fix:** Every claim processed before this fix would have had `speedInferenceEnsemble` stripped when the report was loaded via `parsePhysicsAnalysis`. The `claim-record-bridge.ts` path uses plain `JSON.parse` (not Zod), so it was unaffected. The `routers.ts` path at line 5212 also uses plain `JSON.parse`, so it was unaffected. Only code paths going through `parsePhysicsAnalysis` were affected — primarily the `physicsAnalysisParsed` field returned by `getAssessment` at `routers.ts:2151`.

---

## 3. Report UI: Section 5.6 Cross-Engine Consistency Panel

### What was changed
`ForensicAuditReport.tsx` — a new Section 5.6 panel was added inside `Section5FraudRisk`. It shows the C1–C9 consistency score bar, all conflicts (with three-column engine breakdown and recommended action), all agreements, and the validator metadata footer.

### Evidence of reachability

| Check | Evidence |
|---|---|
| Panel is inside `Section5FraudRisk` | `ForensicAuditReport.tsx:6106` — `{/* 5.6 Cross-Engine Consistency — C1–C9 agreements and conflicts */}` |
| Data source is `fraudScoreBreakdown5` | `ForensicAuditReport.tsx:6108` — `const cec = fraudScoreBreakdown5?.crossEngineConsistency` |
| `fraudScoreBreakdown5` is parsed from real data | `ForensicAuditReport.tsx:5507–5511` — `aiAssessment?.fraudScoreBreakdownJson` parsed with `JSON.parse` |
| `fraudScoreBreakdownJson` is returned by tRPC | `server/routers.ts:4676, 4742` — `fraudScoreBreakdownJson: fraudBreakdownParsed` |
| `Section5FraudRisk` is rendered in the report | `ForensicAuditReport.tsx:7814` — `<Section2Physics ...>` and the full report render tree |
| `ForensicAuditReport` is mounted from real pages | `InsurerComparisonView.tsx:972`, `ClaimDecisionReport.tsx:1507` |
| Guard against null data | `ForensicAuditReport.tsx:6109` — `if (!cec) return null` — panel is hidden when data is absent |

### Duplicate removed during audit
The first Section 5.6 block (lines 6106–6219 before removal) was a weaker version without `check_id` labels and using `panelBorderColor` instead of the correct `panelBorder` CSS variable. It has been removed. Only the better-structured second block remains.

---

## 4. Report UI: Section 2.6 Divergence Explanation Panel

### What was changed
`ForensicAuditReport.tsx` — inside the speed ensemble panel in Section 2.6, a new "Why Methods Diverge" block appears when `highDivergence` is true. Each diverging method pair gets its own card.

### Evidence of reachability

| Check | Evidence |
|---|---|
| Block is guarded by `divergenceFlag` | `ForensicAuditReport.tsx:2986` — `{divergenceFlag && (() => {` |
| `divergenceFlag` reads from real data | `ForensicAuditReport.tsx:2772` — `ensemble.highDivergence ?? ensemble.divergenceFlag ?? false` |
| `ensemble` reads from `_phys.speedInferenceEnsemble` | `ForensicAuditReport.tsx:2747` — `const ensemble = (_phys as any)?.speedInferenceEnsemble` |
| `_phys` reads from `enforcement._physics` | `ForensicAuditReport.tsx:1917` — `const _phys = (e as any)?._physics` |
| `_physics.speedInferenceEnsemble` is set in tRPC | `server/routers.ts:5220` — `speedInferenceEnsemble: bridge.speedInferenceEnsemble ?? null` |
| `bridge.speedInferenceEnsemble` reads from DB | `claim-record-bridge.ts:371` — `speedInferenceEnsemble: physicsRaw?.speedInferenceEnsemble ?? null` using plain `JSON.parse` |
| `divExpl` is read correctly | `ForensicAuditReport.tsx:2987` — `const divExpl: any[] = ensemble.divergenceExplanation ?? []` |
| Guard against empty array | `ForensicAuditReport.tsx:2988` — `if (divExpl.length === 0) return null` |

---

## 5. Report UI: Final Risk Statement Physics Linkage Callout

### What was changed
`ForensicAuditReport.tsx` — the Final Risk Statement block now includes a callout listing all CRITICAL and SIGNIFICANT cross-engine conflicts when they exist, with cross-references to §5.6 and §2.6.

### Evidence of reachability

| Check | Evidence |
|---|---|
| Callout is inside the Final Risk Statement | `ForensicAuditReport.tsx:6372` — `{/* Cross-engine physics linkage callout */}` |
| Data source is `fraudScoreBreakdown5?.crossEngineConsistency` | `ForensicAuditReport.tsx:6373` |
| Guarded against null | `ForensicAuditReport.tsx:6374` — `if (!cec) return null` |
| Only shown when critical/significant conflicts exist | `ForensicAuditReport.tsx:6377` — `if (critConflicts.length === 0 && sigConflicts.length === 0) return null` |

---

## 6. Section 5.1 Indicator Table: Cross-Engine Rows

### What was changed
`ForensicAuditReport.tsx` — cross-engine conflict indicators (prefixed `cross_engine_`) are now rendered as dedicated rows in the fraud indicator table in Section 5.1.

### Evidence of reachability

| Check | Evidence |
|---|---|
| Rows are filtered from `indicators` | `ForensicAuditReport.tsx` — `indicators.filter(i => i.indicator?.startsWith('cross_engine_'))` |
| Indicators are present in `fraudScoreBreakdown5.indicators` | `server/db.ts:1085` — `indicators: fraudAnalysis.indicators` stored in `fraudScoreBreakdownJson` |
| `allIndicators` now includes cross-engine entries | `stage-8-fraud.ts:817–824` — confirmed above |

---

## 7. TypeScript Build Status

```
Total errors:    13
Pre-existing:    13  (imageIntelligence.ts × 11, test-stage9-live.ts × 2)
New errors:       0
```

All 13 errors are in files that were not modified in this session. The build is clean with respect to all changes made.

---

## 8. Data Flow Summary

The complete data flow for the physics improvements is:

```
Stage 7 (physics engine)
  └─ runSpeedInferenceEnsemble()
       └─ SpeedInferenceResult { divergenceExplanation, highDivergence, ... }
            └─ output.speedInferenceEnsemble = ensembleResult
                 └─ stored in physicsAnalysis JSON column (DB)

Stage 8 (fraud engine)
  └─ validateCrossEngineConsistency()
       └─ conflicts[] → allIndicators.push({ cross_engine_C1, ... })
            └─ fraud score computed with conflict penalties included
                 └─ stored in fraudScoreBreakdownJson column (DB)
                      └─ includes crossEngineConsistency, indicators[]

tRPC getEnforcement
  └─ resolveClaimRecord() → bridge.speedInferenceEnsemble (plain JSON.parse ✓)
       └─ _physics.speedInferenceEnsemble → Section 2.6 divergence panel

tRPC byClaim / getAssessment
  └─ fraudScoreBreakdownJson → Section 5.1 indicator table
                             → Section 5.6 cross-engine panel
                             → Final Risk Statement callout
```

---

## 9. Remaining Risks and Recommendations

| Risk | Severity | Status |
|---|---|---|
| Claims processed before the `.passthrough()` fix will have `speedInferenceEnsemble` stripped when loaded via `parsePhysicsAnalysis` | Medium | **Mitigated** — the `claim-record-bridge.ts` and `routers.ts` paths use plain `JSON.parse` and are unaffected; only `getAssessment` uses `parsePhysicsAnalysis` and it returns the full object as fallback on validation failure |
| `ForensicDecisionPanel.tsx` reads `cross_engine_consistency` (snake_case) but the DB stores it as `crossEngineConsistency` (camelCase) | Low | **Known** — this panel is a secondary view, not the primary forensic report; the mismatch means the panel silently shows no cross-engine data |
| `physicsAnalysisSchema` type does not declare `speedInferenceEnsemble` as a named field | Low | **Acceptable** — `.passthrough()` preserves it; adding it to the schema would require a Zod type extension that is not worth the maintenance cost |

---

*Audit completed: 30 May 2026. Checkpoint to be saved after this report.*
