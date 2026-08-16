# Vehicle Valuation Photo Enrichment Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

Vehicle valuation photo enrichment now uses `isAdminRole()` for administrative admission, requires a session tenant, and resolves the claim in that tenant before reading its assessment or rendering and writing enrichment data. The static `default` and administrative tenantless paths are removed. The focused regression passed **1/1**; bundled server and Vite builds passed with only the existing large-chunk advisory. No valuation, assessment, claim, photo, policy, payment, settlement, or financial record changed.

## References

1. [Vehicle valuation core router](../server/routers/vehicle-valuation-core.ts)
2. [P0 regression](../server/vehicleValuationPhotoEnrichmentTenantAuthority.p0.test.ts)
