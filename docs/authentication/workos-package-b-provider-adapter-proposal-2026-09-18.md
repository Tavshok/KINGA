# WorkOS Package B: Provider-Adapter Proposal

**Date:** 18 September 2026
**Status:** Proposal only — **not** an implementation, dependency-installation, secret-provisioning, WorkOS-account, schema-application, callback, linking, or provider-switch authorization.
**Predecessor:** Package A merged to GitHub `main` as PR #95 at commit `ab1adcc11b564e131dc1c98bb8f99f7566d6c1e0`.

## 1. Decision requested

Approve or revise a narrowly isolated Package B that introduces a **server-only WorkOS AuthKit adapter** and its unit tests, while leaving every request route, local session, user link, tenant mapping, browser login action, feature flag, and provider selection unchanged.

The exact decision is whether KINGA should add the Node SDK and a tested wrapper now, before Package C’s local transaction/CSRF mechanism and before Package D’s disabled-by-default callback/linking path.

> **Package B has no runtime caller.** Its completion must not generate an authorization URL in production, exchange an authorization code, read or write a local WorkOS mapping, mint a cookie, change Manus OAuth behavior, or contact WorkOS during ordinary application startup.

## 2. Current state and why the scope is now simpler

The full reset left one confirmed owner account in the live `users` table. The new daily aggregate monitor baseline is clean: one user, zero synthetic markers, zero tenant anomalies, and zero absent login methods. The historical 44,885-record duplicate-email and tenant-integrity population blocker therefore no longer describes the current live user population.

This removes the former **population-scale preflight blocker** for future test-account linking. It does **not** authorize automatic linking or remove Package D’s local eligibility gates. Before any callback/linking package is enabled, the owner account, a staging test account, verified-email status, tenant-to-organization mapping, and the platform WorkOS organization must still be explicitly configured and proven in staging.

## 3. Proposed source scope

| File | Proposed change | Explicit non-change |
|---|---|---|
| `package.json` and `pnpm-lock.yaml` | Add a pinned production dependency on `@workos-inc/node`; record the exact reviewed stable version in the PR. | No other dependency upgrades; no WorkOS CLI or generated provider files. |
| `server/_core/env.ts` | Add server-only, optional configuration fields: `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_REDIRECT_URI`. Validate them only when an adapter method is invoked, not at process boot. | No secret value, no client-side `VITE_` variable, no provider selector, and no change to current Manus variables. |
| `server/_core/workos.ts` (new) | Define a minimal interface and factory for WorkOS AuthKit authorization URL generation and authorization-code exchange. | No Express route, cookie operation, user lookup, database helper, logging of code/token, or local JWT minting. |
| `server/_core/workos.test.ts` (new) | Unit-test configuration absence, URL generation request shape, code exchange request shape, opaque response normalization, failures, and secret-redaction behavior. | No live WorkOS call, no external account, no database, and no browser test. |
| `audit/workos-package-b-...` (new) | Record exact dependency version, focused tests, `check:server` result, and changed-file TypeScript comparison against the existing baseline. | No account or secret evidence. |

No client file, schema file, migration file, OAuth route, session helper, user query, tenant query, webhook, database connection, or feature flag belongs in this package.

## 4. Adapter contract

The adapter should make Package D independent of the WorkOS SDK’s concrete response types. A proposed contract is:

```ts
export type WorkOSAuthorizationRequest = {
  redirectUri: string;
  state: string;
  codeChallenge: string;
};

export type WorkOSCodeExchangeRequest = {
  code: string;
  codeVerifier: string;
};

export type WorkOSAuthenticatedIdentity = {
  workosUserId: string;
  email: string | null;
  emailVerified: boolean;
  organizationId: string | null;
};

export interface WorkOSAuthProvider {
  getAuthorizationUrl(input: WorkOSAuthorizationRequest): Promise<string>;
  exchangeCode(input: WorkOSCodeExchangeRequest): Promise<WorkOSAuthenticatedIdentity>;
}
```

Package C will own the transaction state, return path, expiration, nonce, and PKCE verifier. Package B merely accepts opaque inputs. Package D will later decide whether a returned identity may map to a local account; the adapter has no authority to decide that.

The proposed factory receives configuration only at call time:

```ts
export function createWorkOSAuthProvider(config: WorkOSProviderConfig): WorkOSAuthProvider;
```

This avoids a boot-time failure or SDK instantiation when WorkOS is unconfigured, which preserves the present Manus-only runtime.

## 5. AuthKit and PKCE behavior

The recommended official WorkOS Node SDK is `@workos-inc/node`. WorkOS documents the SDK as server-side and supports confidential-client PKCE through `getAuthorizationUrlWithPKCE` and `authenticateWithCode`; it recommends PKCE for defense in depth even when the confidential API key is available.[1]

The future start path should request an AuthKit authorization URL with all three of the following inputs:

1. `provider: "authkit"`;
2. the configured exact `redirectUri`;
3. the Package C opaque state plus PKCE challenge.

The eventual callback will pass the received code with the original verifier to the adapter. The adapter must normalize the response into `WorkOSAuthenticatedIdentity`, including only the provider’s stable user identifier, email, verified-email signal, and organization identifier needed by Package D. It must not return, persist, log, or place access tokens, refresh tokens, authorization codes, PKCE verifier values, or provider session values into a KINGA browser cookie.

## 6. Environment contract

| Variable | Required at process start? | Required by adapter method? | Handling rule |
|---|---:|---:|---|
| `WORKOS_API_KEY` | No | Yes | Server-only. Reject blank or malformed configuration before SDK call. Never log its value. |
| `WORKOS_CLIENT_ID` | No | Yes | Server-only configuration. Reject blank configuration before SDK call. |
| `WORKOS_REDIRECT_URI` | No | Yes | Parse with `URL`; require HTTPS outside explicit local-development test configuration; require no fragment; use exactly as registered in WorkOS. |

A missing or invalid configuration produces a typed `WORKOS_NOT_CONFIGURED` or `WORKOS_INVALID_CONFIGURATION` error from the adapter. It does not silently fall back to a different provider. Package D, not Package B, will decide the user-facing error response.

## 7. Security controls and tests

| Test | Required assertion |
|---|---|
| Missing configuration | The factory or method fails closed before any SDK call; error message contains no credential. |
| Redirect URL validation | Blank, malformed, fragment-bearing, and non-HTTPS non-local URL values reject. |
| Authorization URL | SDK call has AuthKit provider, exact configured redirect URI, supplied opaque state, and PKCE challenge. |
| Code exchange | SDK receives the supplied code, verifier, and client ID; output maps only required identity fields. |
| Provider failure | SDK exception becomes a typed error without provider tokens, codes, or secrets in error text. |
| Response omission | Missing user ID or malformed identity response rejects rather than returning partial identity. |
| Startup isolation | Importing the adapter with no WorkOS environment does not change startup or Manus OAuth behavior. |
| Server integration | `pnpm check:server` passes. |

The package’s TypeScript report will compare changed-path diagnostics with the current inherited baseline rather than declaring a repository-wide clean typecheck. The baseline measured on 18 September contains 1,000 diagnostics across 102 source files; Package B must introduce **zero** diagnostic in its changed paths.

## 8. Boundaries retained for later packages

| Deferred package | Retained decision boundary |
|---|---|
| C — local auth transaction | Owns safe return path, CSRF state, transaction cookie, short expiry, nonce, and PKCE verifier persistence. |
| D — callback and guarded local link | Owns exact local verified-email match, active status, agency-assisted rejection, tenant/org equality, guarded `workos_user_id` update, and KINGA JWT issuance. |
| E — browser navigation | Owns the provider-neutral client helper and the nine `getLoginUrl()` call-site changes. |
| F/G/H | Retain local session extraction, cron/agency separation, staged dual-provider flag, and eventual cutover control. |

The current Manus path remains active and untouched. No WorkOS provider flag exists in Package B.

## 9. Validation and review gates

Before opening the review PR, the implementation branch must provide:

1. exact dependency version and lockfile diff;
2. focused adapter tests passing without a WorkOS account or network call;
3. a passing server bundle;
4. formatter and conflict-marker checks;
5. changed-path TypeScript comparison against the documented 1,000-diagnostic current baseline;
6. independent source/security review; and
7. an evidence document that confirms **no environment value, token, code, email, user identifier, or account configuration was printed or committed**.

Merging an approved Package B source PR would still not authorize WorkOS secret provisioning, WorkOS organization setup, staging redirect registration, schema application, local identity linking, or a user-facing route switch. Those remain discrete gates.

## 10. Approval choices

| Choice | Consequence |
|---|---|
| **Approve Package B as scoped** | Create an isolated branch, install only the pinned WorkOS Node SDK, implement the server-only adapter and tests, and open a review PR. |
| **Approve with revision** | Adjust the package boundary or contract before implementation. |
| **Defer** | Keep Package A inert on `main`; no WorkOS runtime capability is added. |

## References

[1]: [WorkOS Node.js SDK documentation](https://workos.com/docs/sdks/node) — installation, server initialization, confidential-client PKCE, and automatic retry behavior.

[2]: [WorkOS AuthKit authentication reference](https://workos.com/docs/reference/authkit/authentication) — authorization-code based interactive authentication.

[3]: [KINGA Stage 2 implementation proposal](workos-stage-2-implementation-proposal-2026-09-16.md) — approved architecture and package sequence.
