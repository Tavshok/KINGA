# Vehicle-Registry Containment Event Durability Proposal

**Date:** 18 September 2026  
**Status:** Proposal only — no source, schema, dependency, configuration, or data change has been made  
**Scope:** Make failed persistence of the `vehicle_registry_cross_tenant_match_contained` event visible and actionable, without changing the protective cross-tenant matching decision.

## Finding

When a VIN or registration number matches a vehicle registry row owned by another tenant, `upsertVehicleRegistry` correctly contains the condition: it does not mutate the other tenant’s registry row and it does not attach the incoming claim. It then calls the generic `emitClaimEvent` helper.[1]

The generic helper is intentionally best-effort: unavailable database access logs a warning and returns, while insert errors are caught, logged, and suppressed.[2] The vehicle-registry function has its own broad catch that converts all failures to `null`, and its only production caller runs it in a fire-and-forget task that logs another warning if it rejects.[3] Consequently, an audit-persistence failure can leave the containment decision correct but unrecorded and unalerted.

The general best-effort helper is used by routine analytics and workflow events. Changing it to throw globally would create unrelated availability changes. The correction should therefore be narrow and event-specific.

## Proposed source change

Add a strict event writer beside the existing best-effort helper in `server/db/intelligence-db.ts`, for example `emitRequiredClaimEvent`. It uses the same insert contract as `emitClaimEvent`, but:

1. It throws a named `RequiredClaimEventPersistenceError` when the database is unavailable or the insert fails.
2. It retains the underlying cause and includes only the event type and claim identifier in its safe operational message.
3. It does not alter the behavior of existing `emitClaimEvent` callers.

In `server/vehicle-registry.ts`, use this strict writer only for `vehicle_registry_cross_tenant_match_contained`. Add a narrow error class or sentinel so an audit-write failure is rethrown through the otherwise best-effort vehicle upsert. Ordinary vehicle-enrichment faults continue to log and return `null` as today.

At the fire-and-forget boundary in `server/db.ts`, catch that named required-audit error separately. Dispatch an owner notification with a concise, non-PII operational alert that identifies the contained-event type and claim identifier, then log the result of the notification attempt. The claim remains isolated; no cross-tenant registry mutation, attachment, retry-with-mutation, or automatic fallback is permitted.

> The required behavior is **fail-visible**, not fail-open: a failed containment audit must reject from the registry boundary and trigger an owner alert attempt. Routine claim-event telemetry remains non-blocking.

## Regression proof

A focused test package should cover four cases.

1. A successful VIN and registration containment still leaves the foreign registry and incoming claim unchanged, and records the required event.
2. A forced strict-event insert failure causes the containment path to reject with the named error rather than resolving to `null`.
3. The fire-and-forget boundary receives that error and attempts exactly one owner notification with no VIN, registration number, tenant identifier, claimant information, or payload contents.
4. A failure of a normal best-effort `emitClaimEvent` remains non-throwing, proving the strict behavior has not been accidentally broadened to normal analytics events.

The first case extends the existing tenant-containment regression. The remaining cases use module-level dependency mocks and run only against `kinga_ci_test`; no real notification or live database connection is permitted.

## Acceptance criteria and rollback

Acceptance requires the focused containment, strict-writer, and caller-boundary tests to pass; current normal event-emission tests to retain their non-blocking contract; formatter checks; changed-path diagnostics; and independent review of the fail-visible boundary.

Rollback is a source revert. No data migration, schema migration, or provider configuration is involved.

## Explicit exclusions

This package does not redesign the vehicle registry, alter cross-tenant containment, introduce automatic claim retries, change generic audit semantics, enable WhatsApp, modify WorkOS, or modify the separate connection-lifecycle and CI datetime work.

## References

[1]: https://github.com/Tavshok/KINGA/blob/main/server/vehicle-registry.ts "KINGA vehicle registry cross-tenant containment"
[2]: https://github.com/Tavshok/KINGA/blob/main/server/db/intelligence-db.ts "KINGA claim event persistence helper"
[3]: https://github.com/Tavshok/KINGA/blob/main/server/db.ts "KINGA post-pipeline vehicle registry task"
