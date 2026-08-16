# Workflow Configuration Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

Workflow configuration reads and writes used `ctx.user.tenantId || "default"`. A tenantless session with an insurer-admin or executive role could therefore access or update a shared static default configuration, creating a cross-tenant governance path.

## Correction

Both configuration procedures now require a non-empty session-derived tenant before calling the workflow integration. The established insurer-admin/executive role boundary remains unchanged; same-tenant governance continues to use the caller tenant.

## Verification

The deterministic regression passed **1/1**, proving the default fallback is absent and both read/write paths require tenant scope. The bundled server and Vite production builds passed; Vite emitted only the existing large-chunk advisory.

No workflow configuration, claim, policy, payment, settlement, or financial record changed.

## References

1. [Workflow router](../server/routers/workflow.ts)
2. [Tenant-authority regression](../server/workflowConfigurationTenantAuthority.p0.test.ts)
