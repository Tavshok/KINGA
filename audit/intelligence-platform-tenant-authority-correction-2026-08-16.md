# Intelligence Platform Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

The intelligence-platform claim timeline read workflow transition and fraud-alert evidence using only a caller-supplied `claimId`. The portfolio fleet and engineering summaries additionally used raw SQL that included null-tenant rows and allowed an empty tenant predicate when the session did not provide a tenant. Those paths could disclose cross-tenant intelligence evidence.

## Correction

`getClaimTimeline` now requires a session tenant, resolves the requested claim within that tenant before any event query, and retains a parent-claim tenant predicate on workflow and fraud event reads.

`getFleetExposureSummary` and `getEngineeringRiskSummary` now require a session tenant and use parameterised tenant-bound SQL. Fleet, vehicle, risk-score, and inspection evidence is filtered strictly to that tenant. The `OR tenant_id IS NULL` and tenantless fallback paths are removed.

## Verification

The deterministic P0 regression passed **2/2**. It verifies tenant-owned claim resolution before timeline evidence reads and rejects raw SQL patterns that permit null or absent tenant scope. Bundled server and Vite production builds passed. Vite emitted only the pre-existing large-chunk advisory.

No intelligence summary, claim, fraud alert, workflow audit, inspection, fleet, policy, payment, settlement, or financial record changed.

## References

1. [Intelligence platform router](../server/routers/intelligence-platform.ts)
2. [P0 tenant-authority regression](../server/intelligencePlatformTenantAuthority.p0.test.ts)
