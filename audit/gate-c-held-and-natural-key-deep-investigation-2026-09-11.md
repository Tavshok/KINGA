# Gate C Candidate Deep Investigation and Tenant-Role Update Proposal

## Purpose and evidence boundary

This report is a **read-only repository investigation**. It covers the eight tables intentionally held outside Gate C, the four natural/composite-unique candidates, and the separately discovered tenant-role update defect. It does not add a source constraint, alter application code, generate SQL, create a scratch database, access `kinga_staging` or production, create a migration account, or begin Gate D.

The findings distinguish source-proven reachability from deployment confirmation. Current source is compared with `user_github/main` at `c69b446c7d4305a85e96d46e992564020b7b8a1a`; the managed workspace checkpoint remains blocked by a platform-reported merge conflict and is not evidence of a running deployment revision. No staging or production request was made.

## Priority finding — tenant role-configuration update

The active public mutation is `tenant.updateRoleConfig`. It is registered in the root tRPC router and is exposed by `server/routers/tenant.ts`. It receives `tenantId`, one enumerated `role`, and optional permission fields, calls `requireTenantAdministrationScope`, and invokes `updateTenantRoleConfig(tenantId, role, permissions)`.[1] [2]

The service currently reads existence by `tenantId` alone and then updates by `tenantId` alone. The supplied `role` is used only when the tenant has no role configuration at all. Consequently, when a tenant has its ordinary five default role rows, an administrator updating one role’s configuration can update the `enabled`, `permissions`, and `updatedAt` fields of **every role configuration row for that tenant**.[3]

| Question | Evidence-based answer |
|---|---|
| Which endpoint reaches it? | `tenant.updateRoleConfig`, a protected tRPC mutation in `server/routers/tenant.ts:183–200`.[1] |
| Which source callers expose it? | `client/src/pages/admin/TenantManagement.tsx`, `client/src/pages/admin/TenantProvisioning.tsx`, and `client/src/pages/admin/TenantRoleConfig.tsx` reference the role-config query/mutation surface. |
| Is access tenant/role guarded? | The router invokes `requireTenantAdministrationScope(ctx, tenantId, "update_role_config")`. It rejects unauthenticated and non-admin users; `platform_super_admin` must satisfy the explicit selected-tenant P0 scope contract. Legacy `admin` keeps its established entitlement.[2] |
| Is it source-reachable today? | Yes. The router is registered as `tenant: tenantRouter` in `server/routers.ts`, and both the router and service are byte-identical to current `user_github/main` at `c69b446c`.[4] |
| Is it confirmed reachable in current staging or production today? | **Not proven.** Confirming a deployed revision, tenant data state, or authenticated live invocation would require access that is outside this read-only, no-staging/no-production authority. Source reachability does not prove deployment reachability. |

The defect is a priority **tenant-configuration integrity** issue. The visible P0 tenant scope guard prevents an ordinary non-admin from invoking the mutation, but a permitted administrator can unintentionally change other role settings inside the selected tenant. It is not evidence of a cross-tenant bypass in the current router path.

### Proposed repair for approval

The proposed repair is narrow and matches the approved `tenant_role_configs` source identity:

1. Define one role predicate: `and(eq(tenantRoleConfigs.tenantId, tenantId), eq(tenantRoleConfigs.roleKey, role))`.
2. Use that predicate for the existence lookup, the update, and any follow-up selection.
3. If no row exists for the requested pair, insert only that `(tenantId, roleKey)` pair. Do not change the router input, tenant-administration guard, role enum, default seeding loop, permissions payload, or cross-tenant policy.
4. Add a regression that seeds two or more roles for one tenant, invokes the service/mutation for one role, and proves the requested pair changes while every other role’s `enabled` and `permissions` value is unchanged. Add a companion no-row case proving only the requested pair is inserted.

The source trace found no role-configuration version/history model or legitimate duplicate `(tenantId, roleKey)` creator. New tenant provisioning inserts one default row per fixed role key, and the public mutation accepts exactly one role key.[3] The proposed predicate is therefore consistent with the approved composite key and does not decide any separate business rule.

> **Approval requested before implementation:** authorise a dedicated priority branch that changes only the service predicate and adds the tenant/role-specific regression tests. It should be verified against a local disposable database or narrowly mocked query contract as appropriate, but must not be mixed with Gate D work.

## Held candidate tables — deeper source assessment

| Table | Current source/history evidence | Current code-path assessment | Recommendation |
|---|---|---|---|
| `tenant_usage_summary` | Defined only in `drizzle/schema-usage-events.ts`, introduced with the February monetisation consolidation. It is outside the configured canonical schema generation surface.[5] | No exact current router, service, worker, scheduled job, UI, feature flag, or pipeline reference was found. | **Remain held.** Confirm the live usage/billing owner, inputs, writer, reader, retention, and activation path before admitting it to any future baseline. |
| `tenant_tier_history` | Defined only in the same unconfigured usage-events schema module and introduced with the monetisation consolidation.[5] | No exact current router, service, worker, UI, worker, or pipeline consumer was found. | **Remain held.** Decide whether tier changes are audit/history facts, an entitlement configuration history, or a billing ledger; then designate a writer/reader before baseline inclusion. |
| `audit_logs` | Canonical declaration is a general action/state/integrity-hash record. The source has multiple other audit structures, including `audit_trail`, `insurance_audit_logs`, `workflow_audit_trail`, and specialised audit tables.[6] | No executable source query, writer, or reader of `audit_logs` was found. The forensic report obtains claim events from `insurance_audit_logs`, not this table; platform operations likewise documents `insurance_audit_logs` as its audit source.[7] | **Remain held.** Establish the canonical general-audit owner and event-production model first; otherwise inclusion would preserve a duplicate dormant contract. |
| `benchmark_deviations` | A source declaration exists, but the table-specific search and history scan did not establish a current writer or reader. General benchmark terminology appears elsewhere but does not identify this physical table. | No exact non-test server, client, worker, scheduler, API, feature flag, or WhatsApp/channel reference was found. | **Remain held.** Name the benchmark baseline, producer, consumer, approval use, and retention need before a future baseline wave. |
| `photo_reextraction_jobs` | The table is used by an implemented router and worker rather than solely by a schema declaration. | `photoReextraction.trigger` is registered in the root router, requires a tenant-scoped assessment/claim, creates a job, and starts `runPhotoReextraction` asynchronously. `getStatus` tenant-scopes the job through `claims`; the worker reads and updates the same table.[8] No client invocation of `trpc.photoReextraction.*` was found. | **Operational decision required, not a schema-only hold.** The server capability is source-reachable but no UI/scheduler activation path was found. Confirm that this fire-and-forget worker model, document/PDF source requirement, storage/LLM dependencies, and operational ownership are intended for the deployed platform. If confirmed, admit it in a future reviewed baseline. |
| `vehicle_landmarks` | Introduced with the July Vision Geometry Engine work and present in the later structural-load-path history.[9] | The only exact non-test reference is the manual `server/vehicle-geometry-seed/ingest-seed.mts` utility. The active calibration path does not read it. | **Remain held.** Confirm seed provenance, operator, update method, and whether live calibration/report evidence should consume landmark records before persistence is baselined. |
| `geometry_sources` | Introduced with the same Vision Geometry Engine schema family.[9] | No exact non-test writer, reader, route, UI, worker, feature flag, or WhatsApp/channel reference was found. | **Remain held.** Define a geometry-source provenance model and its relationship to the active vehicle geometry tables before inclusion. |
| `vision_calibration_results` | Introduced with the Vision Geometry Engine schema family and referenced in the subsequent structural-load-path history.[9] | No exact non-test persistence consumer was found. The active Stage 6.5A path computes calibration state in the assessment/pipeline flow rather than reading or writing this table. | **Remain held.** Decide whether calibration results need durable persistence, and if so define writer, reader, retention, correction, and report-evidence semantics before inclusion. |

There is no table-specific WhatsApp pipeline reference, UI feature flag, or PR-description evidence that changes the recommendation for any held candidate. The only candidate with a source-reachable asynchronous operational channel is `photo_reextraction_jobs`; it still needs an explicit operational-support decision because the current source shows no UI caller or scheduler.

## Natural/composite-unique candidate investigation

The four tables already have explicit surrogate primary keys. The question is not identity; it is whether a further natural/composite unique rule correctly reflects the business lifecycle. No table has been changed.

| Table | Existing semantics and current use | Why no new unique constraint should be inferred | Decision needed |
|---|---|---|---|
| `assessor_insurer_relationships` | Stores `relationshipType`, status, contract dates, rates, performance statistics, and preferred-vendor state. Its index named `unique_assessor_tenant` is an ordinary non-unique index, not a declared unique constraint.[10] No non-test writer or reader was found. | One assessor/tenant pair might have successive contracts or different relationship types. The current source does not say whether historic rows are valid or whether there may be only one active relationship. | Decide between a single all-time pair, history-preserving contract rows, or one-active relationship. If history is valid, a simple all-time `(assessorId, tenantId)` unique constraint would be wrong. |
| `policy_claim_links` | Stores coverage verification/approval decisions, verifier fields, a decision reason, and creation time. No table-specific runtime writer or reader was found.[11] | It is unclear whether one policy may be linked to a claim more than once for endorsement, correction, revised coverage, or decision history. | Specify whether the unit is one link, one current coverage decision, or a historical coverage-decision record; then decide any constraint around `(policyId, claimId)`. |
| `fleet_drivers` | Actively read by claim intake to attribute a company claim to an **active** assigned driver, and by fleet intelligence/aggregation paths. It has `hireDate`, `employmentStatus`, and `terminationDate` but no source-declared unique pair constraint.[12] | Those lifecycle fields support re-hire/history. A permanent `(fleetId, userId)` unique constraint could prevent a valid new employment record. Current source also does not establish whether a driver may be active in more than one fleet. | Decide whether duplicate historic rows are valid and whether a one-active-assignment rule is required. A safe enforcement design likely needs an explicit active-membership model rather than an all-time unique pair. |
| `entity_relationships` | Models typed directed entity pairs with relationship strength, interaction counts/dates, collusion signals, evidence, and investigation state. No non-test producer or consumer was found beyond general schema imports.[13] | Pair ordering, reciprocal equivalence, evidence aggregation, and repeat-event semantics are undefined. A conventional pair constraint could wrongly collapse meaningful records or fail to prevent mirrored duplicates. | Define canonical A/B ordering, whether reciprocal pairs are identical, whether the record is an aggregate or an event, and the intended behaviour when relationship type changes. |

## Recommended next decisions

The Gate C held-candidate investigation does not itself create a sixth baseline wave. The table decisions should remain separate from any later staging work. The most actionable next item is the tenant-role service repair, because it is an active source-reachable admin mutation with an exact minimal predicate correction and a testable acceptance contract.

For the held candidates, `photo_reextraction_jobs` is the only one that now has a stronger case for future baseline admission after an operational-support decision. All other held tables lack the required current writer/reader or clear business lifecycle. For the natural-key candidates, none should receive a new unique constraint until the associated lifecycle rule is explicitly chosen.

## References

[1]: ../server/routers/tenant.ts#L168-L200 "Tenant role configuration tRPC procedures"
[2]: ../server/security/tenantAdministration.ts#L1-L33 "Tenant administration scope guard"
[3]: ../server/services/tenant-config.ts#L205-L216 "Default role creation" and ../server/services/tenant-config.ts#L333-L397 "Current role read/update implementation"
[4]: ../server/routers.ts#L19-L21 "Tenant router import" and ../server/routers.ts#L365-L367 "Tenant router registration"
[5]: ../drizzle/schema-usage-events.ts "Unconfigured usage/tier declarations"
[6]: ../drizzle/schema.ts#L631-L665 "General audit_logs and audit_trail declarations"
[7]: ../server/reporting/forensicReportModel.ts#L464-L471 "Forensic report insurance audit source" and ../server/routers/platform-operations.ts#L2-L8 "Platform audit source declaration"
[8]: ../server/routers/photo-reextraction.ts#L20-L140 "Tenant-scoped photo re-extraction router" and ../server/photo-reextraction-worker.ts "Photo job worker"
[9]: ../docs/WAVE2_SLPE_DESIGN.md "Vision Geometry Engine context" and Git commits ae29ee47, bd920d39
[10]: ../drizzle/schema.ts#L535-L560 "Assessor–insurer relationship declaration"
[11]: ../drizzle/schema.ts#L2795-L2806 "Policy–claim link declaration"
[12]: ../drizzle/schema.ts#L1736-L1762 "Fleet driver lifecycle declaration" and ../server/routers/claims-core.ts#L420-L437 "Active fleet-driver claim attribution"
[13]: ../drizzle/schema.ts#L1510-L1530 "Entity relationship declaration"
