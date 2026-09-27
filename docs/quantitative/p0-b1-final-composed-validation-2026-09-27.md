# P0-B1 Final Composed Validation — Blocked

**Validation date:** 27 September 2026

**Integration lineage:** `feat/p0-b1-composed-fraud-boundary-final` at `15d43245de9d19b126b23b407a1e24e75e957ae1`
**Status:** **BLOCKED — no integration PR to `main` opened**

## Decision

The final composed validation was restarted from scratch only after B-G0, B-G1, B-G2, B-R2, B-R2-C, and B-T1 were all confirmed merged into the integration lineage. The execution checks are genuinely green, but two independent adversarial reviews found live authority/publication/containment defects outside the guarded paths.

> A green test suite is necessary but not sufficient. Because these findings leave current production code able to publish, classify, act on, crash on, or incorrectly reassure from withheld/raw fraud data, the P0-B1 integration PR must not open until they are resolved as narrow independently reviewed packages.

No production, staging, database, schema, data, configuration, deployment, or integration-branch code change was made during this validation.

## Merged baseline verified

| Package | Verification                                                           |
| ------- | ---------------------------------------------------------------------- |
| B-G0    | Merged PR #163 (`60dbcb61`) — fixed client hold boundary guard         |
| B-G1    | Merged PR #164 (`da01e81c`) — exact client hold-consumer inventory     |
| B-R2    | Merged PR #165 (`9a7f1004`) — held browser action containment          |
| B-G2    | Merged PR #166 (`8086e17f`) — fail-closed consumer resolver            |
| B-R2-C  | Merged PR #167 (`ca17e1b5`) — decision/action authority hardening      |
| B-T1    | Merged PR #168 (`15d43245`) — executable decision-action runtime proof |

## Validation that passed

| Check                                    | Result                                                                                                                     | Limitation                                                                                                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-G0 fixed-boundary verifier             | 12 query boundaries, 9 mutation boundaries, one exported route verified; 21/21 Node regressions passed                     | The fixed target list did not include the raw paths discovered below.                                                                             |
| B-G1/B-G2 resolver and manifest verifier | 78 exact fingerprints; 32/32 Node regressions passed                                                                       | Inventory discovers declared hold-capable hooks, but it did not prove every consumer safely discriminates the hold or expose raw non-hold routes. |
| Final focused authority/hold matrix      | 19 test files / 155 tests passed under the guarded isolated runner                                                         | Selected suites did not mount the two newly found live consumer paths or exercise same-tenant ineligible actors on all command routes.            |
| Final guarded full suite                 | 630 eligible files / 63 serial shards / 0 failed shards; 629 passed / 1 skipped test files; 9,923 passed / 4 skipped tests | Full green result is real, but its assertions do not cover the defects below.                                                                     |
| Production build                         | Direct `vite build` and bundled `esbuild server/_core/index.ts` completed                                                  | Inherited duplicate `border` key warning in `BulkValuation.tsx` and large-chunk warnings only.                                                    |
| TypeScript                               | Global `tsc --noEmit` remains nonzero with 1,082 inherited diagnostics; no integration-specific diagnostic matches         | This is not a global TypeScript-clean claim.                                                                                                      |
| Hygiene                                  | Clean integration worktree; `git diff --check` clean                                                                       | No remediation changes were made.                                                                                                                 |

## Independent review result: required narrow packages

The findings are separated deliberately. No remediation belongs in the final integration branch until independently implemented and reviewed.

### 1. AI decision-action actor authority — **blocking**

**Observed source:** `server/routers/ai-assessments-core.ts`, the ten routes `saveSnapshot`, `getLatestSnapshot`, `replayDecision`, `getLifecycle`, `markReviewed`, `finaliseDecision`, `lockDecision`, `getAuditLog`, `getReplayLogs`, and `getSnapshots`.

These routes use `protectedProcedure`, then `requireGovernedTenantClaim`, then return the canonical P0-B1 hold. `protectedProcedure` authenticates and denies restricted agency-assisted identities, but it does not establish an insurer decision role, assignment, or read/write decision capability. A same-tenant authenticated actor that lacks decision authority can resolve the claim and receive the hold rather than a capability denial.

**Why this is blocking:** the current hold stops downstream protected work, but it is being used as the effective access-control result for decision lifecycle reads/writes. If P0-B1 policy changes, the path has no intervening actor grant before it reaches protected decision work.

**Smallest package:** `P0-B1 AI Decision-Action Actor Authority`.

1. Define one narrow server-side decision read/write capability boundary, using the established insurer role/assignment policy rather than browser-only role checks.
2. Place it before governed tenant/resource resolution and before the canonical hold on all ten routes.
3. Add real-caller negative tests for same-tenant ineligible actors, proving `FORBIDDEN` precedes resource lookup, hold, dynamic imports, and all protected capabilities.
4. Retain current authorized tenant/resource-before-hold behavior.

**Indicative effort:** 2–3 days implementation, adversarial review, focused validation; full suite only at merge readiness.

### 2. Payment command actor authority and precedence — **blocking**

**Observed source:** `server/routers/claims-core.ts`, `claims.authorizePayment`.

The route calls `assertRestrictedAgencyAssistedCapability(ctx.user, "payment_authority")`, then resolves a tenant-owned claim, then returns the P0-B1 hold. The helper is a lower-trust _denial_ for `isUnregisteredClaimant`; it is not a payment-authority grant. An ordinary same-tenant actor without financial/claims authority is not denied by that helper.

**Why this is blocking:** a P0-B1 hold currently prevents payment work, but a policy change would leave the payment transition, audit, and claimant notification reachable without a financial-command authority predicate.

**Smallest package:** `P0-B1 Payment Command Actor Authority`.

1. Define an explicit approved payment-command role/capability policy before tenant/resource resolution and before the hold.
2. Keep the restricted-agency denial as an independent lower-trust protection.
3. Choose and document the precedence for a restricted caller against a missing/foreign claim; pin it with tests rather than implying a rule that is not currently tested.
4. Add same-tenant ineligible, restricted, missing, and foreign cases proving no claim lookup, hold, DB handle, audit, or notification runs when the applicable prior gate denies.

**Indicative effort:** 1–2 days implementation and adversarial review; may share a policy helper with Package 1 only if the review proves the same authority policy applies without weakening either command boundary.

### 3. Risk Manager raw fraud source and held-command containment — **blocking**

**Observed source:**

- Server raw routes: `claims.byStatus`, `claims.getActiveClaims`, and `claims.getFinancialDecisionQueue` in `server/routers/claims-core.ts` return stored `fraudRiskScore` / `fraudRiskLevel` without P0-B1 projection or hold.
- Client: `client/src/pages/RiskManagerDashboard.tsx` directly classifies, counts, color-codes, displays, and routes from those raw values. Separate held `getRiskPortfolioAnalytics` / `getEscalations` queries cannot guarantee the raw concurrent queries do not arrive or render first, and direct tRPC callers bypass the page entirely.
- Held command: `claims.approveClaim` throws the canonical hold as a tRPC `PRECONDITION_FAILED` error, while `RiskManagerDashboard` converts it to a generic error toast and keeps approval workflow controls rendered.

**Why this is blocking:** this is a live raw-fraud publication and decision/routing path, plus a non-terminal held-action response. It is not merely a display-polish issue.

**Smallest package:** `P0-B1 Risk Manager Data and Command Boundary`.

1. Add explicit actor authority to the direct server routes and command.
2. Replace raw fraud projections with an independently supported operational projection or canonical hold; remove client fraud score/level calculations, risk labels, counts, colors, and raw-fraud routing.
3. Return a discriminable canonical held command result (or approved typed equivalent) for `approveClaim` and make the dashboard terminally render `P0FraudValidationHold` without toast/action/workflow continuation.
4. Extend B-G0 to every affected Risk Manager query/mutation boundary and add B-G1 plus executable browser tests for raw-response early arrival and held mutation behavior.

**Indicative effort:** 3–5 days implementation and adversarial review.

### 4. Escalation Centre direct-held response containment — **blocking**

**Observed source:** `server/routers/claims-core.ts` returns `buildP0B1FraudOutputHold()` from `claims.getEscalations`. `client/src/components/EscalationCentre.tsx` casts the result to `any[]` and immediately calls `rows.filter(...)`.

**Why this is blocking:** a direct canonical hold crashes (`rows.filter is not a function`) rather than terminally rendering `P0FraudValidationHold`. If later transformed to an empty array, the component instead says “No active escalations” and “All claims are progressing normally,” which would be false reassurance.

**Why B-G2 did not stop it:** the manifest correctly records the hook, but fingerprint presence does not prove that a consumer discriminates the hold and terminally renders it.

**Smallest package:** `P0-B1 Escalation Centre Held-Response Containment`.

1. Discriminate the direct hold at the query boundary.
2. Return `P0FraudValidationHold` before any array operation or reassurance rendering.
3. Add executable render coverage with `buildP0B1FraudOutputHold()`.
4. Scope a separate structural follow-up that makes B-G2 distinguish consumer inventory from verified hold handling; do not silently broaden this component package into all 78 consumers.

**Indicative effort:** 0.5–1 day implementation and adversarial review.

### 5. Claims Processor raw-source decoy — **blocking**

**Observed source:** `client/src/pages/ClaimsProcessorDashboard.tsx` invokes `claims.getProcessorQueue` (a B-G2-known hold-capable hook) but does not use its result. The rendered claims instead come from `workflowQueries.getClaimsByStatus`, which uses `select()` in `server/routers/workflow-queries.ts` and returns full claim rows including stored fraud fields. The dashboard renders `fraudRiskScore` and High/Medium/Low labels and can render “All clear” without a P0-B1 branch.

**Why this is blocking:** a safe-looking, inventoried hook creates a false appearance of containment while the live screen consumes a parallel raw route. This is a live publication/reassurance path, not a dormant source reference.

**Smallest package:** `P0-B1 Claims Processor Raw-Source Removal`.

1. Remove the unused decoy hook or make an approved projection the sole rendered source.
2. Replace the raw `workflowQueries.getClaimsByStatus` response for this surface with an allowlisted non-fraud projection and canonical held outcome where applicable.
3. Remove score/risk rendering and ensure reassurance does not depend on withheld fraud authority.
4. Add browser regression coverage with raw-fraud sentinels and a hold; scope a separate scanner/guard enhancement for raw fraud source discovery if it extends beyond this surface.

**Indicative effort:** 2–3 days implementation and adversarial review.

## Structural follow-up to scope separately

B-G1/B-G2 currently prove an exact inventory of potential canonical-hold consumers. They do **not** prove each entry actually consumes/discriminates a hold, and they do not identify non-hold routes that project stored fraud fields into browser consumers. A follow-up structural proposal should define whether the next layer should:

- require a verified discriminator/terminal renderer for every manifest entry; and/or
- fail closed on direct browser uses of raw P0-B1 fraud fields unless a reviewed allowlist projection is used.

This requires its own source census and approval. It must not be silently added to any component remediation package.

## Next action

Do not open the P0-B1 integration PR to `main`. Await owner choice on package ordering and authority-policy decisions. The safest severity-first sequence is:

1. Risk Manager Data and Command Boundary;
2. Claims Processor Raw-Source Removal;
3. AI Decision-Action Actor Authority and Payment Command Actor Authority, after confirming whether they share a policy helper or must stay isolated;
4. Escalation Centre Held-Response Containment;
5. separately scoped B-G3 structural consumer-handling/raw-source guard.

Each package must receive independent adversarial review. After all authorized blockers merge, restart final composed validation from scratch again before opening the integration PR.
