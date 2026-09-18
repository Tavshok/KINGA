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

Run `35405679170` then passed checkout, package setup, frozen dependency installation, local utilities, disposable database provisioning, conflict checking, and the TypeScript baseline gate before revealing six bounded test-environment defects: developer-specific source paths in six source assertions, missing `pdftoppm`, missing test-only JWT signing configuration, and three real notification-provider boundaries in unit/authority tests. Each was traced separately. The repair uses portable `import.meta.url` source paths, installs the local `poppler-utils` binary, supplies a disposable non-production JWT key only to the Vitest step, and mocks the notification boundary only in the relevant tests while retaining their production payload/persistence/authority assertions. The focused six-file validation passed **36 tests with 2 intentional skips**, and the complete repaired local sequence passed with the results in the table above. The next hosted rerun remains required before any merge or branch-protection decision.

## References

[1]: ../scripts/ci/provision-isolated-test-db.mjs "Ephemeral isolated CI database provisioner"
[2]: ../scripts/ci/typecheck-baseline.mjs "TypeScript diagnostic baseline comparator"
[3]: ../.github/workflows/kinga-quality-gate.yml "KINGA Quality Gate workflow"
[4]: ../server/truthReconciliationEngine.test.ts "Truth Reconciliation Engine idempotency regression"
