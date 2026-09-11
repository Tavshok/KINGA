# Gate C Final Held-Table Disposition and Photo Re-Extraction Supplemental Proof

## Authorised disposition

The eight original held candidates were reconsidered through the approved deeper read-only source/history/runtime investigation. This final disposition does **not** redefine the five planned baseline waves. It adds only one approved, source-derived supplemental table to the completed Gate C scratch baseline and retains the other seven candidates outside the baseline.

| Candidate | Final disposition | Basis |
|---|---|---|
| `photo_reextraction_jobs` | **Include** as a post-Wave-5 supplemental baseline table | A tenant-scoped registered router creates and reads jobs, and `runPhotoReextraction` reads and updates the same table. |
| `audit_logs` | **Exclude** | No current producer/consumer was found; active reporting/operations use other audit tables. |
| `vision_calibration_results` | **Exclude** | Active calibration is computed in the pipeline; no persistence writer/reader was found. |
| `geometry_sources` | **Exclude** | No current producer/consumer was found. |
| `benchmark_deviations` | **Exclude** | No table-specific producer/consumer was found. |
| `tenant_usage_summary` | **Exclude** | Auxiliary unconfigured declaration only; no current billing/usage writer or reader was found. |
| `tenant_tier_history` | **Exclude** | Auxiliary unconfigured declaration only; no current entitlement/audit/billing writer or reader was found. |
| `vehicle_landmarks` | **Exclude** | The sole ingestion path is a manually run local JSON seed utility. It has no package script, deployment, CI, scheduler, or runtime import, requires an explicitly supplied `DATABASE_URL`, and is development/operations tooling rather than a deployed production process. |

All four natural/composite-unique candidates—`assessor_insurer_relationships`, `policy_claim_links`, `fleet_drivers`, and `entity_relationships`—remain backlog decisions. No additional unique constraint is introduced by this package.

## Source reconciliation boundary

`photo_reextraction_jobs` already has an explicit auto-increment primary key and source-declared `claim_id → claims.id` foreign key. The approved inclusion therefore changes **no application schema declaration**, column, index, foreign-key semantics, migration, journal, or data. It creates only a checked supplemental source-SQL selection and local replay evidence.

The selected SQL creates exactly one approved table, three source-declared indexes, and one source-declared foreign key in five permitted statements. It has no `DROP`, data statement, unexpected object, arbitrary `ALTER`, or external target.

| Artefact | SHA-256 / result |
|---|---|
| Source snapshot | `8aad7291c96684e0f2cbf93a8286741308c4100b32c94a5508d5ddf5dd8f1bac` |
| Selected supplemental SQL | `2a63ee8920611fafda605968e250b688049732427399dc643942ed5de39588e9` |
| Static table/statement contract | Passed: 1 table, 5 statements, 3 indexes, 1 FK to `claims`. |
| Identifier guard | Passed: no empty, duplicate-per-table, or overlong index/FK identifier. |

## Two-run local scratch proof

The composed supplemental runner accepts only a supplied loopback `mysql://` URL with a unique `kinga_gatec_*` database name. It does not read `DATABASE_URL` or `KINGA_STAGING_DATABASE_URL`; it refuses a non-loopback host or non-scratch name before it opens a connection. The collision-safe orchestrator refuses a pre-existing target, creates only its exact generated target, and drops only that target.

| Check | Run A | Run B | Result |
|---|---|---|---|
| Target | `kinga_gatec_photo_reextract_a_20260911194150_19009435` on `127.0.0.1:3317` | `kinga_gatec_photo_reextract_b_20260911194150_19009435` on `127.0.0.1:3317` | Local loopback only. |
| Composed statement count | 715 | 715 | 11 Wave 1 + 87 Wave 2 + 187 Wave 3 + 135 Wave 4 + 290 Wave 5 + 5 supplemental statements. |
| Created tables | 189 | 189 | 188 reviewed Wave 1–5 tables plus the approved supplemental table. |
| Structural metadata SHA-256 | `a0db4496896701a47a7415af60a4f4db72dea28356e47741ed5757d667c9297d` | Same | Identical. |
| Disposal | Verified absent | Verified absent | No residual scratch schema. |

Separate post-run `information_schema` checks queried only the two exact generated scratch names and confirmed both were absent.

## Validation

| Validation | Result |
|---|---|
| Supplemental target guards and preceding Waves 1–5 target contracts | 7 files / 21 tests passed. |
| Source manifest verifier | Passed: 241 source declarations, 221 distinct MySQL physical names, and 82 historical migration SQL artefacts. |
| Production build | Passed in 28.77 seconds, retaining only the pre-existing large-chunk warnings. |
| TypeScript comparison | Supplemental branch and exact Wave 5 parent both produced 998 inherited diagnostics with no branch-only identifier and no supplemental touched-path diagnostic. |
| DB-disabled full-suite comparison | Branch: 101 failed files / 217 failed tests / 8,711 passed / 217 skipped. Exact Wave 5 parent: 101 / 217 / 8,709 / 217. Failure-header sets match exactly; the two added supplement safety tests account for the pass-count difference. |

The DB-disabled suite result is a comparison, **not a claim of globally green tests**. Final hygiene passed: `git diff --check`, source-script/shell syntax checks, no migration/journal diff, no credential-value pattern hit, and removal of temporary source-snapshot configuration/output.

## Boundary preserved

This package is local scratch evidence only. It does not authorise `kinga_staging`, production, a migration account, migration execution, Gate D, external DDL, or live-data access. The separately approved priority tenant-role fix remains on its own direct-to-main review branch and is not mixed into this supplemental Gate C package.
