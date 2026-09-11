# Gate B Scratch-Only Migration Replay Evidence

**Status:** Review-only Gate B evidence. The replay ran only against uniquely named local MariaDB scratch databases bound to `127.0.0.1`. It did not connect to `kinga_staging`, production, the existing managed database, or any external database. No application row, claim, quotation, evidence item, document, user record, credential, or backup was copied.

## Scope and safety controls

| Control | Evidence | Result |
|---|---|---|
| Branch baseline | `fix/gate-b-migration-chain-replay` merged `main` at `f77b7a31ba691e0d38fcd8270f6f72692e6fedb3` before the replay work | Pass |
| Target identity | Every runner accepts only `mysql://` loopback targets named `kinga_gateb_*`; a non-loopback probe against `example.com` was rejected before any connection attempt | Pass |
| Isolation | Local MariaDB 10.11.14, bound to `127.0.0.1:3317`; each attempt began in a newly created, zero-table database | Pass |
| Credential separation | Replay scripts deliberately ignore ambient `DATABASE_URL`, `KINGA_STAGING_DATABASE_URL`, and production URL names; only their explicit local scratch URL is passed to the runner | Pass |
| Historical preservation | `drizzle/0045`, `0056`–`0060`, the rate-limit compatibility artefact, and `drizzle/meta/_journal.json` are byte-identical to merged `main` | Pass |
| Evidence retention | Two complete overlay replay runs, replay logs, journal state, core metadata assertions, overlay manifests and checksums are committed under `audit/gate-b-scratch-evidence/` | Pass |

## Historical diagnostic result

The current journaled historical chain was replayed once, unchanged, into a separate empty scratch database. It stopped non-zero at the first actual parser failure: `0060_role_assignment_audit_fleet_platform_enum.sql` contains two `ALTER TABLE` statements without a Drizzle statement breakpoint, so the runner passed them to MariaDB as one statement.

> The diagnostic result is evidence of the historical chain’s current non-replayability. It is not a staging failure, and the resulting partial scratch database was not treated as a baseline.

The historical journal additionally omits `0056`–`0059`. Existing static evidence shows that `0058` also refers to camelCase physical columns although the early migration creates `claim_comments.user_id`, `user_role`, and `comment_type`. The unregistered `rate-limit-tracking-schema.sql` is excluded from replay because the authoritative journaled creation is already present in `0044_last_thundra.sql`.

## Immutable corrected replay overlay

The repair is implemented as `scripts/gate-b-immutable-overlay-replay.mjs`. It copies historical migration files into each scratch evidence directory and applies corrected copies **only inside that disposable overlay**. No historic SQL file or journal file is rewritten.

| Historical tag | Overlay treatment | Reason |
|---|---|---|
| `0045_colossal_molecule_man` | Omits `idx_recipients` only in the scratch overlay | `recipients` is JSON text; the runtime filters it in memory after a tenant/read-state query and has no SQL predicate requiring this index. A whole-TEXT index is therefore not a portable required baseline operation. |
| `0056_stage2_raw_ocr_text` | Added to the scratch overlay journal unchanged | Provides the required `ai_assessments.stage2_raw_ocr_text` field. |
| `0057_narrative_analysis_json` | Added to the scratch overlay journal unchanged | Provides the required `ai_assessments.narrative_analysis_json` field. |
| `0058_claim_comments_extend` | Corrects `user_id`, `user_role`, and `comment_type` physical names; splits independently reviewed `ALTER` groups with breakpoints | Makes the registered change compatible with the actual early physical baseline and allows failure attribution by group. |
| `0059_kinga_ref_sequence` | Adds breakpoints between claims and tenant changes | Makes `claims.kinga_ref` and tenant counters independently replayable and auditable. |
| `0060_role_assignment_audit_fleet_platform_enum` | Adds a breakpoint between its two `ALTER` statements | Corrects the reproduced first parser failure. |
| `rate-limit-tracking-schema.sql` | Explicitly excluded | It is an unregistered compatibility artefact; `0044` creates the authoritative journaled `rate_limit_tracking` table and indexes. |

The overlay establishes `claim_comments.claim_id` for a clean fresh baseline. The current application schema deliberately continues to map `claimComments.claimId` to the legacy deployed physical column `claimId`: a full-suite run against the existing managed test target exposed that current-runtime contract. Reconciling that live-versus-fresh-baseline divergence requires a separate approved compatibility/migration decision and is not folded into Gate B.

## Clean replay evidence

Two fresh, independent overlay replays completed successfully.

| Check | Run A | Run B | Result |
|---|---|---|---|
| Target state before replay | Zero tables | Zero tables | Pass |
| Corrected overlay journal entries | 61 | 61 | Pass |
| Drizzle replay exit code | 0 | 0 | Pass |
| Applied journal entries | 61 | 61 | Pass |
| Missing or unexpected journal timestamps | None | None | Pass |
| Required core columns | All present | All present | Pass |
| Legacy `claim_comments.claimId` column | Absent | Absent | Pass |
| Whole-TEXT `idx_recipients` | Absent | Absent | Pass |
| Authoritative `rate_limit_tracking` composite index | Present | Present | Pass |
| Full metadata manifest SHA-256 | `dc25cf44c6c01da76ef0438885bfe9de3b9369b512b10b88721704be0b490fa7` | Same | Deterministic |
| Core-evidence manifest SHA-256 | `331f3f36787a1bf34283ba9c9d0b38598e1d9ddf1ee6e7724cb8b5b5a8aa84e4` | Same | Deterministic |
| Overlay-manifest SHA-256 | `c8a643decce72c0e86c12a133dce0ed62b4c5e31e296e3f4ec0ef0f852ca60e5` | Same | Deterministic |

The exact machine-readable run records, replay logs, corrected overlay journals, metadata manifests, core assertions and SHA-256 checksum manifest are stored in [`audit/gate-b-scratch-evidence/README.md`](gate-b-scratch-evidence/README.md). The full metadata files are gzip-compressed solely to keep repository hooks within their fixed buffer limit; they contain metadata only, not database rows or credentials.

## Final validation

| Validation | Result |
|---|---|
| Immutable-runner syntax check | Passed |
| Non-loopback safety probe | Passed: the runner rejected `example.com` before connecting |
| Historical-input comparison | Passed: the historical SQL and journal inputs are byte-identical to merged `main` |
| Source-manifest verification | Passed: 242 declarations, 221 distinct MySQL physical names, five repair-first declarations and all 14 active-but-ambiguous declarations still held as accepted |
| Client production build | Passed in 26.79 seconds; existing large-chunk warnings only |
| Server bundle | Passed through `pnpm run check:server` |
| TypeScript comparison | Current `main` and Gate B each produced 999 inherited diagnostics and the same diagnostic-code set; no Gate B-path diagnostic was introduced |
| Full-suite comparison | Current `main` and Gate B each produced 28 failing files, 54 failed tests, 9,252 passed tests and 3 skipped tests; all 55 normalised failing identifiers matched exactly |

An initial attempt to alter the application mapping to fresh-overlay `claim_id` exposed the existing managed test target’s legacy `claimId` contract. That attempted change was reverted before final validation. This is preserved as a documented compatibility decision, not treated as a passing application migration.

## Limits and explicit exclusions

This evidence proves that the reviewed **overlay** produces a deterministic MySQL-compatible scratch schema for the authorised core chain. It does not prove that all 242 source declarations are a staging baseline, that the active-but-ambiguous declarations should be included, that the historical migrations can be edited in place, or that TiDB will accept the final approved baseline waves without a separate TiDB scratch rehearsal.

`kinga_staging`, production, migration-account creation, Gate C wave generation, production metadata inspection, data import/export and application configuration changes remain strictly out of scope.

## Reviewer sign-off checklist

Before authorising any next step, record each decision explicitly.

- [ ] Accept that historic migration files and the historic journal remain immutable; the Gate B overlay is scratch evidence, not an instruction to rewrite deployed history.
- [ ] Accept the historical diagnostic finding that unmodified `0060` fails without a statement breakpoint.
- [ ] Accept the overlay repairs for `0056`–`0059`, `0058` physical naming, `0060` statement separation and the removal of the non-consumed `idx_recipients` index from the fresh scratch path.
- [ ] Review the recorded `claim_comments.claimId` (current runtime) versus `claim_comments.claim_id` (fresh overlay) divergence and authorise a separate compatibility/migration decision before changing either side.
- [ ] Confirm that the 14 active-but-ambiguous declarations remain excluded pending separate table-by-table decisions.
- [ ] Confirm whether to proceed to a **TiDB-compatible disposable scratch** rehearsal only. This would still not permit a staging migration account, `kinga_staging` DDL, Gate C baseline generation or production work.

## References

[1]: `docs/staging-schema-reconciliation/scratch-replay-design.md` — accepted Gate B isolation and evidence design.

[2]: `docs/SCHEMA_MIGRATION_DRIFT_AUDIT.md` — prior static drift evidence for journal gaps, claim-comment physical naming and the governance text-index risk.

[3]: `audit/staging-schema-manifest/drift-decision-ledger.json.gz` — accepted declaration classification ledger; the active-but-ambiguous declarations remain excluded.
