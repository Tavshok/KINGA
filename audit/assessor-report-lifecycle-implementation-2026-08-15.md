# Assessor Report Lifecycle Implementation

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 15 August 2026  
**Status:** Implemented and verified

## Delivered Lifecycle

KINGA now treats an assessor report as evidence before it becomes an evaluation. An accepted assigned assessor creates either a **native upload** or a **KINGA-assisted** report draft against the authorised claim. The original uploaded file, storage reference, hash, method, assessor, assignment, tenant, version, and report payload are retained. The assessor attests the draft before it may be submitted for review.

The submitted report is routed in-app to the designated claims reviewer, with claims-manager fallback. The reviewer may accept, return, or reject the report and must record a reason. Acceptance creates the only authoritative assessor-evaluation projection available through `assessorEvaluations.byClaim`; direct summary submission is retired. Acceptance of a later version supersedes earlier accepted report versions, so Claims Manager consumes the latest accepted evidence only.

| Lifecycle control | Implemented boundary |
|---|---|
| Source method | `native_upload` and `kinga_assisted` are explicit and preserved |
| Evidence retention | Original file metadata, S3 reference, MIME type, and SHA-256 hash are recorded when a file is supplied |
| Assessor authority | Only the authenticated assessor with an accepted in-app assignment can create, attest, or submit a report |
| Review routing | Claims-assessor route with claims-manager fallback, recorded in an in-app review queue |
| Evaluation authority | Only accepted report versions create an assessor evaluation with source report and accepted review IDs |
| Versioning | New accepted version supersedes prior accepted version; history remains retained |
| Client/manager safety | Direct `assessorEvaluations.submit` now returns a precondition error rather than creating an unsupported summary |

## User Surfaces

The assessor claim page now creates an assessor-owned report rather than submitting a standalone evaluation. The assessor selects native upload or KINGA-assisted preparation, may attach the original report file, and submits only after attestation. The new **Assessor Report Review Queue** inside the insurer portal gives authorised reviewers accept, return, and reject actions with recorded reasons.

## Validation

| Validation | Result |
|---|---|
| Actual assessor report lifecycle integration: accepted draft, attestation, routing, reviewer-specific denial, native-evidence precondition, accepted projection, foreign/unassigned denial, and version supersession | 24 tests passed |
| Assessor authority and lifecycle audit contracts | 6 tests passed |
| Consolidated lifecycle regression group | 30 tests passed |
| Bundled server build | Passed |
| Vite production build | Passed; existing large-chunk warning only |

## Remaining Boundary

AUD-P1-024 remains open. Assignment email is optional and non-authoritative, but the existing helper is not yet proven to deliver to the assigned assessor mailbox with a provider delivery reference. In-app assignment and notification remain the authoritative operational path.

## References

1. [Lifecycle migration](../drizzle/migrations/20260815_assessor_report_lifecycle.sql)
2. [Lifecycle services](../server/db.ts)
3. [Lifecycle procedures](../server/routers.ts)
4. [Assessor draft surface](../client/src/pages/AssessorClaimDetails.tsx)
5. [Reviewer queue](../client/src/pages/AssessorReportReviewQueue.tsx)
6. [Actual lifecycle integration](../server/assessor-ecosystem-integration.test.ts)
