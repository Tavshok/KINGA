# CI-STK-01 — Stacked Quality Gate Routing

**Status:** Locally validated and adversarially reviewed; awaiting hosted Quality Gate validation.

## Purpose

The KINGA Quality Gate previously ran only for pull requests targeting `main` and pushes to `main`. Two approved P0-B1 prerequisite pull requests were intentionally stacked:

- PR #159 targets `feat/p0-b1-composed-fraud-boundary-final`.
- PR #160 targets `test/p0-b1-canonical-report-flake`.

Because neither target is `main`, GitHub Actions could not start a hosted Quality Gate for either pull request. The absence of checks was a deterministic trigger-topology gap, not a completed check.

## Change

CI-STK-01 adds exactly the two current P0-B1 stack bases to the pull-request allowlist in `.github/workflows/kinga-quality-gate.yml`:

1. `feat/p0-b1-composed-fraud-boundary-final`
2. `test/p0-b1-canonical-report-flake`

The existing `main` pull-request trigger and the push-to-`main` trigger remain unchanged. The workflow body, disposable MariaDB service, database guard, typecheck baseline comparator, full guarded test suite, and production build are unchanged.

A small CI verifier pins the complete root mapping and trigger block. It permits only the established ordered root keys (`name`, `on`, `permissions`, `concurrency`, `jobs`), requires the approved pull-request allowlist, and keeps the push trigger `main`-only. This prevents a later edit from silently broadening the Quality Gate to every branch, adding `pull_request_target`, adding any duplicate or tagged/aliased root trigger, or removing an active stack base. Regression tests cover each failure mode.

## Boundaries

This package changes workflow routing only. It does not change application code, test assertions, database schema or data, deployment, credentials, external services, or branch-protection requirements.

Hosted validation is required before either stacked prerequisite is merged. Each pull request must show an actual completed green `KINGA Quality Gate` result; missing checks are not accepted as a pass.

## Planned Validation

1. Run the trigger-scope verifier locally.
2. Inspect the workflow diff and run whitespace hygiene checks.
3. Perform adversarial review of the narrow routing change. Three real verifier loopholes were found and remediated before approval: an added `pull_request_target` block, a duplicate root `on:` block after the workflow body, and duplicate root keys with YAML comments or whitespace.
4. Open CI-STK-01 against the integration base and require its actual hosted Quality Gate to pass.
5. Confirm actual green hosted checks on PR #159 and PR #160 before either merge.

## Completed Local Validation

The standalone verifier accepted the current workflow. Its Node regression suite passed 7/7. It covers the exact accepted trigger block and rejects an embedded `pull_request_target`, duplicate root trigger keys in plain/commented/whitespace/tab/quoted/tagged/anchored forms, an explicit YAML key form, an added pull-request base, and a broadened push trigger.

The final independent adversarial review also applied 16 in-memory trigger mutations. It confirmed that the verifier rejects each unexpected event/root-key variation while preserving the actual candidate workflow. It independently confirmed that the workflow’s permissions, MariaDB loopback service, disposable database provisioning, migration proof, typecheck baseline, guarded full test suite, and production build remain unchanged.

`git diff --check` and Prettier checks passed for every changed file. The next validation is intentionally hosted: CI-STK-01 must receive a real, completed green `KINGA Quality Gate` run before this routing change is merged. Thereafter, PR #159 and PR #160 must each receive their own real completed green hosted check before either merge.
