# Gate D and NCU-01 Main Reconciliation — 2026-09-15

## Purpose

This record documents the owner-authorized reconciliation of the completed Gate D and NCU-01 review stack into `main`. It records repository ancestry only. It does not alter TiDB, staging data, accounts, grants, recovery posture, deployment, or production.

## Final main state

The verified `main` head is `f29c1263cc242f36a39701729380b7be1110ee10`, with subject:

> `docs(staging): reconcile completed Gate D and NCU-01 stack into main`

The reconciliation was required because PRs #87–#92 were originally stacked on review branches. Merging each pull request closed it in GitHub but did not automatically place every downstream branch tip in `main`. Reconciliation PR #93 merged the complete final stack into `main` through the protected workflow.

## Merged pull-request record

| PR | Scope | Merge commit | Result |
|---:|---|---|---|
| #87 | D-02 marker-aware staging packet and evidence root | `1c848cebee4f0342ea9013343f90cfea2871ae14` | Merged |
| #88 | D-03 packet and compatibility/closure evidence | `adba1eccfa661ce5c2b7a95d9c4374999f445cf5` | Merged |
| #89 | D-04 packet and closure evidence | `7df27af4d889228ccb79198bb4eff3c90bfc2649` | Merged |
| #90 | D-05 packet and final Gate D closure evidence | `e7f5d550e529e2d4dd07ea4e951ee12b16c9100a` | Merged |
| #91 | Approved relationship-pair uniqueness source contract | `ceebbeb7b2e5b18ba0a736c21f8b9b826b86e796` | Merged |
| #92 | NCU-01 packet, fresh preflight, handoff, postflight, and closure evidence | `5809b4d4ad5f5764df45af14aeb51e2f0464fefd` | Merged |
| #93 | Complete stacked Gate D/NCU reconciliation to `main` | `f29c1263cc242f36a39701729380b7be1110ee10` | Merged |

The PR #93 `code-complete` check failed only on inherited frontend TypeScript annotations in `AssessorClaimDetails.tsx`, `AssessmentResults.tsx`, `ClaimDrillDownModal.tsx`, and `AssessorPortalLayout.tsx`. A paginated PR-file comparison confirmed none of those paths belong to the Gate D/NCU reconciliation scope. The protected merge was owner-authorized after that direct scope check.

## Main ancestry and evidence coverage

The actual head commits of PRs #87 through #92 were verified as ancestors of final `main`. The final tree contains the D-02 through D-05 independent postflight records, the final 188-table Gate D closure record, the NCU-01 source contract and statement ledger, the NCU-01 independent postflight/closure record, and the updated `drizzle/schema.ts` source declaration.

| Baseline record | Main-tree evidence |
|---|---|
| D-01 through D-05 final staging baseline | `audit/gate-d-final-staging-schema-reconciliation-closure-2026-09-15.md` |
| D-02 postflight | `audit/gate-d-d02-independent-postflight-2026-09-13.md` |
| D-03 postflight | `audit/gate-d-d03-independent-postflight-2026-09-14.md` |
| D-04 postflight | `audit/gate-d-d04-independent-postflight-2026-09-15.md` |
| D-05 postflight | `audit/gate-d-d05-independent-postflight-2026-09-15.md` |
| NCU-01 source contract | `audit/natural-composite-unique-staging-2026-09-15/source-contract.json` |
| NCU-01 postflight and closure | `audit/natural-composite-unique-staging-2026-09-15/independent-postflight-and-closure-2026-09-15.md` |

## Retained boundary

The repository now reflects the verified staging state: **188 tables**, **67 foreign-key definitions**, **454 source-explicit index definitions**, **220 primary/unique structures**, and **zero rows** throughout the closed baseline, including NCU-01’s three approved unique pair indexes.

This reconciliation does not authorize D-06, recovery, restore, cutover, deployment, production work, account/grant changes, data loading, or any schema change beyond the already closed NCU-01 transition.
