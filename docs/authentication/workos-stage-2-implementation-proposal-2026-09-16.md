# KINGA Stage 2 — WorkOS Human Authentication Implementation Proposal

**Date:** 16 September 2026  
**Status:** Proposal only; not an implementation authorization.  
**Scope:** A future transition of **human** authentication from Manus OAuth to WorkOS AuthKit, while retaining KINGA-issued browser session JWTs and local authorization.  
**Explicitly excluded at this stage:** Code, dependency, WorkOS account, secret, configuration, schema, data, staging, production, deployment, and account/grant changes.

## 1. Approved design baseline

This proposal implements the owner’s six decisions without broadening them.

| Decision | Proposed implementation consequence |
|---|---|
| WorkOS authenticates humans; KINGA retains session authority. | WorkOS is used only at interactive sign-in. KINGA continues to issue and verify its signed `app_session_id` cookie JWT. Existing tRPC context, tenant admission, active-account checks, roles, and report permissions remain locally authoritative. |
| Add `users.workos_user_id`. | Add a nullable, unique `VARCHAR(128)` mapping field. Do **not** rename, overwrite, or repurpose `open_id`. |
| Match existing accounts only by verified email. | The callback may link a WorkOS user only where WorkOS reports a verified email and exactly one eligible local account has the same normalized email. It must fail closed on missing, unverified, ambiguous, inactive, or agency-assisted local accounts. |
| One KINGA tenant maps to one WorkOS organization; a human has one tenant membership. | Add a separate nullable, unique `tenants.workos_organization_id` mapping. Enforce that a linked human’s WorkOS `organization_id` equals the mapped local tenant. Do not infer this mapping from `users.organization_id`, which is a different local integer field. |
| Cron and agency-assisted identities remain KINGA-only. | They bypass the WorkOS client entirely. They require separate service-identity and restricted-intake mechanisms; they cannot enter the human WorkOS callback. |
| Staging-first, dual-read/linking, rollback, tenant-isolation regression. | The feature must be non-destructive, gated, staged, and separately authorized. A provider switch is a configuration decision only after link evidence and regression gates pass. |

> **Key architectural rule:** WorkOS proves an interactive human identity; KINGA decides whether that identity maps to a valid local account and whether it may access a tenant, role, report, or workflow.

## 2. Target login and session flow

The future flow deliberately keeps the local session model rather than adopting WorkOS session tokens as the application’s request authority.

```text
Browser → GET /api/auth/login?returnTo=/safe/path
        → server validates local return path and creates short-lived auth transaction
        → WorkOS AuthKit authorization URL
        → GET /api/auth/callback?code=…&state=…
        → server validates transaction state and exchanges code with WorkOS
        → server verifies WorkOS user + organization against local mappings
        → server signs existing KINGA local session JWT (local openId + local claims)
        → HttpOnly app_session_id cookie
        → Browser returns to validated local path
```

WorkOS’s AuthKit authorization flow returns an authorization code to a registered redirect URI, and its authenticated response includes a WorkOS user and, where selected, an organization identifier. [1] [2] KINGA will use that response only to establish a local session; it will **not** store the WorkOS access or refresh token as the browser’s session authority. WorkOS’s own session model is documented separately, but the approved KINGA architecture keeps its existing local JWT as the request/session authority. [3]

### 2.1 Provider-neutral browser helper

The nine current direct callers of `getLoginUrl()` should converge on one client helper, for example `client/src/_core/authNavigation.ts`:

```ts
export function beginHumanSignIn(returnTo?: string): void {
  window.location.assign(buildKingaAuthStartUrl(returnTo));
}
```

The helper knows only the **KINGA** route `/api/auth/login`; it does not know a Manus portal URL, WorkOS client ID, redirect URI, secret, provider name, or provider state format. The server start route owns the provider redirect and transaction state. The following direct call sites should change only to use this helper:

| Existing caller | Future responsibility |
|---|---|
| `client/src/_core/hooks/useAuth.ts` | Begin sign-in after authenticated-query failure, preserving an internal return path. |
| `client/src/main.tsx` | Redirect unauthorised tRPC failures through the central helper. |
| `client/src/pages/Login.tsx` | Branded, provider-neutral “Sign in” action; remove Manus copy and Manus recovery URL. |
| `client/src/components/DashboardLayout.tsx` | Central helper only. |
| `client/src/components/ImpersonationBanner.tsx` | Central helper only when re-authentication is needed; do not bundle stale logout repair into this migration. |
| `client/src/pages/ClientPortal.tsx` | Central helper with `/client` return path. |
| `client/src/pages/ClientProfile.tsx` | Central helper with `/my-profile` return path. |
| `client/src/pages/InviteAccept.tsx` | Central helper with invitation acceptance return path. |
| `client/src/pages/PortalSelection.tsx` | Central helper with selected portal destination. |

The helper must accept only internal absolute paths. The server repeats this validation, then stores an opaque, random transaction identifier and the validated return path in a short-lived, `HttpOnly`, `SameSite=Lax`, `Secure` (outside localhost) cookie. The callback must require a matching state/transaction. This replaces the current browser-local return-path treatment with server-verifiable CSRF/callback correlation. WorkOS returns the supplied state unchanged to the registered callback URI. [2]

## 3. Schema and migration design

The approved user identity field is necessary but not sufficient to enforce the approved tenant-to-organization model. The proposal therefore contains **two additive nullable mappings**, both non-breaking and reversible by feature flag before any data is linked.

| Table | Proposed column/index | Purpose |
|---|---|---|
| `users` | `workos_user_id VARCHAR(128) NULL`; `UNIQUE KEY uq_users_workos_user_id (workos_user_id)` | Stable WorkOS user mapping. No change to `id`, `open_id`, roles, tenant, or existing business fields. |
| `tenants` | `workos_organization_id VARCHAR(128) NULL`; `UNIQUE KEY uq_tenants_workos_organization_id (workos_organization_id)` | Stable one-to-one WorkOS organization mapping required to enforce the owner’s tenant model. |

### 3.1 Source metadata and migration sequence

The future implementation branch should first update `drizzle/schema.ts` to declare the two nullable columns and named unique indexes. It should then generate a **reviewable, additive migration**. Because the current project’s generic Drizzle generation can stop on an unrelated historical `claim_comments` rename prompt, the migration must be reviewed as an explicit source-derived artifact rather than accepting any interactive rename/create decision.

The planned SQL shape is:

```sql
ALTER TABLE `users`
  ADD COLUMN `workos_user_id` VARCHAR(128) NULL,
  ADD UNIQUE INDEX `uq_users_workos_user_id` (`workos_user_id`);

ALTER TABLE `tenants`
  ADD COLUMN `workos_organization_id` VARCHAR(128) NULL,
  ADD UNIQUE INDEX `uq_tenants_workos_organization_id` (`workos_organization_id`);
```

The eventual staging packet should split this into individually hash-pinned statements and require fresh preflight. It must not use raw Drizzle marker-framed SQL through `mysql < file`, consistent with the established staging execution controls.

### 3.2 Required duplicate-email preflight

No email-identity link may be created until a read-only query against the **authoritative populated account dataset** shows no duplicates among eligible human accounts. The current staging schema is intentionally zero-row, so a clean staging result would not establish production readiness.

The later preflight query should normalize case and surrounding whitespace, exclude null/blank emails, and report both count and affected local IDs. Its logical form is:

```sql
SELECT
  LOWER(TRIM(email)) AS normalized_email,
  COUNT(*) AS local_account_count,
  GROUP_CONCAT(id ORDER BY id) AS local_user_ids,
  GROUP_CONCAT(open_id ORDER BY id) AS local_open_ids
FROM users
WHERE email IS NOT NULL
  AND TRIM(email) <> ''
  AND is_unregistered_claimant = 0
GROUP BY LOWER(TRIM(email))
HAVING COUNT(*) > 1;
```

**Stop condition:** any row returned. The matching rule must not choose a winner. Duplicate accounts require a separately approved account-resolution process before linking. The same later preflight must separately list `email_verified = 0`, `is_active = 0`, tenantless human accounts, and users with `tenant_id` values that do not resolve to a mapped WorkOS organization.

## 4. File-by-file implementation sequence

The work should be divided into reviewable packages. The sequence below avoids changing human login behavior until the non-breaking data model and local adapter tests are proven.

| Package | Files | Exact change | Runtime effect at package completion |
|---|---|---|---|
| A — local schema contract | `drizzle/schema.ts`; reviewed migration; schema tests | Add only `users.workosUserId` and `tenants.workosOrganizationId`, plus named unique indexes. | No provider switch; null fields leave existing login unchanged. |
| B — provider adapter | `package.json`; `server/_core/env.ts`; new `server/_core/workos.ts`; new tests | Add the approved WorkOS Node SDK and server-only `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_REDIRECT_URI`; implement authorization URL and code-exchange adapter. | No route uses adapter until feature-gated later package. |
| C — local auth transaction | New `server/_core/authTransaction.ts`; `server/_core/cookies.ts`; tests | Create/verify short-lived opaque login-transaction state and safe internal return path. | No provider switch; independently testable CSRF/return-path protection. |
| D — callback and local linking | `server/_core/oauth.ts` renamed or replaced by `server/_core/authRoutes.ts`; `server/db.ts`; `server/_core/index.ts`; tests | Add `/api/auth/login` and `/api/auth/callback`; WorkOS code exchange; verified-email lookup; guarded `workos_user_id` link; tenant/org equality check; mint existing KINGA cookie JWT. | Feature flag off by default; Manus path remains untouched until staging acceptance. |
| E — provider-neutral client navigation | New `client/src/_core/authNavigation.ts`; `client/src/const.ts`; nine direct callers listed above; `Login.tsx`; `useAuth.ts`; tests | Replace provider-specific browser redirects and visible Manus copy with KINGA login initiation. Preserve `auth.me` response shape. | Feature flag still selects active provider; UI has no direct provider URL. |
| F — local session separation | `server/_core/sdk.ts`; new `server/_core/kingaSession.ts`; `server/_core/context.ts`; `server/_core/trpc.ts`; tests | Extract local JWT sign/verify from Manus HTTP client. Local `openId` claims, active-account lookup, role/tenant context remain unchanged. | Existing local sessions remain valid through a compatibility window. |
| G — non-human separation | `server/_core/sdk.ts`; heartbeat/scheduled-auth modules; agency-assisted identity guards; tests | Replace Manus `cron_` identity lookup with a distinct KINGA service-token verifier; explicitly reject agency-assisted identities from human WorkOS linking. | Human authentication never authenticates a cron or agency-assisted identity. |
| H — controlled cutover and cleanup | `server/_core/env.ts`; auth route selection; `server/_core/types/manusTypes.ts` only after unused; Login recovery UX; tests/docs | Enable WorkOS only after staging gates pass; retire Manus user-facing route only after rollback window and evidence review. | Controlled provider switch; local sessions remain KINGA-owned. |

### 4.1 Existing files intentionally preserved

`server/routers/auth-core.ts` should preserve the `auth.me` payload and local `auth.logout` contract as far as possible. The client’s 85 `useAuth` consumers should therefore need regression testing, not broad rewrites. `server/_core/context.ts` should continue loading the local row on every request so current local `is_active`, tenant, role, insurer role, and claimant restrictions remain authoritative.

## 5. Human linking and tenant admission rules

The WorkOS callback is permitted to mint a KINGA local session only when every condition below is true.

| Gate | Required condition | Failure behavior |
|---:|---|---|
| 1 | Callback transaction state and return path are valid and unexpired. | No code exchange/session; clear transaction; show safe sign-in failure. |
| 2 | WorkOS code exchange succeeds and returns a human user. | No local session. |
| 3 | WorkOS user has a verified, nonblank email. | No local session; no automatic local account creation. |
| 4 | Exactly one normalized local `users.email` match exists, and that record is active. | No local session; log a non-sensitive correlation ID for support. |
| 5 | Local match is not `is_unregistered_claimant = 1`. | No local session; agency-assisted identity remains restricted. |
| 6 | Local human record has a tenant; tenant has a mapped `workos_organization_id`. | No local session; provisioning/mapping incomplete. |
| 7 | WorkOS response `organization_id` equals that tenant mapping. | No local session; tenant-isolation security event. |
| 8 | Existing `workos_user_id` is null or equals returned WorkOS user ID. | No local session on mismatch; prevent account takeover/relinking. |
| 9 | The guarded update links the WorkOS ID atomically, then local JWT signing succeeds. | Transaction rolls back or no cookie is issued. |

The local callback must **not** auto-create a local user based solely on a WorkOS user. Creating a local KINGA account, assigning its role, assigning its tenant, and establishing agency/claimant restrictions remain explicit application workflows.

WorkOS identifies a user by email and supports external IDs for association with an application’s own local identifier. [4] The future WorkOS import should set each WorkOS user’s `external_id` to the stable local numeric `users.id` as a migration aid, but callback authorization must still enforce the local row and tenant mapping rather than trusting a browser-supplied identifier. WorkOS external IDs are unique per environment and limited to 64 characters. [4]

## 6. Non-human and exceptional identities

| Identity type | Current status | Future design rule |
|---|---|---|
| Scheduled/cron | Current `cron_` branch calls Manus `GetUserInfoWithJwt`. | Replace with a **separate KINGA service-identity token** with issuer, audience, task ID, expiry, and signature distinct from the human cookie JWT. It must be accepted only by scheduled routes; it cannot create browser sessions or resolve through WorkOS. |
| Agency-assisted claimant | Local restricted identity is represented by `is_unregistered_claimant = 1`. | Exclude from email matching and human login; preserve current client and server restrictions until an explicit verified-link flow is separately designed. |
| Super-admin impersonation | KINGA signs a separate short-lived local token with impersonation claims. | Keep as a KINGA-local delegated-session feature. It does not authenticate through WorkOS and must remain subject to audit/expiry tests. |
| Platform super-admin with no tenant | Existing role can be tenantless. | **Decision required before release:** either map platform administrators to a dedicated KINGA platform WorkOS organization, or define an approved org-less human flow backed by a local allow-list. Do not silently bypass the one-tenant/one-org gate. |

## 7. Staging-first rollout and rollback

### 7.1 Proposed rollout gates

| Gate | Required evidence | Stop condition |
|---:|---|---|
| R0 — source review | Code review of Packages A–G; no config or live provider switch. | Any local authorization regression or unreviewed provider coupling. |
| R1 — data-quality preflight | Authoritative populated-source duplicate-email, unverified-email, inactive-user, agency-assisted, tenant, and organization mapping reports. | Any duplicate or ambiguous account; incomplete tenant/org mapping. |
| R2 — staging schema packet | Hash-pinned additive DDL; fresh 188-table staging preflight; rollback record; source/ledger verification. | Any unexpected object, nonzero table state, or privilege/snapshot gap. |
| R3 — WorkOS staging setup | Separate approved account/secrets/redirect-URI setup. Test tenant-to-org mappings only. | Redirect mismatch, wrong WorkOS environment, unavailable rollback path. |
| R4 — dual-read/linking | Feature flag remains **Manus** for normal users. Explicit test users use WorkOS callback; callbacks link only to pre-mapped local rows. | Tenant mismatch, mapping collision, cookie/context inconsistency. |
| R5 — regression suite | Unit, integration, live staging browser, and tenant-isolation proof. | Any role/tenant leakage, session bypass, or special-identity WorkOS call. |
| R6 — controlled switch | Change active human provider only after a new owner authorization and defined observation window. | Any login/session error threshold or security event. |

### 7.2 Rollback design

Rollback is configuration-led because the schema is additive and link records are non-destructive.

1. Set the human auth provider selector back to **Manus**; do not delete `workos_user_id` or tenant organization mappings.
2. Keep existing KINGA session verification unchanged, so sessions already issued by either callback continue to resolve to the same local user during the selected compatibility window.
3. Disable the WorkOS start route from UI navigation while retaining evidence and diagnostic correlation records.
4. Investigate link failures using local IDs and opaque correlation IDs only; never log tokens, codes, cookies, passwords, or provider secrets.
5. Do not remove Manus code, WorkOS fields, or mappings until the owner reviews the observation period and separately authorizes retirement.

The rollback plan preserves the existing local app cookie behavior. It intentionally does not depend on WorkOS refresh tokens. If later policy requires WorkOS-wide logout, that is a separate design decision because it requires retaining the WorkOS session ID (`sid`) or a dedicated local session mapping. WorkOS documents that ending its session requires the session identifier and browser redirect to its logout endpoint. [3] [5]

## 8. Required test matrix

| Test layer | Required test cases |
|---|---|
| Unit | Safe return-path validation; expired/mismatched auth transaction rejection; provider adapter error handling; WorkOS response normalization; no secret/token logging. |
| Local database integration | One verified local email links exactly once; repeated login is idempotent; duplicate email rejects; inactive user rejects; unverified WorkOS email rejects; unregistered claimant rejects; WorkOS ID mismatch rejects. |
| Tenant isolation | Two tenants/two WorkOS organizations: correct pairing mints a session; cross-organization pairing cannot; local role and tenant after `auth.me` remain unchanged. |
| Session | Existing KINGA JWT remains valid; WorkOS-established human session resolves using local `openId`; local logout clears cookie; no human browser session can be minted by cron/service token. |
| Browser | All nine login entry paths route through `/api/auth/login`; callback returns to a safe requested internal route; `useAuth` still populates the same user shape for existing pages. |
| Non-human | Cron routes use only the new service verifier; no WorkOS HTTP call in cron or agency-assisted paths; impersonation expiry/audit behavior remains unchanged. |
| Staging smoke | One mapped user per role class; one tenant-isolation negative case; logout; invitation return path; app start and API health checks. |

## 9. Explicitly deferred follow-ups

These should be durable backlog items, but must not be folded into the WorkOS migration without separate authorization:

| Item | Reason for separate scope |
|---|---|
| `client/src/components/ImpersonationBanner.tsx` stale `/api/oauth/logout` reference | It is a pre-existing route mismatch and its repair affects impersonation/logout semantics. |
| `server/_core/index.ts` `/api/auth-test` diagnostic endpoint | It is a cleanup/hardening item; removal must be tested against any active operational troubleshooting need. |
| Password-hash import | `password_hash` and an unused helper exist, but population/algorithm/data ownership have not been inventoried. WorkOS supports several imported hash types, including bcrypt, but this must be a separately authorized data migration. [6] |
| Platform-super-admin organization policy | Tenantless platform admins need an explicit approved WorkOS organization/access rule. |

## 10. Stage 3 authorization checklist

Do not start code or schema work until the owner explicitly confirms all of the following:

1. Additive `tenants.workos_organization_id` alongside the previously approved `users.workos_user_id`.
2. The platform-super-admin WorkOS organization/access policy.
3. The authoritative populated data source permitted for duplicate-email/read-only mapping preflight.
4. WorkOS staging application, redirect URI, sign-out URI, and secret provisioning authority.
5. The precise compatibility/rollback window in which Manus remains available.
6. Whether initial WorkOS user creation/import is in scope or is deferred until after adapter/linking proof.

## References

[1]: https://workos.com/docs/reference/authkit/authentication/get-authorization-url "WorkOS AuthKit: Get authorization URL"
[2]: https://workos.com/docs/reference/authkit/authentication "WorkOS AuthKit: Authenticate with code"
[3]: https://workos.com/docs/authkit/sessions "WorkOS AuthKit: Sessions"
[4]: https://workos.com/docs/authkit/metadata "WorkOS AuthKit: Metadata and external IDs"
[5]: https://workos.com/docs/reference/authkit/logout "WorkOS AuthKit: Logout"
[6]: https://workos.com/docs/migrate/other-services "WorkOS: Migrate from other services"
