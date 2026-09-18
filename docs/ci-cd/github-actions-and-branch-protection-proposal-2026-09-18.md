# GitHub Actions Quality Gate and Branch-Protection Proposal

**Date:** 18 September 2026
**Status:** Proposal only — no workflow, repository setting, branch protection rule, deployment, secret, or production behavior has been changed.

## 1. Decision requested

Approve or revise a repository-only CI package that adds one uniquely named GitHub Actions quality-gate workflow for every pull request to `main` and every push to `main`, followed by a separately authorized branch-protection change that requires the workflow’s final job before merge.

The proposal deliberately separates **workflow publication** from **branch-protection enforcement**. The workflow must first run successfully on real pull requests and establish stable check names; branch protection should not be enabled until the owner explicitly approves it after that proof.

## 2. Current state

KINGA already has three workflows:

| Existing workflow | Current purpose | Why it is not the proposed universal merge gate |
|---|---|---|
| `cicd-pipeline.yml` | Multi-stage existing pipeline with its own conditional jobs. | Its check outcomes include skipped stages and historical behavior that is not a simple deterministic all-PR quality contract. |
| `dashboard-audit.yml` | Dashboard-specific integrity audit. | Important but narrow; it is not a complete source/test/build gate. |
| `external-staging-readiness.yml` | Runtime/external-staging files only. | Path-scoped; it does not run for all application changes. |

GitHub currently returns **Branch not protected** for `main`; no protection or required-check configuration is active. The proposed workflow must therefore use a job name that is globally unique, because GitHub warns that repeated job names across workflows can make required checks ambiguous.[1]

## 3. Proposed workflow

Create `.github/workflows/kinga-quality-gate.yml` with workflow name **KINGA Quality Gate** and one required final job called **quality-gate**. Its check context will be `KINGA Quality Gate / quality-gate`.

```yaml
name: KINGA Quality Gate

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: kinga-quality-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  quality-gate:
    name: quality-gate
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - name: Install lockfile-pinned dependencies
        run: pnpm install --frozen-lockfile
      - name: Reject unresolved conflict markers
        run: pnpm run check:conflicts
      - name: TypeScript baseline comparison
        run: node scripts/ci/typecheck-baseline.mjs
      - name: Full Vitest suite
        run: pnpm test
      - name: Production build
        run: pnpm build
```

The installed actions may be pinned to reviewed full commit SHAs during implementation if the owner prefers an immutable action supply-chain policy. The commands align with the project’s existing package scripts. GitHub recommends `setup-node` for consistent Node versions and supports pnpm caching through `setup-node` plus the pnpm setup action.[2]

## 4. TypeScript policy: report new debt, do not hide inherited debt

The measured current-main baseline on 18 September 2026 is:

| Metric | Current value |
|---|---:|
| `pnpm check` exit status | 1 |
| TypeScript diagnostic lines | **1,000** |
| Files with TypeScript diagnostics | **102** |

The workflow must not simply mark `pnpm check` as non-blocking, because that would make new TypeScript regressions invisible. Instead, it should add a small deterministic script, `scripts/ci/typecheck-baseline.mjs`, that:

1. runs `pnpm check` and captures standard output/error;
2. extracts normalized diagnostic keys consisting of path, line, column, error code, and message;
3. compares them with a committed baseline file such as `ci/typecheck-baseline.json` generated from current `main`;
4. writes a machine-readable report and an Actions step summary with **baseline count**, **current count**, **new count**, and **resolved count**;
5. fails only when `new count > 0`; and
6. uploads the report as an artifact on every outcome.

The baseline generator must be separately documented and reviewable. It must run only from current `main` during setup or a deliberately approved refresh; an implementation PR must not update the baseline merely to hide its own errors. The quality gate will therefore report the inherited 1,000 diagnostics while enforcing zero new diagnostics.

## 5. Test and build policy

| Gate | Command | Proposed behavior |
|---|---|---|
| Dependency integrity | `pnpm install --frozen-lockfile` | Blocking. A modified lockfile must be committed and consistent. |
| Merge hygiene | `pnpm run check:conflicts` | Blocking. No unresolved conflict marker may merge. |
| TypeScript | Baseline comparison wrapper around `pnpm check` | Blocking only for new diagnostics; inherited baseline is reported separately. |
| Tests | `pnpm test` | Blocking. A failing test is not automatically treated as inherited debt; a baseline exception would require a separately approved policy, not a silent `continue-on-error`. |
| Production build | `pnpm build` | Blocking. This runs the Vite client build and server bundle, and has no deploy step. |

A practical rollout condition is that the workflow must first execute against current `main`. If the full suite currently fails, the owner can decide whether to remediate test debt first or approve a separately constrained test-baseline design. This proposal does **not** recommend silently downgrading test or build failures to warnings.

## 6. Proposed branch-protection rule (separate later authorization)

After the workflow has produced a stable successful check on a current-main or PR run, configure a `main` branch protection rule with:

| Setting | Proposal |
|---|---|
| Require pull request before merging | Enabled |
| Required status check | `KINGA Quality Gate / quality-gate` only |
| Require branch to be up to date | Enabled (strict) |
| Require conversation resolution | Enabled |
| Require approval | One approval while KINGA remains sole-operator; revisit when a second reviewer exists |
| Dismiss stale approvals | Enabled |
| Include administrators | Recommended, subject to owner confirmation |
| Force pushes | Disabled |
| Branch deletion | Disabled |
| Direct pushes | Disallowed except a documented emergency/break-glass process |
| Deployment requirement | Not enabled; this workflow performs no deployment |

GitHub documents that required checks must be successful, skipped, or neutral before a protected-branch change can merge, and that strict checks require the branch to be up to date.[1] It also notes that admins bypass protection by default unless the rule is explicitly applied to administrators.[1]

## 7. Explicit exclusions

The workflow must not contain:

- application, database, WorkOS, Twilio, cloud, or deployment credentials;
- `pnpm db:push`, DDL, migration, seed, cleanup, archive, or test-data commands;
- a publish/deploy action;
- an environment approval, staging mutation, or production mutation;
- a browser session, external webhook, or live service test;
- automatic baseline refresh;
- a broad `continue-on-error` on test or build jobs.

It is a source-validation control only.

## 8. Rollout and validation plan

1. Create an isolated review branch with only the workflow, typecheck-baseline script, baseline JSON, and supporting documentation.
2. Verify the captured baseline reproducibly from the then-current `main` commit.
3. Exercise the workflow on the review PR and inspect artifact/report output.
4. Confirm its check name is exactly `KINGA Quality Gate / quality-gate`, unique across the repository, and stable on a pull request.
5. Merge the workflow only after review; it remains informational until the separate branch-protection decision.
6. Run the merged workflow on `main` and review the result.
7. Request the owner’s explicit approval before enabling branch protection.
8. If enabled, verify a deliberately non-mergeable test PR is blocked by the required quality gate; close it without merging.

## 9. Approval choices

| Choice | Consequence |
|---|---|
| **Approve CI workflow package only** | Implement and submit the source/config review PR. No branch protection is changed. |
| **Approve CI workflow and later protection proposal** | Still two steps: workflow evidence first, then request a separate final authorization to enable GitHub branch protection. |
| **Revise** | Change gates, baseline policy, check name, review policy, or rollout sequence before implementation. |
| **Defer** | Existing workflows stay unchanged and `main` remains unprotected. |

## References

[1]: [GitHub Docs — About protected branches](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/defining-the-mergeability-of-pull-requests/about-protected-branches).

[2]: [GitHub Docs — Building and testing Node.js](https://docs.github.com/en/actions/use-cases-and-examples/building-and-testing/building-and-testing-nodejs).
