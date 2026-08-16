# Insurer Quote and Policy Read Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

Several insurer read procedures treated `isAdminRole()` as implicit cross-tenant evidence authority. An administrative-shell user could retrieve another tenant's quote detail, view all pending payment-proof records, or generate another tenant's policy PDF. Those operations disclose quote, payment-proof, policy, vehicle, carrier, and product data without an explicitly selected and audited cross-tenant scope.

## Correction

Every corrected read now requires the caller's session tenant. Quote detail resolves the quote tenant before customer ownership. The pending-payment queue always filters by actor tenant. Policy PDF generation resolves the policy tenant before customer ownership, vehicle, carrier, product, or PDF processing. A foreign target returns a non-enumerating `NOT_FOUND` result.

The correction does not modify payment submission, payment verification, payment rejection, policy issuance, premium, or settlement workflow. Those mutation paths are recorded separately for explicit financial/policy approval.

## Verification

The focused regression passed **3/3**. It proves an administrative-shell user cannot read a foreign-tenant quote, a same-tenant customer retains their own quote read, and the pending-payment/policy-PDF paths contain the required tenant scope. The bundled server and Vite production builds passed; Vite emitted only the existing large-chunk advisory.

No claim, quote value, policy, premium, payment, settlement, or financial record changed.

## References

1. [Insurer core router](../server/routers/insurance-core.ts)
2. [Read authority regression](../server/insurerReadAuthority.p0.test.ts)
