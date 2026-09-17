# Live Test-Data Full Reset: Fresh Preflight Result

**Captured:** 17 September 2026, 18:52:55 UTC  
**Status:** **Read-only preflight passed; archive, restore rehearsal, and deletion remain unauthorized**  
**Scope:** Aggregate and metadata-only checks against the live Manus-hosted KINGA project database. No row, file, archive, schema, configuration, credential, deployment, or external service was changed.

## Executive result

The fresh preflight reproduces the reviewed reset scope **exactly**. It finds **18,066 claims**, of which **101** are protected and **17,965** are reset candidates. It finds **44,885 local users**, of which the directly matched configured owner account is the single protected account and **44,884** are reset candidates. The newest claim and user timestamps remain 11 September 2026; no new population has appeared since the prior assessment.

The requested automated confirmation checks pass. The 97 document-ingestion-format claims are spread across 40 calendar days and 95 creation minutes between May and August. Only two minutes contain more than one such claim, affecting four claims in total; the largest same-minute group is two. The monthly distribution is 41 claims in May, 38 in June, 14 in July, and four in August. This is **not** the synchronized high-volume batch pattern previously observed in the synthetic families. It is consistent with individual or small-session document-ingestion activity, although timing alone is not treated as an identity proof.

The document-ingestion cohort has **zero** overlap with the `CLM`, `TEST`, or `WB` claim-number families. Those families remain distinct and contain 9,707, 7,979, and 268 claims respectively. This confirms that the protected DOC rule does not accidentally include a member of any of the three known synthetic families.

## Protected-set verification

| Check | Fresh result | Gate result |
|---|---:|---|
| Total claims | 18,066 | Informational baseline |
| Protected claims | 101 | **Pass** — matches reviewed rule |
| Reset-candidate claims | 17,965 | **Pass** — exact expected count |
| Total users | 44,885 | Informational baseline |
| Protected owner accounts | 1 | **Pass** — direct match only |
| Reset-candidate users | 44,884 | **Pass** — exact expected count |
| DOC claims | 97 | **Pass** — expected protected cohort |
| Exact overlap of DOC with `CLM`/`TEST`/`WB` | 0 | **Pass** |
| Protected source documents | 101 | **Pass** |
| Protected source documents shared with reset claims | 0 | **Pass** |
| Source documents directly linked to reset claims | 0 | Informational; reset-related document records are handled through the broader dependency manifest |
| Unlinked source documents | 135 | Archive-and-classify before deletion |

The 97 DOC claims contain a claimant identifier value that does not resolve to a live `users` row. The four separately owner-confirmed revision records have no claimant identifier value. No identity is inferred or reassigned. The owner account remains protected by the direct configured-owner match and the prior audit-actor verification, independently of the claimant field.

## Full dependency-closure verification

The preflight reran the enforced and broader physical-reference checks rather than relying on the earlier summary. It found **55 enforced child foreign-key relations** into `claims`. Nine relations contain protected-claim rows, including AI assessments, audit history, feature data, cost-learning data, repair outcomes, relationship graph data, quotes, and market valuations. **No protected child relation has a `RESTRICT` or `NO ACTION` delete rule**, so the preserved 101-claim closure has no current enforced-FK blocker.

The reset graph retains one known execution blocker: **364 reset-candidate `recovery_cases` rows** are governed by `RESTRICT`. They must be archived and deleted before reset claims. This is expected, documented, and does not touch the protected cohort.

The broader physical scan covered **74 base-table claim-reference columns** and one read-only view. Twenty-one base-table relations contain protected references. The resulting retained closure includes the expected evidence and reporting records: 85 AI assessments, 300 audit-trail entries, 178 quotes, 173 market valuations, 67 quote-evidence ledger rows, seven report-provenance snapshots, six evidence findings, three approvals, and related operational records. Pre-existing dangling reference values exist elsewhere in the wider reset population; they cannot resolve to protected claims and must be separately archived and counted in the frozen reset manifest. They are not to be repaired, silently reattached, or deleted before archive proof.

> **Closure conclusion:** The protected set’s direct claim, source-document, and dependent-record closure passes the read-only gate. The execution manifest must still enumerate every retained and reset primary key immediately after the write freeze; the result here is a preflight proof, not permission to use a broad live predicate later.

## Required execution sequence

The mandated order is confirmed exactly as follows. No `DELETE` statement may run before the archive and its independent restore proof have passed.

| Order | Gate | Required evidence before advancing |
|---:|---|---|
| 1 | Fresh preflight | The protected and reset counts above, source isolation, owner match, and dependency checks match the frozen rule. |
| 2 | Write freeze and target-set freeze | All claim intake, uploads, seeds, jobs, and other writers are stopped; immutable primary-key manifests are generated for the protected and reset sets. |
| 3 | Encrypted archive | Complete row payloads, manifests, hashes, and count ledgers are encrypted and stored in an owner-recoverable non-public destination. |
| 4 | Disposable restore rehearsal | The archive is restored to a genuinely separate disposable target and proven readable; hashes, row counts, protected-set exclusion, and restore accessibility all pass. |
| 5 | Referential recheck | The frozen manifests are rechecked against the restored graph, including `RESTRICT`, `SET NULL`, cascade, and application-level reference tables. |
| 6 | Transactional manifest-driven deletion | Only after all earlier gates pass, delete reset-only rows in dependency order under the final reviewed transaction/batch plan; stop on any mismatch or error without blind retry. |
| 7 | Independent postflight | Verify the owner account, all 101 protected claims and their closure, absence of reset rows, archive integrity, referential integrity, and application smoke checks. |

The sequence is intentionally **archive then restore proof, before any deletion**, with no exception. A successful archive command alone is insufficient. The restored copy must be independently readable and must prove that the exact archive can recover the frozen reset set while excluding the protected population.

## Authorization boundary

This fresh preflight is a completed read-only gate. It does **not** authorize a maintenance freeze, target-manifest creation, archive, export, restore rehearsal, transactional deletion, user deletion, claim deletion, configuration change, deployment, credential change, WorkOS work, or any other write. The next action requires explicit authorization for the **rehearsal-only** package, followed by a separate approval for any live deletion after the rehearsal evidence is reviewed.
