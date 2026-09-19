# WorkOS Package F: Local Session Extraction Proposal

**Date:** 19 September 2026

**Author:** Manus AI

**Status:** **Review only.** Approval of this document authorizes no source change, test change, branch, pull request, database migration, provider configuration, feature-flag change, staging action, production action, or deployment.

## Decision requested

Approve the review-only design boundary for **Package F**, a narrow refactor that separates KINGA’s existing local JWT and local-user session mechanics from the Manus HTTP/OAuth client. The package must preserve the active Manus browser login flow and every current KINGA authorization decision. It does not select, enable, configure, or contact a new provider.

The goal is architectural clarity. Manus remains responsible for the current interactive OAuth exchange and provider user-info calls. KINGA remains responsible for creating, verifying, and authorizing its own application session. The extraction makes this boundary explicit so a later controlled identity migration does not require the Manus HTTP client to own local session code.

> **Definition:** A “local session” is the existing KINGA-issued `app_session_id` cookie containing an HS256 JWT. It is not a Manus access token or a WorkOS token. The database remains the authority for the user’s active status, role, tenant, and other permissions.

## Current contract that Package F must preserve

The active callback at `/api/oauth/callback` exchanges a code with Manus, retrieves provider user information, upserts the local user, records the existing non-fatal login audit entry, mints a KINGA JWT, writes the `app_session_id` cookie, and redirects as it does today. Ordinary requests verify that local token, reload the user by `openId`, reject a missing or deactivated user, update `lastSignedIn`, and then derive the tRPC context from the database-backed user. [1] [2] [3]

The compatibility contract is intentionally exact. The cookie name remains `app_session_id`; the default token and cookie lifetime remains one year; the JWT remains HS256 with the existing `openId`, `appId`, and `name` payload fields; the name may remain empty; and the cookie remains host-only, `HttpOnly`, `Path=/`, `SameSite=Lax`, and `Secure` outside local hosts. The package must not add tenant, role, insurer-role, active-status, or other authorization claims to the token. Those values are refreshed from the database on every normal request. [1] [4] [5]

Logout remains a public mutation with the existing `{ success: true }` response and clears the same cookie. `createContext` continues to convert authentication failures to `user: null`; protected tRPC procedures continue to turn that into their existing `UNAUTHORIZED` response. Browser navigation, local-storage return-path behavior, current login copy, recovery URL, and the active Manus callback-state contract are outside this package. [3] [6]

## Proposed boundary

Package F would introduce one server-only, provider-neutral module, tentatively named `server/_core/kinga-session.ts`. The module would own only the existing local-session mechanics:

| Contract                                 | Intended responsibility                                                                       | Compatibility requirement                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `LocalSessionPayload`                    | Declares exactly the current signed local JWT claims.                                         | Retains only `openId`, `appId`, and `name`; it does not add authorization or extension claims.   |
| `issueLocalSession` / `signLocalSession` | Creates the current HS256 JWT with the current default or explicitly supplied expiry.         | Existing browser cookies remain valid during the compatibility window.                           |
| `verifyLocalSession`                     | Verifies only the existing local JWT and returns its compatible payload or `null`.            | Restricts verification to HS256 and preserves the current missing/invalid/expired-token outcome. |
| `readLocalSessionCookie`                 | Parses `app_session_id` from a request.                                                       | Does not inspect provider cookies, tokens, or query values.                                      |
| `resolveActiveLocalUser`                 | Performs the ordinary local database entitlement check and update-only `lastSignedIn` write.  | Missing and deactivated users fail closed; this path must never upsert a user.                   |
| Session cookie helpers                   | Supplies one canonical current cookie-option source for normal session issuance and clearing. | Preserves the exact name, path, `HttpOnly`, `SameSite`, and local-host `Secure` behavior.        |

The module may depend on the existing JWT library, cookie parsing, local configuration, shared constants, and local database interfaces. It must not import Axios, Manus endpoint paths or response types, `OAUTH_SERVER_URL`, WorkOS adapters or routes, provider credentials, provider tokens, Express route registration, or browser navigation code.

`server/_core/sdk.ts` would retain Manus-specific responsibilities: code exchange, user-info retrieval, and the existing special scheduled-task identity bridge. During this package, it may expose compatibility delegates while direct call sites migrate. The active Manus callback would continue to own provider exchange, user-info validation, local upsert, audit, and redirect behavior; it would change only the local-session issuer dependency. [1] [2]

## Controlled migration sequence

The implementation must first characterize the existing behavior before moving it. The expected sequence is as follows:

1. Add the local-session module and deterministic compatibility tests with synthetic secrets and fixed time.
2. Move the current signing, verification, normal cookie parsing, ordinary database entitlement checks, and update-only last-sign-in operation behind that module without changing their decisions.
3. Leave the Manus SDK responsible for its HTTP client methods, with compatibility delegation where it prevents an unreviewed call-site rewrite.
4. Migrate the active callback, tRPC context, normal logout clearing, and direct normal-session consumers one by one while retaining their existing responses.
5. Keep special identities and special issuers explicitly outside the new ordinary-session path unless a separate approved compatibility shim preserves their current behavior.
6. Remove any temporary SDK session delegate only after a separate call-site inventory and compatibility review prove that no active caller depends on it.

This is a source-level extraction. It does not authorize any migration, data operation, provider configuration, redirect-URI registration, deployment, or feature enablement.

## Explicit exclusions and stop conditions

Package F excludes **all provider selection and provider switching**. Manus remains the sole active browser provider. WorkOS Package D remains default-off and is not changed, configured, or enabled. The package must not add a WorkOS client request, browser UI, callback change, account linking change, token exchange, PKCE change, transaction-store change, or secret.

It also excludes changes to the Manus OAuth code exchange, callback state encoding or parser, browser return-path handling, account provisioning policy, `users.openId`, user/tenant schema, feature flags, cookie security policy, JWT lifetime, JWT algorithm, JWT claims, `JWT_SECRET` startup validation, claim-audience validation, user revocation policy, authorization policy, tenant logic, external logout, staging, production, deployment, and data. Any need to change one of these is an immediate stop condition requiring a separate proposal.

The `cron_` identity branch is excluded. It currently performs a Manus `GetUserInfoWithJwt` lookup after local JWT verification and bypasses the ordinary local-user lookup. Package F must not treat it as a human browser session, remove it, or turn it into a new service-token design. Package G owns its future separation. [1]

Existing impersonation-adjacent paths are excluded as well. The marketplace impersonation start flow is suspended. The separate impersonation router currently calls the signer with a short expiry and extra values, but the current signer serializes only `openId`, `appId`, and `name`; those extra values are **not** established JWT claims. Package F must preserve that present three-claim outcome, must not enable, normalize, broaden, or silently repair either path, and must stop for a separately approved design if an impersonation change is needed.

## Required regression evidence

The implementation package must run only through the fail-closed `kinga_ci_test` wrapper. It must use no live, staging, external, or populated application database.

The focused evidence must prove the following outcomes:

| Area                   | Required evidence                                                                                                                                                                                                                                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JWT compatibility      | Default and explicit-expiry issuance; HS256 header; compatible claims; acceptance of empty or absent name; rejection of missing cookie, malformed token, wrong signature, expiry, unsupported algorithm, missing `openId`, and missing or empty `appId`.                                                                                                    |
| Cookie parity          | Exact normal issuance and clearing attributes for local and deployed hosts, including `app_session_id`, `HttpOnly`, `Path=/`, `SameSite=Lax`, and `Secure` behavior.                                                                                                                                                                                        |
| Local entitlement      | Active local user succeeds; missing and deactivated rows fail closed; authenticated requests update only `lastSignedIn`; no request-time user upsert occurs.                                                                                                                                                                                                |
| Authorization boundary | Context still maps failures to `user: null`; protected procedures remain `UNAUTHORIZED`; local role, tenant, agency-assisted, and insurer-domain checks remain database-backed.                                                                                                                                                                             |
| Manus callback         | Mocked Manus exchange/user-info flow still upserts and audits as before, then asks only the new local module to issue the equivalent cookie and redirect.                                                                                                                                                                                                   |
| Logout                 | Existing public response and client cache behavior remain unchanged; clearing uses the canonical session policy.                                                                                                                                                                                                                                            |
| Direct normal callers  | Existing upload and audit-export authentication behavior remains unchanged, including unauthenticated failure paths and local tenant authority.                                                                                                                                                                                                             |
| Special compatibility  | Ordinary human sessions never call Manus `GetUserInfoWithJwt`; the current `cron_` branch remains covered without designing Package G early; suspended marketplace impersonation remains fail-closed; and the active separate impersonation router retains its current short-expiry invocation and three-claim signed output without new serialized fields. |
| Scope proof            | Static source checks demonstrate that the new module contains no provider HTTP import and that Package F has changed no client navigation, WorkOS source, schema, migration, environment, or provider configuration file.                                                                                                                                   |

Existing revocation and resynchronization tests must remain part of the focused suite because they establish the missing-user and deactivated-user contract. Logout coverage must assert the observed `SameSite=Lax` policy and must not change runtime cookie policy as part of this extraction. [4] [7] [8]

## Rollback and future sequencing

The source-only rollback is a return to the current combined SDK implementation. Any difference in token validity, cookie persistence, context user, protected-procedure result, callback redirect, local-user enforcement, normal request network behavior, or scheduled-task behavior stops the review.

Package F is the next preparatory layer only. Package G must separately design non-human/service identity separation. Package H must separately design provider selection and controlled cutover. Neither package is approved by this proposal.

## Next decision after proposal review

Approval of this document would approve **only the Package F design boundary**. It would not authorize an implementation branch, source or test changes, a pull request, provider configuration, WorkOS enablement, migration execution, staging, production, deployment, or data operation.

A later explicit owner request would be required to implement the approved source package on an isolated branch, run the stated regression matrix against the disposable database, obtain independent review, and open a separate source-review pull request.

## Independent proposal review

The first independent security and architecture review approved the local-session, Manus-boundary, cron-separation, and workflow-isolation design but found one scope leak: the draft described unsupported extra values passed by the active impersonation router as if they were established extension claims. The proposal was corrected to define the session payload as exactly the current three signed fields—`openId`, `appId`, and `name`—and to require a non-regression check of the router’s current short-expiry, three-claim output. It now expressly reserves any impersonation repair or redesign for separate authority.

The corrected proposal received a final independent approval with no required remediation. The review confirmed that the proposal remains review-only, preserves Manus as the sole active provider, keeps the `cron_` Manus bridge out of ordinary human-session extraction, and does not authorize a provider, configuration, migration, staging, production, deployment, or data action.

## References

[1]: ../../server/_core/sdk.ts "Mixed Manus HTTP client and current KINGA local session implementation"
[2]: ../../server/_core/oauth.ts "Active Manus OAuth callback and local session issuance"
[3]: ../../server/_core/context.ts "Request authentication and tRPC context construction"
[4]: ../../server/_core/cookies.ts "Current KINGA session-cookie policy"
[5]: ../../shared/const.ts "Session cookie name and one-year duration"
[6]: ../../server/routers/auth-core.ts "Current auth.me and logout contracts"
[7]: ../../server/session-revocation.test.ts "Local session revocation regression coverage"
[8]: ../../server/auth.resync.test.ts "Missing-user and no-resynchronization regression coverage"
[9]: workos-package-e-provider-neutral-client-navigation-proposal-2026-09-19.md "WorkOS Package E provider-neutral client navigation boundary"
