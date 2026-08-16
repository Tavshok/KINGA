# Insurer Quote and Policy Vehicle-Link Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

Even after quote and policy target records were tenant-scoped, two supporting vehicle lookups were not. Quote history loaded vehicle rows by ID alone, and policy PDF generation loaded the linked vehicle by ID alone. A legacy record carrying a stale foreign vehicle ID could therefore expose a registration, make, or model after the main quote/policy authority check had succeeded.

## Correction

Customer quote history now filters both quote rows and vehicle enrichment by the actor tenant. If a historical quote has no vehicle available in that tenant, the response carries the safe `Vehicle details unavailable` state rather than an internal vehicle ID or foreign attributes. Policy PDF generation resolves the policy and its vehicle with actor-tenant predicates before reading vehicle data or generating output.

## Verification

The insurer authority regression passed **5/5**. It preserves same-tenant customer quote access, confirms tenant predicates in quote history and policy PDF vehicle loading, and retains the previously validated payment and read boundaries. The bundled server and Vite production build passed; Vite emitted only the existing large-chunk advisory.

No production quote, policy, vehicle, payment, premium, settlement, claim, or other financial record changed.

## References

1. [Insurer core router](../server/routers/insurance-core.ts)
2. [Insurer authority regression](../server/insurerReadAuthority.p0.test.ts)
