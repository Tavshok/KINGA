# WorkOS Package G2 Source Implementation — Safety Stop Record

**Date:** 20 September 2026
**Author:** Manus AI
**Branch:** `feat/workos-human-eligibility-integrity`
**Disposition:** **Stopped before implementation because the required MariaDB/TiDB-compatible absence-lock proof cannot be made with the authorized design constraints.**

## Conclusion

Package G2 was not partially implemented. The approved scope makes a failed transaction-isolation or range-lock proof a stop condition. That condition was reached while validating the callback's required absence checks.

The disposable MariaDB target proves that an indexed non-unique equality lookup with `SELECT ... FOR UPDATE` can next-key lock an absent value under `REPEATABLE READ`. The same protocol is not portable to TiDB. TiDB documents that range predicates do not block concurrent inserts because TiDB does not support gap locking. TiDB pessimistic transactions support only `REPEATABLE READ` and `READ COMMITTED`, rather than a true `SERIALIZABLE` mode that could replace the missing gap lock.[1] [2]

This incompatibility affects two mandatory callback invariants:

1. After the callback finds exactly one canonical-email candidate, a concurrent user insert can create a second candidate before commit.
2. After the callback observes no denying association through a non-unique user-reference index, a concurrent association insert can create one before commit.

A final guarded `UPDATE users` cannot close either absence race by itself. It can compare properties of the selected user row, but it cannot express or lock the absence of a second email candidate or an association row in another table. An equal existing `workos_user_id` does not change this conclusion.

## Disposable proof performed

The proof connected only to `mysql://127.0.0.1:33306/kinga_ci_test`. It created a uniquely named temporary InnoDB table, ran an absent indexed equality lookup under `SELECT ... FOR UPDATE`, measured a concurrent insert, and removed the table. The observed server was MariaDB `10.11.14-MariaDB-0ubuntu0.24.04.1`; the insert remained blocked for approximately 3.26 seconds until the locking transaction committed. This confirms the MariaDB half of the proposed next-key protocol.

A separate loopback probe confirmed that the MariaDB server accepts `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`. The transaction later reported the session default after rollback, as expected. This result does not establish TiDB compatibility.

TiDB's published behavior is decisive for the other half of the compatibility requirement:

> “When TiDB executes DML or `SELECT FOR UPDATE` statements that use range in the `WHERE` clause, concurrent DML statements within the range are not blocked.” TiDB attributes this difference to the absence of gap locking.[2]

TiDB also documents only `REPEATABLE READ` and `READ COMMITTED` for pessimistic transactions.[2] Its `REPEATABLE READ` implementation is snapshot isolation and permits broad phantoms and write skew.[1]

## Why no weaker implementation was made

Several possible shortcuts would violate the authorized scope:

- A unique canonical-email constraint would prevent the candidate race, but the scope expressly forbids a blanket email uniqueness migration and requires duplicate canonical emails to remain representable and denied.
- A canonical-email mutex table could work only if every user-email insert and mutation acquired the same pre-existing point lock. Existing user writers do not follow such a protocol. Retrofitting every writer, defining key creation/backfill, and governing direct database writes would exceed the narrow package and the no-backfill rule.
- Locking the selected user row could coordinate normalized association writers only if every legacy and normalized association writer first locked that user. It still would not protect candidate-email absence, and it would not establish a database-level invariant against ungoverned inserts.
- Checking again immediately before the final user update leaves a commit-window race on TiDB because the checked absent ranges are not locked.
- Relying on role, email, local verification, tenant, provider claims, phone matches, association absence, or an existing WorkOS ID would violate the required explicit `human_eligible` rule.

No migration, Drizzle declaration, linker change, agency writer, fixture, production transition writer, or eligibility classification was therefore added. This avoids creating schema that appears to provide an integrity guarantee the callback cannot uphold.

## State preserved

Package D remains source-default-off. No WorkOS route was enabled. No WorkOS configuration, secret, redirect URI, feature flag, tenant mapping, scheduler, Render setting, GitHub Actions workflow, account, deployment, or live data was touched. Ordinary Manus OAuth and local KINGA session behavior were not changed.

No user was classified as `human_eligible`. The planned eligibility governance remains unresolved and deny-by-default: authorized actors, approvals, reason codes, audit readers, retention, break-glass handling, and downgrade rules still require separate owner decisions. Whether any independently verified agency-associated person may become eligible also remains undecided and must remain denied.

No agency-assisted identity row was rewritten or reconciled. Legacy shared-pointer records remain untouched. No claim ownership or provenance was changed. The separate 98-row `claims.claimant_id = 0` historical repair was not touched.

## Required decision before implementation can resume

Implementation needs an owner-reviewed serialization design that works on both deployed database families without inferring safety from missing rows. A viable proposal must close both canonical-email candidate insertion races and association insertion races. It must also retain non-unique canonical email semantics and avoid data backfill.

One possible direction is a durable point-lock namespace with a proved lifecycle and mandatory participation by every relevant writer. That direction would require a separately approved expansion of scope because it affects all user-email creation and mutation paths, association writers, initial key population, and integrity verification. Another direction is an owner-approved deployment constraint to a database with suitable predicate or gap locking, but changing database compatibility or configuration is outside this package.

Until such a design is approved and proved on disposable MariaDB and TiDB-compatible targets, the safe state is the current one: **Package D remains off, and G2 admission remains unavailable.**

## Verification status

Because the mandatory compatibility proof failed before source implementation, no G2 migration replay or G2 implementation suite was run or represented as completed. The checks that remained meaningful produced these exact results:

- The guarded loopback MariaDB absence-range probe passed against `kinga_ci_test`. The measured concurrent insert block was 3,263 milliseconds, and cleanup left no probe table.
- `pnpm test -- server/_core/workos-auth-routes.test.ts` passed: one file and nine tests passed. This retained the generic callback failure and no-session boundary.
- `pnpm test -- server/_core/workos-auth-route-registration.test.ts` failed: one of two tests failed because the existing maintenance request gate returned HTTP 503 where the test expected the unmounted WorkOS route to return HTTP 404. The process logged, “Public request gate enabled; only /healthz is available.” G2 did not alter the maintenance setting or this test.
- `pnpm check:server` passed and printed `Server bundle OK`.
- `git diff --check` passed.

The work remains uncommitted and unpushed.

## References

[1]: https://docs.pingcap.com/tidb/stable/transaction-isolation-levels "TiDB Transaction Isolation Levels"
[2]: https://docs.pingcap.com/tidb/stable/pessimistic-transaction/ "TiDB Pessimistic Transaction Mode"
[3]: file:///home/ubuntu/kinga-replit/audit/workos-package-g2-rescoped-implementation-scope-2026-09-20.md "WorkOS Package G2 — Rescoped Implementation Scope"
