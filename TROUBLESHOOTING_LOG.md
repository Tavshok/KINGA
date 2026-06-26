# KINGA Image Display Troubleshooting Log

**Started:** 2026-06-26
**Issue:** (A) KINGA Claims Report shows blank image boxes. (B) Forensic Audit Report shows 0 photos detected/analysed.

---

## Session 1 — Code Audit + DB Queries (2026-06-26)

### Files Already Read — DO NOT Re-Read

| File | Lines Read | Key Finding |
|---|---|---|
| `server/storage.ts` | Full file | `storagePut()` uploads to Manus Forge proxy, returns a URL. `storageGet()` generates presigned download URL with optional `expiresInSeconds`. |
| `server/pipeline-v2/orchestrator.ts` | 760–790, 1714–1730 | Stage 2.6 sets `ctx.classifiedImages` (runtime). `buildClaimTruth()` uses `ctx.classifiedImages ?? null` and `ctlEnrichedPhotos` (parsed from `ctx.enrichedPhotosJson`). |
| `server/pipeline-v2/claimTruthLayer.ts` | 243–310 | `photoCount = damagePhotos.length`. Populated from `classifiedImages.damagePhotos` → fallback `enrichedPhotos` → fallback `claimRecord.damage.imageUrls`. |
| `client/src/components/ForensicAuditReport.tsx` | 5161–5230, 8108–8200 | `photosDetected = ctl4?.evidence?.photoCount ?? aiAssessment?.photosDetected ?? 0`. |
| `server/routers.ts` | 5895–5915 | `rawResponse` includes `enrichedPhotosJson`, `damagePhotosJson`, `imageAnalysisTotalCount`. Read from DB as-is, no URL refresh. |
| `drizzle/schema.ts` (inferred) | — | Actual DB columns: `damage_photos_json`, `enriched_photos_json`, `photo_inconsistencies_json`, `image_analysis_total_count`, `image_analysis_success_count`, `image_analysis_failed_count`, `image_analysis_success_rate`, `photo_classification_json`, `claim_truth_json`. **No `photos_detected` column** — that was a wrong assumption. |

---

## DB Query Results (confirmed 2026-06-26)

### Q1 — Sample URL from `enriched_photos_json` (assessment id=10440002)

```
https://d2xsxph8kpxj0f.cloudfront.net/310419663031527958/YbS42LwGroxbVepAMjk4bS/
  tenant-1771335377063/ingestion/533bd3d3-7a7a-4ebf-a98b-97d27e284273/
  b217fd68-665a-4d81-a408-00ec4cff1714-VOLTRON%20MINE%20COR%206002812%20%281%29.pdf#page=12
```

**Findings:**
- URL is a **CloudFront CDN URL** — permanent, no expiry params. H1 (URL expiry) is **DISPROVED**.
- URL ends with `#page=12` — it is a **PDF fragment URL**, not a direct image URL.
- A browser `<img src="...pdf#page=12">` cannot render a PDF page — it renders blank.
- **CONFIRMED: Issue A root cause is PDF fragment URLs stored instead of extracted image URLs.**

### Q2 — `image_analysis_total_count` vs `enriched_count` vs `damage_count`

| id | claim_id | image_analysis_total | image_analysis_success | enriched_count | damage_count |
|---|---|---|---|---|---|
| 10440002 | 8400001 | 9 | 9 | 9 | 9 |
| 10440001 | 8370001 | 7 | 7 | 7 | 7 |
| 10380001 | 8340001 | 10 | 10 | 10 | **0** |

**Findings:**
- `image_analysis_total_count` matches `enriched_count` for all rows — image analysis ran correctly.
- Row 10380001: `damage_count=0` despite `enriched_count=10` — `damage_photos_json` not populated for that run.

### Q3 — `claim_truth_json.evidence.photoCount`

| id | ctl photoCount | ctl damagePhotos populated? |
|---|---|---|
| 10440002 | populated (URLs in array) | YES — CTL has photos |
| 10440001 | populated (URLs in array) | YES — CTL has photos |
| 10380001 | **0** (damagePhotos = []) | NO — CTL empty |

**Findings:**
- For 10380001: `claim_truth_json.evidence.photoCount = 0` and `damagePhotos = []` even though `enriched_photos_json` has 10 entries.
- For 10440001 and 10440002: CTL IS populated with correct URLs.
- The CTL URLs are the **same PDF fragment format** as `enriched_photos_json` — same root cause.

---

## Confirmed Root Causes

### Issue A — KINGA Claims Report: blank image boxes

**CONFIRMED ROOT CAUSE:** `enriched_photos_json` and `claim_truth_json.evidence.damagePhotos` store **PDF page fragment URLs** (`.pdf#page=N`), not extracted image URLs. Browser `<img>` tags cannot render PDF fragments — they render blank.

**Where the bug is:** In the pipeline's image extraction/enrichment stage, the `url` field stored in `enrichedPhotosJson` is the **source PDF page URL**, not the URL of an extracted/uploaded image file. The pipeline should be uploading the extracted image (PNG/JPG) to S3 via `storagePut()` and storing the returned image URL instead.

**Next step needed:** Find where `enrichedPhotosJson` entries are constructed in the pipeline — specifically where the `url` field is set — to confirm whether `storagePut` is called and whether its return value is used.

### Issue B — Forensic Audit Report: 0 photos (assessment 10380001 only)

**CONFIRMED ROOT CAUSE:** For assessment 10380001, `buildClaimTruth()` ran with both `classifiedImages = null` and `ctlEnrichedPhotos = []`. The `ctlEnrichedPhotos` fallback reads from `ctx.enrichedPhotosJson` which was empty at CTL build time — likely a stage ordering issue where `enriched_photos_json` was written to DB after CTL ran, or `ctx.enrichedPhotosJson` was not set before `buildClaimTruth()` was called.

**For 10440001 and 10440002:** CTL IS populated — these runs had `ctx.classifiedImages` set (Stage 2.6 ran and populated it in memory before CTL).

**Note:** Even when CTL IS populated (10440001, 10440002), the URLs are still PDF fragments — so Issue A affects ALL assessments, while Issue B only affects runs where Stage 2.6 classifier did not run.

---

## Additional Confirmed Findings (2026-06-26 — Stage 6 code trace)

### URL format — CONFIRMED: S3 PNG URLs, NOT PDF fragment URLs

`pdfToImages.ts` line 230: `const { url, key } = await storagePut(s3Key, pngBuf, "image/png")` — each PDF page is rendered to PNG via pdftoppm and uploaded to S3. The returned URL is a proper PNG image URL.

The DB sample URL ending in `.pdf#page=12` is from `claim_truth_json.evidence.damagePhotos` (CTL layer), NOT from `enrichedPhotosJson`. The CTL layer uses `ctx.damagePhotoUrls` as its photo source (line 2614: `imageUrls: ctx.damagePhotoUrls || []`). `ctx.damagePhotoUrls` is populated from `claims.damagePhotos` (the raw cached photo list from the claims table), which stores the original PDF page CDN URLs — NOT the rendered PNG S3 URLs.

**REVISED ROOT CAUSE — Issue A:**
- `enrichedPhotosJson` (Stage 6 output) — contains correct S3 PNG URLs ✅
- `claim_truth_json.evidence.damagePhotos` (CTL layer) — contains PDF fragment CDN URLs ❌
- `damage_photos_json` (DB column) — contains PDF fragment CDN URLs ❌ (populated from `claims.damagePhotos` raw cache)

The report components read from `damage_photos_json` / `claim_truth_json.evidence.damagePhotos` (PDF fragment URLs) instead of `enriched_photos_json` (correct S3 PNG URLs).

**The fix is in the report rendering layer:** use `enrichedPhotosJson` (which has correct PNG URLs) as the image source, not `damagePhotosJson` or CTL `damagePhotos`.

### Issue B — Forensic Report 0 photos (assessment 10380001)

`claim_truth_json.evidence.photoCount = 0` and `damagePhotos = []` for 10380001 even though `enriched_photos_json` has 10 entries. This is the same root cause: CTL uses `ctx.damagePhotoUrls` (PDF fragment URLs from claims table cache), not `ctx.enrichedPhotosJson` (Stage 6 output). For 10380001, `ctx.damagePhotoUrls` was empty (no cached photos in claims table), so CTL had 0 photos.

For 10440001 and 10440002: `ctx.damagePhotoUrls` was populated (photos were cached from a previous run), so CTL had photos — but they were still PDF fragment URLs.

**The fix is the same:** CTL should use `enrichedPhotosJson` (Stage 6 output with real PNG URLs) as the authoritative photo source, not `damagePhotoUrls`.

## Fixes Required (REVISED)

| # | Fix | File(s) | Approach |
|---|---|---|---|
| F1 | KINGA Claims Report: use `enrichedPhotosJson` (S3 PNG URLs) as image source instead of `damagePhotosJson` (PDF fragment URLs) | `client/src/components/KingaClaimsReport.tsx` | Find where photo URLs are read for the damage photos grid; switch from `damagePhotosJson`/CTL `damagePhotos` to `enrichedPhotosJson` entries | 
| F2 | Forensic Report: use `enrichedPhotosJson` photo count and URLs for Section 4 Evidence instead of CTL `evidence.photoCount`/`damagePhotos` | `client/src/components/ForensicAuditReport.tsx` Section4Evidence | Read `aiAssessment.enrichedPhotosJson` directly; use its length as `photosDetected` and its entries as the photo list |
| F3 | Pipeline: update CTL `buildClaimTruth` to use `enrichedPhotosJson` (Stage 6 output) as the authoritative photo source, not `damagePhotoUrls` | `server/pipeline-v2/orchestrator.ts` lines 1713–1726 | After Stage 6 runs, pass `ctx.enrichedPhotosJson` to CTL; update `claimTruth.evidence.damagePhotos` with enriched photo entries (PNG URLs + metadata) |

**Priority:** F1 and F2 are frontend-only fixes that will immediately fix the visible issue for all existing assessments. F3 is a pipeline fix that ensures future runs have correct CTL data.
| F2 | Ensure `ctlEnrichedPhotos` is populated from `enriched_photos_json` DB value before `buildClaimTruth()` runs, as a fallback when `ctx.classifiedImages` is null | `server/pipeline-v2/orchestrator.ts` | Check stage ordering; ensure `ctx.enrichedPhotosJson` is set from DB before CTL stage |
| F3 | Populate `damage_photos_json` from `enriched_photos_json` for runs where it is empty (10380001 pattern) | `server/pipeline-v2/orchestrator.ts` or `server/db.ts` | After enrichment stage, if `damage_photos_json` is empty but `enriched_photos_json` is not, copy enriched to damage |

---

## What NOT to Re-Check (already confirmed)

- H1 (URL expiry) — **DISPROVED**. URLs are permanent CloudFront CDN URLs.
- `storage.ts` — fully read. Do not re-read.
- `orchestrator.ts` lines 1714–1760 — `buildClaimTruth` call site fully read. Do not re-read.
- `claimTruthLayer.ts` lines 243–310 — `photoCount` logic fully read. Do not re-read.
- `ForensicAuditReport.tsx` lines 5161–5230 — `Section4Evidence` fully read. Do not re-read.
- `routers.ts` lines 5895–5915 — `rawResponse` construction fully read. Do not re-read.
- Portal isolation fix — **complete** (checkpoints f5da3571, b6b56fd6, bc8668d5). Do not revisit.
- Buried features fix (re-run, report dropdown, assign assessor) — **complete** (checkpoint 0bedab41). Do not revisit.

---

## Fixes Applied (2026-06-26)

### Root Cause (confirmed)
The `pdf_single_pass_vision` pipeline path stored PDF fragment URLs (`https://...pdf#page=12`) verbatim in `enrichedPhotosJson`. Browser `<img src="...pdf#page=12">` cannot render PDF fragments → blank image boxes in both reports.

### Fix 1 — `server/routers.ts` — `aiAssessments.resolvePdfPhotoUrls` procedure (new)
- Accepts `{claimId, photos: [{index, url, pageNumber?}]}`. Detects PDF fragment URLs, groups by base PDF URL, calls `renderSpecificPdfPages()` for each group, uploads rendered PNGs to S3, returns fresh PNG URLs.
- Writes resolved PNG URLs back to `enrichedPhotosJson` in DB so future page loads skip the resolution step.

### Fix 2 — `client/src/pages/InsurerComparisonView.tsx` — Resolution mutation on mount
- After `aiAssessment` loads, checks if any URL in `enrichedPhotosJson` matches `/\.pdf#page=\d+$/i`.
- If yes, calls `trpc.aiAssessments.resolvePdfPhotoUrls.useMutation()` with all photo entries.
- Stores resolved URLs in `resolvedPhotos` state and passes `resolvedPhotosOverride` to both report components.

### Fix 3 — `client/src/components/KingaClaimsReport.tsx` — `resolvedPhotosOverride` prop
- Accepts `resolvedPhotosOverride?: Array<{index, url, resolved}>`. Builds a `Map<index, pngUrl>` and swaps URLs when building `enrichedPhotos` array.

### Fix 4 — `client/src/components/ForensicAuditReport.tsx` — `resolvedPhotosOverride` prop
- Same as Fix 3. Prop is threaded through to `Section4Evidence` sub-component which contains the `enrichedPhotosFAR` photo grid.

### Fix 5 — `server/pipeline-v2/stage-6-damage-analysis.ts` — Permanent pipeline fix
- In the single-pass vision fallback path, after the LLM identifies damage pages, immediately calls `renderSpecificPdfPages()` on those page numbers.
- Uses rendered PNG URLs in `enrichedPhotoSummary` instead of `${pdfUrl}#page=N`.
- Falls back to fragment URL if rendering fails (non-fatal). Source field: `"pdf_single_pass_then_render"` when PNG render succeeds.
- **Effect:** Future pipeline runs will store renderable PNG URLs from the start.
