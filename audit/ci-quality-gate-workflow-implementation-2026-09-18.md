# KINGA Quality Gate Workflow Implementation — 18 September 2026

**Author:** Manus AI

## Conclusion

This package adds a repository-only GitHub Actions workflow named **KINGA Quality Gate**. It runs on pull requests targeting `main` and pushes to `main`. Its single job is named **quality-gate**, producing the stable check context **`KINGA Quality Gate / quality-gate`** proposed for any later branch-protection rule.

The workflow is intentionally a source-validation control. It does not deploy, publish, access a live application database, use cloud credentials, execute schema migrations, or update branch-protection settings. The final quality-gate job is blocking only within the workflow. Until a separately authorized branch-protection change is made, GitHub does not require it for merges.

## Dedicated test database

GitHub Actions starts a fresh MariaDB 10.11 service container explicitly bound to loopback port `127.0.0.1:33306`. It creates only the disposable `kinga_ci_test` database. The workflow supplies a fixed local service URL that must pass the same repository fail-closed rule used by local tests: `127.0.0.1:33306/kinga_ci_test`, with no query or host override. [1] [2]

Before Vitest starts, the workflow imports a committed, schema-only MariaDB-compatible snapshot and verifies that it contains at least 200 tables. The snapshot contains no `INSERT`, `REPLACE`, or seed statements. The provisioner requires the ephemeral service root password, sets UTC and `IGNORE_SPACE`, then reads those effective settings back and fails if either configuration is absent. This reproduces the previously verified TiDB-compatible ISO timestamp handling without relaxing production code. The service credentials are public disposable values for this loopback-only container and cannot access a network database.

The workflow actions are pinned to reviewed full commit identifiers rather than mutable major-version tags. `pnpm/action-setup` reads the repository’s exact `packageManager` declaration as its sole version source. The workflow retains only `contents: read` permission and runs on the ordinary `pull_request` event rather than the privileged `pull_request_target` event. Its existing local-utility installation step adds both `mariadb-client` and `poppler-utils`; the latter provides the repository’s locally executed `pdftoppm` check and does not add an external service.

## Gates

| Gate                 | Command or control                       | Failure policy                              |
| -------------------- | ---------------------------------------- | ------------------------------------------- |
| Dependency integrity | `pnpm install --frozen-lockfile`         | Blocking                                    |
| Merge hygiene        | `pnpm run check:conflicts`               | Blocking                                    |
| TypeScript           | `node scripts/ci/typecheck-baseline.mjs` | Blocks only new diagnostics                 |
| Automated tests      | `pnpm test`                              | Blocking; test-step-only disposable JWT key |
| Build                | `pnpm build`                             | Blocking                                    |

The committed TypeScript baseline contains **1,001 diagnostics** captured from merged `main` commit `2bc195b1f8ffea9f93d7408f6dabf23dbb9c8898`. The comparator identifies a diagnostic by its normalized file path, line, column, and TypeScript error code. It records message-only drift separately because TypeScript may reorder or truncate inferred-type text without changing the inherited diagnostic’s source location or code. If a source-only control inserts lines above an otherwise unchanged inherited diagnostic, an exact file/code/message match is reported as an inherited relocation rather than new debt. The JSON artifact and Actions summary report baseline, current, new, resolved, message-drift, and relocation counts. The gate fails on any diagnostic that is neither an existing identity nor an exact inherited relocation. The workflow does not refresh the baseline automatically.

## Hermetic test contract and maintenance

The quality gate permits only the loopback MariaDB integration boundary. Tests must not use live object storage, cloud presigned URLs, live LLMs, OAuth services, webhooks, staging endpoints, or deployment services. The direct storage helper, LLM invoker, and OAuth transport all fail closed when `NODE_ENV=test` or `VITEST` is set, before reading credentials or creating an HTTP request. Tests of those boundaries must mock the owning module. The upload/report operational-acceptance tests use test-local storage URLs, authentication, and pipeline-boundary mocks. Report-email, claim-approval, and panel-beater submission tests mock their notification-provider boundary while preserving their real formatting, persistence, and authority assertions. They retain application-level behavior without writing a cloud object, calling an owner-notification service, or starting an external assessment.

The only JWT key in the workflow is a fixed, non-secret value scoped to the **Full Vitest suite** step. It exists solely to sign and verify ephemeral test cookies inside the fresh MariaDB service, never appears in a deployment or runtime step, and must not be reused outside this test job.

The schema snapshot is refreshed only through a reviewed source change. A refresh must be schema-only, must be checked for the absence of data statements, must retain the loopback-only database name, and must be validated by a disposable full-suite run before review. The `ci/typecheck-baseline.json` file is also a reviewed source artifact. A maintainer may refresh it only by running `node scripts/ci/typecheck-baseline.mjs --write-baseline` from a known `main` revision, documenting the source commit and the reason for the change. The workflow cannot invoke that mode.

## Validation plan

The workflow review pull request is its first real hosted run. Validation requires the check to complete and to publish the exact planned context: **`KINGA Quality Gate / quality-gate`**. Its test stage must report the green isolated suite rather than connect to a live endpoint. The TypeScript artifact must show zero new diagnostics relative to the committed baseline.

Branch protection remains intentionally unmodified. Only after the workflow is merged and has produced a stable successful run on `main` should a separate decision be requested to require the `KINGA Quality Gate / quality-gate` check, require branches to be current, and apply the other proposed merge controls.

## References

[1]: ../../shared/ci-test-database-policy.ts "Fail-closed automated test database policy"
[2]: ../../scripts/run-isolated-vitest.ts "Guarded Vitest runner"
[3]: ../../scripts/ci/provision-isolated-test-db.mjs "Ephemeral Actions MariaDB provisioner"
[4]: https://docs.github.com/en/actions/use-cases-and-examples/building-and-testing/building-and-testing-nodejs "GitHub Actions guidance for building and testing Node.js"
[5]: https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/defining-the-mergeability-of-pull-requests/about-protected-branches "GitHub documentation on protected branches"
