# KINGA Platform — Change Log

All significant changes to the KINGA codebase are documented here in reverse-chronological order.
Each entry records: **what** changed, **why** it was changed, **which files** were touched, and the **checkpoint version** if applicable.

---

## [Unreleased] — 2026-05-18 — ProtectedRoute Infinite Spinner Fix

### Bug Fix: "Verifying access..." infinite spinner after OAuth login
- **Root cause:** `ProtectedRoute.tsx` created a second `trpc.auth.me.useQuery` with `enabled: false` and checked `meQuery.isLoading` as an `isRetrying` guard. In **React Query v5**, a disabled query is permanently in `"pending"` state — `isLoading` is always `true` and never resolves. This caused every `ProtectedRoute`-wrapped page (including `/portal-hub`, the post-login landing page) to show the spinner indefinitely after a successful OAuth login.
- **Fix:** Removed the redundant disabled query from `ProtectedRoute.tsx`. The `useAuth()` hook already handles retry logic with correct `isLoading` state management (it retries on 5xx/network errors, does not retry on 401, and uses cached localStorage user during retries to prevent spurious redirects). `ProtectedRoute` now only reads `loading` from `useAuth()`, which correctly resolves to `false` once `auth.me` settles.
- **Files changed:** `client/src/components/ProtectedRoute.tsx`

---

## [6fcbf96b] — 2026-05-18 — Stage 2.7 Embedded Quote Extraction + Heuristic Calibration

### Feature: Stage 2.7 — Embedded Quote Extraction from Quotation Scan Images
- **Problem:** Many SA insurance claim PDFs contain repair quotes embedded as raster images (e.g. a Swiss Motors invoice scanned and embedded as a JPEG inside the PDF). Stage 2 OCR cannot read these — they are not text. Stage 3 therefore only extracted quotes from text-readable content, missing any quote that was embedded as an image. Stage 9 (cost optimisation) received only 1 quote and could not perform multi-quote spread analysis.
- **Implementation:** New Stage 2.7 in `orchestrator.ts` runs after Stage 2.6 (image classifier). It reads `ctx.classifiedImages.quotationImages` (images classified as `quotation_scan` by Stage 2.6) and calls `extractQuoteFromImageUrl()` (new function in `quoteExtractionEngine.ts`) on each one. Extracted quotes are merged into `stage3Data.inputRecovery.extracted_quotes` with deduplication by panel_beater name (image extraction replaces OCR extraction only if it yields more priced line items). Up to 5 quotation images are processed per run (cost guard).
- **New function:** `extractQuoteFromImageUrl(imageUrl, panelBeaterHint, totalCostHint, country)` in `quoteExtractionEngine.ts` — sends a single image URL to the LLM with the same structured JSON schema used by `extractQuoteFromPdfVision`, but scoped to a single image rather than a full PDF URL.
- **Heuristic calibration fix:** `pdfEmbeddedImages.ts` `estimateQualityFromGeometry()` updated to use **pixel area > 0.8MP** as the primary `isTextHeavy` signal (previously used aspect ratio < 0.7 only). Calibrated against Voltron PDF: Swiss Motors invoice (1273×1800 = 2.29MP) now correctly flagged as `isTextHeavy=true`; damage photos (641×641 = 0.41MP) correctly flagged as `isTextHeavy=false`.
- **Verified on claim 6240003 (ISUZU MUX / Voltron):**
  - Stage 2.6: 6 quotation scan images detected (up from 1 in previous run)
  - Stage 2.7: Swiss Motors invoice extracted — 23 line items, total = USD 25,553, confidence = high
  - Stage 3 total quotes: 2 (Cedric Jonker + Swiss Motors)
  - Stage 9: `2 quotes (best: Cedric Jonker Spraypaints)` — DOE selected lower-cost option correctly
- **Files changed:** `server/pipeline-v2/orchestrator.ts` (Stage 2.7 block), `server/pipeline-v2/quoteExtractionEngine.ts` (`extractQuoteFromImageUrl`), `server/pipeline-v2/pdfEmbeddedImages.ts` (heuristic calibration)

---

## [0318ead0] — 2026-05-18

### Fix: IMAGE_PIPELINE_FAILURE gate — embedded images now route through Stage 2.6 classifier
- **Problem:** `pdfEmbeddedImages.ts` was merging all extracted images (damage photos AND full-page quote scans) directly into `ctx.damagePhotoUrls`. Since `ctx.extractedImagesWithMetadata` was not populated, Stage 2.6 (image classifier) was bypassed entirely. All 26 embedded images from the Voltron PDF went to Stage 6 damage analysis unfiltered, including 11 full-page quote scans that are not damage photos.
- **Root cause of IMAGE_PIPELINE_FAILURE:** The `_photosAvailable` check in orchestrator.ts reads `(ctx.damagePhotoUrls ?? []).length > 0`. For PDF-only claims with no separate photo uploads, this was always `false` before embedded image extraction was added. Now that embedded images populate `ctx.damagePhotoUrls`, the gate correctly sees photos as available.
- **Fix 1 (routing):** `pdfEmbeddedImages.ts` now computes `EmbeddedImageClassifierInput` metadata for each extracted image using heuristic geometry analysis: tall narrow images (aspect < 0.7) are flagged as `isTextHeavy=true` (quote scans), square-ish images (0.7–1.5) are flagged as `isTextHeavy=false` (damage photos). This metadata is stored on each `EmbeddedImageInfo` as `classifierInput`.
- **Fix 2 (Stage 1 integration):** Stage 1 now populates `ctx.extractedImagesWithMetadata` with the classifier inputs from embedded images. Stage 2.6 will classify them: damage photos → `ctx.damagePhotoUrls`, quotation scans → `quotation_scan` category (not sent to Stage 6). A safety-net copy of all URLs is still placed in `ctx.damagePhotoUrls` in case Stage 2.6 is skipped.
- **Files changed:** `server/pipeline-v2/pdfEmbeddedImages.ts`, `server/pipeline-v2/stage-1-ingestion.ts`

---

## [80fbe632] — 2026-05-18

### Fix: Stage 3 Hallucination Guard — Expanded SA Repair Terms Passthrough List
- **Problem:** Valid South African workshop line items such as `"fittings"`, `"clips"`, `"regas"`, `"reprograme"`, `"focus lights"`, `"camber bolts"`, `"wind deflector"`, `"abs module"`, `"airbag module"`, `"tyre"`, `"supply"`, and `"repairs"` were being rejected by the hallucination guard in `quoteExtractionEngine.ts` because they were not in the `NON_PART_LINE_ITEM_CATEGORIES` set. This caused valid line items to be flagged as hallucinations and dropped from the extracted quote.
- **Fix:** Expanded `NON_PART_LINE_ITEM_CATEGORIES` with five new groups: (1) hardware/fasteners (fittings, clips, bolts, washers, rivets, screws, adhesive, sealant, grommets, bushings), (2) repair operations (repairs, strip, regas, reprogramme, weld, welding, panel beating), (3) electrical/mechanical service items (focus lights, abs module, airbag module, ecu), (4) suspension/steering items (camber bolts, camber kit), (5) trim/hardware (wind deflector, step, tyre, spare wheel), and (6) financial/admin items (discount, delivery, supply).
- **Files changed:** `server/pipeline-v2/quoteExtractionEngine.ts`

### Fix: Stage 1 PDF Rendering — Increase page cap from 8 to 25 at 100 DPI
- **Problem:** The page cap in `pdfToImages.ts` was hardcoded to 8 pages (`SAFE_MAX_PAGES = 8`). For the Voltron PDF (32 pages), this meant pages 9–32 were never rendered — the repair quotes on those pages were not available to Stage 2 (OCR) as page images. The DPI was 150, which at 25 pages would exceed Cloud Run's 512MB RAM limit.
- **Fix:** Increased `SAFE_MAX_PAGES` from 8 to 25 and reduced default DPI from 150 to 100. At 100 DPI, 25 A4 pages use ~200MB RAM — well within the 512MB Cloud Run limit. Updated default values in `PdfToImagesOptions` interface and function signature accordingly.
- **Files changed:** `server/pipeline-v2/pdfToImages.ts`

### Feature: PDF Embedded Image Extraction — pdfimages (poppler-utils)
- **Problem:** Many SA insurance claim PDFs contain damage photos and scanned repair quotes embedded as raster images (JPEG/PNG) inside the PDF. These are the original full-resolution images captured by the assessor or workshop. The pipeline was not extracting them — Stage 6 (damage analysis) had no visual evidence unless separate photo uploads were provided.
- **Implementation:** New module `pdfEmbeddedImages.ts` uses `pdfimages -j -png` (poppler-utils) to snip embedded raster images out of the PDF. Images are filtered by: (1) min 200×200 pixels (excludes logos/icons), (2) min 8KB file size (excludes placeholder images). Qualifying images are uploaded to S3 under `claims/{claimId}/embedded-photos/{pdfHash}/img-NNN.jpg`. Stage 1 (`stage-1-ingestion.ts`) calls `extractEmbeddedImagesFromUrl()` after PDF download and merges the extracted image URLs into `ctx.damagePhotoUrls`, making them available to Stage 6 damage analysis.
- **Filtering verified on Voltron PDF:** 26 images extracted (11 full-page quote scans + 15 damage photos), 21 small icons/logos correctly filtered out.
- **Files changed:** `server/pipeline-v2/pdfEmbeddedImages.ts` (new), `server/pipeline-v2/stage-1-ingestion.ts`

---

## [ec364cd3] — 2026-05-18

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
