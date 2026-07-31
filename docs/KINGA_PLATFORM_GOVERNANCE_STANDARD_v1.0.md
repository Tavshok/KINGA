# KINGA Platform Governance Standard
## Version 1.0

**Document Reference:** KINGA-GOV-STD-v1.0  
**Status:** Ratified — Mandatory for all future development  
**Classification:** Internal — Engineering  
**Authority:** Platform Architecture Team  
**Effective Date:** 31 July 2026  
**Review Cycle:** Every Epic boundary (minimum annually)

---

## Preamble

This document is the **mandatory engineering governance standard** for the KINGA Intelligence Platform. It exists for one purpose: to prevent architectural drift.

Architectural drift occurs when individual features are built in isolation, without reference to the platform's established services, patterns, and principles. It manifests as duplicate engines, parallel workflow implementations, inconsistent fraud scoring, fragmented reporting, and eroding test coverage. Left unchecked, it makes the platform increasingly expensive to maintain, increasingly difficult to reason about, and increasingly dangerous to operate.

Every principle in this document was derived from a real architectural decision made during the platform's development. Each principle is grounded in the ADR Library, the Platform Service Registry, and the lessons of Epics 1 through 4. This document does not introduce new constraints — it codifies the constraints that already govern the platform's best work.

Compliance with this standard is not optional. Every engineer, architect, and contributor working on the KINGA platform is bound by these principles. Every Epic, feature, and hotfix must be evaluated against them before implementation begins.

---

## Table of Contents

1. [Governance Framework](#1-governance-framework)
2. [Mandatory Engineering Principles](#2-mandatory-engineering-principles)
   - P-01: Intelligence Belongs to the Platform
   - P-02: Modules Orchestrate Intelligence
   - P-03: Reuse Before Create
   - P-04: No Duplicate Engines
   - P-05: No Duplicate Workflows
   - P-06: No Duplicate Valuation Logic
   - P-07: No Duplicate Fraud Logic
   - P-08: Physics Engine Immutability
   - P-09: AI is Advisory
   - P-10: Every Inspection is Asset-Centric
   - P-11: Regression Tests are Non-Negotiable
   - P-12: Platform Assets are Shared
   - P-13: Evidence Must Preserve Provenance
   - P-14: Every New Table Requires Justification
   - P-15: Every Epic Requires an Architecture Review
   - P-16: Tenant Isolation is Absolute
   - P-17: Roles are Centralised
   - P-18: Reports are Rendered Once
   - P-19: Governance Violations are Logged
   - P-20: The Forensic Execution Ledger is Inviolable
3. [Architecture Review Process](#3-architecture-review-process)
4. [Enforcement Mechanisms](#4-enforcement-mechanisms)
5. [Violation Classification and Response](#5-violation-classification-and-response)
6. [Governance Checklist](#6-governance-checklist)
7. [Amendments and Exceptions](#7-amendments-and-exceptions)
8. [Ratification Record](#8-ratification-record)

---

## 1. Governance Framework

### 1.1 Scope

This standard applies to all code, configuration, database schema, and documentation produced for the KINGA platform, including but not limited to:

- All TypeScript source files in `server/`, `client/`, `shared/`, and `drizzle/`
- All database schema changes in `drizzle/schema.ts`
- All new tRPC router procedures in `server/routers/`
- All new report keys in `server/reporting/reportDefinitions.ts`
- All new UI pages and components in `client/src/`
- All documentation in `docs/`
- All test files in `server/*.test.ts` and `server/routers/*.test.ts`

### 1.2 Authority

The Platform Architecture Team holds authority over this standard. Any exception to a principle in this document requires written approval from the Platform Architecture Team and must be recorded in the Exceptions Register (Section 7).

### 1.3 Relationship to Other Documents

This standard is the **supreme governing document** for platform engineering decisions. In cases of conflict, the following precedence applies:

```
KINGA Platform Governance Standard v1.0  (this document — highest authority)
    ↓
KINGA Architecture Decision Record Library v1.0  (ADR-001 through ADR-014)
    ↓
KINGA Platform Service Registry v1.0  (29 registered services)
    ↓
KINGA Epic Technical Design Specifications  (per-Epic design documents)
    ↓
Individual feature implementation
```

### 1.4 Principle Classification

Each principle is classified by its enforcement severity:

| Classification | Symbol | Meaning |
|---|---|---|
| **ABSOLUTE** | 🔴 | No exceptions permitted under any circumstances |
| **MANDATORY** | 🟠 | Exceptions require Architecture Review Board approval |
| **REQUIRED** | 🟡 | Exceptions require written justification in the PR |
| **RECOMMENDED** | 🟢 | Best practice; deviation is noted but not blocked |

---

## 2. Mandatory Engineering Principles

---

### P-01: Intelligence Belongs to the Platform 🔴 ABSOLUTE

**Statement:** All intelligence produced by the KINGA platform — fraud scores, physics calculations, confidence scores, valuation figures, damage assessments, risk ratings, and AI pipeline outputs — is a **platform asset**. It belongs to the platform, not to the module that triggered its production.

**What this means in practice:**

Intelligence produced during claims processing is equally available to fleet intelligence, vehicle passports, portfolio analytics, and executive dashboards. No module may claim exclusive ownership of intelligence it triggered. No module may suppress, modify, or withhold intelligence from other authorised modules.

Intelligence is stored in canonical tables (`cross_claim_signals`, `vehicle_damage_history`, `claimConfidenceScores`, `fraudSignals`, `vehicleMarketValuations`, `repairHistory`) and is read by any module with appropriate authorisation. The pipeline that produced the intelligence does not gate access to it.

**Prohibited patterns:**

- Storing intelligence in module-private tables that other modules cannot read
- Duplicating intelligence into a second table to avoid cross-module queries
- Returning intelligence only to the triggering module and discarding it from the canonical store
- Embedding intelligence in opaque JSON blobs that cannot be queried by other modules

**Grounded in:** ADR-001 (Shared Intelligence Architecture), Service Registry NDL-01 through NDL-10.

---

### P-02: Modules Orchestrate Intelligence 🟠 MANDATORY

**Statement:** Platform modules (claims, fleet, inspections, agency) are **orchestrators**, not producers, of intelligence. A module's responsibility is to collect inputs, invoke the appropriate platform services, and present the results. A module must not contain its own intelligence logic.

**What this means in practice:**

A claims module procedure that needs to assess fraud calls `fraud-scoring.ts`. It does not implement its own fraud heuristics. A fleet module procedure that needs a vehicle valuation calls `vehicleValuation.ts`. It does not query market data directly. An inspection module procedure that needs physics validation calls `stage-7-physics.ts`. It does not implement its own physics rules.

The boundary between orchestration and intelligence is defined by the Platform Service Registry. If a capability is registered as a platform service, it must be consumed via that service — not reimplemented.

**Test:** Before implementing any intelligence logic in a module, search the Platform Service Registry. If the capability exists, use it. If it does not exist, propose a new registered service — do not embed the logic in the module.

**Grounded in:** ADR-001, ADR-002, ADR-014, Service Registry SR-01 through SR-29.

---

### P-03: Reuse Before Create 🟠 MANDATORY

**Statement:** No new service, engine, or utility may be created until it has been demonstrated that no existing service, engine, or utility can satisfy the requirement. The burden of proof lies with the engineer proposing the new capability.

**What this means in practice:**

Before writing a new TypeScript service file, the engineer must:

1. Search the Platform Service Registry for an existing service that covers the requirement.
2. Search the codebase for existing functions that partially cover the requirement.
3. Evaluate whether an existing service can be extended (via a new exported function) rather than a new service created.
4. If a new service is genuinely required, document the gap in the Architecture Review submission.

The Platform Service Registry is the authoritative inventory. If a service is not in the Registry, it either does not exist or has not been registered — in either case, the engineer must check both the Registry and the codebase before concluding that a new service is needed.

**Prohibited patterns:**

- Creating `server/my-feature-fraud-check.ts` when `server/fraud-scoring.ts` exists
- Creating `server/my-feature-valuation.ts` when `server/services/vehicleValuation.ts` exists
- Creating `server/my-feature-workflow.ts` when `server/workflow-engine.ts` exists
- Creating a new report renderer when `server/reporting/pdfRenderer.ts` exists

**Grounded in:** ADR-014 (Platform Service Reuse), Service Registry NDL-01 through NDL-10.

---

### P-04: No Duplicate Engines 🔴 ABSOLUTE

**Statement:** The following engines are **singular**. There is exactly one of each on the platform. No second implementation of any of these engines may be created, regardless of the justification.

| Engine | Canonical File | Registry ID |
|---|---|---|
| Workflow Engine | `server/workflow-engine.ts` | SR-01 |
| AI Pipeline Orchestrator | `server/pipeline-v2/orchestrator.ts` | SR-02 |
| Physics Engine | `server/pipeline-v2/stage-7-physics.ts` | SR-03 |
| Speed Inference Ensemble | `server/pipeline-v2/speedInferenceEnsemble.ts` | SR-04 |
| Cross-Stage Reconciliation | `server/pipeline-v2/reconciliation-engine.ts` | SR-05 |
| Image Intelligence | `server/pipeline-v2/semanticImageClassifier.ts` | SR-06 |
| Photo Forensics | `server/services/photoEnrichment.ts` | SR-07 |
| Fraud Intelligence Engine | `server/fraud-scoring.ts` | SR-08 |
| Cost Estimation Engine | `server/cost-optimization.ts` | SR-09 |
| Vehicle Valuation Service | `server/services/vehicleValuation.ts` | SR-11 |
| Cross-Claim Intelligence | `server/cross-claim-intelligence.ts` | SR-14 |
| Report Renderer | `server/reporting/pdfRenderer.ts` | SR-16 |

**What this means in practice:**

If a feature requires fraud scoring, it calls `fraud-scoring.ts`. If it requires physics validation, it calls `stage-7-physics.ts`. If it requires a PDF report, it calls `pdfRenderer.ts`. There are no exceptions.

If an existing engine does not support a required capability, the correct response is to **extend the existing engine** with a new exported function — not to create a parallel engine. Extension proposals require an Architecture Review.

**Detection:** Any new TypeScript file whose name contains the words `fraud`, `physics`, `workflow`, `valuation`, `orchestrat`, `reconcil`, `classifier`, `forensic`, or `renderer` will be flagged for Architecture Review before merge.

**Grounded in:** ADR-002, ADR-005, ADR-008, Service Registry NDL-01 through NDL-08.

---

### P-05: No Duplicate Workflows 🔴 ABSOLUTE

**Statement:** All claim state transitions on the KINGA platform must pass through `server/workflow-engine.ts`. No module may implement its own state machine, status update logic, or claim lifecycle management.

**What this means in practice:**

The Workflow Engine enforces segregation of duties, maintains a complete audit trail, validates every transition against the defined state machine, and records the triggering user and timestamp for every state change. Any code that updates a claim's `status` field by any means other than `workflow-engine.ts transition()` bypasses all of these controls.

This principle was established after the discovery during the Platform Readiness Remediation Sprint that `workflow.ts transitionWorkflowState()` was bypassing the governance checks in `workflow-engine.ts`. That function has been deprecated. The lesson is codified here as an absolute principle.

**Prohibited patterns:**

```typescript
// ❌ PROHIBITED — direct status update bypasses workflow governance
await db.update(claims).set({ status: 'approved' }).where(eq(claims.id, claimId));

// ❌ PROHIBITED — calling deprecated transitionWorkflowState
import { transitionWorkflowState } from '../workflow';
await transitionWorkflowState(claimId, 'approved', userId);

// ✅ REQUIRED — canonical workflow engine
import { WorkflowEngine } from '../workflow-engine';
const engine = new WorkflowEngine(claimId);
await engine.transition('approved', userId, 'Approved by claims manager');
```

**Grounded in:** ADR-002 (Platform Workflow Engine), Service Registry NDL-01.

---

### P-06: No Duplicate Valuation Logic 🟠 MANDATORY

**Statement:** All vehicle market valuations, replacement value calculations, and depreciation computations must use `server/services/vehicleValuation.ts`. No module may implement its own vehicle pricing logic.

**What this means in practice:**

Vehicle valuation is a regulated activity in most jurisdictions. Inconsistent valuations across modules expose the platform to legal and regulatory risk. A vehicle's market value must be the same whether it is viewed from the claims module, the vehicle passport, the fleet intelligence module, or the portfolio intelligence module. This consistency is only possible if all valuations originate from a single service.

The `vehicleValuation.ts` service reads from `vehicleMarketValuations` and applies the configured valuation method (market, replacement, depreciated). New valuation methods must be added to this service — not implemented in calling modules.

**Prohibited patterns:**

- Querying vehicle pricing data directly from external APIs in a module procedure
- Implementing a depreciation formula in a report generation function
- Hardcoding vehicle value estimates in test fixtures that are used in production logic

**Grounded in:** ADR-010 (Vehicle Valuation Reuse), Service Registry SR-11.

---

### P-07: No Duplicate Fraud Logic 🔴 ABSOLUTE

**Statement:** All fraud signal detection, fraud scoring, and fraud propensity calculation must use the registered fraud intelligence services: `server/fraud-scoring.ts`, `server/cross-claim-intelligence.ts`, and the pipeline's `server/pipeline-v2/stage-8-fraud.ts`. No module may implement its own fraud heuristics.

**What this means in practice:**

Fraud detection is the platform's most legally sensitive capability. Inconsistent fraud scores across modules create contradictory evidence that can be exploited in disputes and litigation. A fraud signal detected in the claims pipeline must be the same signal visible in the vehicle passport, the fleet intelligence module, and the portfolio intelligence module.

The Fraud Intelligence Engine (SR-08) is a three-layer architecture: the pipeline's `stage-8-fraud.ts` produces per-claim scores, `cross-claim-intelligence.ts` produces cross-claim signals, and `fraud-scoring.ts` aggregates them into a composite score. All three layers must be used in their defined sequence. No layer may be bypassed or replaced.

**Prohibited patterns:**

- Implementing keyword-based fraud detection in a module procedure
- Creating a `my-feature-fraud-check.ts` file with custom fraud heuristics
- Querying `cross_claim_signals` directly and applying custom scoring weights that differ from `SIGNAL_WEIGHTS` in `cross-claim-intelligence.ts`
- Returning a fraud score from a module procedure that was not produced by the registered fraud services

**Grounded in:** ADR-001, Service Registry SR-08, NDL-02.

---

### P-08: Physics Engine Immutability 🔴 ABSOLUTE

**Statement:** The Physics Engine (`server/pipeline-v2/stage-7-physics.ts`) and its numerical contract (`server/pipeline-v2/physicsNumericalContract.ts`) are **immutable**. No modification to the physics calculation logic, the numerical constants, or the validation thresholds is permitted without a full Architecture Review and explicit ratification by the Platform Architecture Team.

**What this means in practice:**

The Physics Engine produces legally defensible, mathematically grounded damage assessments. Its outputs are used in regulatory submissions, litigation support, and insurance settlements. Any change to its logic — however minor — changes every physics-validated assessment produced after that change, creating an inconsistency between historical and future assessments that cannot be reconciled.

Physics engine outputs are stored in the Forensic Execution Ledger (FEL) with a version hash. If the physics engine is modified, the FEL version changes, and all historical assessments are implicitly invalidated. This is not a recoverable situation.

The correct response to a physics engine limitation is to:
1. Document the limitation in the Physics Audit Findings document.
2. Propose an extension (a new physics scenario handler) via Architecture Review.
3. Implement the extension as an additive change — new scenario, new handler, new FEL version — without modifying existing handlers.

**Prohibited patterns:**

- Modifying any constant in `physicsNumericalContract.ts` without Architecture Review
- Adding a conditional branch to an existing physics scenario handler
- Overriding a physics engine output in a downstream module
- Bypassing physics validation for "edge cases" or "special scenarios"

**Grounded in:** ADR-005 (Physics Engine Immutability), Service Registry SR-03.

---

### P-09: AI is Advisory 🟠 MANDATORY

**Statement:** All AI-generated outputs on the KINGA platform — damage assessments, fraud scores, cost estimates, repair recommendations, and confidence scores — are **advisory**. They inform human decisions; they do not replace them. No AI output may be presented to a user or stored in a regulatory record without a human review pathway.

**What this means in practice:**

The platform's AI pipeline produces assessments with confidence scores. High-confidence assessments may be auto-approved within defined governance limits. However, the auto-approval pathway is itself a human-configured governance decision — it is not the AI making the decision autonomously. The `automationPolicies` table records the human-configured thresholds that govern auto-approval.

Every AI output must be:
1. Accompanied by a confidence score.
2. Accompanied by an explanation (via `claimsExplanationEngine.ts` or `decisionTransparencyLayer.ts`).
3. Traceable to the FEL version that produced it.
4. Overridable by an authorised human reviewer.

**Prohibited patterns:**

- Presenting an AI output without a confidence score
- Storing an AI output in a regulatory record without a FEL trace
- Implementing auto-approval logic that cannot be overridden by a human
- Removing the human review pathway for any claim category, regardless of confidence score

**Grounded in:** ADR-004 (AI Advisory Policy), Service Registry SR-20 (FEL Registry).

---

### P-10: Every Inspection is Asset-Centric 🟠 MANDATORY

**Statement:** Every inspection on the KINGA platform must be linked to a registered asset in `asset_registry`. An inspection without an asset reference is architecturally invalid.

**What this means in practice:**

The Asset-Centric Inspection architecture (ADR-012) was established in Epic 3 to ensure that inspection intelligence accumulates on the asset — not on the inspection event. An inspection is an event in an asset's lifecycle. The asset is the persistent entity; the inspection is a transient observation.

This principle has two practical consequences. First, every `inspections` record must have a non-null `assetRef` that corresponds to a record in `asset_registry`. Second, every inspection finding, document, and measurement must be queryable by `assetRef` — not only by `inspectionId`.

**Prohibited patterns:**

- Creating an inspection without first ensuring the asset exists in `asset_registry`
- Storing inspection findings in a table that has no `assetRef` or `assetId` column
- Building inspection reports that are not navigable from the Asset Passport
- Deleting an `asset_registry` record while linked inspections exist (cascade must be blocked)

**Grounded in:** ADR-012 (Asset-Centric Inspection Architecture), Service Registry SR-22.

---

### P-11: Regression Tests are Non-Negotiable 🔴 ABSOLUTE

**Statement:** The full test suite (`pnpm test`) must pass with zero new failures before any code is merged to the main branch. No exception is permitted. A failing test is a blocking issue.

**What this means in practice:**

The platform currently has 8,316 passing tests across 273 test files. This baseline must be maintained and grown. Every new feature must be accompanied by new tests. Every bug fix must be accompanied by a regression test that would have caught the bug. Every new service must have unit tests covering its core logic. Every new router must have integration tests covering its access control and error paths.

The test baseline is the platform's primary defence against regression. It is not a bureaucratic requirement — it is the mechanism by which the platform's correctness is continuously verified. Bypassing it is equivalent to removing that defence.

**Specific requirements:**

- New router procedures: minimum 3 test cases per procedure (happy path, access denied, invalid input)
- New service functions: minimum 80% line coverage
- New predictive models: minimum 90% line coverage (models must be deterministic and fully testable)
- New report generation functions: minimum 1 smoke test confirming HTML output is non-empty
- Bug fixes: minimum 1 regression test that fails before the fix and passes after

**Prohibited patterns:**

- Merging code with failing tests under any circumstances
- Adding `@ts-nocheck` to new files (existing `@ts-nocheck` files are a known technical debt item)
- Skipping tests with `it.skip` or `describe.skip` without a documented reason in the test file
- Excluding new source directories from the Vitest configuration without Architecture Review

**Grounded in:** Platform Readiness Remediation Sprint findings; all Epic Architecture Freeze Reports.

---

### P-12: Platform Assets are Shared 🟠 MANDATORY

**Statement:** The following platform assets are shared across all modules and all tenants (subject to authorisation): the Vehicle Registry, the Driver Registry, the Asset Registry, the Platform Roles constant, and the Report Renderer. No module may create a private copy of any of these assets.

**What this means in practice:**

A vehicle registered in `vehicle_registry` is the same vehicle regardless of which module queries it. A driver registered in `drivers` is the same driver regardless of which claim they appear in. A role defined in `shared/roles.ts` is the same role regardless of which router checks it. A report rendered by `pdfRenderer.ts` follows the same design system regardless of which report key generated it.

Shared assets have a single source of truth. Queries against shared assets must use the canonical table — not a module-local copy, a cached snapshot (except the explicitly designed passport snapshots), or a hardcoded list.

**The Platform Roles constant (`shared/roles.ts`) is particularly critical.** Role drift — where different parts of the codebase use different lists of valid roles — is a security vulnerability. Any code that defines a list of platform roles must import from `shared/roles.ts`. The `PLATFORM_ROLES` and `INSURER_ROLES` constants in `shared/roles.ts` are the only authoritative source.

**Prohibited patterns:**

- Defining a local `const ROLES = [...]` array in a router file
- Querying `vehicle_registry` via a raw SQL string instead of the Drizzle ORM binding
- Creating a `client/src/constants/roles.ts` file that duplicates `shared/roles.ts`
- Implementing a custom PDF layout in a report function instead of using `buildKingaHtml()`

**Grounded in:** ADR-003 (RBAC Strategy), Service Registry NDL-10, Fix 4 (Platform Readiness Remediation Sprint).

---

### P-13: Evidence Must Preserve Provenance 🟠 MANDATORY

**Statement:** Every piece of evidence on the KINGA platform — photographs, documents, measurements, witness statements, police reports, and AI-extracted data — must be stored with its full provenance: who uploaded it, when it was uploaded, from which claim or inspection it originated, and what processing it has undergone.

**What this means in practice:**

Provenance is the chain of custody for evidence. In insurance claims, evidence without provenance is inadmissible. The platform's evidence model (ADR-008) requires that every `claim_documents` record includes `uploadedBy`, `uploadedAt`, `documentType`, `sourceClaimId` (or `inspectionId`), and a `fileUrl` pointing to the immutable S3 object.

Evidence must never be modified after upload. If a document is superseded, a new record is created — the original is not deleted or overwritten. The S3 object key is immutable; the database record is immutable after creation (no `UPDATE` on evidence records except for metadata corrections with an audit log entry).

The `inspection_id` FK on `claim_documents` (added in the Platform Readiness Remediation Sprint) is the mechanism by which inspection evidence is linked to its originating inspection. This FK must be populated whenever a document is linked to an inspection.

**Prohibited patterns:**

- Uploading evidence without recording `uploadedBy` and `uploadedAt`
- Deleting or overwriting an evidence record (use supersession instead)
- Storing evidence file bytes in the database (use S3 via `storagePut()`)
- Creating evidence records without a `sourceClaimId` or `inspectionId` reference
- Modifying an evidence record's `fileUrl` after creation

**Grounded in:** ADR-008 (Evidence Model), Fix 5 (Platform Readiness Remediation Sprint).

---

### P-14: Every New Table Requires Justification 🟡 REQUIRED

**Statement:** No new database table may be added to `drizzle/schema.ts` without a written justification demonstrating that the data cannot be stored in an existing table, view, or JSON column. The justification must be included in the pull request description.

**What this means in practice:**

The KINGA schema currently has over 180 tables. Schema bloat is a real risk. Every new table adds to the cognitive load of understanding the data model, increases the risk of data inconsistency, and adds to the migration burden. Before adding a new table, the engineer must answer the following questions in the PR description:

1. **What data does this table store?** Describe the entity and its attributes.
2. **Why can this data not be stored in an existing table?** Name the tables considered and explain why they are insufficient.
3. **Why can this data not be stored in a JSON column in an existing table?** Explain the query requirements that necessitate a structured table.
4. **What is the expected row count at 12 months?** Provide a growth estimate.
5. **What indexes are required?** List all indexes and justify each one.
6. **What is the retention policy?** Specify when rows are deleted or archived.

The three aggregation tables introduced in Epic 4 (`vehicle_passport_snapshots`, `fleet_intelligence_snapshots`, `predictive_risk_scores`) are examples of justified new tables: they store computed objects that are expensive to recompute, they have clear expiry policies, and they cannot be served by existing tables or views.

**Grounded in:** Epic 4 TDS Section 6.1 (Minimal Schema Footprint Principle).

---

### P-15: Every Epic Requires an Architecture Review 🟠 MANDATORY

**Statement:** No Epic may begin implementation until an Architecture Review has been completed and approved by the Platform Architecture Team. The Architecture Review must produce a Technical Design Specification (TDS) that covers architecture, reuse matrix, database design, API design, UI design, report design, testing strategy, implementation sequence, regression risks, and acceptance criteria.

**What this means in practice:**

The Architecture Review is the primary mechanism for preventing architectural drift before it occurs. It is far less expensive to correct a design decision in a TDS than to refactor a deployed feature. The Architecture Review is not a bureaucratic gate — it is an investment in platform integrity.

The TDS format is defined by the Epic 4 TDS (KINGA-TDS-E4-v1.0) and must include all sections listed in that document. The Reuse Matrix is a mandatory section — it must demonstrate that every new capability either reuses an existing service or justifies a new registered service.

**Architecture Review Checklist:**

- [ ] TDS document produced and reviewed
- [ ] Reuse Matrix completed — all existing services considered
- [ ] No duplicate engines proposed
- [ ] No duplicate workflows proposed
- [ ] Database schema changes justified per P-14
- [ ] New services (if any) proposed for registration in the Platform Service Registry
- [ ] Regression risk assessment completed
- [ ] Acceptance criteria defined and measurable
- [ ] ADR entries proposed for any new architectural decisions

**Grounded in:** ADR-014 (Platform Service Reuse), all Epic Architecture Freeze Reports.

---

### P-16: Tenant Isolation is Absolute 🔴 ABSOLUTE

**Statement:** Data belonging to one insurer tenant must never be accessible to another insurer tenant. Every database query in a multi-tenant context must include a `tenantId` filter. No cross-tenant query may be executed without `platform_super_admin` authorisation.

**What this means in practice:**

The KINGA platform serves multiple insurer tenants. A data breach between tenants — where one insurer can see another insurer's claims, vehicles, or drivers — is a catastrophic failure with regulatory, legal, and reputational consequences.

Every tRPC procedure that queries tenant-scoped data must extract `tenantId` from `ctx.user` and apply it as a filter. The `tenantId` must never be accepted as a user-supplied input parameter for tenant-scoped queries — it must always come from the authenticated session context.

Cross-tenant queries (e.g., `executive.cross_insurer_fraud`, `executive.platform_dashboard`) are permitted only for the `platform_super_admin` role and must be explicitly designed as cross-tenant — not accidentally cross-tenant due to a missing filter.

**Prohibited patterns:**

```typescript
// ❌ PROHIBITED — tenantId from user input
const data = await db.select().from(claims).where(eq(claims.tenantId, input.tenantId));

// ✅ REQUIRED — tenantId from authenticated session
const data = await db.select().from(claims).where(eq(claims.tenantId, ctx.user.tenantId));
```

**Grounded in:** ADR-003 (RBAC Strategy), multi-tenant architecture design.

---

### P-17: Roles are Centralised 🔴 ABSOLUTE

**Statement:** The `PLATFORM_ROLES` and `INSURER_ROLES` constants in `shared/roles.ts` are the single source of truth for all role definitions on the platform. No other file may define, enumerate, or hardcode a list of platform roles.

**What this means in practice:**

Role drift — where different parts of the codebase use different lists of valid roles — is a security vulnerability. If a new role is added to `shared/roles.ts` but not to a local copy in another file, that file's access control logic will silently fail to recognise the new role.

This principle was established after the Platform Readiness Remediation Sprint discovered that `PlatformUserRoleManager.tsx` had 10 roles while `platform-user-roles.ts` had 14 roles — a 4-role discrepancy that would have caused the UI to silently omit fleet roles from the role assignment interface.

**Prohibited patterns:**

- `const ROLES = ['admin', 'assessor', ...]` in any file other than `shared/roles.ts`
- `type Role = 'admin' | 'assessor' | ...` in any file other than `shared/roles.ts`
- Importing role lists from any file other than `shared/roles.ts`

**Grounded in:** ADR-003, Fix 4 (Platform Readiness Remediation Sprint), Service Registry NDL-10.

---

### P-18: Reports are Rendered Once 🟠 MANDATORY

**Statement:** All PDF reports on the KINGA platform are rendered by `server/reporting/pdfRenderer.ts` using the KINGA Design System (`server/reporting/templates/kingaDesignSystem.ts`). No module may implement its own PDF generation, HTML report template, or report styling.

**What this means in practice:**

Report consistency is a brand and compliance requirement. Every report produced by the platform — whether a claims intelligence report, a vehicle passport report, or an engineering inspection report — must look like a KINGA report. This consistency is only achievable if all reports use the same renderer and design system.

New reports are added by:
1. Writing a new report generation function in the appropriate reporting file (e.g., `server/reporting/intelligenceReports.ts`)
2. Registering the new report key in `reportDefinitions.ts`
3. Adding the new key to the `REPORT_ACCESS` map
4. Adding the new key to the `KNOWN_REPORT_KEYS` list in `reporting.test.ts`

**Prohibited patterns:**

- Using `puppeteer`, `wkhtmltopdf`, or any other PDF library directly in a module procedure
- Creating a new HTML template file outside `server/reporting/templates/`
- Applying custom CSS that overrides the KINGA Design System colour palette or typography
- Generating reports client-side (all reports are server-side)

**Grounded in:** ADR-009 (Report Architecture), Service Registry SR-16.

---

### P-19: Governance Violations are Logged 🟠 MANDATORY

**Statement:** Every governance violation detected by the platform's automated governance systems must be logged to `governance_violation_log`. Governance violations must not be silently suppressed, caught without logging, or handled by returning a default value.

**What this means in practice:**

The platform's governance systems — the Truth Governance Registry, the Forensic Execution Ledger, the pipeline gate controllers, and the workflow engine — detect violations in real time. These violations are the platform's immune system. Suppressing them is equivalent to disabling the immune system.

A governance violation log entry must include: the violation type, the severity, the affected entity (claim ID, vehicle ID, etc.), the triggering procedure, the timestamp, and the user context. The entry must be created before any error response is returned — not after.

**Prohibited patterns:**

```typescript
// ❌ PROHIBITED — silent suppression
try {
  await validatePhysics(result);
} catch (e) {
  // ignore physics validation failures
  return result;
}

// ✅ REQUIRED — log before handling
try {
  await validatePhysics(result);
} catch (e) {
  await logGovernanceViolation({ type: 'physics_validation_failure', severity: 'high', ... });
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Physics validation failed' });
}
```

**Grounded in:** ADR-004 (AI Advisory Policy), Service Registry SR-19 (Truth Governance Registry).

---

### P-20: The Forensic Execution Ledger is Inviolable 🔴 ABSOLUTE

**Statement:** The Forensic Execution Ledger (FEL) records every AI pipeline execution with its inputs, outputs, model versions, and confidence scores. FEL records are immutable. No FEL record may be modified, deleted, or overwritten after creation. No pipeline execution may complete without a FEL entry.

**What this means in practice:**

The FEL is the platform's audit trail for AI decisions. It is the mechanism by which every AI output can be traced to the exact model version, input data, and execution context that produced it. Without the FEL, the platform cannot defend its AI decisions in regulatory submissions, litigation, or audits.

FEL records are written by `server/pipeline-v2/forensicExecutionLedger.ts`. Every pipeline stage that produces an AI output must write a FEL entry. The FEL entry must be written before the output is returned — not after. If the FEL write fails, the pipeline execution must fail — the output must not be returned without a FEL trace.

**Prohibited patterns:**

- Returning an AI output without writing a FEL entry
- Modifying a FEL record after creation (no `UPDATE` on FEL records)
- Deleting FEL records as part of a data cleanup operation
- Bypassing FEL writes for "fast path" or "cached" pipeline executions

**Grounded in:** ADR-004 (AI Advisory Policy), Service Registry SR-20 (FEL Registry), NDL-04.

---

## 3. Architecture Review Process

### 3.1 When an Architecture Review is Required

An Architecture Review is required before implementation begins for:

| Trigger | Review Type | Minimum Notice |
|---|---|---|
| New Epic | Full Epic Architecture Review | 5 business days |
| New platform service (SR-xx) | Service Registration Review | 3 business days |
| Modification to a registered engine | Engine Modification Review | 5 business days |
| New database table | Schema Review | 2 business days |
| New external dependency | Dependency Review | 2 business days |
| Exception to any ABSOLUTE principle | Exception Review | 5 business days |
| Exception to any MANDATORY principle | Exception Review | 3 business days |

### 3.2 Architecture Review Submission

An Architecture Review submission must include:

1. **Problem Statement** — What capability is being added or changed, and why?
2. **Reuse Analysis** — Which existing services were considered? Why are they insufficient?
3. **Proposed Design** — Architecture, data model, API design, UI design (if applicable).
4. **Reuse Matrix** — Which existing services does the proposed design consume?
5. **Regression Risk Assessment** — What existing functionality could be affected?
6. **Acceptance Criteria** — How will the implementation be verified as correct?
7. **ADR Proposals** — Are any new architectural decisions being made that require an ADR?

### 3.3 Architecture Review Outcomes

| Outcome | Meaning |
|---|---|
| **Approved** | Implementation may proceed as designed |
| **Approved with Conditions** | Implementation may proceed subject to specified conditions |
| **Revision Required** | Design must be revised and resubmitted |
| **Rejected** | Proposal is inconsistent with platform governance; alternative approach required |

### 3.4 Fast-Track Review

For urgent bug fixes and security patches, a Fast-Track Review may be requested. Fast-Track Reviews are completed within 24 hours. Fast-Track Reviews are only available for changes that do not introduce new services, new tables, or modifications to registered engines.

---

## 4. Enforcement Mechanisms

### 4.1 Pre-Merge Checks

The following checks are enforced before any code is merged to the main branch:

| Check | Mechanism | Blocks Merge? |
|---|---|---|
| All tests pass | `pnpm test` in CI | Yes |
| TypeScript errors do not increase | `npx tsc --noEmit` | Yes |
| No new `@ts-nocheck` annotations | Grep in CI | Yes |
| No files named with prohibited patterns | Filename check in CI | Requires review |
| `shared/roles.ts` is the only roles definition | Grep in CI | Yes |
| All new report keys are in `KNOWN_REPORT_KEYS` | Test assertion | Yes |

### 4.2 Architecture Review Gate

No pull request that introduces a new service file, a new database table, or a modification to a registered engine may be merged without an approved Architecture Review. The PR description must reference the Architecture Review approval.

### 4.3 Service Registry Maintenance

The Platform Service Registry must be updated whenever:
- A new service is created (new SR-xx entry)
- An existing service is extended with significant new capability (version update)
- A service is deprecated (status change to Deprecated)
- A service is superseded by another service (status change to Superseded, with reference)

The Registry is the living inventory of platform capabilities. An out-of-date Registry is a governance failure.

---

## 5. Violation Classification and Response

### 5.1 Violation Classes

| Class | Description | Examples | Response |
|---|---|---|---|
| **Class 1 — Critical** | Violation of an ABSOLUTE principle | Duplicate workflow engine, FEL bypass, cross-tenant data leak | Immediate rollback; Architecture Review required before re-implementation |
| **Class 2 — Major** | Violation of a MANDATORY principle | Duplicate fraud logic, missing provenance, unregistered service | PR blocked; design revision required |
| **Class 3 — Minor** | Violation of a REQUIRED principle | Missing table justification, test coverage below target | PR comment; justification required in PR description |
| **Class 4 — Advisory** | Deviation from a RECOMMENDED practice | Suboptimal query pattern, missing index | Code review comment; no blocking |

### 5.2 Discovered Violations in Existing Code

When a governance violation is discovered in existing code (i.e., code that was written before this standard was ratified), the following process applies:

1. The violation is documented in the **Technical Debt Register** (`docs/TECHNICAL_DEBT_REGISTER.md`).
2. A remediation task is created and prioritised in the next available sprint.
3. The violation is not treated as a blocking issue for unrelated work.
4. The violation must be remediated before the affected module is significantly extended.

The 7 pre-existing TypeScript errors in `pipeline-v2/` and the `@ts-nocheck` annotations in legacy files are examples of documented technical debt that must be remediated but do not block unrelated work.

---

## 6. Governance Checklist

This checklist must be completed for every pull request that introduces new functionality. It is reproduced here for reference and must be copied into the PR description.

```markdown
## KINGA Governance Checklist

### Principle Compliance
- [ ] P-01: No new intelligence logic embedded in a module (intelligence belongs to the platform)
- [ ] P-02: Module calls existing platform services rather than reimplementing intelligence
- [ ] P-03: Reuse analysis completed — no existing service covers this requirement
- [ ] P-04: No new engine created that duplicates a registered engine
- [ ] P-05: All claim state transitions use workflow-engine.ts
- [ ] P-06: All vehicle valuations use vehicleValuation.ts
- [ ] P-07: All fraud logic uses fraud-scoring.ts or cross-claim-intelligence.ts
- [ ] P-08: Physics engine not modified (or Architecture Review approved)
- [ ] P-09: All AI outputs include confidence score, explanation, and FEL trace
- [ ] P-10: All inspections linked to an asset_registry record
- [ ] P-11: pnpm test passes with zero new failures
- [ ] P-12: No local copies of Vehicle Registry, Driver Registry, or Platform Roles
- [ ] P-13: All evidence records include uploadedBy, uploadedAt, and source reference
- [ ] P-14: New tables justified in PR description (or no new tables)
- [ ] P-15: Architecture Review approved (or change is below Architecture Review threshold)
- [ ] P-16: All tenant-scoped queries filter by ctx.user.tenantId (not input.tenantId)
- [ ] P-17: All role references import from shared/roles.ts
- [ ] P-18: All PDF reports use pdfRenderer.ts and KINGA Design System
- [ ] P-19: All governance violations logged to governance_violation_log
- [ ] P-20: All AI pipeline executions produce a FEL entry

### Quality Gates
- [ ] New procedures: minimum 3 test cases each (happy path, access denied, invalid input)
- [ ] New services: minimum 80% line coverage
- [ ] New report keys: registered in reportDefinitions.ts and REPORT_ACCESS
- [ ] New report keys: added to KNOWN_REPORT_KEYS in reporting.test.ts
- [ ] New tables: schema change applied via pnpm db:push or webdev_execute_sql
- [ ] New routes: registered in client/src/App.tsx
- [ ] New routers: registered in server/routers.ts
- [ ] TypeScript error count: not increased above baseline

### Architecture Review
- [ ] Architecture Review required? (Yes / No)
- [ ] If Yes: Architecture Review reference: ___________
- [ ] If No: Justification for no review: ___________
```

---

## 7. Amendments and Exceptions

### 7.1 Amendment Process

This standard may be amended by the Platform Architecture Team following an Architecture Review. Amendments must be:

1. Proposed in writing with a justification referencing the specific principle being amended.
2. Reviewed by all platform architects.
3. Ratified by the Platform Architecture Team lead.
4. Recorded in the Amendment Log below.
5. Communicated to all engineering contributors.

Minor amendments (clarifications, examples, formatting) may be made without a full Architecture Review. Substantive amendments (changes to principle statements, reclassification of severity) require a full Architecture Review.

### 7.2 Exception Process

An exception to a MANDATORY or REQUIRED principle may be granted by the Platform Architecture Team following an Exception Review. Exceptions must be:

1. Requested in writing with a specific justification.
2. Time-limited (exceptions do not become permanent without an amendment).
3. Recorded in the Exceptions Register below.
4. Accompanied by a remediation plan that eliminates the need for the exception.

**No exception may be granted to an ABSOLUTE principle.** If an ABSOLUTE principle cannot be satisfied, the proposed change must be redesigned until it can be.

### 7.3 Amendment Log

| Version | Date | Principle | Change | Approved By |
|---|---|---|---|---|
| 1.0 | 31 Jul 2026 | All | Initial ratification | Platform Architecture Team |

### 7.4 Exceptions Register

| Exception ID | Date | Principle | Justification | Expiry | Remediation Plan |
|---|---|---|---|---|---|
| *No exceptions granted* | | | | | |

---

## 8. Ratification Record

This document was ratified on **31 July 2026** by the KINGA Platform Architecture Team.

The ratification of this document establishes it as the **mandatory engineering governance standard** for the KINGA Intelligence Platform, effective immediately and applicable to all future development.

All contributors to the KINGA platform are expected to have read and understood this standard. Ignorance of this standard is not a defence against a governance violation finding.

| Role | Name | Date |
|---|---|---|
| Platform Architecture Lead | Platform Architecture Team | 31 Jul 2026 |
| Engineering Lead | Platform Architecture Team | 31 Jul 2026 |
| Quality Assurance Lead | Platform Architecture Team | 31 Jul 2026 |

---

## Appendix A — Quick Reference Card

The following quick reference card summarises the 20 principles for daily use.

| # | Principle | Class | One-Line Rule |
|---|---|---|---|
| P-01 | Intelligence Belongs to the Platform | 🔴 | Store intelligence in canonical tables; never in module-private tables |
| P-02 | Modules Orchestrate Intelligence | 🟠 | Call platform services; never reimplement their logic |
| P-03 | Reuse Before Create | 🟠 | Check the Service Registry before writing a new service file |
| P-04 | No Duplicate Engines | 🔴 | One engine per capability; extend, never duplicate |
| P-05 | No Duplicate Workflows | 🔴 | All state transitions via `workflow-engine.ts transition()` |
| P-06 | No Duplicate Valuation Logic | 🟠 | All valuations via `vehicleValuation.ts` |
| P-07 | No Duplicate Fraud Logic | 🔴 | All fraud via `fraud-scoring.ts` and `cross-claim-intelligence.ts` |
| P-08 | Physics Engine Immutability | 🔴 | Never modify `stage-7-physics.ts` without Architecture Review |
| P-09 | AI is Advisory | 🟠 | Every AI output needs confidence score, explanation, FEL trace, and override pathway |
| P-10 | Every Inspection is Asset-Centric | 🟠 | Every inspection must link to `asset_registry` |
| P-11 | Regression Tests are Non-Negotiable | 🔴 | `pnpm test` must pass with zero new failures before merge |
| P-12 | Platform Assets are Shared | 🟠 | No private copies of Vehicle Registry, Driver Registry, or Platform Roles |
| P-13 | Evidence Must Preserve Provenance | 🟠 | Every evidence record needs `uploadedBy`, `uploadedAt`, and source reference |
| P-14 | Every New Table Requires Justification | 🟡 | Answer the 6 schema justification questions in the PR |
| P-15 | Every Epic Requires an Architecture Review | 🟠 | TDS required before implementation begins |
| P-16 | Tenant Isolation is Absolute | 🔴 | Always filter by `ctx.user.tenantId`; never `input.tenantId` |
| P-17 | Roles are Centralised | 🔴 | All roles from `shared/roles.ts`; no local role lists |
| P-18 | Reports are Rendered Once | 🟠 | All PDFs via `pdfRenderer.ts` and KINGA Design System |
| P-19 | Governance Violations are Logged | 🟠 | Log to `governance_violation_log` before handling |
| P-20 | The FEL is Inviolable | 🔴 | Every AI execution writes a FEL entry; FEL records are immutable |

---

## Appendix B — Prohibited File Name Patterns

The following file name patterns trigger an automatic Architecture Review requirement when introduced in a pull request:

| Pattern | Reason |
|---|---|
| `*fraud*.ts` (new files) | Potential duplicate fraud logic |
| `*physics*.ts` (new files) | Potential physics engine duplication |
| `*workflow*.ts` (new files) | Potential workflow engine duplication |
| `*valuation*.ts` (new files) | Potential valuation logic duplication |
| `*orchestrat*.ts` (new files) | Potential pipeline orchestrator duplication |
| `*reconcil*.ts` (new files) | Potential reconciliation engine duplication |
| `*classifier*.ts` (new files) | Potential image classifier duplication |
| `*forensic*.ts` (new files) | Potential forensics engine duplication |
| `*renderer*.ts` (new files) | Potential report renderer duplication |
| `*roles.ts` (outside `shared/`) | Potential role constant duplication |

---

*End of Document — KINGA Platform Governance Standard v1.0*  
*This document is mandatory. It is not a recommendation.*
