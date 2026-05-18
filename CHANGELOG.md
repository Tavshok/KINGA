# KINGA Platform — Change Log

All significant changes to the KINGA codebase are documented here in reverse-chronological order.
Each entry records: **what** changed, **why** it was changed, **which files** were touched, and the **checkpoint version** if applicable.

---

## [Pending checkpoint] — 2026-05-18

### Fix: Stage 1 PDF Rendering — Replace pdf.js with pdftoppm
- **Problem:** `pdf.js` requires `GlobalWorkerOptions.workerSrc` which cannot be set in a Node.js server environment. Stage 1 always failed to render PDF pages to images, logging `"No GlobalWorkerOptions.workerSrc specified"`. This meant 0 page images were uploaded to S3, causing Stage 7 (physics/damage) to run without visual evidence and Stage 12.5 to block report export with `IMAGE_PIPELINE_FAILURE`.
- **Fix:** Replaced the `pdf.js` renderer in Stage 1 with a `pdftoppm` shell command (from `poppler-utils`, pre-installed). Pages are rendered at 150 DPI, capped at 8 pages to stay within Cloud Run memory limits.
- **Files changed:** `server/pipeline-v2/pdfToImages.ts`
- **Verified:** Claim 6240003 (ISUZU MUX / Voltron) re-run: Stage 1 logged `pdftoppm rendered 8 page(s)` and uploaded all 8 pages to S3 successfully.

### Fix: Stage 2 OCR — Chunked PDF extraction for large files
- **Problem:** `extractTextFromPdfChunked()` in Stage 2 had a logic bug: it checked `pageImageUrls.length > 0` but the variable was always empty because Stage 1 stored the URLs in `ctx.pdfPageImageUrls` (not passed to Stage 2). The function always fell back to full-PDF `file_url` extraction which timed out on large scanned PDFs (32 pages, 4.5MB).
- **Fix:** `extractTextFromPdfChunked()` now correctly receives `pageImageUrls` from the caller (Stage 2 reads `ctx.pdfPageImageUrls` and passes them in). When images are available, it splits them into 4-page chunks, sends each chunk to the LLM as image_url messages, and merges the extracted text.
- **Files changed:** `server/pipeline-v2/stage-2-extraction.ts`
- **Verified:** Claim 6240003 re-run: Stage 2 logged `[chunked-images] 8 page image(s) available — using chunked image extraction (4 pages/chunk)` and completed in 64.8s (previously timed out). All 10 stages completed, 28/28 line items priced, total = USD 21,979.00.

---

## [c31a33bc] — 2026-05-15

### Fix: Login redirect loop on server cold start
- **Problem:** When the deployed Cloud Run server cold-started (min-instances=0), `auth.me` would fail with a network error. `ProtectedRoute` immediately redirected to `/login`. The Login page showed "Already Logged In" (cookie still valid). Clicking "Continue to Dashboard" triggered another `auth.me` call on a still-warming server → loop repeated indefinitely.
- **Fix:** `useAuth` now retries `auth.me` up to 3 times with exponential backoff (1s → 2s → 4s) on network/5xx errors. On 401 it fails immediately (genuine logout). During retries, the last known user from `localStorage` is used so a loading spinner shows instead of a redirect. `ProtectedRoute` holds the spinner while the query is retrying.
- **Files changed:** `client/src/_core/hooks/useAuth.ts`, `client/src/components/ProtectedRoute.tsx`
- **Checkpoint:** `c31a33bc`

---

## [b3075241] — 2026-05-15

### Fix: Executive Dashboard — KINGA Savings showing Rands (ZAR) instead of USD
- **Problem:** The month-on-month comparison table in the Executive Dashboard hardcoded `unit: "R"` for the KINGA Savings row in `demoData.ts`, and the rendering code used a hardcoded `R` prefix instead of the tenant's configured currency symbol.
- **Fix:** Changed `unit` to `"USD"` in `demoData.ts` and updated the comparison table renderer in `ExecutiveDashboard.tsx` to use `currencySymbol` from `useTenantCurrency()`.
- **Files changed:** `client/src/lib/demoData.ts`, `client/src/pages/ExecutiveDashboard.tsx`
- **Checkpoint:** `b3075241`

---

## [e327f606] — 2026-05-15

### Fix: Line item pricing — all quote line items persisted with $0.00 (zero price)
- **Problem:** `ensureCostContract()` in `server/pipeline-v2/engineFallback.ts` built the Stage 9 output object field-by-field and omitted `documentedLineItems`, `quoteLineItemGapAdvisory`, and `overallLineItemCompletenessScore`. Those fields were silently dropped. `db.ts` received an empty `_stage9LineItems` array and fell back to the `damagedParts` list (component names only, no prices), resulting in all line items being persisted with `unit_price=0.00` and `line_total=0.00`.
- **Root cause confirmed by:** Adding debug logging to `normaliseLi` which showed `lineTotal(camel)=undefined line_total(snake)=undefined unit_cost=undefined` for every item.
- **Fix:** Added `documentedLineItems`, `quoteLineItemGapAdvisory`, and `overallLineItemCompletenessScore` to the `base` object in `ensureCostContract()`.
- **Verified:** Claim 6240003 (ISUZU MUX) re-run showed **19/19 priced items, total = USD 21,677.88** after fix (previously 0/27 at $0.00).
- **Files changed:** `server/pipeline-v2/engineFallback.ts`
- **Checkpoint:** `e327f606`

---

## [Prior to changelog] — 2026-05-14 and earlier

### Feature: KINGA AutoVerify AI Platform (initial build)
- Full 10-stage AI claims assessment pipeline
- Insurer portal with claims processor, executive dashboard, fraud analytics, repairer intelligence
- tRPC + React 19 + Tailwind 4 + Express 4 stack
- Manus OAuth authentication
- MySQL/TiDB database with Drizzle ORM
- S3 file storage for PDFs and images
- PDF upload with S3 pre-signed URLs
- Stage 1: Document ingestion and classification
- Stage 2: OCR text extraction
- Stage 3: Structured data extraction (vision fallback for scanned PDFs)
- Stage 4: Data validation
- Stage 5: Claim assembly
- Stage 6: Damage analysis
- Stage 7: Physics/biomechanics analysis
- Stage 8: Fraud detection (parallel with Stage 9)
- Stage 9: Cost optimisation and quote analysis
- Stage 10: Report generation
- Stage 12: Decision authority
- Stage 13: Forensic audit trail

---

## How to use this log

- **Before making any change:** add a `[Unreleased]` entry describing what you plan to change and why
- **After verifying the change works:** move it to a dated versioned entry with the checkpoint ID
- **If a change causes a regression:** refer to this log to identify which files were touched and roll back using `webdev_rollback_checkpoint` with the last known-good checkpoint ID
- **Checkpoint IDs** are 8-character git commit hashes visible in the Management UI version history
