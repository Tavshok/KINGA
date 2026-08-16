# Legacy Claim Report Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

The legacy report validation and report-PDF generation procedures used an authorised role check but passed a caller-supplied claim ID directly into the intelligence aggregator. A permitted user could validate or generate a report for a foreign claim because no session-derived tenant scope was established first.

## Correction

Both procedures now invoke a shared resolver that requires a tenant-scoped session, validates the numeric claim ID, and resolves the claim under that tenant before intelligence aggregation. The report permission check now also uses the shared administrative role contract, so platform-super-admin is treated consistently with the rest of the server.

## Verification

The deterministic regression passed **2/2**, proving tenant-owned claim resolution in validation and generation plus use of the shared administrative role contract. The bundled server and Vite production build passed; Vite emitted only the existing large-chunk advisory.

No report, claim, snapshot, policy, payment, settlement, or financial record changed.

## References

1. [Legacy claim reports router](../server/routers/claim-reports-core.ts)
2. [Tenant-authority regression](../server/claimReportTenantAuthority.p0.test.ts)
