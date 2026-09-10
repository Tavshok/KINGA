# KINGA Staging Schema Manifest Package — Review Index

**Status:** Documentation and analysis only. This package did not open a database connection, generate or apply SQL, create a migration account, modify `kinga_staging`, move data, or access KINGA production.

## Review purpose

The package converts prior schema-drift findings into a reproducible, source-commit-bound decision record. Its purpose is to decide what must be repaired or retained **before** any future scratch replay or staging bootstrap is authorised.

> A `required_baseline` classification is a **candidate requirement supported by a direct non-test runtime schema-import and use trace**. It is not an approval to create that table, an instruction to run generated SQL, or a claim that the table is already correct in any database.

## Count correction and scope

| Measure | Verified current-main result | Treatment |
|---|---:|---|
| Configured `drizzle/schema.ts` MySQL declarations | 218 | Main Drizzle entrypoint; forms the configured MySQL source contract. |
| All MySQL source declarations | 226 | Includes supplementary schema modules. |
| Distinct MySQL/TiDB physical table names | 221 | Appropriate initial physical-table inventory for TiDB review. |
| PostgreSQL auxiliary declarations | 16 | Excluded from TiDB baseline unless an architecture decision changes the database dialect. |
| All production-schema declarations across dialects | 242 | Complete ledger universe; includes duplicate and PostgreSQL declarations. |
| Test-only factory calls excluded from schema ledger | 5 | Test fixtures, not production schema declarations. |
| All factory calls including those tests | 247 | Still not 254. |

The previously referenced **254 source-table** number is not reproducible from GitHub `main` commit `484c8e1b483975acce7ae2b3e39c3e3f07b0e837`. This package keeps the discrepancy visible instead of converting it into an assumed delivery target.

## Review artefacts

| Artefact | Review use |
|---|---|
| `audit/staging-schema-manifest/source-schema-manifest.json.gz` | Full declaration-level source record: physical/logical columns, type-factory metadata, nullability, keys/defaults and declared references. Gzip keeps the committed machine manifest below the repository hook’s fixed staged-file buffer limit; the verifier reads it directly. |
| `audit/staging-schema-manifest/migration-artifact-manifest.json` | All 82 SQL artefacts, checksums, journal linkage, statement counts and known-risk labels. |
| `audit/staging-schema-manifest/drift-decision-ledger.json.gz` | Every one of the 242 production-schema declarations, with a classification, runtime evidence, migration evidence, reason and required next action. The complete human-readable ledger remains in `README.md`. |
| `audit/staging-schema-manifest/foreign-key-dependency-manifest.json` | Configured MySQL source dependencies: 218 declarations analysed, 72 resolved intra-schema FK edges and zero unresolved/external candidates. |
| `audit/staging-schema-manifest/README.md` | Readable complete table-by-table version of the decision ledger. |
| `scripts/generate-staging-schema-manifest.mjs` | Generator. Reads repository files only; it does not access credentials, environments or databases. |
| `scripts/verify-staging-schema-manifest.mjs` | Verifier. Fails if any declaration lacks ledger coverage, a classification/basis/action is absent, a required candidate lacks direct runtime evidence, metadata counts disagree, or the 254-count correction disappears. |
| `staging-schema-bootstrap-reconciliation-plan-2026-09-10.md` | Dependency-safe future bootstrap, recovery and promotion gates. The count figures are corrected and intact. |
| `scratch-replay-design.md` | Future scratch-only replay design; specifically does not authorise or execute DDL. |
| `staging-schema-change-packet-template.md` | Required approval/evidence format for any future schema wave. |

## Ledger results requiring review

| Classification | Declarations | Why this classification was used | Consequence now |
|---|---:|---|---|
| `required_baseline` | 177 | A direct, non-test server-source import of the specific schema binding is used outside the import declaration. | Candidate baseline object only; retain for review and include only after migration-chain repair/scratch evidence. |
| `active_but_ambiguous` | 14 | Declared in current source but no direct non-test runtime import/use or migration mention was found. | Exclude by default. Require product/owning-engineer decision or documented deprecation. |
| `compatibility_legacy` | 41 | Either PostgreSQL auxiliary schema (16) or MySQL declaration with migration-only evidence and no direct non-test runtime trace (25). | Exclude from initial TiDB baseline unless owner confirms a requirement. |
| `superseded_duplicate` | 5 | Supplementary declaration duplicates a table in configured `drizzle/schema.ts`. | No duplicate DDL. The configured declaration is evaluated separately; supplementary declaration remains held. |
| `needs_migration_chain_repair_first` | 5 | Known journal or SQL integrity issue makes automated inclusion unsafe. | Hold until a separately approved Gate B repair proves a clean scratch replay. |

The 14 **active-but-ambiguous** MySQL entries are: `claim_comment_reads`, `tenant_usage_summary`, `tenant_tier_history`, `audit_logs`, `currency_exchange_rates`, `benchmark_deviations`, `adjuster_sign_offs`, `photo_reextraction_jobs`, `vehicle_models`, `measurement_types`, `vehicle_geometry_measurements`, `vehicle_landmarks`, `geometry_sources`, and `vision_calibration_results`.

The five **migration-chain-repair-first** entries are `ai_assessments`, `claim_comments`, `claims`, `governance_notifications`, and `rate_limit_tracking`. Their exact evidence and next actions are retained in the generated ledger rather than inferred here.

## Review checklist

- [ ] Confirm the count correction and reject the unverified 254-table target unless a separate, identified source proves it.
- [ ] Confirm that the direct-runtime-evidence rule is sufficient to treat the 177 entries as candidate baseline requirements.
- [ ] Decide an owner and status for each of the 14 active-but-ambiguous declarations.
- [ ] Confirm the exclusion of PostgreSQL auxiliary declarations from TiDB scope.
- [ ] Confirm the five duplicate-declaration handling decisions; do not permit duplicate table generation.
- [ ] Confirm that all five chain-repair-first objects stay outside automatic bootstrap generation until Gate B has a clean scratch replay.
- [ ] Approve or amend the scratch-replay design and change-packet template.

## Boundary after review

The next possible task after approval would be a **separate Gate B migration-chain repair package** on its own branch. It would still require a separate user authorisation before any scratch-only DDL is executed. No amount of manifest approval authorises a `kinga_staging` or production change.
