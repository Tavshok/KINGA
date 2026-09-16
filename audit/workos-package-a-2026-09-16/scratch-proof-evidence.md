# WorkOS Package A — Additive Schema Contract and Scratch Proof

**Date:** 2026-09-16
**Scope:** Package A only: source metadata, deterministic SQL, focused source-contract regression, and disposable loopback scratch proof.
**Explicitly excluded:** WorkOS SDK or dependency installation, WorkOS tenant/app/redirect/secret setup, OAuth callback or route changes, provider selection, duplicate-email data read, staging DDL/DML, production access, deployment, and any authentication behavior change.

## Approved source contract

| Canonical table | New nullable column | New unique index | Intended purpose |
|---|---|---|---|
| `tenants` | `workos_organization_id VARCHAR(128)` | `tenants_workos_organization_id_unique` | Future one-KINGA-tenant-to-one-WorkOS-organization mapping. |
| `users` | `workos_user_id VARCHAR(128)` | `users_workos_user_id_unique` | Future verified-email linking of a human KINGA user to one WorkOS user. |

Both values are nullable, so the present Manus-authenticated user population and every non-human identity remain valid during the approved staged rollout. The package neither changes `openId` nor assigns a WorkOS value; it only establishes future link targets.

## Deterministic transition

The generator `scripts/generate-workos-package-a-sql.mjs` rejects a missing source contract and writes exactly four additive statements to `workos-package-a-additive-schema.sql`:

1. Add `tenants.workos_organization_id`.
2. Create its unique index.
3. Add `users.workos_user_id`.
4. Create its unique index.

| Artifact | SHA-256 | Result |
|---|---|---|
| Additive four-statement transition | `eae14bcce580a75346edd4813757b795327229701a6f4f64e787486012d255e6` | Generated deterministically. |
| Transition manifest | `210eac256c0470546e1bc288f1394dea10ea4adc3ce59e00d38e980a5dc3ec5d` | Generated deterministically. |
| Focused source-contract regression | N/A | Passed: 1 file, 2 assertions. |

`pnpm drizzle-kit generate` was attempted after restoring the exact lockfile dependencies. It halted at a pre-existing interactive `claim_comments.claimId` rename/create prompt. No unrelated answer was selected, no Drizzle migration was emitted, and this package therefore retains its deterministic, source-derived SQL artifact rather than guessing an unrelated historical migration decision.

## Two independent loopback-only scratch replays

The runner `scripts/replay-workos-package-a-scratch.mjs` accepts only `mysql://` URLs whose host is `127.0.0.1`, `localhost`, or `::1`, and requires a `kinga_workos_package_a_` database-name prefix. It composed the closed D-01–D-05 188-table baseline, applied the already closed NCU-01 four-statement transition, then applied the Package A transition.

| Iteration | Fresh scratch database | Baseline | Package A result | Disposal verification |
|---|---|---:|---|---:|
| 1 | `kinga_workos_package_a_20260916_a` | 188 tables | Both nullable `VARCHAR(128)` fields present; both unique indexes exact; duplicate WorkOS user/organization values rejected with `ER_DUP_ENTRY`; null mappings accepted. | 188 tables before drop; 0 after drop. |
| 2 | `kinga_workos_package_a_20260916_b` | 188 tables | Same result independently reproduced. | 188 tables before drop; 0 after drop. |

Both replays reported the same 188-table baseline hash, `7630802a8e93bcaed6287f943195c7e34a3124f286ecc77193a6cc408669c088`, and the same Package A transition hash. The one-off MariaDB service was bound only to loopback and stopped/removed after the proof.

## Clean current-main confirmation

Before review publication, the exact Package A file set was reapplied to a clean branch created directly from GitHub `main` at `211f9b180743d70f800876a780be967612e9a526`. The deterministic generator and the focused two-assertion source-contract test were rerun. Two additional fresh loopback scratch databases, `kinga_workos_package_a_clean_a` and `kinga_workos_package_a_clean_b`, then reproduced the same successful 188-table-plus-NCU-01 replay. Each was verified at 188 tables before explicit drop and zero tables afterwards. Their retained outputs are `clean-scratch-01/scratch-replay.json` and `clean-scratch-02/scratch-replay.json`.

## Observed source-compatibility detail

The D-01 reviewed SQL defines the existing physical identity column as ``users.openId`` (camel-case), despite the TypeScript property being `openId`. The Package A fixture initially attempted `open_id`; scratch replay rejected that fixture with an unknown-column error. The runner was corrected to use the retained D-01 source definition, then two fresh replays passed. This is a scratch-test correction only; Package A does not change the existing `openId` contract.

## Gate outcome

> **Package A is scratch-proven and ready for source-review publication only.** It is not authorized for `KINGA-staging` or production. Before any later staging packet, a fresh preflight must confirm the 188-table baseline, zero row state, absence of the two new WorkOS columns/indexes, and a separately authorized duplicate-email assessment against the active project database `YbS42LwGroxbVepAMjk4bS`.
