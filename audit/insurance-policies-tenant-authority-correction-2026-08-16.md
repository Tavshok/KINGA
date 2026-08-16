# Insurance Policies Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

Personal policy listing now derives a required tenant from the session and passes it to the policy helper. The helper filters policy records by both customer identity and tenant. The focused regression passed **1/1**; bundled server and Vite builds passed with only the existing large-chunk advisory. No policy, claim, payment, settlement, or financial record changed.

## References

1. [Insurance router](../server/routers/insurance-core.ts)
2. [Policy helper](../server/insurance/policy-issuance.ts)
3. [P0 regression](../server/insurancePoliciesTenantAuthority.p0.test.ts)
