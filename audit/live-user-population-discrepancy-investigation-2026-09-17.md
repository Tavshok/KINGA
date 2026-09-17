# Live `users` Population Discrepancy Investigation

**Date:** 17 September 2026  
**Scope:** Read-only, aggregate-only investigation of the active Manus-hosted KINGA project database  
**Classification:** **Attributable synthetic/test contamination; exact historical writer unresolved**

## Conclusion

The live `users` population is **not consistent with a small number of human accounts plus a large, legitimate population of agency-assisted or unregistered claimant identities**. The four anomalous duplicate-email cohorts account for **32,480 of 44,885 rows (72.4%)**. Every one of those rows has a test-pattern `openId`, no login method, no verified email, no valid tenant reference, and a `lastSignedIn` timestamp equal to its creation timestamp. They are not marked as unregistered claimants, are not linked to agency-assisted claimant identities, and have no OAuth role-resolution audit event.

The evidence supports a high-confidence finding that these cohorts are **synthetic/test contamination in the active project database**. The database pattern shows recurring creation across 74 dates between 12 February and 11 September 2026, rather than one isolated bulk insert. The present repository contains several seed and load-test utilities, but the reviewed committed sources do **not** contain a generator that explains four recurring 8,120-row cohorts or their exact test-pattern identity shape. Therefore, the precise historical script, workflow, or external writer remains unresolved.

This report makes **no cleanup, deletion, linking, migration, or remediation recommendation**. WorkOS Package B, WorkOS setup, Package A staging application, provider flags, identity linking, and all database writes remain paused and unauthorized.

## Scope and safeguards

The investigation used aggregate SQL only. It did not select or record any direct user record, email, name, user ID, tenant ID, `openId`, login-method value, or other direct identifier. Cohorts are identified only by opaque ordinal labels and group sizes. Source review was read-only.

The active database uses a legacy mixed physical naming contract. In particular, the live table exposes `loginMethod`, `openId`, `createdAt`, and `lastSignedIn`, while later source conventions contain some snake-case mappings. This was confirmed through metadata-only inspection and was accounted for in the aggregate queries.

## Aggregate population findings

| Measure | Aggregate result | Interpretation |
|---|---:|---|
| Total `users` rows | 44,885 | Far above the owner’s expected small test-plus-admin population. |
| Users in four 8,120-row duplicate-email cohorts | 32,480 | The dominant anomalous population, representing 72.4% of all rows. |
| Other users | 12,405 | A residual population requiring separate classification if a later decision authorizes it. |
| `is_unregistered_claimant = 1` | 0 | No live row uses the designed restricted-claimant flag. |
| Users linked to `agency_assisted_claimant_identities` | 0 | No row is evidenced as an agency-assisted restricted or linked identity. |
| Users referenced by at least one claim as claimant | 5,338 | A claim foreign-key reference exists, but it does not establish that the user is a legitimate claimant identity. |
| Users with verified email | 4,301 | 40,584 are unverified or null. |
| Users with no tenant reference | 4,490 | These are not tenant-mapped. |
| Users with a non-empty tenant reference absent from `tenants` | 40,320 | The dominant tenant-reference condition is orphaned/unknown. |
| Users with a valid tenant reference | 75 | This is the only small, internally consistent tenant-mapped subset. |
| Users marked QA-only | 15 | This exactly matches the committed QA seed utility’s fixed role set. |

The aggregate relationship evidence is decisive against the proposed legitimate non-login explanation. The current agency-assisted claimant path creates a user with a claimant role, an insurer tenant, `isUnregisteredClaimant = 1`, and a corresponding agency-assisted identity record. The live population has **none** of those attributes or links.[2] Consequently, the 44,885 rows cannot be explained as the intended agency-assisted claimant mechanism.

The table is nevertheless used as a generic principal/foreign-key store in some historical paths: 5,338 rows are referenced by claims. However, every one of those referenced rows falls into the aggregate **non-claimant-role** category, and none is flagged as an unregistered claimant. This is evidence of a legacy/synthetic data-shape problem, not evidence that the large cohorts are valid non-login claimant identities.

## The four anomalous duplicate-email cohorts

The table below uses four opaque cohort labels. It contains no email, `openId`, user ID, or tenant ID.

| Opaque cohort | Rows | Creation period | Distinct creation dates | `lastSignedIn = createdAt` | Login method present | Verified email | Active | Valid tenant | Unknown tenant | Test-pattern `openId` |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Cohort 1 | 8,120 | 12 Feb–11 Sep 2026 | 74 | 8,120 | 0 | 0 | 8,120 | 0 | 8,120 | 8,120 |
| Cohort 2 | 8,120 | 12 Feb–11 Sep 2026 | 74 | 8,120 | 0 | 0 | 8,120 | 0 | 8,120 | 8,120 |
| Cohort 3 | 8,120 | 12 Feb–11 Sep 2026 | 74 | 8,120 | 0 | 0 | 8,120 | 0 | 8,120 | 8,120 |
| Cohort 4 | 8,120 | 12 Feb–11 Sep 2026 | 74 | 8,120 | 0 | 0 | 8,120 | 0 | 8,120 | 8,120 |
| **Combined** | **32,480** | **12 Feb–11 Sep 2026** | **74** | **32,480** | **0** | **0** | **32,480** | **0** | **32,480** | **32,480** |

Each cohort has 8,120 distinct opaque `openId` fingerprints. The repeated email-group size therefore does not represent a single identity duplicated verbatim; it represents a systematic generation process that assigned many unique synthetic identifiers to each of four repeated email anchors.

The creation distribution is not compatible with a single accidental import. Each cohort spans the same 74 calendar dates over roughly seven months, with near-identical start and end timestamps. This is more consistent with a recurring seed, fixture, test, or other automated writer that repeatedly targeted the active database.

The cohort test marker is specific at aggregate level: all 32,480 rows match the `test` marker class; none match the inspected `seed`, `dev`, `synthetic`, `load`, or `fixture` marker classes. This identifies them as test-pattern records without disclosing the values themselves.

A total of 3,794 large-cohort users are referenced by a claim, while 28,686 are not. None has the claimant role in the aggregate classification. Claim references therefore show that some synthetic user records were consumed by downstream claim data, but they do not transform the synthetic users into legitimate claimant identities.

## Login evidence and the `lastSignedIn` limitation

The current OAuth callback performs these steps in order: it exchanges the upstream authorization code, retrieves upstream user information, upserts the local user with a current `lastSignedIn` value and a login method, then attempts to write a `LOGIN_ROLE_RESOLVED` audit event.[1] The audit event is written after the local upsert but before the session JWT is created and the browser is redirected. Its failure is explicitly non-fatal.[1]

The audit marker was introduced on 8 August 2026.[3] The live aggregate evidence is:

| Audit measure | Result |
|---|---:|
| `LOGIN_ROLE_RESOLVED` audit events | 5 |
| Distinct local users represented by those events | 1 |
| First such event | 8 August 2026 |
| Last such event | 10 August 2026 |
| Audit-backed users inside the 32,480 large cohorts | 0 |
| Audit-backed users outside the large cohorts | 1 |

This is a **conservative lower bound**, not an exact historic completed-login count. It proves that one local user reached the upstream OAuth identity-resolution and local-audit stage five times after the marker was introduced. It cannot prove that no other user completed a session because the marker did not exist before 8 August and the audit write may fail without blocking session issuance.

`lastSignedIn` cannot be used as login evidence in this database. The source declaration supplies a creation-time default, and the live data confirms the resulting artifact:[4]

| `lastSignedIn` relation to `createdAt` | Users | Login method absent |
|---|---:|---:|
| Exactly equal | 44,807 | 41,308 |
| Different | 78 | 76 |
| Null | 0 | — |

The four large cohorts all fall in the first category. Their `lastSignedIn` value documents row creation/default assignment, not a real authentication event.

## Source-path assessment

The repository contains legitimate paths that can create users, but none of the reviewed sources explains the four 8,120-row cohorts.

| Source or path | What it can create | Fit with 32,480 cohort pattern |
|---|---|---|
| Agency-assisted claimant identity service | One restricted claimant identity per agency-client/insurer combination; claimant role, tenant association, `isUnregisteredClaimant = 1`, and identity-link record | **No fit.** All four live cohorts lack every expected attribute and there are zero linked identities.[2] |
| OAuth callback | A local user based on upstream identity, including login method and current `lastSignedIn`; now emits a post-upsert audit marker | **No fit.** Cohorts have no login method or audit marker, and their timestamps equal creation defaults.[1] |
| QA seed utility | Exactly 15 explicit QA-only users under a synthetic QA tenant | **Explains the 15 QA-marked rows only**, not the 32,480 cohorts.[5] |
| Test-user seed utility | Six explicit test users with a test login method | **Too small and shape-mismatched.** It does not generate repeated 8,120-row groups.[6] |
| Production-grade test-data script | Five processors, one manager, one executive, and one claimant per generated claim; configured for 50 claims | **Too small and shape-mismatched.** Its created claimants are marked verified and use a fixed demo tenant.[7] |
| Bulk-claim/image seed utilities | Select existing users and create a fixed 20 test claims | **Does not create users.** It may explain some downstream claim links but not user rows.[8] [9] |
| Load-test harness | Generates claim payloads and invokes claim APIs, with a default of 1,000 claims | **No direct `users` insert in the reviewed harness.** It cannot itself explain the user rows, although an unreviewed historical API implementation or external runner cannot be excluded.[10] |

The reviewed committed sources contain no 8,120-scale configuration and no exact four-cohort generator. This does not prove that such a writer never existed: it could have been deleted, run from an uncommitted workspace, executed externally, or supplied through a historical endpoint that has since changed. It does establish that the active repository’s known seed/load utilities are insufficient to account for the observed population.

## Classification and boundaries

The correct classification is **attributable synthetic/test contamination with unresolved exact writer**.

The result is stronger than a generic “unexplained population” finding because the dominant rows carry a uniform test-pattern identity marker and a uniformly synthetic lifecycle shape. It is not yet a full causal attribution to one committed script because no reviewed source reproduces the exact cardinality, duplicate grouping, cadence, or full attribute pattern.

The residual 12,405 users were not individually investigated. They include 15 explainable QA rows and 4,301 verified-email rows, but they also retain 7,840 unknown tenant references and 8,904 absent login methods. Their presence does not reduce the conclusion about the dominant 32,480-row test population.

No read, analysis, or report conclusion should be interpreted as authorization to alter user records, claims, tenants, identity mappings, schema, provider configuration, or WorkOS settings.

## Status

**Paused and unauthorized pending owner direction:**

- WorkOS Package B and all provider-adapter work.
- WorkOS account, organization, secret, dependency, callback, flag, or user-import work.
- Package A staging application.
- Any identity linking, duplicate remediation, user cleanup, claim cleanup, tenant repair, or database write.
- Any production or staging schema/data operation.

## References

[1]: file:///home/ubuntu/kinga-replit/server/_core/oauth.ts "KINGA OAuth callback implementation"
[2]: file:///home/ubuntu/kinga-replit/server/agency/agencyAssistedClaimantIdentity.ts "Agency-assisted claimant identity service"
[3]: file:///home/ubuntu/kinga-replit/server/_core/oauth.ts "OAuth audit marker introduction, committed 8 August 2026"
[4]: file:///home/ubuntu/kinga-replit/drizzle/schema.ts "Users schema declaration and timestamp defaults"
[5]: file:///home/ubuntu/kinga-replit/scripts/seed-qa-users.ts "Idempotent QA user seed utility"
[6]: file:///home/ubuntu/kinga-replit/seed-test-users.mjs "Test user seed utility"
[7]: file:///home/ubuntu/kinga-replit/server/scripts/seed-production-data.ts "Production-grade test-data seed utility"
[8]: file:///home/ubuntu/kinga-replit/scripts/execute-bulk-seed.ts "Bulk claim seed utility"
[9]: file:///home/ubuntu/kinga-replit/scripts/seed-claims-with-images.ts "Image-backed claim seed utility"
[10]: file:///home/ubuntu/kinga-replit/load-test/run-load-test.ts "Load-test runner"

## Addendum: recent activity, residual contamination, and write-access boundary

**Added:** 17 September 2026
**Scope:** Further read-only, aggregate-only investigation following the owner’s request. No endpoint was invoked, no credential was disclosed, and no database or configuration write occurred.

### Is the population still being written?

The evidence supports the classification **recently active, but not proven ongoing today**.

| Recency measure | Result |
|---|---:|
| Latest `users.createdAt` across the full table | **11 September 2026 11:49:37** |
| Users created today | 0 |
| Users created yesterday | 0 |
| Users created in the preceding seven days | 424 |
| Users created in the preceding 30 days | 7,868 |

Creation was visibly active from 8–11 September, rather than being a distant historical incident:

| Creation date | Users created | Test-pattern `openId` | Unknown tenant reference | No login method |
|---|---:|---:|---:|---:|
| 11 September | 124 | 116 | 116 | 124 |
| 10 September | 300 | 280 | 280 | 300 |
| 9 September | 660 | 616 | 616 | 660 |
| 8 September | 782 | 728 | 730 | 782 |

This does **not** prove that a writer remains active on 17 September. It establishes that the abnormal pattern continued as recently as six days before this check. Proving cessation would require a later aggregate-only recency check or database-level audit data that attributes writes to a session/principal; neither was created or enabled during this investigation.

### Residual 12,405-user population

Contamination is materially broader than the four headline 8,120-user duplicate-email cohorts.

| Residual-population measure | Result | Share of relevant residual subset |
|---|---:|---:|
| Users outside the four large cohorts | 12,405 | 100.0% |
| Users with any inspected test marker in `openId` or name | 8,705 | 70.1% |
| Users with an unknown tenant reference | 7,840 | 63.2% |
| Unknown-tenant users with any inspected test marker | 4,310 | 55.0% of unknown-tenant users |
| Users with no login method | 8,904 | 71.8% |
| Login-method-absent users with any inspected test marker | 8,699 | 97.7% of loginless users |
| Latest residual test-marked creation timestamp | **11 September 2026 11:49:37** | — |

The residual investigation reinforces, rather than weakens, the contamination conclusion. A substantial portion of the non-headline population carries the same broad test marker and lifecycle characteristics. It is not defensible to frame only the 32,480 records as affected and assume the remaining 12,405 are clean.

### Verified current write-capable channels

The following inventory distinguishes what was directly observed from what the current database account cannot reveal. It intentionally names no credential values, database usernames, host names, or individual user identities.

| Channel | Present now? | `users` write capability | Evidence and boundary |
|---|---|---|---|
| **Managed project database principal** | Yes | **Yes — full schema privileges** | The currently connected managed project principal reports `ALL PRIVILEGES` for the active project schema. This is sufficient to insert, update, and delete `users`. The same privileged connection was used only for read-only aggregate investigation queries. |
| **Main managed KINGA runtime** | Yes | **Yes** | The current running KINGA server receives `DATABASE_URL` and uses a shared mysql2/Drizzle pool. It exposes normal OAuth, invitation, onboarding, tenant-admin, agency-assisted, and WhatsApp application paths that can mutate `users`.[1] |
| **Four additional running KINGA development worktrees** | Yes | **Yes** | Four separate historical/parallel KINGA server worktrees were found running alongside the managed workspace. All five live server worktrees have the same active project database injected through `DATABASE_URL` and are listening locally. They are distinct processes but not known to be distinct database credentials. |
| **Published managed application service** | Expected by deployment design; not independently enumerated as a local process | **Yes, if it uses the project runtime environment** | The published KINGA service is designed to use the same project `DATABASE_URL`. Its running process/secret binding is not exposed through this read-only inspection, so this remains an architectural inference rather than an independently listed session. |
| **Authenticated OAuth callback** | Source path present | **Yes** | On a successful upstream callback, the route calls local user upsert and updates sign-in activity. This path should be expected to create/update legitimate human accounts when authentication occurs.[2] |
| **Agency-assisted claimant service** | Source path present | **Yes** | This is the intended non-human claimant creation path. It produces an insurer-tenant-bound claimant with `isUnregisteredClaimant = 1` and an identity-link row. The anomalous population does not match it.[3] |
| **WhatsApp inbound handlers** | Routes registered in every running source instance; provider credentials absent in inspected runtimes | **Potentially yes** | The source registers public webhook and test routes. Both can reach the WhatsApp engine, which inserts a tenant-bound unregistered claimant when claim submission resolves a tenant and no existing claimant is found.[4] No Twilio credential variables were present in the inspected running servers, so normal Twilio delivery is not configured there. |
| **Unauthenticated WhatsApp test endpoint** | Source route present and registered | **Potentially yes — material exposure** | `POST /api/whatsapp/test` is registered without an authentication or provider-signature check in the inspected source and calls the same incoming-message engine. The route was **not invoked** because doing so could write data. Its ability to complete a user insert depends on supplied message/session data resolving a tenant; this was not tested. |
| **Runtime background jobs and the recorded task schedule** | Yes, but no observed `users` write | **No direct `users` mutation found** | Active in-process intake, stuck-assessment, and recovery jobs were reviewed and contain no direct `users` insert/update/delete. The only discovered Manus task schedule is paused and is a recovery-deadline sweep, not a user-provisioning task. |
| **Seed/load/migration scripts** | Available in repository; none running | **Potentially yes if someone executes them with `DATABASE_URL`** | Several tracked scripts consume `DATABASE_URL`, including seed utilities. No seed, load-test, or migration process was found running at inspection time. The reviewed scripts do not explain the observed 8,120-row cohorts. |
| **External database credentials or historical writers** | **Not enumerable from this connection** | Unknown | The current principal is not a database-administration account and cannot list other database accounts or their grants. No row-level write audit is available in the inspected data. Therefore this investigation cannot prove that no external credential, deleted script, former workspace, or historical integration also wrote to the database. |

### Important observations about the access boundary

The database metadata confirms the current managed principal has broad schema privileges; it does **not** enumerate other accounts. The absence of table-level grants in visible metadata is not evidence that no other schema-level or database-admin principal exists. A complete credential census would require an explicitly authorized, read-only database-administration inspection or hosting-platform credential audit.

The five running server worktrees are a material operational concern because each receives the live database URL and runs code capable of mutating the active project schema. This finding does not establish that any of those processes caused the synthetic rows. It establishes that the active database is presently reachable from more running code instances than the single managed workspace alone.

The direct WhatsApp test endpoint is a separate present-tense exposure. Its code path is inconsistent with the intended WorkOS/identity safety boundary because it can reach the same user-creation logic without a verified upstream provider callback. This is a finding only; no route was disabled, protected, exercised, or changed.

### Updated conclusion

The user population issue must be treated as a **recently active data-integrity and access-control investigation**, not a historical cleanup exercise. The pattern continued through 11 September, spans both dominant and residual user groups, and the current live database still has multiple active application-process access paths plus a broad-privilege managed principal.

No remediation is authorized by this conclusion. The same pause remains in effect: no cleanup, deletion, credential rotation, route change, source change, configuration change, WorkOS activity, or database write has been performed or is implied.

[1]: file:///home/ubuntu/kinga-replit/server/db.ts "Shared live database pool and user helpers"
[2]: file:///home/ubuntu/kinga-replit/server/_core/oauth.ts "OAuth callback user upsert path"
[3]: file:///home/ubuntu/kinga-replit/server/agency/agencyAssistedClaimantIdentity.ts "Agency-assisted claimant user provisioning"
[4]: file:///home/ubuntu/kinga-replit/server/_core/index.ts "WhatsApp route registration"; file:///home/ubuntu/kinga-replit/server/whatsapp/webhook.ts "Unauthenticated WhatsApp handlers"; file:///home/ubuntu/kinga-replit/server/whatsapp/engine.ts "WhatsApp claimant provisioning"
