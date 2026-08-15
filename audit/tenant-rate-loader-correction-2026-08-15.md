# AUD-P1-016 Tenant-Rate Override Loader Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 15 August 2026  
**Status:** Corrected and verified  
**Scope:** Minimal runtime reference correction and isolated regression only. No claim was rerun, and no tenant configuration, rate value, quotation, L1/L2 formula, policy, payment, settlement, or stored operational record was changed.

## Root Cause

The assessment entry path in `server/db.ts` attempted to call `getTenantRates(claim.tenantId)` without importing that function. The function is owned and exported by `server/db/intelligence-db.ts`, which depends only on the shared database-core layer and therefore creates no circular dependency when imported by `server/db.ts`.

The resulting `ReferenceError` was caught by an intended non-fatal fallback, allowing assessments to continue with regional defaults. The catch therefore protected claim continuity but also meant configured tenant rate overrides were silently unavailable on that path.

## Correction and Boundary

The correction adds the single missing import:

```ts
import { getTenantRates } from './db/intelligence-db';
```

No calculation, rate value, fallback condition, tenant configuration, persistence operation, or pipeline stage was changed. A configured override is now reachable by future assessments; the existing `null` result continues to preserve regional-default fallback when a tenant has no configured rates.

## Regression Evidence

| Assertion | Result |
|---|---|
| Configured labour, paint, currency, and country override is returned | Passed |
| Configured currency takes precedence over tenant-column defaults | Passed |
| No configured override/default returns `null` and preserves fallback | Passed |
| Assessment entry imports the reader before its existing call site | Passed |
| Focused tenant-rate/source-evidence/boundary regression group | 3 files, 14 tests passed |
| Bundled server build | Passed |
| Vite production build | Passed; existing large-chunk warning only |

## Conclusion

AUD-P1-016 is resolved. The correction restores the intended tenant-rate lookup without introducing a new business rule or altering existing records. The pre-existing non-fatal fallback remains available only for genuinely absent or unreadable rate configuration rather than an unresolved local reference.

## References

1. [Assessment entry module](../server/db.ts)
2. [Tenant-rate reader](../server/db/intelligence-db.ts)
3. [AUD-P1-016 isolated regression](../server/db/intelligence-db.tenantRates.p1.test.ts)
