# REC-SEC-02: Recovery-Deadline Sweep Source Remediation

**Status:** Approved source-only remediation plan; implementation in progress on `fix/recovery-deadline-service-authorization`.

## Purpose and scope

REC-SEC-02 removes the recovery-deadline sweep endpoint's reliance on a human-capable session and makes the sweep safe when startup and a future non-human caller overlap. It is a source and isolated-test-database package only. It does not create a scheduler, issue a credential, set a secret, activate a route in a deployed environment, alter the existing `cron_` bridge, retire any legacy scheduler mechanism, or change production data or ingress.

The current route accepts any authenticated session before invoking a cross-tenant writer. The replacement will admit only one explicitly configured, environment-bound service capability. A human session is an explicit denial condition even if a bearer credential is also present. Admission occurs before the executor is created, before any recovery-case query, and before any database mutation.

## Automation assessment

The existing job is deterministic operational work, not a task that requires an AI decision. The source package therefore adds no new scheduled process. It makes the current startup trigger and the future dedicated HTTP caller use the same fenced executor. A separately authorized deployment decision will select the actual scheduler mechanism only after REC-SEC-01 has identified and protected the real ingress topology.

| Future invocation option                             | Safety properties                                                                                         | Not part of REC-SEC-02                                                    |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| A managed scheduler calling the protected HTTP route | The scheduler must send the dedicated capability and pass the edge exception only after Phase 1 evidence. | Scheduler creation, credential injection, edge exception, and activation. |
| An internal job runner invoking the same executor    | The runner must use the same lease/outbox contract and have no human-session path.                        | Runner creation, deployment, and any identity binding.                    |

## Capability admission contract

The route accepts only an `Authorization: Bearer` value in the fixed opaque form `kinga-svc:v1:<capability-id>:<secret>`. The configured capability identifier, configured capability environment, and explicit runtime deployment environment must all be syntactically valid and must match exactly. The secret is verified with Node's built-in scrypt KDF using a versioned, parameter-bearing hash. This keeps REC-SEC-02 independent of Package G1's separately paused Argon2id dependency decision while still avoiding plaintext, session-derived, IP-derived, or platform-convention authority.

Missing configuration, an absent or malformed bearer value, an unknown identifier, a hash-verification failure, an expired or revoked capability state, a capability for another environment, a request containing KINGA's session cookie, and any unsupported condition all produce the same generic denial. The handler does not invoke `sdk.authenticateRequest`, does not inspect `isCron`, task identifiers, source IP addresses, proxy headers, user agents, or cookies as positive authority, and does not log bearer material.

Credentials are not issued by this package. Configuration values are intentionally absent from source control. Until a separately controlled deployment supplies an active, environment-bound capability record and route activation is approved, the HTTP route is default-deny.

## Fenced execution and durable effects

The migration introduces two narrowly scoped records. A named lease record grants one holder a short-lived execution window and increments an integer fencing token on every successful acquisition. Every recovery-deadline sweep entry point acquires this lease before scanning recovery cases. A holder that loses or outlives the lease cannot finalize an effect because every final write verifies the holder and its fencing token inside the transaction.

A durable outbox records one deterministic alert effect for each recovery case and threshold window. A unique key on `(recovery_case_id, effect_key)` prevents two overlapping callers from staging the same effect. The executor first stages candidate alerts transactionally, then claims and dispatches them one at a time. A positive `notifyOwner` result is necessary, but not sufficient, to finish an effect: the same transaction must still own the current fence, mark the outbox row delivered, and set the matching recovery-case suppression timestamp. A resolved `false` or thrown notification leaves the outbox retryable and leaves the suppression timestamp unset.

The owner-notification transport has no documented idempotency-key interface. The database therefore guarantees exactly one matching durable suppression effect and prevents concurrent dispatch by two live callers. A process failure after an accepted remote notification but before the database transaction commits remains an at-least-once delivery boundary; it is recorded in the review evidence rather than misrepresented as end-to-end exactly once.

The scan is bounded per lease acquisition. Additional eligible cases remain pending for a later authorized invocation rather than extending an unbounded global writer.

## Required evidence

The source package must prove the following on `kinga_ci_test` only:

- human session cookie denial occurs before the runner is invoked;
- malformed, wrong-identifier, wrong-environment, unavailable, expired, and revoked capabilities all deny without global work;
- two simultaneous valid callers obtain one lease holder and produce one durable effect;
- startup and HTTP paths share the same lease and cannot duplicate an effect;
- a `notifyOwner` result of `false` or a thrown error leaves the relevant suppression timestamp unset and the effect retryable; and
- a confirmed `true` creates exactly one delivered effect and one matching suppression update.

The package also requires focused test execution through the fail-closed isolated test runner, schema provisioning for `kinga_ci_test`, server-bundle validation, formatter and conflict-marker checks, changed-path comparison with `main`, and independent application-security review before a review pull request is opened.

## Explicitly deferred

REC-SEC-01 remains the prerequisite for any production route exposure. Package G1 and G2 remain paused. This package does not grant or configure Cloud Run, Cloud Armor, a load balancer, DNS, IAM, scheduler credentials, or an external service principal. It does not change deployment configuration, migrate a live database, create any real service token, or authorize merging or deployment.

## Source references

The affected HTTP route is `server/_core/index.ts`. The current sweep and alert suppression behavior are in `server/recovery/recoveryDeadlineAlerts.ts`. Startup currently invokes the sweep through `server/_core/maintenance-write-jobs.ts`. The schema contract is in `drizzle/schema.ts`.
