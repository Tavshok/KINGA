# 08 — How to Verify Changes

## The Standard

A fix is verified when you can show a real before/after pipeline output on a reference claim — not just passing unit tests. Unit tests verify logic in isolation; the pipeline is a complex multi-stage system where a change in one stage can have non-obvious downstream effects.

---

## Reference Claim Setup

The system includes a built-in claim simulator (`server/routers/simulation.ts`) that creates synthetic test claims with known characteristics. Use this for verification — never use real customer data.

### Creating a Test Claim

1. Log in as an admin or claims processor
2. Navigate to the Platform Simulator (admin portal → Platform → Simulator)
3. Select a claim template (e.g., "Standard rear-end collision", "High-value comprehensive claim")
4. The simulator creates a claim with `claimSource='simulator'` and `status='intake_pending'`
5. The pipeline triggers automatically via `setImmediate`

Alternatively, upload a synthetic PDF via the processor dashboard upload button.

### What to Check After a Pipeline Run

After the pipeline completes, verify the following in the database (use the Pipeline Observability page or direct SQL):

```sql
SELECT 
  c.claim_number,
  c.status,
  c.workflow_state,
  c.document_processing_status,
  c.pipeline_current_stage,
  c.ai_assessment_triggered,
  c.ai_assessment_completed,
  c.recovery_retry_count,
  a.recommendation,
  a.fraud_risk_level,
  a.confidence_score,
  a.estimated_cost,
  JSON_LENGTH(a.pipeline_run_summary) as summary_stages
FROM claims c
LEFT JOIN ai_assessments a ON a.claim_id = c.id
WHERE c.claim_number = 'DOC-YYYYMMDD-XXXXXXXX'
ORDER BY a.created_at DESC
LIMIT 1;
```

Expected values for a successful run:
- `status = 'analysis_complete'`
- `document_processing_status = 'DOCUMENT_COMPLETE'`
- `pipeline_current_stage = NULL` (cleared on completion)
- `ai_assessment_triggered = 1`
- `ai_assessment_completed = 1`
- `recovery_retry_count = 0` (or 1 if it was retried once)
- `recommendation` is one of: `APPROVE`, `REVIEW`, `REJECT`, `ESCALATE`, `NEGOTIATE`, `PROCEED_TO_ASSESSMENT`
- `confidence_score` between 0 and 100
- `summary_stages >= 10` (at least 10 stages ran)

---

## Verifying a Pipeline Stage Change

If you modify a pipeline stage, run the pipeline on at least two reference claims and compare the before/after output:

1. **Before:** Note the current output of the affected stage from `ai_assessments` (the relevant JSON column)
2. **Apply your change**
3. **Re-run:** Use the "Run KINGA" button in the claim detail view (or the manual trigger script at `server/scripts/test-pipeline-trigger.ts`)
4. **After:** Check the same JSON column in the new `ai_assessments` row (re-analysis creates a new row with `isReanalysis=1`)
5. **Compare:** Verify the output changed in the expected direction

### Manual Pipeline Trigger Script

```bash
cd /home/ubuntu/kinga-replit
npx tsx server/scripts/test-pipeline-trigger.ts <claimId>
```

This script runs the pipeline synchronously (not via `setImmediate`) and prints verbose output to stdout. It is safe to run in development — it creates a new `ai_assessments` row with `isReanalysis=1`.

---

## Running Unit Tests

```bash
cd /home/ubuntu/kinga-replit
pnpm test
```

The test suite uses Vitest. Test files are co-located with their modules (`server/*.test.ts`, `server/routers/*.test.ts`).

Key test files:
- `server/accidentPhysics.test.ts` — Physics engine unit tests
- `server/advancedPhysics.test.ts` — Advanced physics scenarios
- `server/assessment-processor.test.ts` — Assessment processor
- `server/auth.logout.test.ts` — Auth flow reference test
- `server/workflow-queries.test.ts` — Workflow query tests

**Rule:** Unit tests are required for new procedures and new pipeline stages. A PR that adds a stage without a test will not be merged.

---

## Verifying a Recovery Job Change

The recovery job runs every 10 minutes. To test a change immediately:

1. Create a claim in the target state (e.g., `document_failed`) directly via SQL or the simulator
2. Restart the server (the startup sweep runs on every start and will pick up `intake_pending` claims)
3. Or wait up to 10 minutes for the next recovery job cycle
4. Check the server logs for the recovery job output: `[RecoveryJob] CASE N: ...`

To force an immediate recovery job run without restarting:

```bash
# In the server logs, look for the recovery job interval ID
# There is no manual trigger endpoint — restart the server instead
```

---

## Verifying a Dashboard/UI Change

1. Open the processor dashboard in the browser
2. Check the "Pending" tab — it should show claims with `status` in: `intake_pending`, `document_failed`, `submitted`, `triage`, `assessment_pending`, `human_review_required`
3. Check the "In Review" tab — it should show claims with `status` in: `document_validating`, `analysis_running`, `document_ready`, `assessment_in_progress`
4. Check the "KINGA Complete" tab — it should show claims with `status` in: `analysis_complete`, `assessment_complete`

If a claim is not appearing in the expected tab, check:
1. The claim's `tenantId` matches the logged-in user's `tenantId`
2. The claim's `status` is in the query's status list (check `ClaimsProcessorDashboard.tsx` and `getClaimsByStatus` in `server/routers/workflow-queries.ts`)
3. The claim is not filtered out by the search/filter controls

---

## Verifying a Schema Change

1. Edit `drizzle/schema.ts`
2. Run `pnpm db:push` — this generates and applies the migration
3. Verify the migration ran: check `drizzle/migrations/` for a new file
4. Verify the column exists in the DB: use the Database panel in the Management UI or run a direct SQL query
5. Update any `@ts-nocheck` files that reference the changed table to use the new column name

**Warning:** `pnpm db:push` is destructive for column renames and drops. Always back up the DB before running it in production. In development, data loss is acceptable.
