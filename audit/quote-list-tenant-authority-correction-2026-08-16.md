# Quote-List Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

The legacy `quotes.byClaim` query removed the tenant filter whenever the caller had an administrative role. Although ordinary callers used a tenant-filtered query, this created implicit all-tenant quote visibility for administrative shell users and did not first resolve the target claim in the caller tenant.

## Correction

The query now requires a session tenant for every caller, resolves the requested claim in that tenant, and returns quote evidence only through the tenant-scoped data helper. A missing or foreign claim produces the existing empty-list contract. Explicit platform-super-admin report-audit selection remains isolated in the separate `quotes.getWithLineItems` path, which requires the selected tenant parameter.

## Verification

The actual isolated quotation authority suite passed **6/6**. The added case proves an administrative caller can read quotations for a claim in its own tenant but cannot enumerate a non-existent or foreign target through the legacy quote list. The same suite preserves repairer quote, parent quote, assessor adjustment, and quote-audit authority boundaries.

Final direct verification found zero synthetic claims, quotes, repairer profiles, and users. The bundled server and Vite production build passed; Vite emitted only the existing large-chunk advisory.

No production quote, claim, L1/L2, policy, payment, settlement, or financial record changed.

## References

1. [Quote router](../server/routers/quotes-core.ts)
2. [Actual authority regression](../server/panel-beater/quoteSubmissionAuthority.p0.test.ts)
3. [Report quote detail authority](../server/routers/quotes-core.ts)
