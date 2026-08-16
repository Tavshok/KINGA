# Insurer Vehicle Registration Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

The insurance quote-request procedure looked up fleet vehicles by registration number alone. If a registration belonged to another customer or tenant, the procedure reused that foreign vehicle as the quote target. That could attach a new insurance quote to another tenant's vehicle and disclose or reuse its stored risk context.

## Correction

Quote creation now first resolves a registration using the authenticated customer ID and tenant. A caller may reuse only their own tenant-scoped vehicle. If the registration is already linked to any other authorised record, the procedure returns a generic conflict before it calculates risk, creates a vehicle, selects products, or writes a quote. The foreign record is not disclosed or modified.

## Verification

The isolated actual-procedure regression passed **1/1**. It created a foreign-tenant vehicle, attempted a quote request from another tenant using the same registration, and proved that the request is denied before any tenant-A vehicle or quote row is created. Final database verification found zero synthetic vehicle or quote records.

The correction does not change market valuation, quotation pricing, product eligibility, payment modes, policy issuance, claims, or settlement rules. It only binds vehicle reuse to the caller's tenant and ownership.

## References

1. [Insurer quote router](../server/routers/insurance-core.ts)
2. [Scoped vehicle lookup](../server/insurance/insurance-db.ts)
3. [Actual authority regression](../server/insuranceVehicleRegistrationAuthority.p0.test.ts)
