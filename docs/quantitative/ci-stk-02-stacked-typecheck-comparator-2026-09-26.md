# CI-STK-02 — Stacked TypeScript Comparator

**Status:** Independently reviewed and ready for hosted validation.

## Finding

CI-STK-01 correctly caused the hosted Quality Gate to run on its stacked pull request. The run reached the existing TypeScript comparator, which correctly failed because it compared the P0-B1 integration lineage against the old `main` diagnostic baseline. The hosted report measured 209 diagnostics new to that historical baseline. The failures include known P0-B1 held-response contract work, deferred non-urgent client paths, and separately preserved pipeline nullable-authority work. CI-STK-01 itself changed no TypeScript application path.

A stacked prerequisite needs a different but equally strict comparison: compare its candidate head to the exact immediate base commit selected by GitHub for that pull request. The eventual P0-B1 integration pull request to `main` must continue using the committed `main` baseline and receive its normal hosted gate.

## Change

CI-STK-02 retains the existing `typecheck-baseline.mjs` comparison semantics and adds one read-only `--baseline-path` input. A new wrapper receives the 40-character `github.event.pull_request.base.sha`, verifies that it is an ancestor of the checked-out pull-request merge commit, and rejects dependency changes between base and candidate.

The wrapper creates a disposable local Git worktree at that exact base commit, reuses the already lockfile-proven dependency tree, runs the existing comparator in baseline-write mode only inside that disposable worktree, then compares the candidate against that generated base baseline. Cleanup is independently verified: any registered temporary worktree must be removed and its path absent before a success is returned. If comparison and cleanup both fail, the wrapper raises both failures; if cleanup alone fails, it fails closed.

The checkout is intentionally full-depth. A shallow checkout cannot prove that the event-selected base commit is present and an ancestor of the merge ref, so it would make the comparison either unreliable or unavailable.

## Boundaries

The branch-aware path is used only for pull requests whose base is not `main`. Pull requests to `main` and pushes to `main` continue to use the committed baseline. A base SHA must come from the GitHub pull-request event; an arbitrary branch name or moving remote reference is not accepted. The wrapper fails before comparison if the base is unavailable, not an ancestor, package metadata changes, the dependency tree is absent, or the temporary baseline is absent.

This package does not add typecheck exceptions. It does not add the deferred Group B manifest, which remains blocked until all newly identified runtime-risk paths are fixed and the safe set is re-verified.

## Review correction

The initial independent review BLOCKed two real gaps: a nonzero `git worktree remove` status could have been ignored, and the new Node guard tests were not a hosted Quality Gate step. The remediation removed the boolean add-state shortcut, now uses registration-aware fail-closed cleanup, and added regression coverage for a partially successful `worktree add` that reports failure as well as a forced cleanup failure. The gate now explicitly runs the workflow-routing and stacked-comparator Node tests before TypeScript comparison, and the routing verifier pins that step so it cannot silently disappear.

The remediated local guard matrix passed **16/16**: exact-ancestor comparison, dependency drift rejection, a partially successful add that reports failure, forced cleanup failure, prohibited write-plus-custom-baseline arguments, exact trigger routing, full-history checkout, hosted guard-test invocation, unsafe stack-to-main baseline routing, and the existing trigger-topology mutation cases. The source verifier, Node syntax checks, Prettier, and `git diff --check` also passed.

The fresh post-remediation adversarial review **APPROVED** the exact event-base provenance, non-`main` routing, cleanup behavior, test injection quality, hosted test wiring, and unchanged `main` baseline route. The sandbox could not materialize another full disposable repository checkout because preserved historical worktrees had exhausted local inodes; this did not change source or bypass any test. The actual full-repository proof is therefore deliberately deferred to CI-STK-02’s required hosted Quality Gate on a clean runner.

## Planned Validation

1. Verify the comparator rejects an invalid combination of `--write-baseline` and `--baseline-path`.
2. Run the fixture matrix for exact-ancestor success, dependency drift rejection, partially failed worktree addition, forced cleanup failure, and main-checkout baseline immutability.
3. Verify the trigger/routing guard and its mutation tests, formatting, YAML structure, and whitespace hygiene.
4. Perform a fresh independent adversarial review of base-sha provenance, dependency equality, temporary-worktree cleanup, hosted-test wiring, and preservation of the `main` gate.
5. Open CI-STK-02 against the integration branch. Its actual hosted Quality Gate must pass before merge. Then require actual green hosted checks on PR #159 and PR #160 before their merges.
