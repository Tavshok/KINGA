# Marketplace Relationship Listing Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

The approved panel-beater and assessor marketplace listing procedures accepted a caller-supplied insurer tenant ID and queried relationship records without comparing it to the authenticated user tenant. Any authenticated user could request another insurer's approved-provider relationship, preferred-provider, SLA, and contact evidence.

## Correction

Both listing procedures now require a non-empty session tenant that exactly equals the requested insurer tenant before the database query. A mismatch fails before profile or relationship data is read. The existing approved-status, provider-type, country, and preferred-sort rules remain unchanged.

## Verification

The deterministic authority regression passed **2/2**, proving both panel-beater and assessor listing paths enforce the authenticated insurer tenant. The bundled server and Vite production build passed; Vite emitted only the existing large-chunk advisory.

No marketplace profile, relationship, claim, policy, payment, settlement, or financial record changed.

## References

1. [Marketplace router](../server/routers/marketplace.ts)
2. [Tenant-authority regression](../server/marketplaceRelationshipTenantAuthority.p0.test.ts)
