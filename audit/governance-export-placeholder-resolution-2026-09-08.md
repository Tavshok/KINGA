# Governance Export Placeholder Resolution — 2026-09-08

## Evidence and decision

The three tenant- and role-gated governance export procedures returned a successful PDF, CSV, or legacy data response constructed entirely from fixed zero metrics and empty arrays. The router comments explicitly identified those values as a temporary frontend-contract placeholder. A codebase trace found no client invocation of these procedure symbols, and no export action was found in the present governance UI components.

The available dashboard queries have independently calculated last-30-day ranges and distinct aggregation semantics. Recombining them without a dedicated single-period, tenant-scoped aggregation contract would risk inconsistent periods, duplicated calculations, and another plausible-but-unverified report. The bounded safe correction is therefore to reject all three export procedures explicitly with `PRECONDITION_FAILED` until that contract is designed and validated.

This change makes no database, schema, workflow, claim, quote, report-renderer, or production-record modification. It preserves the existing tenant and privileged-role middleware, and it cannot emit a fabricated download.
