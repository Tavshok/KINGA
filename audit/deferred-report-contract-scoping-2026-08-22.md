# Deferred Report Contract Scoping Note

## Scope

This note records the raw-SQL report groups intentionally excluded from the tenant-scoped `ResolvedReportRecord` migration. They remain unchanged in this batch. The individual claim reports now use the tenant-scoped report record; the groups below require separate authority and aggregation contracts.

## 1. Platform Executive Dashboard

The platform dashboard aggregates claims and assessments across tenants. It cannot reuse `resolveReportCollection()` because that contract requires one session-derived tenant scope. A later `ResolvedPlatformReportCollection` must require a platform-super-admin authority decision, make global scope explicit in its type and audit record, and expose named aggregate measures rather than raw claim rows.

## 2. Subject Access Request and Privacy Reporting

The SAR path begins from a data-subject identity and can traverse claims, assessments, documents, quotes, notes, and recovery correspondence. It requires a separately authorised `ResolvedSubjectAccessCollection`; it must not become a tenant or platform data escape hatch.

Before implementation, the owner should approve the applicable requester verification, legal basis, response deadline, export scope, redaction rules for third-party information, immutable audit trail, retention period, and human release control. These are compliance and operational controls, not a normal report-rendering refactor.

## 3. Aggregate Portfolio, Fraud, and Dwell-Time Summaries

Tenant-scoped aggregate reports can eventually use `resolveReportCollection()` plus named summary functions, but the current collection summary does not yet model all status, incident-type, fraud, and duration measures used by the legacy renderers. A future batch should first define each numerator, denominator, time window, excluded record state, and tenant predicate before replacing current aggregation SQL.

## Boundaries

No code in these three groups was modified by the individual-claim report migration. Their direct SQL remains visible and separately auditable until the required contracts and authority models are approved.
