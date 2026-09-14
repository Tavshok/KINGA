# Gate C Wave 5 — Intelligence, Learning, Analytics and Secondary-Capability Planning

## Scope and protected boundary

This is the final Gate C **planning-only** wave. It parses source metadata only; it creates no SQL baseline, opens no scratch database, changes no source schema, and does not access `kinga_staging`, production, a migration account, Gate D, or live data.

The original map assigned 78 tables to Wave 5. Three currently active operational-channel tables—`recovery_cases`, `recovery_correspondence_log`, and `whatsapp_sessions`—were explicitly moved into the authorised and proven Wave 4 scope. Wave 5 therefore contains the remaining **75 intelligence, learning, analytics, calibration, benchmark, training, search, historical/replay, governance, and optimisation tables**. With the reviewed 113 tables from Waves 1–4, the final composed Gate C baseline will contain 188 selected source tables if the remaining key contracts are resolved.

The eight held candidates remain excluded: `audit_logs`, `benchmark_deviations`, `geometry_sources`, `photo_reextraction_jobs`, `tenant_tier_history`, `tenant_usage_summary`, `vehicle_landmarks`, and `vision_calibration_results`.

## Source-readiness result

The source-only planner found no missing source declaration, unresolved foreign-key reference, in-wave source dependency, empty configured index name, duplicate configured index name within a table, or held-table overlap. Two configured index names recur across different tables (`idx_tenant_id` and `idx_type`); these are valid because MySQL index names are table-scoped.

SQL generation is blocked by six table-key contracts.

| Table | Source state | Planning assessment | Required authority |
|---|---|---|---|
| `insurer_tenants` | Existing non-null `varchar(64)` `id` lacks `.primaryKey()` | Same explicit-string-ID pattern previously reconciled in Wave 3/4, but no change has been made. | Approve `.primaryKey()` only on existing `id`, or provide an alternative identity contract. |
| `iso_audit_logs` | Existing non-null `varchar(64)` `id` lacks `.primaryKey()` | Same existing-string-ID pattern. | Approve `.primaryKey()` only on existing `id`, or provide an alternative. |
| `risk_register` | Existing non-null `varchar(64)` `id` lacks `.primaryKey()` | Same existing-string-ID pattern. | Approve `.primaryKey()` only on existing `id`, or provide an alternative. |
| `routing_history` | Existing non-null `varchar(64)` `id` lacks `.primaryKey()` | Same existing-string-ID pattern. | Approve `.primaryKey()` only on existing `id`, or provide an alternative. |
| `routing_threshold_config` | Existing non-null `varchar(64)` `id` lacks `.primaryKey()` | Same existing-string-ID pattern. Its currently named `unique_threshold_tenant_version` is an ordinary index, not a unique constraint; that is a separate business-rule question and is not changed here. | Approve `.primaryKey()` only on existing `id`, or provide an alternative. |
| `tenant_role_configs` | No `id` column and no explicit configured composite primary key | It cannot receive the previously approved “primary key on existing `id`” repair. `(tenantId, roleKey)` appears structurally plausible, but it is a product/business uniqueness decision: the source does not currently state whether multiple configurations for the same role/tenant are valid. | Specify the intended primary-key/identity model before this table can enter a source-derived baseline. |

The first five cases are limited source-metadata corrections. They do not add any unique constraint, relationship, column, data change, or physical table redesign. The sixth case requires a separate decision and must not be inferred from the surrounding naming.

## Later execution protocol after approval

Once the six key contracts are resolved by explicit authority, the execution plan is:

1. Regenerate the repository-only manifest, then source-generate a disposable full-schema snapshot from canonical `drizzle/schema.ts`.
2. Select only the approved 75 Wave 5 table declarations, their source-declared index/unique artefacts, and their source-declared foreign-key additions; reject every other statement category or target.
3. Run table-set, explicit-key, index/unique identifier, and FK-target static guards before any database is opened.
4. Replay the exact checked Wave 1, Wave 2, Wave 3, Wave 4, and Wave 5 SQL into two fresh loopback-only `mysql://127.0.0.1:3317/kinga_gatec_*` targets. The runners will reject non-loopback hosts, non-`kinga_gatec_*` names, a non-empty target, unsafe statement classes, and any table outside the complete reviewed scope.
5. Compare both structural metadata fingerprints, prove each exact scratch target was dropped, run focused source/scratch contracts, production build, TypeScript baseline comparison, and a same-base DB-disabled full-suite identifier comparison before packaging a review-only PR.

This plan does not authorise SQL generation or any database operation yet.
