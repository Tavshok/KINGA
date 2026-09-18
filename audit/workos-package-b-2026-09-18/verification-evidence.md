# WorkOS Package B — Provider Adapter: Verification Evidence

**Branch:** `feat/workos-package-b-provider-adapter`
**Base commit:** `ab1adcc11b564e131dc1c98bb8f99f7566d6c1e0` (GitHub `main`)
**Status:** Source-review package only. No WorkOS account, secret, redirect registration, route, callback, local identity link, database operation, provider flag, session operation, or deployment was performed.

## Scope delivered

| Path                              | Change                                                                              | Boundary preserved                                                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `package.json` / `pnpm-lock.yaml` | Adds only `@workos-inc/node` pinned at **10.13.0**.                                 | No unrelated package upgrade or WorkOS CLI. The locked package requires Node `>=22.11.0`; KINGA’s Node 22 runtime meets that requirement.  |
| `server/_core/workos.ts`          | New server-only opaque AuthKit adapter and explicit call-time environment resolver. | No route, callback, request handler, session cookie/JWT, database read/write, local user/tenant decision, feature flag, or startup caller. |
| `server/_core/workos.test.ts`     | Fake-client unit coverage.                                                          | No live WorkOS request, external account, browser, or database.                                                                            |

The initial design considered adding WorkOS values to the global `ENV` object. Independent review correctly rejected that because `ENV` is built during server startup. The final package instead exposes `getWorkOSProviderConfig(environment = process.env)` inside the inert adapter module. No application startup path invokes it.

## Adapter contract

The adapter isolates SDK concrete types behind two future-facing methods:

```ts
getAuthorizationUrl({ redirectUri, state, codeChallenge }): Promise<string>
exchangeCode({ code, codeVerifier }): Promise<{
  workosUserId;
  email;
  emailVerified;
  organizationId;
}>
```

It uses WorkOS AuthKit with `provider: "authkit"` and `codeChallengeMethod: "S256"`. The caller supplies opaque state and PKCE material; Package B neither generates nor persists either. Provider access tokens, refresh tokens, authorization codes, code verifiers, and API keys never leave the adapter.

## Security controls proven

| Control                 | Result                                                                                                                                                                                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing configuration   | Fails before injected SDK construction with typed `WORKOS_NOT_CONFIGURED`.                                                                                                                                                                                                                         |
| Startup isolation       | No global WorkOS environment reads, SDK construction, route registration, or caller outside the adapter test.                                                                                                                                                                                      |
| Redirect URI            | Exact configured callback only; HTTPS required by default. Credentials, query strings, fragments, malformed URLs, and altered request callback URLs reject. HTTP loopback is permitted only with an explicit `allowInsecureLocalhostRedirect: true` factory option; production default rejects it. |
| Opaque request boundary | Null, primitives, arrays, incomplete objects, and non-string `redirectUri`, state, challenge, code, or verifier values reject as `WORKOS_INVALID_REQUEST` before the fake client is called.                                                                                                        |
| Provider identity       | Incomplete provider responses reject as `WORKOS_INVALID_RESPONSE`; only ID, email, verification flag, and optional organization ID are returned.                                                                                                                                                   |
| Error redaction         | Provider exception text containing a synthetic API key, authorization code, and verifier is replaced by a fixed safe `WORKOS_PROVIDER_REQUEST_FAILED` error.                                                                                                                                       |
| Scope scan              | No production import/caller of `createWorkOSAuthProvider` or `getWorkOSProviderConfig`; no WorkOS reference in `server/_core/index.ts` or `server/_core/env.ts`.                                                                                                                                   |

## Validation results

| Validation                          | Result                                                                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Focused WorkOS unit tests           | **31/31 passed** (`server/_core/workos.test.ts`).                                                                                        |
| Existing deleted-user re-sync guard | **4/4 passed** (`server/auth.resync.test.ts`).                                                                                           |
| Server bundle                       | Passed: `pnpm check:server`.                                                                                                             |
| Formatter                           | Passed: Prettier check for Package B files.                                                                                              |
| Diff hygiene                        | Passed: `git diff --check`.                                                                                                              |
| Changed-path TypeScript diagnostics | **0**.                                                                                                                                   |
| Exact base TypeScript baseline      | `pnpm check` exits 2 with **998** inherited diagnostics; the package branch yields the same 998 diagnostics and none in Package B paths. |

## Independent review

An independent application-security review initially raised two required issues: HTTP loopback acceptance without an explicit trusted local-only option, and untyped malformed runtime inputs. The implementation was corrected and the second review approved the final package. The final reviewer reconfirmed no startup SDK/config construction, route/callback, persistence, linking, session issuance, provider flag, logging, or provider-token leakage.

## Full-suite CI dry-run finding

The approved CI dry run was executed against current `main` before any CI workflow source was created:

| Command                          | Result                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile` | Passed.                                                                                                      |
| `pnpm run check:conflicts`       | Passed.                                                                                                      |
| `pnpm test`                      | **Failed**: 63 failed files, 489 passed files, 2 skipped; 112 failed tests, 9,082 passed tests, 181 skipped. |

The failures are not silently downgraded. Major clusters include role-assignment audit assertions (19 failures), WhatsApp signature boundary tests (15), approval tracking (14), reporting cross-surface assertions (10 files), analytics/router tests, maintenance/probe tests, and a current `auth.logout` same-site expectation mismatch. The proposed CI workflow and branch-protection package remain **unimplemented** pending an owner decision on this real full-suite failure state.

## Explicit non-actions

- No real `WORKOS_*` value was inspected, requested, stored, passed to the SDK, logged, or committed.
- No WorkOS app, organization, user, redirect URI, callback, secret, account, or API interaction was created.
- No active login behavior changed; the existing Manus OAuth route is unmodified.
- No local user link, tenant organization map, session cookie/JWT, provider-selection flag, schema/database operation, staging/production change, or deployment occurred.

## Review gate

The branch is ready for review. An approved merge would add only inert adapter capability; it would not authorize environment setup, callback work, identity linking, session issuance, Package C, Package D, or a provider switch.
