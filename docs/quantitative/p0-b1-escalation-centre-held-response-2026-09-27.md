# P0-B1 Escalation Centre Held-Response Containment

**Validation date:** 27 September 2026
**Integration base:** `feat/p0-b1-composed-fraud-boundary-final` at `15d43245de9d19b126b23b407a1e24e75e957ae1`
**Status:** **APPROVED — merge-ready pending PR review**

## Defect

`EscalationCentre` is a live child of the Claims Manager Command Centre. Its sole query, `claims.getEscalations`, is an insurer-domain route that currently returns only the canonical P0-B1 `FRAUD_DECISION_WITHHELD` response. Before this package, the component cast that response to an array and processed raw fraud-level fields. Depending on evaluation, it could throw or render the false reassurance **“All claims are progressing normally.”**

## Containment

The component now performs the required direct sequence:

1. bind `trpc.claims.getEscalations.useQuery`;
2. pass only its `.data` through `discriminateP0B1FraudDecisionResponse`;
3. bind `.hold` and `.value` directly;
4. terminally return `<P0FraudValidationHold>` on the exact canonical hold; and only then
5. default, filter, and render the available value.

The browser may no longer cast, filter, classify, count, or render a withheld escalation response. The existing normal-path category UI remains unchanged for a future genuinely available, qualified response.

## Structural enforcement

B-G0 now registers the Escalation Centre as a 13th query boundary. The target-specific enforcement requires an exact top-level terminal hold `if` before any use of the query/response/value path. It accepts only four exact pre-hold bindings: the direct named query call without callback bodies, the direct discriminator, the direct `.hold` binding, and the direct `.value` binding.

The B-G0 adversarial fixtures reject all of the following before the hold:

- replacing the direct hold binding with `null`;
- disabling the hold condition and leaving a live path;
- direct array cast/filter processing;
- an immediately invoked callback that reads the response value;
- destructured, bracketed, or aliased response values;
- an ordinary query-option callback such as `refetchInterval` that can inspect query data; and
- moving the hold to an inline final JSX conditional after pre-hold processing.

B-G1/B-G2 exact inventory remains at **78** fingerprints. The Escalation Centre entry is regenerated from current source and continues to fail on any moved, removed, extra, duplicate, or altered fingerprint.

## Adversarial review history

The initial review confirmed the runtime fix but blocked the proposed structural rule four times before approval:

| Review finding                                                                                                                                                                | Correction                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The direct-terminal check allowed a top-level pre-hold array cast/filter.                                                                                                     | Added target-specific pre-hold value scanning and a direct array-operation fixture.                                                                                                                                        |
| The scan skipped callback bodies, permitting an invoked callback.                                                                                                             | Traversal now descends into callback bodies; an IIFE fixture was added.                                                                                                                                                    |
| Destructuring, bracket access, and aliases evaded property-only matching.                                                                                                     | Any pre-hold reference to the protected query, response, or value identifiers now fails outside exact approved bindings; three alias fixtures were added.                                                                  |
| The whole approved query declaration bypassed scanning through callback-valued query options; an inline final JSX hold could also bypass the scan when no early hold existed. | Approved bindings are now structurally exact and query initializers may not contain callback bodies. A direct early terminal hold is mandatory for this strict target; query-option and inline-render fixtures were added. |

The final fresh adversarial review **APPROVED** the current source and confirmed that the real component satisfies the strict sequence and the fixture suite rejects the identified ordinary AST evasion paths.

## Validation evidence

| Check                                        | Result                                                                                                                         | Notes                                                                                                                                                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Escalation Centre SSR runtime proof          | **2/2 passed**                                                                                                                 | Renders the real component with canonical holds; asserts hold guidance and absence of fraud rows, escalation output, and all-clear reassurance.                                                                                                      |
| Independent bypass regression                | **5/5 passed**                                                                                                                 | Existing independent publication hardening proof remains green.                                                                                                                                                                                      |
| B-G0 verifier and adversarial Node tests     | **13 query boundaries / 9 mutation boundaries / one exported route; 28/28 passed**                                             | Includes the eight Escalation-specific adversarial scenarios described above.                                                                                                                                                                        |
| B-G1/B-G2 exact inventory and resolver tests | **78 exact fingerprints; 32/32 passed**                                                                                        | Manifest updated only for the current Escalation hook source location/fingerprint.                                                                                                                                                                   |
| Guarded merge-readiness suite                | **631 eligible files / 64 serial shards / 630 passed + 1 skipped files / 9,925 passed + 4 skipped tests / zero failed shards** | The first ad hoc runner stopped after one green shard because its own Bash `PIPESTATUS` capture was invalid under `set -u`; no test failure occurred. The corrected no-pipeline runner restarted from scratch and completed every shard with exit 0. |
| Production build                             | **Passed**                                                                                                                     | Direct `vite build` and `esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist` succeeded. Inherited warnings only: duplicate `border` key in `BulkValuation.tsx` and large chunks.                  |
| TypeScript                                   | **Global TSC remains nonzero from inherited diagnostics**                                                                      | No diagnostics matched `EscalationCentre`, the new runtime test, or B-G0 files. This is not a global type-clean claim.                                                                                                                               |
| Hygiene                                      | **Passed**                                                                                                                     | `git diff --check` clean. The legacy component was reconstructed after formatting review to preserve a narrow 17-addition/2-removal semantic diff rather than broad Prettier churn.                                                                  |

## Files

- `client/src/components/EscalationCentre.tsx` — terminal canonical hold handling.
- `scripts/ci/verify-p0-b1-client-hold-boundary.mjs` — B-G0 target and strict pre-hold enforcement.
- `scripts/ci/verify-p0-b1-client-hold-boundary.test.mjs` — B-G0 adversarial fixtures.
- `scripts/ci/p0-b1-typed-hold-consumer-manifest.json` — regenerated exact Escalation fingerprint.
- `server/p0B1EscalationCentreRuntime.test.ts` — executable browser runtime proof.

## Next action

Open a narrow stacked PR against `feat/p0-b1-composed-fraud-boundary-final` after merge-readiness completes. Do not merge without explicit owner approval. The next separately scoped package remains AI Decision-Action Actor Authority and Payment Command Actor Authority; do not fold it into this package.
