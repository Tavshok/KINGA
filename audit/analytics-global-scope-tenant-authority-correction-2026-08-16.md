# Analytics Global-Scope Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

All analytics routes now resolve a required session tenant rather than granting administrative or platform-global implicit access. Assessor, panel-beater, cost-savings, financial, Risk Manager KPI, executive-alert, month-comparison, claims-ageing, escalation, settlement-trend, fraud-funnel, and workflow-bottleneck reads retain tenant predicates. Raw KPI predicates now use parameterised tenant SQL where supported; legacy alert fragments are derived only from the required session tenant with SQL quoting. The focused regression passed **2/2**; bundled server and Vite builds passed with only the existing large-chunk advisory. No analytics, claim, assessment, policy, payment, settlement, or financial record changed.

## References

1. [Analytics router](../server/routers/analytics.ts)
2. [P0 regression](../server/analyticsGlobalScopeTenantAuthority.p0.test.ts)
