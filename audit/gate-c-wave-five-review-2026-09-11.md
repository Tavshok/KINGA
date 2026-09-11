# Gate C Wave 5 — Intelligence, Learning, Analytics and Secondary-Capability Scratch Baseline Review

## Scope and final Gate C boundary

Wave 5 is the final Gate C source-derived scratch baseline wave. It covers the remaining **75** intelligence, learning, analytics, calibration, benchmark, training, search, historical/replay, governance, and optimisation tables after the approved Wave 4 operational-channel reassignment of `recovery_cases`, `recovery_correspondence_log`, and `whatsapp_sessions`.

This package proves the baseline only in two disposable local MariaDB scratch databases. It did not create or change an object in `kinga_staging`, production, or another external target; create a migration account; read live data; change historical migrations or the journal; or authorise Gate D.

The eight separately held candidates remain excluded: `audit_logs`, `benchmark_deviations`, `geometry_sources`, `photo_reextraction_jobs`, `tenant_tier_history`, `tenant_usage_summary`, `vehicle_landmarks`, and `vision_calibration_results`.

## Approved key reconciliation and tenant-role trace

| Table(s) | Approved source metadata change | Result |
|---|---|---|
| `insurer_tenants`, `iso_audit_logs`, `risk_register`, `routing_history`, `routing_threshold_config` | Add `.primaryKey()` only to the existing non-null `varchar(64)` `id` | Applied only to the five named IDs. No column, index, unique constraint, relationship, data value, or other table contract changed. |
| `tenant_role_configs` | Configure `primaryKey({ columns: [table.tenantId, table.roleKey] })` | Applied after the required source-path check found no active version/history model or legitimate duplicate tenant/role record flow. |

The active creation path creates one default row per enumerated role for a new tenant. The public mutation accepts one role, and the historical repair script independently describes the same composite primary key and copies all existing rows without an archive/version table. None of those paths relies on multiple rows for one tenant/role pair.

The trace also exposed a **separate application defect that is not fixed in this package**: `server/services/tenant-config.ts` currently tests and updates `tenantRoleConfigs` with `tenantId` alone even though the public mutation supplies `role`. An update can therefore affect all role rows for a tenant rather than only the requested role. It is retained as a separately tracked correction; it was neither altered nor used to justify the primary-key reconciliation.

## Reviewed Wave 5 SQL

Wave 5 SQL is selected from a disposable full-schema source snapshot generated with a non-routable loopback placeholder. The temporary configuration and raw snapshot were removed before packaging. The retained reviewed file is `audit/gate-c-scratch-baseline/wave-05-generated/wave-05-intelligence-learning-analytics.sql`.

| Static contract | Result |
|---|---|
| Selected tables | 75, exactly the final approved Wave 5 source scope. |
| Statements | 290: 75 `CREATE TABLE`, 25 source-declared FK additions, and 190 standalone index statements. |
| Inline named unique constraints | 7, for **197** source index/unique artefacts in total. |
| Foreign keys | 25, all sourced by Wave 5 tables and targeting Wave 1–4 prerequisite tables. |
| Source snapshot SHA-256 | `8aad7291c96684e0f2cbf93a8286741308c4100b32c94a5508d5ddf5dd8f1bac` |
| Selected Wave 5 SQL SHA-256 | `f552c1df891de5816d05d43cdf777d315c7d7a829cf27bede0debd5224f6ad24` |

Four source-generated FK identifiers exceeded MySQL/TiDB’s 64-character limit. They are normalised in **scratch SQL only**, with unchanged source/target columns and referential actions: `fk_aal_routing_decision`, `fk_aal_confidence_score`, `fk_ae_accepted_review`, and `fk_aal_automation_policy`. No source relationship metadata was changed for identifier length.

The static contract permits only `CREATE TABLE`, `CREATE [UNIQUE] INDEX`, and source-declared `ALTER TABLE ... ADD CONSTRAINT` foreign-key additions. It rejects data statements, `DROP`, arbitrary `ALTER`, unreviewed tables, unresolved targets, duplicate creation, and absent explicit keys. The identifier guard passed for all indexes, inline unique constraints, and FKs.

The repository-only source manifest was regenerated and verified after the source reconciliation commit `4336a2961147877a373a11a706e2a7ee4604f754`. It reports 241 schema declarations, 221 distinct MySQL physical names, 82 migration SQL artefacts, and 57 journal entries. The manifest generator intentionally records its commit field as “resolved at execution time; see shell record”; the retained final manifest verification record binds that passed output to the exact source commit above.

## Two-run loopback scratch proof

The runner accepts only a supplied `mysql://` target whose host is loopback and whose database name matches `kinga_gatec_*`. It does not read `DATABASE_URL` or `KINGA_STAGING_DATABASE_URL`. The collision-safe orchestrator checks that each target is absent before creating it; it drops only that exact generated name and stores a post-drop `information_schema` absence proof.

| Check | Run A | Run B | Result |
|---|---|---|---|
| Target | `kinga_gatec_wave5_run_a_20260911184523_236067` on `127.0.0.1:3317` | `kinga_gatec_wave5_run_b_20260911184523_236067` on `127.0.0.1:3317` | Local loopback only. |
| Composed statement count | 710 | 710 | 11 Wave 1 + 87 Wave 2 + 187 Wave 3 + 135 Wave 4 + 290 Wave 5 statements. |
| Created table count | 188 | 188 | 3 Wave 1 + 20 Wave 2 + 50 Wave 3 + 40 Wave 4 + 75 Wave 5 tables. |
| Structural metadata SHA-256 | `244df2e6b8aee8b361022e79e1a353a68f637d5407c44ebda5e5b7da3c8bf731` | Same | Identical. |
| Input SQL fingerprints | Wave 1–5 matched | Wave 1–5 matched | All five reviewed SQL inputs identical across runs. |
| Disposal | Verified absent | Verified absent | No residual scratch database. |

## Final validation

| Validation | Result | Interpretation |
|---|---|---|
| Focused Gate C contracts | 10 files / 25 tests passed | Covers the final key contract, Wave 5 planner, Wave 5 target guard, Waves 1–4 safeguards, and the preceding agency generated-ID regression. |
| Production build | Passed in 31.23 seconds | Existing large-chunk warnings remain warnings; no source error occurred. |
| Branch TypeScript | Exit 2; 998 diagnostics | No Wave 5 touched-path diagnostic. |
| Exact pre-Wave 5 base TypeScript | Exit 2; 998 diagnostics | Error-code counts and diagnostic path sets match exactly. Individual rendered diagnostic lines differ in inherited type-context formatting only. |
| DB-disabled full suite — branch | 101 failed files / 217 failed tests / 8,709 passed / 217 skipped | Both DB URLs were empty deliberately; this is not a green-suite claim. |
| DB-disabled full suite — exact base | 101 failed files / 217 failed tests / 8,705 passed / 217 skipped | The four added passing tests account for the branch pass-count difference. |

The full-suite failure-header comparison found 277 unique failing headers on each side with identical SHA-256 `b7363a7bea7d0d282edf07c509f482b4295c8c539f8cbd49401928a668394c27`: zero branch-only and zero base-only failing identifiers. This proves no new failure in the deliberately DB-disabled comparison; it does not claim global suite health.

Final hygiene passed: source-script syntax checks, shell syntax check, key verifier, planner, identifier guard, `git diff --check`, no migration/journal diff, a credential-pattern scan, and removal of all temporary source-generation artefacts.

## Gate boundary

The five reviewed waves now cover **188 selected source tables** through reproducible local scratch proof. All work remains review-only until the stacked PR chain is reviewed and merged. Gate C does not grant any authority for Gate D, `kinga_staging`, production, migration-account creation, migration execution, external DDL, or live data operations. Any staging reconciliation requires a new separately approved plan and access model.
