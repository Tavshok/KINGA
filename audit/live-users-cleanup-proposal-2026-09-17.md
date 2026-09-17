# Live `users` Cleanup Proposal: Review Package

**Date:** 17 September 2026  
**Author:** Manus AI  
**Status:** **Proposal and read-only dry-run only. No export, backup, deletion, update, schema change, configuration change, or live endpoint call has been performed.**

## Decision requested

This package requests approval only for a future, tightly scoped execution packet. It does **not** request deletion authority.

The proposed first cleanup wave would delete only **35,085 unreferenced synthetic-marker users**. It deliberately does **not** delete, nullify, or reassign any claim. It also deliberately holds all user rows with a claim, an audit record, a database-enforced foreign-key reference, the owner identity, or the only observed completed-login identity.

This is a conservative partial cleanup. It leaves **9,800 users** after the proposed deletion rather than attempting to force the table to an expected handful. That result is intentional: the 5,332 candidate users linked to claims and other held identities require a separate evidence-led decision.

## Read-only dry-run result

The dry-run used the exact deterministic criteria in this document against the active project database. It selected **35,085** rows. The calculation is internally reconciled: 44,885 total users less 35,085 targets equals 9,800 retained users.

| Population segment | Users | Treatment in this proposal |
|---|---:|---|
| All current `users` rows | 44,885 | Baseline only; no change has occurred. |
| Users matching the explicit test marker | 41,183 | Not itself a deletion decision. Further safety gates apply. |
| Hold: candidate users linked to one or more claims | 5,332 | **Preserve user and claims.** |
| Hold: candidate users with audit-trail history after the claim hold | 461 | Preserve. |
| Hold: candidate users with an enforced user foreign-key reference after prior holds | 305 | Preserve. |
| Final proposed deletion set | **35,085** | Delete only after a separate approval and fresh preflight. |
| Expected remaining `users` rows | **9,800** | Post-delete count if the data is unchanged at execution time. |

The final target set contains no claim, audit-trail, audit-log, assessor-report, reviewer, claim-assignment, or claim-comment reference under the reviewed criteria. The same dry-run checks that **zero** records in those reviewed tables would be affected by deleting the 35,085 target users.

## Exact deletion criteria

A row is eligible only when it satisfies **every** condition below at execution time. The criterion is a literal SQL predicate, not a judgement that a row merely “looks synthetic.”

1. It contains the literal case-insensitive token `test` in either `users.openId` or `users.name`.
2. It has `is_unregistered_claimant = 0`.
3. Its tenant reference is absent or points to no current `tenants` row.
4. It is not the configured owner identity and it is not on a separately supplied, direct-match known-real allowlist.
5. It has no `LOGIN_ROLE_RESOLVED` audit event and no other `audit_trail` or `audit_logs` entry.
6. It has no `claims.claimant_id` reference.
7. It has no reference through any currently enforced user foreign key: `assessor_report_reviews.reviewer_user_id`, `assessor_reports.assessor_user_id`, `assessor_reports.attested_by_user_id`, `claim_assignments.assigned_by_user_id`, `claim_assignments.assigned_to_user_id`, or `claim_comments.author_user_id`.

The live database is a mixed-era schema. This proposal uses the physical column names confirmed from `information_schema`, including `openId`, `is_unregistered_claimant`, `claimant_id`, and `user_id`. The execution packet must re-run metadata verification and stop if these names or the enforced foreign-key inventory differ.

### Reviewable dry-run predicate

The following is expressed as a read-only selection. At execution, the candidate IDs must first be materialised in an execution-local temporary table and frozen by archive manifest before any delete statement is enabled. `:owner_open_id` and `:known_real_open_ids` are runtime values; they must never be written to source control, the report, a terminal transcript, or chat.

```sql
SELECT u.id
FROM users AS u
WHERE
  (
    LOWER(COALESCE(u.openId, '')) LIKE '%test%'
    OR LOWER(COALESCE(u.name, '')) LIKE '%test%'
  )
  AND u.is_unregistered_claimant = 0
  AND (
    u.tenant_id IS NULL
    OR u.tenant_id = ''
    OR NOT EXISTS (SELECT 1 FROM tenants AS t WHERE t.id = u.tenant_id)
  )
  AND u.openId <> :owner_open_id
  AND u.openId NOT IN (:known_real_open_ids)
  AND NOT EXISTS (
    SELECT 1
    FROM audit_trail AS at
    WHERE at.user_id = u.id
      AND at.action = 'LOGIN_ROLE_RESOLVED'
  )
  AND NOT EXISTS (SELECT 1 FROM audit_trail AS at WHERE at.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM audit_logs AS al WHERE al.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM claims AS c WHERE c.claimant_id = u.id)
  AND NOT EXISTS (
    SELECT 1 FROM assessor_report_reviews AS arr
    WHERE arr.reviewer_user_id = u.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM assessor_reports AS ar
    WHERE ar.assessor_user_id = u.id OR ar.attested_by_user_id = u.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM claim_assignments AS ca
    WHERE ca.assigned_by_user_id = u.id OR ca.assigned_to_user_id = u.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM claim_comments AS cc WHERE cc.author_user_id = u.id
  );
```

The dry-run verified that every selected row has an invalid or absent tenant reference: 2,769 have no tenant reference and 32,316 point to no current tenant. It also found that 3,151 selected rows have a verified email and all 35,085 are marked active. Those facts are why email verification, activity state, role, and absence of a login-method field are **not** used as deletion grounds. They are neither necessary nor reliable enough to supersede the stronger no-reference gates.

## Direct protection of known-real identities

The configured owner account was directly matched by its environment-held `OWNER_OPEN_ID` using a per-query salted SHA-256 comparison. No open ID was selected, stored, or displayed. The result was exactly one owner match and **zero** owner matches inside the 35,085 deletion set.

The only user with the observed `LOGIN_ROLE_RESOLVED` completed-login audit event directly overlaps that same owner match. It is therefore excluded by two independent gates: the explicit owner match and the audit-event exclusion. There is no additional known-real identity in the investigation record.

Before any future execution, the owner must provide any other known-real account identifiers that should be protected. The execution runner must directly match each supplied value against `users.openId`, add every match to an in-memory allowlist, and stop if any allowlisted user would otherwise enter the target set. Falling outside the synthetic predicate is **not** sufficient evidence of protection.

## Claims decision: preserve, do not nullify or delete

The 3,794 large-cohort users referenced by claims are not included in the proposed deletion set. They are part of a larger hold group of **5,332** marker users linked to **9,736 claims**. The 3,794 large-cohort users link to 7,588 of those claims; the residual marker users link to 2,148. A user links to at most three claims.

The claims cannot be classified safe to delete from the current evidence. Only 1,132 of 9,736 linked claims have a visible `test` marker in the limited claim-reference fields inspected. The other 8,604 do not. More importantly, the held claims include 4,878 at comparison, 1,897 at repair assignment, 1,177 completed or closed, and a further population in assessment, intake, and analysis states. Deleting or nullifying these relationships would be a material claim-record action, not an identity cleanup.

> **Decision in this proposal:** preserve all 9,736 linked claims unchanged and preserve their 5,332 linked user rows. Do not nullify `claimant_id`, do not reassign it, and do not cascade-delete any claim, report, assignment, document, quote, or downstream record.

A later claim-level remediation, if desired, must be separately authorised and backed by claim-specific evidence. It cannot inherit authority from this user-only proposal.

## Backup and recovery design for a future execution

No export or backup occurs under this proposal. If deletion is later authorised, the exact target rows must be archived immediately before the delete in a controlled run, after the fresh dry-run count passes and before any mutation.

The archive must contain the complete `users` rows for the frozen target IDs, including the original primary keys and all nullable fields, plus a separate manifest of target IDs, target count, extraction timestamp, schema fingerprint, and SHA-256 hashes of the encrypted archive and manifest. It must be encrypted before leaving the execution host and stored in owner-controlled secure storage with access restricted to the named operator and owner. Raw user rows, identifiers, emails, password hashes, or archive contents must not be committed to GitHub, added to audit documentation, pasted into chat, or placed in the project workspace.

The execution packet must prove that the archive count equals the frozen target count of the fresh dry-run, the archive hash is recorded, and a restore rehearsal to an isolated recovery target can read the archived rows and reproduce the same row count. The original database must not be used for a restore rehearsal. The restore procedure must preserve original user IDs and must be retained until the owner accepts the post-deletion verification.

## Future execution sequence and stop conditions

The following sequence is proposed for a later, separately authorised window. It is intentionally not executable authority today.

| Step | Required control | Stop condition |
|---|---|---|
| 1. Fresh metadata and count preflight | Confirm the physical column names, six user foreign keys, target criteria, target count, total user count, owner match, known-real allowlist matches, and claim hold count. | Any schema drift, count drift, allowlist candidate overlap, or unexpected target relation stops the run. |
| 2. Freeze target set | Create an execution-local target-ID set from the approved predicate in a transaction and compute its count and manifest hash. | Frozen count differs from the approved fresh dry-run; stop. |
| 3. Encrypted export | Export complete target rows and target manifest immediately before deletion; verify encryption, count, hash, protected storage location, and isolated restore rehearsal. | Missing, unreadable, unencrypted, count-mismatched, or unrestorable archive; stop. |
| 4. Referential recheck | Re-run all claim, audit, and foreign-key anti-joins against the frozen IDs. | Any non-zero affected reference; stop. |
| 5. Transactional deletion | Delete only rows whose IDs are in the frozen set. No `DELETE` predicate may be recomputed loosely at this point. | Deleted-row count differs from frozen target count; rollback and stop. |
| 6. Post-deletion verification | Verify target IDs no longer exist, total rows equal preflight total minus deleted rows, owner and allowlisted accounts remain, and all relation anti-joins remain zero. | Any mismatch, missing protected account, orphaned reference, or unanticipated claim change; stop and restore from archive only under fresh authority. |

The execution runner must use a single controlled database connection with transaction handling appropriate for the database engine. It must never disable foreign-key checks, alter constraints, disable audit controls, or use a blanket `DELETE FROM users`. The deletion must be keyed exclusively to the archived frozen ID set.

## Required post-deletion verification

The future postflight must establish, at minimum, the following aggregate results without printing user records or personal data.

| Assertion | Expected result for the current dry-run |
|---|---:|
| Deleted rows | 35,085 |
| Remaining `users` rows | 9,800 |
| Remaining rows matching the frozen target-ID set | 0 |
| Owner direct match | 1 retained |
| Any allowlisted known-real user in deleted set | 0 |
| Claims, reports, assignments, comments, audit-trail events, and audit-log records pointing to a deleted target | 0 |
| Claims with a now-missing claimant user due to this cleanup | 0 |
| Archive count and encrypted archive hash | Equal to frozen manifest count and hash |

The final report must also state the count of held users and held claims, rather than presenting the cleanup as complete remediation. Under the current evidence, the 5,332 claim-linked users, 461 audit-linked users, and 305 foreign-key-held users remain unresolved and preserved.

## What this proposal does not authorize

This package does not authorize deletion, backup/export creation, a restore rehearsal, database writes, claims cleanup, claim reassignment, `claimant_id` nullification, schema changes, WorkOS linking, provider configuration, credential changes, or Twilio deployment activity. It does not change the separate pause on the Twilio Console/callback review, live deployment preflight, or daily monitor.

## References

[1]: file:///home/ubuntu/kinga-replit/audit/live-user-population-discrepancy-investigation-2026-09-17.md "Live users population discrepancy investigation"
[2]: file:///home/ubuntu/kinga-replit/drizzle/schema.ts "KINGA source schema and user relationship declarations"
[3]: file:///home/ubuntu/kinga-replit/server/_core/oauth.ts "KINGA OAuth callback audit-event implementation"
[4]: file:///home/ubuntu/kinga-replit/server/agency/agencyAssistedClaimantIdentity.ts "Agency-assisted claimant identity service"
