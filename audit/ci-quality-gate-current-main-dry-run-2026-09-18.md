# KINGA Quality Gate — Historical Current-Main Dry Runs

This reconciled record preserves two distinct 18 September 2026 dry runs. The first predates the CI remediation work and records a red suite. The second follows that work and records the later green result. Neither record is overwritten.

## Earlier dry run — red suite before CI reconciliation

# KINGA Quality Gate: Current-Main Dry Run

**Date:** 18 September 2026
**Commit tested:** `ab1adcc11b564e131dc1c98bb8f99f7566d6c1e0` (current GitHub `main` at the time)
**Purpose:** Owner-authorized dry run of the proposed quality-gate commands before opening any CI workflow review PR.
**Outcome:** **Do not open the CI workflow PR yet.** The full test suite is currently red and must be consciously resolved or handled through a separately approved temporary policy; it must not be made non-blocking silently.

## Results

| Gate | Command | Result |
|---|---|---|
| Dependency integrity | `pnpm install --frozen-lockfile` | Passed. |
| Merge hygiene | `pnpm run check:conflicts` | Passed. |
| Full test suite | `pnpm test` | Failed. |

The full suite completed in approximately **184 seconds**.

| Test result | Count |
|---|---:|
| Passing test files | 489 |
| Failed test files | **63** |
| Skipped test files | 2 |
| Passing tests | 9,082 |
| Failed tests | **112** |
| Skipped tests | 181 |

## Failure concentration

The 112 assertion failures span 63 files; they are not confined to one narrow historical test. The largest groups are below.

| Area | Failed assertions | Representative current failure mode |
|---|---:|---|
| Role-assignment audit | 19 | Existing audit expectations are out of alignment with current behavior. |
| WhatsApp signature boundary | 15 | The isolated WA-SEC tests pass, but full-suite shared mock/server state leaves request results undefined. |
| Approval tracking | 14 | Existing workflow/lifecycle expectation failures. |
| Reporting surfaces | 14 across 10 reporting files | Cross-surface report/readiness/L1-L2/legacy-history assertions are stale or divergent. |
| Analytics router | 5 | KPI and critical-alert expectations fail. |
| Portal conformance | 5 | Existing portal conformance assertions fail. |
| Dataset-capture activation | 4 | Existing activation expectations fail. |
| Runtime maintenance/probes | 6 across three files | Existing route-composition/readiness expectations fail. |
| Tenant/role/session authority and other domain suites | Remaining failures | Includes tenant isolation, session revocation, agency/fleet/panel-beater authority, claims, documents, evidence, and workflow suites. |

Two specific observations are relevant to prioritization:

1. `server/auth.logout.test.ts` expects `sameSite: "none"`, but the current code returns `sameSite: "lax"` in the test context. This is a real expectation/runtime-policy mismatch, not a reason to suppress the test.
2. The full-suite WhatsApp failures do not invalidate the isolated WA-SEC security proof by themselves: the specific WorkOS-independent focused WhatsApp tests previously passed in isolation, while the full run shows shared test-process/mocking isolation issues that should be diagnosed rather than ignored.

## TypeScript baseline

The proposed workflow’s TypeScript policy remains appropriate but separate from the test problem. The current exact-main check reports **998 inherited diagnostics**. A future baseline comparator may report those diagnostics while failing on any newly introduced diagnostics. That does not make full test failures acceptable: the proposed workflow must still fail whenever `pnpm test` fails until the owner approves a different, explicit policy.

## Decision required before CI implementation

| Option | Consequence |
|---|---|
| **Repair test debt first** | Diagnose and repair the failing suites in bounded packages, then implement a genuinely blocking quality gate. This is the recommended path. |
| **Approve a temporary, explicit exception policy** | Design a narrowly bounded baseline/allowlist only after reviewing exact failure classes. The policy must remain visible, expire, and reject new failures; it must not use a blanket `continue-on-error`. |
| **Defer CI workflow** | No workflow source or branch protection is added now. |

No GitHub Actions workflow, branch-protection rule, repository setting, deployment, database change, or application code change was made by this dry run.

## Later dry run — green suite after CI reconciliation

# KINGA Quality Gate Current-Main Dry Run — 18 September 2026

**Author:** Manus AI

## Conclusion

The proposed quality-gate commands pass against merged `main` commit `2bc195b1f8ffea9f93d7408f6dabf23dbb9c8898` after the CI reconciliation PR stack. The run used the same fail-closed, disposable local `kinga_ci_test` target that the hosted workflow will provision. No live application database, staging database, deployment, or external application service was accessed.

An initial full-suite dry run exposed a timestamp-only non-determinism in the Truth Reconciliation Engine’s idempotency assertion. The test claimed to exclude timestamps but retained generated certificate and truth-graph timestamps. The assertion is now normalized for those derived fields. Sixteen focused repetitions passed before the final full-suite run.

## Final results

| Gate                           |                                                                                                                                        Result |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------: |
| Disposable MariaDB provisioner |                                                                                                       Passed; 238 tables, `IGNORE_SPACE`, UTC |
| Conflict-marker check          |                                                                                                                                        Passed |
| TypeScript baseline comparison | 1,001 baseline, 1,001 current, 0 new, 0 resolved; 86 message-only inherited-diagnostic changes and 1 exact inherited line relocation reported |
| Full isolated suite            |                                                                                  563 passed / 1 skipped files; 9,442 passed / 4 skipped tests |
| Production build               |                                                                                                                                        Passed |

The current final local suite completed in **145.42 seconds**. The production build completed in **35.87 seconds**. Build output retained existing chunk-size warnings only; it did not deploy or publish an artifact. The full-run log contained no CloudFront, Amazon Web Services, presigned-URL, storage-upload, LLM-invocation, OAuth-exchange, or unconfigured-notification-service indicator. The SDK’s configuration-only startup messages identify its configured base URL but do not create an HTTP request; direct LLM, OAuth, and storage calls are rejected in test mode before credentials or transport calls are used.

## Hosted-run controls

The proposed hosted workflow uses an explicitly loopback-bound ephemeral MariaDB 10.11 container at `127.0.0.1:33306`. Its local-only service password is required by the provisioner, which reads back and requires both `IGNORE_SPACE` and UTC before importing the schema-only snapshot. The test runner remains fail-closed on the exact `kinga_ci_test` URL. The workflow is named **KINGA Quality Gate** and the final job is named **quality-gate**, so its intended stable check context is **`KINGA Quality Gate / quality-gate`**.

No branch-protection setting was changed by this dry run. The next evidence gate is the hosted pull-request run. Branch protection remains a separate decision after that run passes and the check context is observed in GitHub.

## Hosted pull-request feedback

The first hosted pull-request runs were used as the required environment validation, not bypassed. Runs `35405508454` and `35405593785` stopped before dependency installation because `pnpm/action-setup` rejects both a workflow version input and the repository’s `packageManager` version, even when the major/minor values match. The workflow now has one version source: the exact repository `packageManager` declaration.

Run `35405679170` then passed checkout, package setup, frozen dependency installation, local utilities, disposable database provisioning, conflict checking, and the TypeScript baseline gate before revealing six bounded test-environment defects: developer-specific source paths in six source assertions, missing `pdftoppm`, missing test-only JWT signing configuration, and three real notification-provider boundaries in unit/authority tests. Each was traced separately. The repair uses portable `import.meta.url` source paths, installs the local `poppler-utils` binary, supplies a disposable non-production JWT key only to the Vitest step, and mocks the notification boundary only in the relevant tests while retaining their production payload/persistence/authority assertions. The focused six-file validation passed **36 tests with 2 intentional skips**, and the complete repaired local sequence passed with the results in the table above.

Run `35407262390` then reduced the hosted suite to the three session-revocation cases. Its JWT key was non-empty, but its session payload used an empty application identifier, which the verifier correctly rejects as an invalid cookie. The Vitest step now also supplies the disposable `VITE_APP_ID=kinga-ci-test-app`; an unset-host-environment simulation with only the disposable CI database URL, JWT key, and application identifier passed all four session-revocation tests. The next hosted rerun remains required before any merge or branch-protection decision.

The full constrained simulation then removed host `VITE_APP_ID`, `JWT_SECRET`, and Forge provider variables, supplied only the workflow’s disposable database URL, JWT key, and application identifier, and completed every gate successfully: provisioner, conflict check, baseline comparison, **563 passed / 1 skipped test files**, **9,442 passed / 4 skipped tests**, and production build. It completed in **135.68 seconds** and emitted no external-provider request indicator. The subsequent hosted run `35407810791` passed the complete workflow in **3 minutes 46 seconds**, confirming the stable check context **`KINGA Quality Gate / quality-gate`** before any branch-protection decision. [5]

## References

[1]: ../scripts/ci/provision-isolated-test-db.mjs "Ephemeral isolated CI database provisioner"
[2]: ../scripts/ci/typecheck-baseline.mjs "TypeScript diagnostic baseline comparator"
[3]: ../.github/workflows/kinga-quality-gate.yml "KINGA Quality Gate workflow"
[4]: ../server/truthReconciliationEngine.test.ts "Truth Reconciliation Engine idempotency regression"
[5]: https://github.com/Tavshok/KINGA/actions/runs/35407810791 "Successful KINGA Quality Gate pull-request run"
