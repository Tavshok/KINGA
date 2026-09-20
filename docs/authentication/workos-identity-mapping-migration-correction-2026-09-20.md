# WorkOS Identity Mapping Migration Correction

**Status:** Source-only review package

## Purpose

This package closes a migration-chain gap. `users.workos_user_id` and `tenants.workos_organization_id` already exist in the TypeScript schema and disposable CI snapshot, but the historical Package A SQL was never registered as a numbered Drizzle migration. The migration chain therefore cannot create those additive fields in an environment that starts from the committed migration history.

## Included change

Migration `0063_workos_identity_mappings.sql` applies exactly four additive statements: it adds each nullable `varchar(128)` field and then adds its single-column unique index. The migration journal records the same tag. The existing source declarations and CI schema already express this target state and are intentionally unchanged.

## Explicit exclusions

This package does not apply any migration to `kinga_staging` or production. It does not configure WorkOS, set environment variables, activate any feature flag, link users, create organizations, issue sessions, change Manus login, or alter the existing WorkOS callback logic.

## Required proof

The guarded local proof starts from the disposable `kinga_ci_test` target only. It temporarily removes the two fields and indexes, applies migration 0063, then verifies field type, length, nullability, unique-index names and columns, duplicate non-null rejection, and acceptance of multiple `NULL` values. It cleans its named fixtures after verification. The normal isolated test runner then returns the target to the repository CI schema. The primary quality gate runs this proof immediately after provisioning the disposable database, so the DDL behavior is enforced rather than merely documented.

## Staging sequence after source approval

A future, separately authorized staging packet must pin the exact migration SHA-256, confirm that the columns and indexes are absent before application, apply only migration 0063, and verify the same metadata and null/unique behavior. WorkOS configuration remains a later gate: migration 0061/0063 and schema verification first, then provider configuration, then explicit feature-flag activation.
