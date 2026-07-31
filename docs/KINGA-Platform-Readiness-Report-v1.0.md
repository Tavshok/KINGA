# KINGA Platform Readiness Report v1.0

**Classification:** Internal — Architecture Review  
**Date:** 31 July 2026  
**Author:** Chief Platform Architect  
**Status:** For Review and Decision

---

## Executive Summary

KINGA has reached a significant milestone. Epics 1, 2, and 3 are complete, all regression tests are passing, and the TypeScript baseline is stable. The platform now encompasses a nine-stage AI claims pipeline, a physics reconciliation engine, a forensic photo analysis subsystem, an agency valuation service, and a full engineering inspection workspace — a substantial body of work.

This review was commissioned to determine whether KINGA is ready to transition from feature development to platform-scale development. The answer is: **not yet, but the path is clear and the blockers are well-defined**.

The platform contains genuine architectural strengths — a well-designed physics pipeline, a sound tRPC contract layer, a coherent reporting registry, and a principled asset-centric inspection model. These are the foundations on which platform-scale development must be built. However, the audit has identified a set of structural issues that, if left unresolved, will compound with each subsequent Epic and make the platform progressively harder to maintain, test, and scale. The most critical of these — a SQL injection vulnerability in a production procedure, three parallel workflow engine implementations, and a 10,292-line monolithic router — must be resolved before platform-scale work begins.

The findings below are grounded entirely in what the codebase contains. Every line count, file name, and pattern cited is drawn from direct inspection of the live codebase. No assumptions have been made.

---

## Finding Classification

| Severity | Definition |
|---|---|
| **BLOCKER** | Must be resolved before platform-scale development begins. Represents a security vulnerability, data integrity risk, or architectural constraint that will cause compounding harm if carried forward. |
| **HIGH** | Should be resolved in the next planned sprint before new Epics are started. Represents significant technical debt, duplication, or a scalability constraint. |
| **MEDIUM** | Should be scheduled and resolved within two Epics. Represents inconsistency, coupling, or a quality concern that does not block immediate progress. |
| **LOW** | Should be addressed in a dedicated housekeeping sprint. Represents naming inconsistency, documentation gaps, or minor structural issues. |

---

## Section 1: Architecture

### Finding 1.1 — BLOCKER: SQL Injection Vulnerability in Production Procedure

**Location:** `server/routers.ts`, lines 159–176

A production tRPC query procedure constructs a raw SQL `WHERE` clause by directly interpolating a user-supplied `tenantId` integer into a template literal string, which is then passed to `db.execute()`. The specific pattern is:

```
const tenantFilter = input.tenantId
  ? `AND a.tenant_id = ${input.tenantId}`
  : (ctx.user.role === 'admin' ? '' : `AND a.tenant_id = ${(ctx.user as any).tenantId || 0}`);
```

While the `tenantId` field is declared as `z.number()` in the Zod schema — which provides type coercion — this does not constitute parameterised query protection. A crafted numeric payload or a type coercion bypass could produce a malformed query. More critically, the `(ctx.user as any).tenantId` cast bypasses TypeScript's type system entirely, meaning the value is unvalidated at the type level. The correct pattern is to use Drizzle's `eq()` operator or a parameterised `?` placeholder.

**Recommendation:** Replace the raw string interpolation with a Drizzle `and(eq(aiAssessments.tenantId, input.tenantId))` condition. Remove the `(ctx.user as any)` cast and read `tenantId` from the typed session context.

---

### Finding 1.2 — BLOCKER: Three Parallel Workflow Engine Implementations

**Locations:** `server/workflow-engine.ts`, `server/workflow.ts`, `server/workflow/state-machine.ts`

All three files declare themselves as the canonical workflow engine. `workflow-engine.ts` describes itself as "Single gateway for ALL claim state transitions." `workflow/state-machine.ts` describes itself as "the heart of the workflow governance system." `workflow.ts` provides a `transitionWorkflowState()` function used by at least one router. All three carry `// @ts-nocheck` at line 1.

The practical consequence is that different parts of the platform execute state transitions through different engines, with no guarantee that governance rules — segregation of duties, audit trail, role permission validation — are applied consistently. This is not a code quality issue; it is a data integrity risk. A claim could transition through an unguarded path.

**Recommendation:** Designate one engine as canonical (the `workflow/` directory is the most complete). Audit every call site for `transitionWorkflowState`, `executeTransition`, and direct `claims.status` updates across all routers. Migrate all call sites to the canonical engine. Delete the two redundant files. Remove `@ts-nocheck` from the canonical engine.

---

### Finding 1.3 — HIGH: 10,292-Line Monolithic Router

**Location:** `server/routers.ts`

The main router file contains 192 tRPC procedures and 152 direct database calls across 10,292 lines. This file is the single largest TypeScript file in the codebase, larger than the entire `pipeline-v2/` orchestrator (3,383 lines). It imports from at least 40 distinct modules and cannot be meaningfully reviewed, tested in isolation, or maintained without risk of cross-procedure interference.

The sub-router pattern already exists and is used correctly in `server/routers/` (28,805 lines across 22 files). The monolith predates this pattern and was never migrated.

**Recommendation:** Migrate the 192 procedures in `routers.ts` into domain-scoped sub-routers following the existing pattern. Suggested domains: `analytics`, `ingestion`, `assessment`, `documents`, `governance`, `notifications`, `system`. The migration should be incremental — one domain per sprint — to avoid a single high-risk refactor.

---

### Finding 1.4 — HIGH: 91 Production Files Carrying `@ts-nocheck`

**Scope:** 91 non-test TypeScript files in `server/` begin with `// @ts-nocheck`

This is the most widespread structural issue in the codebase. `@ts-nocheck` disables all TypeScript checking for the entire file, meaning the compiler provides no protection against type errors, null dereferences, incorrect function signatures, or schema mismatches in those files. Given that the platform's correctness depends on the type contract between the tRPC layer and the database schema, this represents a significant and systemic quality risk.

The files affected include core services: `workflow-engine.ts`, `workflow.ts`, `assessment-processor.ts`, `claim-routing-engine.ts`, `confidence-scoring-engine.ts`, `continuous-learning.ts`, and 85 others.

**Recommendation:** Establish a `@ts-nocheck` elimination programme. Prioritise files that are called from production procedures. Target zero `@ts-nocheck` in files that touch the database, the workflow engine, or the claims pipeline before platform-scale development begins. Track progress in `todo.md`.

---

### Finding 1.5 — HIGH: Legacy `pipeline/` Directory Coexists with `pipeline-v2/`

**Locations:** `server/pipeline/` (8 files), `server/pipeline-v2/` (236 files)

The legacy `pipeline/` directory contains `stage-2-classification.ts`, `stage-3-physics.ts`, `stage-4-hidden-damage.ts`, and `document-intelligence.ts` — all of which have direct equivalents in `pipeline-v2/`. It is not clear from the codebase whether any production code path still imports from `pipeline/`. If it does, claims may be processed through the legacy pipeline without the v2 enhancements. If it does not, the directory is dead code that creates confusion and inflates the test surface.

**Recommendation:** Audit all import paths. If `pipeline/` is unreachable from any production entry point, delete it. If it is reachable, document the call path and schedule migration to `pipeline-v2/`.

---

## Section 2: Database

### Finding 2.1 — HIGH: Dual Vehicle Valuation Services

**Locations:** `server/services/vehicleValuation.ts`, `server/insurance/valuation-engine.ts`

Two independent vehicle valuation implementations exist in the codebase. `server/services/vehicleValuation.ts` is a multi-source valuation service supporting Zimbabwe, Zambia, and South Africa markets, using LLM estimation and Facebook Marketplace data. `server/insurance/valuation-engine.ts` is the Epic 2/3 engine that uses the `vehicleMarketValuations` database table and claims history. Both expose a `getVehicleValuation`-style function. It is not documented which one is authoritative, and there is no cross-reference between them.

**Recommendation:** Designate `server/insurance/valuation-engine.ts` as the canonical engine (it is the one connected to the database and covered by tests). Audit all call sites of `server/services/vehicleValuation.ts`. If it provides unique capabilities (multi-source, LLM fallback), merge those capabilities into the canonical engine as additional data sources. Delete the redundant file.

---

### Finding 2.2 — HIGH: 64 Tables Without `tenant_id`

**Scope:** 187 total tables; 123 have `tenant_id`; 64 do not

Of the 64 tables without a `tenant_id` column, several are core operational tables: `claim_documents`, `audit_trail`, `approval_workflow`, `fraud_alerts`, `fraud_rules`, `cost_components`, `entity_relationships`, `extracted_document_data`, `extracted_repair_items`. These tables store data that is intrinsically tenant-scoped — a fraud alert belongs to a specific insurer's claim, a cost component belongs to a specific repair job — but the column does not exist to enforce that boundary at the database level.

The consequence is that tenant isolation for these tables depends entirely on application-level join logic (e.g., `JOIN claims ON claims.tenant_id = ?`). This is a fragile pattern: a single missing `WHERE` clause or incorrect join exposes cross-tenant data.

**Recommendation:** For each of the 64 tables, determine whether the data is tenant-scoped by nature. For those that are, add a `tenant_id` column and a corresponding index. For tables that are genuinely global (e.g., `currency_exchange_rates`), document them explicitly as global tables. This migration should be schema-additive (nullable column, backfilled, then constrained).

---

### Finding 2.3 — HIGH: `claim_documents` Missing `inspection_id` FK

**Location:** `drizzle/schema.ts`, `claim_documents` table

The Epic 3 Technical Design Specification approved an additive `inspection_id` column on `claim_documents` to link evidence to inspections. The column was not applied to the schema. The `inspections.ts` router currently has no mechanism to associate uploaded documents with an inspection, meaning the evidence linkage described in the specification is not implemented.

**Recommendation:** Add `inspection_id INT NULL REFERENCES inspections(id)` to `claim_documents` in `drizzle/schema.ts`, apply via SQL, and update the `inspections.ts` router's evidence upload procedure to populate it.

---

### Finding 2.4 — MEDIUM: `vehicleHistory` and `asset_registry` Are Parallel Asset Models

**Locations:** `drizzle/schema.ts` — `vehicle_history` table (Epic 1), `asset_registry` table (Epic 3)

The Epic 3 specification correctly identified that `asset_registry` should become the master asset index, with vehicles migrating into it over time. However, the migration path (dual-write → backfill → read migration → deprecation) has not been started. Both tables currently exist independently with no cross-reference. New inspections reference `asset_registry_id` (or fall back to `vehicle_registration`), but the vehicle data itself remains only in `vehicle_history`.

**Recommendation:** Begin Phase 1 of the approved migration plan: add `asset_registry_id INT NULL` to `vehicle_history` as a soft link. This creates the bridge without breaking any existing functionality and enables the backfill phase to be scheduled.

---

### Finding 2.5 — MEDIUM: Inconsistent Timestamp Storage

**Scope:** Mixed usage of `timestamp({ mode: 'string' })` and `timestamp({ mode: 'date' })` across the schema

The schema uses both timestamp modes inconsistently. `mode: 'string'` returns raw MySQL datetime strings; `mode: 'date'` returns JavaScript `Date` objects. Procedures that mix both modes in the same query will receive inconsistent types for `createdAt` fields, requiring defensive casting. The platform's datetime policy (stated in the README) mandates UTC-based Unix timestamps at the API layer, but the schema does not enforce this uniformly.

**Recommendation:** Standardise all timestamp columns to `timestamp({ mode: 'date' })` across the schema. This is a non-breaking change for Drizzle ORM consumers. Update any procedures that currently cast string timestamps to `new Date()`.

---

## Section 3: tRPC Routers

### Finding 3.1 — HIGH: Direct Database Calls Inside Router Procedures

**Location:** `server/routers.ts` — 152 direct `getDb()` / `db.*` calls inside procedure handlers

The architectural contract established by the template is: procedures call helpers in `server/db.ts`; `server/db.ts` calls the database. This separation ensures that database logic is testable in isolation, reusable across procedures, and not duplicated. The 152 direct database calls in `routers.ts` violate this contract. The same pattern appears in several sub-routers as well.

**Recommendation:** When migrating procedures from `routers.ts` to sub-routers (see Finding 1.3), enforce the rule that all database access goes through `server/db.ts` helper functions. No procedure handler should call `getDb()` directly.

---

### Finding 3.2 — MEDIUM: `server/db.ts` Is a 4,630-Line Monolith with 92 Functions

**Location:** `server/db.ts`

The query helper file has grown to 4,630 lines and 92 exported functions. While this is architecturally correct (procedures call helpers), the file itself has become too large to navigate. Functions for claims, users, panel beaters, assessments, appointments, documents, and inspections are all co-located with no internal organisation.

**Recommendation:** Split `server/db.ts` into domain-scoped files: `server/db/claims.ts`, `server/db/users.ts`, `server/db/documents.ts`, `server/db/inspections.ts`, etc. Re-export all functions from a barrel `server/db/index.ts` to maintain backward compatibility with existing import paths.

---

### Finding 3.3 — MEDIUM: `insurer` vs `insurer_admin` Role Name Inconsistency

**Scope:** `server/_core/domain-middleware.ts` uses `'insurer'`; `server/workflow/types.ts` uses `'insurer_admin'`; `server/routers/platform-user-roles.ts` `PLATFORM_ROLES` includes both

Two different strings are used to refer to what appears to be the same role. `INSURER_ROLES` in `domain-middleware.ts` includes `'insurer'`. The `InsurerRole` type in `workflow/types.ts` includes `'insurer_admin'`. The `PLATFORM_ROLES` array in `platform-user-roles.ts` includes both. This means that role-based access checks in different parts of the platform may produce different results for the same user depending on which string the user's record contains.

**Recommendation:** Audit the `users` table to determine which string is stored in production. Designate one as canonical (`insurer_admin` is more precise). Update all role arrays, middleware, and RBAC checks to use the canonical string. Add a database migration to normalise existing records.

---

## Section 4: Shared Services

### Finding 4.1 — MEDIUM: Confidence Scoring Implemented in Three Places

**Locations:** `server/services/confidence-scoring.ts`, `server/services/ingestion-confidence-scoring.ts`, `server/confidence-scoring-engine.ts`

Three separate confidence scoring implementations exist. Each computes a confidence value for a different domain (general assessment, ingestion pipeline, and engine-level), but there is no shared confidence model or normalisation contract between them. A score of 0.85 from one service does not carry the same meaning as 0.85 from another.

**Recommendation:** Define a shared `ConfidenceScore` type with a documented scale (0–1, where 1 is maximum confidence). Consolidate the three implementations into a single `server/services/confidence.ts` module with domain-specific sub-functions. Ensure all pipeline stages use the same scale.

---

### Finding 4.2 — LOW: Debug and Trigger Scripts Committed to Production

**Location:** `server/` root — `trigger-bmw-direct.ts`, `trigger-pipeline-6450001.ts`, `trigger-rerun-direct.ts`, `trigger-rerun-test.ts`, `voltron-query.ts`, `voltron-query2.ts`, `voltron-query3.ts`, `voltron-query4.ts`, `voltron-rerun.ts`, `debug-insert.test.ts`, `debug-test.ts`, `seed-production-data.ts`

Twelve debug, trigger, and seed scripts are committed at the server root. `voltron-query3.ts` is the source of the 47 persistent TypeScript errors in the baseline. These files are not imported by any production code path but are included in the TypeScript compilation scope, adding noise to the error baseline and creating confusion about what is production code.

**Recommendation:** Move all debug and trigger scripts to a `server/scripts/` directory and exclude that directory from `tsconfig.json` compilation. This will eliminate the 47 baseline TypeScript errors and clarify the production surface.

---

## Section 5: Intelligence Engines

### Finding 5.1 — MEDIUM: `pipeline/` and `pipeline-v2/` Physics Stages Are Not Reconciled

**Locations:** `server/pipeline/stage-3-physics.ts` (legacy), `server/pipeline-v2/stage-7-physics.ts` (current)

The legacy physics stage (`pipeline/stage-3-physics.ts`) and the current physics stage (`pipeline-v2/stage-7-physics.ts`) both exist and are both compiled. The legacy stage does not use the `PhysicsTruth` model, the `MeasurementSource` provenance hierarchy, or the `crossStageConsistencyEngine`. If any code path still routes through the legacy stage, physics results will be produced without the Epic 3 `ENGINEER_MEASUREMENT` source support and without the reconciliation layer.

**Recommendation:** This is a specific instance of Finding 1.5. Confirm that `pipeline/stage-3-physics.ts` is unreachable from all production entry points. If confirmed, delete it. If not confirmed, treat as a BLOCKER.

---

### Finding 5.2 — MEDIUM: `invokeLLM` Called Directly in 9 Procedures in `routers.ts`

**Location:** `server/routers.ts` — 9 direct `invokeLLM` calls

Nine procedures in the monolithic router call `invokeLLM` directly, bypassing the intelligence engine layer. This means LLM calls in these procedures do not benefit from the confidence scoring, calibration stability guard, or enrichment gate that pipeline-routed calls receive. It also makes these procedures impossible to test without a live LLM connection.

**Recommendation:** When migrating these procedures to sub-routers (Finding 1.3), route all LLM calls through the appropriate intelligence service rather than calling `invokeLLM` directly. For procedures that genuinely require ad-hoc LLM access, document the justification.

---

## Section 6: Physics Pipeline

### Finding 6.1 — LOW: `ENGINEER_MEASUREMENT` Not Yet in the Provenance Hierarchy Documentation

**Location:** `server/pipeline-v2/physicsTruth.ts`

The `ENGINEER_MEASUREMENT` source was added to `MeasurementSource` in Epic 3 (T2). However, the provenance hierarchy comment block in `physicsTruth.ts` — which documents the ranking of measurement sources — has not been updated to include the new source and its position in the hierarchy. The implementation is correct; the documentation is incomplete.

**Recommendation:** Update the provenance hierarchy comment in `physicsTruth.ts` to include `ENGINEER_MEASUREMENT` between `VGE_CALIBRATED` and `STAGE6_LLM_VISION` as specified in the Epic 3 design.

---

## Section 7: Evidence Model

### Finding 7.1 — HIGH: Three Document Tables with Overlapping Scope

**Locations:** `claim_documents`, `ingestion_documents`, `customer_documents` (schema)

Three document storage tables exist. `claim_documents` stores documents attached to claims. `ingestion_documents` stores documents processed through the ingestion pipeline (with `p_hash`, AI analysis results, and forensic flags). `customer_documents` stores documents uploaded by claimants. The boundaries between these tables are not formally documented, and there is no foreign key relationship between them. A single physical file uploaded by a claimant could legitimately exist in all three tables with no linkage.

**Recommendation:** Produce a formal Evidence Model document that defines the authoritative purpose of each table, the lifecycle of a document from upload to pipeline processing, and the cross-table linkage strategy. As a first step, add `ingestion_document_id INT NULL` to `claim_documents` to link the two most closely related tables.

---

## Section 8: Asset Model

### Finding 8.1 — MEDIUM: `asset_registry` Has No Indexes on Query-Critical Columns

**Location:** `drizzle/schema.ts` — `asset_registry` table (Epic 3)

The `asset_registry` table was created in Epic 3 with the correct columns but without indexes on the columns most likely to be used in queries: `asset_type`, `registration_number`, `owner_id`, and `tenant_id`. At small data volumes this is not observable, but as the table grows to hold vehicles, equipment, and infrastructure assets across multiple tenants, full-table scans on these columns will become a performance bottleneck.

**Recommendation:** Add composite indexes: `(tenant_id, asset_type)`, `(registration_number)`, `(owner_id)`. Apply via SQL migration.

---

## Section 9: Workflow Engine

### Finding 9.1 — BLOCKER: (See Finding 1.2)

The three parallel workflow engine implementations are classified as a BLOCKER under Architecture. The specific risk to the workflow domain is that claim state transitions executed through the unguarded paths (`workflow.ts` or direct `claims.status` updates in routers) do not produce `workflowAuditTrail` records. This means the audit trail is incomplete, which is a compliance risk for an insurance platform.

---

### Finding 9.2 — MEDIUM: Inspection Workflow States Not Integrated with Claims Workflow

**Location:** `server/workflow/types.ts` — new inspection states added in Epic 3

The five new inspection workflow states (`INSPECTION_SCHEDULED`, `INSPECTION_IN_PROGRESS`, `INSPECTION_COMPLETE`, `INSPECTION_REVIEW`, `INSPECTION_SIGNED_OFF`) were added to the `WorkflowState` type but are not integrated with the claims workflow transition graph. An inspection reaching `INSPECTION_SIGNED_OFF` does not automatically trigger any downstream claim state change (e.g., moving a claim from `UNDER_ASSESSMENT` to `ASSESSMENT_COMPLETE`). The two workflows are currently independent.

**Recommendation:** Define the integration points between the inspection workflow and the claims workflow. At minimum, `INSPECTION_SIGNED_OFF` should be able to trigger a configurable claim state transition. Implement this as a new transition in the canonical workflow engine.

---

## Section 10: Assignment Engine

### Finding 10.1 — LOW: `assignInspection()` Geographic Proximity Logic Is a Stub

**Location:** `server/workload-balancing.ts` — `assignInspection()` function (Epic 3, T6)

The `assignInspection()` function was implemented in Epic 3 with geographic proximity as a selection criterion. However, the proximity calculation uses a simplified Euclidean distance on raw latitude/longitude values rather than a proper Haversine formula. For the distances involved in insurance inspection assignments (typically 0–200 km), the Euclidean approximation introduces errors of up to 15% at latitudes above 30°. Zimbabwe sits at approximately 20°S, where the error is smaller but still material.

**Recommendation:** Replace the Euclidean distance calculation with the Haversine formula. This is a four-line change and should be treated as a correctness fix rather than a feature.

---

## Section 11: Reporting

### Finding 11.1 — MEDIUM: `engineerInspectionReport.ts` Missing from Registry Dispatcher

**Location:** `server/reporting/reportDefinitions.ts`

The `engineer.inspection_report` key is registered in `REPORT_ACCESS` (line 135) and is accessible to the `engineer`, `admin`, and `platform_super_admin` roles. However, the dispatcher `switch` statement in `generateReport()` does not include a `case "engineer.inspection_report"` entry. A request to generate this report will fall through to the `default` case and throw an error.

**Recommendation:** Add `case "engineer.inspection_report": return generateEngineerInspectionReport(params);` to the dispatcher switch. Verify with a targeted test.

---

### Finding 11.2 — LOW: Report Templates Do Not Validate Input Schema

**Location:** `server/reporting/vehicleVerificationReport.ts`, `vehicleValuationReport.ts`, `engineerInspectionReport.ts`, `riskSurveyReport.ts`

All four Epic 2/3 report templates accept a `params: Record<string, any>` argument and access fields directly (e.g., `params.registrationNumber`, `params.inspectionId`) without validation. A missing or incorrectly typed parameter will produce a runtime error inside the PDF renderer rather than a typed validation error at the procedure boundary.

**Recommendation:** Define a Zod schema for each report's input parameters and validate at the start of each template function. Return a typed error if validation fails.

---

## Section 12: RBAC

### Finding 12.1 — HIGH: `PLATFORM_ROLES` Is Defined in Two Places

**Locations:** `server/routers/platform-user-roles.ts`, `client/src/pages/PlatformUserRoleManager.tsx`

The canonical list of platform roles is duplicated between the server and the client. The two lists must be kept manually in sync. As of the current codebase, both contain `['admin', 'assessor', 'claims_manager', 'panel_beater', 'claimant', 'agency', 'engineer']`. If a new role is added to one list and not the other, the admin UI will not offer the new role for assignment, or the server will reject an assignment the UI offers.

**Recommendation:** Define `PLATFORM_ROLES` as a single exported constant in `shared/roles.ts` (or equivalent). Import it in both the server router and the client component. This is a one-time structural fix that eliminates the synchronisation risk permanently.

---

### Finding 12.2 — MEDIUM: `engineerDomainProcedure` Is Not Used Consistently

**Location:** `server/routers/inspections.ts`

The `engineerDomainProcedure` guard was created in Epic 3 and is used correctly in `inspections.ts`. However, the `inspections.ts` router also contains a `requireInspectionAccess()` helper function that performs a secondary ownership check (verifying that the engineer is assigned to the specific inspection). This is correct behaviour, but the pattern is inconsistent with how other domain procedures work — `agencyProcedure` does not perform resource-level ownership checks. The inconsistency is not a bug, but it means the access control model for inspections is harder to reason about than for other domains.

**Recommendation:** Document the two-layer access control pattern for inspections (domain-level via `engineerDomainProcedure` + resource-level via `requireInspectionAccess`) in a comment at the top of `inspections.ts`. Consider whether the same pattern should be applied to other sensitive resources.

---

## Section 13: Multi-Tenancy

### Finding 13.1 — HIGH: Tenant Isolation Is Application-Level, Not Database-Level

**Scope:** Platform-wide

KINGA's multi-tenancy model relies on application-level filtering: procedures include `WHERE tenant_id = ?` clauses when querying tenant-scoped data. There is no database-level enforcement (e.g., Row-Level Security, connection-per-tenant, or schema-per-tenant). This is an acceptable architecture for the current scale, but it has two specific risks.

First, as identified in Finding 2.2, 64 tables do not have a `tenant_id` column, meaning tenant isolation for those tables depends entirely on join logic. Second, the `(ctx.user as any).tenantId` cast in `routers.ts` (Finding 1.1) bypasses the typed session context, meaning the tenant filter for the affected procedure is derived from an unvalidated field.

**Recommendation:** Establish a formal Tenant Isolation Policy document that defines: which tables are tenant-scoped, which are global, the required filtering pattern for each, and the review checklist for new procedures. Enforce the policy through a code review gate. As a technical complement, consider adding a `tenantId` field to the typed `ctx.user` object so that all tenant filters can be derived from the session context without casting.

---

## Section 14: Performance

### Finding 14.1 — HIGH: No Database Connection Pooling Configuration

**Location:** `server/db.ts` — `getDb()` function

The `getDb()` function creates a MySQL connection pool on first call. The pool configuration (connection limit, queue limit, idle timeout) is not explicitly set, meaning the platform relies on `mysql2` defaults. Under the Autoscale (serverless) hosting model, each cold-start instance creates a new pool. If multiple instances start simultaneously under load, the database may receive a burst of new connections that exceeds its connection limit.

**Recommendation:** Set explicit pool limits in `getDb()`: `connectionLimit: 5` (appropriate for serverless), `waitForConnections: true`, `queueLimit: 10`. Add a connection pool health check to the server startup sequence.

---

### Finding 14.2 — MEDIUM: The 500-Row `LIMIT` in the Analytics Procedure Is Arbitrary

**Location:** `server/routers.ts`, line 175 — `LIMIT 500`

The analytics procedure that contains the SQL injection vulnerability (Finding 1.1) also fetches up to 500 rows of assessment data and processes them in-memory (aggregating gate counts, blocking causes, warning causes, overridden fields, and conflicting stages). At 500 rows, this is a significant in-memory aggregation. As the platform scales, this limit will need to increase, and the in-memory aggregation will become a bottleneck.

**Recommendation:** Move the aggregation logic to the database using SQL `GROUP BY` and `COUNT()` queries. This eliminates the in-memory processing and makes the query scale-independent.

---

### Finding 14.3 — LOW: `reportDefinitions.ts` Is 2,554 Lines in a Single File

**Location:** `server/reporting/reportDefinitions.ts`

The report definitions file contains the `REPORT_ACCESS` registry, the `generateReport()` dispatcher, and the full HTML generation logic for several legacy reports — all in a single 2,554-line file. As new report templates are added, this file will continue to grow.

**Recommendation:** Move the HTML generation logic for each report type to its own template file (as was done correctly for the Epic 2/3 reports). The `reportDefinitions.ts` file should contain only the registry and the dispatcher.

---

## Section 15: Security

### Finding 15.1 — BLOCKER: (See Finding 1.1)

The SQL injection vulnerability is classified as a BLOCKER under Architecture. No further elaboration is required here.

---

### Finding 15.2 — MEDIUM: `documentIngestion.uploadDocuments` Accepts 50 MB JSON Payloads

**Location:** `server/_core/index.ts`, line 117

The upload endpoint accepts a 50 MB JSON body. JSON is a text encoding; a 50 MB JSON payload containing base64-encoded file data represents approximately 37 MB of actual file content. This is a reasonable limit for document ingestion, but it means a single request can consume 50 MB of server memory for JSON parsing alone. Under the serverless hosting model with 512 MiB RAM, two concurrent uploads could exhaust available memory.

**Recommendation:** Migrate document uploads to multipart form data (`multipart/form-data`) rather than base64-encoded JSON. This reduces memory pressure by approximately 33% and is the standard pattern for file uploads. Alternatively, implement pre-signed S3 upload URLs so that file bytes never pass through the application server.

---

### Finding 15.3 — LOW: `sameSite: "none"` Cookie Setting Requires Explicit Justification

**Location:** `server/_core/cookies.ts`, line 45

Session cookies are set with `sameSite: "none"`. This setting is required for cross-origin cookie sharing (e.g., when the frontend and backend are on different origins) but it also disables CSRF protection that `sameSite: "strict"` or `sameSite: "lax"` would provide. The setting may be correct given the OAuth flow, but it should be explicitly documented.

**Recommendation:** Add a comment to `cookies.ts` explaining why `sameSite: "none"` is required (cross-origin OAuth callback) and confirming that CSRF protection is provided by the JWT signature rather than the cookie attribute.

---

## Section 16: Testing

### Finding 16.1 — HIGH: Zero Frontend Test Coverage

**Scope:** `client/src/` — 0 test files

The frontend has no automated tests of any kind. There are no unit tests for utility functions, no component tests for UI components, and no integration tests for tRPC hook usage. The 274 test files and approximately 7,851 test cases in `server/` provide strong backend coverage, but the frontend is entirely unprotected. A breaking change to a tRPC procedure signature, a Zod schema update, or a React component refactor will not be caught by any automated check.

**Recommendation:** Introduce Vitest + React Testing Library for frontend testing. Prioritise tests for: (1) the `useAuth()` hook and authentication flow; (2) the `trpc.*` hook wrappers for the most critical procedures (claim creation, status transition, report generation); (3) the `DashboardLayout` and `EngineerWorkspaceLayout` components. A target of 20 frontend tests covering the critical paths would provide meaningful protection.

---

### Finding 16.2 — MEDIUM: Epic 3 Tests Do Not Cover the Inspection-to-Physics Integration Path

**Location:** `server/epic3.test.ts`

The Epic 3 test suite covers all 18 tasks individually. However, there is no integration test that exercises the full path: create inspection → add measurements → run physics reconciliation → verify that `ConsistencyFlag` records are produced. The individual unit tests confirm that each function works in isolation, but the integration between `reconcileEngineerMeasurements()` and the physics engine has not been tested end-to-end.

**Recommendation:** Add an integration test to `epic3.test.ts` (or a new `server/integration/inspection-physics.test.ts`) that exercises the full measurement-to-reconciliation path with a real database connection using the test database.

---

### Finding 16.3 — LOW: `debug-insert.test.ts` Is a Debug File Named as a Test

**Location:** `server/debug-insert.test.ts`

A file named `debug-insert.test.ts` exists at the server root. Vitest will discover and attempt to run this file as part of the test suite. If it contains live database operations (as the name implies), it will either fail in CI or produce side effects in the test database.

**Recommendation:** Move this file to `server/scripts/` and exclude it from the Vitest configuration, or delete it if it is no longer needed.

---

## Section 17: Documentation

### Finding 17.1 — HIGH: 50+ Markdown Documents at the Project Root with No Index

**Scope:** `/home/ubuntu/kinga-replit/` root directory — 53 Markdown files

The project root contains 53 Markdown files including audit reports, diagnostic reports, validation reports, redesign notes, and architecture documents. These files represent a significant body of institutional knowledge, but there is no index, no version control discipline (multiple files with similar names: `kinga-platform-architecture-monetisation.md`, `kinga-platform-architecture-monetisation-v2.md`, `kinga-platform-architecture-monetisation-v3.md`, `kinga-platform-architecture-monetisation-v4.md`), and no clear distinction between current and superseded documents.

**Recommendation:** Establish a documentation structure: move all architecture and design documents to `docs/architecture/`, all audit reports to `docs/audits/`, all operational notes to `docs/operations/`. Create a `docs/README.md` index. Archive superseded versions in `docs/archive/`. This is a housekeeping task but it is important for onboarding new contributors and for the platform's long-term maintainability.

---

### Finding 17.2 — MEDIUM: No API Contract Documentation

**Scope:** `server/routers/` — 22 sub-router files + `server/routers.ts`

The platform has no generated API documentation. The tRPC contract is the source of truth, but it is not rendered into a human-readable format. Engineers working on integrations (agency portal, external systems) must read the router source code to understand available procedures, their input schemas, and their return types.

**Recommendation:** Integrate `trpc-openapi` or a similar tool to generate an OpenAPI specification from the tRPC router definitions. Publish the specification at `/api/docs` in the development environment. This is particularly important for the agency and engineer portals, which are the most likely integration points for external systems.

---

### Finding 17.3 — LOW: `todo.md` Contains Completed Items Without Archival

**Location:** `/home/ubuntu/kinga-replit/todo.md`

The `todo.md` file contains a mix of completed (`[x]`) and pending (`[ ]`) items accumulated across multiple Epics. Items marked `[x]` are never archived, meaning the file grows indefinitely and the signal-to-noise ratio for pending items decreases over time.

**Recommendation:** At the start of each Epic, move all `[x]` items from `todo.md` to `docs/CHANGELOG.md` with an Epic label. This keeps `todo.md` focused on current work and preserves the history in a structured format.

---

## Summary of Findings

### By Severity

| Severity | Count | Findings |
|---|---|---|
| **BLOCKER** | 3 | 1.1 (SQL injection), 1.2 (three workflow engines), 9.1 (audit trail gap) |
| **HIGH** | 11 | 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 3.1, 12.1, 13.1, 14.1, 16.1 |
| **MEDIUM** | 12 | 2.4, 2.5, 3.2, 3.3, 4.1, 5.1, 9.2, 10.1 (correctness), 11.1, 12.2, 14.2, 16.2 |
| **LOW** | 8 | 4.2, 5.2 (doc), 6.1, 10.1 (haversine), 11.2, 14.3, 15.3, 16.3, 17.1, 17.2, 17.3 |

### By Domain

| Domain | BLOCKER | HIGH | MEDIUM | LOW |
|---|---|---|---|---|
| Architecture | 2 | 3 | — | — |
| Database | — | 3 | 2 | — |
| tRPC Routers | — | 1 | 2 | — |
| Shared Services | — | — | 1 | 1 |
| Intelligence Engines | — | — | 1 | 1 |
| Physics Pipeline | — | — | 1 | 1 |
| Evidence Model | — | 1 | — | — |
| Asset Model | — | — | 1 | — |
| Workflow Engine | 1 | — | 1 | — |
| Assignment Engine | — | — | — | 1 |
| Reporting | — | — | 1 | 1 |
| RBAC | — | 1 | 1 | — |
| Multi-Tenancy | — | 1 | — | — |
| Performance | — | 1 | 1 | 1 |
| Security | 1 | — | 1 | 1 |
| Testing | — | 1 | 1 | 1 |
| Documentation | — | 1 | 1 | 2 |

---

## Readiness Verdict

KINGA is **not yet ready** to transition to platform-scale development. The three BLOCKER findings must be resolved first.

Once the BLOCKERs are resolved, the platform will be ready to begin platform-scale development with the HIGH findings tracked as a parallel remediation workstream. The HIGH findings do not block feature development but they must not be allowed to accumulate further.

The platform's genuine strengths — the physics pipeline, the tRPC contract layer, the reporting registry, the asset-centric inspection model, and the 7,851 server-side test cases — provide a solid foundation. The work required to reach platform-scale readiness is well-defined and achievable within a single focused sprint.

---

## Recommended Resolution Order

| Priority | Finding | Effort |
|---|---|---|
| 1 | **1.1** — SQL injection fix | 1 hour |
| 2 | **1.2** — Workflow engine consolidation | 2 days |
| 3 | **9.1** — Audit trail gap (resolved by 1.2) | — |
| 4 | **12.1** — Shared `PLATFORM_ROLES` constant | 2 hours |
| 5 | **2.3** — `inspection_id` FK on `claim_documents` | 2 hours |
| 6 | **11.1** — Missing dispatcher case for `engineer.inspection_report` | 30 minutes |
| 7 | **4.2** — Move debug/trigger scripts to `server/scripts/` | 1 hour |
| 8 | **1.3** — Begin monolith router migration (one domain per sprint) | Ongoing |

Items 1, 4, 5, 6, and 7 can be completed in a single day. Items 2 and 3 require a dedicated sprint. Item 8 is a long-running programme.

---

*End of KINGA Platform Readiness Report v1.0*
