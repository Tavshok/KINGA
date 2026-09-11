# Gate C Wave 2 — Vehicle and Claim-Core Scratch Baseline Review

## Scope and non-production boundary

This review package proves the Wave 2 vehicle, claimant, driver, policy, and claim-core baseline **only in disposable local scratch databases**. It does not create or change an object in `kinga_staging`, production, or any other external target. It does not create a migration account, read application rows, or permit Gate D.

Wave 2 is intentionally stacked on Wave 1 because current Wave 2 foreign keys reference `users` from the reviewed identity/tenant-root prerequisite. Both review SQL files are checksummed in `audit/gate-c-scratch-baseline/wave-02-evidence/source-sql.sha256`.

## Approved source-contract reconciliation

The branch makes only the reviewed source-metadata changes needed to form a valid source-derived Wave 1 + Wave 2 baseline.

| Reconciliation | Scope | Result |
|---|---|---|
| Wave 1 identity keys | `tenants.id`, `tenant_invitations.id`, `users.openId`, `tenant_invitations.token` | Explicit primary/unique source constraints retained from approved Wave 1. |
| Wave 2 entity keys | 16 named auto-increment `id` columns | Explicit `.primaryKey()` added only to the user-approved Wave 2 entity identities. |
| Vehicle geometry FK identifier | `vehicle_geometry_measurements.vehicle_model_id → vehicle_models.id` | Explicit `fk_vgm_vehicle_model` replaces the invalid 67-character auto-generated name; same columns and `ON DELETE/ON UPDATE NO ACTION` semantics. |
| Redundant index cleanup | `tenants.name`, `claims.claimant_id` | Retains `idx_tenants_name` and `idx_claims_claimant_id`; removes only the invalid/redundant duplicate declarations. |
| Timestamp defaults | Genuine timestamp string defaults | All AST-verified quoted `CURRENT_TIMESTAMP` defaults use `.defaultNow()`; no lookalike non-timestamp declaration was changed. |

The final source-derived Wave 2 SQL contains exactly the reviewed **20 Wave 2 tables**, **58 generated indexes**, and **9 source-declared foreign keys**. It contains no `DROP`, non-FK `ALTER`, `INSERT`, `UPDATE`, `DELETE`, external connection, unplanned table, or inferred relationship. The only `ALTER` statements add the nine reviewed foreign keys.

## Clean local replay proof

The replay runner accepts only a supplied loopback `mysql://` target with a unique database name matching `kinga_gatec_*`. It does not read `DATABASE_URL` or `KINGA_STAGING_DATABASE_URL`. It rejects a non-loopback target, anything other than the exact Wave 1 prerequisite table set, unplanned Wave 2 tables, unsafe SQL statement classes, malformed key targets, or duplicate/empty identifiers before a connection can open.

| Check | Run A | Run B | Result |
|---|---|---|---|
| Target | `kinga_gatec_wave2_run_a_20260911t13571789135056z_25407` on `127.0.0.1:3317` | `kinga_gatec_wave2_run_b_20260911t13571789135056z_5240` on `127.0.0.1:3317` | Local loopback only. |
| Prerequisite statements | 11 reviewed Wave 1 statements | 11 reviewed Wave 1 statements | Passed. |
| Total replayed statements | 98 | 98 | Passed. |
| Created tables | 23, consisting of the 3 Wave 1 prerequisite tables plus 20 approved Wave 2 tables | Same 23 tables | Passed. |
| Wave 1 SQL SHA-256 | `306797ab94529860bc9e88a69a955061916a94ddc3d08e3265229780ab08083c` | Same | Identical. |
| Wave 2 SQL SHA-256 | `15661c69490a4360931ef5fc3d17e2b4521f692730b2d113f1342117b067e7b9` | Same | Identical. |
| Structural metadata SHA-256 | `2b7b1ba33cc6fbb729824d1ab447c6920cfdc5e6f9ffb6d60720f0414abf7897` | Same | Identical. |
| Disposal | Verified removed | Verified removed | No residual scratch schema. |

The small reporting-path error after the two successful replays referenced `run-a`/`run-b` rather than the actual `run_a`/`run_b` evidence directories. It did not affect replay execution or disposal. A follow-up check read both retained evidence files, confirmed their matching structural fingerprints, and queried `information_schema` to prove both exact scratch database names were absent.

## Global source-metadata inventory corrections

### Timestamp defaults

The prior line-oriented inventory reported 173 string defaults because it counted lines rather than every field. The AST inventory corrected the actual population to **208 genuine timestamp-field occurrences across 188 tables**. All 208 were converted in the approved global source-metadata pass. The post-change inventory reports zero quoted `CURRENT_TIMESTAMP` string defaults. This is a semantic-preserving source-metadata correction: it changes generated SQL from a string literal default to Drizzle’s functional timestamp default.

### Primary-key gaps outside Waves 1 and 2

The repository-only inventory identifies **145** remaining auto-increment `id` declarations outside the completed Wave 1/2 table scope that lack an explicit source `.primaryKey()` declaration. This is an inventory only—no table outside Waves 1/2 was changed. The full list, source declaration and line number are retained in `audit/gate-c-scratch-baseline/auto-increment-primary-key-gaps-outside-waves-01-02.json` for a single future decision rather than repetitive per-wave approvals.

## Existing hold boundary

The eight previously held candidate tables remain excluded: `tenant_usage_summary`, `tenant_tier_history`, `audit_logs`, `benchmark_deviations`, `photo_reextraction_jobs`, `vehicle_landmarks`, `geometry_sources`, and `vision_calibration_results`. Their current-path evidence and decision requirements remain in `docs/staging-schema-reconciliation/gate-c-held-candidate-review.md`. No hold was overridden by the baseline generator.

## Final validation

The static Wave 2 SQL guard, source-key analyser, identifier guard, Wave 1/2 target-safety tests, source-manifest verifier, and clean two-run scratch proof are part of this package. The timestamp scanner was rerun after the global reconciliation and wrote `quoted-current-timestamp-defaults.json` with `total: 0` and an empty occurrence list. The manifest verifier independently passed after regeneration. The scanner deliberately ignores an alternate output-path argument; the authoritative retained output is therefore its documented default path, not an absent alternate file.

| Validation | Result | Interpretation |
|---|---|---|
| Focused Gate C safety tests | 3 files, 11 tests passed | Covers the key contracts and Wave 1/Wave 2 loopback target guards. |
| Production build | Passed | Completed in 29.77 seconds. Existing large-chunk warnings remain warnings; no source error was reported. |
| Branch TypeScript | Exit 2; 999 diagnostics | The repository-wide inherited diagnostic baseline remains. No diagnostic references a Wave 2 touched source/script/test path. |
| Current `user_github/main` TypeScript | Exit 2; 999 diagnostics | Same count and error-code category set as the branch. |
| DB-disabled complete suite — branch | 102 failed files / 218 failed tests / 8,692 passed / 217 skipped | DB URLs were empty by design; these failures are not a green-suite result. |
| DB-disabled complete suite — current main | 101 failed files / 217 failed tests / 8,682 passed / 217 skipped | Same command and disabled-DB environment. The 11 additional passing branch tests are the new Gate C safety tests. |

The complete-suite failure identifier sets were **not identical**. The branch had exactly one additional failure: `server/truthReconciliationEngine.test.ts > TRE — runTruthReconciliationEngine > 12. Idempotency — two runs on identical input produce equal CTOs (excluding timestamps)`. Main had no identifier absent from the branch. This test has a separately documented history of inconsistent result sets on unchanged code; this comparison does not establish it as caused by Wave 2, but neither does it assert full-suite parity. The exact divergence is retained in the command log for the review run and must remain visible to reviewers.

## Next decision gate

Gate C Wave 2 is ready for **review-only** assessment. It is not approved for staging. Before a later wave is generated, the 145-table primary-key inventory requires one deliberate source-contract decision; held candidate tables remain separate product/operational decisions; and Gate D requires new explicit staging authority.
