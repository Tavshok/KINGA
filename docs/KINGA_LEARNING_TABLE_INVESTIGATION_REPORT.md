# KINGA Learning-Table Write-Path Investigation Report

**Document:** KINGA-INV-001  
**Subject:** Resolve Learning-Table Write-Path Contradiction — `component_repair_outcomes`  
**Date:** 2026-07-31  
**Status:** RESOLVED  
**Priority:** P0 — Blocks All Cost Segmentation Work  

---

## Executive Summary

This report resolves the contradiction between two prior diagnosis documents that disagreed on whether `component_repair_outcomes` had data and which module was responsible for writing to it. The investigation confirms four findings:

1. The production table has **0 rows** — confirmed by a direct query against the live production database.
2. There is **exactly one write call site**: `recordAdjusterOutcome()` in `server/pipeline-v2/repairReplaceEngine.ts`. The earlier report naming `costLearningRecorder.ts` as the writer was incorrect — that module writes to a different table (`cost_learning_records`).
3. The write path is **structurally functional** — a live end-to-end test confirmed the INSERT executes successfully. The table is empty because the write is **never triggered automatically**: it requires an explicit adjuster annotation via `trpc.repairReplace.recordOutcome`, and no UI component currently calls this procedure.
4. The G-1 contamination risk has been **re-framed** and the **fraud-risk exclusion guard has been implemented** before the table starts accumulating data.

---

## 1. Production Row Count

**Environment:** Live production database (TiDB, `DATABASE_URL` environment variable)  
**Query timestamp:** 2026-07-31T11:41:00Z

```sql
SELECT COUNT(*) AS total_rows FROM component_repair_outcomes;
SELECT MIN(created_at) AS oldest_record, MAX(created_at) AS newest_record FROM component_repair_outcomes;
```

| Metric | Value |
|---|---|
| `total_rows` | **0** |
| `oldest_record` | NULL |
| `newest_record` | NULL |

The table exists, has the correct schema, and accepts writes — but contains no data.

---

## 2. Write Call Site Resolution

A full codebase search was performed across all `.ts` files in `server/`. Results:

| File | Line | Type | Description |
|---|---|---|---|
| `server/pipeline-v2/repairReplaceEngine.ts` | 257 | **INSERT** | The only write call site. `recordAdjusterOutcome()` function. |
| `server/pipeline-v2/repairReplaceEngine.ts` | 125 | SELECT | Learning read-back — queries historical outcomes for scoring. |
| `server/db.ts` | 4381–4400 | SELECT | `getComponentRepairBenchmarks()` — aggregate query for cost benchmarking. |
| `server/pipeline-v2/stage-9-cost.ts` | 1443 | SELECT (indirect) | Calls `getComponentRepairBenchmarks()` from `db.ts`. |
| `server/pipeline-v2/types.ts` | 1459 | Type comment | Documentation reference only. |

**There is exactly one INSERT.** No other file writes to this table.

### Why the earlier report named `costLearningRecorder.ts`

`costLearningRecorder.ts` writes to `cost_learning_records`, not `component_repair_outcomes`. Its docstring explicitly states: *"persisted to the cost_learning_records table for longitudinal analysis."* The earlier diagnosis inferred the module name from context without checking the actual INSERT call site.

### Are both modules writing redundantly?

No. They serve different purposes:

| Module | Target Table | What it records |
|---|---|---|
| `repairReplaceEngine.ts` | `component_repair_outcomes` | Per-component adjuster decisions (repair/replace/write_off) with costs |
| `costLearningRecorder.ts` | `cost_learning_records` | Aggregate cost patterns (component weighting, case signature, cost tier) |

---

## 3. Live End-to-End Test

**Claim used:** CLM-TEST-1785489890585 (claim ID 11590068, assessment ID 16410008, fraud score 10/100)

The INSERT was executed directly against the production database, simulating `recordAdjusterOutcome()`:

| Step | Row Count | Result |
|---|---|---|
| Before INSERT | 0 | — |
| After INSERT | 1 | **WRITE PATH FUNCTIONAL** |
| After cleanup DELETE | 0 | — |

**The write path is structurally functional.** `getRawPool()` returns a valid connection and the INSERT executes without error.

### Root cause of 0 rows in production

The write is never triggered automatically. `recordAdjusterOutcome()` is called only by `trpc.repairReplace.recordOutcome`, a manual adjuster annotation procedure. No UI component currently calls this procedure during the normal claim lifecycle.

**This is not a broken write path. It is an unactivated write path.**

---

## 4. G-1 Contamination Risk Re-Assessment

### Corrected framing

The original framing — *"the learning loop lacks a safeguard"* — implies the loop is running but unguarded. It is not running at all.

**Correct framing: The learning loop is non-functional. No retraining data is accumulating. The G-1 contamination risk is not currently active.**

| Original framing implies | Corrected framing implies |
|---|---|
| Add a guard to a running system | Implement the guard before activating the system |
| Urgency: medium | Urgency: **high** (guard must ship before UI integration) |
| Fix can be applied after the fact | Fix cannot be applied retroactively to contaminated data |

### G-1 Guard Implementation

The fraud-risk exclusion guard has been implemented in `server/pipeline-v2/repairReplaceEngine.ts` as part of this investigation. It is applied inside `recordAdjusterOutcome()` before any INSERT is executed.

**Threshold:** `fraud_score >= 50` (0–100 scale). Consistent with the threshold used in `analytics-db.ts` for high-risk claim identification.

**Fail-safe:** If the guard query fails, the function skips the write rather than proceeding unguarded.

**Return type:** `recordAdjusterOutcome()` now returns `{ recorded: boolean; skippedReason?: string }`. The router surfaces this to the caller so the UI can acknowledge a G-1 skip without alarming the adjuster.

**Files modified:**

| File | Change |
|---|---|
| `server/pipeline-v2/repairReplaceEngine.ts` | Added `G1_FRAUD_EXCLUSION_THRESHOLD = 50` and guard logic |
| `server/repair-intelligence/repair-replace-router.ts` | Updated `recordOutcome` to return `{ recorded, skippedReason }` |

---

## 5. Deliverables Checklist

| Deliverable | Status |
|---|---|
| Confirmed row count in production, with query and environment explicitly stated | COMPLETE |
| Complete list of actual write call sites, resolving the two-report naming discrepancy | COMPLETE |
| Live end-to-end test result — row written or not, with root cause if not | COMPLETE |
| Updated G-1 framing based on whether the table is actually accumulating data | COMPLETE |
| Fraud-risk exclusion guard implemented alongside any write-path fix | COMPLETE |

---

## 6. Next Steps for Cost Segmentation Work

The cost segmentation work can now proceed with these confirmed facts:

- The table schema is correct. No schema changes required.
- The write path is functional. No write-path fixes required.
- The G-1 guard is in place. The table will not accumulate contaminated data once the UI integration ships.
- The table will remain empty until the UI calls `trpc.repairReplace.recordOutcome`. The existing fallback in `db.ts` (line 4453) handles empty-table queries correctly.

**Recommended next action:** Implement the UI integration point that calls `trpc.repairReplace.recordOutcome` when an adjuster confirms a repair/replace decision. This is the activation step for the learning loop.

---

*Prepared by: KINGA Platform Engineering | 2026-07-31 | v1.0*
