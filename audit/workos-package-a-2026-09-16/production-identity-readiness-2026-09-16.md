# WorkOS Identity Linking — Production Readiness Preflight

**Date:** 2026-09-16

## Scope and read-only boundary

This report records the owner-authorized, aggregate-only identity-linking preflight required before future WorkOS verified-email linking. It performed no insert, update, delete, schema operation, WorkOS call, provider setup, session operation, or staging action. It selected no names, email addresses, open IDs, tenant IDs, authentication tokens, or other direct personal data.

The active application `DATABASE_URL` connection was confirmed to target the Manus-hosted project database `YbS42LwGroxbVepAMjk4bS`, which is the current live user-data environment. It is distinct from the empty TiDB `KINGA-staging` target. The database exposes the expected `users` identity-readiness columns: `email`, `email_verified`, `is_active`, `tenant_id`, and `openId`.

## Aggregate findings

| Control | Result | WorkOS-linking interpretation |
|---|---:|---|
| Total users | 44,885 | Current live population assessed. |
| Users with a usable normalized email | 44,883 | Candidate records before verification and tenant gates. |
| Users without a usable email | 2 | Cannot be linked by the approved verified-email rule. |
| Duplicate normalized-email groups | 13 | Blocks automatic verified-email linking for all affected accounts. |
| Accounts in duplicate normalized-email groups | 32,499 | Material gate failure requiring classification and remediation policy. |
| Unverified-email users | 40,584 | Cannot be automatically linked under the approved verified-email-only rule. |
| Verified and active users | 4,301 | The maximum currently apparent population eligible for later individual linkage, still subject to duplicate and tenant gates. |
| Inactive users | 0 | No inactive-account exclusion currently applies. |
| Users mapped to an existing tenant | 75 | Only these rows currently meet the observed tenant-reference existence check. |
| Users with no tenant | 4,490 | Not eligible for the approved one-tenant-to-one-WorkOS-organization mapping. |
| Users referencing an unknown tenant | 40,320 across 8,817 distinct tenant values | Material tenant-integrity gate failure; cannot map automatically. |
| Current tenants | 5 | Live tenant table population at query time. |
| Tenants without users | 2 | Requires later tenancy review before organization linking. |
| Users without `openId` | 0 | Existing Manus local identity is complete for the queried population. |

## Duplicate-email distribution

The report intentionally does not disclose the email values. The 13 duplicate normalized-email groups comprise eight groups of two accounts, one group of three accounts, and four groups of 8,120 accounts each. The four largest groups account for 32,480 of the 32,499 affected accounts. Their scale strongly indicates that they must be classified before any automatic email-based linking; no inference about the cause is made in this report.

## Gate decision

> **The production identity preflight is not clean for automatic WorkOS account linking.** Future linking must remain disabled until a separately authorized remediation/exception policy resolves duplicate normalized-email groups, verifies email eligibility, and addresses absent or unknown tenant references. This does not invalidate Package A: its nullable columns are inert until a later explicitly authorized provider/linking package reads or writes them.

## Preserved boundaries

Package A remains source-review work only. The report does not authorize a TiDB staging migration, production schema change, WorkOS app/secret/redirect configuration, provider adapter, user import, Manus OAuth retirement, session switch, tenant change, data cleanup, or package B implementation.
