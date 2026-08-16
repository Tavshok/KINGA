# Pipeline Observability Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

Pipeline observability used a global role list and queried recent runs, run details, stage health, claim runs, and dashboard aggregates without tenant predicates. An authorised operations user could inspect another tenant's pipeline run, stage jobs, failed-run evidence, token usage, and aggregate health data by run or claim identifier.

## Correction

Observability now uses the shared administrative-role contract plus approved insurer operational roles and requires a session tenant. Every run, job, claim history, stage-health, and dashboard query filters by that tenant. Run detail checks the tenant-scoped run before querying jobs and returns the existing safe empty shape for an inaccessible run.

## Verification

The deterministic regression passed **2/2**, proving role/session-tenant enforcement and tenant filters across all five exposed queries. The bundled server and Vite production build passed; Vite emitted only existing large-chunk advisories.

No pipeline run, job, claim, assessment, policy, payment, settlement, or financial record changed.

## References

1. [Pipeline observability router](../server/routers/pipeline-observability.ts)
2. [Tenant-authority regression](../server/pipelineObservabilityTenantAuthority.p1.test.ts)
