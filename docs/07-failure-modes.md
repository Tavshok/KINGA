# 07 — Known Failure Modes and Fixes

This section is a running log of non-obvious bugs that were found and fixed. Its purpose is to prevent future engineers from reintroducing the same issues. Each entry includes the root cause, the symptom, and the fix applied.

---

## FM-001: Upload and Disappear (setImmediate killed on server restart)

**Symptom:** A claim is uploaded successfully (HTTP 200 returned, claim visible in DB), but it never appears in the "Pending" queue and the pipeline never runs. The claim's `documentProcessingStatus` is `failed` or `DOCUMENT_FAILED`.

**Root cause:** The pipeline trigger uses `setImmediate(() => triggerAiAssessment(claimId))` immediately after the HTTP response is sent. `setImmediate` is in-process memory. If the server restarts (e.g., `tsx watch` hot-reload during development, or a deployment in production) between the HTTP response and the `setImmediate` callback execution, the callback is lost. The claim is created in the DB but the pipeline never fires.

**Fix applied (July 2026):**
1. **Startup sweep (Case 12)** in `stuck-assessment-recovery-job.ts`: On every server start, finds all `intake_pending` claims with a source document and `aiAssessmentTriggered=0`, and triggers them immediately with a 500ms stagger per claim.
2. **Watchdog normalisation** in `db.ts`: The watchdog timer now sets `status='document_failed'` AND `documentProcessingStatus='DOCUMENT_FAILED'` consistently (previously it only set `dps='failed'` in some paths).

**Prevention:** Do not replace the `setImmediate` trigger with a synchronous call — it must not block the HTTP response. The startup sweep is the durability layer. In production, the startup sweep fires on every deployment, catching any claims that were in-flight during the deploy.

---

## FM-002: Thundering Herd on Startup (8 pipelines fired simultaneously)

**Symptom:** After a server restart, multiple claims are triggered simultaneously. All of them hang at Stage 1 (INGESTION) for 8+ minutes, then all fail with `document_failed`. The recovery job then re-triggers all of them simultaneously, creating a loop.

**Root cause:** The startup sweep (Case 12) fired all `intake_pending` claims at once (with only a 500ms stagger, which is insufficient when each pipeline takes ~3 minutes per stage). All 8 pipelines competed for LLM API calls, memory, and CPU, causing all of them to time out.

**Fix applied (July 2026):**
1. **Pipeline concurrency semaphore** in `db.ts`: `MAX_CONCURRENT_PIPELINES = 1`. Only one pipeline runs at a time. All other triggers queue and wait. The slot is always released in the `finally` block.
2. The startup sweep's 500ms stagger is now irrelevant for concurrency (the semaphore handles it), but is kept to avoid a burst of DB writes on startup.

**Prevention:** Never remove the semaphore. Never increase `MAX_CONCURRENT_PIPELINES` above 2 without load testing on the production hardware (Cloud Run, 1 vCPU, 512 MiB RAM).

---

## FM-003: Case 7 Blind Spot (stuck claims not recovered)

**Symptom:** Claims stuck in `analysis_running`, `document_validating`, or `document_ready` status for hours. The recovery job reports "No stuck claims found" and does not reset them. The claims remain permanently stuck.

**Root cause:** Case 7 in `stuck-assessment-recovery-job.ts` only queried for `status = 'assessment_in_progress'`. The pipeline uses `analysis_running`, `document_validating`, and `document_ready` as intermediate statuses — none of which Case 7 watched.

**Fix applied (July 2026):** Case 7 now covers ALL pipeline-running statuses:
- `assessment_in_progress`
- `analysis_running`
- `document_validating`
- `document_ready`
- `recovery_attempted`

**Prevention:** Whenever a new pipeline-running status is added to the schema, add it to Case 7's status list in the recovery job.

---

## FM-004: Claimant-Stated Speed Overwritten by Physics Engine

**Symptom:** The `claimantStatedSpeedKmh` column shows the computed physics speed, not what the claimant stated in their form. This corrupts the fraud analysis (which compares stated vs. computed speed as a fraud indicator).

**Root cause:** An early version of the Stage 7 persistence block wrote the computed speed to `claimantStatedSpeedKmh` instead of `estimatedSpeedKmh`.

**Fix applied:** The pipeline now writes:
- Computed speed → `claims.estimatedSpeedKmh` (updated on every re-analysis)
- Stated speed → `claims.claimantStatedSpeedKmh` (written once at Stage 3, never overwritten)

**Prevention:** `claimantStatedSpeedKmh` must never be written by any stage after Stage 3. If you add a new speed-related field, use a new column — do not repurpose `claimantStatedSpeedKmh`.

---

## FM-005: New Stage Output Silently Dropped (not persisted to DB)

**Symptom:** A new pipeline stage produces output visible in the logs, but the output is not in `ai_assessments` after the pipeline completes. The field is always `null` in the UI.

**Root cause:** The `PipelineResult` type in `types.ts` was not updated with the new field, and/or the persistence block in `db.ts` was not updated to write the field to `ai_assessments`.

**Fix applied (pattern):** The persistence block in `db.ts` (the `upsert` call after `runPipelineV2` returns) must be updated whenever a new stage output field is added. The checklist is:
1. Add field to `PipelineResult` interface in `server/pipeline-v2/types.ts`
2. Add column to `ai_assessments` in `drizzle/schema.ts`
3. Run `pnpm db:push`
4. Add persistence line in `db.ts` upsert block

**Prevention:** After adding a new stage, always verify the output appears in the DB by running the pipeline on a test claim and checking the `ai_assessments` row directly.

---

## FM-006: `submitted` Status Claims Not Visible in Processor Dashboard

**Symptom:** Claims submitted via the claimant portal form appear in the DB with `status='submitted'` but do not appear in the processor dashboard pending queue.

**Root cause:** The `getClaimsByStatus` procedure's status list in `ClaimsProcessorDashboard.tsx` did not include `submitted`, `triage`, or `assessment_pending`.

**Fix applied (July 2026):** Added `submitted`, `triage`, and `assessment_pending` to the dashboard query status list.

**Prevention:** Whenever a new claim source is added (new mobile app, new API integration), verify that the status it creates claims with is included in the dashboard query list.

---

## FM-007: Duplicate Pipeline Trigger (double-run on same claim)

**Symptom:** The same claim runs through the pipeline twice simultaneously. Two `ai_assessments` rows are created for the same claim. The second run overwrites the first.

**Root cause:** The `aiAssessmentTriggered` flag was set to `1` after the pipeline started (not before), creating a race window where a second trigger could fire before the flag was set.

**Fix applied:** `aiAssessmentTriggered` is now set to `1` atomically at the start of `triggerAiAssessment`, before any pipeline work begins. The function checks this flag and returns early if it is already `1`.

**Prevention:** Never call `triggerAiAssessment` directly from multiple code paths without checking `aiAssessmentTriggered` first. Use the recovery job's re-trigger path for manual re-runs.

---

## FM-008: Chromium Path Mismatch Between Modules

**Symptom:** PDF export works in development but fails in production (or vice versa). Error: `Failed to launch the browser process`.

**Root cause:** Different PDF export modules use different Chromium paths:
- `server/reporting/pdfRenderer.ts`: `/usr/bin/chromium` (hardcoded)
- `server/pdf-export.ts`: `process.env.CHROMIUM_PATH ?? '/usr/bin/chromium'`
- `server/claim-pdf-export.ts`: `/usr/bin/chromium-browser` (different binary name)

**Fix applied (partial):** The primary renderer uses `/usr/bin/chromium`. The legacy modules use `process.env.CHROMIUM_PATH` with a fallback.

**Prevention:** Set `CHROMIUM_PATH` environment variable in production to the correct binary path. Do not hardcode different paths in different modules. New PDF export code should always use `server/reporting/pdfRenderer.ts`.

---

## FM-009: Tenant Isolation Bypass via Admin Fallback

**Symptom:** An admin user uploading a document creates a claim with `tenantId = 'demo-insurance'` instead of the intended tenant.

**Root cause:** The upload endpoint falls back to `'demo-insurance'` when `user.tenantId` is null and `user.role === 'admin'`. This is intentional for the demo environment but can cause data to land in the wrong tenant in production.

**Current behaviour (by design):** Admin users without a `tenantId` get `'demo-insurance'`. This is documented in `server/upload-documents.ts`.

**Prevention:** In production, ensure all admin users have a `tenantId` set in the `users` table. The `'demo-insurance'` fallback should only be active in the demo/development environment.

---

## FM-010: Recovery Job Retry Loop (max retries not respected)

**Symptom:** A claim with a corrupted source document (e.g., password-protected PDF) is retried indefinitely by the recovery job, consuming LLM API quota.

**Root cause:** The `recoveryRetryCount` check was not applied consistently across all recovery cases.

**Fix applied:** All recovery cases (7, 11, 12) check `recoveryRetryCount < MAX_RECOVERY_RETRIES` (max 3) before re-triggering. After 3 retries, the claim is set to `human_review_required` and removed from the auto-retry queue.

**Prevention:** When adding a new recovery case, always include the `recoveryRetryCount` check and increment it on trigger.
