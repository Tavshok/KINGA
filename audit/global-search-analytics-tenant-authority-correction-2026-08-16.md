# Global Search Analytics Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

The global-search analytics query accepted an optional tenant ID for insurer callers and used an unscoped `1=1` predicate when it was omitted. An insurer or ordinary administrative-shell user could therefore select another tenant or retrieve analytics across every tenant.

## Correction

Non-platform callers now require a session tenant and are bound to it; a supplied mismatch is denied. Platform-super-admin analytics requires an explicit tenant selection, so it has no implicit platform-wide fallback. The final analytics query always uses an equality predicate against the resolved analytics tenant.

## Verification

The regression passed **2/2**, proving session-tenant enforcement for non-platform callers, explicit selection for platform-super-admin, and removal of the `1=1` fallback. The bundled server and Vite production build passed; Vite emitted only existing large-chunk advisories.

No search history, analytics record, claim, policy, payment, settlement, or financial record changed.

## References

1. [Global search router](../server/routers/global-search.ts)
2. [Tenant-authority regression](../server/globalSearchAnalyticsTenantAuthority.p1.test.ts)
