# Live `users` Population Discrepancy Investigation

**Date:** 17 September 2026
**Author:** Manus AI
**Scope:** Read-only, aggregate-only investigation of the active Manus-hosted KINGA project database and read-only repository, process, and Git-history review.
**Classification:** **Confirmed synthetic/test contamination; exact historical writer unresolved.**

## Executive conclusion

The live `users` table is **not** a small human-account population supplemented by legitimate agency-assisted or unregistered claimant identities. It contains **44,885 rows**, of which **32,480 (72.36%)** sit in four identical-size duplicate-email cohorts. The four cohorts were generated in lockstep over the same 74 creation dates and every one of their 575 active minute-batches included all four cohorts. Their shared characteristics are a test-pattern external identifier, no recorded login method, no verified email, no valid tenant association, no unregistered-claimant flag, no agency-assisted identity link, no user-linked audit event, and a creation-time `lastSignedIn` value.

The anomaly is also broader than those four cohorts. Under the broader inspected marker definition, **41,183 of 44,885 rows (91.75%)** carry a test-pattern identifier or name. The residual population contains **8,703** users with a narrower `test` identifier or name marker, equal to **70.15%** of the 12,405 users outside the four dominant cohorts. It is therefore not safe to treat the 32,480 headline rows as the only affected population.

The data creation was **recently active**, with the last observed user row created at **11 September 2026 11:49:37**. A follow-up aggregate check found no later creation and no creation in the preceding 24 hours. This establishes that the incident had stopped, or at least left no new rows, by the time of this investigation. It does **not** prove that the unknown writer has been permanently removed or cannot resume.

No reviewed committed source contains a recurring 8,120-row, four-email generator. The evidence conclusively identifies synthetic/test contamination but does not responsibly attribute it to one committed script, route, person, or external credential. The most accurate conclusion is therefore: **recent historical synthetic/test contamination with an unresolved originating writer and an unclosed current access surface.**

This report does not recommend or authorize deletion, remediation, credential rotation, configuration change, source change, WorkOS activity, identity linking, or any database write. All such work remains paused.

## Investigation safeguards and limits

All database reads were aggregate-only. No direct user record, email, name, identifier, tenant identifier, external identity value, login-method literal, credential value, or database username was selected, retained, or reported. Cohorts are described only by their count and aggregate attributes.

The investigation could identify source-present write paths and active local processes. It could not enumerate every historical writer, externally held credential, database administrator, published-service secret binding, platform job history, or database session that may have existed before the check. The current project database principal is not a database-administration account and cannot provide a complete principal/grant census.

## Population findings

| Measure | Aggregate result | Meaning |
|---|---:|---|
| Total `users` rows | 44,885 | Far above the expected test-plus-admin account population. |
| Four 8,120-row duplicate-email cohorts | 32,480 | Dominant anomaly; 72.36% of all rows. |
| Other users | 12,405 | Residual population, also materially test-marked. |
| Rows with any inspected test marker | 41,183 | 91.75% of all rows under the broad identifier/name predicate. |
| Narrower test-marked rows outside the four cohorts | 8,703 | 70.15% of the residual population. |
| `is_unregistered_claimant = 1` | 0 | No live user is represented as the designed restricted claimant type. |
| Users linked to an agency-assisted claimant identity | 0 | No evidence of the intended agency-assisted identity model. |
| Users with a verified email | 4,301 | 40,584 rows are unverified or have no verified email. |
| Users with a valid tenant reference | 75 | Only a small subset is internally tenant-consistent. |
| Users with no tenant reference | 4,490 | Not tenant-mapped. |
| Users with a non-empty but unknown tenant reference | 40,320 | Most rows point to a tenant absent from the active `tenants` table. |
| Users referenced by at least one claim | 5,338 | Some affected rows were consumed downstream; this does not establish identity legitimacy. |
| Explicit QA-only rows | 15 | Matches the bounded committed QA seed utility. |

The intended agency-assisted path produces an insurer-tenant-bound claimant, sets `isUnregisteredClaimant = 1`, and creates a companion identity-link row.[1] The live population contains no rows with that flag and no linked identity rows. This rules out the proposition that the 44,885 users are predominantly intended non-login agency-assisted claimants.

The table has also historically been used as a generic principal reference for claims. However, claim linkage alone does not convert synthetic principal rows into valid claimant identities. Aggregate role and lifecycle evidence shows that referenced anomalous rows do not have the expected claimant/restricted-identity shape.

## Four dominant cohorts were created together

The four large duplicate-email cohorts each contain 8,120 rows. No identifier, email, or tenant value is shown below.

| Cohort property | Each cohort | Combined result |
|---|---:|---:|
| Row count | 8,120 | 32,480 |
| Creation date range | 12 February–11 September 2026 | Same across all four |
| Distinct creation dates | 74 | Same across all four |
| Active creation minutes | 575 shared minutes | Every active minute included all four cohorts |
| Largest combined minute batch | — | 224 rows |
| Test-pattern external identifier | 8,120 | 32,480 |
| Login method present | 0 | 0 |
| Verified email | 0 | 0 |
| Valid tenant reference | 0 | 0 |
| Unknown tenant reference | 8,120 | 32,480 |
| Unregistered-claimant flag | 0 | 0 |
| User-linked audit event | 0 | 0 |
| `lastSignedIn = createdAt` | 8,120 | 32,480 |

The lockstep minute-level result is especially strong evidence. All **32,480** cohort rows were written in minute-batches where all four opaque email groups were active. This is incompatible with independent organic account creation and strongly indicates a common batch process that created several distinct external identities while repeatedly assigning one of four email anchors.

The `test` marker is also not a loose inference. Every large-cohort row met the inspected `test` marker condition, while none met the alternate inspected `seed`, `dev`, `synthetic`, `load`, or `fixture` conditions. This does not expose the external identifier values; it classifies their common template family.

## Recent activity: stopped in the observed data, not proven contained

| Recency measure | Result |
|---|---:|
| Latest `users.createdAt` across the table | 11 September 2026 11:49:37 |
| Users created after that timestamp at follow-up check | 0 |
| Users created in the preceding 24 hours | 0 |
| Users created in the preceding seven days | 424 |
| Users created in the preceding 30 days | 7,868 |
| Users created from 8–11 September | 1,866 |
| Test-marked rows in that four-day period | 1,864 (99.89%) |
| Unknown-tenant rows in that four-day period | 1,742 (93.35%) |
| Login-method-absent rows in that four-day period | 1,866 (100.00%) |

The activity was not merely an old February test event. It continued through 11 September, including 124 rows on that date. It is reasonable to treat the incident as **historically recent**. It is not reasonable to state that it remains actively writing today, because the follow-up aggregate query showed no subsequent inserts. Conversely, no evidence was available to prove permanent cessation.

## Login evidence

The application OAuth callback exchanges an upstream authorization code, resolves upstream identity, upserts a local user, attempts an audit event with action `LOGIN_ROLE_RESOLVED`, then establishes the KINGA session.[2] The local audit write is non-fatal, and the marker existed only from 8 August 2026. It is therefore a conservative post-introduction lower bound, not a complete historic session ledger.

| Login-evidence measure | Result |
|---|---:|
| `LOGIN_ROLE_RESOLVED` events | 5 |
| Distinct local users represented | 1 |
| Audit-event period | 8–10 August 2026 |
| Large-cohort users with any user-linked audit event | 0 |
| Residual test-marked users with `LOGIN_ROLE_RESOLVED` audit event | 0 |
| Other users with `LOGIN_ROLE_RESOLVED` audit event | 1 |

The large cohorts have no audit trace at all. The residual test-marked population has some non-login audit activity associated with 825 users, but none of its 1,533 user-linked audit events is the authentication marker. This supports the conclusion that the anomalous users were used as principals in downstream activity without having passed the observed real-login flow.

`lastSignedIn` is not usable as evidence of completed authentication in this database. It is populated by a creation-time default in the current schema, and **44,807** rows have `lastSignedIn` exactly equal to `createdAt`; **41,308** of those also lack a login method. The four dominant cohorts all have this creation-time equality. Their value represents record initialization, not a login.

## Residual population is materially affected

The original dominant-cohort finding was not isolated. The residual 12,405 rows have the following aggregate characteristics.

| Residual measure | Result |
|---|---:|
| Users outside the four cohorts | 12,405 |
| Any broader inspected marker in external identifier or name | 8,705 |
| Narrower test-only marker in external identifier or name | 8,703 |
| Unknown tenant references | 7,840 |
| Unknown-tenant residual users with a broader marker | 4,310 |
| Login method absent | 8,904 |
| Login-method-absent residual users with a broader marker | 8,699 |
| Latest residual test-marked creation | 11 September 2026 11:49:37 |

Two residual literal test-identifier families are particularly notable. One comprises 4,222 rows, all verified-email but login-method-absent; the other comprises 1,441 rows, all unverified and almost entirely unknown-tenant. A third bounded group contains 991 unverified, unknown-tenant, login-method-absent rows. These are aggregate template families only; no direct identifier values are included. Together, they show that the anomaly comprises several synthetic identity shapes rather than only the four headline duplicate-email groups.

There are nine additional small duplicate-email groups containing 19 rows in total. None is test-marked under the inspected predicate. They do not alter the conclusion about the dominant event.

## Source and history review

The repository contains several legitimate or intentional mechanisms that can insert users. Their bounded scale and attribute shape explain a small number of visible records but do not reproduce the incident.

| Mechanism | Observed source behavior | Fit with the 32,480 cohort pattern |
|---|---|---|
| Agency-assisted claimant service | Creates a tenant-bound restricted claimant and identity link for an authenticated, scoped agency path. | **No fit.** The live cohorts lack the required flag, tenant shape, and identity link. |
| OAuth callback and shared upsert | Creates/updates one local account after upstream authorization. Email is not database-unique. | **No direct fit.** It has no test batching and cohorts lack login-method/audit characteristics. |
| WhatsApp engine | Can create one tenant-bound, unregistered claimant per completed claim journey; its identity is phone-derived and has no email. | **No fit** for repeated non-null email groups. |
| Invitation and assessor onboarding | Request-driven, tenant-bound single-user creation; duplicate-email races are structurally possible because email is not database-unique. | **No direct fit.** Neither contains a recurring bulk loop or fixed four-email pattern. |
| Fixed test-user seed | Bounded to six stable test accounts and idempotent. | **Too small and shape-mismatched.** |
| Root test-data seed | Bounded to five fixed users. | **Too small and shape-mismatched.** |
| Development seed | Bounded to two stable upserted users. | **Too small and shape-mismatched.** |
| QA seed | Bounded to 15 stable, disabled-login QA accounts with a dedicated teardown utility. | **Explains the 15 QA-only rows**, not the large cohorts. |
| Production-style data seed | Initially creates at most seven demo/operational users, then one claimant per generated claim in a fixed 50-claim run. Repeated manual runs can accumulate claimants. | **Plausible only as a generic residual-population contributor.** Its batch size, marker shape, verified-email/tenant attributes, and cadence do not match four 8,120 cohorts. |
| Provider and quote seeds | Finite collections of providers or up to a small number of existing-user lookups. | **No fit.** |
| Load-test harness | Generates request payloads; reviewed code has no direct `users` insert. | **No direct fit.** An unreviewed historical endpoint or external runner cannot be ruled out. |

The Git history confirms several small intentional seeds and a renamed production-style seed. It contains no user-writing scale constant of 8,120, no four-email batch structure, no recurring user-writing scheduler, and no source change adding a bulk user generator during 8–11 September. This eliminates the checked-in sources as an explanation for the exact observed process; it does not eliminate deleted, uncommitted, external, or manually executed material.

## Current write-capable access boundary

The table below states what was directly observed. “Unknown” means the current read-only investigation lacks authority or metadata visibility to enumerate the category, not that the category is absent.

| Channel | Present at inspection | Ability to write `users` | Evidence and limit |
|---|---|---|---|
| Managed project database principal | Yes | **Yes — all schema privileges** | The active project connection reports broad all-privilege access for the project schema. It was used only for aggregate reads during this investigation. |
| Five running KINGA development worktrees | Yes | **Yes, through the shared principal** | All five active server worktrees have the same live database target and the same non-reversible connection-string fingerprint. This is **one observed credential replicated across five processes**, not five independently confirmed credentials. |
| Main managed KINGA runtime | Yes | **Yes** | It is one of the five processes and exposes OAuth, invitation, onboarding, agency-assisted, and WhatsApp paths that can write users. |
| Published managed application | Not directly enumerated | Expected, but unverified | Architecture indicates it uses the project runtime environment; this inspection could not enumerate its running process or secret binding. |
| OAuth callback | Source-present and registered | Yes after valid upstream authorization | Inserts/updates one account at a time through local upsert. |
| Agency-assisted service | Source-present and registered | Yes for authorized agency/admin flows | Produces a correctly scoped restricted claimant; it does not match the anomaly. |
| WhatsApp public webhook | Source-present and registered | Potentially yes | No provider-signature verification was found in the reviewed handler. In the inspected local runtimes, normal provider credentials were absent, but that does not prove hosted deployment configuration. |
| WhatsApp test route | Source-present and registered | Potentially yes | The route has no session authentication, signature check, development-only guard, or source-IP guard in the reviewed code. It invokes the same engine and could create an unregistered claimant after an insurer-resolved claim journey. It was **not invoked**. |
| In-process background jobs | Active | No direct user write found | Reviewed jobs write claim/recovery/audit/notification data or read users for selection. No direct users-table mutation was found. |
| Manus task schedule | One discovered schedule, paused | No direct user write found | The discovered task is a recovery-deadline sweep, not user provisioning. |
| Seed/load/migration scripts | Present but not running | Potentially yes when manually launched with the database URL | No matching seed/load/migration process was active. Reviewed scripts do not explain the dominant cohorts. |
| External or historical credentials | Unknown | Unknown | The current connection cannot list all database accounts, grants, historical sessions, or external secret holders. |

The active server processes use one observed credential fingerprint. This materially narrows the earlier concern: there are **multiple active application processes**, but not evidence of multiple currently distinct local credentials. The shared principal nevertheless has sufficient privilege to alter `users` and the surrounding schema.

A metadata query against `information_schema.user_privileges` exposed only the current principal’s `USAGE` entry and is not a reliable full-account inventory. A complete credential census would require an explicitly authorized, read-only database-administration or hosting-platform access audit.

## Final assessment

| Question | Answer |
|---|---|
| Is the 44,885-row population mainly legitimate non-login claimant/driver data? | **No.** The expected claimant/agency flags, tenant binding, and identity-link records are absent. |
| Is contamination confined to the four 8,120 cohorts? | **No.** The residual population is substantially test-marked and shares malformed tenant/login characteristics. |
| Is this recent or historical? | **Recently historical.** Creation continued until 11 September; no later insertion was observed at follow-up. |
| Is an exact writer identified? | **No.** The data proves a coordinated synthetic process, but checked-in code does not reproduce it. |
| Is a current writer ruled out? | **No.** No new rows were observed, but current source/process access paths remain and historical/external writers cannot be enumerated from this account. |
| Does login evidence support a large human population? | **No.** Only one distinct local user reached the post-8-August OAuth audit marker; cohorts have none. |
| Are remediation, WorkOS work, schema changes, or database writes authorized by this result? | **No.** They remain explicitly paused. |

The immediate factual position is clear: the active project database contains a large, coordinated synthetic/test identity population that is not part of KINGA’s intended non-human claimant model. The source of the generator has not yet been proven. Until the owner decides otherwise, the investigation remains read-only and all corrective action remains out of scope.

## References

[1]: file:///home/ubuntu/kinga-replit/server/agency/agencyAssistedClaimantIdentity.ts "Agency-assisted claimant identity service"
[2]: file:///home/ubuntu/kinga-replit/server/_core/oauth.ts "KINGA OAuth callback implementation"
[3]: file:///home/ubuntu/kinga-replit/server/whatsapp/engine.ts "WhatsApp claimant provisioning engine"
[4]: file:///home/ubuntu/kinga-replit/server/whatsapp/webhook.ts "WhatsApp inbound and test route handlers"
[5]: file:///home/ubuntu/kinga-replit/server/_core/index.ts "KINGA HTTP route registration and scheduled bootstrap"
[6]: file:///home/ubuntu/kinga-replit/scripts/seed-qa-users.ts "Bounded QA user seed utility"
[7]: file:///home/ubuntu/kinga-replit/seed-test-users.mjs "Bounded fixed test-user seed utility"
[8]: file:///home/ubuntu/kinga-replit/server/scripts/seed-production-data.ts "Bounded production-style data seed utility"
[9]: file:///home/ubuntu/kinga-replit/load-test/run-load-test.ts "Load-test runner"
[10]: file:///home/ubuntu/kinga-replit/drizzle/schema.ts "Users schema declaration and identity constraints"
