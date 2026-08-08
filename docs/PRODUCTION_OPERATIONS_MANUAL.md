# KINGA Production Operations Manual

**Author:** Tavonga Shoko, Lead Engineer
**Version:** 2.0 — August 2026
**Classification:** Internal — Engineering and Operations

This manual is the authoritative reference for operating, monitoring, and debugging the KINGA AutoVerify AI platform in production. It is written for engineers who may not have built the system, and for operators who need to diagnose and resolve issues under time pressure.

The manual covers seven parts:
- **Part 1:** Pipeline and Assessment failures
- **Part 2:** Report quality, cost intelligence, fraud, and physics failures
- **Part 3:** Quotation, valuation, and agency engine failures
- **Part 4:** Portal, authentication, data integrity, and multi-tenant failures
- **Part 5:** Performance, security, infrastructure, and intelligence calibration
- **Part 6:** Workflow engine, assignment engine, and governance failures
- **Part 7:** Operational playbooks

---

## How to Use This Manual

Every section follows: **Symptom → Diagnosis → Root cause → Fix → Prevention**. Follow the steps in order. Do not apply a fix before confirming the root cause. When in doubt, the safest action is: **record the current state, then investigate**. Never delete data or reset a claim status without first noting what it was.

---

## Master Symptom Index

| # | Symptom | Section |
|---|---|---|
| 1 | Claim stuck in `intake_pending` for >1 hour | §1.1 |
| 2 | Claim stuck in `in_review` — pipeline never started | §1.2 |
| 3 | Pipeline stuck at Stage 1–3 (Ingestion/Extraction) | §1.3 |
| 4 | Pipeline stuck at Stage 6 (Damage Analysis) | §1.4 |
| 5 | Pipeline stuck at Stage 7 (Physics) | §1.5 |
| 6 | Pipeline stuck at Stage 8 (Fraud) | §1.6 |
| 7 | Pipeline stuck at Stage 9 (Cost) | §1.7 |
| 8 | Pipeline stuck at Stage 10 (Reports) | §1.8 |
| 9 | Claim status is `document_failed` | §1.9 |
| 10 | Watchdog timeout — pipeline killed after 8 minutes | §1.10 |
| 11 | Two conflicting `ai_assessments` records for one claim | §1.11 |
| 12 | Pipeline completed but status still `in_progress` | §1.12 |
| 13 | LLM API errors — all LLM-dependent stages failing | §1.13 |
| 14 | OCR extracted wrong vehicle | §1.14 |
| 15 | Stage 3 extracted wrong quote totals | §1.15 |
| 16 | Reports not generated after pipeline completes | §2.1 |
| 17 | CL report shows blank sections or "$0.00" | §2.2 |
| 18 | KINGA Optimised shows $0 or wrong value | §2.3 |
| 19 | Component costs all show "—" | §2.4 |
| 20 | Benchmark credibility gate rejecting legitimate prices | §2.5 |
| 21 | Benchmark data poisoned by fraudulent claim | §2.6 |
| 22 | Fraud score is 0 or missing | §2.7 |
| 23 | Fraud score systematically too high or too low | §2.8 |
| 24 | Physics analysis shows "UNAVAILABLE" for all indicators | §2.9 |
| 25 | Physics speed estimate is implausible | §2.10 |
| 26 | Direction contradiction badge missing | §2.11 |
| 27 | CI and FR reports show different speed figures | §2.12 |
| 28 | Vehicle valuation request not processing | §3.1 |
| 29 | Valuation report not unlocking after policy issuance | §3.2 |
| 30 | Quote not delivered to client | §3.3 |
| 31 | Policy document not appearing in client portal | §3.4 |
| 32 | Bulk CSV valuation upload failing | §3.5 |
| 33 | User cannot log in or redirected to wrong portal | §4.1 |
| 34 | User sees "Unauthorized" on accessible page | §4.2 |
| 35 | React error #130 — "An unexpected error occurred" | §4.3 |
| 36 | Claimant cannot see their claim in My Portal | §4.4 |
| 37 | Fleet manager cannot see company vehicle claims | §4.5 |
| 38 | Notification not delivered to claimant | §4.6 |
| 39 | Claim with null `tenantId` visible to wrong insurer | §4.7 |
| 40 | Orphaned `ai_assessments` after claim status reset | §4.8 |
| 41 | WhatsApp session stuck in wrong state | §4.9 |
| 42 | WhatsApp messages not being processed | §4.10 |
| 43 | Server memory pressure or OOM | §5.1 |
| 44 | Database connection pool exhausted | §5.2 |
| 45 | TiDB connection dropped (ECONNRESET) | §5.3 |
| 46 | S3 upload failures | §5.4 |
| 47 | Tenant isolation violation detected | §5.5 |
| 48 | Fraud score weights producing biased results | §5.6 |
| 49 | Physics friction coefficients wrong for jurisdiction | §5.7 |
| 50 | Benchmark learning table growing with bad data | §5.8 |
| 51 | Claim stuck in workflow state | §6.1 |
| 52 | Assessor assignment failing | §6.2 |
| 53 | Governance audit log missing entries | §6.3 |

---

# PART 1: PIPELINE AND ASSESSMENT FAILURES

The AI pipeline is the core of KINGA. It runs 14 stages sequentially, with each stage writing its output to the DB before the next stage begins. The pipeline is designed to be resumable — if interrupted, it skips already-completed stages on restart.

**Key files:** `server/db.ts` (orchestrator, lines 683–3052), `server/pipeline-v2/stage-*.ts` (individual stages)

**Key DB tables:** `claims`, `ai_assessments`, `pipeline_runs`, `pipeline_stage_runs`

---

## §1.1 Claim Stuck in `intake_pending` for More Than 1 Hour

**What the user reports:** "I submitted a claim an hour ago and nothing has happened."

**Diagnosis:**
```sql
SELECT id, claim_number, status, workflow_state, document_processing_status, created_at
FROM claims WHERE claim_number = 'CLM-XXXXXXXXXX';

SELECT id, status, created_at, updated_at
FROM ai_assessments WHERE claim_id = <claim_id>;
```

Check server logs for semaphore state:
```
[PipelineSemaphore] Slot acquired — <claim_id>
[PipelineSemaphore] Slot released — <claim_id>
```

If `Slot acquired` exists with no matching `Slot released`, the semaphore is stuck.

**Root causes and fixes:**

| Root cause | Evidence | Fix |
|---|---|---|
| Semaphore stuck from crashed pipeline | `Slot acquired` with no `Slot released` | Restart the server — semaphore is in-memory and resets |
| Stuck-claim recovery job not running | No `[StuckRecovery]` log lines in last 10 minutes | Check Heartbeat cron registration; manually trigger recovery |
| `triggerAiAssessment` never called | No `ai_assessments` record exists | Check `server/routers/claims-core.ts` submit procedure |
| Pipeline queued waiting for slot | `Slot queued` in logs | Normal — wait for current pipeline to complete |

**Prevention:** The stuck-claim recovery job (`server/jobs/stuck-assessment-recovery-job.ts`) re-queues claims stuck for >30 minutes. Verify it is registered as a Heartbeat cron after every deployment.

---

## §1.2 Claim Stuck in `in_review` — Pipeline Never Started

**Diagnosis:**
```sql
SELECT id, status, created_at, updated_at
FROM ai_assessments WHERE claim_id = <claim_id>;
```

If `status = 'pending'` and `updated_at` unchanged for 30+ minutes, the pipeline is queued but not starting.

**Root causes:** Same as §1.1. Also check: if heap > 1200MB, the server may be refusing new work. Check `[MEMORY]` log lines.

---

## §1.3 Pipeline Stuck at Stage 1–3 (Ingestion, Extraction, Structured Extraction)

**Diagnosis:**
```sql
SELECT psr.stage_name, psr.status, psr.started_at, psr.completed_at, psr.error_message
FROM pipeline_stage_runs psr
JOIN pipeline_runs pr ON pr.id = psr.run_id
WHERE pr.claim_id = <claim_id> ORDER BY psr.started_at;
```

**Root causes and fixes:**

| Root cause | Log pattern | Fix |
|---|---|---|
| LLM API rate limit (429) | `HTTP 429` in logs | `withRetry` retries automatically up to 3 times with exponential backoff |
| LLM API quota exhausted (402) | `HTTP 402` or `quota exceeded` | Check `BUILT_IN_FORGE_API_KEY` quota in Manus platform dashboard |
| PDF too large for OCR (>50MB) | `PDF pre-download failed` | Ask claimant to compress the PDF |
| LLM returned empty response | `Empty LLM response for native text extraction` | Document may be a scanned image — pipeline attempts vision-based extraction as fallback |
| Stage 3 spell-correction timed out | `OCR spell-correction timed out after 30s` | Non-fatal — pipeline continues without spell correction |

**Note:** Stages 1–3 have the `withRetry` wrapper with 3 attempts. A single LLM failure will not immediately fail the stage.

---

## §1.4 Pipeline Stuck at Stage 6 (Damage Analysis)

**Diagnosis:**
```sql
SELECT stage_name, status, started_at, error_message
FROM pipeline_stage_runs psr
JOIN pipeline_runs pr ON pr.id = psr.run_id
WHERE pr.claim_id = <claim_id> AND psr.stage_name LIKE '%Stage 6%';
```

**Root causes and fixes:**

| Root cause | Evidence | Fix |
|---|---|---|
| Too many photos (>20) causing vision API timeout | `PASS1_TIMEOUT_MS` exceeded (60s) | Stage 6 degrades gracefully — processes as many photos as possible within timeout |
| Photo URLs expired (S3 presign >1 hour old) | `URL_CHECK_TIMEOUT_MS` exceeded for all photos | Re-upload photos or regenerate presigned URLs |
| Vision API returned no components | `No damage components detected` | Photos may be too dark or blurry — pipeline uses narrative description as fallback |
| PDF page rendering failed | `PDF image re-extraction FAILED` | Verify `poppler-utils` is installed: `which pdftoppm` |

---

## §1.5 Pipeline Stuck at Stage 7 (Physics Analysis)

**Diagnosis:**
```sql
SELECT
  JSON_EXTRACT(structured_json, '$.incidentType') as incident_type,
  JSON_EXTRACT(structured_json, '$.collisionDirection') as collision_direction
FROM ai_assessments WHERE claim_id = <claim_id>;
```

**Root causes and fixes:**

| Root cause | Evidence | Fix |
|---|---|---|
| `incidentType` is null or "unknown" | JSON returns null | Physics cannot determine collision mechanics — stage produces degraded result with `physicsConsistency: "UNAVAILABLE"` (expected, not a bug) |
| Vehicle stiffness data missing for this make/model | `No stiffness data` in logs | Physics uses class-average stiffness coefficient as fallback |
| Stage 7b (Causal Reasoning) LLM call failed | `Stage 7b FAILED` in stage runs | Non-blocking — Stage 8 proceeds without causal reasoning narrative |

---

## §1.6 Pipeline Stuck at Stage 8 (Fraud Scoring)

**Diagnosis:**
```sql
SELECT
  JSON_EXTRACT(fraud_analysis_json, '$.overallFraudScore') as fraud_score,
  JSON_EXTRACT(fraud_analysis_json, '$.riskLevel') as risk_level
FROM ai_assessments WHERE claim_id = <claim_id>;
```

**Root causes:**

| Root cause | Evidence | Fix |
|---|---|---|
| `structured_json` is null (Stage 3 failed) | `structured_json` is null | Fix Stage 3 first; re-run pipeline |
| Fraud narrative LLM call timed out | `[QuoteAudit] LLM failed` | Non-fatal — fraud score computed from rule-based signals; narrative will be empty |
| Stage 8 threw and marked FAILED | Stage 8 shows FAILED in stage runs | Check `error_message` in `pipeline_stage_runs` for Stage 8 |

---

## §1.7 Pipeline Stuck at Stage 9 (Cost Intelligence)

**Diagnosis:**
```sql
SELECT id, panel_beater_name, total_amount_cents FROM panel_beater_quotes WHERE claim_id = <claim_id>;

SELECT q.panel_beater_name, COUNT(li.id) as line_items
FROM panel_beater_quotes q
LEFT JOIN quote_line_items li ON li.quote_id = q.id
WHERE q.claim_id = <claim_id> GROUP BY q.id;
```

**Root causes:**

| Root cause | Evidence | Fix |
|---|---|---|
| No panel beater quotes submitted | No rows in `panel_beater_quotes` | Stage 9 produces partial result using benchmark data only |
| Quote PDF has no per-line prices | `line_items = 0` for all quotes | Expected — KINGA Optimised will be partial (benchmark-priced components only) |
| Quote extraction LLM timed out | `PDF_VISION_TIMEOUT_MS` exceeded | Pipeline uses whatever was extracted before timeout |
| `component_benchmarks` table empty | No benchmark data | Correct on fresh deployment — benchmark grows with each claim |

---

## §1.8 Pipeline Stuck at Stage 10 (Report Generation)

**Diagnosis:**
```sql
SELECT stage_name, status, error_message
FROM pipeline_stage_runs psr
JOIN pipeline_runs pr ON pr.id = psr.run_id
WHERE pr.claim_id = <claim_id> AND psr.stage_name LIKE '%Stage 10%';

SELECT JSON_EXTRACT(assembly_json, '$.reportUrls') as report_urls
FROM ai_assessments WHERE claim_id = <claim_id>;
```

**Root causes:**

| Root cause | Evidence | Fix |
|---|---|---|
| S3 upload failed | `[Document Upload] FATAL ERROR` | Check `BUILT_IN_FORGE_API_KEY`; check S3 quota |
| Report generator threw on null field | `TypeError: Cannot read property of null` | Identify null field; trace to stage that should populate it |
| `poppler-utils` not installed | `pdftoppm not found` | `sudo apt-get install poppler-utils` |

**Manual regeneration:**
```
trpc.aiAssessments.regenerateReports.mutate({ claimId })
```

---

## §1.9 Claim Status is `document_failed`

**Diagnosis:**
```sql
SELECT error_message, updated_at FROM ai_assessments
WHERE claim_id = <claim_id> ORDER BY updated_at DESC LIMIT 1;
```

**Common error messages:**

| Error message | Root cause | Fix |
|---|---|---|
| `KINGA pipeline could not complete: <error>` | Unhandled exception | Check full error; trace to failing stage |
| `No usable content extracted from document` | PDF has no text layer; vision also failed | Ask claimant to re-upload a clearer document |
| `No images were successfully uploaded to S3` | All photo uploads failed | Check S3 credentials and network |
| `Database not available` | DB connection lost during pipeline | Check DB connectivity (§5.2); retry |

**Reset and retry:**
```sql
UPDATE claims SET status = 'intake_pending', document_processing_status = 'PENDING'
WHERE id = <claim_id>;

UPDATE ai_assessments SET status = 'pending', error_message = NULL
WHERE claim_id = <claim_id> ORDER BY created_at DESC LIMIT 1;
```

---

## §1.10 Watchdog Timeout — Pipeline Killed After 8 Minutes

**Evidence in logs:**
```
[KINGA Assessment] Claim <id>: WATCHDOG TIMEOUT — pipeline hung for 480s. Routing to document_failed for recovery.
```

The watchdog (`WATCHDOG_TIMEOUT_MS = 8 * 60 * 1000`) kills the pipeline if it does not complete within 8 minutes.

**Diagnosis:** Find which stage was running when the watchdog fired:
```sql
SELECT stage_name, status, started_at, completed_at
FROM pipeline_stage_runs psr
JOIN pipeline_runs pr ON pr.id = psr.run_id
WHERE pr.claim_id = <claim_id> ORDER BY psr.started_at;
```

The last stage with `status = 'IN_PROGRESS'` and no `completed_at` is where the pipeline hung.

**Common causes:** Stage 6 with >20 photos; Stage 3 on a very large PDF (>100 pages); Stage 9 on multiple large PDFs.

**Fix:** Reset and retry (§1.9). If the same stage keeps timing out, the document may need manual processing.

---

## §1.11 Two Conflicting `ai_assessments` Records for One Claim

**Diagnosis:**
```sql
SELECT id, status, created_at, updated_at FROM ai_assessments
WHERE claim_id = <claim_id> ORDER BY created_at;
```

**Fix:** Archive the older record:
```sql
UPDATE ai_assessments SET status = 'archived'
WHERE claim_id = <claim_id>
AND id = (SELECT MIN(id) FROM ai_assessments WHERE claim_id = <claim_id>);
```

**Prevention:** Never trigger `triggerAiAssessment` directly from the DB while the server is running.

---

## §1.12 Pipeline Completed but Status Still `in_progress`

**Root cause:** The final status update failed (DB write error after all stages completed).

**Fix:**
```sql
UPDATE ai_assessments SET status = 'complete', updated_at = NOW()
WHERE claim_id = <claim_id> AND status = 'in_progress';

UPDATE claims SET status = 'ai_complete', document_processing_status = 'COMPLETE'
WHERE id = <claim_id>;
```

---

## §1.13 LLM API Errors — All LLM-Dependent Stages Failing

**Evidence:** Multiple claims failing simultaneously; logs show `HTTP 429`, `HTTP 402`, or `HTTP 500`.

**Check API status:**
```bash
curl -H "Authorization: Bearer $BUILT_IN_FORGE_API_KEY" $BUILT_IN_FORGE_API_URL/health
```

| Response | Meaning | Fix |
|---|---|---|
| `429 Too Many Requests` | Rate limit hit | `withRetry` retries automatically (1s, 2s, 4s backoff) |
| `402 Payment Required` | Quota exhausted | Contact Manus support to increase quota |
| `500 Internal Server Error` | LLM provider outage | Wait and retry |

**Temporary mitigation:** Claims queue in `intake_pending`. The stuck-claim recovery job retries them automatically when the API recovers.

---

## §1.14 OCR Extracted Wrong Vehicle (Third-Party Instead of Claimant)

**Evidence:** Assessment shows wrong vehicle make/model/year.

**Diagnosis:**
```sql
SELECT
  JSON_EXTRACT(structured_json, '$.vehicle.make') as extracted_make,
  JSON_EXTRACT(structured_json, '$.vehicle.model') as extracted_model,
  vehicle_make, vehicle_model
FROM ai_assessments a JOIN claims c ON c.id = a.claim_id
WHERE a.claim_id = <claim_id>;
```

**Root cause:** In a multi-vehicle accident, the OCR may extract the third-party vehicle. The Stage 3 prompt instructs the LLM to extract the insured vehicle — if this is happening consistently, the prompt needs strengthening.

**Manual fix:** Update `structured_json` with correct vehicle details, then re-run Stage 7 onwards.

---

## §1.15 Stage 3 Extracted Wrong Panel Beater Quote Totals

**Root cause:** The R-A-16 deduplication algorithm may keep the wrong quote when two quotes from the same panel beater are submitted.

**Diagnosis:** Check dedup log lines:
```
grep "R-A-16 Dedup" /var/log/kinga/server.log | grep "Claim <id>"
```

**Fix:** Manually update `panel_beater_quotes` with the correct total and re-run Stage 9.

---

# PART 2: REPORT QUALITY, COST INTELLIGENCE, FRAUD, AND PHYSICS FAILURES

---

## §2.1 Reports Not Generated After Pipeline Completes

**Diagnosis:**
```sql
SELECT stage_name, status, error_message
FROM pipeline_stage_runs psr
JOIN pipeline_runs pr ON pr.id = psr.run_id
WHERE pr.claim_id = <claim_id> AND psr.stage_name LIKE '%Stage 10%';

SELECT JSON_EXTRACT(assembly_json, '$.reportUrls') as report_urls
FROM ai_assessments WHERE claim_id = <claim_id>;
```

**Root causes:**

| Root cause | Evidence | Fix |
|---|---|---|
| S3 upload failed | `[Document Upload] FATAL ERROR` | Check `BUILT_IN_FORGE_API_KEY`; check S3 quota |
| Report generator threw on null field | `TypeError: Cannot read property of null` | Identify null field; trace to failing stage |
| `poppler-utils` not installed | `pdftoppm not found` | `sudo apt-get install poppler-utils` |
| Report PDF too large | S3 upload timeout | Reduce photo count; no hard limit currently exists |

**Manual regeneration:** `trpc.aiAssessments.regenerateReports.mutate({ claimId })`

---

## §2.2 CL Report Shows Blank Sections or "$0.00" Costs

**Diagnosis:**
```sql
SELECT
  CASE WHEN structured_json IS NULL THEN 'NULL' ELSE 'OK' END as structured_json,
  CASE WHEN cost_intelligence_json IS NULL THEN 'NULL' ELSE 'OK' END as cost_intelligence_json,
  CASE WHEN fraud_analysis_json IS NULL THEN 'NULL' ELSE 'OK' END as fraud_analysis_json,
  CASE WHEN physics_analysis_json IS NULL THEN 'NULL' ELSE 'OK' END as physics_analysis_json,
  CASE WHEN enriched_photos_json IS NULL THEN 'NULL' ELSE 'OK' END as enriched_photos_json
FROM ai_assessments WHERE claim_id = <claim_id>;
```

**Blank section → missing field → stage that populates it:**

| Blank section | Missing field | Stage |
|---|---|---|
| Vehicle details | `structured_json.vehicle` | Stage 3 |
| Damage components | `damaged_components_json` | Stage 6 |
| Physics analysis | `physics_analysis_json` | Stage 7 |
| Fraud score | `fraud_analysis_json` | Stage 8 |
| Cost breakdown | `cost_intelligence_json` | Stage 9 |
| Photo evidence | `enriched_photos_json` | Stage 6 |

---

## §2.3 KINGA Optimised Shows $0 or Wrong Value

> **Critical:** The canonical KINGA Optimised field is `l2CompositeOptimisedCostUsd` — NOT `compositeOptimisedCostUsd`. The latter does not exist in DB data. Any code reading `compositeOptimisedCostUsd` will always get `undefined` → `$0`.

**Diagnosis:**
```sql
SELECT
  JSON_EXTRACT(cost_intelligence_json, '$.compositeOptimisation.l2CompositeOptimisedCostUsd') as kinga_optimised,
  JSON_EXTRACT(cost_intelligence_json, '$.documentedAgreedCostUsd') as agreed_cost,
  JSON_EXTRACT(cost_intelligence_json, '$.documentedOriginalQuoteUsd') as original_quote
FROM ai_assessments WHERE claim_id = <claim_id>;
```

**Interpretation:**
- `kinga_optimised` is null → Stage 9 did not run or failed silently
- `kinga_optimised` is a number but report shows $0 → report generator is reading the wrong field name
- `kinga_optimised` is lower than expected → composite only priced components with benchmark data (correct on early deployments with thin benchmark data)

---

## §2.4 Component Costs All Show "—" in CL Report

**Root cause:** `damaged_components_json` has `estimatedCost: 0` for all components. OCR did not extract per-line prices from the submitted PDF (only a total was found).

**Fix:** Ask the panel beater to re-submit via the structured web form (Panel Beater portal) rather than uploading a PDF. Web-submitted quotes write directly to `quote_line_items`.

---

## §2.5 Benchmark Credibility Gate Rejecting Legitimate Prices

**How the gate works:** A price fails if below `P25 × 0.5` (likely missing fitment) or above `P75 × 2.0` (likely data entry error). Thresholds in `server/pipeline-v2/quoteOptimisationEngine.ts`.

**Diagnosis:**
```sql
SELECT JSON_EXTRACT(cost_intelligence_json, '$.compositeOptimisation.compositeLineItems') as line_items
FROM ai_assessments WHERE claim_id = <claim_id>;
```

Check each item's `benchmarkVerdict` field. `FAILED_CREDIBILITY` means the price was rejected.

**Fix for systemic issue:** If the P25/P75 range is too narrow, recalibrate the thresholds in `quoteOptimisationEngine.ts`.

---

## §2.6 Benchmark Data Poisoning from Fraudulent Claim

**Protection:** The G-1 guard in `server/pipeline-v2/repairReplaceEngine.ts` excludes claims with `fraud_score >= 50` from the learning table.

**Diagnosis:**
```sql
SELECT component_name, quoted_amount_usd, fraud_risk_score, created_at
FROM component_repair_outcomes WHERE claim_id = <suspicious_claim_id>;
```

**Fix:** If contaminated data was written:
```sql
DELETE FROM component_repair_outcomes WHERE claim_id = <suspicious_claim_id>;
```

Then re-run the benchmark aggregation to recalculate `component_benchmarks`.

---

## §2.7 Fraud Score is 0 or Missing

**Diagnosis:**
```sql
SELECT
  JSON_EXTRACT(fraud_analysis_json, '$.overallFraudScore') as fraud_score,
  JSON_EXTRACT(fraud_analysis_json, '$.riskLevel') as risk_level
FROM ai_assessments WHERE claim_id = <claim_id>;
```

**Root causes:**

| Root cause | Evidence | Fix |
|---|---|---|
| `structured_json` is null (Stage 3 failed) | `structured_json` is null | Fix Stage 3 first |
| All fraud signal inputs are null | `components` array has all zeros | Check if physics, damage, and timeline data are present |
| Fraud narrative LLM call failed | `[QuoteAudit] LLM failed` | Non-fatal — score computed from rule-based signals; narrative empty |

---

## §2.8 Fraud Score Systematically Too High or Too Low

**Diagnosis — distribution check:**
```sql
SELECT
  FLOOR(JSON_EXTRACT(fraud_analysis_json, '$.overallFraudScore') / 10) * 10 as score_band,
  COUNT(*) as claim_count
FROM ai_assessments a
JOIN claims c ON c.id = a.claim_id
WHERE c.tenant_id = '<insurer_tenant_id>'
AND a.fraud_analysis_json IS NOT NULL
GROUP BY score_band ORDER BY score_band;
```

A healthy distribution should be roughly bell-shaped around 20–40. If >50% of claims are above 60 or below 10, recalibration is needed.

**Fix:** Adjust the category weights in `server/pipeline-v2/stage-8-fraud.ts`. Document the change in an ADR.

---

## §2.9 Physics Analysis Shows "UNAVAILABLE" for All Indicators

**Diagnosis:**
```sql
SELECT
  JSON_EXTRACT(structured_json, '$.incidentType') as incident_type,
  JSON_EXTRACT(structured_json, '$.collisionDirection') as collision_direction,
  JSON_EXTRACT(physics_analysis_json, '$.physicsConsistency') as consistency
FROM ai_assessments WHERE claim_id = <claim_id>;
```

**UNAVAILABLE vs DEGRADED vs FAILED:**
- `UNAVAILABLE` — required input missing (expected, not a bug)
- `DEGRADED` — computed with low confidence (acceptable)
- `FAILED` — threw an error (investigate)

UNAVAILABLE is correct behaviour when collision direction or incident type is unknown.

---

## §2.10 Physics Speed Estimate is Implausible

**Root cause:** Friction coefficients are hardcoded in `server/accidentPhysics.ts`:
- Dry tarmac: μ = 0.7 | Wet tarmac: μ = 0.4 | Gravel/dirt: μ = 0.3

If road surface was not captured, the engine defaults to dry tarmac (μ = 0.7). For a wet road accident, this over-estimates speed.

**Diagnosis:**
```sql
SELECT JSON_EXTRACT(structured_json, '$.roadSurface') as road_surface
FROM ai_assessments WHERE claim_id = <claim_id>;
```

**Fix for specific claim:** Update `structured_json` with correct road surface; re-run Stage 7.

**Systemic fix:** If road surface is frequently null, update the WhatsApp intake flow and web claim form to make it a required field.

---

## §2.11 Direction Contradiction Badge Missing on Known Contradiction

**Diagnosis:**
```sql
SELECT JSON_EXTRACT(enriched_photos_json, '$[*].directionContradiction') as contradictions
FROM ai_assessments WHERE claim_id = <claim_id>;
```

**Root cause:** The contradiction detection in `enrichPhoto()` compares `impactZone` against `collisionDirection`. If either is null, the comparison cannot be made.

**Root cause file:** `server/pipeline-v2/stage-6-damage-analysis.ts` — `enrichPhoto()` function

---

## §2.12 CI and FR Reports Show Different Speed Figures

> **Critical rule:** The CI report must read `cross_validation_json.threeWaySpeedComparison` from the same source as the FR report. It must NOT recompute the comparison independently.

**Diagnosis:**
```sql
SELECT JSON_EXTRACT(cross_validation_json, '$.threeWaySpeedComparison') as speed_comparison
FROM ai_assessments WHERE claim_id = <claim_id>;
```

Both CI and FR must display values from this single field. If they show different values, one report generator is recomputing rather than reading from `cross_validation_json`.

---

# PART 3: QUOTATION, VALUATION, AND AGENCY ENGINE FAILURES

---

## §3.1 Vehicle Valuation Request Not Processing

**Diagnosis:**
```sql
SELECT id, status, report_gating_status, inspection_required, inspection_assigned_to, created_at
FROM quotation_requests WHERE id = <request_id>;
```

**Root causes:**

| Root cause | Evidence | Fix |
|---|---|---|
| No inspector assigned for fleet >10 vehicles | `inspection_required = 1`, `inspection_assigned_to` is null | Assign inspector via KingaAgency → Client Requests |
| Valuation report gated | `report_gating_status = 'teaser'` | Issue policy (`unlockReportOnPolicyIssuance`) or process $25 payment |
| Vehicle photos not uploaded | No photos in S3 | Ask client to upload photos via valuation request form |

**Root cause file:** `server/routers/insurance-phase7.ts`

---

## §3.2 Valuation Report Not Unlocking After Policy Issuance

**Diagnosis:**
```sql
SELECT id, report_gating_status, report_unlocked_at, policy_id
FROM quotation_requests WHERE id = <request_id>;
```

If `report_gating_status = 'teaser'` and `policy_id` is set, the unlock procedure was not called.

**Fix:**
```sql
UPDATE quotation_requests SET
  report_gating_status = 'full',
  report_unlocked_at = NOW()
WHERE id = <request_id>;
```

**Root cause file:** `server/routers/insurance-phase7.ts` — `unlockReportOnPolicyIssuance`

---

## §3.3 Quote Not Delivered to Client After Agent Sends It

**Diagnosis:**
```sql
SELECT id, status, premium_amount, sent_at FROM quotation_requests WHERE id = <request_id>;

SELECT id, title, read_at, created_at FROM notifications
WHERE user_id = <client_user_id> ORDER BY created_at DESC LIMIT 5;
```

**Root causes:**
- `sent_at` is null → `sendQuoteToClient` was not called or failed
- Client's `userId` is wrong (registered with different email)
- Client has not logged in to see the notification

**Root cause file:** `server/routers/insurance-phase7.ts` — `sendQuoteToClient`

---

## §3.4 Policy Document Not Appearing in Client Portal

**Diagnosis:**
```sql
SELECT id, document_type, title, file_url, delivered_to_client, created_at
FROM quotation_request_documents WHERE quotation_request_id = <request_id>;
```

If `delivered_to_client = 0`, the document was uploaded but delivery notification was not sent.

**Fix:** Re-send via KingaAgency → Client Requests → Send Doc.

---

## §3.5 Bulk CSV Valuation Upload Failing

**Common causes:**
- CSV format does not match expected columns (make, model, year, registration, VIN)
- CSV contains non-UTF-8 characters (common with Excel exports)
- Too many vehicles in a single CSV (>500 rows may time out)

**Fix:** Validate CSV format against the template. For large CSVs, split into batches of 100 vehicles.

---

# PART 4: PORTAL, AUTHENTICATION, DATA INTEGRITY, AND MULTI-TENANT FAILURES

---

## §4.1 User Cannot Log In or Is Redirected to Wrong Portal

**Diagnosis:**
```sql
SELECT id, open_id, name, email, role, tenant_id, last_signed_in
FROM users WHERE email = 'user@example.com';
```

**Role → Portal mapping** (defined in `client/src/pages/Login.tsx` → `getDashboardPath()`):

| Role | Portal |
|---|---|
| `claimant` | `/client` (My Portal) |
| `claims_processor`, `assessor_internal`, `claims_manager`, `risk_manager`, `executive`, `insurer_admin`, `recoveries_officer` | `/insurer` |
| `assessor` | `/assessor` |
| `panel_beater` | `/panel-beater` |
| `fleet_manager`, `fleet_admin` | `/fleet` |
| `agency_broker`, `agency_admin` | `/agency` |
| `engineer` | `/engineer` |
| `platform_super_admin` | `/agency` (with access to all portals) |

**Common fixes:** Wrong role → update `users.role`; missing `tenant_id` → update `users.tenant_id`

---

## §4.2 User Sees "Unauthorized" on Accessible Page

**Root cause:** `insurerDomainProcedure` validates role AND `tenantId`. If either fails, the user gets `FORBIDDEN`.

**Diagnosis:** Check server logs for:
```
[TenantIsolation] VIOLATION: user <openId> attempted to access tenant <tenantId>
```

If no violation log exists but user still gets Unauthorized, check that the procedure uses `insurerDomainProcedure` (not `protectedProcedure`).

---

## §4.3 React Error #130 — "An unexpected error occurred"

**Root cause:** A component is rendered before its `lazy()` declaration executes. JavaScript `const` is not hoisted — if a `lazy()` declaration appears after the component is used in JSX, the component is `undefined` at render time.

**This bug was fixed in August 2026** — 13 components were affected. If it recurs, a new `lazy()` declaration was added at the bottom of `App.tsx` instead of at the top.

**Fix:** Move the `lazy()` declaration to before the `Router` function definition in `client/src/App.tsx`.

---

## §4.4 Claimant Cannot See Their Claim in My Portal

**Diagnosis:**
```sql
SELECT id, claim_number, status, claimant_id FROM claims WHERE id = <claim_id>;
SELECT id, open_id FROM users WHERE id = <claimant_id>;
```

**Common causes:**
- `claimant_id` is null → claim submitted without a logged-in user (WhatsApp or anonymous)
- Claimant registered with a different email than used in the claim
- Claim is a company vehicle claim → appears in Company tab, not Claims tab

**Fix for null claimant_id:**
```sql
UPDATE claims SET claimant_id = <user_id> WHERE id = <claim_id>;
```

---

## §4.5 Fleet Manager Cannot See Company Vehicle Claims

**Diagnosis:**
```sql
SELECT id, company_name, manager_user_id FROM fleet_accounts WHERE manager_user_id = <user_id>;

SELECT c.id, c.claim_number, c.status FROM claims c
WHERE c.fleet_account_id = <fleet_account_id>;
```

**Common causes:**
- No fleet account exists for this manager → create via Fleet Management portal
- Claims have `fleet_account_id = null` → driver did not indicate a company vehicle

---

## §4.6 Notification Not Delivered to Claimant

**Diagnosis:**
```sql
SELECT title, message, read_at, created_at FROM notifications
WHERE user_id = <claimant_user_id> ORDER BY created_at DESC LIMIT 10;
```

**Important:** KINGA uses in-app notifications only — no email or SMS (no email spam policy). The claimant must check My Portal.

---

## §4.7 Claim with Null `tenantId` Visible to Wrong Insurer

**Risk:** `tenantId` is nullable in the `claims` schema. A claim with no `tenantId` bypasses tenant isolation.

**Diagnosis:**
```sql
SELECT id, claim_number, tenant_id, created_at FROM claims
WHERE tenant_id IS NULL ORDER BY created_at DESC LIMIT 20;
```

**Fix:**
```sql
UPDATE claims SET tenant_id = '<correct_tenant_id>' WHERE id = <claim_id>;
```

---

## §4.8 Orphaned `ai_assessments` After Claim Status Reset

**Fix:** Archive the old record before resetting:
```sql
UPDATE ai_assessments SET status = 'archived'
WHERE claim_id = <claim_id> AND status NOT IN ('complete', 'archived');
```

---

## §4.9 WhatsApp Session Stuck in Wrong State

**Diagnosis:**
```sql
SELECT phone_number, state, context, updated_at FROM whatsapp_sessions
WHERE phone_number = '+263771234567' ORDER BY updated_at DESC LIMIT 3;
```

**Fix:** Reset the session:
```sql
DELETE FROM whatsapp_sessions WHERE phone_number = '+263771234567';
```

The claimant can then send "Hi" to start a fresh session.

---

## §4.10 WhatsApp Messages Not Being Processed

**Diagnosis:**
1. Check Twilio credentials: `echo $TWILIO_ACCOUNT_SID`
2. Check webhook URL is registered in Twilio: `https://kingaai-ybs42lwg.manus.space/api/whatsapp/webhook`
3. Check logs for: `[WA-WEBHOOK] Message processing error`

**If `TWILIO_ACCOUNT_SID` is not set:** Engine uses `MockWhatsAppAdapter` — no real messages processed. Set Twilio credentials to enable live processing.

---

# PART 5: PERFORMANCE, SECURITY, INFRASTRUCTURE, AND INTELLIGENCE CALIBRATION

---

## §5.1 Server Memory Pressure or OOM

**Normal memory profile:**
- Idle: heap ~140–170MB | Pipeline (1 claim): ~250–400MB | Report generation: ~400–600MB
- Warning: heap > 800MB | Critical: heap > 1200MB

**Root causes:**

| Cause | Evidence | Fix |
|---|---|---|
| Multiple pipelines simultaneously | `MAX_CONCURRENT_PIPELINES` changed from 1 | Revert to 1; restart server |
| Large PDF with many pages | `PDF image re-extraction` shows >50 pages | Limit PDF page count at upload |
| Memory leak in report generator | Heap grows steadily without pipeline activity | Restart server; investigate report generator |

**Immediate fix:** Restart the server. Stuck-claim recovery job re-queues in-progress claims.

---

## §5.2 Database Connection Pool Exhausted

**Pool configuration:** `connectionLimit: 5` in `server/db.ts`. `waitForConnections: true` means queries queue rather than fail immediately.

**Diagnosis:**
```sql
SHOW PROCESSLIST;
```

**Fix:** Kill long-running queries:
```sql
KILL QUERY <process_id>;
```

If pool exhaustion is frequent, increase `connectionLimit` to 10 in `server/db.ts`.

---

## §5.3 TiDB Connection Dropped (ECONNRESET)

**Evidence:** `[Database] Pool connection lost, will reinitialise on next query: ECONNRESET`

**Root cause:** TiDB Cloud drops idle connections after ~5 minutes. Pool is configured with `idleTimeout: 240000` (4 minutes) to release connections before TiDB drops them.

**Recovery:** Pool automatically reinitialises on next query (`_db = null; _pool = null`). No manual intervention needed unless reinitialisation itself fails.

---

## §5.4 S3 Upload Failures

**Diagnosis:**
```bash
curl -H "Authorization: Bearer $BUILT_IN_FORGE_API_KEY" $BUILT_IN_FORGE_API_URL/storage/health
```

| Response | Meaning | Fix |
|---|---|---|
| `401 Unauthorized` | API key expired or invalid | Rotate the API key in Manus platform settings |
| `413 Payload Too Large` | File too large | Compress PDFs; limit photo resolution |
| `507 Insufficient Storage` | Storage quota exceeded | Delete old report PDFs; contact Manus to increase quota |

---

## §5.5 Tenant Isolation Violation Detected

**Diagnosis:**
```sql
SELECT procedure_name, caller_open_id, attempted_tenant_id, created_at
FROM tenant_isolation_violations
WHERE created_at > NOW() - INTERVAL 1 HOUR ORDER BY created_at DESC;
```

**Interpreting the caller:**
- `cron_` prefix → scheduled job without tenant context (fix job configuration)
- User ID → specific user attempting cross-tenant access (check role and tenantId)
- null → unauthenticated request (potential security event — investigate immediately)

---

## §5.6 Fraud Score Weights Producing Biased Results

**Fraud score category weights** (in `server/pipeline-v2/stage-8-fraud.ts`):
- Documentation: max 15 pts | Timeline: max 20 pts | Physics mismatch: max 25 pts
- Damage pattern: max 20 pts | Financial: max 10 pts | Behavioural: max 10 pts

**Recalibration procedure:**
1. Export fraud score distribution for last 500 claims (see §7.4)
2. Compare against expected bell curve centred at 20–35
3. Adjust weights for over-contributing categories
4. Document in an ADR
5. Re-run Stage 8 for historical claims to update scores

---

## §5.7 Physics Friction Coefficients Wrong for Jurisdiction

**Current hardcoded values** (`server/accidentPhysics.ts`):
- Dry tarmac: μ = 0.7 | Wet tarmac: μ = 0.4 | Gravel/dirt: μ = 0.3

These are calibrated for Zimbabwean road conditions. For other jurisdictions, update the `frictionCoefficients` object and document the change in an ADR with the source of the new values.

---

## §5.8 Benchmark Learning Table Growing with Bad Data

**Diagnosis:**
```sql
SELECT component_name, p25_usd, median_usd, p75_usd, sample_size, updated_at
FROM component_benchmarks WHERE component_name LIKE '%Front Bumper%' ORDER BY updated_at DESC LIMIT 5;

SELECT component_name, quoted_amount_usd, fraud_risk_score, created_at
FROM component_repair_outcomes
WHERE component_name LIKE '%Front Bumper%' ORDER BY created_at DESC LIMIT 20;
```

**Fix:** Delete contaminated rows and re-run benchmark aggregation:
```sql
DELETE FROM component_repair_outcomes WHERE claim_id = <suspicious_claim_id>;
```

---

# PART 6: WORKFLOW ENGINE, ASSIGNMENT ENGINE, AND GOVERNANCE FAILURES

---

## §6.1 Claim Stuck in Workflow State

**Diagnosis:**
```sql
SELECT id, status, workflow_state, updated_at FROM claims WHERE id = <claim_id>;

SELECT action, from_state, to_state, performed_by, created_at
FROM workflow_audit_trail WHERE claim_id = <claim_id> ORDER BY created_at DESC LIMIT 10;
```

**Root cause file:** `server/claim-state-machine.ts` — defines valid transitions. If a transition is not in the state machine, it is rejected silently.

---

## §6.2 Assessor Assignment Failing

**Diagnosis:**
```sql
SELECT id, name, role, tenant_id FROM users
WHERE role = 'assessor' AND tenant_id = '<insurer_tenant_id>';
```

**Root causes:**
- No assessors registered for this insurer tenant
- Assessor capacity cap reached (`checkAssignmentCap` in `server/routers/claims-core.ts`)
- Assessor notification failed (`[ApprovalRouter] Notification dispatch failed`)

---

## §6.3 Governance Audit Log Missing Entries

**Diagnosis:**
```sql
SELECT action, performed_by, created_at FROM insurance_audit_logs
WHERE claim_id = <claim_id> ORDER BY created_at DESC LIMIT 20;
```

**Root cause:** The `createAuditEntry()` function must be called from every state transition procedure. If an entry is missing, the procedure that should have called it did not.

---

# PART 7: OPERATIONAL PLAYBOOKS

---

## §7.1 Daily Health Check (5 Minutes)

Run these checks every morning before the business day starts:

```sql
-- 1. Claims stuck in pipeline for >1 hour
SELECT c.claim_number, c.status, a.status as assessment_status, a.updated_at
FROM claims c JOIN ai_assessments a ON a.claim_id = c.id
WHERE a.status = 'in_progress' AND a.updated_at < NOW() - INTERVAL 1 HOUR;

-- 2. Claims in document_failed (need manual review)
SELECT claim_number, status, created_at FROM claims
WHERE status = 'document_failed' AND created_at > NOW() - INTERVAL 24 HOUR;

-- 3. Recent tenant isolation violations
SELECT procedure_name, caller_open_id, created_at FROM tenant_isolation_violations
WHERE created_at > NOW() - INTERVAL 24 HOUR;

-- 4. Benchmark data quality (last 24 hours)
SELECT COUNT(*) as total_outcomes,
  SUM(CASE WHEN fraud_risk_score >= 50 THEN 1 ELSE 0 END) as excluded_by_g1
FROM component_repair_outcomes WHERE created_at > NOW() - INTERVAL 24 HOUR;

-- 5. Memory check — review [MEMORY] log lines from server logs
```

---

## §7.2 Incident Response Procedure

**Step 1 — Triage (< 5 minutes)**
- Identify the affected system (pipeline, portal, reports, auth, DB)
- Determine scope (one claim, one insurer, all insurers)
- Assign severity: Critical (system down), High (major feature broken), Medium (degraded), Low (cosmetic)

**Step 2 — Contain (< 15 minutes)**
- If pipeline producing wrong outputs, pause new claim processing temporarily
- If security event suspected, check `tenant_isolation_violations` immediately
- Do not delete any data until root cause is confirmed

**Step 3 — Diagnose (< 30 minutes)**
- Use the Master Symptom Index at the top of this manual
- Run the diagnostic SQL queries for the relevant section
- Check server logs for the claim ID or error pattern

**Step 4 — Fix and verify**
- Apply the fix as described in the relevant section
- Verify the fix worked (re-run the diagnostic query)
- Resume normal operations

**Step 5 — Post-mortem**
- Complete a post-mortem within 24 hours using the template in §7.5
- Add to `docs/post-mortems/YYYY-MM-DD-description.md`

---

## §7.3 Escalation Matrix

| Severity | First responder | Escalate to | Escalate after |
|---|---|---|---|
| Critical (system down) | On-call engineer | Lead Engineer (Tavonga Shoko) | 15 minutes |
| High (major feature broken) | On-call engineer | Lead Engineer | 1 hour |
| Medium (degraded) | On-call engineer | — | Next business day |
| Low (cosmetic) | Any engineer | — | Next sprint |
| Security event | Lead Engineer | Platform Admin | Immediately |

---

## §7.4 Key DB Queries Reference

```sql
-- All claims in a failed state (last 24 hours)
SELECT id, claim_number, status, document_processing_status, created_at
FROM claims WHERE status IN ('document_failed', 'failed')
AND created_at > NOW() - INTERVAL 24 HOUR ORDER BY created_at DESC;

-- Claims stuck in pipeline for >1 hour
SELECT c.id, c.claim_number, c.status, a.status as assessment_status, a.updated_at
FROM claims c JOIN ai_assessments a ON a.claim_id = c.id
WHERE a.status = 'in_progress' AND a.updated_at < NOW() - INTERVAL 1 HOUR;

-- Pipeline stage completion for a claim
SELECT stage_name, status, started_at, completed_at, error_message
FROM pipeline_stage_runs psr
JOIN pipeline_runs pr ON pr.id = psr.run_id
WHERE pr.claim_id = <claim_id> ORDER BY psr.started_at;

-- Recent tenant isolation violations
SELECT procedure_name, caller_open_id, attempted_tenant_id, created_at
FROM tenant_isolation_violations ORDER BY created_at DESC LIMIT 20;

-- Notification delivery for a user
SELECT title, message, read_at, created_at FROM notifications
WHERE user_id = <user_id> ORDER BY created_at DESC LIMIT 10;

-- Benchmark data quality
SELECT component_name, p25_usd, median_usd, p75_usd, sample_size
FROM component_benchmarks ORDER BY sample_size DESC LIMIT 20;

-- WhatsApp session state
SELECT phone_number, state, updated_at FROM whatsapp_sessions
ORDER BY updated_at DESC LIMIT 10;

-- Valuation requests pending action
SELECT id, status, report_gating_status, inspection_required, created_at
FROM quotation_requests WHERE status = 'pending' ORDER BY created_at DESC LIMIT 20;

-- Fraud score distribution (last 30 days)
SELECT
  FLOOR(JSON_EXTRACT(fraud_analysis_json, '$.overallFraudScore') / 10) * 10 as score_band,
  COUNT(*) as claim_count
FROM ai_assessments
WHERE created_at > NOW() - INTERVAL 30 DAY AND fraud_analysis_json IS NOT NULL
GROUP BY score_band ORDER BY score_band;

-- Claims with null tenantId (isolation risk)
SELECT id, claim_number, tenant_id, created_at FROM claims
WHERE tenant_id IS NULL ORDER BY created_at DESC LIMIT 20;
```

---

## §7.5 Post-Mortem Log Template

Save post-mortems in `docs/post-mortems/YYYY-MM-DD-brief-description.md`:

```markdown
# Post-Mortem: [Brief Description]

**Date:** YYYY-MM-DD
**Severity:** Critical / High / Medium / Low
**Duration:** X hours Y minutes
**Author:** [Engineer Name]
**Claims affected:** [Count and claim numbers if applicable]

## What Happened
[Plain-language description of the failure and its impact on users]

## Timeline
- HH:MM — First alert / user report
- HH:MM — Engineer engaged
- HH:MM — Root cause identified
- HH:MM — Fix applied
- HH:MM — Verified resolved

## Root Cause
[Technical root cause — specific file, function, and line number]

## Fix Applied
[What was changed and why]

## Prevention
[What will prevent this from happening again]

## Lessons Learned
[What this incident taught us about the system]
```

---

## §7.6 Environment Variables Reference

| Variable | Purpose | Impact if missing |
|---|---|---|
| `DATABASE_URL` | TiDB connection string | Server fails to start |
| `JWT_SECRET` | Session cookie signing | All authentication fails |
| `BUILT_IN_FORGE_API_KEY` | LLM + S3 API access | Pipeline fails at every LLM call; S3 uploads fail |
| `BUILT_IN_FORGE_API_URL` | LLM + S3 API base URL | Same as above |
| `VITE_APP_ID` | Manus OAuth app ID | Login fails |
| `OAUTH_SERVER_URL` | Manus OAuth backend | Login fails |
| `TWILIO_ACCOUNT_SID` | WhatsApp via Twilio | WhatsApp uses MockAdapter (no real messages) |
| `TWILIO_AUTH_TOKEN` | WhatsApp via Twilio | Same as above |
| `TWILIO_WHATSAPP_FROM` | WhatsApp sender number | Same as above |
| `HEARTBEAT_ALLOWED_TASK_UIDS` | Heartbeat cron auth | Cron jobs use default-permissive mode (security risk) |
| `LOG_LEVEL` | Minimum log level | Defaults to INFO |

---

*Document maintained by Tavonga Shoko, Lead Engineer. Last updated: August 2026.*
*For architecture decisions, see `docs/adr/`. For codebase navigation, see `CODEBASE_MAP.md`. For onboarding, see `DEVELOPER_GUIDE.md`.*
