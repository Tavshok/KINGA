# KINGA Assessor Report Lifecycle Design

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 15 August 2026  
**Status:** Design and authorization verification complete; implementation requires separate schema-first approval  
**Scope:** No-write design. This document defines the required report evidence and review lifecycle; it does not create, modify, or route any report, claim, evaluation, document, or notification.

## Purpose

An assessor evaluation summary must not originate from an unexplained form submission. It must be the controlled projection of a report that an authorised assessor has submitted, attested, and had reviewed through the correct claims workflow.

> **Authority rule:** An assessor’s report is evidence. It becomes an authoritative assessor evaluation only after the latest submitted version has been accepted by the authorised claims reviewer.

## Required Lifecycle

| Stage | Owner | Required record and state | Authority effect |
|---|---|---|---|
| Assignment accepted | Assigned assessor | Existing in-app `claim_assignments` record changes to `accepted` | Assessor may begin work; no report conclusion exists yet. |
| Draft report | Assigned assessor | `assessor_reports` record with method `native_upload` or `kinga_assisted`, bound to claim, tenant, assessor, and draft version | Draft is visible only to authorised workflow participants; it cannot populate Claims Manager. |
| Source retention | System | Immutable original file reference, file hash, MIME type, filename, attachment links, source metadata, and extraction result reference | Retains the original assessor evidence and distinguishes it from KINGA’s extraction. |
| Assessor attestation | Assigned assessor | Attestation user, timestamp, declared report version, and confirmation that the report reflects the assessor’s professional conclusion | Converts the draft into a submit-ready assessor-owned report. |
| Submission and routing | System | Submitted report status plus `assessor_report_reviews` queue assignment | Routes to the assigned claims assessor. If no authorised claims assessor is available, routes to claims manager through explicit fallback/escalation reason. |
| Review decision | Claims assessor or authorised fallback claims manager | Accept, return, reject, or escalate decision; reviewer, timestamp, rationale, and decision version | Only accepted version may become the authoritative assessor evaluation. |
| Authoritative projection | System | `assessor_evaluations` references accepted report/version/review | Claims Manager receives the latest accepted projection, not a raw report summary. |
| Historical evidence | System | Draft, returned, rejected, and superseded reports retained with qualified state | Remains transparent history; cannot change L1/L2, recommendation, or accepted assessor conclusion. |

## Native Upload and KINGA-Assisted Preparation

The same evidence lifecycle applies to both authoring methods. A **native upload** stores the assessor’s original document and metadata. A **KINGA-assisted draft** stores the generated draft and any supporting extraction/analysis, but is explicitly marked `kinga_assisted` and remains non-authoritative until the assessor attests and submits it. KINGA must never silently become the professional report author.

| Field | Why it is required |
|---|---|
| `claim_id`, `tenant_id`, `assessor_user_id` | Binds the report to the authorised object, organisation, and accountable assessor. |
| `creation_method` | Distinguishes native upload from KINGA-assisted preparation. |
| `original_document_id`, `file_hash`, `attachment_manifest` | Preserves the original evidence and detects replacement. |
| `version_number`, `supersedes_report_id` | Preserves corrections without deleting historical reports. |
| `attested_at`, `attested_by_user_id` | Records the assessor’s professional ownership. |
| `review_state`, `reviewer_user_id`, `review_reason`, `reviewed_at` | Establishes claims-assessor/manager authority and the decision reason. |
| `assignment_id`, `route_reason` | Connects report review to the accepted assignment and any manager fallback. |

## Review Routing

Routing begins only after assessor submission. The normal destination is the assigned **claims assessor**. The route moves to a **claims manager** only where no eligible claims assessor exists, assignment has escalated, or a configured escalation rule applies. The queue record—not an email—is authoritative. KINGA creates in-app notifications. Optional email is a delivery notification only and cannot assign, accept, review, or approve a report.

## Claims Manager Boundary

Claims Manager must query an **accepted assessor evaluation projection**, which includes its accepted report ID, version, reviewer, and review timestamp. Where no accepted report exists, the page must show `Assessor report pending review` or `No accepted assessor report` rather than displaying costs as a professional conclusion. The raw report may be opened by authorised roles, but its values cannot be used as settlement, L1/L2, savings, or final decision authority.

## Current-System Compatibility Check

| Current element | Reuse or change required |
|---|---|
| `claim_assignments` and authenticated acceptance | Reuse as the prerequisite assessor authority record. |
| `assessor_evaluations` | Extend with accepted report/version/review references; do not treat direct form submission as the source of truth. |
| `ingestion_documents` | Reuse document classification and validation capabilities, but add authoritative claim/report linkage. |
| `uploadExternalAssessment` | Replace its standalone analysis utility boundary with claim/tenant/assessor-bound report creation. |
| `processExternalAssessment` | Reuse as an optional KINGA extraction service; store results as derived evidence, not report authorship. |
| Claims Manager `assessorEvaluations.byClaim` | Change to accepted-projection query after the lifecycle schema and review controls exist. |
| In-app assignment notifications | Reuse as operational routing notice; email remains optional and non-authoritative. |

## Implementation Sequencing

Implementation must proceed as one schema-first package: create report/review/version tables and constraints; add authorised native/KINGA-assisted draft routes; add attestation and submit action; add reviewer queue and decisions; add accepted projection; then change Claims Manager consumption. No direct `assessor_evaluations.submit` form summary may bypass this lifecycle after the package is activated.

## Verification Result

The existing code supports the accepted-assignment prerequisite and controlled `under_assessment → internal_review` transition. It does **not** currently provide the report source, attestation, version, review queue, reviewer decision, or accepted-projection records defined above. The design therefore aligns with the existing security and workflow boundary while identifying the exact schema-first implementation required by AUD-P1-021 through AUD-P1-023.

## References

1. [Assessor acceptance and evaluation procedures](../server/routers.ts)
2. [Assessor evaluation schema](../drizzle/schema.ts)
3. [Current external assessment processor](../server/assessment-processor.ts)
4. [Claims Manager comparison consumer](../client/src/pages/ClaimsManagerComparisonView.tsx)
5. [Assessor authority and routing audit](assessor-report-authority-routing-audit-2026-08-15.md)
