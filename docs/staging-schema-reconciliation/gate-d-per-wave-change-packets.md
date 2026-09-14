# Gate D Per-Wave Change Packets

## Packet rules

These packets translate the merged Gate C scratch proof into reviewable **future staging change controls**. They are not executable authorisations and contain no credentials or live target details. A packet is invalid unless its source revision, SQL SHA-256, target identity, recovery record, reviewer, and pre/postflight fingerprints are all filled against the actual authorised staging environment.

The ordered table counts below use the merged Gate C evidence: Waves 1–5 total 188 tables, and the approved `photo_reextraction_jobs` supplement makes 189. The seven excluded held tables and four deferred natural/composite-unique decisions appear in no packet.

| Packet | Reviewed source scope | Prerequisites | SQL artefact / expected operations | Preflight evidence | Postflight acceptance |
|---|---:|---|---|---|---|
| D-01 | Wave 1 identity/tenant roots; 3 tables | Empty authorised staging target or exact agreed baseline state | `wave-01-identity-tenant-roots.sql`; 11 statements | Target identity; zero/expected tables; no conflicting user/tenant root structures | 3 expected tables, PKs/unique keys/defaults/indexes exactly match the reviewed Wave 1 metadata. |
| D-02 | Wave 2 vehicle/claim core; 20 tables | D-01 metadata fingerprint and Wave 1 SQL SHA | `wave-02-vehicle-claim-core.sql`; 87 Wave 2 statements | Wave 1 structures match; no Wave 2 table/object exists | 23 cumulative tables; Wave 2 constraints/indexes/FKs match review evidence. |
| D-03 | Wave 3 assessment/evidence/reporting; 50 tables | D-01/D-02 fingerprints | `wave-03-assessment-evidence-reporting.sql`; 187 Wave 3 statements | 23 cumulative tables and all required targets match | 73 cumulative tables; 50 Wave 3 tables and approved keys/FKs/indexes/defaults match. |
| D-04 | Wave 4 operational portals/channels; 40 tables | D-01–D-03 fingerprints | `wave-04-operational-portals-channels.sql`; 135 Wave 4 statements | 73 cumulative tables; canonical `claim_comments.claimId` contract confirmed | 113 cumulative tables; canonical `claim_comment_reads`, `tenant_workflow_configs` key, and workflow audit index state match. |
| D-05 | Wave 5 intelligence/learning/analytics; 75 tables | D-01–D-04 fingerprints | `wave-05-intelligence-learning-analytics.sql`; 290 Wave 5 statements | 113 cumulative tables; source key reconciliation revision pinned | 188 cumulative tables; all 75 tables, 25 reviewed FKs, and inline unique constraints match. |
| D-06 | Approved supplemental `photo_reextraction_jobs`; 1 table | D-01–D-05 fingerprints | `photo-reextraction-jobs.sql`; 5 statements | 188 cumulative tables; `claims` target matches prerequisite metadata | 189 cumulative tables; the job table, 3 indexes, and FK match the supplement evidence. |

## Required packet attachment set

Each actual execution packet must include the following immutable or append-only records.

| Attachment | Required content |
|---|---|
| Source pin | Git main commit SHA, reviewed PR merge SHA, schema manifest SHA-256, selected SQL SHA-256, and table list. |
| Scope proof | Exact statement count/classes; permitted FKs and target tables; explicit declaration that there is no DML, `DROP`, or non-FK `ALTER`. |
| Target proof | TiDB Cloud organisation/project/cluster/database identifier, region, service class, TLS confirmation, authenticated account identity, and redacted grants. |
| Recovery proof | Accepted R1–R5 evidence from the Gate D readiness plan, current backup/PITR/manual recovery point identifier, UTC timestamp, restore rehearsal outcome, and recovery approver. |
| Preflight metadata | Machine-readable current table/column/key/index/FK/default fingerprint and an explicit empty/unexpected-object result. |
| Execution record | Operator/reviewer, start/end UTC, exact command/SHA validation, statement-by-statement result, server version, and an incident reference if stopped. |
| Postflight metadata | Same fingerprint format, expected vs actual object diff, and independent verifier account result. |
| Application validation | Separately authorised non-production smoke tests, tenant/role test identities, expected observations, actual observations, and sign-off. |
| Closure | Runner-account revocation/expiry evidence, retained log location, unresolved items, and approval/stop decision for the next packet. |

## Packet-specific stop conditions

All packets stop on target mismatch, unavailable recovery evidence, missing reviewer, privilege excess, SQL SHA mismatch, any unexpected prerequisite object, or any postflight diff. The following additional stop conditions apply.

| Packet | Additional stop conditions |
|---|---|
| D-01 | Existing staging structures differ from the 3-table root packet; the correct action is reconciliation planning, not overwrite. |
| D-02 | `claims`, `users`, or the approved Wave 1 roots are missing/mismatched. |
| D-03 | Any Wave 2 claim/vehicle core foreign-key target differs from packet metadata. |
| D-04 | `claim_comments` is not physically `claimId`, or an auxiliary duplicate comment/read declaration is proposed. |
| D-05 | Any selected primary-key or unique constraint differs from the merged Wave 5 source contract; deferred natural-key rules must not be added opportunistically. |
| D-06 | `photo_reextraction_jobs` already exists or its `claims` foreign-key target does not match the verified prerequisite. |

## Deferred items excluded from the packets

No packet may introduce the following without a new decision record: `audit_logs`, `benchmark_deviations`, `geometry_sources`, `tenant_tier_history`, `tenant_usage_summary`, `vehicle_landmarks`, `vision_calibration_results`, or a new natural/composite unique constraint for the four held relationship candidates. The priority tenant-role service correction is an application branch and is not a staging-schema packet.
