# WorkOS Package G1 Source-Only Implementation Record

**Date:** 20 September 2026
**Status:** Implemented in source; **not activated**
**Scope:** KINGA-owned non-human credentials and execution-safety foundations for the candidate intake-escalation and stuck-recovery jobs only

## Decision and cryptographic fallback

The approved G1 policy preferred **Argon2id**, with a documented Node `crypto.scrypt` fallback only if Argon2 could not be adopted in the supported build runtime. That prerequisite was met before this implementation: installing `argon2@0.45.1` and running an Argon2id hash probe on **Node v22.13.0, Ubuntu 24.04, x86_64** caused the process to exit with **SIGSEGV / status 139**. The probe package changes were removed. This change does **not** add or retain an `argon2` dependency.

G1 therefore names its verifier explicitly as **`scrypt-v1`**, using Node's built-in `crypto.scrypt` with `N=131072`, `r=8`, `p=1`, a 32-byte derived key, a salt of at least 16 random bytes, and `maxmem=268435456` bytes (256 MiB). Stored and derived digests are compared using `crypto.timingSafeEqual`. The version name is part of the persisted contract so a later reviewed verifier can coexist during rotation rather than silently changing the meaning of existing hashes.

No real bearer was issued, stored, logged, or added to configuration. Tests generate random secrets and salts in memory, derive temporary hashes, and discard them.

## Source delivered

Migration `0062_workos_package_g1_service_scheduler_foundation.sql`, journaled after `0061`, adds four KINGA-only tables: `service_credentials`, `service_credential_audit`, `scheduled_job_executions`, and `scheduled_job_effects`. Every persisted G1 timestamp uses **millisecond precision**. The credential table stores an opaque ID, non-secret prefix, environment, principal label, exact capability, versioned verifier, lifecycle bounds, rotation links, and approval reference. A stored generated key enforces at most one active, unrevoked credential for an environment and capability. The execution table enforces one row per job/window, unique execution IDs, monotonic generations, millisecond-precision lease expiry, and terminal outcomes. The effect table has both a deterministic primary key and a unique job/window key.

The schema deliberately has no human identity, email, raw bearer, Authorization header, cookie, request body, WorkOS identifier, Manus identifier, or scheduler-provider identifier. Its enums contain only `scheduled:intake-escalation:run`, `scheduled:stuck-recovery:run`, `intake-escalation`, and `stuck-recovery`. Recovery-deadline sweep and keepwarm are absent.

The service-authentication module parses exactly one canonical `Authorization: Bearer kng_st_<environment>_<opaque-id>_<secret>` value. It rejects missing, duplicate, combined, oversized, or malformed values; non-active, premature, expired, or revoked records; environment or capability mismatch; unsafe verifier metadata; cookies; query strings; request bodies; human context; legacy cron signals; and SDK-shaped context. Store, verifier, and authentication-timeout failures fail closed as a generic `503` without invoking business work or exposing secret/error material. It returns a narrow immutable `ServicePrincipal`, never an `AuthenticatedUser`, and never calls `sdk.authenticateRequest`.

The closed immutable capability registry contains exactly two entries and maps each to one canonical future path. It has no wildcard, alias, tRPC capability, keepwarm capability, or recovery-deadline capability.

The route boundary is a reusable, bounded-timeout, pre-body factory. It reads raw headers so duplicate Authorization fields remain distinguishable, requires an empty header-only request, and gives generic denials. It is intentionally **not imported or mounted** by `server/_core/index.ts`, and it does not replace either current scheduled route.

The lease primitive uses database transactions, row locks, `UTC_TIMESTAMP(3)`, and millisecond-precision timestamps for every acquisition, overlap, renewal, expiry takeover, fence, and completion decision. Local process clocks are never authority inputs. It takes over only after database-clock expiry with a monotonically increasing generation, fences stale holders, completes a window once, and prevents terminal replay. The outbox accepts only an opaque context minted by the active fenced transaction. Its `INSERT ... SELECT` independently validates the exact running fence and database-clock-valid lease, so a stale or fabricated caller cannot enqueue an effect. It creates a deterministic `g1-effect-v1` SHA-256 key from job/window/effect/subject. **A job/window may contain exactly one effect across every generation:** an exact retry deduplicates, while a changed type, subject, or payload is a conflict. The payload contract is closed and minimal: reviewed effect types, opaque typed business references, and a reviewed reason code only. No free-form, human, contact, address, email, token, or request data is persisted. No dispatcher or external call exists. Neither primitive is wired into existing jobs, routes, intervals, startup cleanup, or notifications.

## Default-off and nonactivation statement

`G1_SERVICE_ROUTES_ENABLED` is parsed by exact comparison with the string `true`; absent, malformed, differently cased, or false values remain disabled. The readiness declaration is provider-neutral and returns configuration names and validation status only. Even when the declaration is complete, it reports `routeBoundaryMounted: false`. Database schema presence, a credential row, WorkOS configuration, network location, a legacy `cron_` identity, or a scheduler task UID cannot enable G1.

This source package does not deploy, migrate staging or production, change secrets, configure a scheduler, change GitHub Actions, alter Render, call WorkOS, alter human authentication, issue a credential, start a dispatcher, mount a route, change current intervals, replace the legacy cron bridge, or change recovery-deadline behavior.

## Remaining owner decisions

Activation remains a later, separately approved change. The owner must select **one scheduler of record per environment and capability**, choose canonical windows/cadences and maximum lease/renewal/takeover behavior, decide missed-window and retry policy, resolve existing in-process versus HTTP duplicate triggers, approve deployment and schema evidence, define secure issuance/rotation/revocation operations, and require post-activation race and stale-fence proof.

That scheduler decision remains **provider-neutral**. Repository evidence does not establish Render or GitHub Actions as scheduler of record, and this implementation does not assume Manus. The existing Manus/WebDev keepwarm integration is non-G1 evidence only. Render and Actions status remain unknown outside the evidence recorded in the approved scope.

Recovery-deadline sweep is not a G1 feature. Its default-deny route and separate in-process recovery-deadline retirement question are unchanged and require their own owner decision.

## Corrected validation evidence — 20 September 2026

The final isolated matrix passed **76 tests in 7 files**. It covers exact capability verification; denial of human, cron, SDK, cookie, query, and body signals; generic storage-outage and authentication-timeout handling before business work; dual-trigger acquisition; immunity to a fast injected local-clock value; millisecond expiry/takeover boundaries; stale-holder rejection; renewal; terminal replay prevention; rollback; same-window cross-generation exact deduplication; changed-content conflict; PII-shaped payload/subject rejection; non-duplicate database-error propagation; migration journaling; and readiness behavior. The server bundle passed through `pnpm check:server` and all reviewed files passed Prettier and `git diff --check`.

The only test database write was a guarded, loopback-only schema alignment to represent the review-corrected `TIMESTAMP(3)` scheduler columns and remove an obsolete local foreign key that was absent from migration `0062`. The disposable snapshot was updated to the same intended shape. No application, staging, production, scheduler, credential, route-activation, or deployment write occurred.

`tsc --noEmit` still exits non-zero for inherited repository diagnostics. The G1 branch has **1,000** TypeScript diagnostics versus **1,002** on current main, with **zero diagnostics on changed G1 production paths**.

### Final AppSec remediation — 20 September 2026

The final independent review initially blocked publication on two correctable invariants. All G1 persisted timestamp fields—credential lifecycle, credential audit, lease, and effect fields—now use `TIMESTAMP(3)`/`CURRENT_TIMESTAMP(3)` in migration `0062`, Drizzle declarations, and the disposable schema snapshot. The outbox now has a unique `(job_key, window_key)` constraint, locks and compares the existing window effect before insert, and rejects a changed type, opaque subject, or payload across generations; only an exact retry deduplicates. The corrected isolated matrix again passed **76 tests in 7 files**, including type-, subject-, and payload-conflict proof. `pnpm check:server`, Prettier, and `git diff --check` passed. The final TypeScript comparison remains 1,000 inherited diagnostics versus 1,002 on main, with none on changed G1 production paths.
