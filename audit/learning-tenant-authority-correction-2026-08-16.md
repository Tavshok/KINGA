# Learning and Calibration Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

Learning analytics read validated assessment, claim, learning-record, and calibration-override data without a session tenant predicate. Calibration updates used a static `default` fallback tenant.

## Correction

Cost pattern, fraud pattern, calibration drift, learning statistics, jurisdiction summary, out-of-domain checks, out-of-domain summaries, calibration feedback, calibration updates, and calibration history now require a session tenant. Assessment and parent-claim analytics filter both records by tenant. Learning records and calibration history are tenant-bound, and the default calibration tenant fallback is removed.

## Verification

The deterministic regression passed **2/2**. Bundled server and Vite production builds passed; Vite emitted only the existing large-chunk advisory.

No learning record, calibration override, claim, assessment, policy, payment, settlement, or financial record changed.

## References

1. [Learning router](../server/routers/learning.ts)
2. [P1 tenant-authority regression](../server/learningTenantAuthority.p1.test.ts)
