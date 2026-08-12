# CL, CI, FR, Cost, and Image Evidence Audit

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 11 August 2026  
**Method:** Read-only source inspection, report generation against three existing assessed claims, and canonical database read queries. No claim, quote, pipeline, image, or report record was changed.

## Audit Scope and Evidence Standard

The audit compared the Standard Claims Report (**CL**), Claims Intelligence Report (**CI**), and Forensic Decision Report (**FR**) against the same canonical sources: `claims`, `ai_assessments`, `cost_intelligence_json`, `panel_beater_quotes`, `quote_line_items`, and `enriched_photos_json`.

Three production assessment records were used as representative evidence: **10,719,902**, **11,709,902**, and **12,879,902**. A defect is labelled **proven** only where source code or generated HTML demonstrates it. A visual-label issue is labelled **requires image comparison** where raw-image inspection is necessary to decide whether the model was factually wrong.

## Executive Findings

| Priority | Finding | Evidence | Effect |
|---:|---|---|---|
| P0 | CL does not surface Stage 9 hidden-damage and quote-gap intelligence. | CL renders a basic quote/component comparison but not `quotedNotDamaged`, `damagedNotQuoted`, or `hiddenDamageAdvisories`; those values are available in cost intelligence. | A claims decision can miss material cost/review context even where the pipeline produced it. |
| P0 | CL can show a zero/blank component cost where composite lookup does not exactly match the component name. | The CL fallback uses exact/substring matching against composite line items, otherwise renders a dash. | The report can appear incomplete even when quote-line evidence exists. |
| P0 | CI and FR can omit the documented agreed cost when it differs from the L2 recommended figure. | For claim **10,719,902**, CL contains **$5,817.00** once, while CI and FR contain it zero times; all show L2 **$5,877.00**. | Readers cannot distinguish documented/agreed cost from the KINGA recommendation across all reports. |
| P1 | FR derives the tenant/claim currency but hardcodes `$`/`fmtUSD` in parts of its quote and settlement tables. | `forensicDecisionReport.ts` resolves `claimCurrency`, but affected financial sections use `fmtUSD`. | Non-USD tenant reports can be misleading. |
| P1 | FR reduces photo evidence to zone/caption, omitting upstream semantic type and detected-component metadata. | Stage 6 produces `semanticType` and `detectedComponents`; FR passes only a limited subset to its photo panel. | A reader cannot assess why an image was classified or what components drove the zone label. |
| P0 | Stage 6 does not consume `suitableForCrushDepth`, allowing an embedded quote/document photo to remain eligible for crush-depth reasoning. | The classifier sets the flag; Stage 6 does not read it when routing images. | Physics/impact interpretation can use an unsuitable image. |
| P0 | Image scoring/provenance is disconnected from Stage 6 selection, and low-confidence fallback is silent. | `imageIntelligence` calculates page score/provenance; Stage 6 applies index-based likelihoods from classified damage photos. The fallback to medium/all pages has no output warning. | A side image can be presented under an over-confident or unsupported “front”/zone label. |

## Cost Evidence from Real Claims

| Claim | Documented agreed cost | Lowest quoted cost (L1) | KINGA Optimised (L2) | Persisted quote lines | Observed cross-report result |
|---:|---:|---:|---:|---:|---|
| 10,719,902 | $5,817.00 | $4,485.00 | $5,877.00 | 59 | CL displays documented agreed cost and L2. CI and FR display L2 but omit documented agreed cost. |
| 11,709,902 | $1,995.33 | $1,995.33 | $993.00 | 23 | All reports display L1 and L2. The very large L1–L2 variance requires transparent component and exclusion explanation. |
| 12,879,902 | $1,950.00 | $1,950.00 | $2,409.35 | 19 | All reports display the principal quote and L2 figures. |

The three claims contain persisted quote line items, so the missing/blank CL component values are a **presentation/fallback** problem, not evidence that line-item persistence failed for these records.

> **Amendment:** a subsequent header-provenance trace confirmed that the principal header figure is often a derived L2 recommendation rather than a submitted quote. See `audit/header-cost-provenance-trace-2026-08-11.md`. The correction scope must therefore use verified source classes, not merely show additional cost values.

## Report-by-Report Assessment

| Report | Appropriate role | Proven strengths | Proven gaps that require correction |
|---|---|---|---|
| **CL** | Operational claims assessment and decision support. | Displays quote rows, line-item content, image/risk material, and principal costs. | Must show a canonical cost hierarchy, category variance, hidden-damage/quote-gap advisories, and explicit “data unavailable” states instead of zero/blank component values. |
| **CI** | Management intelligence and explainable decision context. | Uses defensive legacy/v2 field fallbacks and renders quote/risk material. | Must display documented/agreed cost separately from L1 and L2 whenever it is present; a large L1–L2 variance requires a visible component/exclusion explanation. |
| **FR** | Forensic, evidential, and governance review. | Shows L1/L2 comparison, hidden-damage heading where data exists, photo/risk sections. | Must use claim currency consistently; must retain richer image metadata/provenance; must not imply a higher certainty than image selection supports. |

## Image Classification Assessment

The stored sample metadata shows plausible labels such as `front_right` for images whose captions list RH front wing/doors and `Front Right` where front components are detected. That does **not** prove that every label is correct because the raw images were not compared side-by-side in this audit.

However, the pipeline contains two proven design defects that can create the situation you described:

1. A document or quote page with an embedded image can be excluded from crush-depth use by the classifier, but Stage 6 does not honour that exclusion.
2. A score/provenance calculation exists but is not propagated intact to Stage 6, and low-confidence fallback pages are not flagged in the result.

Therefore, an image must never be described to a report reader as definitively **front**, **side**, or **rear** unless the classification confidence, provenance, and any fallback warning are retained with the label.

## Controlled Correction Matrix

### Batch R1 — Canonical Cost Presentation Across CL, CI, and FR

| Change | Exact scope | Acceptance evidence |
|---|---|---|
| Shared report cost presentation model | Derive and label Documented/Agreed, L1 Lowest Submitted, L2 KINGA Optimised, benchmark expected cost, currency, source, and availability once for all reports. | Same claim shows the same labelled cost hierarchy in CL, CI, and FR. |
| CL cost intelligence extension | Add category variance, `damagedNotQuoted`, `quotedNotDamaged`, hidden-damage advisories, and explicit unavailable states. | Claim with quote lines has no unexplained blank/zero component row; advisory values appear when produced by Stage 9. |
| CI/FR agreement visibility | Show documented/agreed cost separately from L1/L2; explain material L1–L2 variance through component/exclusion evidence. | Claim 10,719,902 shows $5,817.00 and $5,877.00 in all three reports with distinct labels. |
| FR currency correction | Replace hardcoded USD formatting with claim/tenant currency formatting in all financial tables. | Non-USD fixture/report displays local currency code/symbol consistently. |

### Batch R2 — Image Classification Integrity and Evidence Transparency

| Change | Exact scope | Acceptance evidence |
|---|---|---|
| Crush-depth eligibility enforcement | Stage 6 excludes `suitableForCrushDepth: false` images from crush-depth/physics inputs. | Embedded quote image cannot affect crush-depth output. |
| Provenance-preserving selection | Pass `damageLikelihoodScore`, provenance, and selection reason from `imageIntelligence` into Stage 6 and the persisted enriched photo record. | Each displayed zone label carries confidence and selection provenance. |
| Explicit fallback warning | Persist and display a warning where no high-confidence damage image exists and fallback is used. | Report says “classification requires review” rather than presenting a definitive front/side/rear label. |
| FR photo evidence extension | Display semantic type, detected components, confidence, provenance, and fallback warning with the photo zone. | Forensic reader can see why a zone label was assigned. |

## Required Live Validation After Remediation

After either batch, validate at least three claims: one with multiple full quotes, one with low L2 versus L1, and one with mixed/embedded document imagery. The validation must compare the raw image to its label and must reconcile every displayed cost to the canonical quote/assessment source.

## References

[1]: `server/reporting/reportDefinitions.ts` — CL source and cost-table renderer.  
[2]: `server/reporting/claimsIntelligenceReport.ts` — CI source and fallback logic.  
[3]: `server/reporting/forensicDecisionReport.ts` — FR source, currency renderer, and photo panel.  
[4]: `server/pipeline-v2/stage-9-cost.ts` — canonical cost intelligence writer.  
[5]: `server/pipeline-v2/imageClassifier.ts`, `imageIntelligence.ts`, and `stage-6-damage-analysis.ts` — image selection and classification pipeline.  
[6]: Read-only production database queries and generated HTML snapshots for claims 10,719,902; 11,709,902; and 12,879,902, 11 August 2026.
