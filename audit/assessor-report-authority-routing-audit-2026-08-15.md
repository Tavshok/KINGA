# Assessor Report Evidence-Authority and Routing Audit

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 15 August 2026  
**Status:** Completed no-write audit  
**Scope:** Current assessor report upload, evaluation submission, document evidence, review routing, and Claims Manager summary authority. No report, claim, assessor evaluation, document, queue, notification, workflow, or stored record was changed.

## Executive Finding

The user’s concern is confirmed. The current `assessorEvaluations.byClaim` summary is **not traceable to an accepted assessor report**. It is a direct persisted evaluation row, created from form inputs, then consumed by Claims Manager without report provenance, assessor attestation, internal review decision, version relation, or claims-assessor/claims-manager work-queue routing.

> An uploaded or KINGA-assisted assessor report must be evidence first. It becomes an authoritative assessor evaluation only after the accountable assessor has attested it and the assigned claims assessor or claims manager has recorded the required review decision.

## Current-Path Classification

| Current path | Observed boundary | Classification |
|---|---|---|
| `insurers.uploadExternalAssessment` | Accepts only file name and base64 file; sends it to an analysis utility with no claim, assessor, evaluation, attestation, or queue reference | Unlinked analysis utility, not a submitted assessor report |
| `assessorEvaluations.submit` | Accepts an arbitrary `assessorId` and summary fields; creates `status: submitted` directly | Unsupported evaluation summary source |
| Evaluation record | Contains costs, narrative, status, and tenant field, but no source report/document, upload author, attestation, review decision, reviewer, version, or supersession relation | Missing provenance and review authority |
| Submission transition | Moves workflow to `internal_review` but assigns neither a claims assessor nor a claims manager; no queue item or in-app review notification is created | Missing required routing and review workflow |
| Claims Manager | Reads `assessorEvaluations.byClaim` and renders summary values directly | Unsupported decision-facing projection |
| Ingestion document record | Supports `assessor_report` classification and document validation, but is not claim-bound and has no assessor-evaluation relation | Separate evidence store, not the authority source |

## Confirmed Findings

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| AUD-P0-002 | P0 | The direct evaluation submission accepts caller-supplied `assessorId`, reads the claim without a caller tenant scope, and creates the row without binding `tenantId` from the authorised claim/context. | `assessorEvaluations.submit` in `server/routers.ts` |
| AUD-P1-021 | P1 | Neither native report upload nor KINGA-assisted report preparation creates a claim-bound, assessor-owned source record capable of supporting an authoritative evaluation. | `uploadExternalAssessment`, `assessment-processor.ts`, schema trace |
| AUD-P1-022 | P1 | No attestation, review decision, reviewer, review timestamp, version, or supersession relation exists before Claims Manager consumes the evaluation summary. | `assessor_evaluations` schema and client projection |
| AUD-P1-023 | P1 | Submission transitions to `internal_review` without routing to an assigned claims assessor or claims manager, queue item, or in-app notification. | Submission procedure trace |

The P0 finding takes precedence. The current direct summary path must not be extended until its tenant/object authority is corrected and the assessor identity is derived from the authenticated user or an authorised assignment—not a caller-controlled ID.

## Required Target Lifecycle

| Stage | Required authoritative behaviour |
|---|---|
| Draft | A verified assessor begins a native report or uploads an external report against an authorised assigned claim. A KINGA-assisted report remains an assessor draft. |
| Submission | The original report, attachments, creator, creation method (`native_upload` or `kinga_assisted`), hash, claim, tenant, and version are retained. The assessor attests before submission. |
| KINGA assistance | KINGA may extract, structure, or suggest content, but never silently becomes the report author or authoritative assessor. |
| Queue routing | Submitted report is assigned to the designated claims assessor. If no claims assessor is available or configured escalation applies, it routes to the claims manager. Only in-app notifications are required. |
| Review | The assigned reviewer accepts, returns for clarification, rejects, or escalates. Each decision records user, timestamp, rationale, and resulting version state. |
| Decision projection | Only the latest accepted report may populate the authoritative assessor-evaluation summary. Draft, submitted/pending, returned, rejected, and superseded reports remain qualified history. |

## Executable Evidence

| Validation | Result |
|---|---|
| Assessor-report authority/routing audit | 4 assertions passed |
| Assessor authority, Claims Manager, and canonical-projection regression group | 3 files, 9 tests passed |
| Bundled server build | Passed |
| Vite production build | Passed; existing large-chunk warning only |

The no-write contract is [`server/reporting/assessorReportAuthorityRoutingAudit.p1.test.ts`](../server/reporting/assessorReportAuthorityRoutingAudit.p1.test.ts).

## Conclusion

KINGA does not yet have the designed assessor-report authority path required for production use. The existing evaluation summary must be treated as unsupported pending controlled remediation. The next implementation must begin with the P0 tenant/identity boundary, followed by a separate schema-first assessor-report evidence lifecycle and review-routing design. No partial UI-only workaround is appropriate.

## References

1. [Assessor evaluation procedures](../server/routers.ts)
2. [Assessor evaluation schema](../drizzle/schema.ts)
3. [External assessment processor](../server/assessment-processor.ts)
4. [Claims Manager comparison view](../client/src/pages/ClaimsManagerComparisonView.tsx)
5. [No-write authority audit](../server/reporting/assessorReportAuthorityRoutingAudit.p1.test.ts)
