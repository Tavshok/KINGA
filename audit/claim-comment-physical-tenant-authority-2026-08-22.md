# Claim Comment Physical Tenant Authority Correction

## Live Database Finding

The live database metadata confirms that `claims` has the physical column `tenant_id`; it does **not** have `tenantId`. The existing raw comment-list SQL referenced `c.tenantId` and would fail, rather than silently apply an incorrect predicate.

The live database check was executed with `LIMIT 0` and returned:

> `ERROR 1054 (42S22): Unknown column 'c.tenantid' in 'field list'`

`claim_comments` deliberately differs: its claim foreign key is the physical column `claimId`, while its tenant scope is `tenant_id`. This batch preserves those real names.

## Corrected Authority Contract

| Path | Before | After |
|---|---|---|
| Claim comment list | `cc.tenant_id` plus invalid `c.tenantId` | `cc.tenant_id` and `c.tenant_id` with an inner claim join |
| Reply list | Comment tenant predicate only | Comment and parent-claim tenant predicates |
| Notification list / unread count / mark-all | Comment tenant predicate only | Comment and claim tenant predicates |
| Single mark-read | Inserted a read row by comment ID with no tenant gate | Insert-select permitted only when comment and claim both match session tenant |
| Resolve thread | Updated by comment ID with no tenant gate | Update join permitted only when comment and claim both match session tenant |

> **Never:** use logical property names such as `tenantId` or `claimNumber` in raw SQL. Use verified physical column names, and for a cross-record authority decision require the session tenant to match both the child record and the parent claim.

## Real-Database Acceptance

The new `claimCommentsTenantAuthority.p1.test.ts` creates a tenant-B claim and comment explicitly addressed to a tenant-A user. With tenant A’s session scope, it proves:

1. The foreign comment is not listed.
2. No read record is inserted.
3. No resolve action changes the comment.

Focused authority validation passed **5/5**. The full live-database suite completed with **8,649 passed, 20 failed, 3 skipped**, and one pre-existing worker-exit error. None of the remaining failures concerns the claim-comment authority path. The bundled server and Vite production builds both passed.

## Deliberate Scope

No schema, migration, DDL, tenant assignment, comment visibility policy, role policy, email policy, or notification content was changed. The existing rule on who may resolve a same-tenant comment is retained; this batch only prevents a foreign-tenant comment from being listed, marked read, or resolved.
