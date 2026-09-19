# WorkOS Package F: Local Session Extraction Implementation Evidence

**Date:** 19 September 2026
**Branch:** `feat/local-session-extraction`
**Scope authority:** Owner-approved Package F design only. This is a **source-only compatibility extraction**; it neither selects nor enables a browser identity provider.

## Outcome

Package F moves KINGA’s existing local JWT mechanics out of the Manus HTTP client and into a server-only `kinga-session` module. The active Manus OAuth callback now asks that local module to issue the same session cookie after its existing code exchange, user-info retrieval, local upsert, audit, and return-path flow. The SDK retains explicit compatibility delegates and the established `cron_` bridge, so no active provider switch, new human-auth route, WorkOS configuration, data change, or session-policy redesign is introduced.

> **Compatibility statement:** the normal JWT remains HS256 and contains only `openId`, `appId`, and `name`; the one-year default expiry, cookie policy, database-backed entitlement check, and active Manus browser login flow are unchanged.

## Source changes

| Area                            | Change                                                                                                                                                                  | Compatibility control                                                                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/_core/kinga-session.ts` | New provider-neutral local-session boundary for signing, verification, normal cookie parsing, and active local-user entitlement resolution.                             | The module has no provider HTTP, OAuth endpoint, WorkOS, or route-registration dependency. It serializes only the existing three claims and verifies HS256 only. |
| `server/_core/sdk.ts`           | Retains Manus code exchange, user-info lookup, and `cron_` identity bridge; delegates local signing, verification, cookie reading, and ordinary active-user resolution. | Existing call sites remain valid. The `cron_` branch remains outside local-user resolution and still calls `GetUserInfoWithJwt`.                                 |
| `server/_core/oauth.ts`         | Replaces direct SDK session creation with `createLocalSessionToken`.                                                                                                    | The callback retains the same exchange, provider user-info, local upsert, audit, `ONE_YEAR_MS` expiry, cookie options, and redirect behavior.                    |
| `server/_core/index.ts`         | The existing diagnostic endpoint verifies the normal session using the local verifier.                                                                                  | The endpoint remains diagnostic-only; routes, providers, middleware order, and feature flags are unchanged.                                                      |
| Regression tests                | Adds local-session contract, callback issuance, and cron-compatibility coverage.                                                                                        | The two original KINGA-AUTH-01 deleted-user/revocation test files are retained byte-for-byte from current `main`.                                                |

## Security and compatibility controls

The local verifier rejects missing cookies, malformed tokens, bad signatures, unsupported algorithms, expired tokens, absent `openId`, and absent or empty `appId`. It deliberately preserves the existing behavior for an absent `name` field in a legacy token and retains an empty issued name for accounts without a display name.

Every ordinary human session still resolves its local user record on each request. A missing user or `isActive = 0` fails closed, and the follow-up activity update is update-only; no request-time upsert or OAuth re-synchronization is possible. This preserves the **KINGA-AUTH-01** deleted-user revocation guard rather than recreating it in a new test shape.

The special `cron_` branch was deliberately retained in `sdk.authenticateRequest`. It verifies the local token first and then uses the existing Manus `GetUserInfoWithJwt` bridge to construct the synthetic scheduled-task identity. It does not query or update an ordinary local user row. This preserves current scheduled-job behavior and reserves non-human identity redesign for Package G.

Suspended impersonation paths remain untouched. The compatibility signer continues to serialize only the existing three claims, even when a legacy caller provides additional runtime values; Package F does not convert those values into JWT claims or reactivate any suspended flow.

## Regression evidence

All tests ran through `pnpm test`, which invokes `scripts/run-isolated-vitest.ts`. The fail-closed runner supplied the dedicated local `kinga_ci_test` target; no live application `DATABASE_URL`, staging database, external provider, or populated database was used.

| Validation                                            |                                                          Result | Evidence                                                                                                                                                                                                                                   |
| ----------------------------------------------------- | --------------------------------------------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Original KINGA-AUTH-01 tests, unmodified              |                                                **8 / 8 passed** | `server/auth.resync.test.ts` and `server/session-revocation.test.ts` are unchanged from `user_github/main`; they prove hard-deleted and deactivated users remain rejected and cannot be OAuth-resynchronized during normal authentication. |
| New local-session boundary                            |                                                **7 / 7 passed** | HS256/claim/expiry parity, malformed/invalid token rejection, empty-or-absent name compatibility, cookie parsing, active/missing/deactivated local-user decisions, and static provider-independence checks.                                |
| Manus OAuth callback boundary                         |                                                **1 / 1 passed** | Mocked callback preserves exchange, user-info, upsert, audit, cookie, and redirect flow while asserting only the local issuer creates the session.                                                                                         |
| `cron_` bridge compatibility                          |                                                **1 / 1 passed** | Verifies the special identity still calls the existing JWT user-info bridge and does not use ordinary local-user lookup or activity update.                                                                                                |
| Cookie, logout, and governed audit-export regressions |                                                **9 / 9 passed** | Confirms current cookie attributes, logout contract, and authenticated audit-export authority remain intact.                                                                                                                               |
| Focused matrix total                                  |                                              **26 / 26 passed** | Executed against the isolated database.                                                                                                                                                                                                    |
| Full isolated suite                                   | **575 files passed; 1 skipped. 9,531 tests passed; 4 skipped.** | Completed in 164.00 seconds against `kinga_ci_test` after a disposable-schema reset.                                                                                                                                                       |
| Server bundle                                         |                                                      **Passed** | `pnpm check:server` completed successfully.                                                                                                                                                                                                |
| TypeScript comparison                                 |                                          **No new diagnostics** | Branch: 1,000 inherited diagnostics; current `main`: 1,001. The one removed diagnostic is the prior SDK `unknown` session-payload type issue; no changed Package F path reports a diagnostic.                                              |
| Diff integrity                                        |                                                      **Passed** | `git diff --check` passed; new Package F files were formatted. Existing touched repository files retain their pre-existing non-Prettier layout to avoid unrelated formatting churn.                                                        |

## Scope verification

A targeted source scan confirms that `server/_core/kinga-session.ts` contains no `axios`, `OAUTH_SERVER_URL`, WorkOS reference, provider user-info call, or Express-router registration. No client navigation, WorkOS source, schema, migration, environment contract, provider configuration, secret, external service, staging, deployment, or data path was changed.

Current direct SDK session callers remain intentional compatibility points: the general tRPC context and scheduled endpoints retain `authenticateRequest` because it preserves the existing `cron_` branch; the default-off WorkOS callback retains a session-issuer compatibility delegate; suspended impersonation and test support paths retain their current behavior. These are not a provider switch and are explicitly deferred from Package F redesign.

## Independent review outcome

An independent senior security and architecture review approved the implementation with **no required changes**. It verified that the active browser flow remains Manus OAuth, that the extracted module has no provider dependency, that the JWT and cookie contract is preserved, and that `cron_` remains on its existing special bridge.

The reviewer compared the two original KINGA-AUTH-01 files with `user_github/main` and recorded identical blob hashes: `aa2750adafb9d0911a1f3947911d93ac6cbc46e0` for `server/auth.resync.test.ts` and `e318061dd6c3e108f11b7821fedfd7b776d731b4` for `server/session-revocation.test.ts`. The reviewer independently reran a 17-test security subset and the complete guarded suite. The full rerun reproduced **575 passed files, 1 skipped file, 9,531 passed tests, and 4 skipped tests**, completing in 191.75 seconds. Runtime duration is expected to vary; the pass/fail totals are the material result.

## Deliberate non-actions

Package F does **not** authorize or perform WorkOS configuration, identity linking, feature enablement, route changes, callback changes, browser-provider selection, migration execution, schema/data operation, external staging action, deployment, authentication-policy hardening, or production access. Manus remains the sole active browser provider.

## References

[1]: ../../server/_core/sdk.ts "Manus HTTP client, compatibility delegates, and cron bridge"
[2]: ../../server/_core/kinga-session.ts "Extracted local session boundary"
[3]: ../../server/_core/oauth.ts "Active Manus callback and local-session issuer"
[4]: ../../server/auth.resync.test.ts "KINGA-AUTH-01 deleted-user no-resynchronization regression"
[5]: ../../server/session-revocation.test.ts "KINGA-AUTH-01 deactivated and hard-deleted session regression"
[6]: ../../scripts/run-isolated-vitest.ts "Fail-closed isolated Vitest runner"
