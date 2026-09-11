# Gate C Held Candidate Review

## Decision status

Eight of the fourteen user-nominated candidate declarations are held outside every Gate C baseline wave. The user’s nominated feature rationale was treated as a starting hypothesis, then checked against current production source paths. A table is not eligible merely because it has a schema declaration, a historical name, or a plausible future purpose.

| Held table | Verified current evidence | Why it remains held | Required decision before a future wave |
|---|---|---|---|
| `tenant_usage_summary` | Declaration exists in `drizzle/schema-usage-events.ts`; no exact current router, service, worker, scheduled job, pipeline stage, or UI path was found. | The proposed tier-crossover billing rationale is not established by current code. | Confirm whether a live billing/usage-summary feature exists, its owner, inputs, retention model, and activation path. |
| `tenant_tier_history` | Declaration exists in `drizzle/schema-usage-events.ts`; no exact current runtime path was found. | No live tier-history feature or tier-crossover billing path is currently evidenced. | Confirm product need, lifecycle writer, consumer, and whether it belongs in the initial baseline. |
| `audit_logs` | No exact current use of this physical table was found. The codebase has several differently named audit tables. | Name similarity is not evidence of the active audit path; automatic inclusion could create a duplicate/unused audit contract. | Reconcile audit-table ownership and designate the active canonical audit trail. |
| `benchmark_deviations` | No exact production router, service, worker, pipeline, scheduled job, or UI consumer was found. | No active feature path or stated rationale is verified in current code. | Confirm the business purpose, writer, consumer and activation state. |
| `photo_reextraction_jobs` | `server/routers.ts` registers the router; `server/routers/photo-reextraction.ts` and `server/photo-reextraction-worker.ts` implement it. No client invocation of `trpc.photoReextraction.*` was found. | This is server capability without a demonstrated active user or automated activation path. | Confirm whether it is enabled operationally, who triggers it, and whether a worker/runtime dependency is ready. |
| `vehicle_landmarks` | The only exact reference is `server/vehicle-geometry-seed/ingest-seed.mts`. Stage 6.5A does not read it during calibration. | A manual seed ingestion utility is not evidence that the table is part of current live processing. | Confirm the data-source/seed strategy, operational owner, and whether live calibration should consume landmarks. |
| `geometry_sources` | No exact current production runtime reference was found. | It has no demonstrated producer or consumer and may overlap a future geometry data-governance design. | Confirm source provenance requirements and the intended geometry model before inclusion. |
| `vision_calibration_results` | No exact current production runtime reference was found. Stage 6.5A records calibration state in the in-memory/assessment flow, not this declared table. | Adding it would establish a persistence contract that current code does not actually use. | Decide whether calibration results must be persisted, then define writer, reader, retention, and report/evidence implications. |

## Verified candidates not held

The remaining six nominated candidates have genuine current paths and are eligible only for their designated later scratch-review waves: `claim_comment_reads`, `currency_exchange_rates`, `adjuster_sign_offs`, `vehicle_models`, `measurement_types`, and `vehicle_geometry_measurements`. Their detailed router/pipeline evidence is retained in `gate-c-runtime-candidate-dispositions.json`.

## Timestamp-default follow-up, deliberately not changed

The Wave 1 issue was not isolated: a repository-only inventory found **173** remaining uses of `.default('CURRENT_TIMESTAMP')` across **157** tables outside Wave 1. They are recorded in `audit/gate-c-scratch-baseline/quoted-current-timestamp-defaults.json`. The four approved Wave 1 fields were converted and no other timestamp declaration was changed. Each later wave must review its own relevant occurrences before generated scratch SQL is accepted; no broad replacement is authorised by Wave 1.
