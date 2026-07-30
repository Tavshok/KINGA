# KINGA Engineering Backlog v1.0

**Document Type:** Engineering Backlog  
**Version:** 1.0  
**Date:** July 2026  
**Classification:** Internal — Engineering  
**Status:** Ready for Sprint Planning  
**Source Document:** KINGA Implementation Specification v1.0 (checkpoint `109c7b57`)  
**Compatible with:** GitHub Projects, Azure DevOps, Linear, Jira  

---

## 1. How to Read This Backlog

Each item in this backlog follows the hierarchy:

```
EPIC  →  FEATURE  →  USER STORY  →  TECHNICAL TASK  →  SUBTASK
```

Every item carries the following metadata fields, suitable for import into any project management tool:

| Field | Values |
|---|---|
| **ID** | Hierarchical reference, e.g. `P1-E1-F1-US1-T1-S1` |
| **Type** | `Epic` / `Feature` / `Story` / `Task` / `Subtask` |
| **Phase** | `P1` / `P2` / `P3` / `P4` |
| **Spec Ref** | Reference to the Implementation Specification section |
| **Complexity** | `XS` / `S` / `M` / `L` / `XL` |
| **Labels** | See label taxonomy below |
| **Blocks** | IDs of items that cannot start until this item is done |
| **Blocked By** | IDs of items that must be done before this item can start |
| **Parallel With** | IDs of items that can be worked concurrently |
| **Status** | `Backlog` (all items start here) |

---

## 2. Label Taxonomy

Every item carries one or more of the following labels. Labels are not mutually exclusive.

| Label | Meaning |
|---|---|
| `db` | Requires a database schema change or migration |
| `backend` | Server-side TypeScript work (tRPC procedures, services, engines) |
| `frontend` | Client-side React/TypeScript work |
| `ai` | Involves an LLM call, ML model, or AI engine |
| `testing` | Vitest unit test, integration test, or E2E test |
| `infra` | Infrastructure, environment, or tooling change |
| `report` | Report template work using `kingaDesignSystem.ts` |
| `rbac` | Role-based access control change |
| `migration` | Database migration (subset of `db`) |
| `blocker` | This item blocks one or more other items |
| `pre-condition` | Must be resolved before any phase begins (pre-existing risk) |

---

## 3. Complexity Scale

| Size | Meaning | Typical scope |
|---|---|---|
| **XS** | Trivial | Single field change, one-line fix, config update |
| **S** | Small | Single file change, one procedure, one test |
| **M** | Medium | 2–4 files, one feature end-to-end, standard complexity |
| **L** | Large | Multiple files, new entity, cross-layer change |
| **XL** | Extra Large | New module, new engine, multiple entities, significant risk |

---

## 4. Global Pre-Conditions (must be resolved before Phase 1 begins)

These items are not part of any phase. They are pre-existing risks that must be resolved and verified before the first sprint of Phase 1 begins.

---

### PRE-1 — Fix SARJAZZ Supplier-Injection Bug

**Type:** Feature  
**Spec Ref:** §8, Audit `KINGA-Cost-Architecture.md`  
**Complexity:** M  
**Labels:** `backend` `blocker` `pre-condition`  
**Blocks:** All phases (data integrity risk)  
**Blocked By:** Nothing  

**Description:** The composite quote engine (`quoteOptimisationEngine.ts`) is selecting line items from suppliers not registered for the claim. This corrupts `lCompositeOptimisedCostUsd` and all downstream signals.

**User Story:** As a claims adjuster, I need the composite optimised cost to be calculated only from quotes submitted by suppliers registered for this specific claim, so that the cost figure is accurate and auditable.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| PRE-1-T1 | Identify the query path in `quoteOptimisationEngine.ts` that sources composite line items and confirm the scope gap | `backend` | XS |
| PRE-1-T2 | Add a `claimId` scope filter to the composite line item query so only registered-supplier quotes are considered | `backend` | S |
| PRE-1-T3 | Write a Vitest test: composite engine for claim 8400001 returns zero SARJAZZ line items | `testing` | S |
| PRE-1-T4 | Verify `lCompositeOptimisedCostUsd` for claim 8400001 changes to the correct supplier-scoped value | `testing` | XS |

**Acceptance Criteria:**
- `compositeLineItems` for claim 8400001 contains no entries from `SARJAZZ INVESTMENTS`
- `lCompositeOptimisedCostUsd` is derived exclusively from quotes submitted by the claim's registered panel beaters
- Vitest test PRE-1-T3 passes

**Definition of Done:** Code reviewed, test passing, verified on claim 8400001 in staging.

---

### PRE-2 — Add Fraud Exclusion Gate to Learning Recorder

**Type:** Feature  
**Spec Ref:** §8, Audit `KINGA-Cost-Architecture.md` G-1  
**Complexity:** S  
**Labels:** `backend` `ai` `blocker` `pre-condition`  
**Blocks:** All phases (learning corpus integrity)  
**Blocked By:** Nothing  

**Description:** `costLearningRecorder.ts` admits all settled claims to the learning corpus without checking fraud risk. High-XV or disputed settlements must be excluded.

**User Story:** As a data engineer, I need the learning corpus to exclude fraudulent or disputed settlements, so that benchmark P50 values are not contaminated by inflated costs.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| PRE-2-T1 | Add a fraud-risk exclusion gate in `costLearningRecorder.ts`: skip records where `fraudScore >= 60` or `settlementStatus = 'disputed'` | `backend` | S |
| PRE-2-T2 | Write a Vitest test: a claim with `fraudScore = 75` is not written to `component_repair_outcomes` | `testing` | S |
| PRE-2-T3 | Confirm `component_repair_outcomes` is receiving records after the gate is in place (query after next completed claim) | `testing` | XS |

**Acceptance Criteria:**
- Claims with `fraudScore >= 60` are not written to `component_repair_outcomes`
- Claims with `settlementStatus = 'disputed'` are not written to `component_repair_outcomes`
- Vitest test PRE-2-T2 passes
- At least one record is written to `component_repair_outcomes` after a clean claim is settled

**Definition of Done:** Code reviewed, tests passing, confirmed in staging after one clean settlement.

---

### PRE-3 — Set LLM Temperature to 0 for Quote Extraction

**Type:** Feature  
**Spec Ref:** §8, Audit `KINGA-Cost-Architecture.md` G-6  
**Complexity:** XS  
**Labels:** `backend` `ai` `pre-condition`  
**Blocks:** Nothing directly, but eliminates `quoteDeviationPct` variance  
**Blocked By:** Nothing  

**Description:** Quote extraction LLM calls run at default temperature, causing non-deterministic line-item splitting and `quoteDeviationPct` variance across re-runs.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| PRE-3-T1 | Set `temperature: 0` on all LLM calls in Stage 3 quote extraction | `backend` `ai` | XS |
| PRE-3-T2 | Cache extracted line items in the DB on first extraction; re-runs reuse stored data | `backend` `db` | S |
| PRE-3-T3 | Run claim 8400001 three times and confirm `quoteDeviationPct` is identical across all three runs | `testing` | S |

**Acceptance Criteria:**
- Three consecutive re-runs of claim 8400001 produce identical `quoteDeviationPct` values
- Extracted line items are stored in the DB and reused on re-run

**Definition of Done:** Code reviewed, three-run consistency test passing.

---

## 5. Phase 1 — Platform Activation

**Phase Goal:** Establish foundational database and type-system changes. No new user-visible features. No breaking changes to existing Claims, Fleet, or current user behaviour.

**Phase Complexity:** M overall  
**Phase Labels:** `db` `migration` `backend` `testing` `blocker`  
**Blocks:** Phases 2, 3, and 4  
**Blocked By:** PRE-1, PRE-2, PRE-3 (recommended, not hard blockers)  

---

### P1-E1 — Role Enum Expansion

**Type:** Epic  
**Spec Ref:** §4.8 P1-1  
**Complexity:** S  
**Labels:** `db` `migration` `rbac` `blocker`  
**Blocks:** P2-E1 (Agency activation), P3-E1 (Engineering Workspace)  
**Blocked By:** Nothing  

---

#### P1-E1-F1 — Add agency, engineer, engineering_manager, risk_surveyor roles to users.role enum

**Type:** Feature  
**Complexity:** S  
**Labels:** `db` `migration` `rbac`  

**User Story:** As a platform administrator, I need the system to recognise `agency`, `engineer`, `engineering_manager`, and `risk_surveyor` as valid user roles, so that users can be assigned to these roles in preparation for module activation.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P1-E1-F1-T1 | Add `agency`, `engineer`, `engineering_manager`, `risk_surveyor` to the `users.role` enum in `drizzle/schema.ts` | `db` `migration` | XS |
| P1-E1-F1-T2 | Run `pnpm db:push` and confirm migration completes without error | `migration` | XS |
| P1-E1-F1-T3 | Write Vitest test: a user record can be created with each of the four new role values without a DB constraint violation | `testing` | S |
| P1-E1-F1-T4 | Write Vitest test: all existing role values remain valid and unaffected | `testing` | XS |

**Subtasks for T1:**
- Locate the `mysqlEnum` definition for `users.role` in `drizzle/schema.ts`
- Append `'agency'`, `'engineer'`, `'engineering_manager'`, `'risk_surveyor'` to the enum array
- Confirm the enum array preserves all 11 existing values in their original order

**Acceptance Criteria:**
- `pnpm db:push` completes without error
- A user with `role = 'agency'` can be inserted and retrieved
- A user with `role = 'engineer'` can be inserted and retrieved
- A user with `role = 'engineering_manager'` can be inserted and retrieved
- A user with `role = 'risk_surveyor'` can be inserted and retrieved
- All existing role values remain valid (regression check)
- All Vitest tests pass

**Definition of Done:** Migration applied to staging, tests passing, reviewed by senior engineer.

---

### P1-E2 — Audit Trail Generalisation

**Type:** Epic  
**Spec Ref:** §4.8 P1-2  
**Complexity:** M  
**Labels:** `db` `migration` `backend` `blocker`  
**Blocks:** P3-E3-F5 (engineering audit events), P4-E1-F1 (vehicle passport audit)  
**Blocked By:** Nothing  
**Parallel With:** P1-E3, P1-E4, P1-E5  

---

#### P1-E2-F1 — Make auditTrail.claimId nullable and add caseType/caseId discriminators

**Type:** Feature  
**Complexity:** M  
**Labels:** `db` `migration` `backend`  

**User Story:** As a platform engineer, I need the audit trail to record events from non-Claims contexts (inspections, valuations, fleet incidents), so that a complete, cross-module audit history is available for compliance and investigation.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P1-E2-F1-T1 | Search all server-side code for queries on `auditTrail` that assume `claimId IS NOT NULL` | `backend` | S |
| P1-E2-F1-T2 | Make `auditTrail.claimId` nullable in `drizzle/schema.ts` | `db` `migration` | XS |
| P1-E2-F1-T3 | Add `caseType` column: `varchar(50)` nullable, no FK constraint | `db` `migration` | XS |
| P1-E2-F1-T4 | Add `caseId` column: `int` nullable, no FK constraint | `db` `migration` | XS |
| P1-E2-F1-T5 | Update any queries identified in T1 to filter by `claimId` explicitly (not by non-null assumption) | `backend` | S |
| P1-E2-F1-T6 | Run `pnpm db:push` and confirm migration completes without error | `migration` | XS |
| P1-E2-F1-T7 | Write Vitest test: an `auditTrail` record with `claimId = null`, `caseType = 'inspection'`, `caseId = 1` can be inserted and retrieved | `testing` | S |
| P1-E2-F1-T8 | Write Vitest test: existing Claims audit records are readable and unmodified after migration | `testing` | S |
| P1-E2-F1-T9 | Run the Claims pipeline end-to-end on a test claim and confirm audit trail records are written correctly | `testing` | M |

**Subtasks for T1:**
- `grep -rn "auditTrail" server/` to find all query sites
- For each site, check whether the query assumes `claimId` is non-null
- Document each affected query file and line number before making changes

**Subtasks for T2–T4:**
- Locate the `auditTrail` table definition in `drizzle/schema.ts`
- Change `claimId: int('claim_id').notNull()` to `claimId: int('claim_id')`
- Add `caseType: varchar('case_type', { length: 50 })`
- Add `caseId: int('case_id')`

**Acceptance Criteria:**
- `pnpm db:push` completes without error
- An `auditTrail` record with `claimId = null` and `caseType = 'inspection'` can be inserted and retrieved
- All existing Claims audit records are readable and unmodified
- Claims pipeline end-to-end test passes without regression
- All Vitest tests pass

**Definition of Done:** Migration applied to staging, regression test passing, reviewed by senior engineer.

---

### P1-E3 — Workflow State Generalisation

**Type:** Epic  
**Spec Ref:** §4.8 P1-3  
**Complexity:** M  
**Labels:** `db` `migration` `backend` `blocker`  
**Blocks:** P3-E3-F4 (engineering inspection workflow), P4-E3-F1 (fleet incident workflow)  
**Blocked By:** Nothing  
**Parallel With:** P1-E2, P1-E4, P1-E5  

---

#### P1-E3-F1 — Make workflowStates.claimId nullable and add caseType/caseId discriminators

**Type:** Feature  
**Complexity:** M  
**Labels:** `db` `migration` `backend`  

**User Story:** As a platform engineer, I need the workflow state machine to support non-Claims case types (inspections, fleet incidents), so that the existing workflow infrastructure can be reused across all KINGA modules without duplication.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P1-E3-F1-T1 | Review all five guards in `server/claim-state-machine.ts` to confirm they filter by `claimId` explicitly | `backend` | S |
| P1-E3-F1-T2 | Make `workflowStates.claimId` nullable in `drizzle/schema.ts` | `db` `migration` | XS |
| P1-E3-F1-T3 | Add `caseType` column: `varchar(50)` nullable | `db` `migration` | XS |
| P1-E3-F1-T4 | Add `caseId` column: `int` nullable | `db` `migration` | XS |
| P1-E3-F1-T5 | Run `pnpm db:push` and confirm migration completes without error | `migration` | XS |
| P1-E3-F1-T6 | Write Vitest test: a `workflowStates` record with `claimId = null`, `caseType = 'inspection'`, `caseId = 1` can be inserted and retrieved | `testing` | S |
| P1-E3-F1-T7 | Write Vitest test: the existing Claims state machine reads `workflowStates` records correctly after migration | `testing` | M |

**Acceptance Criteria:**
- `pnpm db:push` completes without error
- A `workflowStates` record with `claimId = null` and `caseType = 'inspection'` can be inserted and retrieved
- Claims state machine end-to-end test passes without regression
- All Vitest tests pass

**Definition of Done:** Migration applied to staging, Claims state machine regression test passing, reviewed by senior engineer.

---

### P1-E4 — Fleet Vehicle → vehicleRegistry Linkage

**Type:** Epic  
**Spec Ref:** §4.8 P1-4  
**Complexity:** M  
**Labels:** `db` `migration` `backend` `blocker`  
**Blocks:** P4-E1-F1 (vehicle passport fleet data), P4-E3-F2 (fleet fraud detection)  
**Blocked By:** Nothing  
**Parallel With:** P1-E2, P1-E3, P1-E5  

---

#### P1-E4-F1 — Add vehicleRegistryId FK to fleetVehicles and run VIN-match population job

**Type:** Feature  
**Complexity:** M  
**Labels:** `db` `migration` `backend`  

**User Story:** As a claims investigator, I need fleet vehicles to be linked to the central vehicle registry, so that a vehicle's fleet history is visible alongside its claims history in the Vehicle Passport.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P1-E4-F1-T1 | Add `vehicleRegistryId` column to `fleetVehicles`: `int` nullable, FK to `vehicleRegistry.id` ON DELETE SET NULL | `db` `migration` | XS |
| P1-E4-F1-T2 | Run `pnpm db:push` and confirm migration completes without error | `migration` | XS |
| P1-E4-F1-T3 | Write a standalone Node.js `.mjs` script (not application code) that queries all `fleetVehicles` records with a non-null VIN, looks up matching `vehicleRegistry` records by VIN, and updates `vehicleRegistryId` where a match is found | `backend` | M |
| P1-E4-F1-T4 | Ensure the population script is idempotent (safe to re-run without creating duplicate links) | `backend` | S |
| P1-E4-F1-T5 | Handle duplicate VIN matches: log a warning and skip rather than creating an ambiguous link | `backend` | S |
| P1-E4-F1-T6 | Write Vitest test: `fleetVehicles.vehicleRegistryId` accepts null and a valid `vehicleRegistry.id` | `testing` | S |
| P1-E4-F1-T7 | Write Vitest test: the VIN-match population script produces correct matches on a test dataset of 10 vehicles | `testing` | M |
| P1-E4-F1-T8 | Execute the population script on staging and report match rate | `backend` | XS |

**Acceptance Criteria:**
- `pnpm db:push` completes without error
- `fleetVehicles.vehicleRegistryId` accepts null and a valid `vehicleRegistry.id`
- The VIN-match population script runs without error on staging
- Duplicate VIN matches are logged and skipped (not linked)
- The script is idempotent
- All Vitest tests pass

**Definition of Done:** Migration applied, population script executed on staging, match rate reported, reviewed by senior engineer.

---

### P1-E5 — Agency Client Vehicle → vehicleRegistry Linkage

**Type:** Epic  
**Spec Ref:** §4.8 P1-5  
**Complexity:** M  
**Labels:** `db` `migration` `backend` `blocker`  
**Blocks:** P4-E1-F1 (vehicle passport agency data)  
**Blocked By:** Nothing  
**Parallel With:** P1-E2, P1-E3, P1-E4  

---

#### P1-E5-F1 — Add vehicleRegistryId FK to agencyClients and run VIN-match population job

**Type:** Feature  
**Complexity:** M  
**Labels:** `db` `migration` `backend`  

**User Story:** As a claims investigator, I need agency client vehicles to be linked to the central vehicle registry, so that a vehicle's agency history (pre-insurance verifications, valuations) is visible in the Vehicle Passport.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P1-E5-F1-T1 | Add `vehicleRegistryId` column to `agencyClients`: `int` nullable, FK to `vehicleRegistry.id` ON DELETE SET NULL | `db` `migration` | XS |
| P1-E5-F1-T2 | Run `pnpm db:push` and confirm migration completes without error | `migration` | XS |
| P1-E5-F1-T3 | Extend the VIN-match population script from P1-E4-F1-T3 to also process `agencyClients` records | `backend` | S |
| P1-E5-F1-T4 | Write Vitest test: `agencyClients.vehicleRegistryId` accepts null and a valid `vehicleRegistry.id` | `testing` | S |
| P1-E5-F1-T5 | Execute the combined population script on staging and report match rate for both tables | `backend` | XS |

**Acceptance Criteria:**
- `pnpm db:push` completes without error
- `agencyClients.vehicleRegistryId` accepts null and a valid `vehicleRegistry.id`
- Combined population script runs without error on staging
- All Vitest tests pass

**Definition of Done:** Migration applied, population script executed on staging, reviewed by senior engineer.

---

### P1-E6 — TypeScript Error Cleanup

**Type:** Epic  
**Spec Ref:** §4.8 P1-6  
**Complexity:** M  
**Labels:** `backend` `blocker`  
**Blocks:** P3-E3-F2 (physics pipeline changes require clean TypeScript baseline)  
**Blocked By:** Nothing  
**Parallel With:** P1-E2, P1-E3, P1-E4, P1-E5  

---

#### P1-E6-F1 — Fix 47 pre-existing TypeScript errors in four files

**Type:** Feature  
**Complexity:** M  
**Labels:** `backend`  

**User Story:** As a developer, I need the TypeScript compiler to report zero errors in the four affected files, so that Phase 3 physics pipeline changes can be made safely without compounding existing type errors.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P1-E6-F1-T1 | Fix `server/voltron-query3.ts`: correct `fraudRiskScore` → `fraudScore` field reference and resolve `inArray` type error on `claims.status` | `backend` | S |
| P1-E6-F1-T2 | Fix `server/pipeline-v2/orchestrator.ts`: correct `fraudScore` field name reference | `backend` | XS |
| P1-E6-F1-T3 | Fix `server/pipeline-v2/stage-7-physics.ts`: correct `damagedComponents` field name mismatch | `backend` | S |
| P1-E6-F1-T4 | Fix `server/routers/workflow-queries.ts`: correct minor field reference errors | `backend` | XS |
| P1-E6-F1-T5 | Run `pnpm typecheck` and confirm zero errors in all four files | `testing` | XS |
| P1-E6-F1-T6 | Run the full Claims pipeline end-to-end on a test claim to confirm no runtime regressions from the field name corrections | `testing` | M |

**Subtasks for T1:**
- `grep -n "fraudRiskScore" server/voltron-query3.ts` to locate all occurrences
- Replace with `fraudScore` (the correct column name in `ai_assessments`)
- Locate the `inArray` call on `claims.status` and cast the status values to the correct enum type

**Acceptance Criteria:**
- `pnpm typecheck` reports zero errors in `voltron-query3.ts`, `orchestrator.ts`, `stage-7-physics.ts`, and `workflow-queries.ts`
- Claims pipeline end-to-end test passes without regression
- No new TypeScript errors introduced in any other file

**Definition of Done:** Zero TypeScript errors in the four files, regression test passing, reviewed by senior engineer.

---

### Phase 1 — Acceptance Gate

Before Phase 2 or Phase 3 begins, all of the following must be true:

- [ ] P1-E1-F1: `users.role` enum contains all four new values
- [ ] P1-E2-F1: `auditTrail.claimId` is nullable, `caseType` and `caseId` columns exist
- [ ] P1-E3-F1: `workflowStates.claimId` is nullable, `caseType` and `caseId` columns exist
- [ ] P1-E4-F1: `fleetVehicles.vehicleRegistryId` FK exists, population script executed
- [ ] P1-E5-F1: `agencyClients.vehicleRegistryId` FK exists, population script executed
- [ ] P1-E6-F1: Zero TypeScript errors in the four corrected files
- [ ] Claims pipeline end-to-end regression test passes
- [ ] Senior engineer sign-off on all migrations

---

## 6. Phase 2 — Agency Activation

**Phase Goal:** Activate the existing Agency module. Build pre-insurance photo verification. Expose the valuation engine in the Agency context. Build customer workspace and two new report templates.

**Phase Complexity:** L overall  
**Phase Labels:** `backend` `frontend` `db` `ai` `report` `rbac` `testing`  
**Blocks:** Nothing in Phase 3 or 4  
**Blocked By:** P1-E1-F1 (role enum must exist before guard can be updated)  
**Parallel With:** Phase 3 (after Phase 1 is complete)  

---

### P2-E1 — Agency Module Activation

**Type:** Epic  
**Spec Ref:** §5.3 P2-1 through P2-4  
**Complexity:** M  
**Labels:** `backend` `frontend` `rbac`  
**Blocks:** P2-E2 (cannot test Agency portal without assigned users)  
**Blocked By:** P1-E1-F1  

---

#### P2-E1-F1 — Update agencyProcedure guard to permit agency role

**Type:** Feature  
**Complexity:** S  
**Labels:** `backend` `rbac`  

**User Story:** As an agency broker, I need to be able to log in and access the Agency portal, so that I can submit quotation requests and manage client policies.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P2-E1-F1-T1 | Locate `agencyProcedure` middleware in `server/routers/agency-broker.ts` (marked R-INF-09) | `backend` | XS |
| P2-E1-F1-T2 | Add `'agency'` to the permitted roles array in the `agencyProcedure` guard | `backend` `rbac` | XS |
| P2-E1-F1-T3 | Write Vitest test: a user with `role = 'agency'` can call an `agencyProcedure`-guarded procedure without a FORBIDDEN error | `testing` | S |
| P2-E1-F1-T4 | Write Vitest test: a user with `role = 'user'` receives a FORBIDDEN error when calling an `agencyProcedure`-guarded procedure | `testing` | S |

**Acceptance Criteria:**
- A user with `role = 'agency'` can successfully call `agency.getQuotations`
- A user with `role = 'user'` receives `TRPCError: FORBIDDEN`
- All Vitest tests pass

**Definition of Done:** Guard updated, tests passing, reviewed.

---

#### P2-E1-F2 — Admin UI for agency role assignment

**Type:** Feature  
**Complexity:** M  
**Labels:** `frontend` `backend` `rbac`  

**User Story:** As a platform administrator, I need a UI to assign the `agency` role to existing users, so that agency brokers can be onboarded without direct database access.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P2-E1-F2-T1 | Add `admin.assignRole` tRPC procedure to `server/routers/admin.ts`: input `{ userId, role }`, guarded by `adminProcedure` | `backend` `rbac` | S |
| P2-E1-F2-T2 | Create `client/src/pages/AdminRoleAssignment.tsx`: searchable user list with role dropdown and assign button | `frontend` | M |
| P2-E1-F2-T3 | Register the route `/admin/roles` in `client/src/App.tsx` | `frontend` | XS |
| P2-E1-F2-T4 | Write Vitest test: `admin.assignRole` updates the user's role in the DB | `testing` | S |
| P2-E1-F2-T5 | Write Vitest test: `admin.assignRole` rejects a non-admin caller with FORBIDDEN | `testing` | S |

**Acceptance Criteria:**
- An admin user can assign `role = 'agency'` to a user via the UI
- The role change is persisted in the database
- Non-admin users cannot access `/admin/roles`
- All Vitest tests pass

**Definition of Done:** Procedure and page implemented, tests passing, reviewed.

---

#### P2-E1-F3 — Customer workspace layout and routing

**Type:** Feature  
**Complexity:** M  
**Labels:** `frontend`  

**User Story:** As a customer, I need a dedicated portal where I can view my quotation requests and claim statuses, so that I can track the progress of my insurance applications without contacting the agency.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P2-E1-F3-T1 | Create `client/src/pages/CustomerLayout.tsx`: dedicated layout for customer-facing pages (separate from `DashboardLayout`) | `frontend` | M |
| P2-E1-F3-T2 | Register the `/customer` route group in `client/src/App.tsx` with `CustomerLayout` as the wrapper | `frontend` | XS |
| P2-E1-F3-T3 | Ensure the customer workspace is only accessible to users with `role = 'customer'` | `frontend` `rbac` | S |

**Acceptance Criteria:**
- `/customer` renders `CustomerLayout` for users with `role = 'customer'`
- Users without `role = 'customer'` are redirected to the login page
- The customer layout does not display the insurer/assessor sidebar

**Definition of Done:** Layout implemented and route registered, reviewed.

---

#### P2-E1-F4 — Customer case tracking page

**Type:** Feature  
**Complexity:** M  
**Labels:** `frontend` `backend`  

**User Story:** As a customer, I need a single page showing the status of all my quotation requests, active policies, and claims, so that I can understand where each of my applications stands at any time.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P2-E1-F4-T1 | Add `customer.getCases` tRPC procedure: returns `{ quotations, policies, claims }` scoped to the authenticated user | `backend` | M |
| P2-E1-F4-T2 | Create `client/src/pages/CustomerCaseTracking.tsx`: tabbed view of quotations, policies, and claims with status badges | `frontend` | M |
| P2-E1-F4-T3 | Register the route `/customer/cases` in `client/src/App.tsx` | `frontend` | XS |
| P2-E1-F4-T4 | Write Vitest test: `customer.getCases` returns only records belonging to the authenticated user | `testing` | S |

**Acceptance Criteria:**
- The page displays all quotation requests, policies, and claims for the authenticated customer
- Records from other customers are not visible
- Status badges reflect the current state of each record
- All Vitest tests pass

**Definition of Done:** Procedure and page implemented, tenant isolation verified, tests passing, reviewed.

---

### P2-E2 — Pre-Insurance Photo Verification

**Type:** Epic  
**Spec Ref:** §5.3 P2-5 through P2-10  
**Complexity:** XL  
**Labels:** `backend` `ai` `db` `report`  
**Blocks:** P2-E2-F3 (Agency intake procedure depends on pHash query)  
**Blocked By:** P2-E1-F1 (Agency guard must be active before verification can be tested in context)  
**Parallel With:** P2-E1 (can be developed in parallel after Phase 1)  

---

#### P2-E2-F1 — Perceptual hashing (pHash) in photoForensicsEngine

**Type:** Feature  
**Complexity:** L  
**Labels:** `backend` `ai` `db`  

**User Story:** As a fraud investigator, I need each submitted vehicle photo to have a perceptual hash computed at ingestion, so that near-duplicate images submitted across different claims or applications can be detected automatically.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P2-E2-F1-T1 | Research and select a pHash library compatible with the Node.js server environment (e.g., `sharp` + custom DCT, or `phash-js`) | `backend` | S |
| P2-E2-F1-T2 | Install the selected pHash library as a project dependency | `infra` | XS |
| P2-E2-F1-T3 | Add `pHash` column to `ingestionDocuments`: `varchar(64)` nullable | `db` `migration` | XS |
| P2-E2-F1-T4 | Run `pnpm db:push` and confirm migration completes without error | `migration` | XS |
| P2-E2-F1-T5 | Integrate pHash computation into `photoForensicsEngine.ts`: compute hash from image URL and store in `PhotoForensicsResult.pHash` | `backend` `ai` | M |
| P2-E2-F1-T6 | Persist the computed pHash to `ingestionDocuments.pHash` after forensics analysis | `backend` `db` | S |
| P2-E2-F1-T7 | Write Vitest test: pHash is computed and stored for a test image | `testing` | S |
| P2-E2-F1-T8 | Write Vitest test: two near-identical images (same photo, different JPEG quality) produce pHash values with Hamming distance ≤ 10 | `testing` | M |

**Acceptance Criteria:**
- `ingestionDocuments.pHash` is populated for all new image submissions
- Two near-identical images produce pHash values with Hamming distance ≤ 10
- Two unrelated images produce pHash values with Hamming distance > 20
- All Vitest tests pass

**Definition of Done:** Library installed, pHash computed and stored, tests passing, reviewed.

---

#### P2-E2-F2 — Cross-submission pHash similarity query

**Type:** Feature  
**Complexity:** M  
**Labels:** `backend` `db`  

**User Story:** As a fraud investigator, I need to query whether a submitted photo has been used in a previous claim or application, so that recycled-photo fraud can be detected at the point of submission.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P2-E2-F2-T1 | Add `findSimilarImagesByPHash(pHash: string, threshold: number)` query function to `server/db.ts` | `backend` `db` | M |
| P2-E2-F2-T2 | The query must return all `ingestionDocuments` records where the Hamming distance between the stored `pHash` and the input `pHash` is ≤ `threshold` | `backend` | M |
| P2-E2-F2-T3 | Write Vitest test: `findSimilarImagesByPHash` returns the correct matching records for a known test dataset | `testing` | M |
| P2-E2-F2-T4 | Write Vitest test: `findSimilarImagesByPHash` returns an empty array when no similar images exist | `testing` | S |

**Acceptance Criteria:**
- `findSimilarImagesByPHash` returns all records within the specified Hamming distance threshold
- The query is scoped to the tenant (does not return records from other tenants)
- All Vitest tests pass

**Definition of Done:** Query function implemented, tests passing, reviewed.

---

#### P2-E2-F3 — EXIF-absent risk flag

**Type:** Feature  
**Complexity:** S  
**Labels:** `backend` `ai`  

**User Story:** As an underwriter, I need to be alerted when a submitted vehicle photo has no EXIF capture datetime, so that I can treat it as a higher-risk submission requiring additional scrutiny.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P2-E2-F3-T1 | Add `exifAbsent: boolean` field to `PhotoForensicsResult` type in `server/pipeline-v2/types.ts` | `backend` | XS |
| P2-E2-F3-T2 | Set `exifAbsent = true` in `photoForensicsEngine.ts` when EXIF `DateTimeOriginal` is absent | `backend` | S |
| P2-E2-F3-T3 | Write Vitest test: `exifAbsent = true` for an image with no EXIF datetime | `testing` | S |
| P2-E2-F3-T4 | Write Vitest test: `exifAbsent = false` for an image with a valid EXIF datetime | `testing` | S |

**Acceptance Criteria:**
- `exifAbsent = true` for images with no EXIF `DateTimeOriginal`
- `exifAbsent = false` for images with a valid EXIF `DateTimeOriginal`
- All Vitest tests pass

**Definition of Done:** Type extended, logic added, tests passing, reviewed.

---

#### P2-E2-F4 — AI-generated image detection

**Type:** Feature  
**Complexity:** L  
**Labels:** `backend` `ai`  

**User Story:** As a fraud investigator, I need to know whether a submitted vehicle photo was generated by AI rather than captured by a camera, so that synthetic-image fraud can be detected at the point of submission.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P2-E2-F4-T1 | Design the LLM vision prompt for AI-generation detection: the prompt must ask the model to assess whether the image shows characteristics of AI generation (unnatural reflections, impossible geometry, texture artefacts, missing shadows) | `ai` | M |
| P2-E2-F4-T2 | Add `aiGenerationScore: number` (0.0–1.0) and `aiGenerationFlag: boolean` fields to `PhotoForensicsResult` type | `backend` | XS |
| P2-E2-F4-T3 | Integrate the LLM vision call into `photoForensicsEngine.ts` using `invokeLLM` with the image URL as `image_url` content | `backend` `ai` | M |
| P2-E2-F4-T4 | Set `aiGenerationFlag = true` when `aiGenerationScore >= 0.7` | `backend` | XS |
| P2-E2-F4-T5 | Write Vitest test: `aiGenerationFlag = false` for a real photograph | `testing` `ai` | M |
| P2-E2-F4-T6 | Write Vitest test: `aiGenerationScore` is a number between 0.0 and 1.0 for any image input | `testing` | S |

**Acceptance Criteria:**
- `aiGenerationScore` is returned for every image processed by `photoForensicsEngine.ts`
- `aiGenerationFlag = true` when `aiGenerationScore >= 0.7`
- The LLM call does not block the forensics pipeline for more than 10 seconds
- All Vitest tests pass

**Definition of Done:** LLM prompt designed and integrated, type extended, tests passing, reviewed.

---

#### P2-E2-F5 — Vehicle Verification Report template

**Type:** Feature  
**Complexity:** L  
**Labels:** `backend` `report`  

**User Story:** As an underwriter, I need a printable Vehicle Verification Report that summarises the photo forensics results for a pre-insurance submission, so that I can make an informed underwriting decision and retain an auditable record.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P2-E2-F5-T1 | Create `server/reporting/vehicleVerificationReport.ts` using `kingaDesignSystem.ts` primitives exclusively | `backend` `report` | L |
| P2-E2-F5-T2 | Register the template in `server/reporting/reportDefinitions.ts` with key `agency.vehicle_verification` | `backend` | XS |
| P2-E2-F5-T3 | The report must include: vehicle identity, submission metadata, EXIF analysis, GPS analysis, manipulation score, pHash, cross-submission similarity results, AI-generation score, and a risk summary | `report` | M |
| P2-E2-F5-T4 | Write Vitest test: the report renders all sections without error for a test submission | `testing` | M |
| P2-E2-F5-T5 | Write Vitest test: the report is stored in S3 via `reportQueue.ts` | `testing` | S |

**Acceptance Criteria:**
- The report renders all required sections
- The report is stored in S3 and retrievable via the report queue
- The report uses only `kingaDesignSystem.ts` primitives (no inline styles, no external CSS)
- All Vitest tests pass

**Definition of Done:** Template implemented and registered, S3 storage confirmed, tests passing, reviewed.

---

#### P2-E2-F6 — Vehicle Valuation Report template

**Type:** Feature  
**Complexity:** M  
**Labels:** `backend` `report`  

**User Story:** As a customer, I need a printable Vehicle Valuation Report that shows the assessed market value of my vehicle, so that I can use it as supporting documentation for my insurance application.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P2-E2-F6-T1 | Create `server/reporting/vehicleValuationReport.ts` using `kingaDesignSystem.ts` primitives | `backend` `report` | M |
| P2-E2-F6-T2 | Register the template in `server/reporting/reportDefinitions.ts` with key `agency.vehicle_valuation` | `backend` | XS |
| P2-E2-F6-T3 | The report must include: vehicle identity, valuation date, market value (P25/P50/P75), benchmark source, condition assessment, and mileage | `report` | M |
| P2-E2-F6-T4 | Write Vitest test: the report renders all sections without error for a test valuation | `testing` | M |

**Acceptance Criteria:**
- The report renders all required sections
- The report is stored in S3 and retrievable via the report queue
- All Vitest tests pass

**Definition of Done:** Template implemented and registered, tests passing, reviewed.

---

### P2-E3 — Agency Valuation Procedure

**Type:** Epic  
**Spec Ref:** §5.3 P2-11  
**Complexity:** S  
**Labels:** `backend`  
**Blocks:** Nothing  
**Blocked By:** P2-E1-F1 (Agency guard), P2-E2-F6 (valuation report template)  
**Parallel With:** P2-E2  

---

#### P2-E3-F1 — Expose generateVehicleValuation() as an Agency tRPC procedure

**Type:** Feature  
**Complexity:** S  
**Labels:** `backend`  

**User Story:** As an agency broker, I need to request a vehicle valuation from within the Agency portal, so that I can provide customers with an accurate market value assessment before issuing a policy.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P2-E3-F1-T1 | Add `agency.getValuation` procedure to `server/routers/agency.ts`: input `{ make, model, year, condition, mileage, valuationDate? }`, calls `generateVehicleValuation()` from `valuation-engine.ts` | `backend` | S |
| P2-E3-F1-T2 | Add optional `valuationDate` parameter to `generateVehicleValuation()` to scope the market data query to a historical date | `backend` | M |
| P2-E3-F1-T3 | Write Vitest test: `agency.getValuation` returns a valid `VehicleValuationResult` for a test vehicle | `testing` | S |
| P2-E3-F1-T4 | Write Vitest test: `agency.getValuation` rejects a non-agency caller with FORBIDDEN | `testing` | S |

**Acceptance Criteria:**
- `agency.getValuation` returns a valid valuation result for a Toyota Corolla 2020 in good condition
- A non-agency user receives FORBIDDEN
- Historical valuation with `valuationDate` returns market data scoped to that date
- All Vitest tests pass

**Definition of Done:** Procedure implemented, tests passing, reviewed.

---

### Phase 2 — Acceptance Gate

Before Phase 2 is considered complete, all of the following must be true:

- [ ] P2-E1-F1: `agencyProcedure` guard permits `agency` role
- [ ] P2-E1-F2: Admin role assignment UI is functional
- [ ] P2-E1-F3: Customer workspace layout and routing are in place
- [ ] P2-E1-F4: Customer case tracking page is functional
- [ ] P2-E2-F1: pHash computed and stored for all new image submissions
- [ ] P2-E2-F2: Cross-submission pHash similarity query is functional
- [ ] P2-E2-F3: `exifAbsent` flag is returned by `photoForensicsEngine.ts`
- [ ] P2-E2-F4: `aiGenerationScore` and `aiGenerationFlag` are returned by `photoForensicsEngine.ts`
- [ ] P2-E2-F5: Vehicle Verification Report renders and stores in S3
- [ ] P2-E2-F6: Vehicle Valuation Report renders and stores in S3
- [ ] P2-E3-F1: `agency.getValuation` procedure is functional
- [ ] All Phase 2 Vitest tests pass

---

## 7. Phase 3 — Engineering Workspace

**Phase Goal:** Build the Engineering Workspace from scratch. Introduce three new database entities. Inject engineer measurements into the physics pipeline. Build the engineering router, frontend pages, inspection report, and notification system.

**Phase Complexity:** XL overall  
**Phase Labels:** `backend` `frontend` `db` `ai` `report` `rbac` `testing`  
**Blocks:** P4-E1-F1 (vehicle passport engineering data)  
**Blocked By:** P1-E1-F1 (engineer role), P1-E2-F1 (audit trail), P1-E3-F1 (workflow), P1-E6-F1 (TypeScript cleanup)  
**Parallel With:** Phase 2 (after Phase 1 is complete)  

---

### P3-E1 — Engineering Database Entities

**Type:** Epic  
**Spec Ref:** §6.8 P3-1, P3-2, P3-3, P3-9  
**Complexity:** L  
**Labels:** `db` `migration` `blocker`  
**Blocks:** P3-E3 (engineering router), P3-E4 (engineering pages)  
**Blocked By:** P1-E1-F1  

---

#### P3-E1-F1 — inspections table

**Type:** Feature  
**Complexity:** M  
**Labels:** `db` `migration`  

**User Story:** As a platform engineer, I need a generic, polymorphic inspection entity that is not coupled to the Claims module, so that engineering inspections can be created for any asset type (vehicle, machinery, property) in any context (standalone, fleet, agency, claims).

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P3-E1-F1-T1 | Add `inspections` table to `drizzle/schema.ts` with all columns per the specification (id, inspectionRef, caseType, caseId, assetType, assetId, status enum, assignedEngineerId, scheduledDate, completedDate, tenantId, createdBy, createdAt, updatedAt) | `db` `migration` | M |
| P3-E1-F1-T2 | Run `pnpm db:push` and confirm migration completes without error | `migration` | XS |
| P3-E1-F1-T3 | Write Vitest test: an `inspections` record can be created with `caseType = 'standalone'` and `caseId = null` | `testing` | S |
| P3-E1-F1-T4 | Write Vitest test: an `inspections` record can be created with `caseType = 'claim'` and a valid `caseId` | `testing` | S |
| P3-E1-F1-T5 | Write Vitest test: the `status` enum accepts all six permitted values | `testing` | S |

**Acceptance Criteria:**
- `inspections` table exists in the database
- Records can be created with `caseType = 'standalone'` and `caseId = null`
- Records can be created with `caseType = 'claim'` and a valid `caseId`
- All Vitest tests pass

**Definition of Done:** Migration applied, tests passing, reviewed by senior engineer.

---

#### P3-E1-F2 — physicalMeasurements table

**Type:** Feature  
**Complexity:** M  
**Labels:** `db` `migration`  

**User Story:** As an engineer, I need a dedicated table to store my field measurements (crush depth, gap measurements, deformation readings) with full instrument traceability, so that my measurements are court-admissible and can be injected into the physics pipeline.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P3-E1-F2-T1 | Add `physicalMeasurements` table to `drizzle/schema.ts` with all columns per the specification (id, inspectionId FK, measurementCategory, measurementLabel, valueRaw, unit, referencePoint, instrumentType, instrumentId, calibrationRef, confidence, engineerId FK, evidencePhotoUrl, tenantId, createdAt, updatedAt) | `db` `migration` | M |
| P3-E1-F2-T2 | Note: `measurementCategory` must be `varchar` (not an enum) to support future asset types without migration | `db` | XS |
| P3-E1-F2-T3 | Run `pnpm db:push` and confirm migration completes without error | `migration` | XS |
| P3-E1-F2-T4 | Write Vitest test: a `physicalMeasurements` record can be created with all required fields | `testing` | S |
| P3-E1-F2-T5 | Write Vitest test: `valueRaw` accepts decimal values to 4 decimal places | `testing` | XS |

**Acceptance Criteria:**
- `physicalMeasurements` table exists in the database
- Records can be created with all required fields
- `measurementCategory` accepts any string value
- All Vitest tests pass

**Definition of Done:** Migration applied, tests passing, reviewed by senior engineer.

---

#### P3-E1-F3 — engineerObservations table

**Type:** Feature  
**Complexity:** S  
**Labels:** `db` `migration`  

**User Story:** As an engineer, I need to record free-form observations with severity classifications and evidence photos during an inspection, so that qualitative findings are captured alongside quantitative measurements.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P3-E1-F3-T1 | Add `engineerObservations` table to `drizzle/schema.ts` with all columns per the specification (id, inspectionId FK, observationText, severity enum, evidencePhotoUrls JSON, engineerId FK, tenantId, createdAt, updatedAt) | `db` `migration` | S |
| P3-E1-F3-T2 | Run `pnpm db:push` and confirm migration completes without error | `migration` | XS |
| P3-E1-F3-T3 | Write Vitest test: an `engineerObservations` record can be created with `severity = 'critical'` and a JSON array of photo URLs | `testing` | S |

**Acceptance Criteria:**
- `engineerObservations` table exists in the database
- Records can be created with all severity levels
- `evidencePhotoUrls` accepts a JSON array of strings
- All Vitest tests pass

**Definition of Done:** Migration applied, tests passing, reviewed.

---

#### P3-E1-F4 — notifications table

**Type:** Feature  
**Complexity:** S  
**Labels:** `db` `migration`  

**User Story:** As an engineer, I need to receive in-app notifications when I am assigned to a new inspection, so that I am alerted without relying solely on email.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P3-E1-F4-T1 | Add `notifications` table to `drizzle/schema.ts` with all columns per the specification (id, recipientId FK, title, content, channel enum, isRead, relatedEntityType, relatedEntityId, tenantId, createdAt) | `db` `migration` | S |
| P3-E1-F4-T2 | Run `pnpm db:push` and confirm migration completes without error | `migration` | XS |
| P3-E1-F4-T3 | Write Vitest test: a `notifications` record can be created with `channel = 'both'` and `isRead = false` | `testing` | S |

**Acceptance Criteria:**
- `notifications` table exists in the database
- Records can be created with all channel types
- All Vitest tests pass

**Definition of Done:** Migration applied, tests passing, reviewed.

---

### P3-E2 — Physics Pipeline Injection

**Type:** Epic  
**Spec Ref:** §6.12 P3-4, P3-5  
**Complexity:** L  
**Labels:** `backend` `ai` `blocker`  
**Blocks:** P3-E3-F3 (`engineering.runPhysicsAnalysis` procedure)  
**Blocked By:** P1-E6-F1 (TypeScript cleanup), P3-E1-F2 (physicalMeasurements table)  

---

#### P3-E2-F1 — Extend Stage7Input to accept engineer measurements

**Type:** Feature  
**Complexity:** M  
**Labels:** `backend` `ai`  

**User Story:** As an engineer, I need my recorded crush depth measurements to be used directly by the physics pipeline instead of the AI-derived image estimate, so that the physics analysis reflects the most accurate available evidence.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P3-E2-F1-T1 | Add optional `engineerMeasurements` field to `Stage7Input` type in `server/pipeline-v2/types.ts`: array of `{ measurementCategory, valueRaw, unit, confidence, measurementId }` | `backend` | S |
| P3-E2-F1-T2 | In `stage-7-physics.ts`: when `engineerMeasurements` contains a `crush_depth` entry, use the engineer-provided value directly and bypass the image calibration step | `backend` `ai` | M |
| P3-E2-F1-T3 | Log the engineer measurement as a `ReconciliationSource.engineer_measurement` event in the reconciliation engine | `backend` | S |
| P3-E2-F1-T4 | Confirm that all existing callers of `stage-7-physics.ts` that do not pass `engineerMeasurements` continue to work without modification (the field is optional) | `testing` | M |
| P3-E2-F1-T5 | Write Vitest test: `stage-7-physics.ts` produces a different (higher-confidence) result when `engineerMeasurements` contains a `crush_depth` value compared to the image-only baseline | `testing` `ai` | M |
| P3-E2-F1-T6 | Write Vitest test: `stage-7-physics.ts` produces the same result as before when `engineerMeasurements` is not provided | `testing` | M |

**Acceptance Criteria:**
- `Stage7Input.engineerMeasurements` is optional and does not break any existing caller
- When `engineerMeasurements` contains `crush_depth`, the physics analysis uses that value directly
- The reconciliation engine logs `ReconciliationSource.engineer_measurement` for the engineer-provided measurement
- All Vitest tests pass

**Definition of Done:** Type extended, physics logic updated, reconciliation logging confirmed, regression tests passing, reviewed by senior engineer.

---

#### P3-E2-F2 — Add engineer_measurement to ReconciliationSource enum

**Type:** Feature  
**Complexity:** S  
**Labels:** `backend`  

**User Story:** As a claims investigator reviewing a physics analysis, I need the reconciliation log to identify which measurements came from an engineer's direct observation versus AI image analysis, so that I can assess the quality of the evidence.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P3-E2-F2-T1 | Search for all `switch` statements on `ReconciliationSource` in the codebase | `backend` | XS |
| P3-E2-F2-T2 | Add `"engineer_measurement"` to the `ReconciliationSource` enum in `reconciliation-engine.ts` | `backend` | XS |
| P3-E2-F2-T3 | Add `case "engineer_measurement":` to every switch statement identified in T1 | `backend` | S |
| P3-E2-F2-T4 | Write Vitest test: the reconciliation engine logs a `ReconciliationSource.engineer_measurement` event when an engineer measurement is used | `testing` | S |

**Acceptance Criteria:**
- `ReconciliationSource.engineer_measurement` is a valid enum value
- All switch statements on `ReconciliationSource` handle the new value
- Reconciliation log contains `engineer_measurement` source when engineer data is used
- All Vitest tests pass

**Definition of Done:** Enum extended, all switch statements updated, tests passing, reviewed.

---

### P3-E3 — Engineering Router and Procedures

**Type:** Epic  
**Spec Ref:** §6.7 P3-6  
**Complexity:** XL  
**Labels:** `backend` `rbac` `blocker`  
**Blocks:** P3-E4 (frontend pages call these procedures)  
**Blocked By:** P3-E1 (all four new tables), P3-E2 (physics injection)  

---

#### P3-E3-F1 — engineeringProcedure middleware

**Type:** Feature  
**Complexity:** S  
**Labels:** `backend` `rbac`  

**User Story:** As a platform engineer, I need a dedicated middleware guard for Engineering Workspace procedures that permits `engineer`, `engineering_manager`, `admin`, and `platform_super_admin` roles, so that engineering data is protected from unauthorised access.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P3-E3-F1-T1 | Create `engineeringProcedure` middleware in `server/routers/engineering.ts` using the established `use()` pattern | `backend` `rbac` | S |
| P3-E3-F1-T2 | Write Vitest test: `engineeringProcedure` permits `engineer`, `engineering_manager`, `admin`, `platform_super_admin` | `testing` | S |
| P3-E3-F1-T3 | Write Vitest test: `engineeringProcedure` rejects `insurer`, `assessor`, `customer`, `agency` with FORBIDDEN | `testing` | S |

**Acceptance Criteria:**
- All four permitted roles can call `engineeringProcedure`-guarded procedures
- All other roles receive FORBIDDEN
- All Vitest tests pass

**Definition of Done:** Middleware implemented, tests passing, reviewed.

---

#### P3-E3-F2 — Core engineering CRUD procedures

**Type:** Feature  
**Complexity:** L  
**Labels:** `backend`  

**User Story:** As an engineer, I need to create inspections, record measurements, and add observations through the API, so that my field work is captured in the system in real time.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P3-E3-F2-T1 | Implement `engineering.createInspection` procedure | `backend` | M |
| P3-E3-F2-T2 | Implement `engineering.getInspection` procedure (returns inspection with measurements and observations) | `backend` | M |
| P3-E3-F2-T3 | Implement `engineering.listInspections` procedure (filterable by status, assignedTo, dateRange) | `backend` | M |
| P3-E3-F2-T4 | Implement `engineering.addMeasurement` procedure | `backend` | M |
| P3-E3-F2-T5 | Implement `engineering.addObservation` procedure | `backend` | M |
| P3-E3-F2-T6 | Write integration tests for all five procedures | `testing` | L |

**Acceptance Criteria:**
- All five procedures are callable by users with `engineer` role
- `engineering.getInspection` returns the inspection with all associated measurements and observations
- `engineering.listInspections` filters correctly by status, assignedTo, and dateRange
- Tenant isolation is enforced: engineers can only see inspections belonging to their tenant
- All integration tests pass

**Definition of Done:** All procedures implemented, integration tests passing, reviewed.

---

#### P3-E3-F3 — Physics analysis and report generation procedures

**Type:** Feature  
**Complexity:** L  
**Labels:** `backend` `ai` `report`  

**User Story:** As an engineer, I need to trigger a physics analysis from my recorded measurements and generate a court-grade inspection report, so that my findings are formalised and ready for submission.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P3-E3-F3-T1 | Implement `engineering.runPhysicsAnalysis` procedure: reads `physicalMeasurements` for the inspection, constructs `Stage7Input` with `engineerMeasurements`, calls `stage-7-physics.ts` | `backend` `ai` | L |
| P3-E3-F3-T2 | Implement `engineering.generateReport` procedure: enqueues report generation via `reportQueue.ts` | `backend` `report` | M |
| P3-E3-F3-T3 | Implement `engineering.getReportStatus` procedure: returns report job status and download URL | `backend` | S |
| P3-E3-F3-T4 | Write integration test: `engineering.runPhysicsAnalysis` returns a physics result that uses the engineer's crush depth measurement | `testing` `ai` | M |
| P3-E3-F3-T5 | Write integration test: `engineering.generateReport` creates a report job and `engineering.getReportStatus` returns `completed` with an S3 URL | `testing` | M |

**Acceptance Criteria:**
- `engineering.runPhysicsAnalysis` returns a physics result with `physicsSourceAttribution` showing `engineer_measurement` for crush depth
- `engineering.generateReport` enqueues the report and returns a `reportJobId`
- `engineering.getReportStatus` returns `completed` and an S3 URL after the report is generated
- All integration tests pass

**Definition of Done:** All three procedures implemented, integration tests passing, reviewed.

---

#### P3-E3-F4 — Inspection workflow and audit trail integration

**Type:** Feature  
**Complexity:** M  
**Labels:** `backend`  

**User Story:** As a compliance officer, I need inspection status changes to be recorded in the audit trail, so that there is a complete, tamper-evident record of every inspection's lifecycle.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P3-E3-F4-T1 | Write an `auditTrail` record with `caseType = 'inspection'` and `caseId = inspectionId` on every inspection status change | `backend` | M |
| P3-E3-F4-T2 | Write a `workflowStates` record with `caseType = 'inspection'` and `caseId = inspectionId` on every inspection status change | `backend` | M |
| P3-E3-F4-T3 | Write Vitest test: completing an inspection writes an audit trail record with `caseType = 'inspection'` | `testing` | S |

**Acceptance Criteria:**
- Every inspection status change produces an `auditTrail` record with `caseType = 'inspection'`
- Every inspection status change produces a `workflowStates` record with `caseType = 'inspection'`
- All Vitest tests pass

**Definition of Done:** Audit and workflow integration implemented, tests passing, reviewed.

---

#### P3-E3-F5 — Engineer notification triggers

**Type:** Feature  
**Complexity:** M  
**Labels:** `backend`  

**User Story:** As an engineer, I need to receive an email and in-app notification when I am assigned to a new inspection, so that I can begin scheduling my field visit promptly.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P3-E3-F5-T1 | Create `notifyUser({ recipientId, title, content, channel, relatedEntityType, relatedEntityId })` wrapper in `server/safe-email.ts` | `backend` | M |
| P3-E3-F5-T2 | Call `notifyUser` in `engineering.createInspection` when `assignedEngineerId` is set | `backend` | S |
| P3-E3-F5-T3 | Persist the notification to the `notifications` table | `backend` `db` | S |
| P3-E3-F5-T4 | Write Vitest test: `notifyUser` sends an email to the correct recipient and creates a `notifications` record | `testing` | M |

**Acceptance Criteria:**
- An engineer receives an email notification when assigned to a new inspection
- A `notifications` record is created with `isRead = false`
- All Vitest tests pass

**Definition of Done:** `notifyUser` wrapper implemented, notification persistence confirmed, tests passing, reviewed.

---

### P3-E4 — Engineering Workspace Frontend

**Type:** Epic  
**Spec Ref:** §6.9 P3-7  
**Complexity:** XL  
**Labels:** `frontend`  
**Blocks:** Nothing  
**Blocked By:** P3-E3 (all engineering procedures must exist before pages can call them)  

---

#### P3-E4-F1 — Engineering Workspace pages (5 pages)

**Type:** Feature  
**Complexity:** XL  
**Labels:** `frontend`  

**User Story:** As an engineer, I need a dedicated workspace in the KINGA platform where I can manage my inspections, record measurements, view physics results, and download reports, all from a single, role-appropriate interface.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P3-E4-F1-T1 | Create `EngineeringDashboard.tsx` at `/engineering`: inspection queue, KPIs (inspections this month, pending, overdue), recent activity | `frontend` | M |
| P3-E4-F1-T2 | Create `EngineeringInspectionList.tsx` at `/engineering/inspections`: filterable list with status, asset type, and date filters | `frontend` | M |
| P3-E4-F1-T3 | Create `EngineeringInspectionDetail.tsx` at `/engineering/inspections/:id`: full inspection view with measurements table, observations list, photos, and physics results | `frontend` | L |
| P3-E4-F1-T4 | Create `EngineeringMeasurementEntry.tsx` at `/engineering/inspections/:id/measure`: guided measurement entry form with category selector, value/unit inputs, and evidence photo upload | `frontend` | L |
| P3-E4-F1-T5 | Create `EngineeringReportView.tsx` at `/engineering/inspections/:id/report`: report preview with download button | `frontend` | M |
| P3-E4-F1-T6 | Register all five routes in `client/src/App.tsx` | `frontend` | XS |
| P3-E4-F1-T7 | Add Engineering Workspace to the sidebar navigation in `DashboardLayout.tsx`, visible only to `engineer` and `engineering_manager` roles | `frontend` `rbac` | S |

**Subtasks for T4 (measurement entry form):**
- Measurement category selector: predefined list (`crush_depth`, `gap`, `deformation`, `electrical`, `structural`) with free-text fallback
- Value input: numeric with unit selector
- Reference point: text area
- Instrument type and calibration reference: optional text inputs
- Evidence photo upload: required, calls S3 upload via existing file upload procedure
- Submit button: calls `engineering.addMeasurement` mutation

**Acceptance Criteria:**
- All five pages render without error for a user with `engineer` role
- The Engineering Workspace sidebar entry is not visible to `insurer`, `assessor`, or `customer` users
- The measurement entry form requires an evidence photo before submission
- The inspection detail page displays all measurements, observations, and physics results
- The report view displays the report PDF and a download link

**Definition of Done:** All five pages implemented, RBAC verified, reviewed.

---

### P3-E5 — Engineering Inspection Report Template

**Type:** Epic  
**Spec Ref:** §6.13 P3-8  
**Complexity:** XL  
**Labels:** `backend` `report`  
**Blocks:** P3-E3-F3 (report generation procedure calls this template)  
**Blocked By:** P3-E1 (tables must exist for test data), P3-E2 (physics output must be available)  

---

#### P3-E5-F1 — Engineering Inspection Report (8 sections)

**Type:** Feature  
**Complexity:** XL  
**Labels:** `backend` `report`  

**User Story:** As an engineering manager, I need a court-grade Engineering Inspection Report that documents all measurements, observations, physics analysis, and forensic findings for an inspection, so that the report can be submitted as evidence in legal or regulatory proceedings.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P3-E5-F1-T1 | Create `server/reporting/engineeringInspectionReport.ts` using `kingaDesignSystem.ts` primitives exclusively | `backend` `report` | XL |
| P3-E5-F1-T2 | Implement §01 Inspection Summary section | `report` | S |
| P3-E5-F1-T3 | Implement §02 Physical Measurements section (table with values, units, reference points, instrument details) | `report` | M |
| P3-E5-F1-T4 | Implement §03 Engineer Observations section (severity-classified with evidence photos) | `report` | M |
| P3-E5-F1-T5 | Implement §04 Physics Analysis section (speed inference, energy analysis, crush depth comparison AI vs engineer) | `report` `ai` | L |
| P3-E5-F1-T6 | Implement §05 Forensic Image Analysis section | `report` | M |
| P3-E5-F1-T7 | Implement §06 Reconciliation section (source arbitration log) | `report` | M |
| P3-E5-F1-T8 | Implement §07 FEL Audit Trail section (court-grade version registry entries) | `report` | M |
| P3-E5-F1-T9 | Implement §08 Engineer Sign-Off section (digital signature block with report hash) | `report` | S |
| P3-E5-F1-T10 | Register the template in `server/reporting/reportDefinitions.ts` with key `engineering.inspection` | `backend` | XS |
| P3-E5-F1-T11 | Write Vitest test: the report renders all eight sections without error for a test inspection with measurements and observations | `testing` | L |
| P3-E5-F1-T12 | Write Vitest test: the report is stored in S3 via `reportQueue.ts` | `testing` | S |

**Acceptance Criteria:**
- The report renders all eight sections
- The report is stored in S3 and retrievable via `engineering.getReportStatus`
- The report uses only `kingaDesignSystem.ts` primitives
- §04 Physics Analysis correctly shows both AI-derived and engineer-measured crush depth values when both are available
- All Vitest tests pass

**Definition of Done:** Template implemented and registered, S3 storage confirmed, all sections verified, tests passing, reviewed.

---

### Phase 3 — Acceptance Gate

Before Phase 3 is considered complete, all of the following must be true:

- [ ] P3-E1-F1: `inspections` table exists and accepts polymorphic records
- [ ] P3-E1-F2: `physicalMeasurements` table exists
- [ ] P3-E1-F3: `engineerObservations` table exists
- [ ] P3-E1-F4: `notifications` table exists
- [ ] P3-E2-F1: `Stage7Input.engineerMeasurements` is optional and functional
- [ ] P3-E2-F2: `ReconciliationSource.engineer_measurement` is a valid enum value
- [ ] P3-E3-F1: `engineeringProcedure` middleware is in place
- [ ] P3-E3-F2: All five CRUD procedures are functional
- [ ] P3-E3-F3: Physics analysis and report generation procedures are functional
- [ ] P3-E3-F4: Audit trail and workflow integration is in place
- [ ] P3-E3-F5: Engineer notification triggers are functional
- [ ] P3-E4-F1: All five Engineering Workspace pages are functional
- [ ] P3-E5-F1: Engineering Inspection Report renders all eight sections
- [ ] Claims pipeline end-to-end regression test passes (Stage7Input change must not affect existing Claims)
- [ ] All Phase 3 Vitest tests pass

---

## 8. Phase 4 — Vehicle Passport & Cross-Module Intelligence

**Phase Goal:** Build the Vehicle Passport as a read-only cross-module aggregation view. Connect fleet incidents to the Claims pipeline. Build the cross-module analytics dashboard.

**Phase Complexity:** L overall  
**Phase Labels:** `backend` `frontend` `db` `report` `testing`  
**Blocks:** Nothing  
**Blocked By:** P1-E4-F1 (fleet vehicleRegistry linkage), P1-E5-F1 (agency vehicleRegistry linkage)  
**Parallel With:** Phase 2 and Phase 3 (after Phase 1 is complete, Phase 4 can begin in parallel)  

---

### P4-E1 — Vehicle Passport

**Type:** Epic  
**Spec Ref:** §7.3 P4-1, P4-2, P4-3  
**Complexity:** L  
**Labels:** `backend` `frontend` `report`  
**Blocks:** Nothing  
**Blocked By:** P1-E4-F1, P1-E5-F1  

---

#### P4-E1-F1 — Vehicle Passport aggregation query

**Type:** Feature  
**Complexity:** M  
**Labels:** `backend` `db`  

**User Story:** As a claims investigator, I need a single API call that returns a vehicle's complete history across Claims, Fleet, Agency, and Engineering, so that I can assess the vehicle's full risk profile without querying multiple systems.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P4-E1-F1-T1 | Add indexes on `vehicleDamageHistory.vehicleRegistryId`, `repairHistory.vehicleRegistrationNumber`, and `vehicleMarketValuations.vehicleRegistryId` before writing the aggregation query | `db` | S |
| P4-E1-F1-T2 | Add `getVehiclePassport(vin?: string, registrationNumber?: string)` query function to `server/db.ts` | `backend` `db` | L |
| P4-E1-F1-T3 | The query must aggregate: vehicle identity, risk profile, claims history, repair history, valuation history, fleet history (via `fleetVehicles.vehicleRegistryId`), agency history (via `agencyClients.vehicleRegistryId`), engineering inspections (via `inspections.assetType = 'vehicle'`), and fraud signals | `backend` | L |
| P4-E1-F1-T4 | The query must be scoped to the authenticated user's `tenantId` | `backend` | S |
| P4-E1-F1-T5 | Write Vitest test: `getVehiclePassport` returns a correctly aggregated result for a test vehicle with records in Claims, Fleet, and Agency | `testing` | L |
| P4-E1-F1-T6 | Write Vitest test: `getVehiclePassport` returns only records belonging to the authenticated tenant | `testing` | M |

**Acceptance Criteria:**
- `getVehiclePassport` returns a complete history for a vehicle with records in all four modules
- The query is scoped to the authenticated tenant
- All Vitest tests pass

**Definition of Done:** Indexes added, query implemented, tenant isolation verified, tests passing, reviewed.

---

#### P4-E1-F2 — Vehicle Passport tRPC procedure and page

**Type:** Feature  
**Complexity:** L  
**Labels:** `backend` `frontend`  

**User Story:** As a claims investigator, I need a dedicated Vehicle Passport page in KINGA that shows me a vehicle's complete cross-module history in a single, readable view, so that I can make informed decisions without switching between modules.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P4-E1-F2-T1 | Create `server/routers/vehicle.ts` with `vehicle.getPassport` procedure: calls `getVehiclePassport()`, guarded by `protectedProcedure` with role check for `insurer`, `admin`, `engineer`, `engineering_manager`, `platform_super_admin` | `backend` `rbac` | M |
| P4-E1-F2-T2 | Create `client/src/pages/VehiclePassport.tsx` at `/vehicles/:id/passport`: displays all nine sections per the specification | `frontend` | L |
| P4-E1-F2-T3 | Add "View Vehicle Passport" link to the Claims detail page | `frontend` | XS |
| P4-E1-F2-T4 | Add "View Vehicle Passport" link to the Fleet vehicle detail page | `frontend` | XS |
| P4-E1-F2-T5 | Add "View Vehicle Passport" link to the Engineering inspection detail page | `frontend` | XS |
| P4-E1-F2-T6 | Register the route `/vehicles/:id/passport` in `client/src/App.tsx` | `frontend` | XS |
| P4-E1-F2-T7 | Write integration test: the Vehicle Passport page renders without error for a vehicle with records in Claims, Fleet, and Agency | `testing` | M |

**Acceptance Criteria:**
- The Vehicle Passport page displays all nine sections
- The page is accessible from Claims, Fleet, and Engineering detail pages
- `customer` and `agency` roles cannot access the Vehicle Passport
- All integration tests pass

**Definition of Done:** Procedure and page implemented, access links added, RBAC verified, tests passing, reviewed.

---

#### P4-E1-F3 — Vehicle Passport Report template

**Type:** Feature  
**Complexity:** M  
**Labels:** `backend` `report`  

**User Story:** As a claims investigator, I need to generate a printable Vehicle Passport Report that documents a vehicle's complete cross-module history, so that I can include it in a claims file or submit it as evidence.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P4-E1-F3-T1 | Create `server/reporting/vehiclePassportReport.ts` using `kingaDesignSystem.ts` primitives | `backend` `report` | M |
| P4-E1-F3-T2 | Register the template in `server/reporting/reportDefinitions.ts` with key `vehicle.passport` | `backend` | XS |
| P4-E1-F3-T3 | Add `vehicle.generatePassportReport` procedure to `server/routers/vehicle.ts` | `backend` | S |
| P4-E1-F3-T4 | Write Vitest test: the report renders all sections and is stored in S3 | `testing` | M |

**Acceptance Criteria:**
- The report renders all sections of the Vehicle Passport
- The report is stored in S3 and retrievable
- All Vitest tests pass

**Definition of Done:** Template implemented and registered, S3 storage confirmed, tests passing, reviewed.

---

### P4-E2 — Fleet Incident → Claims Pipeline Connection

**Type:** Epic  
**Spec Ref:** §7.3 P4-4  
**Complexity:** M  
**Labels:** `backend` `db` `frontend`  
**Blocks:** Nothing  
**Blocked By:** P1-E3-F1 (workflow generalisation)  
**Parallel With:** P4-E1, P4-E3  

---

#### P4-E2-F1 — Add claimId FK to fleetIncidentReports and raise-claim procedure

**Type:** Feature  
**Complexity:** M  
**Labels:** `backend` `db`  

**User Story:** As a fleet manager, I need to escalate a fleet incident to a formal KINGA claim with a single action, so that the claims pipeline can be triggered without duplicating the incident data.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P4-E2-F1-T1 | Add `claimId` column to `fleetIncidentReports`: `int` nullable, FK to `claims.id` ON DELETE SET NULL | `db` `migration` | XS |
| P4-E2-F1-T2 | Run `pnpm db:push` and confirm migration completes without error | `migration` | XS |
| P4-E2-F1-T3 | Add `fleet.raiseClaimFromIncident` procedure: checks for existing `claimId` on the incident, creates a new `claims` record with `claimSource = 'fleet'`, copies relevant fields, updates `fleetIncidentReports.claimId`, triggers Claims intake pipeline | `backend` | L |
| P4-E2-F1-T4 | The procedure must be idempotent: if `claimId` already exists on the incident, return the existing claim without creating a duplicate | `backend` | S |
| P4-E2-F1-T5 | Add a "Raise Claim" button to the Fleet incident detail page that calls `fleet.raiseClaimFromIncident` | `frontend` | M |
| P4-E2-F1-T6 | Write integration test: `fleet.raiseClaimFromIncident` creates a valid claim and links it to the fleet incident | `testing` | M |
| P4-E2-F1-T7 | Write integration test: calling `fleet.raiseClaimFromIncident` twice for the same incident returns the existing claim without creating a duplicate | `testing` | S |

**Acceptance Criteria:**
- `fleet.raiseClaimFromIncident` creates a valid `claims` record with `claimSource = 'fleet'`
- `fleetIncidentReports.claimId` is updated to reference the new claim
- The procedure is idempotent
- All integration tests pass

**Definition of Done:** Migration applied, procedure implemented, UI button added, idempotency verified, tests passing, reviewed.

---

### P4-E3 — Cross-Module Analytics Dashboard

**Type:** Epic  
**Spec Ref:** §7.3 P4-5  
**Complexity:** L  
**Labels:** `backend` `frontend`  
**Blocks:** Nothing  
**Blocked By:** P1-E4-F1, P1-E5-F1 (vehicle linkage must exist for vehicle intelligence metrics)  
**Parallel With:** P4-E1, P4-E2  

---

#### P4-E3-F1 — Cross-module analytics query functions and procedure

**Type:** Feature  
**Complexity:** M  
**Labels:** `backend`  

**User Story:** As a platform administrator, I need a single API endpoint that returns aggregated metrics across Claims, Agency, Fleet, and Engineering for my tenant, so that I can monitor the health of all modules from a single dashboard.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P4-E3-F1-T1 | Add query functions for Claims metrics (total claims, average settlement, fraud rate, fast-track rate) to `server/services/analytics/` | `backend` | M |
| P4-E3-F1-T2 | Add query functions for Agency metrics (quote conversion rate, policy issuance rate, average premium) | `backend` | M |
| P4-E3-F1-T3 | Add query functions for Fleet metrics (active fleets, incident rate, maintenance compliance rate) | `backend` | M |
| P4-E3-F1-T4 | Add query functions for Engineering metrics (inspections completed, average turnaround, report approval rate) | `backend` | M |
| P4-E3-F1-T5 | Add `analytics.getCrossModuleSummary` procedure to `server/routers/analytics.ts`, guarded by `adminProcedure` | `backend` `rbac` | M |
| P4-E3-F1-T6 | Write Vitest test: `analytics.getCrossModuleSummary` returns non-null metrics for all four modules for a tenant with data in all modules | `testing` | M |
| P4-E3-F1-T7 | Write Vitest test: `analytics.getCrossModuleSummary` returns only data belonging to the authenticated tenant | `testing` | S |

**Acceptance Criteria:**
- `analytics.getCrossModuleSummary` returns metrics for all four modules
- All metrics are scoped to the authenticated tenant
- Non-admin users receive FORBIDDEN
- All Vitest tests pass

**Definition of Done:** Query functions and procedure implemented, tenant isolation verified, tests passing, reviewed.

---

#### P4-E3-F2 — Cross-module analytics dashboard page

**Type:** Feature  
**Complexity:** M  
**Labels:** `frontend`  

**User Story:** As a platform administrator, I need a visual dashboard that displays cross-module metrics in a single view, so that I can monitor platform health and identify anomalies at a glance.

**Technical Tasks:**

| ID | Task | Labels | Complexity |
|---|---|---|---|
| P4-E3-F2-T1 | Create `client/src/pages/CrossModuleAnalytics.tsx` at `/analytics` using `DashboardLayout` | `frontend` | L |
| P4-E3-F2-T2 | Implement the five dashboard panels per the specification (Claims, Agency, Fleet, Engineering, Vehicle Intelligence) | `frontend` | L |
| P4-E3-F2-T3 | Register the route `/analytics` in `client/src/App.tsx` | `frontend` | XS |
| P4-E3-F2-T4 | Add the Analytics dashboard to the sidebar navigation, visible only to `admin` and `platform_super_admin` roles | `frontend` `rbac` | S |

**Acceptance Criteria:**
- The dashboard displays non-null metrics for all five panels
- The dashboard is only accessible to `admin` and `platform_super_admin` roles
- All panels display loading states while data is fetching
- All panels display empty states when no data is available

**Definition of Done:** Page implemented, RBAC verified, loading and empty states implemented, reviewed.

---

### Phase 4 — Acceptance Gate

Before Phase 4 is considered complete, all of the following must be true:

- [ ] P4-E1-F1: `getVehiclePassport` returns complete cross-module history for a test vehicle
- [ ] P4-E1-F2: Vehicle Passport page renders all nine sections
- [ ] P4-E1-F3: Vehicle Passport Report renders and stores in S3
- [ ] P4-E2-F1: `fleet.raiseClaimFromIncident` creates a valid claim and is idempotent
- [ ] P4-E3-F1: `analytics.getCrossModuleSummary` returns metrics for all four modules
- [ ] P4-E3-F2: Cross-module analytics dashboard renders all five panels
- [ ] Tenant isolation verified for all new procedures
- [ ] All Phase 4 Vitest tests pass

---

## 9. Backlog Summary

### Item Count by Type

| Type | Count |
|---|---|
| Pre-conditions | 3 |
| Epics | 20 |
| Features | 35 |
| Technical Tasks | 147 |
| Total items | 205 |

### Item Count by Label

| Label | Items |
|---|---|
| `backend` | 98 |
| `testing` | 72 |
| `frontend` | 41 |
| `db` | 38 |
| `migration` | 28 |
| `report` | 22 |
| `rbac` | 18 |
| `ai` | 16 |
| `blocker` | 14 |
| `infra` | 2 |
| `pre-condition` | 3 |

### Complexity Distribution

| Size | Items | % |
|---|---|---|
| XS | 52 | 25% |
| S | 61 | 30% |
| M | 67 | 33% |
| L | 20 | 10% |
| XL | 5 | 2% |

### Parallel Work Map

The following work streams can proceed concurrently after Phase 1 is complete:

| Stream A | Stream B | Stream C |
|---|---|---|
| P2-E1 (Agency Activation) | P3-E1 (Engineering DB Entities) | P4-E1 (Vehicle Passport) |
| P2-E2 (Photo Verification) | P3-E2 (Physics Injection) | P4-E2 (Fleet→Claims) |
| P2-E3 (Agency Valuation) | P3-E3 (Engineering Router) | P4-E3 (Analytics Dashboard) |
| — | P3-E4 (Engineering UI) | — |
| — | P3-E5 (Inspection Report) | — |

Phase 1 tasks P1-E2 through P1-E6 can all be worked in parallel (they touch different files and tables).

---

## 10. Critical Path

The critical path through the backlog is:

```
PRE-1 (SARJAZZ fix)
  → PRE-2 (fraud gate)
    → PRE-3 (temperature fix)
      → P1-E1-F1 (role enum)
        → P1-E2-F1 (audit trail) ─────────────────────────────────────────────────────┐
        → P1-E3-F1 (workflow states) ──────────────────────────────────────────────────┤
        → P1-E4-F1 (fleet vehicleRegistry) ────────────────────────────────────────────┤
        → P1-E5-F1 (agency vehicleRegistry) ───────────────────────────────────────────┤
        → P1-E6-F1 (TypeScript cleanup) ──────────────────────────────────────────────┐│
          → P3-E1-F1 (inspections table) ──────────────────────────────────────────┐  ││
          → P3-E1-F2 (physicalMeasurements table) ──────────────────────────────────┤  ││
          → P3-E2-F1 (Stage7Input extension) ───────────────────────────────────────┤  ││
          → P3-E2-F2 (ReconciliationSource enum) ───────────────────────────────────┤  ││
            → P3-E3 (Engineering Router) ──────────────────────────────────────────┤  ││
              → P3-E4 (Engineering UI) ─────────────────────────────────────────────┤  ││
              → P3-E5 (Inspection Report) ──────────────────────────────────────────┘  ││
                                                                                        ││
          → P4-E1-F1 (Vehicle Passport query) ──────────────────────────────────────── ┘│
            → P4-E1-F2 (Vehicle Passport page) ─────────────────────────────────────────┘
            → P4-E1-F3 (Vehicle Passport report)
```

The longest path is: PRE-1 → PRE-2 → PRE-3 → P1-E1-F1 → P1-E6-F1 → P3-E2-F1 → P3-E3-F3 → P3-E5-F1 (Engineering Inspection Report). This is the sequence with the most dependencies and the highest individual complexity. It should be staffed first.

---

*End of KINGA Engineering Backlog v1.0*
