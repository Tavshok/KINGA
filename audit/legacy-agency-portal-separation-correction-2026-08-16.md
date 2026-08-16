# Legacy Agency Portal Separation and Record-Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Findings

The broker-facing Agency Service Workspace still displayed legacy client self-service controls for personal quotation requests, policies, renewals, documents, and quote comparison. The same legacy server router exposed unrestricted all-quotation and all-policy procedures to any authenticated user. Document upload and document listing accepted arbitrary quotation or policy IDs, and vehicle risk intelligence accepted an arbitrary registration number.

These paths blurred the boundary between an agency acting for a managed client and a claimant acting on their own account. They also created a direct cross-record disclosure and mutation risk.

## Correction

The broker workspace now retains only broker-facing functions: Client Management, Professional Valuation Evidence, Timeline Intelligence, Commissions, and Performance. The legacy client self-service quotation, policy, document, and quote-comparison tabs and document quick action are absent from the agency entry. The existing client routes remain the correct entry for client self-service valuation and policy activity.

The unscoped legacy all-quotation, quotation-update, and all-policy procedures are now fail-closed and direct users to governed insurer or agency service workflows. A shared owned-target resolver requires exactly one quotation or policy target and verifies it belongs to the authenticated customer before a document can be stored or listed. Vehicle risk intelligence now returns no match unless the registration appears on the caller's own legacy quotation record.

| Boundary | Corrected behaviour |
|---|---|
| Agency portal navigation | Client self-service quotation, policy, document, and comparison controls removed from broker workspace. |
| Legacy all-record procedures | Cross-record quotation/policy list and status-update operations fail closed. |
| Legacy document upload | Ownership is verified before S3 upload, document insertion, forensics start, or status write. |
| Legacy document listing | Exactly one owned quotation or policy target is required. |
| Vehicle risk query | Requires a matching registration on the caller's own legacy quotation record. |

## Verification

The actual legacy record-authority regression and professional portal-conformance suite passed **13/13**. The authority test proves cross-record list/update operations are forbidden; foreign quotation document upload and listing are denied before storage or disclosure; and arbitrary vehicle registrations return no risk result. The portal regression proves the agency workspace no longer exposes the removed client self-service tabs or document quick action.

Final direct verification found zero synthetic documents, quotation requests, and users. The bundled server and Vite production build passed; Vite emitted only the existing large-chunk advisory.

No production client record, agency client record, valuation, insurance service request, claim, policy, premium, commission, payment, settlement, or financial value changed.

## References

1. [Agency workspace](../client/src/pages/KingaAgency.tsx)
2. [Legacy agency router](../server/routers/agency.ts)
3. [Actual record authority regression](../server/agency/legacyAgencyRecordAuthority.p0.test.ts)
4. [Portal conformance regression](../server/professionalPortalConformance.p1.test.ts)
