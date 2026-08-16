# Agency Legacy Valuation Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

The legacy `quotation_requests` support procedures were labelled as agency functionality but had three authority defects. They excluded the `agency` top-level role, listed every legacy row without tenant filtering, and executed report-unlock, inspector assignment, quote, and document actions using only the numeric request ID. This allowed a caller who reached the procedures to target another tenant's legacy request.

The modern standalone valuation and insurance service-request records are already separate from this legacy history table. The correction does not merge lifecycles or alter those current product flows.

## Correction

Every legacy history procedure now derives a P0 tenant scope from the authenticated session, validates explicit platform-super-admin cross-tenant selection, and scopes the target request to that tenant before any action. Agency, insurer, and administrative service roles are admitted; unrelated roles are denied. An assigned inspector is additionally resolved within the same tenant before assignment. Cross-tenant platform access remains explicit and audited.

| Procedure | Corrected authority boundary |
|---|---|
| `getValuationRequests` | Returns only the authenticated service tenant's legacy quotation history. |
| `unlockReportOnPolicyIssuance` | Confirms same-tenant request before changing legacy report gating. |
| `assignInspector` | Confirms same-tenant request and same-tenant inspector before assignment. |
| `sendQuoteToClient` | Confirms same-tenant request before the quote update or notification. |
| `sendDocumentToClient` | Confirms same-tenant request before S3 upload, document write, or notification. |

## Verification

The isolated actual-procedure regression created two random tenants and proved:

| Scenario | Result |
|---|---|
| Agency listing | Only its own tenant's legacy history was returned. |
| Unrelated role | Claimant context was denied. |
| Foreign record actions | Report unlock, inspector assignment, quote send, and document send all returned `NOT_FOUND` before side effects. |
| Foreign record state | Status, inspector, quote, and report-gating fields stayed unchanged. |
| Same-tenant service actions | Authorised agency inspection, quote, and report-gating actions succeeded on the controlled fixture. |
| Lifecycle separation | Existing standalone valuation, service-request, quote, and policy separation regression remained green. |
| Cleanup | Final direct verification found zero `test-legacy-valuation-*` quotation requests. |

The combined actual procedure and lifecycle-separation suite passed **9/9**. The server bundle and Vite production build passed; Vite reported only the existing large-chunk advisory.

No customer, production legacy request, standalone valuation, service request, claim, policy, payment, settlement, or financial value was changed. Two fixture rows left by an earlier failed test setup were identified by their exact random test tenants and removed; final verification returned zero residual test rows.

## References

1. [Legacy valuation procedures](../server/routers/insurance-phase7.ts)
2. [Actual authority regression](../server/agency/legacyValuationAuthority.p0.test.ts)
3. [Lifecycle separation regression](../server/agency/insurancePhase7Separation.test.ts)
4. [P0 tenant-boundary contract](../server/security/p0TenantBoundary.ts)
