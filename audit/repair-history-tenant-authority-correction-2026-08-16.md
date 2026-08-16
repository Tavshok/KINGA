# Repair History Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

Repair history claim, repairer, vehicle, fraud, repeat-damage, completion, and aggregate statistics paths used identifiers or an optional caller-controlled tenant selector. Omission of the selector permitted unscoped fraud, repeat-damage, and global statistics reads. Completion updates read and wrote repair rows by identifier alone.

## Correction

Every exposed repair-history operation now derives a required tenant from the authenticated session. Shared claim, repairer, and vehicle history helpers require and apply tenant scope. Fraud, repeat-damage, monthly performance, and aggregate statistic queries retain tenant predicates. Repair completion resolves and updates the repair record with both its ID and tenant.

## Verification

The deterministic regression passed **2/2**. Bundled server and Vite production builds passed; Vite emitted only the existing large-chunk advisory.

No repair history, repairer, claim, policy, payment, settlement, or financial record changed.

## References

1. [Repair history router](../server/routers/repair-history.ts)
2. [Repair history helper](../server/repair-history.ts)
3. [P1 tenant-authority regression](../server/repairHistoryTenantAuthority.p1.test.ts)
