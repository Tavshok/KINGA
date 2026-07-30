# KINGA Implementation Specification v1.0

**Document Type:** Implementation Specification  
**Version:** 1.0  
**Date:** July 2026  
**Classification:** Internal — Engineering  
**Status:** Accepted for Execution  
**Predecessor Document:** KINGA Platform Capability & Architecture Audit v1.0 (July 2026)  
**Author:** Chief Software Architect, KINGA Platform  

---

## Document Purpose

This specification converts the accepted Platform Capability & Architecture Audit into a complete, executable implementation plan. It is addressed to the engineering team that will carry out the work. It contains no pseudocode, no migration scripts, and no implementation shortcuts. Every statement in this document is grounded in direct inspection of the KINGA codebase as it exists at checkpoint `15eaee85`.

The specification is organised as follows. Section 1 establishes the guiding principles that govern all implementation decisions. Section 2 provides the complete feature classification matrix — every proposed capability is classified as REUSE AS-IS, REUSE WITH EXTENSION, GENERALISE, or NEW BUILD, with justification. Section 3 presents the implementation dependency graph. Sections 4 through 7 provide the full specification for each of the four implementation phases.

---

## 1. Guiding Principles

**Principle 1 — Reuse before build.** Every proposed capability must be matched against the existing KINGA codebase before any new code is commissioned. The audit has established that 28 of 35 proposed capabilities already exist in some form. This specification enforces that finding.

**Principle 2 — Generalise before duplicate.** Where an existing capability is Claims-coupled, the correct response is to generalise the coupling point — typically an input type definition or a foreign key constraint — not to build a parallel implementation for the new context.

**Principle 3 — No breaking changes in Phase 1.** Phase 1 is exclusively foundational. It must not change any existing behaviour visible to Claims, Fleet, or any current user. All Phase 1 changes are additive (new enum values, nullable columns, new FK columns) or corrective (TypeScript error fixes).

**Principle 4 — Schema changes are irreversible.** Every database migration must be reviewed by a senior engineer before execution. The rollback strategy for every phase must be confirmed before the phase begins.

**Principle 5 — Test coverage is a delivery requirement.** No phase is complete until the acceptance criteria include passing Vitest tests for every new procedure and every modified engine. The existing 112-test-file infrastructure is the baseline; new work must extend it.

**Principle 6 — The KINGA design system is non-negotiable.** All new report templates must use `kingaDesignSystem.ts` primitives exclusively. No new CSS frameworks, no inline styles, no card components with border accents.

**Principle 7 — RBAC is enforced at the procedure level.** There is no declarative permission registry. Every new procedure must include an explicit role check using the established `use()` middleware pattern. Adding a new role requires updating every procedure that should permit it — this is not optional.

---

## 2. Feature Classification Matrix

The following table classifies every proposed capability across all four phases. The classification determines the engineering approach and the risk level.

| # | Proposed Capability | Classification | Justification | Phase |
|---|---|---|---|---|
| 1 | Agency customer portal (quote request, policy browsing) | **REUSE AS-IS** | `KingaAgency.tsx` and `agency.ts` router are fully built. Activation requires role enum change only. | 2 |
| 2 | Agency broker portal (client management, multi-insurer RFQ) | **REUSE AS-IS** | `AgencyFleetQuotes.tsx` and `agency-broker.ts` router are fully built. Same activation dependency as #1. | 2 |
| 3 | Agency role guard activation | **REUSE WITH EXTENSION** | `agencyProcedure` guard exists with explicit R-INF-09 comment. Requires enum addition + guard update. | 2 |
| 4 | Admin UI for agency role assignment | **NEW BUILD** | No role assignment UI exists for any role. New page required. | 2 |
| 5 | Customer case tracking (quote status, claim status) | **NEW BUILD** | `KingaAgency.tsx` has a quotations tab but no unified case status view. New page required. | 2 |
| 6 | Pre-insurance vehicle photo verification | **REUSE WITH EXTENSION** | `photoForensicsEngine.ts` is stateless and accepts any image URL. pHash and AI-generation detection must be added. | 2 |
| 7 | Perceptual hashing (pHash) for near-duplicate detection | **NEW BUILD** | No pHash library installed. No pHash column in `ingestionDocuments`. Additive extension. | 2 |
| 8 | AI-generated image detection | **NEW BUILD** | No LLM prompt or capability exists for this. New LLM call required in `photoForensicsEngine.ts`. | 2 |
| 9 | EXIF-absent risk flag | **REUSE WITH EXTENSION** | EXIF extraction exists. Flag for absent EXIF is a one-field addition to the forensics output type. | 2 |
| 10 | Cross-submission pHash similarity query | **NEW BUILD** | Depends on #7. New query function required in `server/db.ts`. | 2 |
| 11 | Vehicle Verification Report template | **NEW BUILD** | No template exists. Must be built using `kingaDesignSystem.ts` primitives. | 2 |
| 12 | Vehicle Valuation Report template | **NEW BUILD** | No customer-facing valuation report exists. Must be built using `kingaDesignSystem.ts` primitives. | 2 |
| 13 | Pre-insurance valuation (Agency context) | **REUSE WITH EXTENSION** | `generateVehicleValuation()` accepts make/model/year/condition/mileage with no claim dependency. New tRPC procedure required to expose it in Agency context. | 2 |
| 14 | Historical valuation (valuation at a past date) | **REUSE WITH EXTENSION** | `vehicleMarketValuations` has `createdAt` timestamps. `valuationDate` parameter must be added to scope the market data query. | 2 |
| 15 | Policy issuance (Agency context) | **REUSE AS-IS** | `policy-issuance.ts` and `policy-pdf-generator.ts` are fully built and called from `agency.ts` router. | 2 |
| 16 | Role enum additions (agency, engineer, engineering_manager, risk_surveyor) | **REUSE WITH EXTENSION** | `users.role` enum exists. New values are additive. Single migration required. | 1 |
| 17 | Audit trail generalisation (non-Claims audit events) | **REUSE WITH EXTENSION** | `auditTrail` table exists with `claimId` FK. Make nullable, add `caseType` + `caseId`. | 1 |
| 18 | Workflow state generalisation (non-Claims workflows) | **REUSE WITH EXTENSION** | `workflowStates` table exists with `claimId` FK. Make nullable, add `caseType` + `caseId`. | 1 |
| 19 | Fleet vehicle → vehicleRegistry linkage | **REUSE WITH EXTENSION** | `vehicleRegistry` and `fleetVehicles` both exist. Add `vehicleRegistryId` FK to `fleetVehicles`. VIN-match population job required. | 1 |
| 20 | Agency client vehicle → vehicleRegistry linkage | **REUSE WITH EXTENSION** | Same pattern as #19. Add `vehicleRegistryId` FK to `agencyClients`. | 1 |
| 21 | TypeScript error cleanup | **REUSE WITH EXTENSION** | 47 pre-existing errors in 5 files. Field name corrections only. No logic changes. | 1 |
| 22 | Engineering Workspace — engineer role + routing | **NEW BUILD** | No `engineer` role, no engineering workspace route group, no engineering-specific layout. | 3 |
| 23 | Generic inspection entity | **NEW BUILD** | No generic inspection table. `AssessorClaimDetails` workflow is Claims-scoped. New `inspections` table required. | 3 |
| 24 | Physical measurement entity | **NEW BUILD** | No physical measurement table. `vehicleGeometryMeasurements` stores reference geometry only. New `physicalMeasurements` table required. | 3 |
| 25 | Engineer observation entity | **NEW BUILD** | No engineer observation table. `claimComments` is Claims-scoped. New `engineerObservations` table required. | 3 |
| 26 | Engineer measurement → physics pipeline injection | **GENERALISE** | Physics pipeline exists. `Stage7Input` type must accept `engineerMeasurements`. `ReconciliationSource` enum must add `"engineer_measurement"`. No physics mathematics change. | 3 |
| 27 | Engineering Workspace router and procedures | **NEW BUILD** | No engineering router exists. New `server/routers/engineering.ts` required. | 3 |
| 28 | Engineering Workspace frontend pages | **NEW BUILD** | No engineering workspace pages exist. New pages under `client/src/pages/Engineering*.tsx` required. | 3 |
| 29 | Engineering Inspection Report template | **NEW BUILD** | No engineering report template exists. Must be built using `kingaDesignSystem.ts` primitives. | 3 |
| 30 | Engineer notification triggers | **REUSE WITH EXTENSION** | `safe-email.ts` exists. Generic `notifyUser()` wrapper required. New `notifications` table for in-app persistence. | 3 |
| 31 | Vehicle Passport aggregation view | **GENERALISE** | `vehicleRegistry` is the anchor. Aggregation query across `vehicleDamageHistory`, `repairHistory`, `vehicleMarketValuations` required. Depends on Phase 1 linkage work. | 4 |
| 32 | Vehicle Passport page (read-only) | **NEW BUILD** | No vehicle passport page exists. New `client/src/pages/VehiclePassport.tsx` required. | 4 |
| 33 | Vehicle Passport Report template | **NEW BUILD** | No vehicle passport report template exists. Must be built using `kingaDesignSystem.ts` primitives. | 4 |
| 34 | Fleet incident → Claims pipeline connection | **GENERALISE** | Claims pipeline is callable. `fleetIncidentReports` must add `claimId` FK. New procedure to trigger assessment from fleet incident. | 4 |
| 35 | Cross-module analytics dashboard | **REUSE WITH EXTENSION** | Analytics export service exists. New query functions for Agency and Engineering metrics required. New dashboard page required. | 4 |

---

## 3. Implementation Dependency Graph

The following graph defines the mandatory execution order. A phase or task may not begin until all items it depends on are complete and their acceptance criteria are verified.

```
PHASE 1 — PLATFORM ACTIVATION
│
├─ [P1-1] users.role enum: add agency, engineer, engineering_manager, risk_surveyor
│     └─ BLOCKS: P2-1 (agencyProcedure guard), P3-1 (engineering router)
│
├─ [P1-2] auditTrail: make claimId nullable, add caseType + caseId
│     └─ BLOCKS: P3-5 (engineering audit events), P4-1 (vehicle passport audit)
│
├─ [P1-3] workflowStates: make claimId nullable, add caseType + caseId
│     └─ BLOCKS: P3-4 (engineering inspection workflow), P4-2 (fleet incident workflow)
│
├─ [P1-4] fleetVehicles: add vehicleRegistryId FK + VIN-match population job
│     └─ BLOCKS: P4-1 (vehicle passport fleet linkage), P4-3 (fleet fraud detection)
│
├─ [P1-5] agencyClients: add vehicleRegistryId FK + VIN-match population job
│     └─ BLOCKS: P4-1 (vehicle passport agency linkage)
│
└─ [P1-6] TypeScript error cleanup (voltron-query3, orchestrator, stage-7-physics, workflow-queries)
      └─ BLOCKS: nothing directly, but must precede any Phase 3 physics work

PHASE 2 — AGENCY ACTIVATION
│  (requires P1-1 complete)
│
├─ [P2-1] agencyProcedure guard: permit agency role
│     └─ BLOCKS: P2-2, P2-3, P2-4 (all Agency features)
│
├─ [P2-2] Admin UI: agency role assignment page
│     └─ BLOCKS: P2-3 (cannot test Agency portal without assigned users)
│
├─ [P2-3] Customer workspace: /customer route group + layout
│     └─ BLOCKS: P2-4 (customer case tracking page)
│
├─ [P2-4] Customer case tracking page (quote status + claim status)
│     └─ No downstream blocks within Phase 2
│
├─ [P2-5] pHash computation in photoForensicsEngine.ts + pHash column in ingestionDocuments
│     └─ BLOCKS: P2-6 (cross-submission similarity query)
│
├─ [P2-6] Cross-submission pHash similarity query (server/db.ts)
│     └─ BLOCKS: P2-7 (Agency intake verification procedure)
│
├─ [P2-7] EXIF-absent risk flag in photoForensicsEngine.ts output type
│     └─ No downstream blocks within Phase 2
│
├─ [P2-8] AI-generation detection LLM call in photoForensicsEngine.ts
│     └─ No downstream blocks within Phase 2
│
├─ [P2-9] Vehicle Verification Report template (server/reporting/)
│     └─ BLOCKS: P2-11 (Agency intake procedure calls this report)
│
├─ [P2-10] Vehicle Valuation Report template (server/reporting/)
│     └─ BLOCKS: P2-11 (Agency valuation procedure calls this report)
│
└─ [P2-11] Agency valuation tRPC procedure (expose generateVehicleValuation() in Agency context)
      └─ No downstream blocks within Phase 2

PHASE 3 — ENGINEERING WORKSPACE
│  (requires P1-1, P1-2, P1-3, P1-6 complete)
│
├─ [P3-1] inspections table (new, polymorphic caseType + caseId)
│     └─ BLOCKS: P3-3, P3-4, P3-6
│
├─ [P3-2] physicalMeasurements table (new, generic multi-asset)
│     └─ BLOCKS: P3-5 (physics injection)
│
├─ [P3-3] engineerObservations table (new)
│     └─ BLOCKS: P3-6 (engineering router procedures)
│
├─ [P3-4] Stage7Input: add engineerMeasurements field
│     └─ BLOCKS: P3-5
│
├─ [P3-5] ReconciliationSource enum: add "engineer_measurement"
│     └─ BLOCKS: P3-5b (reconciliation arbitration for engineer measurements)
│
├─ [P3-6] Engineering router (server/routers/engineering.ts)
│     └─ BLOCKS: P3-7 (frontend pages call these procedures)
│
├─ [P3-7] Engineering Workspace frontend pages (Engineering*.tsx)
│     └─ No downstream blocks within Phase 3
│
├─ [P3-8] Engineering Inspection Report template (server/reporting/)
│     └─ No downstream blocks within Phase 3
│
└─ [P3-9] Engineer notification triggers (notifyUser() wrapper + notifications table)
      └─ No downstream blocks within Phase 3

PHASE 4 — VEHICLE PASSPORT & CROSS-MODULE INTELLIGENCE
│  (requires P1-4, P1-5 complete; P3-1 recommended but not blocking)
│
├─ [P4-1] Vehicle Passport aggregation query (server/db.ts)
│     └─ BLOCKS: P4-2
│
├─ [P4-2] Vehicle Passport page (client/src/pages/VehiclePassport.tsx)
│     └─ BLOCKS: P4-3
│
├─ [P4-3] Vehicle Passport Report template (server/reporting/)
│     └─ No downstream blocks
│
├─ [P4-4] fleetIncidentReports: add claimId FK + procedure to trigger Claims pipeline from fleet incident
│     └─ No downstream blocks
│
└─ [P4-5] Cross-module analytics dashboard (new page + new analytics query functions)
      └─ No downstream blocks
```

---

## 4. Phase 1 — Platform Activation

### 4.1 Objectives

Phase 1 establishes the foundational database and type-system changes that all subsequent phases depend on. It introduces no new user-visible features. It corrects pre-existing technical debt. It must be completed and verified before any Phase 2 work begins.

### 4.2 Business Justification

The Agency module is architecturally complete but cannot be activated because the `users.role` enum does not contain the `agency` value. The Engineering Workspace cannot be built because the `engineer` role does not exist. The audit trail and workflow state tables are Claims-scoped, preventing their reuse in non-Claims contexts. Fleet vehicles and Agency client vehicles are not linked to the `vehicleRegistry`, preventing cross-module vehicle intelligence. These are not feature gaps — they are structural blockers. Phase 1 removes them without introducing any new functionality.

### 4.3 Technical Scope

Phase 1 consists of six bounded tasks. Each task is a database migration or a TypeScript correction. No new tRPC procedures are introduced. No new frontend pages are introduced.

### 4.4 Components Affected

| Task | File(s) Affected | Change Type |
|---|---|---|
| P1-1 | `drizzle/schema.ts` (users.role enum) | Additive migration |
| P1-2 | `drizzle/schema.ts` (auditTrail table) | Nullable column + two new columns |
| P1-3 | `drizzle/schema.ts` (workflowStates table) | Nullable column + two new columns |
| P1-4 | `drizzle/schema.ts` (fleetVehicles table) | New FK column + population job |
| P1-5 | `drizzle/schema.ts` (agencyClients table) | New FK column + population job |
| P1-6 | `server/voltron-query3.ts`, `server/pipeline-v2/orchestrator.ts`, `server/pipeline-v2/stage-7-physics.ts`, `server/routers/workflow-queries.ts` | Field name corrections |

### 4.5 Existing Reusable Components

All Phase 1 work operates on existing tables and files. There are no new components. The Drizzle ORM migration system (`pnpm db:push`) handles schema propagation. The existing `auditTrail` table structure (userId, action, entityType, entityId, previousValue, newValue, changeDescription, ipAddress, userAgent) is preserved in full — only the `claimId` FK becomes nullable and two discriminator columns are added.

### 4.6 New Components Required

Phase 1 introduces no new components. It introduces two new database columns on `auditTrail` and two on `workflowStates`, one new FK column on `fleetVehicles`, and one new FK column on `agencyClients`. It introduces four new enum values on `users.role`. All additions are non-breaking.

### 4.7 APIs to Expose

Phase 1 exposes no new tRPC procedures. The role enum change will silently enable the `agencyProcedure` guard to accept the new role once Phase 2 updates the guard — but the guard itself is not changed in Phase 1.

### 4.8 Database Changes

**P1-1 — users.role enum addition**

Add the following values to the `users.role` enum in `drizzle/schema.ts`:
- `agency` — for agency broker/intermediary users
- `engineer` — for Engineering Workspace inspectors
- `engineering_manager` — for Engineering Workspace managers
- `risk_surveyor` — for risk survey specialists

The existing values (`admin`, `user`, `insurer`, `assessor`, `panel_beater`, `fleet_manager`, `platform_super_admin`, `claims_manager`, `claims_processor`, `recovery_agent`, `customer`) must be preserved without modification.

**P1-2 — auditTrail generalisation**

On the `auditTrail` table:
- Make `claimId` nullable (currently `int` NOT NULL with FK to `claims.id`)
- Add `caseType` column: `varchar(50)` nullable, no FK constraint. Permitted values (enforced at application layer, not DB): `claim`, `inspection`, `valuation`, `fleet_incident`, `quotation`
- Add `caseId` column: `int` nullable, no FK constraint (polymorphic reference)

All existing Claims audit trail records retain their `claimId` value. The `caseType` and `caseId` columns will be null for all existing records. New non-Claims audit events will set `caseType` + `caseId` and leave `claimId` null.

**P1-3 — workflowStates generalisation**

On the `workflowStates` table:
- Make `claimId` nullable (currently `int` NOT NULL with FK to `claims.id`)
- Add `caseType` column: `varchar(50)` nullable
- Add `caseId` column: `int` nullable

All existing workflow state records retain their `claimId` value. The same pattern as P1-2 applies.

**P1-4 — fleetVehicles → vehicleRegistry linkage**

On the `fleetVehicles` table:
- Add `vehicleRegistryId` column: `int` nullable, FK to `vehicleRegistry.id` ON DELETE SET NULL

After the migration, a one-time VIN-match population job must be written and executed (as a standalone Node.js script, not as application code). The job queries all `fleetVehicles` records with a non-null VIN, looks up matching `vehicleRegistry` records by VIN, and updates `vehicleRegistryId` where a match is found. Unmatched records remain null. The job must be idempotent (safe to re-run).

**P1-5 — agencyClients → vehicleRegistry linkage**

On the `agencyClients` table:
- Add `vehicleRegistryId` column: `int` nullable, FK to `vehicleRegistry.id` ON DELETE SET NULL

Same VIN-match population job pattern as P1-4. The job for P1-4 and P1-5 may be combined into a single script.

### 4.9 UI Changes

Phase 1 introduces no UI changes.

### 4.10 RBAC Changes

Phase 1 introduces four new role values in the database enum. No procedure guards are changed. The new roles have no permissions until Phase 2 (agency) and Phase 3 (engineer, engineering_manager) update the relevant guards.

### 4.11 Workflow Changes

Phase 1 introduces no workflow changes. The `workflowStates` table change is structural only — the existing Claims state machine continues to operate on `claimId` without modification.

### 4.12 Testing Strategy

Each Phase 1 migration must be verified by the following tests before Phase 2 begins:

- **P1-1:** Verify that a user record can be created with each of the four new role values without a database constraint violation. Verify that existing role values are unaffected.
- **P1-2:** Verify that an `auditTrail` record can be inserted with `claimId = null` and `caseType = 'inspection'`. Verify that existing Claims audit records are readable and unmodified.
- **P1-3:** Verify that a `workflowStates` record can be inserted with `claimId = null` and `caseType = 'inspection'`. Verify that the existing Claims state machine reads `workflowStates` records correctly after the migration.
- **P1-4:** Verify that `fleetVehicles.vehicleRegistryId` accepts null and a valid `vehicleRegistry.id`. Verify that the VIN-match population job produces correct matches on a test dataset.
- **P1-5:** Same verification as P1-4 for `agencyClients`.
- **P1-6:** Run `pnpm typecheck` (or equivalent) and confirm zero TypeScript errors in the four corrected files.

### 4.13 Regression Risks

| Risk | Affected Area | Mitigation |
|---|---|---|
| Making `auditTrail.claimId` nullable may break queries that assume it is non-null | `server/routers/` queries on `auditTrail` | Grep all queries on `auditTrail` for `claimId IS NOT NULL` assumptions before migration |
| Making `workflowStates.claimId` nullable may break `claim-state-machine.ts` guards | `server/claim-state-machine.ts` | All five guards in `claim-state-machine.ts` must be reviewed to confirm they filter by `claimId` explicitly |
| VIN-match population job may create incorrect linkages if VINs are non-unique | `fleetVehicles`, `vehicleRegistry` | The job must handle duplicate VIN matches by logging a warning and skipping rather than creating an ambiguous link |

### 4.14 Rollback Strategy

All Phase 1 changes are additive (new nullable columns, new enum values, new FK columns). Rollback is straightforward:

- **Enum additions:** Remove the new values from the enum. This is safe as long as no user records have been assigned the new roles.
- **Nullable column additions:** Drop the new columns. This is safe as long as no records have been written with non-null values in those columns.
- **FK column additions:** Drop the new columns. The VIN-match population job writes to these columns — if rollback is required, the columns must be dropped before any Phase 2 work writes to them.

The rollback window closes when Phase 2 begins writing `agency` role assignments to the database.

### 4.15 Acceptance Criteria

Phase 1 is complete when all of the following are true:

1. `pnpm db:push` completes without error on the modified schema.
2. The `users.role` enum contains `agency`, `engineer`, `engineering_manager`, and `risk_surveyor` in addition to all existing values.
3. An `auditTrail` record with `claimId = null`, `caseType = 'inspection'`, and `caseId = 1` can be inserted and retrieved without error.
4. A `workflowStates` record with `claimId = null`, `caseType = 'inspection'`, and `caseId = 1` can be inserted and retrieved without error.
5. The existing Claims pipeline processes a test claim end-to-end without error (regression check).
6. `pnpm typecheck` reports zero errors in `voltron-query3.ts`, `orchestrator.ts`, `stage-7-physics.ts`, and `workflow-queries.ts`.
7. All Phase 1 Vitest tests pass.

### 4.16 Dependencies

Phase 1 has no upstream dependencies. It is the entry point for all subsequent phases.

---

## 5. Phase 2 — Agency Activation

### 5.1 Objectives

Phase 2 activates the Agency module, which is architecturally complete but intentionally inactive (R-INF-09, 2026-07-09). It extends the photo forensics engine with pre-insurance verification capabilities (pHash, AI-generation detection, EXIF-absent flagging). It exposes the valuation engine in the Agency context. It builds the customer workspace and the two new report templates required for Agency operations.

### 5.2 Business Justification

The Agency module represents a complete, built, and tested backend and frontend that has been held inactive by a single database enum constraint. The business cost of continued inactivity is an unrealised revenue channel. The technical cost of activation is minimal — the primary engineering effort in Phase 2 is the pre-insurance photo verification capability, which does not exist in any form and is required to prevent fraudulent policy applications.

### 5.3 Technical Scope

Phase 2 consists of eleven tasks. Tasks P2-1 through P2-4 activate the existing Agency infrastructure. Tasks P2-5 through P2-10 build the pre-insurance verification capability. Task P2-11 exposes the valuation engine in the Agency context.

### 5.4 Components Affected

| Task | File(s) Affected | Change Type |
|---|---|---|
| P2-1 | `server/routers/agency-broker.ts` (agencyProcedure guard) | Guard update |
| P2-2 | `server/routers/admin.ts` or new `server/routers/role-management.ts` | New procedure |
| P2-3 | `client/src/App.tsx`, new `client/src/pages/CustomerLayout.tsx` | New route group + layout |
| P2-4 | New `client/src/pages/CustomerCaseTracking.tsx` | New page |
| P2-5 | `server/pipeline-v2/photoForensicsEngine.ts`, `drizzle/schema.ts` (ingestionDocuments) | Engine extension + migration |
| P2-6 | `server/db.ts` | New query function |
| P2-7 | `server/pipeline-v2/photoForensicsEngine.ts`, `server/pipeline-v2/types.ts` | Output type extension |
| P2-8 | `server/pipeline-v2/photoForensicsEngine.ts` | New LLM call |
| P2-9 | New `server/reporting/vehicleVerificationReport.ts` | New report template |
| P2-10 | New `server/reporting/vehicleValuationReport.ts` | New report template |
| P2-11 | `server/routers/agency.ts` (new procedure) | New tRPC procedure |

### 5.5 Existing Reusable Components

The following components are reused without modification in Phase 2:

- `server/routers/agency.ts` — all existing procedures (quotation submission, policy management, document upload, renewal)
- `server/routers/agency-broker.ts` — all existing procedures (client CRUD, multi-insurer RFQ, agency-sourced claim creation)
- `client/src/pages/KingaAgency.tsx` — existing customer portal page
- `client/src/pages/AgencyFleetQuotes.tsx` — existing fleet RFQ page
- `server/insurance/policy-issuance.ts` — policy issuance workflow
- `server/insurance/policy-pdf-generator.ts` — policy document PDF generation
- `server/pipeline-v2/photoForensicsEngine.ts` — core EXIF, GPS, manipulation, hash, AI vision analysis
- `server/insurance/valuation-engine.ts` — vehicle valuation engine (no claim dependency)
- `server/reporting/reportQueue.ts` — asynchronous report generation and S3 upload
- `server/reporting/templates/kingaDesignSystem.ts` — report design system primitives

### 5.6 New Components Required

| Component | Type | Location | Purpose |
|---|---|---|---|
| Agency role assignment UI | Frontend page | `client/src/pages/AdminRoleAssignment.tsx` | Admin assigns `agency` role to users |
| Customer workspace layout | Frontend layout | `client/src/pages/CustomerLayout.tsx` | Dedicated layout for customer-facing pages |
| Customer case tracking page | Frontend page | `client/src/pages/CustomerCaseTracking.tsx` | Unified view of quote and claim status for customers |
| pHash computation (additive) | Engine extension | `server/pipeline-v2/photoForensicsEngine.ts` | Perceptual hash for near-duplicate detection |
| pHash column | Database column | `ingestionDocuments.pHash` varchar(64) nullable | Stores computed pHash per image |
| Cross-submission pHash query | DB helper | `server/db.ts` | Finds near-duplicate images across submissions |
| EXIF-absent risk flag | Type extension | `PhotoForensicsResult.exifAbsent` boolean | Flags images with no EXIF capture datetime |
| AI-generation detection | Engine extension | `server/pipeline-v2/photoForensicsEngine.ts` | LLM vision call to detect AI-generated images |
| Vehicle Verification Report template | Report template | `server/reporting/vehicleVerificationReport.ts` | Pre-insurance photo verification report |
| Vehicle Valuation Report template | Report template | `server/reporting/vehicleValuationReport.ts` | Customer-facing valuation report |
| Agency valuation procedure | tRPC procedure | `server/routers/agency.ts` | Exposes `generateVehicleValuation()` in Agency context |

### 5.7 APIs to Expose

The following new tRPC procedures must be added in Phase 2:

| Procedure | Router | Input | Output | Auth |
|---|---|---|---|---|
| `agency.getValuation` | `agency.ts` | `{ make, model, year, condition, mileage, valuationDate? }` | `VehicleValuationResult` | `agencyProcedure` |
| `agency.verifyVehiclePhotos` | `agency.ts` | `{ imageUrls: string[], submissionId: string }` | `PhotoVerificationResult` | `agencyProcedure` |
| `admin.assignRole` | `admin.ts` | `{ userId: number, role: UserRole }` | `{ success: boolean }` | `adminProcedure` |
| `customer.getCases` | new `customer.ts` | `{}` | `{ quotations: [], policies: [], claims: [] }` | `protectedProcedure` (customer role) |

### 5.8 Database Changes

**P2-5 — ingestionDocuments.pHash column**

Add `pHash` column to `ingestionDocuments`: `varchar(64)` nullable. This stores the perceptual hash computed by the pHash library for each ingested image. The column is nullable because: (a) non-image documents do not have a pHash, and (b) existing records will have null until re-processed.

No other database changes are required in Phase 2. All Agency tables (`agencyClients`, `insurerQuoteRequests`, `quotationRequests`, `insurancePolicies`, etc.) are already migrated and require no changes.

### 5.9 UI Changes

**P2-2 — Admin role assignment UI**

A new page at `/admin/roles` must allow an admin user to search for a user by name or email and assign or revoke the `agency` role. The page must use the existing `DashboardLayout` component. It must call the new `admin.assignRole` procedure. It must display a confirmation dialog before any role change.

**P2-3 — Customer workspace**

A new route group `/customer/*` must be registered in `client/src/App.tsx`. This route group must use a dedicated `CustomerLayout` component that is distinct from the insurer/assessor `DashboardLayout`. The customer layout must include navigation to: My Quotes, My Policies, My Claims, and Vehicle Verification. The layout must be accessible only to users with the `customer` or `agency` role.

**P2-4 — Customer case tracking page**

A new page at `/customer/cases` must display a unified timeline of the user's quotation requests (with status badges), active policies, and linked claims. It must call `customer.getCases`. It must use the KINGA design system colour palette and typography — not a new design language.

### 5.10 RBAC Changes

**P2-1 — agencyProcedure guard update**

The `agencyProcedure` middleware in `server/routers/agency-broker.ts` currently permits only `admin` and `platform_super_admin`. It must be updated to also permit `agency`. The comment block referencing R-INF-09 must be removed once the enum change (P1-1) is confirmed in production.

No other procedure guards require changes in Phase 2. The existing `agency.ts` router uses `protectedProcedure` directly — this is acceptable for customer-facing procedures that any authenticated user may call. The `agency-broker.ts` router uses `agencyProcedure` for broker-specific operations — this is the guard that requires updating.

### 5.11 Workflow Changes

Phase 2 introduces no changes to the Claims workflow. Agency-sourced claims are created via `agency-broker.ts` with `claimSource: "agency"` and `status: "intake_pending"` — this is already implemented and uses the existing Claims workflow without modification.

The Agency quotation workflow (`quotationRequests` status lifecycle: `pending → under_review → quoted → accepted | rejected | expired`) is already implemented and requires no changes.

### 5.12 Testing Strategy

The following tests must be written and pass before Phase 2 is considered complete:

- **P2-1:** Integration test: a user with `agency` role can call `agency-broker.ts` procedures without a FORBIDDEN error. A user with `user` role cannot.
- **P2-2:** Integration test: `admin.assignRole` assigns the `agency` role to a test user and the change is reflected in `users.role`.
- **P2-4:** Unit test: `customer.getCases` returns the correct quotations, policies, and claims for the authenticated user and no records belonging to other users (tenant isolation).
- **P2-5:** Unit test: pHash computation produces a consistent hash for the same image. Two near-identical images (one slightly cropped) produce hashes with Hamming distance < 10. Two unrelated images produce hashes with Hamming distance > 20.
- **P2-6:** Unit test: the cross-submission pHash similarity query returns a match when two submissions contain images with Hamming distance < 10.
- **P2-7:** Unit test: `photoForensicsEngine.ts` sets `exifAbsent = true` for an image with no EXIF data and `exifAbsent = false` for an image with EXIF capture datetime.
- **P2-8:** Integration test: the AI-generation detection LLM call returns a structured result with `isAiGenerated: boolean` and `confidence: number` for a test image.
- **P2-11:** Unit test: `agency.getValuation` returns a `VehicleValuationResult` with non-null `estimatedValueUsd` and `confidence` for a valid make/model/year input.
- **E2E:** End-to-end test: a user with `agency` role can submit a quotation request, upload vehicle photos, receive a verification result, and view the quotation status on the customer case tracking page.

### 5.13 Regression Risks

| Risk | Affected Area | Mitigation |
|---|---|---|
| pHash computation adds latency to photo ingestion | Claims photo ingestion pipeline | Measure pHash computation time on representative images. If > 200ms per image, run pHash computation asynchronously after ingestion rather than inline. |
| AI-generation detection LLM call adds cost and latency | Claims photo ingestion pipeline | The AI-generation detection call should be gated by a feature flag so it can be disabled for Claims ingestion if cost is a concern. |
| `photoForensicsEngine.ts` output type change may break callers | All callers of `photoForensicsEngine.ts` | The `exifAbsent` field is additive. All callers must be checked to confirm they do not destructure the result in a way that would fail on an unexpected field. |
| Customer workspace route group may conflict with existing routes | `client/src/App.tsx` | Review all existing routes before adding `/customer/*` to confirm no overlap. |

### 5.14 Rollback Strategy

Phase 2 rollback is straightforward because all changes are additive:

- **P2-1 (guard update):** Revert the `agencyProcedure` guard to its previous state. Agency users will receive FORBIDDEN errors but no data will be lost.
- **P2-5 (pHash column):** Drop the `pHash` column from `ingestionDocuments`. Safe as long as no application code depends on it.
- **P2-8 (AI-generation detection):** The AI-generation detection call can be disabled via feature flag without a code deployment.
- **Report templates:** New templates are additive. Removing them has no effect on existing reports.

### 5.15 Acceptance Criteria

Phase 2 is complete when all of the following are true:

1. A user with the `agency` role can log in and access the Agency broker portal without a FORBIDDEN error.
2. An admin user can assign the `agency` role to a user via the admin UI.
3. A customer user can view their quotation status, policy status, and claim status on the customer case tracking page.
4. The `photoForensicsEngine.ts` returns `exifAbsent: true` for a test image with no EXIF data.
5. The `photoForensicsEngine.ts` returns `isAiGenerated: boolean` for a test image.
6. Two near-identical images submitted in the same Agency intake trigger the pHash similarity alert.
7. `agency.getValuation` returns a valid valuation result for a test vehicle.
8. The Vehicle Verification Report and Vehicle Valuation Report render correctly via `reportQueue.ts`.
9. All Phase 2 Vitest tests pass.
10. The existing Claims pipeline processes a test claim end-to-end without regression.

### 5.16 Dependencies

Phase 2 depends on Phase 1 being fully complete and all Phase 1 acceptance criteria being verified. Specifically:
- P2-1 depends on P1-1 (agency role must exist in the enum before the guard can permit it).
- P2-3 and P2-4 depend on P2-1 (customer workspace is only accessible to agency/customer role users).
- P2-6 depends on P2-5 (pHash similarity query requires the pHash column to exist).


---

## 6. Phase 3 — Engineering Workspace

### 6.1 Objectives

Phase 3 builds the KINGA Engineering Workspace — a standalone module for engineers and engineering managers to conduct vehicle and asset inspections, record physical measurements, inject measurements into the physics pipeline, and produce engineering-grade inspection reports. It reuses the existing physics pipeline, photo forensics engine, reconciliation engine, and reporting infrastructure. It introduces three new database entities and one new router.

### 6.2 Business Justification

The current platform has no pathway for an engineer's physical measurement to enter the KINGA intelligence system as an independent evidence source. All physics analysis is derived exclusively from images. An engineer's direct crush depth measurement (in mm) is a higher-confidence evidence source than an AI-derived estimate from image calibration. Without this pathway, KINGA cannot support engineering-grade assessments, court-admissible reports, or regulatory compliance inspections. Phase 3 closes this gap without rebuilding the physics pipeline — it adds an injection point to an existing, production-grade system.

### 6.3 Technical Scope

Phase 3 consists of nine tasks. Tasks P3-1 through P3-3 introduce the three new database entities. Tasks P3-4 and P3-5 generalise the physics pipeline to accept engineer measurements. Tasks P3-6 through P3-9 build the Engineering Workspace router, frontend, report template, and notification system.

### 6.4 Components Affected

| Task | File(s) Affected | Change Type |
|---|---|---|
| P3-1 | `drizzle/schema.ts` (new inspections table) | New table migration |
| P3-2 | `drizzle/schema.ts` (new physicalMeasurements table) | New table migration |
| P3-3 | `drizzle/schema.ts` (new engineerObservations table) | New table migration |
| P3-4 | `server/pipeline-v2/types.ts` (Stage7Input type) | Type extension |
| P3-5 | `server/pipeline-v2/reconciliation-engine.ts` (ReconciliationSource enum) | Enum extension |
| P3-6 | New `server/routers/engineering.ts` | New router |
| P3-7 | New `client/src/pages/Engineering*.tsx`, `client/src/App.tsx` | New pages + route registration |
| P3-8 | New `server/reporting/engineeringInspectionReport.ts` | New report template |
| P3-9 | `server/safe-email.ts` (new notifyUser wrapper), `drizzle/schema.ts` (new notifications table) | Extension + new table |

### 6.5 Existing Reusable Components

The following components are reused without modification in Phase 3:

- `server/pipeline-v2/photoForensicsEngine.ts` — evidence capture for engineering inspections
- `server/pipeline-v2/stage-7-physics.ts` — physics analysis (receives engineer measurements via new input field)
- `server/pipeline-v2/stage-7-unified.ts` — physics consensus
- `server/pipeline-v2/reconciliation-engine.ts` — AI vs physical measurement arbitration (extended with new source type)
- `server/pipeline-v2/felVersionRegistry.ts` — court-grade audit trail for engineering reports
- `server/pipeline-v2/speedInferenceEnsemble.ts` — speed inference (reusable, no claim dependency)
- `server/pipeline-v2/physicsNumericalContract.ts` — physics output validation
- `server/reporting/reportQueue.ts` — asynchronous report generation and S3 upload
- `server/reporting/templates/kingaDesignSystem.ts` — report design system primitives
- `client/src/components/DashboardLayout.tsx` — Engineering Workspace uses the existing dashboard layout

### 6.6 New Components Required

| Component | Type | Location | Purpose |
|---|---|---|---|
| `inspections` table | Database table | `drizzle/schema.ts` | Generic inspection entity (polymorphic, not Claims-specific) |
| `physicalMeasurements` table | Database table | `drizzle/schema.ts` | Engineer-recorded physical measurements (multi-asset) |
| `engineerObservations` table | Database table | `drizzle/schema.ts` | Engineer observations and notes per inspection |
| `Stage7Input.engineerMeasurements` field | Type extension | `server/pipeline-v2/types.ts` | Passes engineer measurements to physics pipeline |
| `ReconciliationSource.engineer_measurement` | Enum extension | `server/pipeline-v2/reconciliation-engine.ts` | Identifies engineer measurements as a reconciliation source |
| Engineering router | tRPC router | `server/routers/engineering.ts` | All Engineering Workspace procedures |
| Engineering Workspace pages | Frontend pages | `client/src/pages/Engineering*.tsx` | Inspection list, inspection detail, measurement entry, report view |
| Engineering Inspection Report template | Report template | `server/reporting/engineeringInspectionReport.ts` | Engineering-grade inspection report |
| `notifyUser()` wrapper | Service extension | `server/safe-email.ts` | Generic user notification (email + optional in-app) |
| `notifications` table | Database table | `drizzle/schema.ts` | In-app notification persistence |

### 6.7 APIs to Expose

The following new tRPC procedures must be added in Phase 3 via `server/routers/engineering.ts`:

| Procedure | Input | Output | Auth |
|---|---|---|---|
| `engineering.createInspection` | `{ caseType, caseId, assetType, assetId, assignedEngineerId, scheduledDate }` | `Inspection` | `engineeringProcedure` |
| `engineering.getInspection` | `{ inspectionId }` | `Inspection` with measurements + observations | `engineeringProcedure` |
| `engineering.listInspections` | `{ status?, assignedTo?, dateRange? }` | `Inspection[]` | `engineeringProcedure` |
| `engineering.addMeasurement` | `{ inspectionId, measurementCategory, measurementLabel, valueRaw, unit, referencePoint, instrumentType, evidencePhotoUrl }` | `PhysicalMeasurement` | `engineeringProcedure` |
| `engineering.addObservation` | `{ inspectionId, observationText, severity, evidencePhotoUrls }` | `EngineerObservation` | `engineeringProcedure` |
| `engineering.runPhysicsAnalysis` | `{ inspectionId }` | `PhysicsAnalysisResult` | `engineeringProcedure` |
| `engineering.generateReport` | `{ inspectionId, reportType }` | `{ reportJobId }` | `engineeringProcedure` |
| `engineering.getReportStatus` | `{ reportJobId }` | `ReportJobStatus` | `engineeringProcedure` |

The `engineeringProcedure` middleware must permit `engineer`, `engineering_manager`, `admin`, and `platform_super_admin` roles.

### 6.8 Database Changes

**P3-1 — inspections table**

The `inspections` table is a generic, polymorphic inspection entity. It must not be a renamed version of any Claims-specific table. Its schema is:

| Column | Type | Notes |
|---|---|---|
| `id` | int, PK, auto-increment | |
| `inspectionRef` | varchar(50), unique | KINGA-format reference number |
| `caseType` | varchar(50) | `claim`, `fleet_incident`, `agency_verification`, `standalone` |
| `caseId` | int, nullable | FK to the relevant case (polymorphic) |
| `assetType` | varchar(50) | `vehicle`, `machinery`, `electrical`, `structural`, `property` |
| `assetId` | int, nullable | FK to the relevant asset record (polymorphic) |
| `status` | enum | `scheduled`, `in_progress`, `measurements_complete`, `report_pending`, `completed`, `cancelled` |
| `assignedEngineerId` | int, FK to users.id | |
| `scheduledDate` | datetime | |
| `completedDate` | datetime, nullable | |
| `tenantId` | varchar(64), FK to tenants.id | |
| `createdBy` | int, FK to users.id | |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

**P3-2 — physicalMeasurements table**

The `physicalMeasurements` table stores engineer-recorded field measurements. It is deliberately asset-type agnostic. Its schema is:

| Column | Type | Notes |
|---|---|---|
| `id` | int, PK, auto-increment | |
| `inspectionId` | int, FK to inspections.id | |
| `measurementCategory` | varchar(100) | Free-form string: `crush_depth`, `gap`, `deformation`, `electrical`, `structural`, etc. |
| `measurementLabel` | varchar(255) | Human-readable label for the measurement |
| `valueRaw` | decimal(10,4) | Numeric measurement value |
| `unit` | varchar(20) | `mm`, `cm`, `m`, `V`, `A`, `kN`, `kg`, etc. |
| `referencePoint` | text, nullable | Description of measurement reference point |
| `instrumentType` | varchar(100), nullable | `ruler`, `caliper`, `multimeter`, `laser`, etc. |
| `instrumentId` | varchar(100), nullable | Instrument serial or calibration ID |
| `calibrationRef` | varchar(100), nullable | Calibration certificate reference |
| `confidence` | decimal(3,2), nullable | 0.00–1.00 |
| `engineerId` | int, FK to users.id | |
| `evidencePhotoUrl` | text, nullable | S3 URL of photo showing the measurement |
| `tenantId` | varchar(64), FK to tenants.id | |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

The `measurementCategory` field is a free-form string (not an enum) to avoid constraining future asset types. Validation of permitted categories is enforced at the application layer, not the database layer.

**P3-3 — engineerObservations table**

| Column | Type | Notes |
|---|---|---|
| `id` | int, PK, auto-increment | |
| `inspectionId` | int, FK to inspections.id | |
| `observationText` | text | Free-form observation |
| `severity` | enum | `informational`, `minor`, `moderate`, `significant`, `critical` |
| `evidencePhotoUrls` | json | Array of S3 URLs |
| `engineerId` | int, FK to users.id | |
| `tenantId` | varchar(64), FK to tenants.id | |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

**P3-9 — notifications table**

| Column | Type | Notes |
|---|---|---|
| `id` | int, PK, auto-increment | |
| `recipientId` | int, FK to users.id | |
| `title` | varchar(255) | |
| `content` | text | |
| `channel` | enum | `email`, `in_app`, `both` |
| `isRead` | boolean, default false | |
| `relatedEntityType` | varchar(50), nullable | `inspection`, `claim`, `quotation`, etc. |
| `relatedEntityId` | int, nullable | |
| `tenantId` | varchar(64), FK to tenants.id | |
| `createdAt` | datetime | |

### 6.9 UI Changes

**P3-7 — Engineering Workspace pages**

The Engineering Workspace must consist of the following pages, all using `DashboardLayout`:

| Page | Route | Purpose |
|---|---|---|
| `EngineeringDashboard.tsx` | `/engineering` | Inspection queue, KPIs, recent activity |
| `EngineeringInspectionList.tsx` | `/engineering/inspections` | Filterable list of all inspections |
| `EngineeringInspectionDetail.tsx` | `/engineering/inspections/:id` | Full inspection view with measurements, observations, photos, and physics results |
| `EngineeringMeasurementEntry.tsx` | `/engineering/inspections/:id/measure` | Guided measurement entry form |
| `EngineeringReportView.tsx` | `/engineering/inspections/:id/report` | Report preview and download |

The Engineering Workspace must be accessible only via the sidebar navigation when the user has the `engineer` or `engineering_manager` role. It must not be visible to insurer, assessor, or customer users.

The measurement entry form must enforce the following UX requirements:
- Each measurement must have a category (selectable from a predefined list, with free-text fallback), a label, a numeric value, and a unit.
- The form must require an evidence photo upload for each measurement.
- The form must display the measurement in context (e.g., a vehicle diagram with measurement points highlighted) if the asset type is `vehicle`.

### 6.10 RBAC Changes

A new `engineeringProcedure` middleware must be created in `server/routers/engineering.ts` (or in a shared middleware file). It must permit `engineer`, `engineering_manager`, `admin`, and `platform_super_admin` roles. All Engineering Workspace procedures must use this middleware.

The `engineering_manager` role must additionally be permitted to approve completed inspection reports and assign inspections to engineers. These are separate procedures from the engineer-level procedures.

### 6.11 Workflow Changes

The `inspections` table has its own status lifecycle: `scheduled → in_progress → measurements_complete → report_pending → completed | cancelled`. This lifecycle is managed by the Engineering Workspace router procedures and does not interact with the Claims state machine.

When an inspection is linked to a claim (`caseType = 'claim'`), the inspection completion event must write an audit trail record to `auditTrail` with `caseType = 'claim'` and `caseId = claimId`. This uses the generalised audit trail introduced in Phase 1.

### 6.12 Physics Pipeline Injection

The physics pipeline injection is the most technically sensitive change in Phase 3. The following describes the exact injection mechanism without pseudocode.

The `Stage7Input` type in `server/pipeline-v2/types.ts` must receive a new optional field: `engineerMeasurements`. This field is an array of objects, each containing: `measurementCategory` (string), `valueRaw` (number), `unit` (string), `confidence` (number 0–1), and `measurementId` (int, FK to `physicalMeasurements.id`).

When `engineerMeasurements` is present and contains a `crush_depth` measurement, `stage-7-physics.ts` must use the engineer-provided crush depth value directly, bypassing the image calibration step (VGR scale derivation). The engineer-provided value must be logged as a `ReconciliationSource.engineer_measurement` event in the reconciliation engine.

The `reconciliation-engine.ts` `ReconciliationSource` enum must add `"engineer_measurement"` as a new value. The arbitration logic already handles source confidence weighting — an engineer measurement with `confidence = 0.95` will outweigh an AI-derived estimate with `confidence = 0.70` without any changes to the arbitration mathematics.

The physics output must record which source was used for each measurement input (AI-derived or engineer-provided) in the `physicsSourceAttribution` field of the Stage 7 output. This field already exists in the output type.

### 6.13 Engineering Inspection Report

The Engineering Inspection Report must be a new template in `server/reporting/engineeringInspectionReport.ts`. It must use `kingaDesignSystem.ts` primitives exclusively. It must be registered in `server/reporting/reportDefinitions.ts` with the key `engineering.inspection`.

The report must contain the following sections:

| Section | Content |
|---|---|
| §01 — Inspection Summary | Asset details, inspection reference, engineer name, date, status |
| §02 — Physical Measurements | Table of all recorded measurements with values, units, reference points, and instrument details |
| §03 — Engineer Observations | Severity-classified observations with evidence photos |
| §04 — Physics Analysis | Speed inference, energy analysis, crush depth comparison (AI-derived vs engineer-measured), causal reasoning |
| §05 — Forensic Image Analysis | Photo forensics results (EXIF, GPS, manipulation score, AI-generation flag) |
| §06 — Reconciliation | Source arbitration log — which values were used and why |
| §07 — FEL Audit Trail | Court-grade version registry entries for all analysis steps |
| §08 — Engineer Sign-Off | Digital signature block with engineer name, date, and report hash |

### 6.14 Testing Strategy

The following tests must be written and pass before Phase 3 is considered complete:

- **P3-1 through P3-3:** Unit tests confirming all three new tables accept valid records and enforce FK constraints.
- **P3-4/P3-5:** Unit test: `stage-7-physics.ts` produces a different (higher-confidence) result when `engineerMeasurements` contains a `crush_depth` value compared to the image-only baseline.
- **P3-5:** Unit test: the reconciliation engine logs a `ReconciliationSource.engineer_measurement` event when an engineer measurement is used.
- **P3-6:** Integration tests for all eight Engineering Workspace procedures.
- **P3-8:** Unit test: the Engineering Inspection Report renders all eight sections without error for a test inspection with measurements and observations.
- **P3-9:** Unit test: `notifyUser()` sends an email to the correct recipient and creates a `notifications` record.
- **E2E:** End-to-end test: an engineer creates an inspection, records three measurements, runs physics analysis, and generates a report. The report PDF is stored in S3 and retrievable via `engineering.getReportStatus`.

### 6.15 Regression Risks

| Risk | Affected Area | Mitigation |
|---|---|---|
| `Stage7Input` type extension may break existing callers that construct `Stage7Input` without the new field | All callers of `stage-7-physics.ts` | The `engineerMeasurements` field must be optional (nullable). All existing callers will continue to work without modification. |
| `ReconciliationSource` enum extension may break exhaustive switch statements | `reconciliation-engine.ts` and any code that switches on `ReconciliationSource` | Search for all switch statements on `ReconciliationSource` before adding the new value. Add the new case to each switch. |
| New tables may cause `pnpm db:push` to fail if the migration conflicts with existing FK constraints | `drizzle/schema.ts` | Review FK constraints on `users.id` and `tenants.id` before migration. |

### 6.16 Rollback Strategy

Phase 3 rollback:

- **New tables (P3-1, P3-2, P3-3, notifications):** Drop the tables. Safe as long as no data has been written.
- **Type extensions (P3-4, P3-5):** Revert the type changes. The `engineerMeasurements` field is optional — removing it has no effect on existing callers.
- **New router (P3-6):** Remove the router registration from `server/routers.ts`. The router file can remain in the codebase without effect.
- **New pages (P3-7):** Remove the route registrations from `client/src/App.tsx`. The page files can remain without effect.

### 6.17 Acceptance Criteria

Phase 3 is complete when all of the following are true:

1. An engineer user can create an inspection, record measurements, and add observations via the Engineering Workspace UI.
2. The `engineering.runPhysicsAnalysis` procedure returns a physics result that uses the engineer's crush depth measurement when provided.
3. The reconciliation engine log for the physics analysis records `ReconciliationSource.engineer_measurement` for the engineer-provided measurement.
4. The Engineering Inspection Report renders all eight sections and is stored in S3.
5. An engineer receives an email notification when assigned to a new inspection.
6. All Phase 3 Vitest tests pass.
7. The existing Claims pipeline processes a test claim end-to-end without regression (the `Stage7Input` type change must not affect existing Claims pipeline behaviour).

### 6.18 Dependencies

Phase 3 depends on:
- Phase 1 complete (P1-1 for engineer role, P1-2 for audit trail generalisation, P1-3 for workflow generalisation, P1-6 for TypeScript cleanup before physics changes).
- Phase 2 is not a dependency for Phase 3. The two phases can proceed in parallel after Phase 1 is complete.

---

## 7. Phase 4 — Vehicle Passport & Cross-Module Intelligence

### 7.1 Objectives

Phase 4 builds the KINGA Vehicle Passport — a read-only, cross-module aggregation view of a vehicle's complete history across Claims, Fleet, Agency, and Engineering. It connects fleet incidents to the Claims pipeline. It builds the cross-module analytics dashboard. All Phase 4 work is additive and read-only in its primary deliverables — no existing data is modified.

### 7.2 Business Justification

The `vehicleRegistry` table is the most strategically important table in the KINGA platform. It already aggregates claims history, damage zone frequencies, fraud signals, and risk scores. However, it is currently disconnected from Fleet and Agency vehicle records, making it impossible to detect when the same physical vehicle appears in multiple contexts. Phase 4 closes this gap and surfaces the aggregated intelligence in a single, authoritative Vehicle Passport view. This is the foundation for cross-module fraud detection, pre-insurance risk assessment, and fleet risk management.

### 7.3 Technical Scope

Phase 4 consists of five tasks. Tasks P4-1 through P4-3 build the Vehicle Passport. Task P4-4 connects fleet incidents to the Claims pipeline. Task P4-5 builds the cross-module analytics dashboard.

### 7.4 Components Affected

| Task | File(s) Affected | Change Type |
|---|---|---|
| P4-1 | `server/db.ts` (new aggregation query) | New query function |
| P4-2 | New `client/src/pages/VehiclePassport.tsx`, `client/src/App.tsx` | New page + route |
| P4-3 | New `server/reporting/vehiclePassportReport.ts` | New report template |
| P4-4 | `drizzle/schema.ts` (fleetIncidentReports.claimId FK), `server/routers/fleet-accounts.ts` or new procedure | New FK column + new procedure |
| P4-5 | New `client/src/pages/CrossModuleAnalytics.tsx`, `server/services/analytics/` (new query functions) | New page + new query functions |

### 7.5 Existing Reusable Components

- `vehicleRegistry` table — anchor entity for the Vehicle Passport
- `vehicleDamageHistory` table — per-incident damage records
- `repairHistory` table — repair records linked by registration number
- `vehicleMarketValuations` table — valuation history
- `server/routers/cross-claim-intelligence.ts` — cross-claim pattern detection (reusable for fleet VINs)
- `server/services/analytics/` — analytics export service (extended with new query functions)
- `server/reporting/reportQueue.ts` — report generation infrastructure
- `server/reporting/templates/kingaDesignSystem.ts` — design system primitives
- `client/src/components/DashboardLayout.tsx` — dashboard layout

### 7.6 New Components Required

| Component | Type | Location | Purpose |
|---|---|---|---|
| Vehicle Passport aggregation query | DB helper | `server/db.ts` | Aggregates vehicle history across all modules |
| Vehicle Passport page | Frontend page | `client/src/pages/VehiclePassport.tsx` | Read-only cross-module vehicle history view |
| Vehicle Passport Report template | Report template | `server/reporting/vehiclePassportReport.ts` | Printable vehicle history report |
| Fleet incident → Claims linkage | DB column + procedure | `drizzle/schema.ts`, `server/routers/` | Connects fleet incidents to Claims pipeline |
| Cross-module analytics dashboard | Frontend page + query functions | `client/src/pages/CrossModuleAnalytics.tsx`, `server/services/analytics/` | Unified analytics across Claims, Agency, Fleet, Engineering |

### 7.7 APIs to Expose

| Procedure | Router | Input | Output | Auth |
|---|---|---|---|---|
| `vehicle.getPassport` | New `server/routers/vehicle.ts` | `{ vin?, registrationNumber? }` | `VehiclePassport` | `protectedProcedure` (insurer, admin, engineer) |
| `vehicle.generatePassportReport` | `server/routers/vehicle.ts` | `{ vehicleRegistryId }` | `{ reportJobId }` | `protectedProcedure` |
| `fleet.raiseClaimFromIncident` | `server/routers/fleet-accounts.ts` | `{ fleetIncidentId, claimDetails }` | `{ claimId }` | `fleetManagerProcedure` |
| `analytics.getCrossModuleSummary` | `server/routers/analytics.ts` | `{ tenantId, dateRange }` | `CrossModuleSummary` | `adminProcedure` |

### 7.8 Database Changes

**P4-4 — fleetIncidentReports.claimId FK**

Add `claimId` column to `fleetIncidentReports`: `int` nullable, FK to `claims.id` ON DELETE SET NULL. This allows a fleet incident to be linked to a KINGA claim when the incident escalates to a formal claim submission.

No other database changes are required in Phase 4. The Vehicle Passport is a read-only aggregation view — it requires no new tables.

### 7.9 UI Changes

**P4-2 — Vehicle Passport page**

The Vehicle Passport page at `/vehicles/:id/passport` must display:

| Section | Data Source |
|---|---|
| Vehicle Identity | `vehicleRegistry` (VIN, registration, make/model/year, colour) |
| Risk Profile | `vehicleRegistry.vehicleRiskScore`, `hasSuspiciousDamagePattern`, `isRepeatClaimer`, `isSalvageTitle`, `isStolen`, `isWrittenOff` |
| Claims History | `vehicleDamageHistory` joined to `claims` |
| Repair History | `repairHistory` |
| Valuation History | `vehicleMarketValuations` |
| Fleet History | `fleetVehicles` (via `vehicleRegistryId` FK added in Phase 1) |
| Agency History | `agencyClients` (via `vehicleRegistryId` FK added in Phase 1) |
| Engineering Inspections | `inspections` (via `assetType = 'vehicle'` and `assetId`) |
| Fraud Signals | `fraudAlerts` and `crossClaimSignals` linked to this vehicle |

The page must be accessible from the Claims detail page, the Fleet vehicle detail page, and the Engineering inspection detail page via a "View Vehicle Passport" link.

**P4-5 — Cross-module analytics dashboard**

The cross-module analytics dashboard at `/analytics` must display:

| Panel | Metric |
|---|---|
| Claims | Total claims, average settlement, fraud rate, fast-track rate |
| Agency | Quote conversion rate, policy issuance rate, average premium |
| Fleet | Active fleets, incident rate, maintenance compliance rate |
| Engineering | Inspections completed, average turnaround, report approval rate |
| Vehicle Intelligence | Top 10 vehicles by risk score, repeat claimers, suspicious damage patterns |

All metrics must be scoped to the authenticated user's `tenantId`.

### 7.10 RBAC Changes

The `vehicle.getPassport` procedure must be accessible to `insurer`, `admin`, `engineer`, `engineering_manager`, and `platform_super_admin` roles. It must not be accessible to `customer` or `agency` roles (vehicle history is commercially sensitive).

The `analytics.getCrossModuleSummary` procedure must be accessible to `admin` and `platform_super_admin` roles only.

### 7.11 Workflow Changes

**P4-4 — Fleet incident → Claims pipeline**

The `fleet.raiseClaimFromIncident` procedure must:
1. Create a new `claims` record with `claimSource = 'fleet'` and `status = 'intake_pending'`.
2. Copy the relevant fields from `fleetIncidentReports` to the new claim record.
3. Update `fleetIncidentReports.claimId` to reference the new claim.
4. Trigger the Claims intake pipeline for the new claim.

This procedure reuses the existing Claims intake pipeline without modification. The `claimSource` field already supports custom source values.

### 7.12 Testing Strategy

- **P4-1:** Unit test: `getVehiclePassport(vin)` returns a correctly aggregated result containing claims history, repair history, and fleet history for a test vehicle that appears in all three modules.
- **P4-2:** Integration test: the Vehicle Passport page renders without error for a vehicle with records in Claims, Fleet, and Agency.
- **P4-3:** Unit test: the Vehicle Passport Report renders all sections and is stored in S3.
- **P4-4:** Integration test: `fleet.raiseClaimFromIncident` creates a valid claim record and links it to the fleet incident.
- **P4-5:** Unit test: `analytics.getCrossModuleSummary` returns non-null metrics for all four modules for a tenant with data in all modules.
- **Tenant isolation:** Verify that `vehicle.getPassport` and `analytics.getCrossModuleSummary` return only records belonging to the authenticated user's tenant.

### 7.13 Regression Risks

| Risk | Affected Area | Mitigation |
|---|---|---|
| Vehicle Passport aggregation query may be slow on large datasets | `server/db.ts` | Add indexes on `vehicleDamageHistory.vehicleRegistryId`, `repairHistory.vehicleRegistrationNumber`, and `vehicleMarketValuations.vehicleRegistryId` before deploying the query. |
| Fleet incident → Claims linkage may create duplicate claims if the procedure is called twice | `claims` table | The procedure must check for an existing `claimId` on the `fleetIncidentReports` record before creating a new claim. |

### 7.14 Rollback Strategy

Phase 4 rollback:

- **P4-1 (aggregation query):** Remove the query function from `server/db.ts`. No data is affected.
- **P4-2 (Vehicle Passport page):** Remove the route from `client/src/App.tsx`. No data is affected.
- **P4-3 (report template):** Remove the template registration from `reportDefinitions.ts`. No data is affected.
- **P4-4 (fleetIncidentReports.claimId FK):** Drop the column. Safe as long as no fleet incidents have been linked to claims.
- **P4-5 (analytics dashboard):** Remove the route and query functions. No data is affected.

### 7.15 Acceptance Criteria

Phase 4 is complete when all of the following are true:

1. The Vehicle Passport page displays a complete history for a test vehicle that has records in Claims, Fleet, and Agency.
2. The Vehicle Passport Report is generated and stored in S3 without error.
3. `fleet.raiseClaimFromIncident` creates a valid claim and links it to the fleet incident.
4. The cross-module analytics dashboard displays non-null metrics for all four modules.
5. All Phase 4 Vitest tests pass.
6. Tenant isolation is verified for all new procedures.

### 7.16 Dependencies

Phase 4 depends on:
- Phase 1 complete (P1-4 and P1-5 for fleet and agency vehicle linkage to `vehicleRegistry`).
- Phase 3 recommended but not blocking (the Vehicle Passport can display engineering inspections only after Phase 3 creates the `inspections` table).

---

## 8. Pre-Existing Risks to Resolve Before Any Phase Begins

The following risks were identified in prior audits and must be addressed before the implementation phases begin. They are not part of any phase — they are pre-conditions.

| Risk | Severity | Required Action | Owner |
|---|---|---|---|
| SARJAZZ INVESTMENTS supplier-injection bug | **Critical** | Fix `quoteOptimisationEngine.ts` to scope composite line items to the claim's registered suppliers only | Engineering |
| Fraud learning corpus contamination (G-1) | **High** | Add fraud-risk exclusion gate to `costLearningRecorder.ts` | Engineering |
| Benchmark drift monitoring absent (G-2) | **High** | Add benchmark drift monitoring job | Engineering |
| Quote extraction non-determinism | **Medium** | Set `temperature: 0` for quote extraction LLM calls; cache extracted line items on first extraction | Engineering |
| Scope blending in benchmarks (C-1) | **High** | Re-derive scope-segmented Tier 3 benchmarks from `component_repair_outcomes` data once the table is confirmed to be receiving records | Data/Engineering |
| `component_repair_outcomes` table empty | **High** | Confirm whether `costLearningRecorder.ts` is writing records after claim decisions | Engineering |

---

## 9. Implementation Readiness Checklist

Before any engineering team begins Phase 1, the following must be confirmed:

- [ ] The SARJAZZ supplier-injection bug is fixed and verified in production.
- [ ] The fraud learning corpus contamination gate is in place.
- [ ] A senior engineer has reviewed all Phase 1 migration changes against the live schema.
- [ ] The VIN-match population job has been tested on a representative sample of `fleetVehicles` and `agencyClients` records.
- [ ] The rollback strategy for Phase 1 has been confirmed with the database administrator.
- [ ] Phase 1 acceptance criteria have been agreed with the product owner.
- [ ] The engineering team has read and acknowledged the three prior audit documents: `KINGA-Platform-Architecture-Audit.md`, `KINGA-Cost-Architecture.md`, and `KINGA-Benchmark-Comparability-Audit.md`.

---

*End of KINGA Implementation Specification v1.0*
