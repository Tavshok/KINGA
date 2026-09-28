# P0-B1 Automatic Fraud-Hold Consumer Enforcement (B-G1)

**Status:** validated and ready for stacked review
**Date:** 2026-09-26
**Branch:** `fix/p0-b1-auto-hold-consumer-enforcement`
**Base:** `60dbcb61` — merged B-G0 client fraud-hold boundary

## Purpose

B-G0 correctly enforces direct discriminator, hold, value, and canonical-render bindings for its named live boundaries. Its target registry is intentionally exact and contains four browser components plus one server route. It does not discover a newly added fraud-hold client consumer automatically.

B-G1 closes that forward-coverage gap without claiming that every current consumer is already structurally remediated. It creates a Quality Gate inventory of every client tRPC hook whose result can carry the canonical `FRAUD_DECISION_WITHHELD` contract. The gate fails on any unreviewed addition, deletion, move, hook-kind change, procedure change, or detection-mode change.

## Detection model

The AST inventory uses both of the following independent signals:

1. **Typed response detection.** It scans a hook’s `data` type for the canonical literal status. This catches direct and nested typed contracts.
2. **Resolved server-procedure detection.** It proves the exported `server/routers.ts` `appRouter` binding is the one named by the exported `AppRouter` alias imported into `client/src/lib/trpc.ts`. It follows imported router objects, resolves aliases to the approved canonical helper symbols, and recursively evaluates locally returned canonical hold shapes. This catches legacy `any` response contracts, including Executive Alerts, that a type-only scan cannot prove.

The resolver supports ordinary and computed literal property access (for example `trpc["namespace"]["procedure"].useQuery()`) only when the entire chain resolves to the exported `trpc` symbol. A dynamic namespace or procedure fails closed rather than bypassing inventory.

At the reviewed candidate, the committed manifest contains **73 exact fingerprints**. Each fingerprint contains the repository-relative file path, source line and column, query-or-mutation kind, normalized precise tRPC callee, detection mode, and SHA-256 digest. There are no wildcards.

> A consumer’s presence in this inventory does not authorize it to render, route, score, submit, persist, notify, or publish a fraud conclusion. It makes the consumer reviewable and prevents an unreviewed future consumer from silently entering the client bundle.

## Quality Gate behavior

`verify-p0-b1-typed-hold-consumers.mjs` regenerates the current inventory from the checked-out source and compares it exactly to the committed manifest. It fails if any approved fingerprint disappears or changes and fails if any new client tRPC consumer is linked to a canonical fraud hold by either detection signal. Before comparison, it rejects duplicate entries, extra/missing fields, invalid shapes, and any fingerprint that does not recompute from its path, location, hook kind, callee, and detection mode. A local same-named helper cannot satisfy canonical detection; an aliased import of an approved helper can.

The Quality Gate’s pinned regression block runs this test alongside the B-G0 named-boundary test, stacked-comparator test, and trigger-scope verifier. The trigger verifier also fails if the automatic inventory test is removed from hosted validation.

## Relation to B-R2 and deferred work

B-R2 will register every confirmed live held-action boundary in the stricter B-G0 named-boundary verifier. The automatic inventory then prevents a sixth future consumer from appearing without an explicit, reviewable manifest change and a corresponding decision on whether it belongs in the named structural guard, a narrowly reviewed deferral, or an independent package.

The existing Tier-2/display and Group B deferrals remain intentionally outside B-G1 remediation. Their current fingerprints are inventoried, not treated as safe. The separately approved exact typecheck exception manifest remains blocked until all approved runtime-risk packages are complete and its safe set is re-derived.

Physics holds remain a distinct P0-A-3 concern. This package discovers only canonical **P0-B1 fraud** hold consumers and does not claim physics-hold enforcement.

## Validation to date

The first adversarial review correctly **BLOCKed** a textual implementation: an aliased genuine helper and transitive return shape were missed, local same-name helper decoys were accepted, an unexported `appRouter` could be used, and a casted/computed tRPC path was missed. No source was published from that blocked design.

The first re-review correctly **BLOCKed** a second identity gap: a client could import a differently named `typeof appRouter` alias and still pass the semantic-router comparison. The remediated resolver now requires the `createTRPCReact<…>()` generic to resolve to the exact exported `AppRouter` declaration in `server/routers.ts`, not merely to another type alias for the same value. The fixture suite proves rejection of this alias substitution.

The final re-review correctly **BLOCKed** a dynamic-key gap: a derived namespace such as `const test = trpc.test; test[procedure].useQuery()` could silently evade discovery. The resolver now traces property and element access through variable initializers to establish the exported `trpc` root. A hook derived from that root must resolve to literal namespace and procedure names or the verifier fails closed. The fixture suite proves rejection of this exact derived-namespace attack.

The final re-review also correctly **BLOCKed** two integrity gaps: a destructured namespace could evade the `trpc` root trace, and a manifest could alter fields while retaining a stale fingerprint. The resolver now traces `BindingElement` declarations back to their destructuring initializer. The comparator recomputes each SHA-256 fingerprint and rejects duplicates before it compares membership. The fixture suite proves rejection of a dynamic procedure key after both derived and destructured namespace aliases, stale manifest field edits, and duplicate fingerprints.

The final audit correctly **BLOCKed** incomplete regression coverage for the manifest schema: the verifier rejected extra and missing fields, but the tests had not demonstrated it. The suite now includes both malformed-entry cases, so removal or regression of the exact seven-field schema check becomes a hosted failure.

The remediated inventory resolves both typed and legacy-`any` consumers. The current scan found 73 exact hooks: 36 by both signals, 36 by server-procedure resolution only, and 1 by typed response only. Its Node regression suite proves exact-manifest acceptance; failure on an unreviewed consumer; failure on a deleted or moved consumer; discovery of B-G0 and B-R2 examples; discovery of the legacy untyped Executive Alerts route; discovery through an imported router plus aliased approved helper and casted/computed literal tRPC path; discovery of a transitive local canonical return; rejection of a same-spelling local helper decoy; rejection of an unexported router root; rejection of a same-router lookalike type alias; rejection of dynamic tRPC keys directly and after derived or destructured namespace aliases; rejection of stale field edits, duplicate fingerprints, and extra or missing manifest fields; and failure if hosted invocation is removed.

The final adversarial re-review **APPROVED** after all four review blocker classes were remediated and their attack fixtures passed.

## Merge-readiness validation

- **Exact structural checks:** the inventory verifier reports 73 exact fingerprints; the typed-inventory, B-G0 boundary, and Quality Gate trigger suites passed 39/39 Node tests after the final remediations.
- **Full guarded suite:** 627 eligible test files completed in 63 serial guarded `kinga_ci_test` shards with **zero failed shards**. The runner excludes only the established non-unit test paths named in its saved manifest; it does not substitute raw Vitest or a non-isolated database runner.
- **Production build:** Vite and the server esbuild bundle completed successfully. Existing Vite warnings remain outside this package: a duplicate `border` key in `BulkValuation.tsx` and the established large-chunk warnings.
- **TypeScript delta:** direct `tsc --noEmit --incremental false` exits nonzero on inherited repository diagnostics (1,114 parseable diagnostics in this environment). It has **zero diagnostics on B-G1’s changed `.mjs`/workflow/manifest paths**. This package does not claim global TypeScript cleanliness.
- **Hygiene:** Prettier checks passed for changed source, test, workflow, manifest, and record files; `git diff --check` is clean.

## References

[1]: ../../scripts/ci/verify-p0-b1-typed-hold-consumers.mjs "Automatic exact fraud-hold client-consumer inventory"
[2]: ../../scripts/ci/p0-b1-typed-hold-consumer-manifest.json "Committed exact current consumer fingerprints"
[3]: ../../scripts/ci/verify-p0-b1-client-hold-boundary.mjs "B-G0 named structural boundary verifier"
[4]: ../../shared/p0FraudDecisionHoldPresentation.ts "Canonical P0-B1 fraud-hold contract"
