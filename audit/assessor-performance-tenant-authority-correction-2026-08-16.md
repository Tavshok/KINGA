# Assessor Performance Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

The assessor performance endpoint previously accepted any assessor ID and used a default or unscoped tenant path. It now requires a session tenant, resolves the assessor user inside that tenant, and passes that tenant through claim, AI-assessment, and quote evidence reads. The focused regression passed **1/1**; bundled server and Vite production builds passed with only the existing large-chunk advisory. No operational or financial records changed.

## References

1. [Assessors router](../server/routers/assessors-core.ts)
2. [P0 regression](../server/assessorPerformanceTenantAuthority.p0.test.ts)
