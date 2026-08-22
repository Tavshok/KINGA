# P0 Review: Deleted-User Re-Sync Is Now Fail Closed

## Approved Scope

This review branch corrects the deleted-user authentication bypass only. It does not change database schema, migrations, DDL, tenant assignments, roles, claims, policies, payments, settlements, or production records.

## Root Cause and Correction

Before this branch, `SDKServer.authenticateRequest()` looked up the session `openId` and called `upsertUser()` when no row existed. `upsertUser()` is an `INSERT ... ON DUPLICATE KEY UPDATE` helper, so a hard-deleted user with a valid session was inserted as a new active default account.

The corrected flow rejects every missing non-cron identity before any provisioning write. Interactive OAuth callback remains the only account-provisioning flow. The ordinary last-signed-in write was also changed from `upsertUser()` to `updateUserLastSignedIn()`, an update-only helper, to prevent a delete-between-read-and-write race from recreating a user.

| Situation | Before | After |
|---|---|---|
| Valid session, absent user row | Re-provisioned with `upsertUser()` | `FORBIDDEN: User not found` |
| Valid session, deactivated row | Rejected | Rejected |
| Active existing row activity timestamp | Upsert could insert after a concurrent delete | Update-only write cannot insert |
| Interactive OAuth callback | Provisions user | Unchanged; remains the only provisioning path |

## Legitimate `upsertUser()` Call-Site Review

| Call site | Classification | Outcome |
|---|---|---|
| `server/_core/oauth.ts` OAuth callback | Legitimate provisioning | Retained. It runs before a session is issued and receives identity data from OAuth. |
| `server/_core/sdk.ts` missing-user owner fallback | Unsafe recovery provisioning | Removed. A missing user row now always fails closed. |
| `server/_core/sdk.ts` missing non-owner fallback | Unsafe recovery provisioning | Removed. It caused the P0 revocation bypass. |
| `server/_core/sdk.ts` normal activity write | Legitimate existing-user activity update, but unsafe helper | Replaced with update-only `updateUserLastSignedIn()`. |
| `server/session-revocation.test.ts` test fixture setup | Test-only provisioning | Retained. |

## Real-Database Regression

The new live-database acceptance test creates a non-owner user, issues a valid KINGA session token, hard-deletes the database row, and sends the still-valid token through `authenticateRequest()`.

It proves both required outcomes: the request is rejected with `User not found`, and a fresh database lookup confirms that no user row was reinserted.

Focused result: **2 files passed, 8 tests passed** against the configured live TiDB database.

## Independent Null-Tenant Default-User Surface

This is not a new cross-tenant finding. A default `user` with `tenant_id=NULL` is admitted to the customer portal shell and client pages, including quote and valuation UI routes. However, the meaningful persisted customer actions traced in this review require a tenant-scoped session:

| Surface | Finding |
|---|---|
| Customer shell and client pages | Default role `user` is admitted by route policy. |
| Claim submission | `claims-core.submit` rejects missing tenant with `FORBIDDEN`. |
| Insurance quote persistence | `insurance-core.requestQuote` requires a non-empty tenant before vehicle or quote creation. |
| Public vehicle valuation estimate | Deliberately public; no account or tenant required. |

The remaining null-tenant state is therefore a **smaller portal-admission hygiene issue**, not a confirmed tenant-bound data-access or mutation path. It should be reviewed separately if KINGA decides that role `user` should never reach customer-shell UI before a tenant/claimant relationship is established. It is not remediated on this P0 branch.

## Complete Validation on This Branch

| Validation | Result |
|---|---|
| Focused mocked + real-database auth/revocation tests | 2 files passed; 8 tests passed |
| Full live-TiDB suite | 300 files passed, 11 failed; 8,672 tests passed, 26 failed, 3 skipped; 1 pre-existing worker-exit error |
| Bundled server build | Passed (`index.js` 6.5 MB) |
| Vite production build | Passed in 23.86 seconds; existing large-chunk advisory only |

The 26 remaining full-suite failures are the previously diagnosed legacy fixture, source-shape, and two-threshold policy groups. The deleted-user re-sync regression is no longer in the failure set.
