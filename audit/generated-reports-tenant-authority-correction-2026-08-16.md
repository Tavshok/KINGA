# Generated Reports Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

Executive, financial, and audit-trail report generation now require a session tenant and reject a caller-supplied tenant that differs from it. Each report query retains its tenant predicate. The focused regression passed **1/1**; bundled server and Vite builds passed with only the existing large-chunk advisory. No report, claim, audit, policy, payment, settlement, or financial record changed.

## References

1. [Reports router](../server/routers/reports.ts)
2. [P0 regression](../server/reportsTenantAuthority.p0.test.ts)
