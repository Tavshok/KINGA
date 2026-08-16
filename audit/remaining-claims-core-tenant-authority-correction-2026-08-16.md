# Remaining Claims-Core Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

The remaining claims-core direct read and workflow paths still used static `default` tenant fallbacks or gave the administrative shell an omitted tenant. This affected claimant lists, search, assessor assignments, direct claim detail, AI trigger/reset/debug, technical approval, send-back, processing closure, escalation, reopening, financial approval, panel-beater choice disclosure, and claim currency propagation. Some final status/currency writes also used claim ID alone.

## Correction

Claims-core now uses strict `requireSessionTenant` for tenant-bound collection reads and `requireTenantScopedClaim` for direct claim work. The former default and administrative-unscoped paths are removed. AI trigger failure/preflight, stuck reset, processing close, financial approval, and currency writes retain exact claim ID plus tenant predicates. Currency propagation also retains tenant scope for assessments and panel-beater quotes. Approval notifications use the already-resolved tenant rather than a default fallback.

## Verification

The expanded claims-core deterministic authority regression passed **3/3**. It covers policy/sign-off, settlement/dispute/payment/rejection/override, and the newly corrected direct detail, assessment, reset/debug, approval, workflow, financial, panel-choice, and currency paths. The server bundle and Vite production build passed; Vite emitted only existing large-chunk advisories.

No claim, assignment, AI assessment, quote, approval, workflow, policy, payment, settlement, currency, or financial record changed.

## References

1. [Claims core router](../server/routers/claims-core.ts)
2. [Claims-core authority regression](../server/claimsCoreTenantAuthority.p0.test.ts)
