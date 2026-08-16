# Historical Ground-Truth Tenant Write Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

Historical ground-truth capture verified the parent claim tenant at entry but several later writes used only the claim, approval-record, or prediction ID. The duplicate approval update, final-cost/decision update, variance status update, and prediction-accuracy update therefore did not retain the session tenant at their write boundaries.

## Correction

The duplicate ground-truth approval update now includes the approval record tenant. Both parent historical-claim updates include claim ID and tenant ID. Prediction accuracy selection and update now include the prediction tenant. These conditions preserve the authorised tenant scope established by the initial target claim lookup across every downstream training-label and final-decision write.

## Verification

The expanded deterministic regression passed **2/2**, covering both repair-item and ground-truth write boundaries. The bundled server and Vite production build passed; Vite emitted only the existing large-chunk advisory. No historical claim, final approval record, prediction log, training label, policy, payment, settlement, or financial record changed.

## References

1. [Historical claims router](../server/routers/historical-claims.ts)
2. [Tenant-write regression](../server/historicalRepairItemTenantAuthority.p0.test.ts)
