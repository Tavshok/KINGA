# WorkOS Package C1 Local Authentication Transaction Implementation

**Date:** 19 September 2026
**Status:** **Source review package.** This record covers only the approved inert Package C1 source change. It contains no route registration, WorkOS configuration or account action, provider code exchange, user or tenant lookup, mapping write, session issuance, client navigation change, schema/data change, staging/production action, or deployment.

## Result

Package C1 adds a server-owned local authentication-transaction contract. The contract produces independent opaque state and browser-binding values, derives an S256 Proof Key for Code Exchange (PKCE) challenge, validates a safe local return path, and delegates persistence to an injected store. It provides no production store and no route caller. A later Package D must provide a separately reviewed durable store with atomic single-use consumption before any callback may use this contract. [1] [2]

The implementation also adds cookie **options** for the future transaction-binding cookie. No Package C1 code sets, clears, reads, or names a browser cookie. The options are host-only, `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` outside localhost, with a five-minute lifetime. This is an additional browser-binding control; it does not replace server-side state validation. [3]

## Source changes

| File                                      | Change                                                                                                                                                                                                | Runtime effect                                                                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `server/_core/auth-transaction-policy.ts` | Defines one shared five-minute transaction time-to-live constant.                                                                                                                                     | No route or provider behavior.                                                                                                |
| `server/_core/auth-transaction.ts`        | Adds provider-neutral transaction types, opaque-value hashing, constant-time hash comparison, S256 PKCE derivation, fixed-point return-path canonicalization, expiry checks, and the store interface. | No default store, route, provider construction, network request, database access, user lookup, mapping, or session operation. |
| `server/_core/cookies.ts`                 | Adds `getAuthTransactionCookieOptions`.                                                                                                                                                               | Defines options only; existing session-cookie options remain unchanged.                                                       |
| `server/_core/auth-transaction.test.ts`   | Adds local tests for the contract and no-route boundary.                                                                                                                                              | Test-only in-memory fake models compare-and-delete behavior.                                                                  |
| `server/_core/cookies.test.ts`            | Adds local and deployed-host cookie-policy tests.                                                                                                                                                     | No browser or live-route execution.                                                                                           |

The return-path validator accepts normal root-relative KINGA paths and rejects empty, relative, absolute, protocol-relative, backslash, control-character, malformed, nested-encoded, traversal, and known login-loop paths. It decodes to a terminating fixed point before parsing and returns that one canonical local representation. It never accepts an origin from the browser. [2] [4]

The PKCE helper accepts only RFC 7636 verifier characters and length, then derives the `base64url(SHA-256(verifier))` S256 challenge. Its regression uses the RFC’s published known vector. The verifier stays only in the store record; the state and binding values are stored as hashes. [1]

## Independent review remediation

The first independent review blocked the package because a three-pass decode heuristic accepted four-or-more nested encodings, encoded loop destinations, and some traversal forms. It also found that arbitrary callback state and binding strings could reach hashing and the store boundary. No review PR was opened while those gaps existed.

The corrected contract decodes until a bounded input reaches a fixed point, rejects every resulting protocol-relative, ASCII or Unicode control-character, backslash, or traversal representation, and uses the canonical path for both loop checks and return. Loop checks strip path trailing slashes before comparison because the current client router accepts those aliases. It validates callback state and browser-binding values against the exact 43-character base64url grammar generated from 32 random bytes before hashing or calling the store. New regressions cover deep nested slash, traversal, NUL and Unicode C1-control payloads, encoded and trailing-slash `/login` and `/portal-hub` aliases, encoded local-path canonicalization, invalid PKCE verifiers, and an oversized state rejected before store access.

## Explicit boundaries retained

The following behavior remains prohibited and absent from this branch:

- No `server/_core/index.ts`, `server/_core/oauth.ts`, or `server/routers.ts` import or register the transaction module.
- No WorkOS adapter construction, configuration read, SDK call, authorization URL, code exchange, token handling, or redirect occurs.
- No database-backed, Redis-backed, or in-memory production store exists. The in-memory implementation is private to the test file.
- No user matching, verified-email check, tenant/organization check, `workos_user_id` link, local JWT mint, or current Manus OAuth change occurs.
- No schema, migration, deployment, environment, secret, browser UI, staging, production, or live database action occurs.

## Validation

| Check                              | Result                                                                                                                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused guarded tests              | Passed: 3 files and 74 tests (`auth-transaction`, cookie policy, existing WorkOS adapter).                                                                                                            |
| Isolated database policy           | The focused command used `pnpm test`, which routes through the fail-closed isolated Vitest runner. These tests do not open a database connection.                                                     |
| Route/provider boundary search     | Passed: no `auth-transaction` reference in `server/_core/index.ts`, `server/_core/oauth.ts`, or `server/routers.ts`. The only non-test import is the route-safe policy constant used by `cookies.ts`. |
| Server bundle                      | Passed: `pnpm check:server`.                                                                                                                                                                          |
| Changed-path TypeScript comparison | Passed: global `pnpm check` retains inherited diagnostics, but no diagnostic references the changed Package C paths.                                                                                  |
| Formatting and whitespace          | Passed: Prettier check and `git diff --check`.                                                                                                                                                        |

## Package D gate

Before any WorkOS start or callback route is proposed, Package D must separately define and review: a durable transaction store; atomic conditional consume/delete semantics that survive restarts and multiple instances; route and callback error handling; WorkOS staging configuration; the local human identity and tenant/organization eligibility gates; conflict-safe mapping updates; and issuance of the existing KINGA local session only after those gates pass. The Package C1 test fake is not a candidate production implementation.

## References

[1]: https://www.rfc-editor.org/rfc/rfc7636 "RFC 7636: Proof Key for Code Exchange by OAuth Public Clients"
[2]: https://www.rfc-editor.org/rfc/rfc6749 "RFC 6749: The OAuth 2.0 Authorization Framework"
[3]: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html "OWASP Session Management Cheat Sheet"
[4]: https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html "OWASP Unvalidated Redirects and Forwards Cheat Sheet"
