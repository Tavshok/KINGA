# Gate C Wave 4 — Operational Portals and Channels Scratch Baseline Review

## Scope and protected boundary

This package proves the authorised Wave 4 source baseline solely through two local disposable MariaDB scratch databases. It neither creates nor changes any object in `kinga_staging`, production, or another external target. It does not create a migration account, read live application data, execute a migration-chain change, or authorise Gate D.

Wave 4 contains the original 37-table operational portal/workflow scope plus the approved active operational-channel extension: `recovery_cases`, `recovery_correspondence_log`, and `whatsapp_sessions`. The full source-derived scope is therefore **40 tables**. The eight separately held candidate tables remain excluded.

## Approved source reconciliation

| Reconciliation | Exact scope | Verified result |
|---|---|---|
| Workflow configuration identity | `tenant_workflow_configs.id` | The existing required string `id` now explicitly declares `.primaryKey()`; no column, type, value, index, or additional uniqueness contract was changed. |
| Duplicate workflow audit index | `workflow_audit_trail` | Removed only `index("").on(table.claimId, table.createdAt)`, the blank-named duplicate of retained `idx_audit_claim_timestamp`. |
| Canonical comment-read source | `claim_comment_reads` | Moved verbatim from the retired supplementary schema to `drizzle/schema.ts`, with matching normalised declaration SHA-256 `f4e26b005e772751aeea33de2da87aade190c41dc70b32ac12033e51967b9f7a`. |
| Duplicate declaration removal | `drizzle/claim-comments-schema.ts` | Removed after a complete import/symbol trace found no consumer. `drizzle/schema.ts` now contains exactly one `claim_comments` declaration and exactly one `claim_comment_reads` declaration. |
| Approved physical compatibility | `claim_comments.claimId` | Retained `claimId` as the physical column name. It was not changed to `claim_id`. |

The canonicalization guard independently confirms the exact comment-read physical contract, one canonical declaration for each claim-comment table, removal of the supplementary declarations, and retention of the `claimId` mapping. The generated repository-only manifest then passed with 241 schema declarations, 221 distinct MySQL physical names, and 82 historical migration SQL artefacts. Historical migration files and the journal were not modified.

## Reviewed Wave 4 SQL

The baseline is selected from a disposable, source-generated full-schema snapshot. The snapshot itself is not a migration and was deleted after selection. The reviewed Wave 4 file is `audit/gate-c-scratch-baseline/wave-04-generated/wave-04-operational-portals-channels.sql`.

| Static contract | Result |
|---|---|
| Tables | 40, exactly matching the approved operational portals/channels scope. |
| Statements | 135: 40 `CREATE TABLE`, 7 source-declared FK additions, and 88 standalone index statements. |
| Inline named uniqueness | 10 constraints, including `notification_events.idempotency_key` which is declared as a column-level unique constraint rather than a configured index. |
| Total source index/unique artefacts | 98: 88 standalone index statements plus 10 inline unique constraints. |
| Foreign keys | 7, from `approval_workflow`, `claim_comments` (two), `governance_notifications`, `notifications`, `recovery_cases`, and `workflow_audit_trail`; every target is an earlier reviewed Wave 1/2 table. |
| Source snapshot SHA-256 | `0c9a980e10afa052345ee66b52ed1730e3e1650ddc23dc0a4734acb4ff31dd97` |
| Selected Wave 4 SQL SHA-256 | `c6d4f6bb2f7984dd381630651d9520db59c14c873617492fc7e5ed3035915139` |

The static contract permits only `CREATE TABLE`, named index statements, and source-declared `ALTER TABLE ... ADD CONSTRAINT` foreign-key additions. It rejects unreviewed tables, duplicate creation, foreign-key targets outside the reviewed prerequisite set, data statements, `DROP`, arbitrary `ALTER`, and a missing explicit `id` primary key. The identifier guard passed after checking standalone indexes, inline unique constraints, and foreign keys for empty, duplicate-per-table, and over-64-character identifiers. No Wave 4 FK-name normalisation was necessary.

## Two-run local scratch proof

The replay runner accepts only a supplied `mysql://` target with a loopback host and a unique `kinga_gatec_*` database name. It does not read `DATABASE_URL` or `KINGA_STAGING_DATABASE_URL`. The surrounding runner checks a target does not pre-exist before creating it, drops only that exact generated name, and records an `information_schema` absence proof after disposal.

| Check | Run A | Run B | Result |
|---|---|---|---|
| Target | `kinga_gatec_wave4_run_a_20260911175907_227207` on `127.0.0.1:3317` | `kinga_gatec_wave4_run_b_20260911175907_227207` on `127.0.0.1:3317` | Loopback local-only. |
| Wave 1 prerequisite statements | 11 | 11 | Passed. |
| Wave 2 prerequisite statements | 87 | 87 | Passed. |
| Wave 3 prerequisite statements | 187 | 187 | Passed. |
| Wave 4 statements | 135 | 135 | Passed. |
| Total replayed statements | 420 | 420 | Passed. |
| Created tables | 113 (3 Wave 1 + 20 Wave 2 + 50 Wave 3 + 40 Wave 4) | Same 113 | Exact composed scope. |
| Structural metadata SHA-256 | `cce9a8553f61f56ab683f43268076ce12e3eb65bf7729b12ffb521ed79c787fe` | Same | Identical. |
| Disposal | Verified absent | Verified absent | No residual scratch schema. |

The two runs retain identical checksums for the exact Wave 1, Wave 2, Wave 3, and Wave 4 SQL inputs. Separate post-run checks queried only the two exact scratch names and confirmed both were absent.

## Final validation

| Validation | Result | Interpretation |
|---|---|---|
| Focused source/scratch contracts | 8 files / 22 tests passed | Covers global key reconciliation, Wave 1–4 scratch target restrictions, canonical comment-read contract, planning scope, and agency generated-ID regression. |
| Source manifest verifier | Passed | Confirms the regenerated repository-only manifest is internally consistent and preserves the approved `claim_comments.claimId` physical contract. |
| Production build | Passed in 29.23 seconds | Existing large-chunk warnings remain warnings; no source error was reported. |
| Branch TypeScript | Exit 1; 998 diagnostics | No Wave 4 touched-path diagnostic. |
| Exact pre-reconciliation base TypeScript | Exit 2; 998 diagnostics | Identical diagnostic identifiers and TypeScript error-code categories; exit-code difference is not treated as a green baseline result. |
| DB-disabled full suite — branch | 231 failed files / 217 failed tests / 8,704 passed / 217 skipped | External database URLs deliberately empty. This is not a green-suite result. |
| DB-disabled full suite — exact base | 231 failed files / 217 failed tests / 8,700 passed / 217 skipped | The branch’s four additional passing tests are the new Wave 4 source/scratch safeguards. |

The JSON comparison found **zero branch-only failed test identifiers and zero base-only identifiers**: all 217 failed identifiers were shared. This proves no additional DB-disabled suite failure from the Wave 4 source reconciliation; it does not convert the pre-existing failing suite into a passing one.

Final hygiene passed: `git diff --check`, a staged changed-path review, migration/journal integrity against the Wave 3 parent, a no-credential pattern scan, and a filesystem check that excluded temporary source-generation configuration and raw snapshot artefacts from the package.

## Review boundary and next authority

Wave 4 is ready for **review-only** assessment. It is not staging-ready and it does not authorise Wave 5, Gate D, a migration account, `kinga_staging`, production, or live-data access. Any next Gate C wave requires a separate source-scope and dependency plan, a reviewed baseline, static guards, two new local loopback replays, and explicit user authority.
