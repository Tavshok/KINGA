# Administrative Pipeline Health Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

`admin.getPipelineHealth` was available to any authenticated user and returned the most recent assessments from every tenant, including execution-ledger, forensic-analysis, and assumption evidence. It had neither an approved operational role boundary nor a tenant filter.

## Correction

Pipeline health now requires either the shared administrative-shell role or an authorised insurer operational role (Risk Manager, Claims Manager, Executive, or Insurer Admin), plus a session tenant. Its assessment query filters on `ai_assessments.tenant_id` before pipeline evidence is parsed or returned.

## Verification

The deterministic regression passed **2/2**, proving role/session-tenant enforcement and tenant-filtered assessment evidence. The bundled server and Vite production build passed; Vite emitted only existing large-chunk advisories.

No assessment, pipeline run, claim, policy, payment, settlement, or financial record changed.

## References

1. [Administrative router](../server/routers/admin.ts)
2. [Tenant-authority regression](../server/adminPipelineHealthTenantAuthority.p0.test.ts)
