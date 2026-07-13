# Image Classification Benchmark — Phase B

## Purpose

Provide a ground-truth labeled dataset for evaluating and calibrating `imageClassifier.ts` and `imageIntelligence.ts` against real production images. This is the prerequisite for fixing P3 (physics confidence degraded for PDF-embedded damage photos) with evidence rather than assumption.

## Background

As of July 2026, `photo_classification_json` is never populated in `ai_assessments` (0 rows). The only production run with image analysis is VOLTRON (assessment 12930001), which used the Stage 2.6 classifier path and correctly classified PDF-embedded damage photos as `damage_photo` at MEDIUM confidence. The `visionSourceReliability=LOW` bug exists in the Stage 6 fallback path (when Stage 2.6 puts photos in the fallback pool rather than `damagePhotoUrls`) but has not yet fired in a stored result.

## Phase B-1: Manual Image Tagging (pre-launch)

**Goal:** Build a labeled dataset of 200–400 images from real production assessments.

**Source:** Query `ai_assessments` for rows with `damage_photos_json` populated (currently 30 rows). Extract all image URLs. Download and hand-tag each image.

**Labels:**

| Label | Description |
|---|---|
| `genuine_damage_photo` | Clear photograph of vehicle damage — dents, scratches, crumple, broken glass, etc. |
| `vehicle_overview` | Photo of the whole vehicle, damage not the primary subject |
| `document_page` | Scanned or photographed document page (police report, form, letter) |
| `quotation_scan` | Repair quotation or invoice scan |
| `pdf_page_with_embedded_damage_photo` | PDF page render that contains a damage photo embedded within it |
| `pdf_page_document_only` | PDF page render containing only text/tables, no vehicle imagery |
| `other` | Anything not in the above categories |

**Confidence annotation:**

For each image, also record the tagger's confidence: `HIGH` (unambiguous), `MEDIUM` (likely but uncertain), `LOW` (could be multiple categories).

## Phase B-1 Output

`image-classification-labels.json` — see schema below.

## Phase B-2: Evaluation (post-launch)

Run `imageClassifier.ts` and `imageIntelligence.ts` against the labeled dataset. Compute precision/recall/F1 per category. Compare against ground truth.

## Phase B-3: Threshold Tuning (post-launch)

Based on Phase B-2 results, adjust scoring weights in `imageIntelligence.ts` (`scoreDamageLikelihood`) and classification thresholds in `imageClassifier.ts`. Re-run evaluation. Iterate until F1 ≥ 0.85 for `genuine_damage_photo` and `pdf_page_with_embedded_damage_photo`.

## Label File Schema

```json
{
  "version": "1.0",
  "created": "2026-07-13",
  "description": "Ground-truth labels for imageClassifier.ts and imageIntelligence.ts evaluation",
  "labels": [
    {
      "url": "https://...",
      "assessmentId": 12930001,
      "claimId": 8880001,
      "groundTruth": "pdf_page_with_embedded_damage_photo",
      "taggerConfidence": "HIGH",
      "notes": "Page 3 of VOLTRON PDF — clear frontal damage photo embedded in document"
    }
  ]
}
```

## Extraction Script

Run `node server/pipeline-v2/benchmarks/extract-images-for-tagging.mjs` to produce a CSV of all image URLs from `ai_assessments` rows with `damage_photos_json` populated. Open the CSV in a spreadsheet, add the `groundTruth` and `taggerConfidence` columns, then convert to JSON using `node server/pipeline-v2/benchmarks/csv-to-labels.mjs`.
