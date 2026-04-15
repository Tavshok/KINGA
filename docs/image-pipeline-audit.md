# KINGA Image Pipeline — Deep Architecture Audit

## Date: 2026-04-15

## Executive Summary

The image pipeline has **4 distinct subsystems** that handle images at different stages.
The critical failures stem from a **classification gap** — the system extracts images from PDFs
but does NOT classify them before passing them downstream. All extracted images (page renders,
embedded logos, damage photos, quotation scans) are treated identically as "damage photos."

---

## Architecture Trace: PDF → Damage Components

### 1. PDF Image Extraction (`server/pdf-image-extractor.ts`)
**What it does:**
- Downloads PDF, renders every page as PNG (pdftoppm)
- Extracts embedded raster images (pdfimages)
- Quality gates: min dimension, pixel area, aspect ratio, blur, text-heavy, uniform
- Uploads all passing images to S3
- Returns flat array of `ExtractedImage[]` with metadata

**Classification metadata available but NOT used downstream:**
- `source: 'page_render' | 'embedded_image'`
- `quality.isTextHeavy: boolean`
- `quality.isBlurry: boolean`
- `quality.blurScore: number`
- `quality.colourVariance: number`

**Problem:** The extractor returns rich metadata, but `db.ts` line 553-554 **strips all metadata**:
```ts
const photoImages = extractedImages.filter((img: any) => img.width >= 200 && img.height >= 200);
damagePhotos = photoImages.map((img: any) => img.url);  // ← ONLY URLs kept!
```
All classification data is lost. A text-heavy quotation page render gets the same treatment as an actual damage photo.

### 2. Stage 1 — Document Ingestion (`stage-1-ingestion.ts`)
- Re-renders PDF pages to images for "vision fallback"
- Stores 14 page image URLs in `ctx.pdfPageImageUrls`
- Ingests the 29 "damage photos" from step 1

**Problem:** Stage 1 also renders pages separately and stores them as fallback, but the 29 "damage photos" from the extractor ALREADY include page renders. So there's duplication.

### 3. Stage 6 — Damage Analysis (`stage-6-damage-analysis.ts`)
- Takes `ctx.damagePhotoUrls` (29 URLs — mix of page renders + embedded images)
- Selects up to 6 for LLM vision analysis
- Sends each to LLM with "analyse vehicle damage" prompt
- LLM correctly returns 0 components for text pages, quotation pages
- LLM returns components for actual damage photos

**Current result for BMW case:**
- 6 images sent to vision
- Image[0]: 6 components ← actual damage photo
- Image[1]: 0 components ← text page
- Image[2]: 0 components ← text page
- Image[3]: 3 components ← actual damage photo
- Image[4]: 0 components ← text page
- Image[5]: 10 components ← actual damage photo
- **10 unique components extracted — VISION ACTUALLY WORKS**

### 4. Stage 8 — Photo Forensics (`photoForensicsEngine.ts`)
- Takes `claimRecord.damage.imageUrls` (all 29 URLs)
- Caps at MAX_PHOTOS_TO_ANALYSE = 3
- Downloads each, runs Python EXIF/manipulation analysis
- Reports "Analysed 0/43 photo(s)" — the 43 comes from somewhere else

**Problem:** The "43" count comes from the forensic validator prompt (line 184-185):
```ts
const photoUrls: string[] = damage.imageUrls ?? [];
const photosProcessed = photoUrls.length;  // ← This is the TOTAL count, not "processed"
```
This is a **labelling error** — it reports the total count as "processed" but the actual photo forensics only processes 3.

---

## Root Cause Analysis

### Critical Failure 1: IMAGES_NOT_PROCESSED
**Root cause:** The forensic validator's LLM prompt says "Photos processed: 43" but the actual photo forensics engine only processes 3 (capped). The LLM sees "43 photos processed" but "0 detected" (from photo forensics, not vision) and flags it.

**The confusion:** There are TWO different image analysis paths:
1. Stage 6 Vision → processes 6 images → detects 10 components ✓
2. Stage 8 Photo Forensics → processes 3 images → EXIF/manipulation analysis (not component detection)

The forensic validator conflates these two into one "image analysis" check.

### Critical Failure 2: No Image Classification
**Root cause:** All 29 extracted images are dumped into a single `damagePhotos` array with no classification. The system cannot distinguish:
- Page renders of text-heavy form pages
- Page renders of pages containing damage photos
- Embedded damage photos (actual vehicle damage)
- Embedded logos, stamps, signatures
- Embedded quotation tables

### Critical Failure 3: Wasted LLM Calls
**Root cause:** Stage 6 sends text-heavy page renders to the LLM for "damage analysis." The LLM correctly returns 0 components, but each call costs time and tokens. 3 of 6 vision calls were wasted on text pages.

---

## Proposed Solution: Image Classification Layer

### New Component: `imageClassifier.ts`

Insert between PDF extraction and pipeline context creation. Uses the metadata already available from the extractor:

**Tier 1 — Heuristic Classification (no LLM, instant):**
- `source === 'page_render' && quality.isTextHeavy` → `document_page`
- `source === 'embedded_image' && width >= 800 && height >= 600 && !quality.isTextHeavy` → `damage_photo` (candidate)
- `source === 'embedded_image' && (width < 400 || height < 400)` → `logo_or_icon` (already filtered)
- `source === 'page_render' && !quality.isTextHeavy && quality.colourVariance > 50` → `photo_page` (page containing photos)

**Tier 2 — LLM Classification (1 call for ambiguous images):**
- Send up to 8 ambiguous images in a single LLM call
- Classify each as: `damage_photo`, `quotation`, `document_page`, `vehicle_overview`, `other`
- This replaces the current approach of sending ALL images to vision

**Output:** Classified image arrays:
```ts
{
  damagePhotos: string[],      // Only actual damage photos → Stage 6 vision
  documentPages: string[],     // Text pages → Stage 2/3 OCR only
  quotationImages: string[],   // Quotation scans → cost extraction
  vehicleOverviews: string[],  // Full vehicle shots → context
  unclassified: string[],      // Ambiguous → skip or manual review
}
```

### Changes to Downstream Stages:
1. **Stage 6:** Only receives `classifiedImages.damagePhotos` → no wasted LLM calls
2. **Stage 8 Photo Forensics:** Only receives `classifiedImages.damagePhotos` → accurate count
3. **Forensic Validator:** Reports actual damage photo count, not total extracted count
4. **Cost Model:** Can use `classifiedImages.quotationImages` for line item extraction

---

## Implementation Priority

1. **imageClassifier.ts** — heuristic + LLM classification layer
2. **db.ts** — preserve ExtractedImage metadata, pass to classifier
3. **orchestrator.ts** — wire classifier output into pipeline context
4. **stage-6-damage-analysis.ts** — use classified damage photos only
5. **forensicAuditValidator.ts** — fix image count reporting
6. **stage-8-fraud.ts** — use classified damage photos for forensics
