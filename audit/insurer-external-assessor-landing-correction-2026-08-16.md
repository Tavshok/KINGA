# Insurer External-Assessor Landing and Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

`assessor_external` was defined as an insurer sub-role, but it lacked a canonical insurer-portal landing, route admission, sidebar context, and role-selection entry. The existing external-document upload utility was not a valid substitute because it was not an assignment-governed assessor workspace.

## Correction

KINGA now routes an insurer external assessor to `/insurer-portal/external-assessor`. The workspace lists only assignments addressed to the authenticated user, provides an explicit empty state when none exist, and lets the assessor accept an assigned claim before opening the governed assessment report flow.

The correction extends the existing assigned-assessor lifecycle only to the insurer sub-role `assessor_external`. External assessors may accept a formally assigned claim, create an attested report, and submit it to the designated reviewer. They cannot read a same-tenant claim that is not assigned to them. The generic external-document upload utility remains separate and is not exposed as this role's workspace.

| Boundary | Verified outcome |
|---|---|
| Landing and role selection | `assessor_external` resolves to the dedicated insurer workspace |
| Navigation | Sidebar contains assigned-work navigation only; no generic upload tool is presented |
| Claim visibility | Same-tenant but unassigned claim detail is denied |
| Assignment workflow | Exact assigned external assessor can accept and open the claim |
| Report lifecycle | Assigned external assessor can draft, attest, and submit a report for reviewer routing |
| Decision authority | Reviewer-only acceptance remains unchanged; no settlement or financial authority was added |

## Validation

| Validation | Result |
|---|---|
| External-assessor helper and portal conformance regression | 12 tests passed |
| Actual isolated assessor ecosystem integration | 25 tests passed, including external-assessor assignment-only read and report submission |
| Bundled server build | Passed |
| Vite production build | Passed; existing large-chunk warning only |

No policy, premium, quote, L1/L2, payment, settlement, or claim financial record was changed. The isolated integration suite created only its test-tenant records.

## References

1. [Shared insurer routing contract](../client/src/lib/roleRouting.ts)
2. [External assessor workspace](../client/src/pages/ExternalAssessorWorkspace.tsx)
3. [Assigned assessor authority helper](../server/assessor-role-authority.ts)
4. [Assessor ecosystem integration regression](../server/assessor-ecosystem-integration.test.ts)
