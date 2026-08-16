# Photo Re-Extraction Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

Photo re-extraction job triggers, job polling, latest-result retrieval, and LLM classification cache reads and writes accepted assessment, claim, or job identifiers without a session-derived tenant constraint. An authenticated caller could therefore discover job details or reuse a foreign assessment cache.

## Correction

All four procedures now require the session tenant. A shared resolver verifies that the requested assessment and, where applicable, its claim are both in that tenant. Job polling joins the job parent claim and filters by tenant. Classification now requires an assessment identifier, validates it before any cache or LLM path, and cache writes retain the assessment ID plus tenant predicate. Latest-job reads validate the assessment before reading the job.

## Verification

The deterministic regression passed **2/2**. Bundled server and Vite production builds passed; Vite emitted only the existing large-chunk advisory.

No photo re-extraction job, assessment, claim, document, policy, payment, settlement, or financial record changed.

## References

1. [Photo re-extraction router](../server/routers/photo-reextraction.ts)
2. [P1 tenant-authority regression](../server/photoReextractionTenantAuthority.p1.test.ts)
