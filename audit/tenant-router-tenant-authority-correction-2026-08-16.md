# Tenant Router Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

Tenant listing, detail, role configuration, workflow threshold, and SLA configuration reads accepted a supplied tenant identifier without verifying that it matched the authenticated session. Listing returned all insurer tenants.

## Correction

The router now requires the requested tenant identifier to equal the authenticated user's session tenant before protected configuration reads. Tenant listing is limited to the session tenant and a session without a tenant is denied.

## Verification

The deterministic regression passed **2/2**. Bundled server and Vite production builds passed; Vite emitted only the existing large-chunk advisory.

No tenant configuration, claim, policy, payment, settlement, or financial record changed.

## References

1. [Tenant router](../server/routers/tenant.ts)
2. [P1 tenant-authority regression](../server/tenantRouterTenantAuthority.p1.test.ts)
