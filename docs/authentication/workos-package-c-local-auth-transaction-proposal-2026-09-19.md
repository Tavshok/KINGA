# WorkOS Package C: Local Authentication Transaction Proposal

**Date:** 19 September 2026
**Status:** **Proposal only.** This document requests approval for a narrow source package. It is not authority to configure WorkOS, create an application or organization, add secrets, register a redirect URI, add an Express login/callback route, link a local user, issue a session, change the active provider, write to staging or production, or change deployment settings.

## Decision requested

Approve **Package C1**, an inert server-side authentication-transaction module and focused tests. It will make the transaction contract needed by a future WorkOS callback explicit without exposing a new route or changing the current Manus login flow.

Package C1 creates and validates a short-lived, single-use WorkOS login transaction. It owns the safe internal return path, opaque CSRF state, browser-binding value, and PKCE verifier/challenge pair. It deliberately has **no runtime caller**. Package D remains responsible for the disabled-by-default start/callback routes, the durable production transaction-store adapter, WorkOS exchange, local identity eligibility, tenant/organization admission, local mapping updates, and KINGA session issuance.

> **Why C1 is separated from the callback.** A process-local map is useful for unit tests but is not safe for a server restart, parallel application instance, or horizontally scaled callback. Package C1 will define the store interface and test it with a local in-memory fake. Package D must provide an explicitly reviewed durable, atomic `consume` implementation before a route can use the transaction contract. No route may fall back to in-memory storage. This implements the one-time, user-agent-bound state expectation in the OAuth guidance. [6] [7]

## Current baseline

Package A has already introduced nullable unique `users.workos_user_id` and `tenants.workos_organization_id` mappings. Package B has already merged a server-only `server/_core/workos.ts` adapter. It accepts an opaque `state`, exact configured redirect URI, and S256 code challenge to create an AuthKit authorization URL; it accepts an authorization code and verifier for exchange. These inputs match the documented AuthKit authorization and code-exchange flow. [1] [2] No existing route constructs the adapter or contacts WorkOS.

KINGA currently uses Manus OAuth at `/api/oauth/callback`. Its browser return-path behavior relies on client-side storage. The future provider-neutral flow must instead retain the intended local destination in server-owned transaction data and treat the callback as an untrusted boundary. KINGA retains local authorization and the local browser-session JWT; Package C does not change either decision.

## Proposed source scope

| File | Proposed change | Explicit non-change |
|---|---|---|
| `server/_core/auth-transaction.ts` | New provider-neutral transaction types, safe return-path validation, cryptographic random-value generation, S256 PKCE derivation, short expiry checks, and a durable-store interface. | No Express route, WorkOS SDK call, database query, local-user lookup, mapping write, token exchange, or local JWT issuance. |
| `server/_core/auth-transaction.test.ts` | Unit tests for safe path handling, entropy-shaped opaque inputs, RFC PKCE vector, expiry, binding mismatch, and one-time consume semantics using a test-local fake store. | No real WorkOS, network, database, browser, or environment secret. |
| `server/_core/cookies.ts` | Add narrowly named options for a short-lived **authentication transaction binding** cookie. It will be `HttpOnly`, `SameSite=Lax`, `Secure` outside localhost, `Path=/`, host-only, and expire with the transaction TTL. | No change to the existing KINGA session-cookie name, duration, or verification behavior. |
| `server/_core/cookies.test.ts` or focused existing cookie test | Assert the transaction-cookie policy under localhost and deployed-host inputs. | No route-composition or deployment test. |
| `audit/workos-package-c-...` | Record the API boundary, tests, server check, changed-path diagnostic comparison, and the proof that the package has no route caller. | No account, redirect, secret, user, tenant, or token values. |

No schema, migration, dependency, client file, provider selector, `server/_core/oauth.ts`, `server/_core/index.ts`, database helper, WorkOS configuration, or deployment file belongs in Package C1.

## Transaction contract

The module should expose a provider-neutral API along these lines. Names may change during implementation, but the security properties may not.

```ts
export type HumanAuthProvider = "workos";

export type PendingHumanAuthTransaction = {
  provider: HumanAuthProvider;
  stateHash: Uint8Array;
  browserBindingHash: Uint8Array;
  codeVerifier: string;
  redirectUri: string;
  returnTo: string;
  createdAt: Date;
  expiresAt: Date;
};

export interface HumanAuthTransactionStore {
  create(transaction: PendingHumanAuthTransaction): Promise<void>;
  consume(input: {
    provider: HumanAuthProvider;
    stateHash: Uint8Array;
    browserBindingHash: Uint8Array;
    now: Date;
  }): Promise<PendingHumanAuthTransaction | null>;
}
```

Creating a transaction returns four browser-facing values only where they are necessary: an opaque `state` for the authorization request, a short-lived opaque binding-cookie value, the safe local `returnTo` only as an eventual server-side result, and the PKCE `codeChallenge` supplied to the existing Package B adapter. The raw PKCE verifier, return path, state hash, binding hash, and expiry remain server-side. The state and browser-binding values are generated independently with cryptographic randomness. The store keeps hashes of the state and binding values rather than their raw forms where practical.

The transaction TTL should be **five minutes**. The value is intentionally much shorter than the one-year KINGA browser session. The module rejects expired, unknown, malformed, provider-mismatched, or binding-mismatched transactions. A successful `consume` operation must be atomic: it returns one still-valid transaction and marks or removes it in the same durable operation. A second callback receives no transaction and cannot continue. OAuth authorization codes and the corresponding transaction state are short-lived, client-bound, and single-use. [6] [7]

The current WorkOS AuthKit adapter accepts a precomputed S256 challenge. Package C1 will therefore generate the verifier with cryptographic randomness and derive `base64url(SHA-256(verifier))` locally. A test must use the RFC 7636 PKCE example vector, not only a self-generated round trip. This is compatible with the documented WorkOS confidential-client PKCE flow and RFC 7636. [3] [5] This preserves the Package B adapter boundary and keeps the verifier out of the browser, URL, local storage, logs, and analytics.

## Return-path and cookie rules

The transaction helper accepts only a local, root-relative return path. It must reject absolute URLs, protocol-relative paths, backslash variants, control characters, malformed percent encoding, and login-loop destinations such as `/login` or `/portal-hub`. The final path is stored server-side and is never reconstructed from a callback query parameter. This avoids the open-redirect class identified in OAuth and redirect-validation guidance. [6] [7] [9]

The binding cookie is not the session cookie and does not authenticate a user. It only binds the browser that began the login flow to the callback transaction. Its attributes are `HttpOnly`, `SameSite=Lax`, `Secure` outside localhost, `Path=/`, and a `Max-Age` aligned with the five-minute TTL. No `Domain` attribute is set. This uses cookie controls as defense in depth rather than as a substitute for state validation. [8] The existing reverse-proxy behavior already supports the session-cookie policy; Package C1 reuses the same localhost determination rather than adding a separate proxy heuristic.

A `__Host-` prefix is attractive only when all deployment domains and cookie names can meet its strict requirements. Package C1 will not claim that prefix until a future routing review confirms it is valid across the registered production host. The non-negotiable controls are host-only scope, Secure outside localhost, `HttpOnly`, `SameSite=Lax`, expiry, opaque random values, and server-side atomic consumption.

## Callback contract reserved for Package D

Package C1 intentionally does **not** add the following behavior. These are Package D gates, and they remain disabled until separately approved.

1. A future `/api/auth/login` route will create the durable transaction, set the binding cookie, construct the WorkOS URL through Package B, and redirect the browser. It must accept a WorkOS error callback as well as a code callback.
2. A future callback will require both the query-state value and the matching binding cookie, atomically consume the transaction before code exchange, clear the binding cookie on every terminal result, and never redirect to an unvalidated destination.
3. The callback will then apply the approved local gates: verified WorkOS email, exactly one eligible active local human account, non-agency-assisted identity, tenant presence, tenant-to-organization match, and non-conflicting `workos_user_id` link.
4. Only after every local gate passes may the future code issue the existing KINGA session cookie. It will not store provider access tokens, refresh tokens, codes, PKCE verifiers, or provider session material in that cookie.

The current AuthKit adapter does not expose an ID-token validation surface. Package C1 therefore does not label an unused random value a security nonce. If a later WorkOS response or provider choice introduces an ID token, that later package must extend the adapter and add explicit issuer, audience, signature, expiry, and nonce validation before treating the token as identity evidence.

## Required tests and stop conditions

| Test | Required result |
|---|---|
| Return path | Accept ordinary internal paths. Reject absolute, protocol-relative, malformed, backslash, encoded-control, and login-loop values. |
| PKCE | Generate a high-entropy verifier and match the RFC 7636 S256 known vector exactly. |
| State and binding | Generate independent opaque values; raw values do not appear in errors or loggable objects. |
| Expiry | A transaction at or beyond five minutes cannot be consumed. |
| Binding | A mismatched or missing binding cannot consume a pending state. |
| Single use | One valid atomic consume succeeds; an immediate second consume fails. |
| Store boundary | The in-memory fake is test-only. Package C1 exposes no production default store and no route imports it. |
| Cookie options | Localhost and deployed inputs have the intended secure, HTTP-only, Lax, host-only, short-lived policy. |
| Regression | Existing Manus callback and session tests remain unchanged and passing. |

Implementation must stop and report rather than improvise if it requires a schema table, Redis, secret, route registration, provider configuration, or changes to the Manus OAuth path. Those are outside this package.

## Review and validation gate

Before a Package C1 implementation PR is opened, the branch must provide focused tests against the local disposable `kinga_ci_test` target, `pnpm check:server`, formatter and conflict-marker checks, `git diff --check`, a changed-path TypeScript comparison against the inherited baseline, and an independent security review. The evidence must demonstrate that no network call, WorkOS configuration read, route registration, cookie issuance in production, user/tenant query, local link, session mint, staging action, or live database access occurred.

## Approval choices

| Choice | Consequence |
|---|---|
| **Approve Package C1 as scoped** | Implement only the inert transaction contract, cookie-options helper, unit tests, and evidence in an isolated branch. |
| **Approve with revision** | Adjust TTL, cookie naming, durable-store interface, or package boundary before code starts. |
| **Broaden to Package D** | Requires a new proposal and separate authority for durable storage, callback/start routes, configured WorkOS staging environment, local identity gates, and session behavior. |
| **Defer** | Leave Packages A and B inert on `main`; no new authentication-transaction source code is added. |

## References

[1]: https://workos.com/docs/reference/authkit/authentication/get-authorization-url "WorkOS AuthKit: Get authorization URL"

[2]: https://workos.com/docs/reference/authkit/authentication "WorkOS AuthKit: Authenticate with code"

[3]: https://workos.com/docs/sdks/node "WorkOS Node SDK"

[4]: https://workos.com/docs/authkit/testing "WorkOS AuthKit testing guidance"

[5]: https://www.rfc-editor.org/rfc/rfc7636 "RFC 7636: Proof Key for Code Exchange by OAuth Public Clients"

[6]: https://www.rfc-editor.org/rfc/rfc6749 "RFC 6749: The OAuth 2.0 Authorization Framework"

[7]: https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html "OWASP OAuth 2.0 Cheat Sheet"

[8]: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html "OWASP Session Management Cheat Sheet"

[9]: https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html "OWASP Unvalidated Redirects and Forwards Cheat Sheet"
