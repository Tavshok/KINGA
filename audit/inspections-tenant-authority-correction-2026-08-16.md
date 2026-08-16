# Inspections Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

Inspection listing, engineer assignment, and inspection-to-claim linking now require a session tenant. The tenant is retained in the inspection list predicate, engineer-profile lookup and workload update, inspection access resolver, and linked claim lookup. Empty-string tenant fallbacks are removed from these procedures. The focused regression passed **1/1**; bundled server and Vite builds passed with only the existing large-chunk advisory. No inspection, engineer assignment, claim, policy, payment, settlement, or financial record changed.

## References

1. [Inspections router](../server/routers/inspections.ts)
2. [P1 regression](../server/inspectionsTenantAuthority.p1.test.ts)
