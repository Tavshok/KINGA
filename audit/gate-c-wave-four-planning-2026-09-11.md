# Gate C Wave 4 Planning — Operational Portals, Workflows, and Channels

## Planning boundary

This package is **planning only**. It parses repository source metadata and does not generate Wave 4 SQL, open a scratch database, connect to `kinga_staging` or production, create a migration account, execute DDL, or read live data. The existing Wave 1–3 review packages remain the only scratch-baseline evidence.

The proposed Wave 4 purpose is to form a source-derived operational baseline for the agency, client-service, engineer, fleet, workflow, recovery, notification, and WhatsApp channel features. It preserves the established Gate C rule that the table declarations, indexes, and foreign keys must be taken from reviewed source rather than inferred from application field names.

## Reviewed scope

The original wave plan assigns 37 tables to “Operational portals and workflows.” The requested operational-channel scope adds `recovery_cases`, `recovery_correspondence_log`, and `whatsapp_sessions`, which the earlier map assigned to Wave 5. All three have currently implemented non-test server paths: the recovery router is registered in `server/routers.ts`; the recovery trigger and router consume the two recovery tables; and the WhatsApp webhook/session manager consumes `whatsapp_sessions`.

The planning recommendation is therefore a **40-table Wave 4**, provided the source-metadata blockers below are resolved. This is a planning reassignment only; it neither generates SQL nor promotes any held table.

| Operational group | Tables | Count |
|---|---|---:|
| Agency and client service | `agency_assisted_claimant_identities`, `agency_clients`, `agency_insurance_service_request_insurers`, `agency_insurance_service_requests`, `agency_insurance_valuation_deviations`, `agency_product_commission_configs`, `client_insurance_service_requests`, `client_vehicle_valuation_requests`, `service_requests` | 9 |
| Comments, approvals, governance, and notifications | `approval_workflow`, `claim_comment_reads`, `claim_comments`, `governance_audit_log`, `governance_notifications`, `governance_violation_log`, `notification_events`, `notification_preferences`, `notifications`, `platform_governance_limits`, `rate_limit_tracking` | 11 |
| Engineer and inspection workflows | `engineer_observations`, `engineer_profiles`, `inspection_projects` | 3 |
| Fleet operational portals | `fleet_accounts`, `fleet_audit_logs`, `fleet_drivers`, `fleet_intelligence_snapshots`, `fleet_manager_requests`, `fleet_rfq_client_instructions`, `fleet_risk_scores`, `fleet_vehicles`, `fleets` | 9 |
| Workflow configuration and audit | `tenant_workflow_configs`, `workflow_audit_trail`, `workflow_configuration`, `workflow_templates` | 4 |
| Requested operational-channel extension | `recovery_cases`, `recovery_correspondence_log`, `whatsapp_sessions` | 3 |
| **Total** |  | **40** |

The eight held candidates remain excluded: `audit_logs`, `benchmark_deviations`, `geometry_sources`, `photo_reextraction_jobs`, `tenant_tier_history`, `tenant_usage_summary`, `vehicle_landmarks`, and `vision_calibration_results`.

## Source-contract readiness result

The repository-only planner inspected all 40 selected tables. It found no missing source declaration, no unresolved declared reference, no dependency between two Wave 4 tables that needs internal creation ordering, no held-table overlap, and no duplicate configured index name within a table. It identified three source-contract blockers, which are deliberately held rather than repaired during planning.

| Blocker | Evidence | Why it blocks SQL generation | Narrow remediation requiring approval |
|---|---|---|---|
| `tenant_workflow_configs.id` lacks a primary key | `drizzle/schema.ts:3473–3486`; the existing required ID is `varchar({ length: 64 }).notNull()` | Wave 4’s baseline must give every selected table an explicit key; the current declaration does not. | Add only `.primaryKey()` to the existing `id` declaration. No column, value, index, or unique constraint change. |
| `workflow_audit_trail` has a blank configured index name | `drizzle/schema.ts:3921–3926`; `index("").on(table.claimId, table.createdAt)` duplicates the column pair already named `idx_audit_claim_timestamp` | A blank generated index identifier is invalid for the reviewed baseline and duplicates a named equivalent. | Remove only `index("").on(table.claimId, table.createdAt)`; retain `idx_audit_claim_timestamp` and the other named indexes. |
| `claim_comment_reads` is not in Drizzle’s configured source file | The table is declared in `drizzle/claim-comments-schema.ts:41–50`, while `drizzle.config.ts` configures only `./drizzle/schema.ts`. That auxiliary file also contains a duplicate physical `claim_comments` declaration. | A plain source generation cannot include `claim_comment_reads`; including the auxiliary file as-is risks two competing `claim_comments` declarations. | Establish one reviewed generation source for `claim_comment_reads` while retaining `drizzle/schema.ts`’s canonical `claim_comments.claimId` mapping. This is a source-of-truth decision, not a scratch-selector workaround. |

The repeated configured name `tenant_id` on `tenant_workflow_configs` and `workflow_configuration` is not a blocker: MySQL index names are scoped to their own table. It is recorded for reviewer clarity only.

## Declared dependency contract

The source parser sees six declared foreign-key dependencies from Wave 4 to reviewed earlier waves. The remaining operational reference columns are not treated as FKs merely because their names end in `Id`; no relationship has been inferred.

| Wave 4 table | Declared target already in Wave 1–3 | Required prerequisite |
|---|---|---|
| `approval_workflow` | `claims` | Wave 2 |
| `claim_comments` | `claims`, `users` | Waves 2 and 1 |
| `governance_notifications` | `claims` | Wave 2 |
| `notifications` | `claims` | Wave 2 |
| `recovery_cases` | `claims` | Wave 2 |
| `workflow_audit_trail` | `claims` | Wave 2 |

The eventual composed replay must revalidate the exact reviewed Wave 1, Wave 2, and Wave 3 SQL checksums and statement counts before it creates a new `kinga_gatec_wave4_*` target. This avoids relying on a historical report count when prior-wave files evolve during review.

## Proposed execution after source approval

After the three source decisions are made, the execution package should regenerate the source manifest and rerun the planning analyser. Only a result with 40 inspected tables, zero explicit-key gaps, zero blank or per-table duplicate index names, zero unresolved declared dependencies, zero held-table overlap, and all selected tables in the configured source may enter SQL generation.

The next step would generate a disposable full-schema snapshot using a local placeholder configuration, select only the approved 40 tables plus their source-declared indexes and foreign keys, and reject all other statements. Its static guard must allow only `CREATE TABLE`, named `CREATE INDEX`/`CREATE UNIQUE INDEX`, and source-declared `ALTER TABLE ... ADD CONSTRAINT` foreign-key additions. It must reject all data statements, `DROP`, arbitrary `ALTER`, unplanned tables, foreign-key targets outside Waves 1–4, empty identifiers, and identifiers longer than 64 characters.

Only after those static checks pass should the runner create two unique local `mysql://127.0.0.1:3317/kinga_gatec_wave4_*` targets. Each must compose the exact verified prior-wave SQL with the new Wave 4 SQL, capture SQL and structural metadata hashes, compare the two results, drop the exact database, and prove its absence. The runner must reject any external host, non-MySQL URL, invalid name, non-empty target, or any source table outside the reviewed composed set.

## Decision required before execution

No SQL or scratch replay should be generated from this plan until the three blockers receive explicit approval. The recommended bounded decision is:

1. Add `.primaryKey()` only to `tenant_workflow_configs.id`.
2. Remove only the unnamed duplicate `workflow_audit_trail` index, retaining `idx_audit_claim_timestamp`.
3. Canonicalise the source-generation ownership of `claim_comment_reads` while preserving the approved physical `claim_comments.claimId` convention and avoiding two active source definitions of `claim_comments`.

The third item needs a clear source-of-truth choice; it should not be resolved by silently using an unconfigured auxiliary schema or by changing `claimId` to `claim_id`. Gate D, a migration account, `kinga_staging`, production, and all eight held candidates remain outside this plan.

## Planning validation

The planning analyser is covered by a source-only regression that asserts the complete 40-table scope, requested recovery/WhatsApp extension, held-table exclusion, and the three blocking records above. It passed **1 file / 1 test**. A DB-disabled TypeScript check retains the 998 inherited repository diagnostics with no planning-path diagnostic, and `git diff --check` passed. A final file-system gate confirms no `wave-04-*.sql` file exists. These are planning validations only; they do not replace later static SQL guards, two scratch replays, or a review package after a separate source-contract approval.
