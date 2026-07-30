# KINGA Platform Capability & Architecture Audit
**Version 1.0 — July 2026**
**Classification: Internal — Engineering**

---

## Executive Summary

KINGA is a production-grade, AI-driven insurance, claims, forensic and engineering intelligence platform. This audit was commissioned to answer a single primary question: *what does KINGA already have that can be reused to implement the proposed Agency and Engineering Workspace capabilities with the minimum amount of new code and minimum architectural duplication?*

The answer, supported by direct inspection of every significant source file and database table, is that KINGA already contains the overwhelming majority of the intelligence, data, and workflow infrastructure required. The platform has accumulated a rich set of reusable engines — covering vehicle valuation, photo forensics, physics analysis, fraud detection, cost optimisation, document intelligence, and cross-stage reconciliation — all of which are currently invoked exclusively through the Claims pipeline. The primary engineering work required to support Agency and Engineering is not to build new intelligence but to generalise the orchestration layer so that these engines can be invoked from non-Claims contexts.

The audit identifies one genuinely new capability that does not exist in any form: a generic physical measurement model capable of supporting engineer-recorded measurements across asset types beyond vehicles. All other proposed capabilities either exist and can be reused directly, or exist in Claims-coupled form and require a bounded generalisation effort.

The audit also identifies that the Agency module is architecturally complete at the server and database level but has been intentionally held inactive pending a product decision (reference R-INF-09, dated 2026-07-09). Activating it requires a single database enum change, a role assignment procedure, and removal of a documented comment block. No new backend engineering is required for the core Agency portal.

This document provides the complete inventory, gap analysis, reuse matrix, dependency map, and recommended implementation sequence required for another engineering team to proceed safely without re-discovering the KINGA architecture.

---

## 1. Executive Summary

*(See above.)*

---

## 2. Existing Architecture

### 2.1 Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Tailwind CSS 4, shadcn/ui, Wouter (routing), tRPC client |
| Backend | Node.js, Express 4, tRPC 11 (procedure-based API) |
| ORM / DB | Drizzle ORM, MySQL/TiDB |
| Auth | Manus OAuth 2.0 (JWT session cookies), `protectedProcedure` / `adminProcedure` |
| AI / LLM | Manus built-in LLM proxy (`invokeLLM`), Whisper for transcription, internal image generation |
| File Storage | S3-compatible object storage (`storagePut` / `storageGet`) |
| Background Jobs | Heartbeat SDK (scheduled jobs), inline async pipeline execution |
| Testing | Vitest (unit + integration), custom e2e flow tests |
| CI/CD | GitHub Actions (`.github/workflows/`) |
| Infrastructure | Terraform (`infrastructure/terraform/`), Kafka deployment config, MLflow, monitoring stack |
| ML Models | 6 pre-trained gradient-boosted JSON model files per component (engine, boot_lid, roof, dashboard, left/right front door) |

### 2.2 Repository Structure

The repository is a monorepo with the following principal directories:

```
client/           React frontend (pages, components, hooks, contexts)
server/           Express backend
  _core/          Framework plumbing (auth, tRPC context, LLM, storage, maps)
  core/           Platform super-admin guard
  pipeline-v2/    All AI/intelligence engines (120+ files)
  pipeline/       Legacy pipeline (superseded by pipeline-v2)
  routers/        tRPC router files (70+ files)
  fleet/          Fleet-specific DB helpers and services
  insurance/      Insurance policy issuance, valuation engine, PDF generator
  reporting/      Report generators, templates, design system
  repair-intelligence/  Learning loop, repair cost intelligence
  services/       Cross-cutting services (analytics, confidence, fast-track, etc.)
  jobs/           Background job definitions
  workflow/       Workflow segregation validator
  ml/             ML confidence scoring, historical claims ingestion, truth synthesis
drizzle/          Schema (5,400+ lines), migrations
docs/             Architecture, audit, governance, ML, testing documentation
scripts/          DB validation, AI validation, gate scripts, tenant onboarding
tests/            E2E test suite
shared/           Shared types and constants
```

### 2.3 API Architecture

All client-server communication uses **tRPC 11** over HTTP POST at `/api/trpc`. There are no REST endpoints exposed to the frontend. The router tree is assembled in `server/routers.ts` (root) and delegates to ~70 sub-routers in `server/routers/`. Each sub-router exports a tRPC `router()` object.

Public procedures use `publicProcedure`. Authenticated procedures use `protectedProcedure`. Admin-only procedures use an inline `use()` middleware checking `ctx.user.role`. Platform super-admin procedures use `server/core/platform-super-admin-guard.ts`.

### 2.4 Multi-Tenancy

Multi-tenancy is implemented via a `tenantId` column (varchar 64) on every significant table. The `tenants` table stores tenant configuration including currency, country, KINGA sequence numbering, and status. Tenant isolation is enforced at the query layer — every procedure that reads or writes tenant-scoped data filters by `ctx.user.tenantId`. A dedicated `tenantIsolationViolations` table logs any detected cross-tenant data access. Automated tests in `server/tenant-isolation.test.ts` and `server/tenant-isolation-violation-logging.test.ts` verify isolation boundaries.

### 2.5 Authentication and Session Management

Authentication is handled by Manus OAuth 2.0. The flow completes at `/api/oauth/callback`, which sets a signed JWT session cookie. Each tRPC request reconstructs the user context from the cookie via `server/_core/context.ts`. The `users` table stores the Manus `openId`, role, `insurerRole`, `tenantId`, and `organizationId`. Email verification and account activation (`isActive`) are tracked separately.

---

## 3. Existing Modules

### 3.1 Agency Module

**Status: Architecturally complete, intentionally inactive.**

The Agency module is fully built at both the server and client levels but has been held inactive pending a product decision (R-INF-09, 2026-07-09).

**Server:** `server/routers/agency.ts` (quotation requests, insurance product browsing, policy management) and `server/routers/agency-broker.ts` (agency client management, multi-insurer quote requests, agency-sourced claims). Both routers are guarded by an `agencyProcedure` middleware that currently only permits `admin` and `platform_super_admin` roles because the `agency` role has not yet been added to the `users.role` enum.

**Client:** `client/src/pages/KingaAgency.tsx` (customer-facing portal) and `client/src/pages/AgencyFleetQuotes.tsx` (fleet RFQ management).

**Database:** `agencyClients`, `insurerQuoteRequests`, `quotationRequests`, `insurancePolicies`, `insuranceProducts`, `insuranceCarriers`, `policyEndorsements`, `policyClaimLinks`, `policyDocuments`.

**Activation requirement:** Add `'agency'` to the `users.role` enum in `drizzle/schema.ts`, push the migration, update the `agencyProcedure` guard, and build an admin UI to assign the role. No new backend procedures are required for the core portal.

**Known limitations:** The `agencyClients` table stores vehicle data as flat columns (make, model, year, VIN) rather than referencing `vehicleRegistry`. This creates a data duplication risk if the same vehicle appears in both Agency and Claims contexts.

### 3.2 Claims Module

**Status: Production. The platform's primary module.**

The Claims module is the most mature and feature-complete module in KINGA. It covers the full lifecycle from intake to settlement.

**Pages:** `SubmitClaim`, `InsurerClaimsTriage`, `InsurerClaimDetails`, `AssessorClaimDetails`, `ClaimsManagerDashboard`, `ClaimsProcessorDashboard`, `InsurerComparisonView`, `ClaimsManagerComparisonView`, `AssessmentResults`, `ReviewQueue`, `ClaimDecisionReport`, `InteractiveReport`.

**Backend routers:** `workflow.ts`, `workflow-queries.ts`, `document-ingestion.ts`, `ai-analysis.ts`, `ai-reanalysis.ts`, `approval.ts`, `claim-completion.ts`, `claim-replay.ts`, `decision.ts`, `intake-gate.ts`, `review-queue.ts`, `claims-manager.ts`, `reporting.ts`, `reports.ts`.

**Database entities:** `claims` (the central entity, ~200 columns), `aiAssessments`, `ingestionDocuments`, `ingestionBatches`, `claimDocuments`, `claimEvents`, `claimComments`, `claimConfidenceScores`, `claimRoutingDecisions`, `workflowStates`, `workflowAuditTrail`, `auditTrail`, `decisionSnapshots`, `claimDecisionLifecycle`, `finalApprovalRecords`, `adjusterSignOffs`, `claimApprovals`, `panelBeaterQuotes`, `quoteLineItems`, `quoteOptimisationResults`, `fraudAlerts`, `fraudIndicators`, `preAccidentDamage`.

**Pipeline:** 10 numbered stages (1–10) plus ~40 sub-engines, all orchestrated by `server/pipeline-v2/orchestrator.ts`. The pipeline is Claims-specific in its orchestration but the individual engines are largely self-contained.

**Claim status lifecycle:** `submitted → triage → assessment_pending → assessment_in_progress → quotes_pending → comparison → repair_assigned → repair_in_progress → repair_complete → settlement_pending → settled → completed | rejected | closed | on_hold | escalated | fast_tracked | fraud_investigation`.

### 3.3 Fleet Module

**Status: Production. Distinct from Agency.**

The Fleet module manages vehicle fleets, drivers, maintenance, incidents, and service requests. It is a separate product from Agency and must remain so.

**Pages:** `FleetManagement`, `FleetManagerDashboard`, `FleetRegister`, `InsurerFleetRFQs`, `AgencyFleetQuotes`.

**Backend:** `server/fleet/fleet-db.ts`, `server/fleet/maintenance-intelligence.ts`, `server/fleet/bulk-import-export.ts`, `server/fleet/service-marketplace.ts`. Routers: `fleet-accounts.ts`, `driver-registry.ts`, `marketplace.ts`, `market-quotes.ts`.

**Database entities:** `fleets`, `fleetVehicles`, `fleetDrivers`, `fleetIncidentReports`, `fleetRiskScores`, `fleetAuditLogs`, `fleetDocuments`, `fleetAccounts`, `fleetManagerRequests`, `maintenanceRecords`, `maintenanceSchedules`, `maintenanceAlerts`, `serviceRequests`, `serviceQuotes`, `serviceProviders`, `drivers`, `driverClaims`.

**Existing intelligence consumption:** Fleet vehicles have `riskScore`, `maintenanceScore`, `claimsHistoryCount`, `valuationDate`, and `valuationSource` fields. The `fleetVehicles` table does not reference `vehicleRegistry` — fleet vehicle identity is stored independently. `server/fleet/maintenance-intelligence.ts` provides predictive maintenance scoring but does not call the Claims pipeline engines.

**Known limitations:** Fleet vehicles are not linked to `vehicleRegistry`. Fleet incident reports (`fleetIncidentReports`) are not linked to `claims`. There is no shared damage history between Fleet and Claims for the same physical vehicle.

### 3.4 Forensics Module

**Status: Production. Embedded within Claims.**

Forensic intelligence is not a standalone module but a set of pipeline stages and report sections that run as part of the Claims assessment. The forensic outputs are surfaced in the `ClaimDecisionReport` and `InteractiveReport` pages.

**Key engines:** `photoForensicsEngine.ts` (EXIF, manipulation, GPS, image hash), `forensicDecisionReport.ts` (§01–§10 report sections), `felVersionRegistry.ts` (court-grade audit trail), `inputFidelityEngine.ts` (evidence completeness), `decisionOptimisationEngine.ts` (DOE), `reconciliation-engine.ts` (cross-stage conflict arbitration), `truthReconciliationEngine.ts` (TRE v4), `stage-7b-causal-reasoning.ts` (narrative causation).

**Coupling:** All forensic engines receive a `PipelineContext` or `ClaimRecord` as input. The `PipelineContext` type is defined in `pipeline-v2/types.ts` and contains Claims-specific fields (claimId, tenantId, etc.). This is the primary coupling point that must be addressed to reuse forensic engines in Engineering contexts.

### 3.5 Vehicle and Automotive Module

**Status: Production. Partially centralised.**

**Vehicle Registry:** `vehicleRegistry` table provides a centralised vehicle identity record with VIN, registration, make/model/year, damage zone counts, fraud flags, repeat-claimer flag, and a composite risk score. It is populated automatically after each AI assessment. The `vehicleDamageHistory` table stores per-incident damage records linked to both `vehicleRegistry` and `claims`.

**Vehicle Geometry:** `vehicleModels`, `vehicleGeometryMeasurements`, `vehicleLandmarks`, `geometrySources`, `visionCalibrationResults` tables support the Vehicle Geometry Engine (VGE) used in physics calibration.

**Driver Registry:** `drivers` table with normalised licence numbers, `driverClaims` join table. Matched by licence number or name+DOB.

**Third-Party Vehicles:** `thirdPartyVehicles` table stores vehicles involved in a claim but not owned by the claimant.

**Coupling:** `vehicleRegistry` is populated by the Claims pipeline. Fleet vehicles (`fleetVehicles`) are not linked to `vehicleRegistry`. Agency clients' vehicles (`agencyClients`) are not linked to `vehicleRegistry`.

### 3.6 Valuation Module

**Status: Production within Claims. Partially generalised.**

**Location:** `server/insurance/valuation-engine.ts` (standalone service), `vehicleMarketValuations` table, `vehicleConditionAssessment` table.

**Invocation:** Called from `server/insurance/policy-issuance.ts` and from the Claims pipeline (Stage 5 assembly). The `generateVehicleValuation()` function accepts a `VehicleValuationRequest` (make, model, year, condition, mileage) and returns an estimated value, confidence score, source label, adjustment factors, and comparable claims.

**Data sources:** The engine first checks `vehicleMarketValuations` for recent market data. If absent, it derives a valuation from historical claims data (average repair cost + total loss settlements for the same make/model/year). Condition and age adjustments are applied as percentage multipliers.

**Generalisation assessment:** The valuation engine is already partially decoupled from Claims. It does not receive a `claimId` as input. It can support pre-insurance valuation, customer-requested valuation, and fleet valuation with no code changes — only a new tRPC procedure to expose it outside the Claims workflow is needed. Historical claim valuation (valuation at a past date) requires a `valuationDate` parameter to be added and the market data query to be scoped to that date.

### 3.7 Cost Estimation Module

**Status: Production within Claims.**

The cost estimation module is described in detail in `docs/KINGA-Cost-Architecture.md`. It runs as Stage 9 of the Claims pipeline and produces L1 (weighted average), L2 (composite optimised), and `true_cost_usd` figures. It uses three benchmark tiers: ML models (6 components), statistical P25/P50/P75 (34 components), and legacy DB (broader coverage). The `quoteOptimisationEngine.ts` and `costDecisionEngine.ts` are the primary engines.

**Coupling:** Stage 9 is tightly coupled to the Claims pipeline context. The benchmark lookup functions in `server/db.ts` are generic and can be called independently.

### 3.8 Image Analysis Module

**Status: Production within Claims.**

**Capabilities:** EXIF extraction, GPS coordinate extraction, capture datetime extraction, image hash (MD5), manipulation score, AI vision description, damage zone classification, non-vehicle image detection, perceptual similarity (via `quoteSimilarityEngine.ts`), semantic classification (`semanticImageClassifier.ts`), photo enrichment (`server/services/photoEnrichment.ts`).

**What is NOT present:** Perceptual hashing (pHash/dHash), near-duplicate detection across claims, AI-generated image detection, screenshot detection, image editing detection. The `manipulation_indicators.manipulation_score` field exists in the raw analysis result but its derivation is not documented in the source.

**Coupling:** `photoForensicsEngine.ts` accepts an array of image URLs and a `claimId`. The `claimId` is used only for logging. The core analysis function is effectively stateless and can be called with any image URL.

### 3.9 Fraud Module

**Status: Production within Claims.**

**Engines:** `stage-8-fraud.ts` (LLM-based fraud scoring), `scenarioFraudEngine.ts` (scenario-specific patterns), `fraud-detection-enhanced.ts` (enhanced signals), `fraud-scoring.ts` (weighted consensus), `cross-claim-intelligence.ts` (cross-claim pattern detection).

**Database:** `fraudAlerts`, `fraudIndicators`, `fraudRules`, `crossClaimSignals`, `vehicleRegistry.hasSuspiciousDamagePattern`, `vehicleRegistry.isRepeatClaimer`.

**Coupling:** The fraud engines receive `PipelineContext` or `ClaimRecord`. The cross-claim intelligence engine queries `vehicleRegistry` and `vehicleDamageHistory` — these are vehicle-centric and not Claims-specific in their data model, making them the most reusable fraud signals.

### 3.10 Physics Module

**Status: Production within Claims.**

**Pipeline:** Stage 7 (`stage-7-physics.ts`) → Stage 7 Unified (`stage-7-unified.ts`) → Stage 7b Causal Reasoning (`stage-7b-causal-reasoning.ts`). Supporting engines: `speedInferenceEnsemble.ts`, `physicsNumericalContract.ts`, `physicsTruth.ts`, `damagePatternValidationEngine.ts`, `animalStrikePhysicsEngine.ts`, `stage-6-5a-vge.ts` (Vehicle Geometry Engine), `stage-6-5b-vgr.ts` (Vehicle Geometry Resolver), `stage-6-5c-slpe.ts` (Structural Load Path Engine).

**Physics chain:** Image → Calibration (VGE) → Geometry (VGR) → Crush depth → Deformation energy → Speed inference → Physics validation → Causal reasoning → Reconciliation.

**Measurement inputs:** Currently, all measurements are derived from images via computer vision. There is no pathway for an engineer to inject a physical measurement as an independent evidence source. The `vehicleGeometryMeasurements` table exists for storing reference geometry data but is not used as a real-time measurement input to the physics pipeline.

**Coupling:** Stage 7 receives `ClaimRecord` and `Stage6Output`. The physics computation itself (crush depth → energy → speed) is deterministic and does not depend on Claims-specific fields. The coupling is in the input type definitions, not in the physics mathematics.

---

## 4. Existing Intelligence Engines

The following table inventories every significant engine in `server/pipeline-v2/`. Engines marked **Reusable** can be called with minimal context changes. Engines marked **Claims-coupled** require the `PipelineContext` or `ClaimRecord` type to be generalised before they can be used outside Claims.

| Engine | File | Purpose | Sync/Async | Claims-coupled | Has Tests | Reusable |
|---|---|---|---|---|---|---|
| Photo Forensics | `photoForensicsEngine.ts` | EXIF, GPS, manipulation, hash, AI vision | Async | Weakly (claimId for logging only) | Partial | Yes |
| Input Fidelity Engine (IFE) | `inputFidelityEngine.ts` | Evidence completeness, gap classification | Sync | Yes (IFEInput references claim fields) | No | With generalisation |
| Decision Optimisation Engine (DOE) | `decisionOptimisationEngine.ts` | Quote/cost optimisation gating | Sync | Yes | No | With generalisation |
| FEL Version Registry | `felVersionRegistry.ts` | Court-grade audit trail, version tracking | Sync | No | No | Yes |
| Cross-Stage Reconciliation | `reconciliation-engine.ts` | Conflict arbitration between stages | Sync | Yes (ReconciliationSource enum) | No | With generalisation |
| Truth Reconciliation Engine (TRE v4) | `truthReconciliationEngine.ts` | Multi-source truth arbitration | Async | Yes | Yes | With generalisation |
| Vehicle Geometry Engine (VGE) | `stage-6-5a-vge.ts` | Reference geometry lookup | Sync | No | No | Yes |
| Vehicle Geometry Resolver (VGR) | `stage-6-5b-vgr.ts` | Calibration scale derivation | Async | Weakly | No | Yes |
| Structural Load Path Engine (SLPE) | `stage-6-5c-slpe.ts` | Structural damage path analysis | Sync | No | No | Yes |
| Speed Inference Ensemble | `speedInferenceEnsemble.ts` | Multi-model speed estimation | Sync | No | Yes | Yes |
| Physics Numerical Contract | `physicsNumericalContract.ts` | Physics output validation | Sync | No | No | Yes |
| Physics Truth | `physicsTruth.ts` | Physics consensus | Sync | No | No | Yes |
| Damage Pattern Validation | `damagePatternValidationEngine.ts` | Damage zone consistency | Sync | No | No | Yes |
| Scenario Fraud Engine | `scenarioFraudEngine.ts` | Scenario-specific fraud patterns | Sync | Yes | No | With generalisation |
| Quote Extraction Engine | `quoteExtractionEngine.ts` | LLM-based quote line item extraction | Async | No | No | Yes |
| Quote Optimisation Engine | `quoteOptimisationEngine.ts` | Composite quote optimisation | Sync | No | No | Yes |
| Quote Similarity Engine | `quoteSimilarityEngine.ts` | Quote-to-quote similarity | Sync | No | No | Yes |
| Quote-Photo Agreement Engine | `quotePhotoAgreementEngine.ts` | Quote vs photo damage agreement | Sync | Weakly | No | Yes |
| Repair-Replace Engine | `repairReplaceEngine.ts` | Repair vs replace probability | Sync | No | No | Yes |
| Severity Consensus Engine | `severityConsensusEngine.ts` | Multi-source severity consensus | Sync | No | No | Yes |
| Semantic Image Classifier | `semanticImageClassifier.ts` | Image type classification | Async | No | No | Yes |
| Weather Cross-Check Engine | `weatherCrossCheckEngine.ts` | Weather vs damage consistency | Async | Weakly | No | Yes |
| Accident Date Cross-Check | `accidentDateCrossCheckEngine.ts` | Date consistency validation | Sync | No | No | Yes |
| ML Benchmark Engine | `mlBenchmarkEngine.ts` | Component cost benchmarking | Sync | No | No | Yes |
| Cost Learning Recorder | `costLearningRecorder.ts` | Validated outcome persistence | Async | Yes | No | With generalisation |
| Validated Outcome Recorder | `validatedOutcomeRecorder.ts` | Assessment outcome recording | Async | Yes | No | With generalisation |
| Claim Quality Scorer | `claimQualityScorer.ts` | Composite claim quality score | Sync | Yes | No | With generalisation |
| Confidence Scoring Engine | `server/confidence-scoring-engine.ts` | Multi-dimension confidence | Sync | Yes | Yes | With generalisation |
| Pipeline Gate Controller | `pipelineGateController.ts` | Stage gate enforcement | Sync | Yes | No | With generalisation |
| Pipeline State Machine | `pipelineStateMachine.ts` | Pipeline state management | Sync | Yes | No | With generalisation |
| Trust Event Bus | `trustEventBus.ts` | TRE v4 event routing | Async | No | No | Yes |
| Trust Impact Engine | `trustImpactEngine.ts` | Trust score impact analysis | Sync | No | No | Yes |
| Trust Memory Engine | `trustMemoryEngine.ts` | Historical trust memory | Async | No | No | Yes |
| Output Realism Validator | `outputRealismValidator.ts` | Output sanity checking | Sync | No | No | Yes |
| Pre-Publication Validator | `prePublicationValidator.ts` | Pre-report validation | Sync | Yes | No | With generalisation |
| Assumption Classifier | `assumptionClassifier.ts` | Assumption classification | Sync | No | No | Yes |
| Source Truth Resolver | `sourceTruthResolver.ts` | Multi-source truth resolution | Sync | No | No | Yes |
| Stage Explainability | `stage-explainability.ts` | Stage output explanation | Sync | No | No | Yes |
| Stage Uncertainty | `stage-uncertainty.ts` | Uncertainty quantification | Sync | No | No | Yes |
| Stage Integrity | `stage-integrity.ts` | Stage output integrity | Sync | No | No | Yes |
| Animal Strike Physics | `animalStrikePhysicsEngine.ts` | Animal strike scenario physics | Sync | No | No | Yes |
| Regulatory Profiles | `regulatoryProfiles.ts` | Jurisdiction-specific rules | Sync | No | No | Yes |

---

## 5. Existing Data Models

### 5.1 Core Entity Summary

| Entity | Table(s) | Tenant-scoped | Notes |
|---|---|---|---|
| Claim | `claims` | Yes | Central entity, ~200 columns, all pipeline outputs stored as JSON columns |
| Vehicle (Claims) | `claims` (inline fields) | Yes | Duplicated from `vehicleRegistry` at claim creation |
| Vehicle (Registry) | `vehicleRegistry`, `vehicleDamageHistory` | Yes | Centralised identity, populated post-assessment |
| Vehicle (Fleet) | `fleetVehicles`, `fleets` | Yes | Independent of `vehicleRegistry` |
| Vehicle (Agency) | `agencyClients` (inline fields) | Yes | Independent of `vehicleRegistry` |
| User | `users` | Yes (tenantId) | Single table, role enum covers all personas |
| Organisation | `organizations` | No | Linked to users via `organizationId` |
| Tenant | `tenants` | N/A | Root isolation unit |
| Document | `ingestionDocuments`, `claimDocuments`, `agencyDocuments`, `fleetDocuments`, `customerDocuments`, `policyDocuments` | Yes | Fragmented by module |
| Image | Stored in S3, URLs in `claims.imageUrls` and `ingestionDocuments` | Yes | No central image entity |
| Valuation | `vehicleMarketValuations`, `vehicleConditionAssessment` | Yes | Partially centralised |
| Quote | `panelBeaterQuotes`, `quoteLineItems`, `supplierQuotes`, `supplierQuoteLineItems`, `insuranceQuotes`, `quotationRequests` | Yes | Multiple quote types, not unified |
| Measurement | `vehicleGeometryMeasurements` | No | Reference geometry only, not engineer-recorded |
| Inspection | No dedicated table | — | No generic inspection entity |
| Assignment | `claims.assignedAssessorId` (inline) | Yes | No generic assignment entity |
| Audit Trail | `auditTrail`, `workflowAuditTrail`, `automationAuditLog`, `insuranceAuditLogs`, `fleetAuditLogs`, `governanceAuditLog`, `isoAuditLogs` | Yes | Fragmented by module |
| Report | `generatedReports`, `reportSnapshots`, `pdfReports` | Yes | Partially centralised |

### 5.2 Data Model Duplication

The following duplications are confirmed by direct schema inspection:

**Vehicle identity** is represented independently in `claims` (inline fields), `vehicleRegistry`, `fleetVehicles`, `agencyClients`, `thirdPartyVehicles`, and `vehicleConditionAssessment`. The `vehicleRegistry` table is the most complete representation but is only populated from Claims assessments. Fleet and Agency vehicles are not linked to it.

**Document storage** is fragmented across six tables (`ingestionDocuments`, `claimDocuments`, `agencyDocuments`, `fleetDocuments`, `customerDocuments`, `policyDocuments`). Each has a similar structure (URL, type, status) but is scoped to its module with no shared parent entity.

**Audit trail** is fragmented across seven tables. The `auditTrail` table is the most generic but is `claimId`-foreign-keyed, making it Claims-specific. The `workflowAuditTrail` is also Claims-specific. Fleet, insurance, governance, and ISO audit logs are separate tables.

**Quote types** are fragmented: `panelBeaterQuotes` (repair quotes), `supplierQuotes` (marketplace), `insuranceQuotes` (policy quotes), `quotationRequests` (agency insurance requests). These represent different business concepts but share structural similarities.

---

## 6. Existing Workflows

### 6.1 Claims Workflow

The Claims workflow is driven by a status enum on the `claims` table and enforced by `server/claim-state-machine.ts`. State transitions are recorded in `workflowStates` and `workflowAuditTrail`. The workflow engine in `server/workflow-engine.ts` handles routing decisions, fast-track eligibility, and escalation. Automation policies (`automationPolicies` table) allow tenant-configurable automation of specific transitions.

### 6.2 Fleet Service Request Workflow

The `serviceRequests` table has its own status lifecycle: `open → quotes_received → quote_accepted → in_progress → completed | cancelled`. This is a separate workflow from Claims with its own approval mechanism.

### 6.3 Agency Quotation Workflow

The `quotationRequests` table has a status lifecycle: `pending → under_review → quoted → accepted | rejected | expired`. The `insurerQuoteRequests` table tracks multi-insurer quote distribution: `pending → sent → quoted → accepted | rejected | expired`.

### 6.4 Recovery Workflow

The `recoveryCases` table has a recovery-specific workflow. The recovery module (`RecoveryPortal`, `RecoveryCaseDetail` pages) is a standalone sub-module within Claims.

### 6.5 Workflow Generalisation Assessment

All existing workflows are module-specific. There is no generic `KINGA_CASE` abstraction. The `workflowStates` table is foreign-keyed to `claims.id`. The `workflowTemplates` table exists and stores configurable workflow templates, but it is also Claims-scoped. A generic case model would require either: (a) making `workflowStates.claimId` nullable and adding a polymorphic `caseType` + `caseId` pattern, or (b) introducing a new `cases` table that Claims, Engineering, and Agency reference. Option (a) is lower risk and requires a single migration.

---

## 7. Existing Agency Capability

The Agency module is the most complete "not yet activated" capability in the platform. The following is confirmed to exist:

**Server-side (fully built):**
- `agency.ts` router: quotation request creation, retrieval, status updates, document upload, premium calculation, policy management, vehicle verification
- `agency-broker.ts` router: agency client CRUD, multi-insurer quote request management, agency-sourced claim creation and tracking
- `server/insurance/policy-issuance.ts`: policy issuance workflow with valuation integration
- `server/insurance/policy-pdf-generator.ts`: policy document PDF generation
- `server/insurance/insurance-db.ts`: insurance DB query helpers

**Client-side (fully built):**
- `KingaAgency.tsx`: customer-facing portal with quote request form, policy browsing, vehicle verification
- `AgencyFleetQuotes.tsx`: fleet RFQ management

**Database (fully migrated):**
- `agencyClients`, `insurerQuoteRequests`, `quotationRequests`, `insurancePolicies`, `insuranceProducts`, `insuranceCarriers`, `policyEndorsements`, `policyClaimLinks`, `policyDocuments`

**What is missing:**
- `agency` role in `users.role` enum (intentionally absent, R-INF-09)
- Admin UI to assign the agency role
- Customer-facing workspace (separate from the insurer/assessor portal)
- Customer case tracking (quotation status, claim status visible to customer)
- Vehicle verification report (pre-insurance photo verification)

---

## 8. Existing Claims Capability

Claims is the most mature module. The full capability inventory is covered in Section 3.2. Key reusable capabilities within Claims that are not yet exposed to other modules:

- Full AI assessment pipeline (10 stages + 40 sub-engines)
- Forensic decision report (§01–§10 sections)
- Interactive report renderer
- Cross-claim intelligence (repeat vehicle, repeat claimant, network analysis)
- Claim quality scorer
- Decision transparency layer
- Claim replay (historical re-assessment)
- Exception intelligence hub

---

## 9. Existing Fleet Capability

Fleet is a production module with the following confirmed capabilities:

- Fleet vehicle registration and management
- Driver registration and assignment
- Incident reporting (`fleetIncidentReports`)
- Maintenance scheduling and tracking (`maintenanceSchedules`, `maintenanceRecords`, `maintenanceAlerts`)
- Predictive maintenance intelligence (`server/fleet/maintenance-intelligence.ts`)
- Service request and quote management (`serviceRequests`, `serviceQuotes`, `serviceProviders`)
- Fleet risk scoring (`fleetRiskScores`)
- Bulk import/export (`server/fleet/bulk-import-export.ts`)
- Service marketplace integration (`server/fleet/service-marketplace.ts`)
- Fleet RFQ management (multi-insurer quote requests for fleet insurance)

**Fleet Enhancement Backlog (identified gaps):**

| Gap | Severity | Recommended Solution |
|---|---|---|
| Fleet vehicles not linked to `vehicleRegistry` | High | Add `vehicleRegistryId` FK to `fleetVehicles`, populate on VIN match |
| Fleet incidents not linked to `claims` | Medium | Add `claimId` FK to `fleetIncidentReports` when a claim is raised |
| No AI damage assessment for fleet incidents | Medium | Expose Claims pipeline as a callable service for fleet incident assessment |
| No shared damage history between Fleet and Claims | High | Resolve via `vehicleRegistry` linkage |
| No fleet-level fraud detection | Medium | Expose cross-claim intelligence for fleet VINs |
| Maintenance intelligence not consuming KINGA physics outputs | Low | Add physics-derived severity to maintenance record creation |

---

## 10. Existing Engineering Capability

Engineering functionality in KINGA is currently embedded within the Claims and Forensics modules. There is no standalone Engineering Workspace. The following engineering-relevant capabilities exist:

**Roles:** `assessor_internal`, `assessor_external` (insurer sub-roles). No dedicated `engineer` or `inspector` role exists in the current enum.

**Inspection workflows:** Assessors perform vehicle inspections as part of the Claims workflow. The `AssessorClaimDetails` page provides the inspection interface. There is no standalone inspection workflow outside of Claims.

**Engineering reports:** The `forensicDecisionReport.ts` generates §01–§10 forensic analysis sections. The `claimsIntelligenceReport.ts` generates claims intelligence summaries. Both are Claims-scoped.

**Measurement functionality:** The `vehicleGeometryMeasurements` table stores reference geometry (factory dimensions). The `visionCalibrationResults` table stores AI-derived calibration measurements. There is no table for engineer-recorded physical measurements.

**Physics analysis:** Full physics pipeline exists (see Section 3.10). No pathway for engineer measurements to enter the physics pipeline as an independent evidence source.

**Annotations and observations:** `mismatchAnnotations` table stores AI-detected mismatches. No engineer observation or note entity exists independently of Claims.

**Digital signatures:** `adjusterSignOffs` table stores adjuster sign-offs on claims. No generic digital signature entity.

**Assignment workflows:** Assessors are assigned to claims via `claims.assignedAssessorId`. No generic assignment entity.

**QA/review:** `claimReviewQueue` and `humanReviewQueue` tables exist for Claims. No generic QA workflow.

**What is missing for KINGA Engineering Workspace:**
- `engineer` and `engineering_manager` roles
- Generic inspection/assignment entity (not Claims-specific)
- Physical measurement entity (generic, not vehicle-only)
- Engineer observation/note entity
- Engineering report template (distinct from forensic decision report)
- Guided evidence capture workflow
- Engineer-to-physics-pipeline measurement injection pathway


---

## 11. Existing Valuation Capability

The valuation engine (`server/insurance/valuation-engine.ts`) is the most generalised intelligence service in the platform. It accepts a `VehicleValuationRequest` (make, model, year, condition, mileage) with no claim dependency and returns a structured `VehicleValuationResult` with estimated value, confidence, source label, adjustment factors, and comparable claims.

**Generalisation assessment for each proposed context:**

| Context | Current Support | Required Change |
|---|---|---|
| Pre-insurance valuation | Supported — engine accepts make/model/year/condition | Expose via new tRPC procedure outside Claims workflow |
| Customer-requested valuation | Supported — same engine | New procedure + Agency portal UI |
| Fleet valuation | Supported — same engine | New procedure callable from Fleet module |
| Historical claim valuation | Partial — comparables are returned but no date-scoping | Add `valuationDate` parameter to scope market data query |

The `vehicleMarketValuations` table stores market valuations with `createdAt` timestamps, enabling historical queries. The `vehicleConditionAssessment` table stores condition assessments linked to claims. For pre-insurance use, condition assessment would need to be driven by photo analysis rather than claim context.

**Confidence and evidence:** The engine returns a confidence score (0–100) and a `source` label (`"Market Data"` or `"Claims Intelligence"`). Comparable claims are returned as evidence. There is no valuation evidence report template — this would need to be added for a customer-facing Valuation Report.

---

## 12. Existing Image and Forensic Capability

### 12.1 Confirmed Capabilities

| Capability | Implementation | Location |
|---|---|---|
| EXIF extraction | Yes — `exif_data` object in raw analysis | `photoForensicsEngine.ts` |
| GPS coordinates | Yes — `gps_coordinates` object | `photoForensicsEngine.ts` |
| Capture datetime | Yes — `capture_datetime` field | `photoForensicsEngine.ts` |
| Image hash (MD5) | Yes — `image_hash` field | `photoForensicsEngine.ts` |
| Manipulation score | Yes — `manipulation_indicators.manipulation_score` | `photoForensicsEngine.ts` |
| AI vision description | Yes — `ai_vision_description` field | `photoForensicsEngine.ts` |
| Non-vehicle detection | Yes — `is_non_vehicle` flag | `photoForensicsEngine.ts` |
| Suspicious image flag | Yes — `is_suspicious` flag | `photoForensicsEngine.ts` |
| GPS-based location validation | Yes — coordinates captured, used in fraud signals | `photoForensicsEngine.ts` |
| Semantic image classification | Yes — damage zone, view angle, photo type | `semanticImageClassifier.ts` |
| Photo enrichment (auto-trigger) | Yes — `photoEnrichmentAutoTrigger` service | `server/services/` |
| Quote-photo agreement | Yes — quoted parts vs photographed damage | `quotePhotoAgreementEngine.ts` |
| Image quality assessment | Partial — `is_suspicious` and `confidence` fields | `photoForensicsEngine.ts` |
| Capture session tracking | Partial — `photo-ingestion-log.ts` logs ingestion events | `photo-ingestion-log.ts` |
| Vehicle identity matching | Partial — registration plate in EXIF/AI description | `photoForensicsEngine.ts` |

### 12.2 Confirmed Gaps for Pre-Insurance Photo Verification

| Missing Capability | Severity | Recommended Solution |
|---|---|---|
| Perceptual hashing (pHash/dHash) | High | Add `sharp` + `imghash` library; store pHash in `ingestionDocuments` |
| Cross-claim near-duplicate detection | High | Query `ingestionDocuments` by pHash similarity at intake; flag matches |
| AI-generated image detection | High | Add LLM vision call with specific AI-generation detection prompt |
| Screenshot detection | Medium | Add LLM vision call or EXIF device model check |
| Image editing detection | Medium | Extend `manipulation_indicators` with editing artefact detection |
| Historical image comparison (baseline vs current) | High | Requires vehicle baseline concept (see Section 17) |
| Capture session verification | Medium | Require multi-photo session with GPS + timestamp consistency check |

### 12.3 Reusability for Pre-Insurance Verification

The `photoForensicsEngine.ts` function accepts an array of image URLs and returns a per-image analysis result. It does not require a `claimId` for its core analysis (the `claimId` is used only for logging). It can be called from an Agency pre-insurance verification workflow with no changes to the engine itself. The missing capabilities (pHash, near-duplicate detection, AI-generation detection) are additive extensions, not replacements.

---

## 13. Existing Physics Capability

The physics pipeline is detailed in Section 3.10. For the Engineering Workspace, the key question is whether an engineer's physical measurement can be introduced as an independent evidence source.

**Current physics input chain:**

```
Image URLs
  → photoForensicsEngine (EXIF, manipulation, AI vision)
  → semanticImageClassifier (damage zone, view angle)
  → stage-6-5a-vge (VGE: reference geometry lookup)
  → stage-6-5b-vgr (VGR: calibration scale derivation)
  → stage-6-5c-slpe (SLPE: structural load path)
  → stage-6-damage-analysis (damage zone + severity)
  → stage-7-physics (crush depth → energy → speed)
  → stage-7-unified (physics consensus)
  → stage-7b-causal-reasoning (narrative causation)
  → reconciliation-engine (cross-stage arbitration)
```

**Engineer measurement injection point:** The most natural injection point is between VGR and Stage 7. The VGR currently outputs a `scaleMmPerPixel` calibration factor derived from image analysis. An engineer's direct crush depth measurement (in mm) would bypass the image calibration step entirely and provide a higher-confidence input to the physics computation. The `reconciliation-engine.ts` already handles arbitration between sources with different confidence levels — it could arbitrate between AI-derived and engineer-derived crush depth using the same mechanism.

**Cross-Stage Reconciliation for AI vs Physical:** The `reconciliation-engine.ts` `ReconciliationSource` enum would need `"engineer_measurement"` added as a source type. The arbitration logic (higher confidence wins, with logging) already exists and would apply without modification.

**Conclusion:** The physics pipeline can accept engineer measurements as an additional evidence source with: (a) a new `engineerMeasurements` input field on `Stage7Input`, (b) a new `"engineer_measurement"` reconciliation source, and (c) a new `physicalMeasurements` DB table to persist the measurements. No physics mathematics need to change.

---

## 14. Reusability Assessment

### 14.1 Summary

Of the 35 proposed capabilities across Agency and Engineering, 28 can be satisfied by reusing or lightly extending existing KINGA capabilities. Only 7 require genuinely new work, and of those, only 2 require new infrastructure (physical measurement model, engineer role/workspace routing).

### 14.2 Detailed Reuse Assessment

| Proposed Capability | Existing KINGA Capability | Location | Reuse Level |
|---|---|---|---|
| Agency customer portal | `KingaAgency.tsx`, `agency.ts` router | `client/src/pages/`, `server/routers/` | REUSE DIRECTLY (activate role) |
| Agency broker portal | `AgencyFleetQuotes.tsx`, `agency-broker.ts` router | `client/src/pages/`, `server/routers/` | REUSE DIRECTLY (activate role) |
| Insurance quote request | `quotationRequests` table, `agency.ts` procedures | `drizzle/schema.ts`, `server/routers/agency.ts` | REUSE DIRECTLY |
| Multi-insurer quote distribution | `insurerQuoteRequests` table, `agency-broker.ts` | `drizzle/schema.ts`, `server/routers/agency-broker.ts` | REUSE DIRECTLY |
| Policy issuance | `server/insurance/policy-issuance.ts` | `server/insurance/` | REUSE DIRECTLY |
| Policy PDF generation | `server/insurance/policy-pdf-generator.ts` | `server/insurance/` | REUSE DIRECTLY |
| Vehicle valuation (pre-insurance) | `server/insurance/valuation-engine.ts` | `server/insurance/` | REUSE WITH EXTENSION (new tRPC procedure) |
| Vehicle valuation (customer) | `server/insurance/valuation-engine.ts` | `server/insurance/` | REUSE WITH EXTENSION (new tRPC procedure) |
| Fleet valuation | `server/insurance/valuation-engine.ts` | `server/insurance/` | REUSE WITH EXTENSION (new tRPC procedure) |
| Historical valuation | `server/insurance/valuation-engine.ts` | `server/insurance/` | REUSE WITH EXTENSION (add date parameter) |
| Valuation report | No template exists | — | NEW BUILD (report template only) |
| Photo verification (EXIF, GPS, hash) | `photoForensicsEngine.ts` | `server/pipeline-v2/` | REUSE DIRECTLY |
| Photo verification (manipulation) | `photoForensicsEngine.ts` | `server/pipeline-v2/` | REUSE DIRECTLY |
| Photo verification (AI vision) | `photoForensicsEngine.ts` | `server/pipeline-v2/` | REUSE DIRECTLY |
| Near-duplicate / pHash detection | Not present | — | NEW BUILD (additive extension to photo engine) |
| AI-generated image detection | Not present | — | NEW BUILD (additive extension to photo engine) |
| Vehicle baseline (condition at point in time) | `vehicleRegistry` + `vehicleDamageHistory` + `visionCalibrationResults` | `drizzle/schema.ts` | REUSE WITH EXTENSION (add baseline snapshot concept) |
| Vehicle Passport | `vehicleRegistry` (partial) | `drizzle/schema.ts` | GENERALIZE (link Fleet + Agency vehicles to registry) |
| Evidence model (photo, document) | `ingestionDocuments`, `claimDocuments` | `drizzle/schema.ts` | GENERALIZE (remove Claims FK, add polymorphic context) |
| Evidence model (measurement) | Not present | — | NEW BUILD (generic measurement entity) |
| Evidence model (engineer observation) | Not present | — | NEW BUILD (observation entity) |
| Engineer inspection workflow | Claims assessor workflow (partial) | `server/routers/workflow.ts` | GENERALIZE (decouple from Claims) |
| Physical measurements | `vehicleGeometryMeasurements` (reference only) | `drizzle/schema.ts` | NEW BUILD (engineer-recorded measurement table) |
| Measurement → physics injection | Not present | — | REUSE WITH EXTENSION (new reconciliation source) |
| Engineering report | `forensicDecisionReport.ts` (Claims-scoped) | `server/reporting/` | GENERALIZE (add engineering report template) |
| Forensic investigation | Full forensic pipeline | `server/pipeline-v2/` | GENERALIZE (decouple from ClaimRecord) |
| IFE as evidence gatekeeper | `inputFidelityEngine.ts` | `server/pipeline-v2/` | GENERALIZE (generalise IFEInput type) |
| Case/workflow model | `workflowStates` (Claims-scoped) | `drizzle/schema.ts` | GENERALIZE (polymorphic case type) |
| RBAC for new roles | `users.role` enum | `drizzle/schema.ts` | REUSE WITH EXTENSION (add engineer roles) |
| Audit trail | `auditTrail` (Claims-scoped) | `drizzle/schema.ts` | GENERALIZE (remove Claims FK requirement) |
| Customer case tracking | Not present | — | NEW BUILD (customer-facing status portal) |
| Fleet → KINGA intelligence | Fleet module exists, not connected | `server/fleet/` | REUSE WITH EXTENSION (add intelligence service calls) |
| Reporting infrastructure | `server/reporting/` | `server/reporting/` | REUSE WITH EXTENSION (new templates) |
| Document intelligence | `server/pipeline-v2/stage-2-extraction.ts` | `server/pipeline-v2/` | GENERALIZE (decouple from ClaimRecord) |

---

## 15. Agency Capability Gap Analysis

| Gap | Severity | Existing Partial Capability | Recommended Solution | Affected Modules |
|---|---|---|---|---|
| `agency` role not in users enum | CRITICAL | Role guard built, enum absent | Add enum value, push migration, update guard | Agency |
| No customer workspace (separate from insurer portal) | HIGH | `KingaAgency.tsx` exists but shares insurer portal routing | Create `/customer` route group with customer-specific layout | Agency |
| No customer case tracking | HIGH | None | New page: customer claim/quote status tracker | Agency, Claims |
| Vehicle data not linked to `vehicleRegistry` | HIGH | `agencyClients` stores vehicle inline | Add `vehicleRegistryId` FK, populate on VIN match | Agency, Vehicle |
| No pre-insurance photo verification | HIGH | `photoForensicsEngine.ts` exists | New Agency intake step calling photo engine + pHash check | Agency, Image |
| No vehicle verification report template | MEDIUM | Forensic report template exists | New report template for vehicle verification | Agency, Reporting |
| No AI-generated image detection | HIGH | Manipulation score exists | Extend photo engine with AI-generation detection prompt | Agency, Image |
| No near-duplicate photo detection | HIGH | Image hash exists (MD5) | Add pHash + cross-claim similarity query | Agency, Image |
| No valuation report template | MEDIUM | Valuation engine exists | New report template | Agency, Valuation |
| No customer notification system | MEDIUM | `notifyOwner` exists (owner-only) | Extend notification system for customer-facing alerts | Agency |

---

## 16. Engineering Workspace Gap Analysis

| Gap | Severity | Existing Partial Capability | Recommended Solution | Affected Modules |
|---|---|---|---|---|
| No `engineer` / `engineering_manager` role | CRITICAL | `assessor_internal` / `assessor_external` exist | Add roles to `users.role` enum | Engineering, RBAC |
| No generic inspection entity | HIGH | Claims assessor workflow | New `inspections` table with polymorphic `caseType` | Engineering |
| No physical measurement entity | HIGH | `vehicleGeometryMeasurements` (reference only) | New `physicalMeasurements` table (generic, multi-asset) | Engineering, Physics |
| No engineer observation/note entity | HIGH | `claimComments` exists (Claims-scoped) | New `engineerObservations` table or generalise `claimComments` | Engineering |
| No engineer-to-physics injection pathway | HIGH | Reconciliation engine supports new sources | Add `"engineer_measurement"` source to reconciliation engine | Engineering, Physics |
| No engineering report template | HIGH | Forensic decision report exists | New engineering inspection report template | Engineering, Reporting |
| No guided evidence capture workflow | MEDIUM | Photo ingestion exists | New mobile-friendly evidence capture workflow | Engineering |
| No digital signature entity | MEDIUM | `adjusterSignOffs` (Claims-scoped) | Generalise `adjusterSignOffs` or create generic `signatures` table | Engineering |
| No QA/review workflow for engineering | MEDIUM | `claimReviewQueue` exists | Generalise review queue for engineering context | Engineering |
| No assignment entity (generic) | MEDIUM | `claims.assignedAssessorId` inline | New `assignments` table with polymorphic target | Engineering |
| No sketch/annotation tool | LOW | `mismatchAnnotations` (AI-generated) | New engineer annotation capability on images | Engineering |

---

## 17. Photo Freshness and Provenance Gap Analysis

The pre-insurance vehicle photo verification use case requires establishing that submitted photographs are recent, genuine, and depict the specific vehicle being insured. The following analysis maps existing capabilities to this requirement.

**Existing capabilities that directly support freshness/provenance:**
- EXIF capture datetime extraction (confirms when photo was taken, if EXIF is present)
- GPS coordinate extraction (confirms where photo was taken)
- Image hash (MD5) for exact duplicate detection
- Manipulation score for basic editing detection
- AI vision description for vehicle identity confirmation

**Critical gaps:**
- Perceptual hashing (pHash) is absent. MD5 hashing detects exact duplicates only. A photograph that has been slightly cropped, resized, or re-compressed will have a different MD5 but an identical pHash. This is the primary mechanism by which old photographs are reused.
- No cross-claim pHash similarity query exists. Even if pHash were computed, there is no query to find near-duplicate images across different claims or Agency submissions.
- EXIF stripping is not detected. Many smartphones and social media platforms strip EXIF data before saving. A photo with no EXIF capture datetime cannot be dated by EXIF alone. The system does not flag EXIF-absent photos as higher risk.
- No AI-generated image detection. Generative AI can produce photorealistic vehicle images that pass visual inspection. No detection capability exists.
- No vehicle baseline concept. Without a stored baseline condition (photos taken at a known date), there is no reference against which to compare current photos for change detection.

**Minimum additions required:**
1. Add pHash computation to `photoForensicsEngine.ts` (additive, no breaking change).
2. Store pHash in `ingestionDocuments` (new column, non-breaking migration).
3. Add a cross-submission pHash similarity query at Agency intake.
4. Add an EXIF-absent risk flag to the photo forensics output.
5. Add an AI-generation detection LLM call to the photo forensics engine.

---

## 18. Vehicle Passport Assessment

A KINGA Vehicle Passport is a centralised, persistent record of a vehicle's identity, condition history, claim history, repair history, and fraud signals. The `vehicleRegistry` table is the closest existing concept.

**What `vehicleRegistry` already provides:**
- VIN, registration, make/model/year, colour, engine number
- `totalClaimsCount`, `totalRepairCostCents`, `lastClaimDate`, `claimIdsJson`
- `damageZoneCountsJson` (per-zone claim frequency)
- `hasSuspiciousDamagePattern`, `isRepeatClaimer`, `isSalvageTitle`, `isStolen`, `isWrittenOff`
- `vehicleRiskScore` (composite 0–100)
- `vehicleMassKg`, `vehicleMassSource`

**What is missing for a full Vehicle Passport:**
- Links to `fleetVehicles` (fleet vehicles not connected to registry)
- Links to `agencyClients` vehicle data (Agency vehicles not connected to registry)
- Links to `vehicleConditionAssessment` (condition assessments are Claims-scoped)
- Inspection history (no generic inspection entity)
- Engineering assessment history
- Image gallery (no central image entity per vehicle)
- Valuation history (market valuations exist but not linked to vehicle passport view)
- Repair history (`repairHistory` table exists with `vehicleRegistrationNumber` — partially linked)

**Feasibility:** A Vehicle Passport can be implemented without duplicating data. The `vehicleRegistry` table is the anchor. The passport view is a read-only aggregation across `vehicleRegistry`, `vehicleDamageHistory`, `repairHistory`, `vehicleMarketValuations`, and (after generalisation) Fleet and Agency vehicle records. No new tables are required for the core passport — only the linkage gaps need to be closed.

---

## 19. Evidence Model Assessment

KINGA does not have a generic evidence model. Evidence is currently fragmented by module:

| Evidence Type | Current Storage | Module-specific? |
|---|---|---|
| Photograph | S3 URL in `claims.imageUrls` (JSON array) | Yes — Claims only |
| Document (claim) | `ingestionDocuments`, `claimDocuments` | Yes — Claims only |
| Document (fleet) | `fleetDocuments` | Yes — Fleet only |
| Document (agency) | `agencyDocuments` | Yes — Agency only |
| Document (policy) | `policyDocuments` | Yes — Insurance only |
| AI observation | `aiAssessments` JSON columns | Yes — Claims only |
| Measurement | `vehicleGeometryMeasurements` | Reference data only |
| Engineer observation | None | — |
| External record | `policeReports` | Yes — Claims only |
| Sensor data | None | — |

**Recommended minimum change:** Introduce a generic `evidence` table with columns: `id`, `caseType` (enum: `claim`, `inspection`, `valuation`, `fleet_incident`), `caseId`, `evidenceType` (enum: `photograph`, `document`, `measurement`, `observation`, `external_record`), `url`, `mimeType`, `tenantId`, `createdBy`, `createdAt`, `metadata` (JSON). Existing module-specific document tables can remain and be linked to this table via a `evidenceId` FK, or the generic table can be used for new modules while existing tables are preserved for Claims.

---

## 20. Measurement Model Assessment

No generic physical measurement entity exists. The `vehicleGeometryMeasurements` table stores reference geometry (factory dimensions) and is not designed for engineer-recorded field measurements.

**Proposed generic measurement abstraction:**

```sql
physicalMeasurements (
  id, caseType, caseId, assetType, assetId,
  measurementCategory,  -- 'crush_depth', 'gap', 'deformation', 'electrical', 'structural', etc.
  measurementLabel,     -- human-readable label
  valueRaw,             -- numeric value
  unit,                 -- 'mm', 'cm', 'm', 'V', 'A', 'kN', etc.
  referencePoint,       -- description of measurement reference
  instrumentType,       -- 'ruler', 'caliper', 'multimeter', 'laser', etc.
  instrumentId,         -- optional instrument serial/calibration ID
  calibrationRef,       -- calibration certificate reference
  confidence,           -- 0.0–1.0
  engineerId,           -- FK to users
  evidencePhotoUrl,     -- S3 URL of photo showing measurement
  tenantId, createdAt, updatedAt
)
```

This model is deliberately asset-type agnostic. The `assetType` field allows it to support vehicles, machinery, electrical, structural, property, and fire systems without schema changes. The `measurementCategory` field is a free-form string (not an enum) to avoid constraining future asset types.

---

## 21. Case and Workflow Assessment

**Current state:** The `workflowStates` table has a hard foreign key to `claims.id`. The `workflowTemplates` table is also Claims-scoped. The `claim-state-machine.ts` guards are Claims-specific.

**Architectural justification for a generic KINGA Case:** The proposed case types (CLAIM, QUOTE_REQUEST, VALUATION, VEHICLE_VERIFICATION, ENGINEERING_INSPECTION, FORENSIC_INVESTIGATION, FLEET_INSPECTION, RISK_SURVEY) all share the following attributes: a unique reference number, a status lifecycle, a tenant, an owner/submitter, assigned parties, evidence, and an audit trail. This is a strong justification for a generic case abstraction.

**Recommended approach (minimum change):** Make `workflowStates.claimId` nullable and add `caseType` (varchar) and `caseId` (int) columns. Update the state machine to accept a generic case reference. This avoids introducing a new `cases` table and preserves all existing Claims workflow behaviour. The `workflowTemplates` table already supports configurable templates — it can be extended with a `caseType` discriminator.

**Risk:** Claims currently relies on `workflowStates.claimId` being non-null in several queries. These queries must be updated to use the polymorphic `caseType + caseId` pattern. This is a bounded refactor, not a rewrite.

---

## 22. API and Service Reusability Assessment

The following table identifies current Claims-specific functions that should be generalised to platform services:

| Current Function | Current Location | Proposed Generalisation | Classification |
|---|---|---|---|
| `generateVehicleValuation()` | `server/insurance/valuation-engine.ts` | `vehicleValuation.getValuation(context, request)` | REUSE WITH EXTENSION |
| `computeIFE()` | `server/pipeline-v2/inputFidelityEngine.ts` | `evidenceGateway.checkCompleteness(context, evidence[])` | GENERALIZE |
| `photoForensicsEngine.analysePhotos()` | `server/pipeline-v2/photoForensicsEngine.ts` | `imageIntelligence.analysePhotos(photos[], context?)` | REUSE DIRECTLY |
| `buildCompositeQuote()` | `server/pipeline-v2/quoteOptimisationEngine.ts` | `costIntelligence.optimiseQuotes(quotes[], benchmarks)` | REUSE DIRECTLY |
| `computeReconciliation()` | `server/pipeline-v2/reconciliation-engine.ts` | `reconciliation.arbitrate(sources[], field)` | GENERALIZE |
| `stage-7-physics` | `server/pipeline-v2/stage-7-physics.ts` | `physicsIntelligence.analyse(damageData, measurements?)` | GENERALIZE |
| `generateVehicleValuation()` comparables | `server/insurance/valuation-engine.ts` | `vehicleValuation.getComparables(make, model, year, date?)` | REUSE WITH EXTENSION |
| `crossClaimIntelligence` | `server/routers/cross-claim-intelligence.ts` | `vehicleIntelligence.getVehicleHistory(vin, tenantId)` | GENERALIZE |
| `generateReport()` | `server/reporting/` | `reporting.generate(template, context, data)` | REUSE WITH EXTENSION |
| `computeIFE()` image quality checks | `server/pipeline-v2/inputFidelityEngine.ts` | `evidenceGateway.checkImageQuality(images[])` | GENERALIZE |
| `notifyOwner()` | `server/_core/notification.ts` | `notifications.send(recipientId, title, content, channel)` | REUSE WITH EXTENSION |


---

## 23. RBAC and Permissions Assessment

### 23.1 Current Role Inventory

The `users.role` enum currently contains: `admin`, `user`, `insurer`, `assessor`, `panel_beater`, `fleet_manager`, `platform_super_admin`, `claims_manager`, `claims_processor`, `recovery_agent`, `customer`.

The `users.insurerRole` enum (insurer sub-roles) contains: `insurer_admin`, `assessor_internal`, `assessor_external`, `underwriter`, `claims_handler`, `finance_officer`.

### 23.2 RBAC Architecture

Role-based access is enforced at the tRPC procedure level using middleware. The pattern is:

```typescript
// In procedure definition:
.use(({ ctx, next }) => {
  if (ctx.user.role !== 'insurer') throw new TRPCError({ code: 'FORBIDDEN' });
  return next({ ctx });
})
```

There is no declarative permission registry (no CASL, no Casbin, no policy table). Permissions are enforced inline in each procedure. This is consistent and auditable but means that adding a new role requires updating every procedure that should permit it.

### 23.3 Required Role Additions

| New Role | Enum Location | Purpose | Procedures Requiring Update |
|---|---|---|---|
| `agency` | `users.role` | Agency broker/intermediary | `agencyProcedure` guard (single change) |
| `engineer` | `users.role` | Engineering workspace inspector | All engineering workspace procedures |
| `engineering_manager` | `users.role` | Engineering workspace manager | Engineering management procedures |
| `risk_surveyor` | `users.role` | Risk survey specialist | Risk survey procedures |

### 23.4 Multi-Tenant RBAC

Each user has a single `tenantId`. Cross-tenant operations are not permitted except by `platform_super_admin`. The `organizations` table provides an optional grouping above tenant level, but it is not currently used for RBAC decisions. Fleet managers can be associated with multiple fleets within their tenant via the `fleetAccounts` table.

### 23.5 Audit Trail Coverage

The `auditTrail` table records user actions with `userId`, `action`, `entityType`, `entityId`, `previousValue`, `newValue`, `changeDescription`, `ipAddress`, and `userAgent`. However, it has a `claimId` foreign key, making it Claims-scoped. The `workflowAuditTrail` table is also Claims-scoped. The `insuranceAuditLogs`, `fleetAuditLogs`, `governanceAuditLog`, and `isoAuditLogs` tables are module-specific.

**Recommended change:** Make `auditTrail.claimId` nullable and add `caseType` + `caseId` columns (consistent with the workflow generalisation in Section 21). This creates a single audit trail table that covers all KINGA modules.

---

## 24. Testing Infrastructure Assessment

### 24.1 Test Coverage Inventory

The KINGA codebase contains 112 test files (confirmed by `find` scan). Coverage is concentrated in the following areas:

| Area | Test Files | Coverage Assessment |
|---|---|---|
| Pipeline engines | 38 test files in `server/pipeline-v2/` | High — most engines have dedicated test files |
| Services | 24 test files in `server/services/` | High — confidence, fraud, consistency, fast-track, analytics |
| Routers | 14 test files in `server/routers/` | Medium — agency, fleet, workflow, tenant, marketplace |
| Core infrastructure | 8 test files in `server/` root | Medium — auth, tenant isolation, workflow |
| Integration | 4 test files (`wave3`, `wave4`, `e2e-event-flow`, `claim-lifecycle`) | Medium |
| Shared | 2 test files in `shared/` | Low |

### 24.2 Testing Gaps

| Gap | Severity | Recommended Solution |
|---|---|---|
| No tests for `photoForensicsEngine.ts` | HIGH | Add unit tests for EXIF extraction, hash computation, manipulation scoring |
| No tests for `inputFidelityEngine.ts` | HIGH | Add unit tests for completeness scoring and gap classification |
| No tests for `decisionOptimisationEngine.ts` | HIGH | Add unit tests for FCDI gate and quote disqualification |
| No tests for `costDecisionEngine.ts` | HIGH | Add unit tests for `true_cost_usd` resolution hierarchy |
| No tests for `valuation-engine.ts` | MEDIUM | Add unit tests for adjustment factors and confidence scoring |
| No tests for `reconciliation-engine.ts` | HIGH | Add unit tests for arbitration logic and reconciliation logging |
| No tests for `costLearningRecorder.ts` | HIGH | Add unit tests for fraud exclusion gate |
| No tests for `felVersionRegistry.ts` | MEDIUM | Add unit tests for version hash determinism |
| No tests for Agency routers | MEDIUM | Add integration tests for quotation and policy procedures |
| No tests for `policy-issuance.ts` | HIGH | Add unit tests for policy creation and valuation integration |
| No E2E tests for Agency portal | HIGH | Add E2E tests for quote request → policy issuance flow |

### 24.3 Test Infrastructure Quality

The test infrastructure is well-configured. Vitest is used throughout with a consistent pattern. The `server/auth.logout.test.ts` file serves as the reference sample. Integration tests use a test database. The `tests/e2e-event-flow.test.ts` file provides an end-to-end flow test template. The `server/wave3-integration.test.ts` and `server/wave4-integration.test.ts` files test multi-stage pipeline integration.

---

## 25. Reporting Infrastructure Assessment

### 25.1 Existing Reporting Capabilities

| Report | Template | Generator | Output Format |
|---|---|---|---|
| Forensic Decision Report | `forensicDecisionReport.ts` | `reportQueue.ts` | HTML → PDF |
| Claims Intelligence Report | `claimsIntelligenceReport.ts` | `reportQueue.ts` | HTML → PDF |
| Shadow Report | `server/shadow-report-generator.ts` | Inline | HTML → PDF |
| Policy Document | `server/insurance/policy-pdf-generator.ts` | Inline | HTML → PDF |

**Design system:** `server/reporting/templates/kingaDesignSystem.ts` provides a shared set of HTML/CSS primitives: `sectionTab()`, `co()` (callout), `box()` (white card), `kv()` (key-value row), `cols-2` grid, flag pills, `p()` (status pill). All report sections should use these primitives for visual consistency.

**Report queue:** `server/reporting/reportQueue.ts` manages asynchronous report generation with status tracking (`generatedReports` table). Reports are stored in S3 and their URLs saved to the database.

### 25.2 Required New Report Templates

| Report | Priority | Reuse Level | New Work Required |
|---|---|---|---|
| Vehicle Verification Report | HIGH | KINGA design system | New template using existing photo forensics output |
| Vehicle Valuation Report | HIGH | KINGA design system | New template using existing valuation engine output |
| Engineering Inspection Report | HIGH | KINGA design system | New template using new inspection/measurement entities |
| Risk Survey Report | MEDIUM | KINGA design system | New template |
| Fleet Risk Report | MEDIUM | KINGA design system | New template using fleet risk scores |
| Vehicle Passport Report | MEDIUM | KINGA design system | New template aggregating vehicle history |

All new templates should be implemented as new files in `server/reporting/` using the `kingaDesignSystem.ts` primitives. The `reportQueue.ts` infrastructure handles PDF generation and storage without modification.

---

## 26. Document Intelligence Assessment

Document intelligence is implemented in the Claims pipeline as Stage 2 (`stage-2-extraction.ts`) and Stage 3 (`stage-3-structured-extraction.ts`). Stage 2 performs OCR and raw text extraction from uploaded documents. Stage 3 performs structured field extraction using LLM with JSON schema output.

**Reusability:** The document extraction functions accept a document URL and return structured data. They do not require a `claimId` for their core extraction logic. The `claimId` is used for logging and for storing results in `aiAssessments`. These functions can be called from Agency (for insurance application documents) and Engineering (for technical reports, certificates) with minimal changes.

**Document types currently supported:** Police reports, repair quotes, medical reports, vehicle registration documents, insurance policies, driver's licences, identity documents.

**Document types required for Agency:** Insurance application forms, proof of address, vehicle purchase invoices, previous policy documents.

**Document types required for Engineering:** Engineering certificates, calibration certificates, inspection reports, technical specifications, regulatory compliance documents.

**Recommended change:** Expose `stage-2-extraction.ts` and `stage-3-structured-extraction.ts` as standalone callable services with a generic `documentContext` parameter (replacing `claimId`). Add new JSON schemas for Agency and Engineering document types.

---

## 27. Notification and Communication Assessment

**Current notification infrastructure:**
- `notifyOwner({ title, content })` — sends a notification to the Manus project owner. Owner-only. Not suitable for end-user notifications.
- `claimEvents` table — stores claim lifecycle events. No notification trigger.
- `claimComments` table — stores comments on claims. No notification trigger.
- Email: `server/safe-email.ts` — email sending via Manus built-in email service. Used for specific triggers (assessment complete, quote received).

**Gaps for Agency and Engineering:**
- No customer-facing notification system (quote status, policy issued, claim status update)
- No engineer notification system (new assignment, inspection due, report approved)
- No configurable notification preferences per user
- No in-app notification centre

**Recommended minimum change:** Extend `safe-email.ts` with a generic `notifyUser(userId, title, content, channel)` function that routes to email (and optionally in-app notification). Add a `notifications` table for in-app notification persistence. This is a bounded addition that does not require changing any existing notification logic.

---

## 28. Analytics and Reporting Assessment

**Existing analytics infrastructure:**
- `server/services/analytics/` — analytics export service, usage metering
- `VITE_ANALYTICS_ENDPOINT` and `VITE_ANALYTICS_WEBSITE_ID` — frontend analytics integration (Umami or similar)
- `usageMetrics` table — API usage tracking per tenant
- `claimConfidenceScores` table — confidence score history per claim
- `automationAuditLog` — automation decision history

**Gaps for Agency and Engineering:**
- No Agency-specific analytics (quote conversion rate, policy issuance rate, agency performance)
- No Engineering-specific analytics (inspection throughput, measurement accuracy, report turnaround)
- No cross-module analytics dashboard (claims + agency + fleet + engineering in one view)

**Recommended approach:** The existing analytics export service can be extended with new query functions for Agency and Engineering metrics. No new infrastructure is required.

---

## 29. Pre-Existing TypeScript Errors

The following pre-existing TypeScript errors are present in the codebase and are not related to any work in this audit. They are documented here for completeness.

| File | Error | Severity | Root Cause |
|---|---|---|---|
| `server/voltron-query3.ts` | `fraudRiskScore` does not exist on `ai_assessments` | Non-blocking | Field renamed to `fraudScore` in schema |
| `server/voltron-query3.ts` | `status` type mismatch in `inArray` call | Non-blocking | String literal not assignable to enum type |
| `server/pipeline-v2/orchestrator.ts` | `fraudScore` typo (should be `fraud_score`) | Non-blocking | Field name mismatch |
| `server/pipeline-v2/stage-7-physics.ts` | `damagedComponents` field name mismatch | Non-blocking | Field name mismatch |
| `server/routers/workflow-queries.ts` | Minor field reference | Non-blocking | Field name mismatch |

These errors are in non-critical query files and do not affect the Claims pipeline execution. They should be resolved in a dedicated cleanup pass.

---

## 30. Integration Points and External Dependencies

| Integration | Type | Location | Status |
|---|---|---|---|
| Manus OAuth | Authentication | `server/_core/oauth.ts` | Production |
| Manus LLM API | AI inference | `server/_core/llm.ts` | Production |
| Manus Image Generation | Image generation | `server/_core/imageGeneration.ts` | Production |
| Manus Voice Transcription | Audio transcription | `server/_core/voiceTranscription.ts` | Production |
| Manus Notification API | Owner notifications | `server/_core/notification.ts` | Production |
| Manus S3 Storage | File storage | `server/storage.ts` | Production |
| Google Maps (Manus proxy) | Maps | `server/_core/map.ts`, `client/src/components/Map.tsx` | Production |
| MySQL/TiDB | Database | `server/_core/db.ts` | Production |
| Sentry | Error monitoring | `server/sentry-integration.ts` | Production |
| Email (Manus built-in) | Email sending | `server/safe-email.ts` | Production |
| Kafka | Event streaming | `infrastructure/` | Infrastructure only (not used in application code) |
| MLflow | ML experiment tracking | `infrastructure/` | Infrastructure only |

---

## 31. Dependency Map

The following dependency relationships are confirmed by direct source inspection:

```
Agency Module
  → users.role (enum: 'agency' required)
  → agencyClients, insurerQuoteRequests, quotationRequests (DB)
  → valuation-engine.ts (for pre-insurance valuation)
  → photoForensicsEngine.ts (for vehicle verification)
  → policy-issuance.ts, policy-pdf-generator.ts (for policy issuance)
  → reporting/ (for verification and valuation reports)

Engineering Workspace
  → users.role (enum: 'engineer', 'engineering_manager' required)
  → New: inspections, physicalMeasurements, engineerObservations (DB)
  → photoForensicsEngine.ts (for evidence capture)
  → stage-7-physics.ts (for physics analysis with measurements)
  → reconciliation-engine.ts (for AI vs physical measurement arbitration)
  → reporting/ (for engineering inspection report)
  → felVersionRegistry.ts (for court-grade audit trail)

Vehicle Passport
  → vehicleRegistry (anchor entity)
  → vehicleDamageHistory (damage history)
  → repairHistory (repair history)
  → vehicleMarketValuations (valuation history)
  → fleetVehicles (requires vehicleRegistryId FK addition)
  → agencyClients (requires vehicleRegistryId FK addition)

Fleet Intelligence Enhancement
  → vehicleRegistry (requires fleetVehicles linkage)
  → photoForensicsEngine.ts (for fleet incident assessment)
  → valuation-engine.ts (for fleet vehicle valuation)
  → cross-claim-intelligence.ts (for fleet fraud detection)
```

---

## 32. Implementation Sequence Recommendation

The following sequence minimises risk by front-loading the foundational changes that unblock the most downstream work.

### Phase 1 — Foundation (no new features, no breaking changes)

1. Add `agency`, `engineer`, `engineering_manager`, `risk_surveyor` to `users.role` enum. Push migration.
2. Make `auditTrail.claimId` nullable. Add `caseType` + `caseId` columns. Push migration.
3. Make `workflowStates.claimId` nullable. Add `caseType` + `caseId` columns. Push migration.
4. Add `vehicleRegistryId` FK to `fleetVehicles`. Populate via VIN match job. Push migration.
5. Add `vehicleRegistryId` FK to `agencyClients`. Populate via VIN match job. Push migration.
6. Fix pre-existing TypeScript errors in `voltron-query3.ts`, `orchestrator.ts`, `stage-7-physics.ts`, `workflow-queries.ts`.

### Phase 2 — Agency Activation

7. Update `agencyProcedure` guard to permit `agency` role.
8. Build admin UI for agency role assignment.
9. Create `/customer` route group with customer-specific layout.
10. Build customer case tracking page (quote status, claim status).
11. Add `pHash` computation to `photoForensicsEngine.ts`. Add `pHash` column to `ingestionDocuments`.
12. Add cross-submission pHash similarity query at Agency intake.
13. Add EXIF-absent risk flag to photo forensics output.
14. Add AI-generation detection LLM call to photo forensics engine.
15. Build Vehicle Verification Report template.
16. Build Vehicle Valuation Report template.
17. Expose `generateVehicleValuation()` via new Agency tRPC procedure.

### Phase 3 — Engineering Workspace

18. Create `inspections` table (generic, polymorphic case type).
19. Create `physicalMeasurements` table (generic, multi-asset).
20. Create `engineerObservations` table.
21. Add `"engineer_measurement"` to `ReconciliationSource` enum in `reconciliation-engine.ts`.
22. Add `engineerMeasurements` input field to `Stage7Input` in `types.ts`.
23. Build Engineering Workspace router and procedures.
24. Build Engineering Workspace frontend pages.
25. Build Engineering Inspection Report template.
26. Add engineer notification triggers.

### Phase 4 — Vehicle Passport and Cross-Module Intelligence

27. Build Vehicle Passport aggregation query.
28. Build Vehicle Passport page (read-only, cross-module).
29. Build Vehicle Passport Report template.
30. Connect Fleet incident reports to Claims pipeline (optional AI assessment).
31. Expose cross-claim intelligence for Fleet VINs.
32. Build cross-module analytics dashboard.

---

## 33. Known Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Fraud learning corpus contamination (G-1 from cost architecture audit) | HIGH | Add fraud-risk exclusion gate to `costLearningRecorder.ts` before next retraining |
| Benchmark drift (G-2) | HIGH | Add benchmark drift monitoring job |
| Quote extraction non-determinism (G-6) | MEDIUM | Set `temperature: 0` for quote extraction LLM calls; cache extracted line items |
| Scope blending in benchmarks (C-1 from comparability audit) | HIGH | Re-derive scope-segmented Tier 3 benchmarks from existing `component_repair_outcomes` data |
| `part_origin` not flowing to composite engine | MEDIUM | Pass `part_origin` through `InputQuoteWithLineItems` once segmented benchmarks exist |
| SARJAZZ INVESTMENTS supplier-injection bug | HIGH | Fix composite engine to scope quote line items to claim's registered suppliers only |
| Pre-existing TypeScript errors (47 errors) | MEDIUM | Resolve in dedicated cleanup pass before next major feature |
| `agencyClients` vehicle data not linked to `vehicleRegistry` | HIGH | Phase 1 migration (Section 32, step 5) |
| `fleetVehicles` not linked to `vehicleRegistry` | HIGH | Phase 1 migration (Section 32, step 4) |
| No pHash near-duplicate detection at Agency intake | HIGH | Phase 2 addition (Section 32, step 11–12) |
| No AI-generated image detection | HIGH | Phase 2 addition (Section 32, step 14) |

---

## 34. What Does Not Exist and Must Be Built

The following capabilities have no existing partial implementation in KINGA and must be built from scratch:

1. **Physical measurement entity** (`physicalMeasurements` table and associated procedures). This is the only genuinely new data model required.

2. **Engineer observation entity** (`engineerObservations` table). The `claimComments` table is Claims-scoped and should not be repurposed.

3. **Perceptual hashing (pHash)** for near-duplicate photo detection. No pHash library is currently installed or used.

4. **AI-generated image detection** capability. No LLM prompt or model exists for this purpose.

5. **Customer-facing notification system**. The `notifyOwner` helper is owner-only. No customer notification pathway exists.

6. **Customer case tracking portal**. The `KingaAgency.tsx` page exists but does not provide a customer-facing status view for submitted quotes or claims.

7. **Vehicle Verification Report template**. No report template exists for pre-insurance vehicle verification.

8. **Vehicle Valuation Report template**. No customer-facing valuation report template exists.

9. **Engineering Inspection Report template**. No engineering-specific report template exists.

10. **Generic inspection entity** (`inspections` table). The Claims assessor workflow is not generalised to support non-Claims inspections.

---

## 35. What Exists and Can Be Reused Directly

The following capabilities are confirmed to exist in production-ready form and can be reused directly in Agency and Engineering contexts with no code changes to the engine itself (only new tRPC procedures and UI pages are required):

1. **Vehicle valuation engine** — `server/insurance/valuation-engine.ts`. Accepts make/model/year/condition/mileage. No claim dependency.

2. **Photo forensics engine** — `server/pipeline-v2/photoForensicsEngine.ts`. Accepts image URL array. `claimId` is logging-only.

3. **Quote optimisation engine** — `server/pipeline-v2/quoteOptimisationEngine.ts`. Accepts quotes and benchmarks. No claim dependency.

4. **ML benchmark engine** — `server/pipeline-v2/mlBenchmarkEngine.ts`. Accepts component name and vehicle attributes. No claim dependency.

5. **Speed inference ensemble** — `server/pipeline-v2/speedInferenceEnsemble.ts`. Accepts damage data. No claim dependency.

6. **Damage pattern validation engine** — `server/pipeline-v2/damagePatternValidationEngine.ts`. Accepts damage zones. No claim dependency.

7. **Severity consensus engine** — `server/pipeline-v2/severityConsensusEngine.ts`. Accepts multi-source severity inputs. No claim dependency.

8. **Repair-replace engine** — `server/pipeline-v2/repairReplaceEngine.ts`. Accepts component and severity. No claim dependency.

9. **Quote extraction engine** — `server/pipeline-v2/quoteExtractionEngine.ts`. Accepts document URL. No claim dependency.

10. **Semantic image classifier** — `server/pipeline-v2/semanticImageClassifier.ts`. Accepts image URL. No claim dependency.

11. **Vehicle geometry engine (VGE)** — `server/pipeline-v2/stage-6-5a-vge.ts`. Accepts vehicle make/model/year. No claim dependency.

12. **Structural load path engine (SLPE)** — `server/pipeline-v2/stage-6-5c-slpe.ts`. Accepts damage zones. No claim dependency.

13. **FEL version registry** — `server/pipeline-v2/felVersionRegistry.ts`. Accepts stage ID and prompt. No claim dependency.

14. **Trust event bus** — `server/pipeline-v2/trustEventBus.ts`. No claim dependency.

15. **Output realism validator** — `server/pipeline-v2/outputRealismValidator.ts`. Accepts output object. No claim dependency.

16. **Stage explainability** — `server/pipeline-v2/stage-explainability.ts`. Accepts stage output. No claim dependency.

17. **Assumption classifier** — `server/pipeline-v2/assumptionClassifier.ts`. No claim dependency.

18. **Weather cross-check engine** — `server/pipeline-v2/weatherCrossCheckEngine.ts`. Accepts date and location. No claim dependency.

19. **Accident date cross-check engine** — `server/pipeline-v2/accidentDateCrossCheckEngine.ts`. Accepts dates. No claim dependency.

20. **Policy issuance** — `server/insurance/policy-issuance.ts`. Accepts policy data. No claim dependency.

21. **Policy PDF generator** — `server/insurance/policy-pdf-generator.ts`. Accepts policy data. No claim dependency.

22. **Document extraction (Stage 2 + Stage 3)** — `server/pipeline-v2/stage-2-extraction.ts`, `stage-3-structured-extraction.ts`. Core extraction is document-URL-based.

23. **Report queue infrastructure** — `server/reporting/reportQueue.ts`. Accepts template name and data. No claim dependency.

24. **KINGA design system** — `server/reporting/templates/kingaDesignSystem.ts`. Fully reusable HTML/CSS primitives.

25. **Agency server infrastructure** — `server/routers/agency.ts`, `server/routers/agency-broker.ts`. Fully built, awaiting role activation.

26. **Agency database schema** — `agencyClients`, `insurerQuoteRequests`, `quotationRequests`, `insurancePolicies`, `insuranceProducts`, `insuranceCarriers`. Fully migrated.

27. **Agency frontend pages** — `KingaAgency.tsx`, `AgencyFleetQuotes.tsx`. Fully built.

28. **Vehicle registry** — `vehicleRegistry`, `vehicleDamageHistory`. Centralised vehicle identity, populated from Claims assessments.

29. **Regulatory profiles** — `server/pipeline-v2/regulatoryProfiles.ts`. Jurisdiction-specific rules. No claim dependency.

30. **Animal strike physics engine** — `server/pipeline-v2/animalStrikePhysicsEngine.ts`. No claim dependency.

---

*End of KINGA Platform Capability & Architecture Audit v1.0*
*Generated: July 2026 | Classification: Internal — Engineering*
