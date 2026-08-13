# KINGA R2 — Image Evidence Integrity and Physics Eligibility

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 13 August 2026  
**Status:** Proposed; implementation requires explicit approval  
**Scope:** Image classification provenance, crush-depth eligibility, Stage 6 image selection, persistence, and transparent CL/CI/FR presentation.

## 1. Purpose

An image label is evidential only when KINGA can explain its source, classification confidence, selection reason, and suitability for the particular analysis being performed. A document page with an incidental vehicle photo must not be treated as a crush-depth image merely because it contains damage imagery.

> **Image Integrity Principle:** KINGA may retain uncertain visual evidence and analyse eligible evidence; it may not present an unsupported zone, direction, crush-depth input, or physics conclusion as certain.

The package corrects the two proven pipeline defects in the 11 August audit: Stage 6 does not consistently enforce `suitableForCrushDepth`, and image selection/provenance is not carried intact through to persisted photo evidence and reports.

## 2. Approved R2 behaviour

| Area | Required behaviour | Prohibited behaviour |
|---|---|---|
| Crush-depth eligibility | Only an image classified as suitable for crush-depth may enter crush-depth or physics measurement inputs. | Passing `quote_with_embedded_photo`, a document page, fallback page, or ineligible image into crush-depth analysis. |
| Classification provenance | Preserve category, confidence, quality/damage-likelihood score, source type, page, classification method, selection reason, and fallback state with the selected image. | Reconstructing a report label from URL order, index position, or an unlabeled legacy image array. |
| Fallback | Retain images for context, but create a persisted fallback warning where no high-confidence eligible damage image exists. | Silently promoting fallback evidence to a definitive front/side/rear label. |
| Zone/direction labels | Present semantic type, detected components, confidence, provenance, and any selection/fallback warning beside the label. | Calling a zone/direction definitive when its confidence or source provenance is unavailable. |
| Physics | Continue the claim assessment and all non-physics analysis. Mark the physics/crush-depth portion unavailable or qualified when there is no eligible image. | Blocking a claim or inventing crush measurements from unsuitable evidence. |

## 3. Implementation boundaries

The work will make a narrow, maintainable image-evidence envelope available from image classification through Stage 6 and report generation. It will:

1. Introduce a typed `ImageEvidenceEnvelope` containing source page/type, category, category confidence, quality and damage-likelihood scores, `suitableForCrushDepth`, classifier/provenance method, selection reason, and fallback warning.
2. Filter Stage 6 crush-depth candidates by `suitableForCrushDepth === true` before any crush-depth or related physics call. The filter will be tested against `quote_with_embedded_photo`, document pages, vehicle overviews, low-confidence fallbacks, and valid damage photos.
3. Persist selection reasoning and fallback status in the enriched-photo evidence output without overwriting the raw image or original classification.
4. Extend the shared CL/CI/FR photo-evidence contract to show image semantics, components, confidence, provenance, and clear review wording when image evidence is qualified.
5. Add a raw-image-to-label acceptance fixture: the test record must retain the source image reference, asserted expected side/zone, classifier output, and a manual verification outcome. It will never use generated or substituted imagery.

## 4. Acceptance criteria

| Test | Required result |
|---|---|
| Embedded quotation photo | Classified and retained for context, but excluded from crush-depth/physics inputs. |
| Ineligible document/fallback image | Cannot enter crush-depth selection regardless of URL position or score. |
| Eligible damage photo | Carries source, page, category, confidence, selection reason, and explicit crush-depth eligibility into Stage 6 and reports. |
| No eligible damage photo | Claim continues; report states that image-based crush-depth classification requires review/unavailable rather than asserting a direction or physical measurement. |
| Fallback use | Persisted and visible in CL, CI, and FR. |
| Raw-image validation | At least three claims, including mixed/embedded imagery, compare original image content to rendered label and record a pass/fail/manual-review outcome. |
| Cross-report consistency | CL, CI, and FR show the same evidence metadata and warning for a selected image. |
| Non-regression | Report generation, existing damage evidence, and non-image claim assessment continue where physics image input is unavailable. |

## 5. Deliberate exclusions

This package does not retrain a vision model, alter source photos, manufacture a damage zone, recalculate settlement values, or block an assessment. A lower-confidence or ineligible image may remain available as context; it simply cannot become an unqualified physics input.
