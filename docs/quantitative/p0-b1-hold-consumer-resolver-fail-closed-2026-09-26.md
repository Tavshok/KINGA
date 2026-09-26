# P0-B1 Hold-Consumer Resolver Fail-Closed (B-G2)

**Status:** approved; merge-ready
**Date:** 2026-09-26
**Branch:** `fix/p0-b1-hold-consumer-resolver-fail-closed`
**Base:** `9a7f1004` — merged B-G1 automatic fraud-hold consumer enforcement

## Purpose

B-G1 inventories every client tRPC hook that can receive the canonical P0-B1 fraud hold. The final integration audit found that its server-procedure resolver silently skipped an `appRouter` namespace it could not reduce to an object literal. It also skipped non-property members within a namespace router. Either pattern could hide a hold-capable procedure and prevent the exact manifest from detecting a new client consumer.

B-G2 makes that ambiguity a Quality Gate failure. It does not alter application fraud behavior, customer data, routing, or production configuration.

## Enforced boundary

The resolver now accepts only two statically resolvable router forms:

1. A direct property assignment with a literal key and a resolver-traceable value.
2. A shorthand property whose value symbol resolves to the same traceable router or procedure declaration.

It rejects spreads, methods, accessors, computed or non-literal keys, and any namespace router that cannot resolve to an object literal. A rejection includes the repository-relative source position and the exact unsupported form. This preserves existing static shorthand declarations, including imported router aliases, without accepting hidden composition.

The scanner continues to match only the canonical helper symbols and literal canonical hold shapes. A same-spelling local helper remains insufficient.

## Review correction

The first B-G2 adversarial review blocked two remaining fail-open cases. First, the namespace resolver accepted an arbitrary call expression by treating its first object argument as a router configuration. A wrapper could therefore conceal a different runtime router behind an innocuous object literal. Second, a procedure property that did not produce a canonical hold was silently skipped even when its value could not be proven to be a tRPC procedure.

The remediation now accepts a call-derived router object only when the call resolves to the exact exported `router` symbol in `server/_core/trpc.ts` and has one direct object-literal configuration argument. It accepts non-held procedure values only when their builder chain resolves to a named, committed allowlist of approved procedure builders in `server/_core/trpc.ts` or `server/_core/domain-middleware.ts`, and only through the currently approved intermediate builder methods: `.input(...)` and `.use(...)`. Imported values and locally derived approved-builder chains remain traceable. An opaque wrapper or an unapproved builder or fluent method now stops the inventory before it can omit a consumer.

The review then found two further false-positive paths within the new resolution rules. An opaque call could be misclassified as a hold merely because one of its arguments looked like a canonical hold, and an arbitrary fluent call after an approved builder could be treated as a trusted procedure. The remediation removes generic argument propagation. It recognizes an argument-derived hold only when the resolved callee's own return expression demonstrably carries that exact parameter through one of the canonical-bearing response keys (`data`, `fraudDecision`, or `decision_hold`). Standard compiler-typed `Array.map` projections remain supported; local `map` lookalikes do not. This preserves the established `createAnalyticsResponse(buildP0B1FraudDecisionHold(...))` contract without accepting an opaque wrapper.

The final re-review identified one additional false-positive branch: the fallback that recognized `map` methods declared in a TypeScript standard-library file also admitted typed-array `map` methods. B-G2 now accepts that fallback only when the declaration belongs to the standard-library `Array` interface. A `Uint8Array.map(...)` callback that returns a canonical-looking object is explicitly covered as **not** producing a canonical hold. The existing compiler-typed array/tuple path remains intact.

## Required regression proof

The B-G2 Node fixture suite must prove all of the following:

- A canonical consumer is still discovered through a direct imported shorthand namespace and through a direct shorthand procedure.
- An unresolved namespace router fails closed.
- An `appRouter` namespace spread fails closed.
- A namespace-router procedure spread fails closed.
- `appRouter` namespace methods and namespace-router procedure methods fail closed.
- An untrusted namespace wrapper that receives a direct object argument fails closed.
- An opaque procedure wrapper, including one supplied a canonical-looking argument, fails closed.
- A standard `Array.map` hold projection is discovered, while a local `map` lookalike fails closed.
- A standard-library typed-array `map` callback is not misclassified as an `Array.map` hold projection.
- A same-spelling local helper without a canonical result is not misclassified as a hold.
- A newly exported but unapproved procedure builder in a trusted module fails closed.
- An unapproved fluent method following an approved procedure builder fails closed.

The existing manifest comparison must continue to pass unchanged at 73 exact fingerprints. That proves B-G2 did not conceal or relabel the current reviewed consumer set.

The final focused remediation matrix passed with 32 B-G2 resolver and manifest tests. The live inventory also passed at 73 exact consumer fingerprints after the tighter router, trusted-builder, opaque-call, and typed-array rules were enabled.

## Final review and validation

The final independent adversarial re-review **APPROVED** the Array-only remediation. It confirmed that ordinary `Array.map` remains discoverable, `Uint8Array.map` is not accepted, local lookalikes are rejected, opaque arguments cannot produce a false canonical classification, and the trusted fluent-builder surface remains exactly `.input(...)` and `.use(...)`.

Merge-readiness evidence on the final source:

- Guarded serial/sharded suite: **628 eligible test files**, **63 shards**, **0 failed shards**.
- Resolver fixture suite: **32/32** passing; live exact fingerprint inventory: **73**.
- B-G0 boundary suite: **18/18** passing; current registration remains **9 query boundaries, 4 mutation boundaries, and 1 exported server route**.
- Client Vite production build and externalized server bundle completed successfully.
- `git diff --check` and Prettier checks are clean. Existing unrelated Vite chunk-size and duplicate-key warnings remain baseline observations, not B-G2 changes.

## Scope boundaries

B-G2 is restricted to the B-G1 resolver and its Node regression suite. It deliberately does not change browser components, server procedures, the 73-entry manifest, B-G0 named boundary registrations, or the deferred Group B typecheck exception design.

B-R2-C and B-T1 remain separately approved follow-ups. They will address the final integration audit’s live workflow-containment and executable-runtime-proof gaps after this detector has been hardened.

## References

[1]: ../../scripts/ci/verify-p0-b1-typed-hold-consumers.mjs "Automatic P0-B1 fraud-hold consumer resolver"
[2]: ../../scripts/ci/verify-p0-b1-typed-hold-consumers.test.mjs "Resolver fail-closed regression fixtures"
[3]: ../../scripts/ci/p0-b1-typed-hold-consumer-manifest.json "Exact approved fraud-hold consumer fingerprints"
[4]: ./p0-b1-auto-hold-consumer-enforcement-2026-09-26.md "B-G1 automatic fraud-hold consumer enforcement record"
