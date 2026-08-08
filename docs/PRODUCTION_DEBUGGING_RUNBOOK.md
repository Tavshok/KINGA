# KINGA Production Debugging Runbook

**Author:** Tavonga Shoko, Lead Engineer
**Version:** 1.0 — August 2026

This runbook is the first document to open when something goes wrong in production. It covers every class of failure that has been observed or anticipated, with exact diagnostic steps, the specific log patterns to look for, the DB queries to run, and the fix to apply.

The goal is to reduce mean time to resolution (MTTR) from hours to minutes.

---

## How to Use This Runbook

1. Identify the failure class from the symptom table below.
2. Jump to the relevant section.
3. Follow the diagnostic steps in order — do not skip ahead.
4. Apply the fix only after confirming the root cause.
5. After fixing, verify the claim progressed and add an entry to the post-mortem log.

---

## Symptom → Section Quick Reference

| Symptom | Section |
|---|---|
| Claim stuck in `intake_pending` or `in_review` for >1 hour | [§1 Pipeline Not Starting](#1-pipeline-not-starting) |
| Claim status shows `document_failed` | [§2 Pipeline Failed — Document](#2-pipeline-failed--document) |
| Pipeline reached stage 6 but never progressed | [§3 Pipeline Stuck Mid-Stage](#3-pipeline-stuck-mid-stage) |
| Reports not generated after pipeline completes | [§4 Reports Missing After Pipeline](#4-reports-missing-after-pipeline) |
| KINGA Optimised cost shows $0 or wrong value | [§5 Cost Intelligence Wrong](#5-cost-intelligence-wrong) |
| Fraud score is 0 or missing | [§6 Fraud Score Missing](#6-fraud-score-missing) |
| Physics analysis shows "UNAVAILABLE" for all indicators | [§7 Physics Analysis Unavailable](#7-physics-analysis-unavailable) |
| User cannot log in or is redirected to wrong portal | [§8 Authentication and Routing](#8-authentication-and-routing) |
| React error #130 — "An unexpected error occurred" | [§9 React Component Crash](#9-react-component-crash) |
| WhatsApp messages not being processed | [§10 WhatsApp Engine](#10-whatsapp-engine) |
| Tenant data leaking across insurers | [§11 Tenant Isolation Violation](#11-tenant-isolation-violation) |
| Server memory pressure or OOM | [§12 Memory and Performance](#12-memory-and-performance) |
| Database connection failures | [§13 Database Connectivity](#13-database-connectivity) |
| Notification not delivered to claimant | [§14 Notifications Not Delivered](#14-notifications-not-delivered) |

---

## §1 Pipeline Not Starting

**Symptom:** A claim has been submitted but remains in `intake_pending` or `in_review` for more than 1 hour. No pipeline stages have started.

### Step 1: Check the claim status in the DB

```sql
SELECT id, claim_number, status, workflow_state, document_processing_status, created_at
FROM claims
WHERE claim_number = 'CLM-XXXXXXXXXX';
```

Expected: `status = 'intake_pending'`, `document_processing_status = NULL` or `'PENDING'`.

### Step 2: Check if an ai_assessment record exists

```sql
SELECT id, claim_id, status, created_at, updated_at
FROM ai_assessments
WHERE claim_id = <claim_id>;
```

If no record exists, the pipeline was never triggered. If a record exists with `status = 'pending'`, the pipeline started but the semaphore may be blocking it.

### Step 3: Check the semaphore state

The pipeline uses `MAX_CONCURRENT_PIPELINES = 1` (defined in `server/db.ts`). If a previous pipeline run crashed without releasing the semaphore, all subsequent claims will queue indefinitely.

Check the server logs for:
```
[KINGA Assessment] Claim <id>: Semaphore acquired
[KINGA Assessment] Claim <id>: Semaphore released
```

If you see `Semaphore acquired` for a claim that is no longer running, the semaphore is stuck. **Fix:** Restart the server. The semaphore is in-memory and resets on restart.

### Step 4: Check the stuck-claim recovery job

The stuck-claim recovery job runs every 10 minutes and automatically re-queues claims that have been in `intake_pending` for more than 30 minutes. Check the logs for:
```
[StuckRecovery] Found X stuck claims
[StuckRecovery] Re-queued claim <id>
```

If the recovery job is not running, check `server/jobs/stuck-assessment-recovery-job.ts` and verify the Heartbeat cron is registered.

### Step 5: Manually trigger the pipeline

If the claim is genuinely stuck and the recovery job is not firing, trigger the pipeline manually via the Claims Processor portal: open the claim → click "Trigger Assessment".

**Root cause file:** `server/db.ts` — `triggerAiAssessment()` function (line ~683)

---

## §2 Pipeline Failed — Document

**Symptom:** Claim status is `document_failed`. The claimant sees "Assessment could not be completed."

### Step 1: Check the error message

```sql
SELECT id, claim_id, status, error_message, created_at
FROM ai_assessments
WHERE claim_id = <claim_id>
ORDER BY created_at DESC
LIMIT 1;
```

The `error_message` column contains the last error that caused the pipeline to fail.

### Step 2: Interpret the error

| Error message pattern | Root cause | Fix |
|---|---|---|
| `WATCHDOG TIMEOUT — pipeline hung for 300s` | Pipeline exceeded the 5-minute watchdog timeout | Check which stage was running at timeout; likely an LLM call that timed out |
| `PDF image re-extraction FAILED` | The uploaded document could not be parsed as a PDF | Ask claimant to re-upload the document; check if file is corrupted |
| `No usable content extracted` | OCR found no text in the document | Document may be a scanned image without OCR layer; try a different extraction method |
| `Database not available` | DB connection was lost during pipeline | Check DB connectivity (§13); retry the pipeline |
| `LLM API error` | The LLM call failed (rate limit, timeout, or API error) | Check `BUILT_IN_FORGE_API_KEY` env var; check LLM provider status |

### Step 3: Reset and retry

```sql
UPDATE claims SET
  status = 'intake_pending',
  document_processing_status = 'PENDING'
WHERE id = <claim_id>;

UPDATE ai_assessments SET
  status = 'pending',
  error_message = NULL
WHERE claim_id = <claim_id>;
```

Then trigger the pipeline manually from the Claims Processor portal.

**Root cause file:** `server/db.ts` — `triggerAiAssessment()` watchdog and recovery ladder (lines ~780–1100)

---

## §3 Pipeline Stuck Mid-Stage

**Symptom:** The pipeline started (an `ai_assessments` record exists with `status = 'in_progress'`) but has not progressed past a specific stage for more than 30 minutes.

### Step 1: Find which stage is stuck

```sql
SELECT stage_name, status, started_at, completed_at, error_message
FROM pipeline_stage_runs
WHERE run_id = (
  SELECT id FROM pipeline_runs WHERE claim_id = <claim_id>
  ORDER BY created_at DESC LIMIT 1
)
ORDER BY started_at;
```

The last row with `status = 'IN_PROGRESS'` and no `completed_at` is the stuck stage.

### Step 2: Diagnose by stage

| Stuck stage | Likely cause | Fix |
|---|---|---|
| Stage 1–3 (Ingestion/Extraction) | LLM call timed out; PDF too large | Check LLM API status; reduce PDF size |
| Stage 6 (Damage Analysis) | Vision API call timed out; too many photos | Check photo count; vision calls have a 60s timeout |
| Stage 7 (Physics) | Missing collision direction; physics engine threw | Check `structured_json.incidentType` — if null, physics cannot run |
| Stage 8 (Fraud) | Missing required fields from Stage 7 | Check `physics_analysis_json` — if null, fraud engine degrades gracefully |
| Stage 9 (Cost) | Quote extraction LLM timed out | Check if panel beater quotes were submitted; check LLM API |
| Stage 10 (Reports) | PDF renderer crashed; S3 upload failed | Check S3 credentials; check available disk space |

### Step 3: Check the server logs

All pipeline log lines include the claim ID:
```
[KINGA Assessment] Claim <id>: Stage 6 — damage analysis starting
[KINGA Assessment] Claim <id>: Stage 6 — vision API call timed out after 60s
```

Filter the logs: `grep "Claim <id>" /var/log/kinga/server.log`

**Root cause files:** `server/pipeline-v2/stage-*.ts` (individual stage logic), `server/db.ts` (stage orchestration)

---

## §4 Reports Missing After Pipeline

**Symptom:** The pipeline completed (`ai_assessments.status = 'complete'`) but the CL, CI, or FR report is not available.

### Step 1: Check if reports were generated

```sql
SELECT
  JSON_EXTRACT(assembly_json, '$.reportUrls.cl') as cl_report,
  JSON_EXTRACT(assembly_json, '$.reportUrls.ci') as ci_report,
  JSON_EXTRACT(assembly_json, '$.reportUrls.fr') as fr_report
FROM ai_assessments
WHERE claim_id = <claim_id>;
```

If the URLs are null, Stage 10 failed silently.

### Step 2: Check Stage 10 error

```sql
SELECT error_message FROM pipeline_stage_runs
WHERE run_id = (SELECT id FROM pipeline_runs WHERE claim_id = <claim_id> ORDER BY created_at DESC LIMIT 1)
AND stage_name LIKE '%Stage 10%';
```

### Step 3: Regenerate reports manually

Reports can be regenerated without re-running the full pipeline. Use the tRPC procedure:
```
trpc.aiAssessments.regenerateReports.mutate({ claimId })
```

Or from the Claims Processor portal: open the claim → "Regenerate Reports" button.

**Root cause files:** `server/reporting/reportDefinitions.ts` (CL), `server/reporting/claimsIntelligenceReport.ts` (CI), `server/reporting/forensicDecisionReport.ts` (FR)

---

## §5 Cost Intelligence Wrong

**Symptom:** KINGA Optimised shows $0, wrong value, or "—" for all components.

### Step 1: Check the canonical cost field

```sql
SELECT
  JSON_EXTRACT(cost_intelligence_json, '$.compositeOptimisation.l2CompositeOptimisedCostUsd') as kinga_optimised,
  JSON_EXTRACT(cost_intelligence_json, '$.documentedAgreedCostUsd') as agreed_cost,
  JSON_EXTRACT(cost_intelligence_json, '$.documentedOriginalQuoteUsd') as original_quote
FROM ai_assessments
WHERE claim_id = <claim_id>;
```

> **Critical:** The canonical field is `l2CompositeOptimisedCostUsd` — NOT `compositeOptimisedCostUsd`. The latter does not exist in DB data.

### Step 2: Check if quote line items were extracted

```sql
SELECT q.panel_beater_name, q.total_amount_cents, COUNT(li.id) as line_item_count
FROM panel_beater_quotes q
LEFT JOIN quote_line_items li ON li.quote_id = q.id
WHERE q.claim_id = <claim_id>
GROUP BY q.id;
```

If `line_item_count = 0` for all quotes, the OCR did not extract per-line prices. This is expected when the submitted PDF has no itemised pricing — only a total. The KINGA Optimised figure will be partial (only components with benchmark data).

### Step 3: Check if quotes were submitted via web form

Web-submitted quotes (via Panel Beater portal form) write directly to `quote_line_items`. PDF-uploaded quotes require OCR extraction. If a panel beater uploaded a PDF with no per-line prices, the line items will be empty.

### Step 4: Verify the report is reading the correct field

If the report shows $0 but the DB has a non-zero value, the report generator is reading the wrong field. Check:
- `server/reporting/reportDefinitions.ts` — search for `l2CompositeOptimisedCostUsd`
- `server/reporting/claimsIntelligenceReport.ts` — same
- `server/reporting/forensicDecisionReport.ts` — same

All three must read `l2CompositeOptimisedCostUsd`, not `compositeOptimisedCostUsd`.

**Root cause files:** `server/pipeline-v2/quoteOptimisationEngine.ts`, `server/pipeline-v2/stage-9-cost.ts`, all three report generators

---

## §6 Fraud Score Missing

**Symptom:** Fraud score is 0 or the fraud section of the report is empty.

### Step 1: Check if fraud analysis ran

```sql
SELECT
  JSON_EXTRACT(fraud_analysis_json, '$.overallFraudScore') as fraud_score,
  JSON_EXTRACT(fraud_analysis_json, '$.riskLevel') as risk_level,
  JSON_EXTRACT(fraud_analysis_json, '$.components') as components
FROM ai_assessments
WHERE claim_id = <claim_id>;
```

### Step 2: Check if physics was available

The fraud engine uses physics outputs (speed inconsistency, physics consistency score) as fraud signals. If Stage 7 was skipped or degraded, the physics-based fraud signals will be 0.

```sql
SELECT JSON_EXTRACT(physics_analysis_json, '$.physicsConsistency') as physics_consistency
FROM ai_assessments WHERE claim_id = <claim_id>;
```

### Step 3: Check for zero-sum components

If all fraud components are 0, check that the fraud engine is receiving the correct inputs. A common cause is that `structured_json` is null (Stage 3 failed), which means the fraud engine has no claim data to analyse.

**Root cause file:** `server/pipeline-v2/stage-8-fraud.ts`, `server/fraud-scoring.ts`

---

## §7 Physics Analysis Unavailable

**Symptom:** Physics section of the report shows "UNAVAILABLE" for all indicators.

### Step 1: Check the collision direction

Physics analysis requires a known collision direction. If the incident type is "unknown" or the direction cannot be determined, the physics engine will skip most calculations.

```sql
SELECT
  JSON_EXTRACT(structured_json, '$.incidentType') as incident_type,
  JSON_EXTRACT(structured_json, '$.collisionDirection') as collision_direction,
  JSON_EXTRACT(physics_analysis_json, '$.estimatedSpeedKmh') as speed_kmh
FROM ai_assessments WHERE claim_id = <claim_id>;
```

### Step 2: Check the road surface

The physics engine uses coefficient of friction (μ) based on road surface. If road surface is unknown, it defaults to dry tarmac (μ=0.7). This is not a failure — it is a conservative default.

### Step 3: Check for "UNAVAILABLE" vs "DEGRADED"

- `UNAVAILABLE` = the indicator cannot be computed because a required input is missing (expected, not a bug)
- `DEGRADED` = the indicator was computed but with low confidence (acceptable)
- `FAILED` = the indicator threw an error (investigate)

**Root cause file:** `server/accidentPhysics.ts`, `server/pipeline-v2/stage-7-physics.ts`

---

## §8 Authentication and Routing

**Symptom:** User cannot log in, is redirected to the wrong portal, or sees "Unauthorized."

### Step 1: Check the user's role in the DB

```sql
SELECT id, open_id, name, email, role, tenant_id, last_signed_in
FROM users
WHERE email = 'user@example.com';
```

### Step 2: Check the role → portal mapping

The `getDashboardPath()` function in `client/src/pages/Login.tsx` maps roles to portals. If a user with a valid role is being redirected to the wrong portal, check this function.

| Role | Portal |
|---|---|
| `claimant` | `/client` (My Portal) |
| `claims_processor`, `assessor_internal`, `claims_manager`, `risk_manager`, `executive`, `insurer_admin` | `/insurer` |
| `assessor` | `/assessor` |
| `panel_beater` | `/panel-beater` |
| `fleet_manager`, `fleet_admin` | `/fleet` |
| `agency_broker`, `agency_admin` | `/agency` |
| `engineer` | `/engineer` |
| `platform_super_admin` | `/agency` (with access to all portals) |

### Step 3: Check the domain protection middleware

`insurerDomainProcedure` validates that the user's role matches the insurer domain. If a user has the correct role but the wrong `tenantId`, they will be blocked.

**Root cause files:** `client/src/pages/Login.tsx`, `server/_core/trpc.ts`, `server/_core/domain-middleware.ts`

---

## §9 React Component Crash

**Symptom:** Browser shows "An unexpected error occurred" with React error #130 or similar.

### Step 1: Identify the error code

- **Error #130** — "Element type is invalid: expected a string or a class/function but got: undefined." A component is being rendered before its `lazy()` declaration is executed. Check `client/src/App.tsx` for any `lazy()` declarations that come after the component is used in JSX.
- **Error #310** — "Maximum update depth exceeded." A component is calling `setState` in its render function or in an effect without a dependency array.
- **Error #418** — "Hydration failed." Server and client rendered different HTML. Rare in this stack.

### Step 2: Find the crashing component

In development mode, the error includes a component stack trace. In production (minified), use the error code to identify the class of bug, then check recently changed files.

### Step 3: Check for hoisting bugs

React error #130 is almost always caused by a `const` declaration that is used before it is defined (no hoisting for `const`). The fix is to move the declaration above the usage.

**Root cause file:** `client/src/App.tsx` (hoisting bugs were fixed in Aug 2026 — 13 components were affected)

---

## §10 WhatsApp Engine

**Symptom:** WhatsApp messages are not being processed; sessions are not being created.

### Step 1: Check the WhatsApp provider mode

The WhatsApp engine uses `MockWhatsAppAdapter` by default (no Twilio credentials required). To use Twilio, set:
```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

If these are not set, the engine uses the mock adapter and incoming webhooks from Twilio will be ignored.

### Step 2: Check the webhook endpoint

The WhatsApp webhook is at `/api/whatsapp/webhook`. Twilio must be configured to POST to this URL. Verify in the Twilio console.

### Step 3: Check session state

```sql
SELECT phone_number, state, updated_at
FROM whatsapp_sessions
WHERE phone_number = '+263771234567'
ORDER BY updated_at DESC
LIMIT 5;
```

If a session is stuck in a state, it can be reset by deleting the row.

**Root cause files:** `server/whatsapp/engine.ts`, `server/whatsapp/webhook.ts`, `server/whatsapp/sessionManager.ts`

---

## §11 Tenant Isolation Violation

**Symptom:** Data from one insurer is visible to another insurer, or the `tenant_isolation_violations` table has unexpected entries.

### Step 1: Check the violation log

```sql
SELECT procedure_name, caller_open_id, attempted_tenant_id, created_at
FROM tenant_isolation_violations
WHERE created_at > NOW() - INTERVAL 1 HOUR
ORDER BY created_at DESC;
```

### Step 2: Identify the caller

- If `caller_open_id` is a user ID, a specific user is attempting cross-tenant access. Check if their role and tenantId are correctly set.
- If `caller_open_id` starts with `cron_`, it is a scheduled job running without tenant context. Check the Heartbeat cron configuration.
- If `caller_open_id` is null or unknown, it may be an unauthenticated request probing for access. Treat as a security event.

### Step 3: Verify the procedure has tenant scoping

Every procedure that accesses insurer data must use `insurerDomainProcedure` (not `protectedProcedure`). If a violation is occurring on a specific procedure, check that it uses the correct procedure type.

**Root cause files:** `server/_core/trpc.ts`, `server/routers/claims-core.ts`, `server/routers/ai-assessments-core.ts`

---

## §12 Memory and Performance

**Symptom:** Server is slow, memory warnings in logs, or OOM crashes.

### Step 1: Check current memory usage

The server logs memory every 60 seconds:
```
[MEMORY] heap=137MB rss=254MB external=7MB
```

Normal: heap < 400MB. Warning: heap > 800MB. Critical: heap > 1200MB (OOM risk).

### Step 2: Identify the cause

- **PDF processing:** Each PDF page rendered as an image uses ~50MB. If multiple claims are being processed simultaneously, memory can spike.
- **LLM responses:** Large LLM responses (long claim descriptions, many photos) can temporarily spike memory.
- **Report generation:** Generating all three reports simultaneously uses ~200MB.

### Step 3: Check the concurrency limiter

`MAX_CONCURRENT_PIPELINES = 1` in `server/db.ts`. If this has been changed, revert it.

### Step 4: Restart the server

If memory is critically high, restart the server. The stuck-claim recovery job will re-queue any claims that were being processed.

**Root cause file:** `server/db.ts` — semaphore and memory monitoring, `server/_core/index.ts` — GC triggers

---

## §13 Database Connectivity

**Symptom:** `[Database] Connection unavailable` errors in logs; claims not being saved.

### Step 1: Check the DATABASE_URL environment variable

```bash
echo $DATABASE_URL
```

Should be a valid MySQL/TiDB connection string. If empty or malformed, the DB will not connect.

### Step 2: Check TiDB Cloud status

TiDB Cloud has a status page. If there is a known outage, wait for it to resolve.

### Step 3: Check connection pool exhaustion

The connection pool has a maximum of 10 connections (configured in `server/db.ts`). If all connections are in use, new queries will queue. Check for long-running queries:

```sql
SHOW PROCESSLIST;
```

### Step 4: Verify with a simple query

```bash
curl https://your-kinga-url.manus.space/api/trpc/system.healthCheck
```

**Root cause file:** `server/db.ts` — `getDb()`, `getDbOrThrow()`, connection pool configuration

---

## §14 Notifications Not Delivered

**Symptom:** Claimant did not receive an in-app notification after a state transition.

### Step 1: Check the notifications table

```sql
SELECT title, message, read_at, created_at
FROM notifications
WHERE user_id = <claimant_user_id>
ORDER BY created_at DESC
LIMIT 10;
```

If the notification is in the DB but the claimant doesn't see it, the UI is not polling correctly. Check `ClientPortal.tsx` — the notification badge uses `trpc.notifications.getUnread.useQuery()`.

If the notification is not in the DB, the state transition procedure did not call `createNotification()`. Check the relevant procedure in `server/routers/claims-core.ts`.

### Step 2: Check the notification type

KINGA uses in-app notifications only — no email or SMS by default. If the claimant expects an email, this is by design (no email spam policy). The claimant must check the My Portal notification centre.

**Root cause files:** `server/db.ts` — `createNotification()`, `server/routers/claims-core.ts` — state transition procedures, `client/src/pages/ClientPortal.tsx` — notification display

---

## Post-Mortem Log Template

After resolving any production issue, add an entry to `docs/post-mortems/` using this template:

```markdown
# Post-Mortem: [Brief Description]

**Date:** YYYY-MM-DD
**Severity:** Critical / High / Medium / Low
**Duration:** X hours Y minutes
**Author:** [Engineer Name]

## What Happened
[Plain-language description of the failure and its impact]

## Root Cause
[Technical root cause — be specific about the file, function, and line]

## Timeline
- HH:MM — First alert / user report
- HH:MM — Engineer engaged
- HH:MM — Root cause identified
- HH:MM — Fix applied
- HH:MM — Verified resolved

## Fix Applied
[What was changed and why]

## Prevention
[What will prevent this from happening again]
```

---

## Emergency Contacts

| Role | Responsibility |
|---|---|
| Lead Engineer (Tavonga Shoko) | Architecture, pipeline, intelligence engines |
| Platform Admin | Tenant management, user roles, system configuration |
| Insurer Admin | Tenant-level configuration, user management within their tenant |

---

## Key DB Queries Reference

```sql
-- Find all claims in a failed state
SELECT id, claim_number, status, document_processing_status, created_at
FROM claims WHERE status IN ('document_failed', 'failed')
ORDER BY created_at DESC LIMIT 20;

-- Find claims stuck in pipeline for >1 hour
SELECT c.id, c.claim_number, c.status, a.status as assessment_status, a.updated_at
FROM claims c JOIN ai_assessments a ON a.claim_id = c.id
WHERE a.status = 'in_progress' AND a.updated_at < NOW() - INTERVAL 1 HOUR;

-- Check pipeline stage completion for a claim
SELECT stage_name, status, started_at, completed_at, error_message
FROM pipeline_stage_runs psr
JOIN pipeline_runs pr ON pr.id = psr.run_id
WHERE pr.claim_id = <claim_id>
ORDER BY psr.started_at;

-- Check recent tenant isolation violations
SELECT procedure_name, caller_open_id, attempted_tenant_id, created_at
FROM tenant_isolation_violations
ORDER BY created_at DESC LIMIT 20;

-- Check notification delivery for a user
SELECT title, message, read_at, created_at
FROM notifications WHERE user_id = <user_id>
ORDER BY created_at DESC LIMIT 10;
```
