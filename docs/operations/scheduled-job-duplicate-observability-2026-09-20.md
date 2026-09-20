# Scheduled-Job Duplicate Observability

**Status:** Source-only review package
**Recorded:** 2026-09-20T19:28:00+02:00
**Scope:** Intake escalation and stuck-assessment recovery only

## Purpose

KINGA is intentionally permitted to run background work from both Manus and Render against the same staging database. This package does **not** add a lease, a lock, notification suppression, scheduler fencing, or any cross-runtime coordination. It adds structured runtime evidence so that duplicate processing can be diagnosed rather than silently appearing as unexplained double notifications or competing claim updates.

## Event contract

Every emitted event is one JSON line written through `console.warn` under the stable event name `scheduled_claim_race_observation`. The event includes the following correlation fields:

| Field                                                                                                  | Meaning                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `job_key`                                                                                              | `intake-escalation` or `stuck-recovery`                                                                                                 |
| `invocation_source`                                                                                    | `heartbeat`, `in_process_interval`, `startup_cleanup`, `startup_immediate`, or `direct`                                                 |
| `job_run_id`                                                                                           | Unique identifier for one job invocation                                                                                                |
| `runtime_instance_id`                                                                                  | Per-process random identifier; different values distinguish concurrent runtimes                                                         |
| `runtime.hostname`, `runtime.service`, `runtime.node_env`, `runtime.pid`, `runtime.process_started_at` | Runtime attribution without application secrets                                                                                         |
| `heartbeat_task_uid`                                                                                   | Existing scheduler task identifier when the HTTP heartbeat route invoked the job; otherwise `null`                                      |
| `phase`                                                                                                | `candidate_selected`, `side_effect_intent`, `side_effect_completed`, `pipeline_trigger_dispatched`, or `error`                          |
| `action`                                                                                               | Stable action name, such as `intake_auto_assign`, `intake_escalation_notification`, `recovery_retrigger`, or `recovery_reset`           |
| `claim_ref`                                                                                            | Internal claim correlation reference in the form `claim:<id>`; no claim number, claimant name, document URL, or message body is emitted |
| `recovery_case`                                                                                        | The stuck-recovery case label where applicable                                                                                          |
| `batch_fingerprint` and `candidate_count`                                                              | Deterministic opaque batch correlator for aggregate intake notifications; individual claim IDs are not placed in the aggregate event    |
| `outcome` and `error_code`                                                                             | Result classification. Error messages and stack content are intentionally not serialized.                                               |

## What counts as a duplicate-job symptom

A probable duplicate is two events with the same `job_key`, `action`, and `claim_ref` (or the same `batch_fingerprint` for aggregate intake notifications) within the same operational window, but with different `runtime_instance_id` or `invocation_source`. The sequence to compare is normally `candidate_selected` → `side_effect_intent` → `side_effect_completed` or `pipeline_trigger_dispatched`.

This evidence is diagnostic, not an assertion that the work was incorrect. The accepted dual-runtime posture means the events may legitimately coincide. It provides the operator with enough context to distinguish one process retrying work from two deployments acting on it.

## Boundaries

This package intentionally preserves existing behavior. It does not alter job candidate queries, claim mutations, notification recipients, retry counters, task authorization, or scheduler frequency. Existing unstructured operational logs remain unchanged. It also does not activate WorkOS or modify Render, Manus, `kinga_staging`, secrets, or scheduled-task configuration.

> A detected duplicate is to be investigated from logs first. Any actual cross-runtime suppression or fencing would be a separately scoped distributed-systems package, not an incremental change to this visibility package.

## Safety and validation

Emission is best-effort. The event builder and the log sink are enclosed in a non-throwing boundary, so an unavailable or misconfigured sink cannot interrupt a claim mutation, notification, retry decision, or pipeline dispatch. Error fields use a small allowlist of mapped operational codes. Unknown `error.code`, `error.name`, messages, stack traces, response bodies, signed URLs, and bearer-like values are represented only as `UNCLASSIFIED_ERROR`.

Focused isolated tests cover the shared event contract, safe redaction of hostile error fields, hostile error getters, a deliberately throwing log sink, intake auto-assignment, intake notification failure, stuck-recovery re-trigger/finalization, and both successful and failed startup max-retry reset paths. The test database is the guarded disposable `kinga_ci_test` path only.

The final focused matrix passed **17 tests in 3 files**. A final independent review approved the implementation after verifying the non-throwing boundary and failed-mutation lifecycles. The merge-readiness run passed the full guarded suite: **588 files passed, 1 skipped; 9,622 tests passed, 4 skipped**.
