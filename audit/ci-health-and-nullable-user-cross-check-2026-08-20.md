# KINGA CI Health and Nullable-User Cross-Check

**Date:** 20 August 2026  
**Scope:** Read-only source and test-run audit after the recent merged work. No code, schema, migration, DDL, data, or business-rule changes.

## Executive Result

KINGA is **not yet fully green** under the complete `pnpm test` command. The executed run completed in 133.18 seconds with **288 passing test files, 12 failing test files, 27 failing tests, 2 skipped tests, and one unexpected Vitest worker exit**.[1]

This is materially more informative than a compile-only signal: the run exercised 8,602 passing tests, including real database-backed suites. It does not establish release readiness because deterministic test failures remain and the test worker was interrupted.

## Full Test Run Baseline

| Metric | Observed result |
|---|---:|
| Test files | 288 passed; 12 failed; 301 total |
| Individual tests | 8,602 passed; 27 failed; 2 skipped; 8,633 total |
| Unhandled runner errors | 1 — Vitest worker exited unexpectedly |
| Elapsed duration | 133.18 seconds |
| Type check | Did not complete in the 180-second bounded run; exited with code 143 and produced no diagnostic output before termination. |

## Failure Groups

| Group | Failed tests | Technical interpretation | Business decision required? |
|---|---:|---|---|
| RTV/write-off threshold expectations | 6 | Tests assert a **65%** economic write-off threshold while the current executable constant is **70%**. This is a real policy/code-versus-test mismatch. | **Yes.** The approved 70% policy must be explicitly reconciled with legacy tests and any dependent narrative. |
| Portal conformance contract | 5 | Route/content assertions no longer match the current client/agency/payment portal implementation. | No for diagnosis; remediation can be scoped as navigation-contract repair. |
| Tenant-isolation fixtures | 3 | Two assertions receive `Claim not found`; one assignment insert fails. These need fixture/seed alignment and must be re-run before any safety conclusion. | No, unless a real authority regression is confirmed. |
| Dataset capture activation | 3 | Claim-completion dataset-capture expectations do not complete in the current suite. | No for diagnosis; may require data-pipeline remediation. |
| Evidence/document health gating | 2 | The expected no-evidence block behavior differs from current output. | Potentially. Confirm the intended “warn, do not block an assessment” policy before changing behavior. |
| Isolated operational acceptance | 2 | Upload-to-report and claim-to-report acceptance fixtures fail. | No for diagnosis; acceptance fixture repair is technically scoped. |
| Static source expectation drift | 4 | Stage-3 PDF rendering, Stage-5 valuation wording, Stage-9 document category, and search-performance tests assert source patterns no longer present. | No for source-test repair unless a behavior regression is proven. |
| Auth re-sync guard | 1 | Deleted-user fail-closed test fails. | **Security-sensitive.** Requires a dedicated factual trace before any change. |
| PII console-warning assertion | 1 | A static audit assertion does not match current logging source. | No; test/source review only. |

The detailed failing-test names are preserved in the generated execution artifact.[2]

## Nullable `ctx.user` Cross-Check

The exact `User | null` contract remains localized to the request context and deliberately nullable RBAC helper interfaces:

| Location | Finding | Assessment |
|---|---|---|
| `server/_core/context.ts` | Declares `user: User | null` and initializes it to `null` before session resolution. | **Expected public-context contract.** |
| `server/rbac.ts` | Accepts `User | null | undefined` in authorization helper interfaces. | **Expected defensive authorization API.** |
| `server/_core/trpc.ts` | Checks `!ctx.user` before privileged access and narrows the user type in protected middleware. | **Expected narrowing boundary.** |
| Protected routers | Many direct `ctx.user.id`, `.role`, and `.tenantId` reads remain. | **Manual-review candidates, not compile proof of a nullable-user defect**, because protected procedures are intended to receive narrowed context. |

The source scan found **no additional explicit `ctx.user: User | null` declarations** in feature routers. Therefore, the same nullable-user type pattern is not visibly duplicated across routers after the current merges.

This is not a blanket authorization certification. The scan also surfaced tenant-pattern candidates such as `ctx.user.tenantId ?? ""` in `asset-passport.ts`; these are **tenant-authority concerns**, not evidence that `ctx.user` itself is wrongly nullable in protected router context. They should remain in the standing tenant-isolation remediation stream.

## What This Means for the Recent Nullable-User Fixes

The targeted fix pattern appears to have improved local type safety: the explicit nullable type remains at the framework boundary rather than spreading into router declarations. However, the full type check did not finish, so this audit cannot claim the repository has no compile-time nullability errors. The next reliable step is to run type checking in an environment with sufficient memory/time budget, then classify errors by source and recency.

## Recommended Next Sequence (No Change in This PR)

1. Treat the **RTV 65% versus 70% mismatch** as a policy-alignment package, not a test-only cleanup, because it affects write-off recommendations and narrative.
2. Independently trace the **deleted-user re-sync guard** failure because it is security-sensitive.
3. Repair portal, dataset, acceptance, and static source tests only after confirming whether each reflects a genuine behavior regression or an outdated fixture/structural assertion.
4. Re-run the full suite with constrained worker parallelism or a higher-memory CI environment to eliminate the worker-exit ambiguity before declaring CI health.

## References

[1] `pnpm test` execution log, 20 August 2026.

[2] Full failure-name extraction from the same execution log, 20 August 2026.

[3] [`server/_core/context.ts`](../server/_core/context.ts), [`server/_core/trpc.ts`](../server/_core/trpc.ts), and [`server/rbac.ts`](../server/rbac.ts)
