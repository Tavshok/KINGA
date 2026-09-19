# WorkOS Package D: Callback and Guarded Local-Linking Proposal

**Date:** 19 September 2026
**Author:** Manus AI
**Status:** **Review only.** No source code, schema, migration, database, WorkOS configuration, callback registration, secret, staging action, production action, or deployment is authorized by this document.

## Decision requested

Approve a future, isolated Package D implementation that adds a disabled-by-default WorkOS start/callback path and a durable authentication-transaction store. The implementation would admit only one **existing** KINGA human account after every local identity and tenant boundary check passes. It would preserve the existing Manus login route and preserve KINGA’s local JWT cookie as the only application session authority.

The package would not auto-create a user, tenant, organization mapping, role, or local session from WorkOS data. It would not change the normal client login button or redirect existing users to WorkOS. Those changes remain separate, later decisions.

## Current position

Package A added nullable unique `users.workos_user_id` and `tenants.workos_organization_id` fields. Package B added an inert adapter that can construct an AuthKit authorization URL and exchange a code with PKCE, while exposing only the WorkOS user ID, email, verification flag, and selected organization ID. Package C1, merged as PR #113, added a route-free, five-minute local transaction contract with PKCE, binding-cookie options, and canonical internal return-path validation.

The existing Manus route remains the sole active human login path. It mints the current KINGA JWT in `app_session_id`; request authentication then reloads the local user and rejects an inactive account. Package D must reuse that local session mechanism only after a WorkOS identity has passed all local admission and linking gates. It must not transfer WorkOS access tokens, refresh tokens, authorization codes, PKCE material, or provider session data into the KINGA JWT or cookie.

The production population is now one retained local account. That makes a test-owned, end-to-end admission case practical, but it does not weaken the required failure behavior. A duplicate email, missing tenant mapping, organization mismatch, pre-existing conflicting WorkOS user ID, or any provider ambiguity must still deny access without creating or changing authority.

## Proposed source boundary

The package would add only the following server-side components after separate implementation approval.

| Component                                       | Proposed responsibility                                                                                                       | Explicitly excluded                                                                                  |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `server/_core/workos-auth-routes.ts`            | Disabled WorkOS start and callback handlers, generic failure handling, binding-cookie lifecycle, and dedicated rate limiting. | Changes to Manus `/api/oauth/callback`, client navigation, or general tRPC auth routes.              |
| `server/_core/workos-auth-transaction-store.ts` | Durable implementation of the C1 `HumanAuthTransactionStore` interface, including bounded expired-record hygiene.             | Any process-memory fallback or shared provider-token storage.                                        |
| `drizzle/schema.ts` and reviewed migration      | One narrow durable transaction record/table, if the final store design uses the application database.                         | Changes to users, tenants, roles, existing session schema, or historical WorkOS mappings.            |
| `server/_core/workos-linking.ts`                | Existing-account lookup, tenant/organization equality guard, conditional WorkOS-ID link, and local admission result.          | `upsertUser`, any insert, tenant/org creation, provider-driven role assignment, or mapping adoption. |
| `server/_core/env.ts`                           | A server-only, default-off `WORKOS_HUMAN_AUTH_ENABLED` gate and Package D configuration validation.                           | Client-exposed WorkOS values or an enabled default.                                                  |
| Focused test files                              | Durable-store, callback, linking, regression, and failure-path coverage using only test-owned CI data.                        | Live, staging, populated, or production database dependence.                                         |

The exact file names may be adjusted to align with existing module boundaries, but the behavioral boundary is fixed: **no durable store means no callable WorkOS route**.

## Durable transaction requirement

Package C1 deliberately has no production store. Package D must provide a durable record with at least the provider, state hash, browser-binding hash, PKCE verifier, exact configured redirect URI, canonical internal return path, creation time, expiry time, and consumed marker or delete semantics. State and browser binding remain server-side hashes; the raw PKCE verifier remains only in the durable record until it is consumed. No raw binding, verifier, return destination, identity data, or token may be logged or placed in a URL.

The only permitted URL boundary is OAuth’s required opaque `state`: it is sent to WorkOS on the authorization URL and returns with one authorization `code` on the exact callback query. Neither value may appear in any other URL, redirect, browser storage, error payload, analytics event, or application/proxy/access log. The callback must reject duplicate or malformed query values before exchange, send `Cache-Control: no-store` and `Referrer-Policy: no-referrer`, load no third-party content, and immediately redirect to a query-free local destination after either terminal failure or success. [1] [2]

Creation must persist the transaction before the start route redirects to WorkOS. Consumption must be a single atomic operation that returns exactly one non-expired matching transaction and marks it consumed or removes it. It must work after a process restart and across concurrent application instances. The test-only map in Package C1 is prohibited outside tests.

The store must delete a consumed record immediately. For an unconsumed expired record, it must irreversibly clear or delete the PKCE verifier, hashes, and return path within a documented bounded retention period. The implementation must include foreground expiry cleanup on transaction create and callback consumption, and propose a separately reviewed operational cleanup mechanism so inactivity cannot leave expired verifier material indefinitely. A cleanup race must not revive an expired or consumed transaction.

A binding cookie will use C1’s existing host-only, `HttpOnly`, `SameSite=Lax`, root-path, five-minute policy. Package D would define a dedicated cookie name. This cookie is only an additional browser-binding signal; it is not a session or identity credential.

## Start route

A new server-only `GET /api/auth/workos/start` route would exist only behind the default-off feature flag. The normal UI would not call it in Package D. While disabled, it must fail as a generic unavailable route rather than falling through to the Manus flow.

When a later approved environment enables the flag, the handler would accept only a local return path. It would normalize that path through Package C1, create the durable transaction, set the binding cookie, and ask the Package B adapter for an S256 authorization URL. The authorization request would use the transaction’s opaque state and the adapter’s exact configured callback URI. It would not derive an origin from a request, forwarded header, browser value, or state parameter. If any step after transaction creation fails, it must clear the binding cookie and invalidate the newly created transaction before returning a generic failure. [1]

The start route would use dedicated rate limiting. It would not place the verifier, binding value, raw return path, WorkOS organization, or identity data in browser storage, query parameters, or logs.

## Callback sequence

The proposed callback handler is `GET /api/auth/workos/callback`. In every enabled environment, `WORKOS_REDIRECT_URI`, the adapter configuration, the durable transaction record, the registered WorkOS redirect URI, and the route test must all resolve to one separately approved canonical absolute HTTPS URI whose path is exactly `/api/auth/workos/callback`, with no query, fragment, userinfo, alternate path, or forwarded-host derivation. Package D does not configure or register that URI. Existing Package B illustrative tests using `/api/oauth/workos/callback` must be replaced so this invariant is tested rather than preserved accidentally.

The required sequence is:

1. Reject a provider error, missing parameter, duplicate parameter, malformed state, absent binding cookie, disabled flag, or invalid configuration with the same generic failure outcome.
2. Atomically consume the durable Package C1 transaction before provider code exchange. A replay, mismatch, expiry, or missing record fails closed. The binding cookie is cleared on every terminal outcome.
3. Use the consumed transaction’s stored PKCE verifier and redirect URI to exchange the code through the existing Package B adapter. The browser cannot supply a verifier or redirect URI. [1] [2]
4. Apply the complete local admission and guarded-link sequence below. No session exists before it succeeds.
5. Mint the existing KINGA JWT only for the selected existing local account’s `openId`, set the existing `app_session_id` cookie with its current policy, and redirect only to the transaction record’s canonical return path.

All failures must be externally indistinguishable. The route may record a sanitized category and correlation ID for operations, but it must not reveal whether an email, tenant, organization, or account exists. It must never emit raw provider errors, authorization codes, tokens, PKCE values, state, binding values, emails, or account identifiers. WorkOS can return an error instead of a code, so this terminal failure path is required rather than optional. [1] [3]

## Local admission and guarded linking

The following conditions are cumulative. **Failure at any step stops the callback before session issuance.**

| Gate                       | Required condition                                                                                                                                                                                                                                                                                                                                                            | Failure behavior                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Provider identity          | Package B returns non-empty WorkOS user ID, non-empty email, `emailVerified === true`, and non-empty selected organization ID.                                                                                                                                                                                                                                                | Generic denial; no link or session.                                                                |
| Email match                | The verified provider email and stored local email normalize identically under one reviewed canonical-email helper. The helper rejects leading/trailing whitespace and comparison is case-insensitive.                                                                                                                                                                        | Generic denial; no account selection from a partial or noncanonical match.                         |
| Unique existing local user | A global local query returns exactly one candidate. It must never use `LIMIT 1` as an ambiguity shortcut.                                                                                                                                                                                                                                                                     | Generic denial; no auto-creation.                                                                  |
| Human eligibility          | The candidate is active and is not an unregistered claimant or other known non-human/agency-assisted identity. Any ambiguous `isQaAccount` classification is held for an explicit policy decision rather than silently treated as human.                                                                                                                                      | Generic denial; no role or identity conversion.                                                    |
| Local tenant               | The candidate has a tenant; the tenant exists, is active and non-synthetic, and already has a non-null `workos_organization_id`.                                                                                                                                                                                                                                              | Generic denial; no tenant, mapping, or organization creation.                                      |
| Tenant equality            | The returned WorkOS organization ID exactly equals the candidate tenant’s existing WorkOS organization ID. Email domain is never used as an organization proxy.                                                                                                                                                                                                               | Generic denial and a non-sensitive tenant-isolation event.                                         |
| Existing WorkOS link       | `users.workos_user_id` is null or already equals the returned WorkOS user ID. A different non-null value is a conflict, not a relink.                                                                                                                                                                                                                                         | Generic denial; no overwrite.                                                                      |
| Guarded update             | Under the same locked transaction, re-evaluate the canonical verified-email equality and prove exactly one eligible matching local candidate. The update reasserts that selected row, active human state, tenant, tenant organization mapping, and null-or-equal WorkOS-ID predicate. It writes only the previously null WorkOS user ID or confirms the equal existing value. | Generic denial on zero/multiple matches, zero/multiple matched rows, race, or unique-key conflict. |

The provider’s verified-email flag is mandatory. The local `users.emailVerified` field will be reported in the Package D implementation preflight but is **not silently added as a second admission rule** in this proposal. If the owner wants local verification to be mandatory as well, that must be an explicit policy decision before implementation; a flag or missing value must never be bypassed implicitly.

The guarded update must not call `upsertUser` or any other account-creating helper. It must contain no `INSERT` into `users`, `tenants`, or mapping tables. Its success criterion is exactly one locked eligible candidate and exactly one matched guarded row, not merely a changed-row count; this keeps an already equal WorkOS ID idempotent without treating an ambiguous zero-change result as success. A unique-index collision, concurrent callback, concurrent email change or duplicate, changed tenant state, or concurrent mapping change is an authentication failure, never an invitation to retry the link with a different record.

WorkOS uses the selected organization from the authentication response as its organization context. Package D deliberately relies on Package B’s normalized `organizationId` rather than importing provider roles, permissions, or token claims. An organization-less response is not eligible for this single-tenant application flow. [2] [4]

## Session and authority boundary

After the guarded update succeeds, the callback creates the existing KINGA session through `createSessionToken(existingLocalUser.openId, ...)`. The resulting JWT continues to contain KINGA’s local identifier, application identifier, and name only. Existing request authentication continues to reload the local user and reject an inactive row. WorkOS is therefore a human authentication provider, not KINGA’s session authority or authorization engine.

Package D must not change the existing Manus callback, remove Manus sign-in, alter the normal client login button, or modify the existing local-storage return-path behavior. The WorkOS route remains disabled and unreferenced by clients until a later, separately authorized provider-selection package.

## Test and acceptance plan

All automated tests use only the dedicated disposable `kinga_ci_test` database and its fail-closed runner. They create their own tenant, existing local user, WorkOS organization mapping, and durable transaction rows. No test reads a known account ID, live data, or a populated database.

The implementation must prove the following behavior:

- A valid, test-owned existing user with matching verified email, active tenant, matching organization, and a null mapping links once and receives a standard KINGA session.
- Repeating a consumed callback fails; concurrent callback attempts result in one winner at most.
- Every missing, false, malformed, duplicated, tampered, or provider-error input clears the binding cookie, removes query values from the terminal redirect, and issues no local session.
- Zero, duplicate, inactive, tenantless, unregistered-claimant, ambiguous QA, unmapped-tenant, suspended-tenant, synthetic-tenant, wrong-organization, pre-linked-conflict, and unique-index-collision cases all fail closed.
- A canonical-email mutation or a new duplicate introduced between candidate lookup and the guarded write fails; only one locked eligible matching row may be linked.
- The route never calls `upsertUser`, never inserts a local account, never changes a tenant mapping, and never exposes provider credentials or tokens to the JWT, cookie, response, or logs.
- The existing Manus callback, logout, JWT verification, inactive-user rejection, and normal client login navigation remain unchanged.
- A restart/second-store-instance regression proves that the durable store, rather than process memory, controls one-time transaction consumption. Cleanup tests prove that consumed rows are removed, expired verifier material is cleared or deleted within the approved bound, and a cleanup race cannot revive a transaction.
- Route configuration tests prove that the adapter, transaction, registered-URI fixture, and callback route all use the same canonical `/api/auth/workos/callback` URI rather than the older illustrative OAuth path.

A later staging acceptance step would use only an explicitly created test account and an approved staging WorkOS application. It requires a separately approved redirect URI, feature-flag activation, configuration/secrets, callback smoke test, rollback check, and two-week dual-provider observation. None of those actions are part of this proposal.

## Rollback and stop conditions

The default flag remains false. Before any later staging activation, rollback is simply returning the flag to false; the Manus route remains untouched. No historical `workos_user_id` value is deleted during rollback. A link failure, ambiguity, rate-limit event, durable-store error, configuration mismatch, or provider-error anomaly stops the WorkOS path and leaves the existing Manus flow available.

The following items remain outside Package D: WorkOS account setup; secret or redirect URI configuration; client-provider switching; general user import; automatic tenant/organization provisioning; provider roles/permissions; WorkOS token storage; Manus retirement; production activation; and any live/staging data change other than a separately authorized test account and durable transaction records.

## Implementation authorization requested

If approved, implementation will proceed on an isolated branch with a reviewable migration/store choice, disabled routes, focused test-owned fixtures, independent security review, and a source PR. It will not enable the feature flag, configure WorkOS, alter client navigation, or perform staging/production actions. A separate approval will still be required for every environment configuration and for any later activation.

## Independent proposal review

The first independent review stopped publication because the final guarded write did not restate canonical email uniqueness, the draft treated OAuth `state` and `code` as though they could never appear in a URL, the callback URI was not a testable invariant, and expired PKCE verifier retention was undefined. The corrected proposal now requires a locked exactly-one email recheck, a narrowly permitted and redacted OAuth query boundary, one canonical callback URI across configuration and tests, and bounded transaction cleanup. A final independent review approved the revised proposal. This review does not authorize implementation or any external action.

## References

[1]: https://workos.com/docs/reference/authkit/authentication/get-authorization-url "WorkOS AuthKit: Get authorization URL"
[2]: https://workos.com/docs/reference/authkit/authentication/authenticate-with-code "WorkOS AuthKit: Authenticate with code"
[3]: https://workos.com/docs/authkit/testing "WorkOS AuthKit: Testing"
[4]: https://workos.com/docs/authkit/email-verification "WorkOS AuthKit: Email verification"
[5]: https://www.rfc-editor.org/rfc/rfc7636 "RFC 7636: Proof Key for Code Exchange by OAuth Public Clients"
[6]: https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html "OWASP Unvalidated Redirects and Forwards Cheat Sheet"
