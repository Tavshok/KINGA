# P0-B1 Payment Command Actor Authority

**Package:** P0-B1 Payment Command Actor Authority
**Validation date:** 27 September 2026
**Branch:** `fix/p0-b1-payment-command-actor-authority`
**Base:** `feat/p0-b1-composed-fraud-boundary-final` at `15d43245de9d19b126b23b407a1e24e75e957ae1`
**Status:** **APPROVED by final independent adversarial review; merge-ready pending PR and hosted Quality Gate**

## Purpose

Final composed validation identified that `claims.authorizePayment` returned the canonical P0-B1 fraud hold after session and tenant-owned claim checks without first confirming that the caller was permitted to execute the payment transition. An unauthorized same-tenant actor could therefore receive a hold instead of `FORBIDDEN`, disclosing resource existence and misrepresenting command authority.

This package introduces the narrow actor boundary required for the existing workflow transition. It does not change the payment workflow, data, schema, notification behavior, or other claim commands.

## Exact authority policy

The workflow engine defines the transition from `financial_decision` to `payment_authorized` as available **only** to insurer roles:

- `claims_manager`
- `executive`

The route now requires both conditions:

1. top-level user role is exactly `insurer`; and
2. `insurerRole` is exactly one of those two transition roles.

This deliberately denies insurer administrators, risk managers, claims processors, internal/external assessors, claimants, unrecognized roles, `admin`, and `platform_super_admin` identities — even if a platform identity carries an otherwise permitted `insurerRole`. Platform and insurer role fields are independent persisted values, so the top-level role test is necessary for a fail-closed command boundary.

## Runtime order

The actual `authorizePayment` sequence is:

1. authenticated session and global restricted-agency identity denial from `protectedProcedure`;
2. local `assertRestrictedAgencyAssistedCapability(ctx.user, "payment_authority")`;
3. `requirePaymentCommandActor(ctx)`;
4. `requireTenantScopedClaim()` tenant/resource lookup;
5. canonical P0-B1 fraud hold;
6. only if policy is later changed to allow continuation: dynamic database import, workflow update, audit, and notification.

Thus the existing lower-trust claimant denial remains independent and precedes the payment actor decision. Ineligible actors do not receive a claim lookup, hold, database capability, payment action, audit event, or notification. Authorized actors retain the approved tenant/resource-before-hold ordering, and missing/foreign claims remain non-disclosing resource denials.

## Real lower-trust boundary proof

The initial adversarial review raised a valid concern about a mock that could have hidden the local agency capability boundary. Current source confirms that `assertRestrictedAgencyAssistedCapability` is genuinely exported by `server/agency/agencyAssistedClaimantIdentity.ts`; the implementation denies `payment_authority` for `isUnregisteredClaimant` identities.

The runtime test no longer mocks that agency module and does not fabricate the function. It now imports the real router and real agency capability implementation while mocking only database and post-hold capability dependencies used to prove non-invocation. `server/agency/agencyAssistedClaimantCapability.test.ts` is included in the focused matrix and exercises the real function directly.

## Tests and adversarial review

`server/p0B1DecisionActionRuntimeProof.test.ts` uses `claimsRouter.createCaller()`, executing actual tRPC procedure and protected middleware behavior. It proves:

- both allowed insurer roles reach the existing tenant-owned canonical-hold boundary;
- non-authorized insurer roles are denied before claim lookup, hold, database, audit, or notification;
- `admin` and `platform_super_admin` identities are denied even when paired with each allowed insurer role;
- an ordinary claimant is denied before lookup/hold;
- a restricted agency-assisted claimant is denied by global middleware before actor or resource resolution;
- missing and foreign claims for an authorized claims manager deny before hold and protected capabilities.

The final independent adversarial review returned **APPROVE**. It verified the exact workflow policy, actual agency export/import, runtime order, absence of mock masking, coverage, narrow scope, and clean diff hygiene.

## Validation evidence

| Check                        | Result                                                                                                                                                                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused guarded matrix       | 5 files / 56 tests passed: real agency capability, payment runtime proof, payment source-order regression, AI decision source-order regression, and held-action browser containment.                                                                  |
| B-G0 fixed-boundary guard    | Passed: 12 query boundaries, 9 mutation boundaries, one exported server route; 21/21 Node regressions.                                                                                                                                                |
| B-G1/B-G2 consumer inventory | Passed: 78 exact client-hook fingerprints.                                                                                                                                                                                                            |
| Guarded full suite           | 630 eligible files in 63 serial shards; 0 failed shards; 629 passed / 1 skipped files; 9,936 passed / 4 skipped tests. Every shard used `scripts/run-isolated-vitest.ts` against the guarded disposable CI database.                                  |
| Production build             | Direct `vite build` and bundled `esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist` succeeded. Inherited warnings only: duplicate `border` key in `BulkValuation.tsx` and large generated chunks. |
| TypeScript                   | Global `tsc --noEmit` remains nonzero from inherited diagnostics. It reported **no diagnostics** at the changed payment-route or package-test lines. This is not a global TypeScript-clean claim.                                                     |
| Diff hygiene                 | `git diff --check` clean. The legacy `claims-core.ts` router fails current Prettier check at baseline; no broad formatter rewrite was applied.                                                                                                        |

No raw Vitest invocation, live database, staging/production access, schema or data change, configuration change, or deployment occurred.
