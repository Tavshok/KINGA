# R0 Cross-Report Photo and Damage-Analysis Consistency Work Notice

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 13 August 2026  
**Status:** Proposed — no implementation authorised by this notice

## Purpose

Claims Ledger, Claims Intelligence, and the Forensic Decision Report must communicate the same underlying photo-forensics and damage-analysis evidence without implying that an image has a different zone, component, severity, or evidential status in each report. The intended outcome is a single source-grounded view of what the image evidence establishes, what remains uncertain, and what requires review.

## Proposed Scope

The proposed work will inventory each report’s active photo and damage-analysis inputs, then align them to the canonical enriched-photo and damage-analysis evidence already retained for the claim. The implementation may introduce a shared normalisation and presentation contract where required. It will ensure that photo zones, labelled components, severity, photo count, and damage-summary language are consistent across the three reports.

| Control | Required behaviour |
|---|---|
| Photo source | Use the canonical retained photo evidence and preserve its source identifier, original order, and classification provenance. |
| Zone labels | Use one normalised zone vocabulary; never relabel an image as front, side, or rear without evidence. |
| Components and severity | Preserve explicitly extracted components and severity; do not invent components or elevate severity from report layout logic. |
| Photo count | Report the same deduplicated canonical count in every relevant report context. |
| Discrepancies | Present a bounded review flag if sources conflict or a classification is uncertain; do not silently choose a more favourable label. |
| Report role | CL gives a concise evidence reference, CI gives comparison and scope relevance, and FR gives technical detail. |

## Acceptance Criteria

| Scenario | Required outcome |
|---|---|
| Canonical photo evidence | CL, CI, and FR consume the same normalized identity, count, zone, component, and severity evidence. |
| Known zone | Every visible image caption uses the recorded zone label. |
| Unknown or conflicting zone | The report identifies the limitation or review need rather than assigning a new zone. |
| Duplicate evidence | A duplicate asset does not increase a report’s photo count or influence damage conclusions twice. |
| No photo evidence | The reports state that no photo evidence is available without replacing it with narrative inference. |
| Cross-report test | Deterministic tests compare the same fixture across CL, CI, and FR. |

## Explicit Exclusions

This work does not retrain image models, create a repairability, causation, fraud, policy, repair, quote, cost, settlement, or payment outcome. It does not alter source images or overwrite their original metadata. It does not manufacture image evidence to fill gaps.

## Decision Required

> Approve only the cross-report normalisation, provenance, presentation, and regression controls described above. Image-model retraining, new image classification thresholds, and workflow actions require separate scope and approval.
