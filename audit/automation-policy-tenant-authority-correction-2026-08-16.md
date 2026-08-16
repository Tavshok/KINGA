# Automation Policy Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

Automation policy creation used a static `default` tenant fallback. Active policy and history reads used an unscoped path for administrative-shell roles. Policy update accepted a numeric ID and issued its final update without a tenant predicate. These paths could expose or alter another tenant's automation confidence, fraud, approval, and eligibility configuration.

## Correction

All exposed automation policy operations now require a session tenant. Creation uses it directly; active policy and history always query it. The manager helper signatures require a tenant ID, and policy update retains both policy ID and tenant ID at the final write predicate. The policy engines themselves and threshold rules remain unchanged.

## Verification

The deterministic regression passed **2/2**, proving session tenant is required for every exposed operation, default/unscoped paths are absent, and active/history/update helpers retain tenant predicates. The bundled server and Vite production build passed; Vite emitted only existing large-chunk advisories.

No automation policy, claim, assessment, approval, payment, settlement, or financial record changed.

## References

1. [Automation policy router](../server/routers/automation-policies.ts)
2. [Automation policy manager](../server/automation-policy-manager.ts)
3. [Tenant-authority regression](../server/automationPolicyTenantAuthority.p0.test.ts)
