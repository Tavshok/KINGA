# KINGA Evidence Gap Intelligence — Controlled Work Notice

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 12 August 2026  
**Status:** Proposed; implementation requires explicit approval  
**Scope:** Document-backed quotation evidence, progressive L2 intelligence, report disclosure, and minimal human-verification routing.

## 1. Purpose

KINGA must not treat an ambiguous handwritten quotation row as a dead end. It must preserve the original evidence, state exactly what cannot be established, quantify the consequence of the uncertainty where evidence supports a range, and continue L2 analysis across the remaining verified evidence.

> **Evidence Integrity / Uncertainty Handling Principle:** KINGA may propagate uncertainty; it may not manufacture certainty.

This package formalises an **Evidence Gap Intelligence** object. It does not alter a submitted quotation, repair authorisation, payment, settlement, fraud outcome, or source document.

## 2. Controlled evidence-gap contract

Each ambiguous source row will retain the following fields. No field may be populated by reverse-engineering a row value from a quote total.

| Field | Required behaviour |
|---|---|
| Source provenance | Retain tenant, claim, quote, document, page, row/location, source crop/storage reference, and content hash where available. |
| Observed evidence | Preserve the source text/crop, OCR or transcription attempt, observable characters, and the specific ambiguity. |
| Confidence | Store independently assessed confidence for component label, quantity, unit price, extended amount, and transcription. |
| Candidate readings | Record only alternatives directly supported by OCR, visual review, or an authorised human transcription. Each candidate retains method and confidence. No candidate is silently selected. |
| Arithmetic relationship | Store a separately labelled arithmetic residual or constraint. It must never be converted into an observed row amount or assigned to a component. |
| Financial impact | Identify whether the gap affects a comparison row, source subtotal, VAT, all-in total, savings, or settlement readiness. |
| Resolution state | Use `open`, `human_verification_requested`, `human_verified`, `superseded`, or `not_resolvable_from_source`. |

## 3. Progressive L2 behaviour

L2 remains operational at all times, but its outputs are separated by evidential strength.

| Layer | KINGA behaviour | Prohibited behaviour |
|---|---|---|
| **L0 — Evidence** | Show source row, crop, observed text, ambiguity, candidates, confidence, and source location. | Reword or normalise a difficult handwritten value as though it were read. |
| **L1 — Deterministic** | Include only verified source rows in arithmetic; show a distinct arithmetic residual when known totals do not reconcile. | Attribute a residual to an ambiguous row or distribute it across known rows. |
| **L2 — Intelligence** | Compare verified equivalent rows, identify a quantification gap, show coverage and the consequence of uncertainty. | Stop all analysis because one row is ambiguous, or call the partial result a payable total. |
| **Financial decision** | Gate only a final all-in optimised total, savings figure, or settlement recommendation when affected evidence remains unresolved. | Suppress the evidence-qualified comparison, or turn a candidate/range into an instruction. |

## 4. Uncertainty envelope

When—and only when—one or more candidate values have direct evidence support, KINGA may present a non-payable uncertainty envelope:

`verified known subtotal + minimum supported candidate exposure → maximum supported candidate exposure`

The report must visibly distinguish:

| Presentation element | Meaning |
|---|---|
| Verified amount | Sum of source-verified comparable rows only. |
| Candidate exposure | Min/max from directly supported, unselected candidate readings. |
| Arithmetic residual | Difference implied by independently verified totals; not attributed to any row. |
| Evidence-qualified range | A non-payable informational envelope, never a selected repair cost. |

If no defensible candidate values exist, KINGA must show the gap and its decision impact without inventing a range.

## 5. Targeted human verification

KINGA will create a minimal verification request rather than ask a reviewer to repeat the full extraction. The request identifies only the unresolved source rows, what needs confirmation, the original crop, candidate readings when available, and the resulting decision impact.

Example output:

> **Human verification required.** Confirm the amount shown at document 4650001, page 13, repairs-table row 17. The component label is partly legible; the submitted amount has not met the source-confidence threshold. The row is excluded from verified arithmetic. L2 comparison remains available for verified rows; final all-in cost, savings, and settlement recommendation remain qualified only to the extent affected by this row.

## 6. Report presentation

CL, CI, and FR will add an **Evidence Gap Intelligence** subsection inside the existing L2 Evidence Reconciliation panel. It will display an evidence matrix, uncertainty impact, arithmetic constraints, and a neutral human-verification request. It will not use accusatory wording, disclose unsupported amounts as facts, or label an ambiguity as fraud or quote inflation.

## 7. Acceptance criteria

| Test | Required result |
|---|---|
| Ambiguous row persisted | Source document/page/location/crop, observation, confidence, and ambiguity retained. |
| Candidate readings | Only directly supported candidates preserved; no default selection. |
| Arithmetic residual | Presented separately; never assigned to a source row. |
| Verified L2 rows | Continue to compare across active equivalent source rows. |
| Uncertainty envelope | Appears only with explicit candidate support and is labelled non-payable. |
| No candidate support | Report shows targeted gap and impact without a synthetic range. |
| Human request | Requests only named unresolved rows and fields. |
| Financial boundary | Final all-in total, savings, and settlement remain qualified only when affected evidence is unresolved. |
| Security | Claim, quote, and evidence access remains tenant-scoped; no source data is exposed across tenants. |

## 8. Deliberate exclusions

This package does not perform OCR model retraining, create a payment workflow, change a repairer’s quote, approve or reject a claim, calculate a substitute benchmark price, or make a fraud conclusion.
