# Reporting Pipeline Regeneration Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

Administrative pipeline regeneration accepted a numeric claim ID and reset its pipeline state without resolving a tenant scope. Regeneration history also returned every record, with an optional claim ID filter but no tenant relationship filter. An administrative user could therefore restart or inspect another tenant's pipeline lifecycle.

## Correction

Regeneration and regeneration history now use the canonical P0 tenant-scope resolver and validation. Regeneration requires the target claim in the resolved tenant before its regeneratable-state check, audit record, reset update, or audit-log entry. The reset write retains claim ID plus tenant ID, and the audit log records the tenant. History now joins the parent claim and filters by the resolved tenant, with optional claim ID additionally checked in that tenant.

## Verification

The deterministic regression passed **2/2**, proving validated tenant scope and tenant-owned claim authority for regeneration and tenant-filtered history. The bundled server and Vite production build passed; Vite emitted only existing large-chunk advisories.

No pipeline run, claim, report, policy, payment, settlement, or financial record changed.

## References

1. [Reporting router](../server/routers/reporting.ts)
2. [Tenant-authority regression](../server/reportingRegenerationTenantAuthority.p0.test.ts)
