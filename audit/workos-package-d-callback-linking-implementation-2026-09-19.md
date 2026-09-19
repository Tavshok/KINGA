# WorkOS Package D Callback and Guarded Linking Implementation

**Date:** 19 September 2026

**Author:** Manus AI

**Status:** **Source-review candidate.** The feature remains disabled by default. No WorkOS tenant, redirect URI, secret, external callback configuration, staging activation, production activation, or client-navigation change occurred.

## Conclusion

Package D adds a **default-off** WorkOS human-auth start/callback path. It preserves KINGA as the session authority. The only session created after a successful callback is KINGA’s existing local JWT session for an already existing, locally eligible user. The WorkOS route is not mounted unless `WORKOS_HUMAN_AUTH_ENABLED` is exactly `true`, and enabling it with incomplete provider settings fails startup rather than exposing a partially configured route.

The implementation adds a durable database-backed transaction table. It stores hashes for browser-visible `state` and browser-binding values, retains the PKCE verifier only until atomic consumption, and deletes consumed records, callback-observed expired records, and abandoned expired records through an immediate-plus-hourly cleanup loop. That loop is created only when the separately gated WorkOS route is mounted. It introduces no process-memory fallback outside test doubles.

## Admission and linking controls

The callback consumes a transaction before code exchange. It accepts only one `code`, one `state`, and an authenticated binding-cookie value. A replay, duplicate parameter, provider error, malformed request, missing binding, transaction expiry, redirect-URI mismatch, adapter failure, or local-link failure has the same query-free local failure redirect. The binding cookie is cleared on every terminal path. Responses set `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

A provider identity must have a verified email, a valid WorkOS user identifier, and a selected organization identifier. The local-linker canonicalizes the provider and local emails, selects and locks all canonical-email candidates without a `LIMIT 1` shortcut, and continues only when exactly one candidate exists. The candidate must be active, tenant-scoped, non-QA, and not an unregistered claimant. The locked tenant must be active, non-synthetic, and already mapped to the exact WorkOS organization. A non-null, conflicting `workos_user_id` denies the callback. A null mapping is conditionally set under the same transaction. There is no `upsertUser`, user insert, tenant insert, tenant mapping update, provider-role import, or WorkOS-token transfer to the KINGA session.

The tenant/organization mismatch path calls a narrow operational callback with a fixed reason enum only. It does not include a provider identifier, email, tenant identifier, organization identifier, state, code, PKCE value, or token.

## Durable schema and migration proof

The package adds `workos_auth_transactions` through migration `0061_workos_auth_transactions.sql`. The migration is registered as journal entry 61, so Drizzle’s normal migration reader loads it. Its primary key is the state hash and its only secondary index is the expiry index used by the bounded cleanup. The repository’s disposable MariaDB schema snapshot includes the same table contract.

A migration replay started from the current-main disposable schema in a new local MariaDB scratch database. It seeded the prior journal watermark, invoked Drizzle’s normal migration runner, and verified exactly eight expected columns and the `PRIMARY` plus `workos_auth_transactions_expires_at_idx` indexes. A committed regression also verifies that the journal entry and SQL are loaded by Drizzle’s migration reader. The scratch database was dropped in the script’s `finally` path. No live, staging, or application database was contacted.

## Verification

All tests below ran through the repository’s fail-closed `pnpm test` wrapper against the dedicated local disposable database. The remediated focused package completed **105 tests in 9 files**:

| Area                                        | Evidence                                                                                                                                                                                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Package C contract and cookie compatibility | 43 passing tests across `auth-transaction` and `cookies`                                                                                                                                                                                                                                         |
| Provider adapter and canonical callback URI | 32 passing WorkOS adapter tests                                                                                                                                                                                                                                                                  |
| Durable transaction store and migration     | Create, atomic single winner across two store instances, consumed-record deletion, journal loading, Drizzle-runner replay, and schema snapshot contract                                                                                                                                          |
| Bounded verifier cleanup                    | Immediate invocation, hourly schedule, expired-record deletion without future login traffic, fresh-record preservation, and fixed non-sensitive failure logging                                                                                                                                  |
| Callback route                              | Start redirect, binding cookie, session issuance only after local linking, replay rejection, duplicate/tampered/provider-error rejection, start compensation cleanup, stored callback-URI mismatch rejection, and generic terminal failure after exchange, link, persistence, or session failure |
| Guarded local linking                       | Success for a test-owned user plus verified-email, duplicate-email, inactive, unregistered-claimant, ambiguous-QA, synthetic/suspended/unmapped tenant, organization mismatch, conflicting-link, and competing-link race denials                                                                 |
| Default-off composition                     | Disabled route is absent without provider configuration; enabled incomplete configuration rejects startup                                                                                                                                                                                        |

`pnpm check:server` bundled the server successfully. The repository-wide TypeScript check retains inherited diagnostics, but the changed Package D source paths had no diagnostics after the linker’s nullable organization type was narrowed. Prettier passed on all new/changed Package D files except the pre-existing formatting debt in `server/_core/index.ts`; the inserted imports and guarded mount block were kept narrow without reformatting that large inherited file. `git diff --check` passed.

## Independent security review

The first independent review blocked publication on an unregistered migration, unbounded abandoned verifier retention, and incomplete post-exchange route-failure coverage. All three conditions were corrected before a second independent review. The final reviewer approved the package with no required changes. It specifically confirmed the journaled migration, enabled-feature-only cleanup, terminal-failure uniformity, default-off composition, transaction replay controls, canonical callback URI, guarded existing-user-only local linking, local KINGA session authority, and fixed-category Package D logs.

The reviewer also observed a green guarded suite of 571 files and 9,516 tests, with one pre-existing skipped file. This implementation record treats the package-focused 105-test run above as the primary narrow regression evidence; the repository quality gate will independently reproduce the full-suite check on the review branch.

## Scope retained for later packages

This package does not enable the feature, configure WorkOS, register any redirect URI, create or link an external account, modify the ordinary client login button, retire Manus OAuth, issue WorkOS-governed sessions, import provider roles, create a local user or tenant, or make staging/production changes. The separately approved Package D proposal remains the authoritative boundary for the next configuration and activation decisions. [1]

## References

[1]: ../docs/authentication/workos-package-d-callback-linking-proposal-2026-09-19.md "WorkOS Package D: Callback and Guarded Local-Linking Proposal"
