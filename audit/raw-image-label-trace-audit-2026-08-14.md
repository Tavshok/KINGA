# Raw Image-to-Label Trace Audit

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 14 August 2026  
**Scope:** Claims Ledger, Claims Intelligence, and Forensic Claim Decision photo-evidence presentation.

## Finding

The three report surfaces consume the shared canonical photo-evidence normaliser and shared photo panel. A source-recorded impact-zone label is preserved with the source image URL, page, classifier, confidence, components, and other provenance. The reporting layer does not replace an image label with an inferred alternative.

When upstream evidence records `directionContradiction`, the reports now show the original value as **Recorded zone** and display an explicit **Zone label requires verification** warning. This retains the image and its evidence trail, rather than silently relabelling it or blocking the assessment.

## Audit Boundary

This is a deterministic trace and presentation audit. It verifies that a contradiction already identified by upstream evidence is carried consistently into CL, CI, and FR. It does not claim that a classifier is visually correct for every source image, because no curated, human-labelled raw-image reference set was supplied for this no-write audit. Any classifier retraining, model replacement, or production-image reclassification requires separate approval.

## Acceptance Evidence

The no-write tests cover provenance preservation, a contradictory recorded label, qualification wording, absence of invented replacement direction, and shared CL/CI/FR consumption of the canonical evidence contract.
