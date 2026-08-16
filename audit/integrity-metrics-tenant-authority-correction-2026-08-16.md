# Integrity Metrics Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

Integrity Metrics now binds ordinary users to the authenticated session tenant and rejects a supplied tenant mismatch. `platform_super_admin` may inspect metrics only after explicitly supplying the tenant to inspect; the prior implicit global administrative path is removed. The assessment query always contains a tenant predicate. The focused regression passed **1/1**; bundled server and Vite builds passed with only the existing large-chunk advisory. No assessment, integrity metric, claim, policy, payment, settlement, or financial record changed.

## References

1. [Legacy root router](../server/routers.ts)
2. [P0 regression](../server/integrityMetricsTenantAuthority.p0.test.ts)
