# REC-SEC-01: Recovery-Deadline Sweep Edge Containment Proposal

**Date:** 19 September 2026

**Author:** Manus AI

**Status:** Review-only proposal. This document authorizes no deployment, edge rule, route, scheduler, credential, database, source, staging, or production change.

## Decision required

The public `POST /api/scheduled/recovery-deadline-sweep` endpoint is a live P0 broken-function-authorization exposure. Any active human session can currently invoke a cross-tenant deadline sweep. The sweep can cause owner notifications and update alert-suppression timestamps. The immediate objective is to remove the public human path before designing the durable source replacement. [1]

This package proposes **temporary edge containment**, not a source-code fix. Its safe default is to block every request to the exact `POST` path. An exception for a scheduler may be added only after the scheduler has a verified non-human identity at the ingress boundary. The existing application session cookie cannot provide that distinction because the route currently accepts the same session authentication for both human and cron identities. [2]

> **No IP address, proxy header, task name, user-agent, shared browser cookie, or undocumented platform convention is accepted as scheduler authority.** A rule that relies on any of those values would provide a false assurance rather than containment.

## Proposed containment sequence

### Phase 0 — Immediate default-deny rule

At every public ingress that can reach the active production revision, install a deny rule for **only** the complete set of request representations that the origin routes to the recovery-deadline handler. The rule must return a generic denial response before traffic reaches the application. The rule must not affect `/readyz`, the application root, `POST /api/trpc`, the existing secured intake-escalation endpoint, the existing secured stuck-recovery endpoint, or any other scheduled path.

The initial rule has **no allow exception**. Any external recovery-deadline scheduled invocation must be paused rather than silently allowed while its identity is unverified. The in-process startup invocation is not an interactive public request and is outside the edge block; its processing, concurrency, and delivery behavior are currently unbounded or unverified and remain part of the separately proposed source remediation.

| Match                                                                                                      | Temporary ingress disposition                          |      Origin reached | Purpose                                                        |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------: | -------------------------------------------------------------- |
| Canonical and route-equivalent representations of `POST /api/scheduled/recovery-deadline-sweep`            | Generic `404` or provider-equivalent route concealment |                  No | Close every human-reachable representation of the handler.     |
| Same representations with any normal user cookie, cron-looking cookie, IP, header, or malformed credential | Same generic denial                                    |                  No | Avoid giving attackers a route-specific authentication oracle. |
| Any other method or path                                                                                   | No change from current configuration                   | As configured today | Keep the package narrowly reversible.                          |

Before the edge rule is defined, the operator must establish the provider's canonicalization order and prove the full equivalence set: canonical path, trailing slash, duplicate slash where the provider or origin normalizes it, percent-encoded path separators or segments, dot segments, case behavior, and query-bearing requests. Current Express configuration does not enable strict routing, so a trailing-slash representation is a material case. If the provider cannot prove that its rule runs after the relevant normalization or cannot safely cover every origin-equivalent representation without affecting an unrelated path, stop rather than publish a literal-path rule.

The actual response code must follow the active edge provider’s supported configuration. If a true non-forwarding `404` cannot be configured safely, use a generic non-forwarding `403`. Do not redirect to login, return an application error body, or forward then rely on application code to reject the request.

### Phase 1 — Evidence before a scheduler exception

A scheduler exception is **not included** in the immediate change. Before any exception is proposed, an operator must produce read-only evidence of all of the following:

1. A complete ingress inventory: every production custom domain, provider service/origin domain, alias, preview route capable of reaching the production revision, direct service URL, and routing layer that can serve the live KINGA endpoint. Each must either receive the deny policy or be proven unable to reach the active production revision from the public network.
2. The current scheduled caller, if any, including the exact immutable identity mechanism available to the edge. Acceptable mechanisms are provider-verified workload identity, mTLS client authentication terminated at the edge, or a short-lived signed assertion that the edge independently validates for this single route and audience.
3. The exact path, method, audience, issuer or certificate trust chain, key-rotation source, token lifetime, and replay controls. The proof must show that a public client cannot mint or replay the credential.
4. A tested rollback path that reinstates the default-deny rule without modifying the application, database, or scheduler code.

Only after those facts are reviewed may a follow-on packet define a route-specific allow rule. It must be an AND condition that binds all of: exact host, exact `POST` method, exact path, verified non-human identity, route-specific audience, short expiry, and provider-level signature or certificate validation. The source remediation remains mandatory even after an edge exception exists, because ingress is defence in depth rather than the application’s sole authority control. OWASP recommends deny-by-default access control and permission validation on every request. [3]

### Phase 2 — Removal criteria

The temporary edge block remains until the dedicated source remediation has merged, passed its adversarial test matrix, has been separately approved for activation, and has a verified non-human scheduler identity. At that point, the temporary rule may be retired only through a fresh change packet that proves the source and edge controls work together. It must not be removed merely because Package G1 exists in source control.

## Mandatory preflight and stop conditions

The operator must treat any uncertainty as a stop condition. The proposal does not assume the live edge provider, scheduled caller, deployment ownership, or external scheduler registration; the available project connector configuration has no configured deployment or edge service for this work.

| Preflight check          | Required result                                                                                                                                                                                                                                                            | Stop condition                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Ingress inventory        | Every public hostname, provider service/origin URL, alias, and routing layer that can reach the active production revision is identified. Every such ingress will receive the rule or is proven unable to reach that revision.                                             | An unidentified or unprotected public ingress can reach the application.                                         |
| Target identity          | Exact production domain, hosting/edge account, service, and active revision are shown read-only.                                                                                                                                                                           | Any ambiguity between preview, staging, or production.                                                           |
| Route equivalence        | Provider documentation/simulation shows canonicalization order and the deny policy covers every origin-equivalent representation, including trailing slash, duplicate slash where normalized, encoded separators/segments, dot segments, case behavior, and query strings. | A literal rule, provider normalization uncertainty, or representation gap could reach the handler.               |
| External schedule        | Existing recovery-deadline external trigger is identified and paused, or its absence is shown.                                                                                                                                                                             | An unknown caller may still invoke the path.                                                                     |
| Application availability | `/readyz`, `/`, tRPC, intake escalation, and stuck recovery remain unaffected in a staging/preview simulation.                                                                                                                                                             | Any unexpected route impact.                                                                                     |
| Observability            | Edge logs contain only route, method, decision, rule revision, and non-sensitive request correlation data.                                                                                                                                                                 | Cookies, authorization values, claims, recovery records, or query strings would be retained.                     |
| Safe fallback            | A tested one-step rule action retains or restores default-deny. Re-exposure of the legacy origin route is prohibited unless a separate emergency decision explicitly accepts the residual P0 risk.                                                                         | A normal rollback would restore the prior vulnerable configuration or depends on untested manual reconstruction. |

## Verification after an approved containment change

The validation must prove the deployed production block without invoking the live sweep or generating recovery alerts. A policy simulator is useful for precedence and canonicalization analysis but is not sufficient evidence that the deployed host denies before origin. Because the rule is non-forwarding, controlled probes cannot execute the sweep.

| Probe                                                                                             | Required result                                                                                                                                | Must not occur                                                                  |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Anonymous request across each route-equivalent representation and covered public ingress          | Generic edge denial; no origin forwarding.                                                                                                     | An application response, owner notification, database write, or detailed error. |
| Controlled valid ordinary human session across each covered ingress                               | Identical generic edge denial; no origin forwarding.                                                                                           | A distinguishable response that reveals cookie validity.                        |
| Malformed, expired, wrong-audience, or replayed future scheduler proof across each representation | Identical generic edge denial; no origin forwarding.                                                                                           | Different status, proxy-origin forwarding, or credential material in logs.      |
| Unrelated public and scheduled routes                                                             | Existing behavior remains intact.                                                                                                              | Accidental application-wide or scheduler-wide outage.                           |
| Edge and origin correlation                                                                       | Every controlled production probe has a non-sensitive edge deny record and no matching application origin access-log, metric, or trace record. | Any origin access proves the policy is not containment.                         |

An allow-path test for a future scheduler exception must not call the production sweep. It belongs to the later source-and-scheduler activation packet, where a harmless non-effect test target and explicit owner authorization can be used.

## Separate source remediation package: REC-SEC-02

The user requested a dedicated source package, separate from G1 and not an activation of any Package G route. That package is proposed conceptually here but is intentionally **not implemented by REC-SEC-01**.

REC-SEC-02 will replace the route’s human-session admission with an explicit non-human capability mechanism. It must accept only an exact capability bound to the recovery-deadline task, reject humans and all other capabilities, use generic failures, and be tested against `kinga_ci_test` only. It must introduce a durable fenced execution lease and transactional outbox/effect idempotency before any route is activated. It must also correct the current notification-result defect: `notifyOwner()` returning `false` must not set `recoveryDeadlineAlertSentAt`; only a confirmed `true` result may create delivery suppression. [4]

The required adversarial matrix is:

| Scenario                                                                          | Required result                                                                                                 |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Valid active human session                                                        | Denied before global query or mutation.                                                                         |
| Missing, malformed, expired, revoked, wrong-task, or wrong-environment capability | Denied before global query or mutation.                                                                         |
| Two concurrent valid requests                                                     | At most one lease holder executes each fenced effect; stale or non-holder attempts cannot write a later effect. |
| Notification throws or returns `false`                                            | No suppression timestamp is written; the effect remains retryable under the defined idempotency policy.         |
| Notification returns `true`                                                       | Exactly one suppression write is committed with the matching effect state.                                      |
| Startup and HTTP overlap                                                          | Exactly one fenced execution may create an effect.                                                              |

REC-SEC-02 must not create an external scheduler, issue a credential, enable a route, or retire the legacy `cron_` bridge without separate owner approval. Package G1 and G2 remain paused while REC-SEC-01 is reviewed and, if approved, while the distinct REC-SEC-02 plan is prepared.

## Approval boundary

Approval of this proposal authorizes only preparation of an exact provider-specific containment change packet after target and scheduler evidence are obtained. It does **not** authorize an edge edit, a deployment, a scheduler pause, a code change, a credential, a migration, a data mutation, or an external request that invokes the sweep.

## References

[1]: https://github.com/Tavshok/KINGA/blob/b4b6723e/server/_core/index.ts#L203-L231 "Current recovery-deadline scheduled route"
[2]: https://github.com/Tavshok/KINGA/blob/b4b6723e/server/_core/sdk.ts#L330-L378 "Current session authentication and identity resolution"
[3]: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html "OWASP Authorization Cheat Sheet"
[4]: https://github.com/Tavshok/KINGA/blob/b4b6723e/server/recovery/recoveryDeadlineAlerts.ts#L187-L225 "Current recovery notification and suppression effect"
