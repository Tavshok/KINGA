# KINGA Evidence Governance Foundation — Work Notice

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 12 August 2026  
**Status:** Proposed. No schema, pipeline, report, quote, claim, decision, or production-data change is authorised by this notice.

## Governing principle

> **KINGA does not manufacture certainty. It establishes evidence, preserves provenance, identifies discrepancies, compares verified equivalents, and escalates unresolved matters for review.**

Every material cost, damage, fraud, vehicle-history, and decision input must distinguish between: **what a source document directly proves; what KINGA has reconstructed from that source; and what KINGA has identified as a review signal.** A review signal is not a cost adjustment, fraud conclusion, rejection, settlement decision, or benchmark replacement.

## Controlled evidence status vocabulary

| Status | Meaning | Decision treatment |
|---|---|---|
| **Verified** | Directly supported by an authoritative source document, image, or signed system record. | Eligible for an equivalent-scope comparison when the remaining eligibility rules are met. |
| **Reconstructed** | Derived from source evidence through a documented reconstruction trace. | Visible as reconstructed evidence; requires stated confidence and review rule before decision use. |
| **Documented Revision** | An earlier value is superseded by identifiable later evidence. | The revision is eligible; the original remains auditable. |
| **Scope Difference** | A genuine difference in repair/component/tax basis or other material scope is supported by evidence. | Not compared as like-for-like until the scope is normalised or separated. |
| **Extraction Defect** | The structured record differs from its original evidence or is incomplete. | Excluded from verified comparison until corrected from source. |
| **Evidence Gap** | Required source evidence is absent. | No inferred value; request or obtain evidence. |
| **Pricing Variance Review Signal** | A verified value materially differs from comparable verified values or benchmark range. | Review signal only; does not establish inflation, misconduct, or fraud. |
| **Unresolved** | Available evidence is insufficient to determine the correct treatment. | Escalate for review; suppress dependent automated recommendation. |

## Monetary evidence contract

Every monetary figure eligible to influence L1, L2, L3 comparison, savings, settlement advice, or a report must carry the following minimum provenance.

| Field | Purpose |
|---|---|
| `value`, `currency`, `tax_basis` | Preserve exact amount and whether the submitted source expressly includes, excludes, or separately states tax. |
| `source_document`, `source_page`, `source_location`, `source_type` | Identify the controlling source and precise position, where available. |
| `extraction_method`, `confidence`, `verification_status` | Separate direct evidence from OCR, structured extraction, or human reconstruction. |
| `scope`, `revision_status` | Establish the comparable repair scope and whether the value is original, revised, or superseded. |
| `finding_id` | Link discrepancies, arithmetic checks, and review decisions to a durable evidence finding. |

## L2 eligibility rule

L2 is not a search for the cheapest value. It answers:

> **What is the lowest defensible cost among equivalent, verified scopes?**

For a component or all-in package to be eligible, KINGA must have a traceable submitted amount, a verified or controlled reconstructed source record, equivalent scope and tax basis, an identifiable revision status, and no unresolved source-to-ledger discrepancy that changes the amount or comparability. Benchmarks are comparative line-item intelligence only; they can create a **Pricing Variance Review Signal** but can never replace, reduce, add to, or fill a submitted quote value.

## Representative claim treatment

The current source evidence for claim `12909902` requires the following statuses before comparison:

| Evidence item | Current treatment |
|---|---|
| The Dent Doctor source quotation: USD 6,500.00 | **Verified** source quotation total. |
| The Dent Doctor structured ledger: USD 5,915.00 | **Extraction Defect / Unresolved** source-to-ledger mismatch; not eligible for verified comparison until a documented revision or correction is located. |
| C.A.M.E.L source quotation: USD 5,425.00 spares and USD 7,230.00 grand total | **Verified** source total and source scope split; requires document-backed row reconstruction before component-level L2 use. |
| Stylin source quotation: USD 7,265.00 carried forward, USD 1,084.00 VAT, USD 8,349.00 total | **Verified** source arithmetic; requires document-backed row reconstruction before component-level L2 use. |

No source-to-ledger mismatch is to be called “quote inflation” without further evidence. When a verified component price is materially outside comparable verified prices or benchmark range, KINGA may record a **Pricing Variance Review Signal** with the exact variance and evidence basis.

## Proposed implementation scope

1. Add a normalised evidence-finding and monetary-evidence provenance contract, linked to claims, source documents, source locations, and quotations.
2. Add a document-backed quote-evidence ledger that preserves original document totals, line rows, tax treatment, revisions, extraction method/confidence, arithmetic reconciliation, and controlled status.
3. Make L2 select only equivalent-scope, eligible submitted evidence; make source discrepancies, reconstruction status, and unresolved evidence explicit gate conditions.
4. Update CL, CI, FR, and portal cost views to disclose evidence status, source provenance, scope/tax comparability, and review signals without overstating conclusions.
5. Extend the same controlled vocabulary to damage, fraud, and vehicle-history findings in a later bounded increment; this notice does not authorise a broad refactor of those engines.

## Acceptance criteria

| Test | Required result |
|---|---|
| Source-document amount differs from structured value | Both values retained with source provenance; structured value has `Extraction Defect` or `Unresolved` status and is ineligible for verified L2 comparison. |
| Explicit VAT line | VAT preserved as a source row with tax basis, source page/location, and verification status; never inferred. |
| Documented revision | Original remains auditable; only traceable later revision becomes eligible. |
| Scope difference | Values are not compared as equivalent until the scope distinction is explicit. |
| Material verified price variance | A `Pricing Variance Review Signal` is created with source values, benchmark range where available, comparable quote evidence, and no fraud conclusion. |
| Missing source evidence | `Evidence Gap` or `Unresolved`; no generated cost and no automatic settlement advice. |
| L2 selection | Every selected amount exposes source document, page/location, scope, tax basis, revision status, confidence, and evidence status. |
| Reports | CL, CI, FR, and portal views show source-backed status and suppress unsupported savings, settlement, and decision language. |

## Out of scope

This proposal does not change quotation values, panel-beater submissions, financial settlement, insurer approvals, fraud conclusions, claim intake, notifications, or the historic evidence record. It also does not authorise an automated rewrite of existing structured quote lines; legacy remediation must proceed through a separately controlled, source-backed migration plan.
