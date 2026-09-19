# WorkOS Package G: Split Service-Identity and Human-Eligibility Design

**Date:** 19 September 2026
**Author:** Manus AI
**Status:** **Review only.** This document authorizes no source, test, schema, migration, credential, WorkOS, scheduler, staging, production, deployment, or data action.

## Approved design boundary and implementation split

The owner approved the **revised Package G design boundary** on 19 September 2026 after final independent review. The design deliberately becomes two separately reviewed and merged implementation packages:

1. **G1 — service-principal model and scheduled-execution safety.** This implementation may add the durable service-principal/verifier, exact capability registry, fenced execution lease, effect idempotency/outbox, and isolated tests. It may not activate a route, issue a credential, retire the `cron_` adapter, alter an existing scheduler of record, call an external service, or enable WorkOS.
2. **G2 — human-auth eligibility and agency-association integrity.** This later package will require its own proposal, owner decision on eligibility governance details and legacy reconciliation, isolated implementation, independent review, and source-review PR before it can add classification/association schema or change WorkOS admission.

The approval does not activate WorkOS. Manus remains the active human login provider; `WORKOS_HUMAN_AUTH_ENABLED` remains false; Package D’s route remains default-off; and KINGA remains the only issuer and authority for application sessions.

The approved implementation decisions for G1 are: **Argon2id** is the primary credential verifier, with documented `scrypt` fallback only if Argon2id cannot be adopted; the baseline is a 90-day maximum credential lifetime with one active credential per environment-and-capability; intake escalation and stuck recovery are candidate capabilities only; and the fenced lease plus transactional outbox/effect-idempotency contract is mandatory before a future route activation. The scheduler of record, exact job-window/renewal policy, credential issuer/delivery/rotation process, audit retention, and route activation remain later owner gates.

> **Definition:** A **service principal** is a non-human, KINGA-owned credential subject that can invoke one named machine capability. It is not a `users` row, browser session, WorkOS user, Manus user, tenant member, or tRPC human context.

> **Definition:** **Human-auth eligibility** is a local, fail-closed authorization fact about whether an existing KINGA user may enter the guarded WorkOS linking flow. It is not inferred from email, role, tenant, a provider claim, or absence of a disqualifying boolean.

## Review correction: why the first draft was blocked

The first draft treated every `restricted_claimant_user_id` association as a permanent proxy denial and assumed that a separately verified claimant was always a different user. That is not true today: `agencyAssistedClaimantIdentity.ts` intentionally writes the **same** verified local user ID to both `restrictedClaimantUserId` and `verifiedClaimantUserId` for `linked_to_verified_claimant`. [1]

Nor do current agency-association constraints make absence or cardinality safe to lock during a WorkOS callback: the relationship table lacks user-reference foreign keys and index/unique constraints on the two user columns. A callback cannot safely infer permanent human ineligibility from the present fields, including when no association exists, while another transaction can add or reassign one. [2]

The revised proposal therefore does **not** reinterpret, delete, or bulk-classify legacy agency identities. It treats every current record without an explicit approved human-auth eligibility state as denied. It requires a new authoritative model and an owner-approved legacy reconciliation plan before any WorkOS activation is conceivable.

## Current contracts preserved until a later cutover

The active Manus OAuth callback continues to authenticate humans and issue KINGA’s existing local session. Ordinary requests continue to verify the local HS256 token, reload the active user, and derive permission from KINGA data. Package F’s extracted local-session contract remains unchanged. [3] [4]

Current in-process intake-escalation and stuck-recovery jobs remain active. The existing HTTP routes still authenticate through `sdk.authenticateRequest`, recognize a `cron_` cookie identity, and call the same mutation-capable job functions that startup scheduling invokes. Package G must not change or retire this behavior until a route-by-route migration has a shared durable execution lease. [5]

| Current endpoint                              | Current rule                                                                   | Package G status                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `POST /api/scheduled/keepwarm`                | Public.                                                                        | Excluded from the first service-principal tranche.                             |
| `POST /api/scheduled/intake-escalation`       | `cron_` Manus bridge plus task UID allowlist; same job also starts in-process. | Candidate only after shared lease and route decision.                          |
| `POST /api/scheduled/stuck-recovery`          | `cron_` Manus bridge plus task UID allowlist; same job also starts in-process. | Candidate only after shared lease and route decision.                          |
| `POST /api/scheduled/recovery-deadline-sweep` | Any authenticated human-like identity may invoke it.                           | Excluded from G1. A separate read-only authorization review is now authorised. |

The current wildcard default for `HEARTBEAT_ALLOWED_TASK_UIDS` is not an acceptable target model. Package G does **not** alter it now. A later service route has no wildcard capability, task UID, or alias mapping. [5]

## Proposed source boundary after separate implementation approval

| Future component                          | Package | Proposed responsibility                                                                                                  | Explicit exclusion                                                                                   |
| ----------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `service_credentials` schema and verifier | G1      | Opaque service credentials, lifecycle state, explicit capability records, verification, and sanitized audit integration. | `users`, local browser JWTs, WorkOS/Manus tokens, provider calls, and generic tRPC context.          |
| Pre-body service route boundary           | G1      | Header-only machine authentication, exact capability check, body rejection, timeout, and generic response.               | Cookie, query-token, URL-token, request-body token, or human-session fallback.                       |
| Durable scheduled execution lease         | G1      | One atomic execution lease/window per named job, shared by in-process and migrated HTTP trigger paths.                   | Process-local-only locking or two independent schedulers mutating the same job without coordination. |
| Human-auth eligibility model              | G2      | Authoritative local classification, lifecycle/audit constraints, and guarded WorkOS admission recheck.                   | Automatic classification, data deletion, user/tenant creation, role assignment, or mapping adoption. |
| Agency-association integrity migration    | G2      | Explicit association semantics, user-reference indexes, cardinality/integrity rules, and legacy state.                   | Silent reinterpretation of current shared-pointer records.                                           |
| Focused test fixtures                     | G1 / G2 | Test-owned service credentials, human candidates, agency states, scheduler leases, and adversarial races.                | Live, staging, populated, or production data.                                                        |

No future Package G route may be mounted while `WORKOS_HUMAN_AUTH_ENABLED` is false merely because Package G tables exist. Package G service routes require their own separately named server gate and environment-specific activation authority; WorkOS human authentication remains controlled only by its existing exact gate.

## G1 — KINGA-only service-principal model and scheduled-execution safety

### Credential and capability records

A later implementation adds additive durable records. The clear bearer secret is generated from at least 32 cryptographically random bytes, shown once through an owner-approved secure delivery channel, and then never stored, returned, logged, committed, sent in a URL, or placed in a cookie.

```text
kng_st_<environment>_<credential-id>_<base64url-secret>
```

The service credential is looked up only by a non-secret opaque identifier and is verified with a versioned, salted, memory-hard verifier. The preferred implementation is **Argon2id**. A reviewed Node `scrypt` fallback is permitted only if Argon2id is not adopted, with documented parameter, dependency, and later-upgrade policy. A fast SHA-256 token hash is prohibited as the sole stored verifier. OWASP recommends Argon2id for stored authenticators and identifies `scrypt` as the fallback when Argon2id is unavailable. [6]

| Record property | Required future invariant                                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity        | Immutable opaque credential ID, non-secret display prefix, environment, named service principal, and owner/approval metadata.                      |
| Verification    | Algorithm/version, unique salt, memory-hard verifier, constant-time comparison; no raw value or reversible encryption.                             |
| Capability      | Exact named capability-to-route mapping. No wildcard, role inheritance, tenant inference, URL alias, or default capability.                        |
| Lifecycle       | `not_before`, mandatory expiry, `active` / `retiring` / `revoked` / `expired` state, predecessor/successor link, and per-request revocation check. |
| Audit metadata  | Safe identifiers and timestamps only: create, activate, use outcome category, rotate, retire, revoke, expire, cleanup, and break-glass events.     |

The proposed operational baseline is a maximum **90-day** lifetime, one active credential per environment-and-capability, and a short documented rotation overlap. This is a decision for the owner before implementation, not an enacted policy.

### Verification and route composition

The verifier accepts exactly one `Authorization: Bearer <token>` header on the verified HTTPS deployment path. It denies absent, duplicate, combined, oversized, malformed, wrong-version, unknown, inactive, not-yet-valid, expired, revoked, or incorrect values. It never reads cookies, query parameters, `app_session_id`, Manus state, WorkOS material, or a request body.

Successful authentication yields a branded `ServicePrincipal` that contains only a service credential ID, capability, environment, and safe correlation metadata. It never constructs `AuthenticatedUser`, uses the old synthetic ID `-1`, derives a human role/tenant, reads/updates a local user, updates `lastSignedIn`, issues a KINGA cookie, or enters tRPC or ordinary human authorization middleware.

A migrated service endpoint must be mounted **before any body parser or business work**. It accepts no body and rejects a non-empty body after header-only authentication; it also has a route-specific timeout and bounded request policy. If the present global parser cannot satisfy this ordering, implementation must stop for a separately reviewed router-composition adjustment rather than claim that a service route is header-first.

Each exact route then checks one immutable reviewed registry entry:

| Proposed capability                     | Proposed route                           | State                                                                   |
| --------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| `scheduled:intake-escalation:run`       | `/api/scheduled/intake-escalation`       | Candidate only after owner approval and shared lease proof.             |
| `scheduled:stuck-recovery:run`          | `/api/scheduled/stuck-recovery`          | Candidate only after owner approval and shared lease proof.             |
| `scheduled:recovery-deadline-sweep:run` | `/api/scheduled/recovery-deadline-sweep` | Deferred; its current human-triggerable policy needs an owner decision. |

The legacy `cron_` adapter, if temporarily retained, must be mounted only on a named route under an explicit migration flag. It must never remain as the general `sdk.authenticateRequest` synthetic branch for arbitrary routes.

### Durable execution contract and scheduler-of-record

Authentication alone does not prevent two schedulers or retries from running the same mutation. The first implementation tranche therefore requires a shared durable `scheduled_job_leases` / execution-window contract **before** any service credential is accepted.

Both an in-process trigger and an approved HTTP service trigger must invoke the same `runWithScheduledLease(jobKey, window)` boundary. In one transaction, acquisition creates or advances a **monotonic fencing generation** and returns `(executionId, generation, leaseExpiresAt)`. A unique job/window record prevents a completed window from being scheduled again. No worker may make an ownership-sensitive write, mark terminal state, or emit an effect merely because it once held a lease: every such operation must atomically require the current `(jobKey, window, executionId, generation)` generation.

The job runner must also write a durable per-window **effect idempotency record** before any notification, provider call, or other non-transactional effect. The effect key derives from the job window and named effect. A transactional outbox (or an explicitly approved equivalent with the same proof) dispatches effects only after the business transaction commits and deduplicates delivery by that key. A stale worker that resumes after its lease expires must fail its conditional write, fail to enqueue an effect, record a safe stale-holder outcome, and exit. It must not be able to overwrite a new owner’s terminal state or duplicate a claim mutation/notification.

The exact owner decision is whether the non-production/staging scheduler of record is **only in-process** or **an external service credential** for each route. The implementation cannot enable both uncontrolled. During a controlled transition, both trigger paths may exist only if they share one fenced execution record and effect-idempotency contract. It must define maximum runtime and renewal rules, no-overlap response for `already-running` / `already-completed`, lease-expiry takeover, retry classes/backoff, timeout/cancellation, missed-run handling, stale-holder behavior, outbox delivery/retry, and rollback before route activation.

## G2 — authoritative human-auth eligibility and agency integrity

### New, explicit model

Package G proposes adding a non-null local `human_auth_eligibility` state to `users`, defaulting every legacy/new row to `unclassified` (deny). Because this value is on the user row that Package D already locks, absence cannot be used as a race-prone authorization signal. The field is not an inferred role and must not be writable by ordinary profile, tenant, agency, or provider-maintenance operations.

The closed initial vocabulary is:

| State                                           | WorkOS human linking                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `human_eligible`                                | May proceed only after every existing Package D check and the additional locked eligibility/agency predicates pass. |
| `agency_restricted_proxy`                       | Never eligible.                                                                                                     |
| `service` / `scheduled`                         | Never eligible.                                                                                                     |
| `qa` / `synthetic` / `impersonation`            | Never eligible.                                                                                                     |
| `unclassified` / `legacy_ambiguous` / `blocked` | Never eligible.                                                                                                     |

A separate, narrowly authorized governance writer is required to transition this value. It must record the preceding/final value, approved reason code, actor, correlation, and timestamp in a durable audit record. Ordinary user maintenance must not downgrade or upgrade eligibility. The authoritative writer, transition matrix, approval requirements, audit readers/retention, and break-glass procedure are owner decisions before implementation.

### Agency data model and legacy treatment

The current two pointer fields cannot encode a permanent proxy exclusion without ambiguity. A later migration must add explicit association semantics and indexed user references. At minimum it must distinguish `restricted_proxy` from `verified_human_reference` and represent a legacy same-ID record as `legacy_ambiguous` rather than guessing.

The proposal requires all of the following before WorkOS activation:

1. Indexed lookup keys for both explicit association references, cardinality rules, and referential integrity (foreign keys where compatible with the established migration policy, otherwise an owner-approved equivalent plus tests).
2. A documented treatment for every existing shared-pointer record. It remains `unclassified` or `legacy_ambiguous` and therefore denied until an owner-approved reconciliation assigns a durable eligibility state; no automatic conversion occurs.
3. An explicit policy for an independently verified claimant. A claimant is never eligible by association alone; it must be a distinct human-auth subject or receive a documented owner-approved classification. It may not inherit a restricted proxy’s WorkOS mapping, session, role, authority, or history.
4. A data-governance rule for association reassignment, deletion, and classification changes so a routine agency workflow cannot bypass the linker.

### Locked WorkOS admission protocol

A later WorkOS callback must use one transaction at `SERIALIZABLE` isolation or a reviewed InnoDB next-key/range-lock protocol backed by the new indexes. The protocol locks, rechecks, and commits all predicates together:

1. Find exactly one canonical-email candidate through an indexed canonical-email representation; no `LIMIT 1` shortcut.
2. Lock that user and require `human_auth_eligibility = human_eligible`, active state, existing Package D QA/unregistered checks, and a local tenant.
3. Lock all agency-association rows referencing the candidate under both explicit user-reference indexes, including an indexed absence/range proof. Any `restricted_proxy` or `legacy_ambiguous` association denies. Multiple, malformed, missing-required, or conflicting association states deny.
4. Lock and recheck the active, non-synthetic tenant and its exact existing WorkOS organization mapping.
5. Recheck verified provider identity, canonical email, and null-or-equal `workos_user_id`.
6. Execute an exactly-one guarded update that repeats all user/eligibility/tenant/organization/WorkOS-ID predicates. Zero or multiple rows, a uniqueness collision, classification/association race, tenant race, or persistence problem denies with no session.

An existing equal WorkOS ID is **not** a bypass. It receives the full human-eligibility and association check before a local session can be issued. A later discovery of a non-human mapping creates a sanitized operational review event; it does not trigger automatic destructive remediation.

## Required future evidence

All future tests use only guarded `pnpm test` against disposable `kinga_ci_test` data.

| Area                | Required proof                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Credential verifier | Missing, duplicate, malformed, unknown, inactive, expired, revoked, wrong-version, and replayed bearer credentials deny without a provider call, cookie read, human context, or secret disclosure.                                                                                                                                                                                               |
| Secret storage      | Clear secret is one-time only; only a versioned memory-hard verifier and safe prefix persist. Rotation, expiry, revocation, and predecessor overlap are verified.                                                                                                                                                                                                                                |
| Route composition   | Header-only service authentication runs before body work; cookies/JWTs, WorkOS/Manus inputs, old `cron_` inputs, aliases, and non-empty body deny.                                                                                                                                                                                                                                               |
| Least privilege     | A credential authorizes only its named capability and cannot invoke unrelated routes or tRPC.                                                                                                                                                                                                                                                                                                    |
| Scheduler safety    | Two service instances, in-process plus HTTP, retry after lease expiry, repeated valid bearer, cancellation, missed-run, and completed-window cases prove one fenced owner. A worker paused past expiry then resumed after a new owner completes must fail every stale conditional write and effect enqueue; each per-window effect is delivered through its idempotency/outbox key at most once. |
| Identity invariants | `unclassified`, service, scheduled, QA, synthetic, impersonation, blocked, proxy, malformed, duplicate, and current shared-pointer legacy identities deny with no WorkOS link or KINGA session.                                                                                                                                                                                                  |
| Association races   | Insert/delete/reassign association, eligibility change, duplicate email, tenant/organization change, and equal-ID proxy cases racing a callback all deny or preserve one safe winner only.                                                                                                                                                                                                       |
| Non-regression      | Active Manus OAuth, Package F local JWT/cookie contract, KINGA-AUTH-01 deleted/deactivated-user tests, default-off WorkOS routes, and ordinary human context remain unchanged.                                                                                                                                                                                                                   |
| Audit hygiene       | Lifecycle and request events use safe identifiers/fixed outcome categories; no bearer, verifier, hash, header, cookie, email, request body, provider token, or provider ID is stored.                                                                                                                                                                                                            |

## Owner decisions and remaining gates

| Decision               | Current owner decision                                                                            | Remaining gate                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eligibility governance | **Approved:** non-null deny-by-default baseline.                                                  | G2 must separately propose the classification-transition writer, approval/audit lifecycle, retention, break-glass, and legacy-reconciliation authority.                            |
| Agency semantics       | **Approved:** shared-pointer legacy records stay denied; no automatic conversion.                 | G2 must separately decide whether an independently verified claimant can ever be eligible and propose migration/constraint proof.                                                  |
| Database integrity     | Not yet approved for source change.                                                               | G2 scratch proof must establish canonical-email and association indexes, integrity/cardinality constraints, and the transaction protocol.                                          |
| Service verifier       | **Approved:** Argon2id primary; documented `scrypt` fallback only if Argon2id is unadoptable.     | G1 must propose exact parameters, dependency, storage boundary, and upgrade path before implementation finalization.                                                               |
| Credential operations  | **Approved:** maximum 90 days and one active credential per environment/capability.               | G1 must separately establish issuer, secure delivery, rotation/revocation owner, overlap, audit retention, and incident/break-glass controls.                                      |
| Initial routes         | **Approved as candidates only:** intake escalation and stuck recovery.                            | G1 must not activate either. Recovery-deadline sweep receives a separate read-only authorization review now.                                                                       |
| Scheduler migration    | **Approved required shape:** fenced execution/window plus idempotent-effect transactional outbox. | G1 must propose scheduler of record, job windows, maximum runtime/renewal, retry/backoff, timeout, missed-run, outbox delivery, observation, and rollback before route activation. |
| Network posture        | **Approved:** do not assume trust in IP, proxy, or mTLS.                                          | Future route activation must present verified environment-specific network evidence and any restriction proposal.                                                                  |

## Deliberate non-actions

This proposal itself does not classify or modify any existing user, agency association, tenant, or WorkOS mapping; create a service credential; add a table or migration; install a hashing package; modify a route; configure a scheduler; enable a WorkOS flag; register a callback; contact WorkOS; change staging/production; deploy; or call any external service. The owner has separately authorized an isolated **G1 source implementation** under the limits recorded above; no G1 activation is authorized.

## Authorised next steps

The owner approved G1 implementation first: an isolated service-principal and scheduler-fencing/outbox source package, with disposable-database migration proof, focused tests, independent security review, and a source-review PR. It must not issue a credential, mount or activate a route, retire the `cron_` bridge, alter a live scheduler, or contact an external service.

G2 remains a future, separately proposed and approved human-eligibility/agency-integrity package. It cannot be folded into G1. Recovery-deadline-sweep authorization receives a separate read-only review now, independent of either implementation package.

## Independent proposal review

The first review blocked the draft because permanent exclusion based on the current `restricted_claimant_user_id` field would also exclude deliberately linked verified humans, and because no present schema/locking mechanism safely serialized association absence or changes with a WorkOS callback. It also required a durable shared scheduler lease rather than treating credential authentication as duplicate-execution protection. The first revision replaced the field shortcut with a non-null user eligibility state, explicit agency-association semantics, indexed transaction-wide locking, legacy deny-by-default treatment, and a shared execution lease. A second review then required fencing and effect-level idempotency: an expired lease by itself cannot prevent a paused stale worker from resuming after takeover. This revision requires monotonically fenced writes/terminal transitions and a per-window transactional outbox/effect idempotency contract. The **final independent security/architecture review completed and approved** this design on 19 September 2026 with no required changes.

## References

[1]: https://github.com/Tavshok/KINGA/blob/main/server/agency/agencyAssistedClaimantIdentity.ts "Current agency-assisted verified-user linking semantics"
[2]: https://github.com/Tavshok/KINGA/blob/main/drizzle/schema.ts "Current agency identity association schema"
[3]: https://github.com/Tavshok/KINGA/blob/main/server/_core/kinga-session.ts "KINGA local session boundary"
[4]: https://github.com/Tavshok/KINGA/blob/main/server/_core/oauth.ts "Active Manus callback issuing KINGA session"
[5]: https://github.com/Tavshok/KINGA/blob/main/server/_core/index.ts "Current scheduled-route and maintenance-job boundaries"
[6]: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html "OWASP Password Storage Cheat Sheet"
[7]: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html "OWASP Secrets Management Cheat Sheet"
[8]: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html "OWASP Authentication Cheat Sheet"
