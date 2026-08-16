# Tenant Administration User Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

Pending registration listing, user deactivation, and user role updates checked only an administrative role and used user IDs without tenant predicates. An administrative-shell user could enumerate unverified users or deactivate/change the role of a user in another tenant.

## Correction

Each procedure now uses `isAdminRole()` and requires a session tenant. Pending registrations filter `users.tenant_id`. Deactivation and role update retain both user ID and tenant ID in their final write predicates. Self-deactivation prevention remains intact.

## Verification

The deterministic regression passed **2/2**, proving shared administrative role/session tenant checks, tenant-filtered pending registrations, and tenant-bound user writes. The bundled server and Vite production build passed; Vite emitted only existing large-chunk advisories.

No user, role, tenant, claim, policy, payment, settlement, or financial record changed.

## References

1. [Administrative router](../server/routers/admin.ts)
2. [Tenant-authority regression](../server/tenantAdministrationUserAuthority.p1.test.ts)
