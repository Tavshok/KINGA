# Vehicle Passport Required Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

Vehicle Passport retrieval by registry ID and registration number now requires a session tenant before vehicle access. That mandatory tenant is passed to access admission, passport aggregation, renewal-risk computation, and authorised pre-loss evidence reads. Optional tenant helper arguments are removed from these exposed intelligence paths. The focused regression passed **1/1**; bundled server and Vite builds passed with only the existing large-chunk advisory. No vehicle, passport, inspection, claim, policy, payment, settlement, or financial record changed.

## References

1. [Vehicle Passport router](../server/routers/vehicle-passport.ts)
2. [P1 regression](../server/vehiclePassportRequiredTenantAuthority.p1.test.ts)
