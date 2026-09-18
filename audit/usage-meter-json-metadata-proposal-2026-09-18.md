# Usage-Meter JSON Metadata Integrity Proposal

**Date:** 18 September 2026  
**Status:** Proposal only — no source, schema, dependency, configuration, or data change has been made  
**Scope:** Correct the usage-meter write boundary so metadata is stored as a JSON object rather than as a JSON string that contains serialized JSON.

## Finding

`usage_events.metadata` is declared as a native Drizzle `json()` column. The current `recordUsageEvent` implementation calls `JSON.stringify(params.metadata)` before passing the result to that column. The database adapter therefore receives a string where it should receive the object itself. When usage events begin to carry metadata, the stored JSON value can become a JSON **string** containing serialized object text rather than an addressable JSON object.[1] [2]

The live post-reset aggregate check found **zero usage-event rows**, so there is no historic metadata to migrate or repair. The proposed correction is forward-only and data-neutral.

## Proposed source change

Change only the metadata assignment in `server/services/usage-meter.ts`:

```ts
// Current
metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,

// Proposed
metadata: params.metadata,
```

At the same time, replace `Record<string, any>` with `Record<string, unknown>` in `UsageEventMetadata`. This improves the type boundary without changing the supported metadata shape or the public service API.

No database migration, index change, data update, dependency addition, reader rewrite, or compatibility fallback is proposed. Existing readers already accept either a parsed object or a string, so the change preserves their tolerant behavior while preventing future double encoding.

## Regression proof

The implementation package should add a database-backed regression to `server/services/usage-meter.test.ts` using only `kinga_ci_test`.

The test will record representative nested metadata, then verify all of the following:

1. Drizzle reads the stored value as an object with its nested values intact.
2. A raw `JSON_TYPE(metadata)` query returns `OBJECT`, not `STRING`.
3. The persisted document has no second layer requiring `JSON.parse` before its business fields are accessible.
4. Existing duplicate-reference protection and monthly aggregation tests still pass.

The test harness must retain its normal cleanup and execute only through the merged fail-closed CI database guard. It must not connect to the application database.

## Acceptance criteria and rollback

Acceptance requires the focused usage-meter regression, the direct JSON-type assertion, formatter checks, changed-path diagnostics, and the relevant isolated test suite to pass. The change is reversible by reverting one source assignment and its corresponding expectation; it has no live data migration or schema effect.

## Explicit exclusions

This package does not enable billing, change usage aggregation, repair historical data, alter tenant isolation, modify WorkOS, or change production configuration. It does not address the separate CI MariaDB datetime compatibility work.

## References

[1]: https://github.com/Tavshok/KINGA/blob/main/drizzle/schema.ts "KINGA usage_events JSON column declaration"
[2]: https://github.com/Tavshok/KINGA/blob/main/server/services/usage-meter.ts "KINGA usage meter event writer"
