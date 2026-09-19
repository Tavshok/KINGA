# Legacy CI/CD Pipeline Retirement Proposal — 19 September 2026

**Author:** Manus AI

## Conclusion

This review package removes only `.github/workflows/cicd-pipeline.yml`, the legacy workflow named **CI/CD Pipeline**. Its replacement, **KINGA Quality Gate**, is now merged, has passed on `main`, and is enforced as the sole required check on `main`.

The retirement removes misleading duplicate automation rather than reducing validation. KINGA Quality Gate continues to run on pull requests and pushes to `main`. It provisions a dedicated disposable MariaDB database, rejects non-isolated test targets, reports new TypeScript diagnostics relative to a reviewed baseline, runs the complete test suite, and builds the application.

## Evidence for retirement

The legacy `code-complete` job runs raw `pnpm tsc --noEmit`. That command fails on the inherited TypeScript debt and therefore produced a failing signal on every recent `main` push, including the quality-gate merge commit. It does not distinguish new diagnostics from the reviewed inherited baseline of 1,001 diagnostics. This obscures actionable regressions and duplicates the new gate’s typecheck purpose.

The legacy workflow also runs `pnpm test` twice without provisioning the disposable `kinga_ci_test` service or applying the test database contract. Its conditional release-candidate, Codecov, stability-gate, and deployment-notification stages are not a deterministic all-pull-request quality contract. Several actions are referenced by mutable major-version tags rather than reviewed full commit identifiers, including `actions/checkout@v3`, `actions/setup-node@v3`, `actions/github-script@v6`, `codecov/codecov-action@v3`, and `actions/upload-artifact@v3`.

The replacement quality gate completed successfully on `main` commit `a3551818519298874f9d72ea0e8112fe9d0a9257` and exposes the stable GitHub Actions check **`KINGA Quality Gate / quality-gate`**. A deliberately failing probe pull request was rejected by the enforced branch rule and closed without merge. [1] [2]

| Concern              | Legacy CI/CD Pipeline                         | KINGA Quality Gate                                                   |
| -------------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| TypeScript signal    | Raw compiler failure on inherited debt        | Blocks only newly introduced diagnostics against a reviewed baseline |
| Test database        | No dedicated service or provisioning contract | Fresh loopback-only disposable MariaDB and fail-closed test guard    |
| Test execution       | Duplicated across multiple pipeline stages    | One complete guarded suite                                           |
| Build                | Conditional release-candidate stage           | One production build in every gate                                   |
| Required-check role  | Not required and permanently red              | Sole required `quality-gate` check                                   |
| Supply-chain posture | Older mutable action tags                     | Full-SHA action pins                                                 |

## Exact scope

The source change deletes `.github/workflows/cicd-pipeline.yml` and adds this evidence record. It does not alter the KINGA Quality Gate workflow, the branch protection rule, the test database policy, application source, database schema or data, deployment configuration, Codecov configuration, dashboard audit workflow, or external-staging-readiness workflow.

The removed workflow previously triggered on `develop` as well as `main`. KINGA Quality Gate intentionally targets `main` only, so this package removes the legacy `develop` CI trigger rather than silently replacing it. `develop` is not protected by the new branch rule and no `develop` quality gate is proposed here.

No release candidate, deployment, or notification will be triggered by this removal. The legacy manual `workflow_dispatch` environment input could create a release-candidate artifact and print readiness/checklist messages, but it contained no deployment command, cloud credential, or publication step. This removal therefore stops future informational release-notification runs; it does not alter application deployment behavior or historical run records.

## Validation and review gate

The review branch must have a clean diff, a passing server bundle check, and a passing hosted KINGA Quality Gate run. The workflow-removal pull request remains unmerged until separate owner review and approval.

## Deferred governance note

The current `required_approving_review_count: 0` setting is a deliberate, temporary sole-operator accommodation. GitHub does not allow an author to approve their own pull request. When a second person with write access becomes available, the branch rule should be revised to require one approving review and to dismiss stale approvals. This governance change is intentionally not part of the present workflow-removal package.

## References

[1]: https://github.com/Tavshok/KINGA/actions/runs/35422814901 "Successful KINGA Quality Gate run on main"
[2]: https://github.com/Tavshok/KINGA/pull/109 "Closed deliberate branch-protection enforcement probe"
