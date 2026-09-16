# KINGA Stage 1 — Authentication Discovery

**Date:** 16 September 2026  
**Scope:** Read-only source and configuration discovery.  
**Excluded:** Code changes, dependency installation, WorkOS account setup, configuration changes, database/schema changes, staging access, and production access.

## Executive conclusion

KINGA currently uses **Manus OAuth as the interactive identity provider** and a **KINGA-issued, HS256-signed application session JWT** as the browser session. Manus is involved at the start of sign-in (portal redirect, code exchange, and user-information lookup) and in one scheduled-task identity branch. Ordinary authenticated requests do not call Manus: they verify the KINGA session cookie locally, then load the user record by `users.open_id` and apply active-account checks.

The migration is therefore **substantial but bounded**. It is not a simple environment-variable swap. The provider-facing login/callback/session implementation is concentrated in roughly **10 core server/client files**, but the resolved session user feeds **85 frontend source files** through `useAuth()`. In addition, there are special session issuers for super-admin impersonation and scheduled tasks that must be explicitly designed into any replacement.

The D-01 `users` table has a sound local-account foundation for WorkOS, but it does **not** contain a dedicated WorkOS user identifier. A future WorkOS cutover should add a nullable, unique `workos_user_id` (or equivalent provider-identity mapping table) rather than repurposing `open_id`. This is important because `open_id` is presently the app-wide local identity key and is also used by non-Manus identities, including agency-assisted identities and cron identities.

> **Stage 1 result:** No application, dependency, account, configuration, database, staging, or production change was made. This document is an investigation result, not an implementation plan or authorization to migrate.

## 1. Current authentication flow

| Step | Current behavior | Primary evidence |
|---:|---|---|
| 1 | A protected page without an authenticated user redirects the browser to `/login?returnPath=…`. Global tRPC `UNAUTHORIZED` responses can also redirect directly to the login URL. | `client/src/components/ProtectedRoute.tsx:61–68`; `client/src/main.tsx:19–34` |
| 2 | `getLoginUrl()` reads `VITE_OAUTH_PORTAL_URL` and `VITE_APP_ID`, computes `${window.location.origin}/api/oauth/callback`, stores an optional safe return path in local storage, and redirects to Manus `/app-auth?type=signIn`. Its state is a base64-encoded redirect URI. | `client/src/const.ts:19–42` |
| 3 | The Manus portal redirects to `GET /api/oauth/callback` with `code` and `state`. This endpoint is mounted under `/api/oauth` and has a dedicated 10-request-per-15-minute rate limiter. | `server/_core/index.ts:125–145`; `server/_core/oauth.ts:51–59` |
| 4 | The callback exchanges the code at Manus `ExchangeToken`, uses the returned access token at Manus `GetUserInfo`, and requires `userInfo.openId`. | `server/_core/sdk.ts:74–125`; `server/_core/oauth.ts:61–71` |
| 5 | The callback upserts a local user by unique `users.open_id`, updating only `name`, `email`, `login_method`, and `last_signed_in` on a pre-existing identity. It preserves application roles and tenant assignment. | `server/_core/oauth.ts:73–80`; `server/db.ts:228–280`; `drizzle/schema.ts:3715–3775` |
| 6 | KINGA creates its own one-year HS256 JWT containing `openId`, `appId`, and display name. It stores that JWT in the `app_session_id` cookie, then redirects to `/`; the client restores any saved return path after `auth.me` succeeds. | `server/_core/sdk.ts:216–304`; `server/_core/oauth.ts:99–115`; `client/src/pages/Login.tsx:66–81` |
| 7 | Each normal request locally verifies the cookie JWT using `JWT_SECRET`, looks up the DB user by `open_id`, rejects missing/deactivated users, updates `last_signed_in`, and places the full DB user in tRPC context. | `server/_core/sdk.ts:330–378`; `server/_core/context.ts:17–74`; `server/_core/trpc.ts:16–46` |
| 8 | `auth.me` returns that local user plus server-derived role route, permission flags, and report-access count. `auth.logout` clears the cookie; it does not call Manus. | `server/routers/auth-core.ts:17–89`; `client/src/_core/hooks/useAuth.ts:38–77` |

The cookie is `HttpOnly`, `SameSite=Lax`, root-path scoped, and marked `Secure` outside localhost. The current comments explicitly choose Lax so the top-level Manus OAuth callback can set the cookie without a login loop. `tenant_id` is intentionally not embedded in the JWT; it is loaded fresh from the database on each request. This is a good local authorization property that a WorkOS implementation should preserve.

## 2. Direct Manus OAuth and identity touchpoints

### Provider-facing core

| File | Current responsibility | Manus-specific coupling |
|---|---|---|
| `client/src/const.ts` | Builds the sign-in redirect URL. | `VITE_OAUTH_PORTAL_URL`, `VITE_APP_ID`, Manus `/app-auth`, Manus-required state shape. |
| `client/src/pages/Login.tsx` | Sign-in screen, post-login return routing, password recovery link. | Visible “Sign In with Manus” copy and direct Manus `forgotPassword` portal URL. |
| `server/_core/env.ts` | Supplies runtime auth configuration. | `OAUTH_SERVER_URL`, `VITE_APP_ID`, `OWNER_OPEN_ID`. |
| `server/_core/sdk.ts` | Manus HTTP client, code exchange, user-info lookup, session signing/verification, scheduled-task identity branch. | Three Manus RPC paths, Manus response shape, `openId` session claim, `GetUserInfoWithJwt` for cron identities. |
| `server/_core/oauth.ts` | Interactive OAuth callback. | Manus code exchange/user lookup and Manus-derived `openId` provisioning. |
| `server/_core/index.ts` | Mounts/rate-limits callback and exposes a temporary auth diagnostic. | `/api/oauth/callback`, `/api/auth-test`, local verification visibility. |
| `server/_core/types/manusTypes.ts` | Generated Manus service contracts. | `ExchangeToken`, `GetUserInfo`, and `GetUserInfoWithJwt` shapes. |

`OAUTH_SERVER_URL` itself is consumed only by `server/_core/env.ts` and the Axios client in `server/_core/sdk.ts`. The actual external calls are `ExchangeToken`, `GetUserInfo`, and—only for `cron_` identities—`GetUserInfoWithJwt`.

### Session and application identity layer

| File or group | Responsibility | Migration relevance |
|---|---|---|
| `server/_core/cookies.ts` | Defines browser cookie attributes. | Preserve security/cross-site callback behavior, but revalidate against the chosen WorkOS session pattern. |
| `server/_core/context.ts` and `server/_core/trpc.ts` | Resolve session to local user and enforce `protectedProcedure`. | Core adapter seam: provider token validation can change while local user/role/tenant admission remains stable. |
| `server/db.ts` | `upsertUser`, `getUserByOpenId`, `updateUserLastSignedIn`. | Must become provider-neutral or support temporary dual identity lookup. |
| `server/routers/auth-core.ts` | `auth.me` and logout; returns role-derived profile. | UI contract should remain stable; logout semantics must be redesigned for WorkOS. |
| `client/src/_core/hooks/useAuth.ts` | Calls `auth.me`, triggers logout, local-caches user under `manus-runtime-user-info`, has development role override. | Used by 85 frontend source files; cache key and dev override require deliberate treatment. |
| `client/src/components/ProtectedRoute.tsx` | Redirects unauthenticated users and gates role/domain access. | Should remain local-role/tenant authority, but the login redirect target changes. |

There are **nine direct browser call sites** for `getLoginUrl()`—the auth hook, main unauthorised handler, login page, dashboard layout, impersonation banner, client portal, client profile, invitation acceptance, and portal selection. They should be routed through one provider-neutral login helper in a future change rather than individually rewritten.

## 3. Local user and session model

The canonical local account record is `users`, migrated in D-01. It is the current authority for KINGA roles, tenants, activity, activation, and business profile—not Manus.

| Current field | Present use | WorkOS readiness |
|---|---|---|
| `id` | Local relational primary key. | Keep unchanged; suitable as the application-local identity anchor. |
| `open_id` (unique, required, 64 chars) | Manus subject key; joins the local account to the session JWT; used by agency-assisted and cron identities too. | **Do not repurpose.** Retain during coexistence and migration; it is not exclusively a Manus-user column. |
| `name`, `email`, `email_verified` | Callback-provisioned profile/verification data. | Map naturally to WorkOS user profile values. WorkOS treats email as the unique user identity and can expose verification state. [1] [2] |
| `password_hash` | Column exists; helper supports bcrypt, but no active custom-auth route imports the helper. | Potentially importable only after a data/governance decision. WorkOS documents password-hash migration support, including bcrypt. [3] |
| `login_method` | Records Manus platform/provider normalization such as Google/email. | Keep as historical/login analytics data; it is not a stable WorkOS user ID or provider-neutral authority key. |
| `role`, `insurer_role`, `secondary_roles`, `default_role` | KINGA authorization and routing. | Keep local. WorkOS organization membership conveys membership, but application-specific granular roles may remain in the application database. [1] |
| `tenant_id`, `organization_id` | Current local business scoping. | Do not assume they map one-to-one to WorkOS organizations. `organization_id` is numeric; WorkOS org IDs are external strings and a WorkOS user can have multiple memberships. [1] |
| `is_active`, `deactivated_at` | Local entitlement and revocation gate. | Preserve as a separate KINGA authorization gate even if WorkOS controls upstream session lifecycle. |
| `last_signed_in`, timestamps | Local activity/audit metadata. | Can remain local; optional provider timestamps can be reconciled later. |

### Schema conclusion

The existing table is **sufficient to preserve the local account and authorization model**, but it is **not sufficient for a clean WorkOS cutover without at least one identity-mapping addition**.

The minimum future schema choice should be one of the following, subject to a separate design and migration authorization:

| Option | Suggested shape | Assessment |
|---|---|---|
| Add a direct provider ID | Nullable, unique `workos_user_id` on `users` (use a conservative string length such as 128). | Simplest controlled dual-run mapping; recommended for the first migration design. |
| Add a provider-identity table | `user_id`, `provider`, `provider_subject`, timestamps, unique `(provider, provider_subject)`. | More extensible where Manus, WorkOS, agency-assisted, and future providers must coexist explicitly. |

The first option is lower-scope; the second is more durable if KINGA expects multiple identity sources. Neither should be implemented until a later stage establishes migration policy, data matching rules, and rollback controls.

WorkOS supports an `external_id` so an application can associate a WorkOS user with its own identifier; WorkOS states that external IDs are unique within the environment and limited to 64 characters. The local numeric `users.id` is the safest candidate for that migration-only association, rather than the overloaded `open_id`. [2]

## 4. Coupling, scope, and surprises

| Finding | Impact on a future WorkOS change |
|---|---|
| Local session JWT is KINGA-signed, not a persisted Manus token. | Provider replacement can be isolated to code exchange/token validation/session issuance; existing tRPC role and tenant authorization can remain largely intact if its local user contract is preserved. |
| `users.open_id` is a critical, overloaded application identity. | A direct rename or replacement would be high risk because it affects regular users, agency-assisted identities, scheduled tasks, audit records, tests, and authorization lookups. |
| 85 frontend source files use `useAuth()`. | The surface is broad, but most consumers use the resolved local user, not OAuth APIs. Holding `auth.me` response shape stable contains the UI migration blast radius. |
| Custom password/auth utilities exist but have no active imports outside their helper module. | There is dormant capability, not an active alternative login flow. Do not assume `password_hash` is populated or ready for provider import without a later data inventory. |
| Scheduled tasks use a `cron_` prefix and call Manus `GetUserInfoWithJwt`. | This is a separate machine-identity design problem, not merely an interactive-login migration. It needs a dedicated future decision. |
| Super-admin impersonation signs the same cookie JWT; one client page writes it directly. | WorkOS replacement must preserve or redesign controlled impersonation. The disabled marketplace impersonation flow is not active, but the dedicated `impersonation` router is active. |
| `ImpersonationBanner` targets `/api/oauth/logout`, but no server route for that target was found; the normal logout is `trpc.auth.logout`. | This is a pre-existing stale-path finding discovered during inventory. It is outside Stage 1 and should not be folded into an auth-provider migration without separate scope. |
| `/api/auth-test` exposes diagnostic cookie/session/user state and is commented as removable after a login-loop issue. | Treat it as a separate hardening/review item during a future auth implementation; Stage 1 made no change. |
| No WorkOS package or WorkOS source reference exists. | Future implementation will require an approved dependency and secrets/configuration stage; no such setup was performed. |

## 5. Estimated future implementation scope

This is a **medium-to-large security-sensitive migration**, not a one-file provider swap.

| Work area | Approximate scope | Why it matters |
|---|---:|---|
| Provider adapter and configuration | 4–6 core files | Replace Manus portal URL, code exchange, user lookup, and provider-specific types/configuration. |
| Callback/session lifecycle | 4–7 files | Replace callback semantics, session issuance/verification, logout, cookies, test helpers, and diagnostic behavior. |
| Local user linking | 3–6 files plus migration | Introduce WorkOS identity mapping, decide first-login/linking policy, preserve deletion/deactivation semantics, and protect non-human identities. |
| Browser auth UX | 9 direct login helper call sites plus Login UX | Replace Manus copy, password recovery, return-path behavior, and unauthorized redirects behind a single helper. |
| Auth consumers | 85 `useAuth` consumers | Mostly regression/compatibility scope if `auth.me` stays stable, rather than 85 direct rewrites. |
| Special identities | At least 3 paths | Scheduled cron identities, super-admin impersonation, and agency-assisted identities require explicit non-human/delegated-session design. |

## 6. Recommended Stage 2 decision gates

Before authorizing implementation, resolve these design decisions explicitly:

1. **Authority model:** Will WorkOS authenticate interactive humans only while KINGA continues issuing its own cookie JWT, or will WorkOS sessions/tokens become the request-session authority?
2. **Identity mapping:** Approve a direct `workos_user_id` column versus a general provider-identity table; do not repurpose `open_id`.
3. **Matching rule:** Decide whether local accounts link to WorkOS by imported `users.id` external ID, verified email, a staged admin mapping, or a combination. Do not infer a match merely from display name.
4. **Tenant/organization model:** Decide whether a KINGA tenant maps to a WorkOS organization and whether KINGA will continue to enforce single-tenant membership. This is a product and authorization decision, not an implementation detail.
5. **Non-human identities:** Define separate mechanisms for cron, agency-assisted, and impersonated identities; do not send them through ordinary WorkOS human login.
6. **Cutover and rollback:** Require a staging-first dual-read/linking plan, revocation test, logout test, tenant-isolation regression, and explicit rollback path before any production discussion.

## References

[1]: https://workos.com/docs/authkit/users-organizations "WorkOS AuthKit: Users and Organizations"
[2]: https://workos.com/docs/authkit/metadata "WorkOS AuthKit: Metadata and External IDs"
[3]: https://workos.com/docs/migrate/other-services "WorkOS: Migrate from other services"
