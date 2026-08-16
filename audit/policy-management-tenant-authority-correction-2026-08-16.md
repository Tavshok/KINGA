# Policy Management Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

Policy-management routes accepted an optional caller-supplied tenant ID and preferred it over the authenticated session tenant. This allowed an authorised insurer administrator or executive to direct policy creation, activation, listing, simulation, update, deletion, impact metrics, and comparison requests to another tenant. Policy activation and deletion write predicates also used policy IDs alone after tenant-qualified prechecks. Policy update ignored its `policyId` before creating a new version.

## Correction

All policy-management routes now derive tenant scope from the authenticated session and reject a supplied tenant mismatch. Policy activation and deletion retain policy ID plus tenant ID at their final writes. Policy update first verifies that the supplied policy belongs to the session tenant before creating a version. The change preserves existing same-tenant policy governance, profile templates, simulations, and reporting calculations.

## Verification

The deterministic tenant-authority regression passed **2/2**, proving all ten tenant-scoped routes use the session resolver and that activation, update validation, and deletion retain policy tenant predicates. The bundled server and Vite production build passed; Vite emitted only the existing large-chunk advisory.

No policy configuration, product, premium, claim, payment, settlement, or financial record changed.

## References

1. [Policy management router](../server/routers/policy-management.ts)
2. [Policy activation service](../server/services/policy-activation.ts)
3. [Tenant-authority regression](../server/policyManagementTenantAuthority.p0.test.ts)
