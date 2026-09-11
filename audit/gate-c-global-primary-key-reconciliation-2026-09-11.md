# Gate C Global Sole-Identifier Primary-Key Reconciliation

## Scope and safety boundary

This review branch applies the user-authorised global correction only to source declarations where the existing auto-increment `id` is statically classified as the table’s **sole identifying column**. It performs no migration generation, no DDL, no database connection, no staging/production access, and no live-data operation. The historical migration chain and journal remain untouched.

The authoritative source inventory initially contained **145** auto-increment `id` declarations outside completed Waves 1 and 2 that lacked explicit `.primaryKey()`. The classifier applies a deliberately conservative rule: a candidate is safe only if it has no source-declared alternative primary/unique identity and fewer than two identifier-like `*Id`/`*_id` columns. This prevents a blanket change from deciding the key contract of a junction, relationship, composite, or alternate-identity table.

| Classification outcome | Count | Treatment |
|---|---:|---|
| Safe sole-identifier declarations | 34 | `.primaryKey()` added to the existing auto-increment `id` only. |
| Held for a future key-contract decision | 111 | No source change. |
| Total original inventory | 145 | Fully accounted for. |

## Applied safe subset

The source-only reconciler checks the generated classification before writing. It rejects a stale/incomplete classification, any safe candidate whose ID no longer has the expected unkeyed auto-increment form, and any held candidate that has already gained a primary key. It applied exactly 34 changes and simultaneously observed all 111 held declarations unchanged.

| Tables changed under the approved sole-key rule |
|---|
| `claimant_history`, `currency_exchange_rates`, `email_verification_tokens`, `extracted_document_data`, `federated_learning_metadata`, `fraud_rules`, `global_anonymized_dataset`, `model_version_registry`, `multi_reference_truth`, `organizations`, `part_stratification`, `parts_pricing_audit_log`, `parts_pricing_baseline`, `parts_pricing_overrides`, `platform_governance_limits`, `police_reports`, `pre_accident_damage`, `quote_line_items`, `regional_benchmarks`, `regional_pricing_multipliers`, `registration_requests`, `service_providers`, `supplier_performance_metrics`, `supplier_quote_line_items`, `supplier_quotes`, `third_party_vehicles`, `vehicle_history`, `workflow_configuration`, `agency_clients`, `country_repair_index`, `component_benchmarks`, `fuel_records`, `licensing_records`, `personal_vehicles` |

## Held exception shortlist

All 111 held tables, their source line, identifier-like reference columns, source-declared unique constraints, and exact hold reason are retained in `audit/gate-c-scratch-baseline/auto-increment-primary-key-classification.json`. The remaining source-only gap inventory after the safe pass is retained separately in `audit/gate-c-scratch-baseline/auto-increment-primary-key-gaps-held-after-global-safe-pass.json`.

The holds have two overlapping reasons: **110** tables expose two or more identifier-like reference columns, and **21** expose a configured unique identity outside `id`. The former set is intentionally broader than proven junction tables: it includes normal child/event entities as well as association-shaped declarations. That is why no conclusion is made from name alone.

The following tables are particularly clear relationship/junction or alternate-key candidates from their source shape and therefore require an explicit future contract decision before an ID primary key is added: `entity_relationships`, `policy_claim_links`, `driver_claims`, `fleet_drivers`, `assessor_insurer_relationships`, `insurer_marketplace_links`, `insurer_marketplace_relationships`, `agency_insurance_service_request_insurers`, `assessor_reports`, `assessor_report_reviews`, `insurer_quote_requests`, `notification_preferences`, `pipeline_jobs`, `report_provenance_snapshots`, `claim_intake_requests`, and `repair_cost_intelligence`. This is a risk shortlist, not a claim that every remaining hold is a junction table.

> The held set remains deliberately unmodified. A table with multiple relationship fields may still correctly use a surrogate `id` primary key, but that is a data-contract decision rather than a mechanical metadata repair.

## Truth-reconciliation suite discrepancy — pre-existing confirmation

The Wave 2 package accurately treated the DB-disabled full-suite divergence as unresolved. The additional evidence now establishes that the `truthReconciliationEngine` idempotency failure predates Wave 2 and was not touched by its source changes.

| Evidence | Result |
|---|---|
| Prior durable audit | `audit/engineer-domain-tenant-authority-correction-2026-08-27.md`, line 41, records the held branch as having no branch-only failure and current main as having the sole main-only, “previously observed” TRE idempotency failure. |
| Git history | Both the engine’s `certificateId: TRE-${claimId}-${Date.now()}` expression and the idempotency assertion were introduced in commit `3f0f6285` on 12 July 2026. |
| Wave 2 diff | `c69b446c..7e329173` changes neither `server/pipeline-v2/truthReconciliationEngine.ts` nor `server/truthReconciliationEngine.test.ts`. |
| Fresh same-base repetition | The exact idempotency assertion failed 5/5 on current main and 5/5 on the Wave 2 branch with database URLs empty. The displayed mismatch is the unstripped time-derived `certificateId`. |

The test removes `generatedAt` and `ctoHash`, but retains `certificateId`. The engine creates that field with `Date.now()`, so two otherwise equivalent runs can differ by millisecond. This branch does **not** change the engine, its test, or the known test debt; it records the evidence only.

## Validation

| Check | Result |
|---|---|
| Guarded source-only reconciler | Passed: 34 safe IDs changed; 111 held IDs observed unchanged. |
| Residual inventory | Passed: exactly 111 unkeyed auto-increment IDs remain, matching the held classification. |
| Focused Gate C contracts | 4 files / 14 tests passed, including a new test that asserts every safe ID is primary and every hold remains unmodified. |
| Source manifest verifier | Passed after regeneration; 242 schema declarations, 221 distinct MySQL/TiDB physical names, 82 migration artefacts and 57 journal entries. |
| Production build | Passed; existing large-chunk warnings remain non-fatal. |
| TypeScript baseline | Exit 2 with the same 999 inherited diagnostics; no diagnostic names the global-primary-key touched source, script, or test paths. |
| Historical migrations/journal | Not changed by this branch. |

## Next decision boundary

The 34 safe corrections are ready for review only. The 111 exceptions remain a separate primary-key contract backlog. Gate C Wave 3 remains **planning only** until the review branch is accepted and new Wave 3 generation/replay authority is granted.
