# Gate C Wave 1 — Identity and Tenant Roots Review Record

## Scope

This review package changes source metadata and scratch-only review tooling on the Gate C branch. It does not use `kinga_staging`, production, an external database URL, a migration account, application rows, or live data. The Wave 1 scratch runner accepts only a fresh `mysql://` loopback target named `kinga_gatec_*`; both completed scratch databases were removed after evidence capture.

## Approved source-contract reconciliation

| Object | Reconciled source contract | Basis |
|---|---|---|
| `tenants.id` | Primary key | Current tenant-scoped application paths resolve tenants by ID; the historical replay already contained the key. |
| `tenant_invitations.id` | Primary key | Current invitation records are addressed by ID; the historical replay already contained the key. |
| `users.openId` | Unique constraint | Current `upsertUser(...).onDuplicateKeyUpdate(...)` requires a duplicate key. |
| `tenant_invitations.token` | Unique constraint | A live invitation token identifies one invitation. |
| `tenants.name` | Retained only `idx_tenants_name` | The duplicate non-unique `name` index was removed after explicit approval; no required index was removed. |
| Wave 1 timestamp defaults | `defaultNow()` on four approved fields | Functional `DEFAULT (now())` is accepted by the local MySQL-compatible scratch engine; quoted string defaults were not. |

The reviewed generated SQL creates exactly `tenant_invitations`, `tenants`, and `users`, with their source-declared keys and indexes. It contains eleven `CREATE TABLE`/`CREATE INDEX` statements, no foreign key, and no `DROP`, `ALTER`, `INSERT`, `UPDATE`, or `DELETE` statement.

## Scratch replay evidence

| Control | Result |
|---|---|
| Source SQL checksum | `306797ab94529860bc9e88a69a955061916a94ddc3d08e3265229780ab08083c` |
| First clean scratch replay | Passed; three expected tables; 11 statements; scratch database removed. |
| Second clean scratch replay | Passed; three expected tables; 11 statements; scratch database removed. |
| Structural metadata fingerprint | `e4d52b9f4ed2de6ffd00c6a184fdef807d8450b64edd1d1b604c08be06dc2a50` on both clean runs. |
| Focused source/guard regressions | 2 files, 6 tests passed. |
| Client and combined production build | Passed. |
| Server bundle check | Passed via `pnpm run check:server`. |
| TypeScript same-base comparison | 999 inherited diagnostics on branch and current main; no new count. |
| Full suite same-base comparison | 28 failed-file identifiers on branch and current main; 54 failed tests, 9,258 passed, 3 skipped on the branch; no branch-only failure identifier. |

Per-run replay and metadata artefacts are retained in `audit/gate-c-scratch-baseline/wave-01-evidence/`. The structural fingerprint intentionally excludes the unique scratch database name and hashes only table, constraint, and index metadata.

## Unresolved timestamp pattern

The four approved Wave 1 fields are now functional defaults. A repository-only inventory retains **173** remaining `.default('CURRENT_TIMESTAMP')` declarations across **157** tables outside Wave 1 in `audit/gate-c-scratch-baseline/quoted-current-timestamp-defaults.json`. No occurrence outside Wave 1 was changed. Each later wave must review its own relevant fields before its SQL is accepted.

## Held-table boundary

Eight nominated candidate tables remain excluded: `tenant_usage_summary`, `tenant_tier_history`, `audit_logs`, `benchmark_deviations`, `photo_reextraction_jobs`, `vehicle_landmarks`, `geometry_sources`, and `vision_calibration_results`. The full per-table current-path evidence and required product/ownership decisions are in `docs/staging-schema-reconciliation/gate-c-held-candidate-review.md`. Six candidates retain verified current paths for later, separately reviewed waves: `claim_comment_reads`, `currency_exchange_rates`, `adjuster_sign_offs`, `vehicle_models`, `measurement_types`, and `vehicle_geometry_measurements`.

## Reviewer decision requested

This package is evidence for **Wave 1 only**. It does not authorise Gate D, a staging migration account, staging DDL, production work, the next Wave, or promotion of held candidates. The next action after review is a separate decision on whether to permit a new source/Scratch-only Wave 2 planning pass.
