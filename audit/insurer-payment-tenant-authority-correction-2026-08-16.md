# Insurer Payment Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

Payment-proof submission, payment verification, and payment rejection previously accepted a numeric quote ID and gave administrative-shell users implicit cross-tenant authority. A foreign payment-proof submission could reach storage and quote update work. Foreign verification could progress to policy issuance, while rejection could change another tenant's quote status.

## Correction

Every payment mutation now derives the actor tenant from the authenticated session before any side effect. Payment-proof submission resolves the quote tenant before S3 upload and writes using a quote-ID-plus-tenant predicate. Payment verification and rejection load the target quote only within the actor tenant and repeat the tenant predicate on status updates. Policy issuance remains exactly as before, but cannot be reached for a foreign quote.

The supported payment input modes remain unchanged: cash, bank transfer, EcoCash, OneMoney, RTGS, and ZIPIT. The correction governs who may submit or decide a payment event; it does not require payment to originate inside KINGA or remove external/offline payment methods.

## Verification

Two focused authority suites passed **8/8**. The isolated actual-procedure regression proves a foreign insurer cannot submit payment proof, verify payment, trigger policy issuance, or reject payment for another tenant; all denied operations leave the quote unchanged. It also proves a same-tenant insurer can retain a legitimate payment-decision workflow. The final direct verification found zero synthetic payment-authority quote records.

The bundled server and Vite production build passed; Vite emitted only the existing large-chunk advisory. No production payment, policy, premium, settlement, quote value, or other financial record changed.

## References

1. [Insurer core router](../server/routers/insurance-core.ts)
2. [Actual payment authority regression](../server/insurancePaymentAuthority.p0.test.ts)
3. [Insurer read authority regression](../server/insurerReadAuthority.p0.test.ts)
