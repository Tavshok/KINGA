# KINGA Glossary

| Term | Definition | Primary code/data context | Important distinction |
|---|---|---|---|
| Tenant | Organisational scope used to isolate data and authority. | session context, `tenants`, tenant-aware routers | A request parameter is not tenant authority. |
| Canonical resolver | Shared read contract that provides consistent data to multiple consumers. | `resolvedReportRecord.ts`, `resolvedPlatformReportCollection.ts` | It is not merely a convenience query; it prevents cross-report drift. |
| ForensicReportModel | Tenant-scoped read model for forensic report presentation. | `forensicReportModel.ts` | It represents evidence/approval data; it is not a payment workflow. |
| Claim event | Recorded claim-related event. | `claim_events`, workflow/report history | It may not prove a complete state-transition history unless code establishes it. |
| Approval | Recorded authorised human/governed decision step. | approval/decision/workflow routes | An AI recommendation is not approval. |
| Evidence provenance | Source/classification/eligibility information for evidence. | image/pipeline evidence modules | Provenance must remain visible when confidence or eligibility is limited. |
| Degraded path | Controlled result where required inputs/provider work are incomplete or fail. | pipeline Stage 6 and report UI states | It must not look like a complete successful assessment. |
| AI assessment | Persisted output/finding related to AI analysis. | `ai_assessments`, AI routers | Persistence does not convert it to an approved business fact. |
| Object authority | Proof that the current user may access a particular claim/document/inspection/etc. | routers and domain middleware | Tenant membership alone may be insufficient. |
| Platform administrator | Explicit privileged scope beyond ordinary tenant roles. | platform/admin routers and middleware | Must be explicit and audited; never inferred from a fallback. |
| Report tier | Distinct report presentation/consumer with shared underlying claim facts. | `server/reporting/` | Tiers must agree on shared canonical values. |
| Fixture ownership | Test data created, identified and cleaned only by its own test suite. | tests and teardown practices | Prevents accidental mutation/deletion of real or parallel-test records. |
| Raw SQL | Database query written outside Drizzle mapping. | server data access code | Must use physical DB column names and preserve tenant/object filtering. |
| Source schema | TypeScript Drizzle definition in the repository. | `drizzle/schema.ts` | It may differ from the live database until reconciliation is verified. |
