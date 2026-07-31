# KINGA Platform Validation Report
## Version 1.0

**Document Reference:** KINGA-PVR-v1.0  
**Classification:** Internal — Enterprise Architecture  
**Issued by:** KINGA Enterprise Platform Review Board  
**Review Scope:** Epics 1–3 (Implemented) + Epic 4 (Designed, Pre-Implementation)  
**Review Date:** 31 July 2026  
**Status:** Final

---

## Executive Summary

The KINGA Intelligence Platform has undergone a comprehensive Enterprise Platform Review Board validation covering architectural integrity, service reuse, data flow, cross-module integration, platform consistency, governance compliance, scalability, and maintainability. The review examined the complete implemented codebase across Epics 1 through 3, the Epic 4 Technical Design Specification, the Platform Service Registry, the Architecture Decision Record Library, and the Platform Governance Standard.

The platform demonstrates a high degree of architectural coherence for a system of this complexity. The foundational decisions made in Epics 1 and 2 — a single workflow engine, a physics-immutable AI pipeline, a shared intelligence architecture, and a centralised RBAC model — have held firm through three Epics of development. The Platform Readiness Remediation Sprint successfully addressed the most significant governance violations identified in the pre-Epic 4 audit, and the Governance Standard now provides a robust framework for preventing future drift.

The review identifies one material architectural concern — the parallel vehicle valuation implementation in `server/insurance/valuation-engine.ts` alongside the registered `server/services/vehicleValuation.ts` — and a set of database schema observations relating to audit log fragmentation and report table proliferation. These are addressable improvements rather than structural failures.

The platform is assessed as **ready for Epic 4 implementation**, subject to the resolution of the valuation duplication finding prior to the implementation of the Vehicle Passport module, which depends on a single authoritative valuation source.

**Overall Platform Health Score: 81 / 100**

---

## Table of Contents

1. [Review Methodology](#1-review-methodology)
2. [Module Audit](#2-module-audit)
3. [Platform Service Audit](#3-platform-service-audit)
4. [Database Architecture Review](#4-database-architecture-review)
5. [API Architecture Review](#5-api-architecture-review)
6. [Reporting Architecture Review](#6-reporting-architecture-review)
7. [Governance Compliance Assessment](#7-governance-compliance-assessment)
8. [Dependency Diagrams](#8-dependency-diagrams)
9. [Platform Health Assessment](#9-platform-health-assessment)
10. [Recommended Improvements](#10-recommended-improvements)

---

## 1. Review Methodology

The Review Board conducted a four-pass audit of the KINGA platform:

**Pass 1 — Module Audit.** Each of the ten domain modules was examined for service consumption patterns, database entity ownership, read-only entity access, capability duplication, and governance compliance. The primary evidence sources were the router files in `server/routers/`, the main `server/routers.ts`, and the Epic Technical Design Specifications.

**Pass 2 — Service Audit.** Each registered platform service was examined for coupling characteristics, consumer breadth, generalisability, and correct invocation patterns. The primary evidence sources were the service files in `server/`, `server/pipeline-v2/`, `server/services/`, and `server/repair-intelligence/`, cross-referenced against the Platform Service Registry.

**Pass 3 — Architecture Audit.** The database schema (`drizzle/schema.ts`), API router registrations (`server/routers.ts`), and reporting layer (`server/reporting/`) were examined for structural consistency, naming conventions, authorisation patterns, and potential redundancy.

**Pass 4 — Governance Compliance.** Each of the 20 principles in the Platform Governance Standard was evaluated against the actual codebase, with a finding of COMPLIANT, PARTIALLY COMPLIANT, or NON-COMPLIANT and a specific justification.

---

## 2. Module Audit

### 2.1 Claims Module

The Claims module is the platform's primary domain module and the most complex. It is implemented across `server/routers.ts` (the `claims` router, approximately 3,200 lines), `server/routers/claim-completion.ts`, `server/routers/claims-manager.ts`, `server/routers/approval.ts`, and `server/routers/decision.ts`.

| Dimension | Assessment |
|---|---|
| **Services Consumed** | Workflow Engine, AI Pipeline Orchestrator, Physics Engine, Fraud Intelligence Engine, Cost Estimation Engine, Vehicle Valuation Service, Document Intelligence, Photo Forensics, Cross-Stage Reconciliation, IFE, DOE, FEL Registry, Decision Transparency, Assignment Engine, Report Renderer |
| **Services Exposed** | Claims CRUD, AI assessment trigger, quote management, assessor assignment, fast-track routing, claim completion, approval workflow |
| **Entities Owned** | `claims`, `aiAssessments`, `claimDocuments`, `claimEvents`, `claimComments`, `claimConfidenceScores`, `claimRoutingDecisions`, `claimDecisionLifecycle`, `finalApprovalRecords`, `claimApprovals`, `adjusterSignOffs` |
| **Entities Read** | `vehicleRegistry`, `drivers`, `insurancePolicies`, `assessors`, `panelBeaters`, `fraudAlerts`, `crossClaimSignals`, `vehicleMarketValuations` |
| **Capability Duplication** | None detected within the Claims module itself |
| **Governance Concerns** | None — all state transitions route through `WorkflowEngine.transition()` |

The Claims module correctly delegates all intelligence production to platform services. The `fast-track-dispatcher.ts` service, which automates claim progression, correctly uses `WorkflowEngine` for all state transitions and is a well-designed orchestration layer.

### 2.2 Agency Module

The Agency module is implemented in `server/routers/agency.ts` and `server/routers/agency-broker.ts`. It serves agency users who perform vehicle verification and valuation services.

| Dimension | Assessment |
|---|---|
| **Services Consumed** | Vehicle Valuation Service (via `insurance/valuation-engine.ts` — see concern below), Report Renderer, Vehicle Registry |
| **Services Exposed** | Vehicle verification, vehicle valuation, agency document management, agency client management |
| **Entities Owned** | `agencyDocuments`, `agencyClients`, `agencyClients` |
| **Entities Read** | `vehicleRegistry`, `vehicleMarketValuations`, `claims` (for valuation context) |
| **Capability Duplication** | **CONCERN:** The Agency module imports from `server/insurance/valuation-engine.ts`, which is a parallel valuation implementation alongside the registered `server/services/vehicleValuation.ts`. This is the platform's most significant architectural concern and is addressed in Section 3.2. |
| **Governance Concerns** | P-06 (No Duplicate Valuation Logic) — PARTIALLY COMPLIANT. The `insurance/valuation-engine.ts` is not the registered service but it does query the same underlying `vehicleMarketValuations` table. The concern is the existence of two separate valuation code paths rather than different data sources. |

### 2.3 Engineering Module

The Engineering module is implemented in `server/routers/inspections.ts` and the Epic 3 engineering infrastructure (`server/pipeline-v2/engineerMeasurementAdapter.ts`, `server/pipeline-v2/crossStageConsistencyEngine.ts`).

| Dimension | Assessment |
|---|---|
| **Services Consumed** | Physics Engine (via cross-stage consistency), Engineering Measurement Integration, Assignment Engine (`workload-balancing.ts`), LLM (for voice transcription and AI-assisted observations), Voice Transcription, Document Intelligence |
| **Services Exposed** | Inspection lifecycle management, physical measurements, engineer observations, evidence linking, inspection assignment |
| **Entities Owned** | `inspections`, `physicalMeasurements`, `engineerObservations`, `engineerProfiles`, `assetRegistry` (co-owned with Asset Passport) |
| **Entities Read** | `claims`, `claimDocuments`, `vehicleGeometryMeasurements`, `vehicleLandmarks`, `physicsValidationRecords` |
| **Capability Duplication** | None detected |
| **Governance Concerns** | P-10 (Every Inspection is Asset-Centric) — COMPLIANT. The `inspections` table has an `assetRef` column. The `inspection_id` FK on `claim_documents` was added during the Remediation Sprint. |

The Engineering module is well-architected. The use of `reconcileEngineerMeasurements()` from `crossStageConsistencyEngine.ts` rather than implementing its own reconciliation logic is a correct application of P-02 (Modules Orchestrate Intelligence).

### 2.4 Fleet Module

The Fleet module is implemented in `server/routers/fleet-accounts.ts`, `server/routers/fleet-agency-routing.test.ts`, and the fleet-related procedures in `server/routers.ts`.

| Dimension | Assessment |
|---|---|
| **Services Consumed** | Workflow Engine (for fleet claim routing), Vehicle Registry, Driver Registry, Fraud Intelligence Engine (cross-claim signals), Report Renderer |
| **Services Exposed** | Fleet account management, fleet vehicle management, fleet driver management, fleet claim routing, fleet manager request workflow |
| **Entities Owned** | `fleets`, `fleetAccounts`, `fleetVehicles`, `fleetDrivers`, `fleetManagerRequests`, `fleetAuditLogs`, `fleetRiskScores`, `fleetIncidentReports` |
| **Entities Read** | `claims`, `crossClaimSignals`, `vehicleRegistry`, `drivers`, `vehicleDamageHistory` |
| **Capability Duplication** | None detected |
| **Governance Concerns** | None identified |

The Fleet module's architecture is clean. It correctly reads from the Vehicle Registry and Driver Registry rather than maintaining its own vehicle/driver tables. The `fleetVehicles` and `fleetDrivers` tables serve as fleet-specific relationship tables (linking fleet accounts to registry entities) rather than duplicating registry data.

### 2.5 Vehicle Passport Module (Epic 4 — Designed)

The Vehicle Passport module is designed in the Epic 4 TDS. It does not yet exist in the codebase. The design calls for a `vehiclePassport` router with 6 procedures that aggregate data from 10 existing tables.

| Dimension | Assessment |
|---|---|
| **Services to be Consumed** | Vehicle Registry, Vehicle Valuation Service, Cross-Claim Intelligence, Fraud Intelligence Engine, Physics Engine (via `physicsValidationRecords`), Repair Intelligence Service, Document Intelligence |
| **Services to be Exposed** | Vehicle passport retrieval, vehicle timeline, vehicle risk profile, vehicle claim history |
| **Entities to be Owned** | `vehicle_passport_snapshots` (new, aggregation cache) |
| **Entities to be Read** | `vehicleRegistry`, `vehicleDamageHistory`, `vehicleHistory`, `vehicleMileageLogs`, `vehicleMarketValuations`, `crossClaimSignals`, `repairHistory`, `physicsValidationRecords`, `claimDocuments`, `inspections` |
| **Capability Duplication Risk** | HIGH — depends on resolution of the valuation duplication concern before implementation. The Vehicle Passport must use a single valuation source. |
| **Governance Concerns** | The Epic 4 TDS correctly identifies `services/vehicleValuation.ts` as the canonical source. The Agency module's use of `insurance/valuation-engine.ts` must be resolved before Vehicle Passport implementation begins. |

### 2.6 Asset Passport Module (Epic 4 — Designed)

| Dimension | Assessment |
|---|---|
| **Services to be Consumed** | Asset Registry, Engineering Module (inspection data), Document Intelligence, Report Renderer |
| **Services to be Exposed** | Asset passport retrieval, asset inspection history, asset risk profile |
| **Entities to be Owned** | `assetRegistry` (co-owned with Engineering), `vehicle_passport_snapshots` (shared with Vehicle Passport) |
| **Entities to be Read** | `inspections`, `physicalMeasurements`, `engineerObservations`, `claimDocuments`, `maintenanceRecords` |
| **Capability Duplication Risk** | Low |
| **Governance Concerns** | None identified in design |

### 2.7 Cross-Module Intelligence Module (Epic 4 — Designed)

| Dimension | Assessment |
|---|---|
| **Services to be Consumed** | Cross-Claim Intelligence, Fraud Intelligence Engine, Vehicle Registry, Driver Registry |
| **Services to be Exposed** | Signal propagation, entity relationship mapping, cross-module fraud correlation |
| **Entities to be Owned** | None (read-only aggregation layer) |
| **Entities to be Read** | `crossClaimSignals`, `fraudAlerts`, `fraudIndicators`, `vehicleRegistry`, `drivers`, `claims` |
| **Capability Duplication Risk** | Low — correctly designed as a read-only aggregation layer |
| **Governance Concerns** | None identified in design |

### 2.8 Portfolio Intelligence Module (Epic 4 — Designed)

| Dimension | Assessment |
|---|---|
| **Services to be Consumed** | Fraud Intelligence Engine, Cost Estimation Engine, Vehicle Valuation Service, Report Renderer, Cross-Claim Intelligence |
| **Services to be Exposed** | Five-dimension portfolio analysis (Exposure, Fraud, Operations, Financial, Risk Concentration) |
| **Entities to be Owned** | None (read-only aggregation) |
| **Entities to be Read** | `claims`, `aiAssessments`, `crossClaimSignals`, `vehicleMarketValuations`, `panelBeaterQuotes`, `insurancePolicies` |
| **Capability Duplication Risk** | Low |
| **Governance Concerns** | None identified in design |

### 2.9 Executive Dashboards Module (Epic 4 — Designed)

| Dimension | Assessment |
|---|---|
| **Services to be Consumed** | Report Renderer, all analytics routers, Fraud Intelligence Engine, Workflow Engine (for state distribution queries) |
| **Services to be Exposed** | Six role-differentiated dashboards (Platform, Insurer, Claims Manager, Risk Manager, Fleet Manager, Engineer) |
| **Entities to be Owned** | None (read-only aggregation) |
| **Entities to be Read** | Broad read across all domain tables |
| **Capability Duplication Risk** | Low — the existing `executive` router already provides the foundation |
| **Governance Concerns** | None identified in design |

### 2.10 Predictive Analytics Module (Epic 4 — Designed)

| Dimension | Assessment |
|---|---|
| **Services to be Consumed** | Fraud Intelligence Engine, Vehicle Valuation Service, Cross-Claim Intelligence, Physics Engine (for validation rate trends) |
| **Services to be Exposed** | Four deterministic scoring models (Vehicle Renewal Risk, Driver Fraud Propensity, Fleet Risk Trajectory, Portfolio Loss Forecast) |
| **Entities to be Owned** | `predictive_risk_scores` (new, time-series scores) |
| **Entities to be Read** | `vehicleRegistry`, `drivers`, `fleets`, `crossClaimSignals`, `vehicleMarketValuations`, `claims` |
| **Capability Duplication Risk** | Low — models are deterministic and additive |
| **Governance Concerns** | P-09 (AI is Advisory) — the TDS correctly specifies that all predictive scores are advisory and include confidence intervals |

---

## 3. Platform Service Audit

### 3.1 Service Reuse Assessment

The following table summarises the reuse assessment for each registered platform service:

| Service | Registry ID | Consumer Count | Coupling Assessment | Generalisation Status |
|---|---|---|---|---|
| Workflow Engine | SR-01 | 8 direct consumers | Correctly decoupled — consumed by Claims, Fast-Track, Claim Completion, Engineering | Already general |
| AI Pipeline Orchestrator | SR-02 | 1 direct consumer (Claims) | Tightly coupled to Claims domain | Partially generalisable — see §3.3 |
| Physics Engine | SR-03 | 2 consumers (Orchestrator, Engineering) | Appropriately scoped | Already general |
| Speed Inference Ensemble | SR-04 | 1 consumer (Orchestrator) | Tightly coupled to pipeline | Appropriate — physics-specific |
| Cross-Stage Reconciliation | SR-05 | 2 consumers (Orchestrator, Engineering) | Correctly shared | Already general |
| Image Intelligence | SR-06 | 1 consumer (Orchestrator) | Tightly coupled to pipeline | Generalisable for Asset Passport |
| Photo Forensics | SR-07 | 1 consumer (Orchestrator) | Tightly coupled to pipeline | Generalisable for Fleet |
| Fraud Intelligence Engine | SR-08 | 3 consumers (Orchestrator, Cross-Claim, Fast-Track) | Well distributed | Already general |
| Cost Estimation Engine | SR-09 | 2 consumers (Orchestrator, Quote AI) | Appropriately shared | Already general |
| Repair Intelligence Service | SR-10 | 3 consumers (Orchestrator, Quote Intelligence, Repair-Replace) | Well distributed | Already general |
| Vehicle Valuation Service | SR-11 | 2 implementations (see §3.2) | **CONCERN** | Already general — consolidation needed |
| Vehicle Registry | SR-12 | 4 consumers (Claims, Fleet, Agency, Engineering) | Well distributed | Already general |
| Driver Registry | SR-13 | 3 consumers (Claims, Fleet, Cross-Claim) | Well distributed | Already general |
| Cross-Claim Intelligence | SR-14 | 2 consumers (Claims, Fleet) | Well distributed | Already general |
| Document Intelligence | SR-15 | 3 consumers (Claims, Engineering, Agency) | Well distributed | Already general |
| Report Renderer | SR-16 | 8 report files | Correctly centralised | Already general |
| Assignment Engine | SR-17 | 2 consumers (Claims, Engineering) | Appropriately shared | Generalisable for Fleet |
| Asset Registry | SR-22 | 2 consumers (Engineering, Asset Passport) | Appropriately scoped | Already general |
| FEL Registry | SR-20 | 1 consumer (Orchestrator) | Tightly coupled to pipeline | Appropriate — pipeline-specific |
| IFE | SR-21 | 2 consumers (Orchestrator, Exception Intelligence) | Appropriately shared | Generalisable for Portfolio |
| DOE | SR-23 | 1 consumer (Orchestrator via Stage 9) | Tightly coupled to pipeline | Appropriate — decision-specific |
| Decision Transparency | SR-24 | 2 consumers (Orchestrator, Decision Router) | Appropriately shared | Already general |

### 3.2 Vehicle Valuation Duplication — Material Finding

The platform has two vehicle valuation implementations:

1. **`server/services/vehicleValuation.ts`** (421 lines) — The registered canonical service (SR-11). Consumed by the AI Pipeline Orchestrator.
2. **`server/insurance/valuation-engine.ts`** (347 lines) — An unregistered parallel implementation. Consumed by the Agency module, the reporting layer (`vehicleValuationReport.ts`), and a public procedure in `routers.ts` (`getVehicleValuation`).

Both implementations query the same `vehicleMarketValuations` table and apply similar depreciation logic. The parallel implementation was introduced during Epic 2 to serve the Agency module's valuation needs and was not subsequently consolidated into the registered service.

This finding is classified as a **P-06 violation (No Duplicate Valuation Logic)** at the MAJOR level. The consequence is that the Agency module's valuations and the pipeline's valuations may diverge if either implementation is updated independently. The Vehicle Passport module (Epic 4) depends on a single authoritative valuation source — this must be resolved before Vehicle Passport implementation begins.

**Recommended resolution:** Consolidate `insurance/valuation-engine.ts` into `services/vehicleValuation.ts` by adding the Agency-specific query patterns as new exported functions. Update all consumers to import from the canonical service. Register the resolution in the ADR Library as an amendment to ADR-010.

### 3.3 AI Pipeline Orchestrator Coupling Assessment

The AI Pipeline Orchestrator (`pipeline-v2/orchestrator.ts`) is consumed exclusively by the Claims module. This is architecturally appropriate for Epics 1–3, where the pipeline was designed specifically for motor claims assessment. However, the Epic 4 TDS introduces the Asset Passport and Engineering Intelligence modules, which may benefit from partial pipeline execution (e.g., image classification without physics validation).

The current pipeline architecture supports selective stage execution via the `StageConfig` parameter. The Review Board recommends that the Epic 4 implementation document which pipeline stages are applicable to non-claims contexts and expose a `runPartialPipeline()` function that accepts a stage selection mask. This would generalise the orchestrator without modifying its core logic.

### 3.4 Services That Are Correctly Tightly Coupled

The following services are tightly coupled to specific pipeline stages and this coupling is architecturally appropriate:

- **Speed Inference Ensemble (SR-04):** Physics-specific; only meaningful in the context of vehicle impact analysis.
- **FEL Registry (SR-20):** Pipeline-specific; records AI execution metadata that is only produced during pipeline runs.
- **DOE (SR-23):** Decision-specific; operates on the output of Stage 9 cost analysis and is not applicable outside that context.

These services should not be generalised. Their tight coupling is a design feature, not a deficiency.

---

## 4. Database Architecture Review

### 4.1 Schema Overview

The KINGA database schema contains **188 tables** across the following functional domains:

| Domain | Table Count | Notes |
|---|---|---|
| Claims & Assessment | 28 | Core claims lifecycle, AI assessments, confidence scores |
| Workflow & Governance | 12 | Workflow states, audit trails, governance logs |
| Vehicle & Asset Intelligence | 11 | Vehicle registry, damage history, geometry, landmarks |
| Fleet Management | 8 | Fleet accounts, vehicles, drivers, risk scores |
| Insurance & Policy | 10 | Policies, products, carriers, quotes |
| Reporting & Snapshots | 7 | PDF reports, snapshots, links, access audit |
| Fraud & Risk | 8 | Fraud alerts, indicators, rules, cross-claim signals |
| Repair & Cost Intelligence | 12 | Repair history, parts pricing, benchmarks, learning records |
| Engineering & Inspection | 9 | Inspections, measurements, observations, physics records |
| Agency & Marketplace | 8 | Agency documents, marketplace profiles, transactions |
| Platform & Tenancy | 15 | Tenants, users, roles, invitations, governance limits |
| Audit & Logging | 32 | Multiple audit log tables — see §4.2 |
| ML & Training | 10 | Training datasets, model versions, federated learning |
| Other | 18 | Recovery, notifications, policy simulation, etc. |

### 4.2 Audit Log Fragmentation — Observation

The schema contains **32 tables** that serve audit, logging, or history purposes. This is the most significant structural observation in the database review. The tables include:

`accessDenialLog`, `aiPredictionLogs`, `anonymizationAuditLog`, `auditLogs`, `auditTrail`, `automationAuditLog`, `fastTrackRoutingLog`, `fleetAuditLogs`, `governanceAuditLog`, `governanceViolationLog`, `insuranceAuditLogs`, `isoAuditLogs`, `modelTrainingAuditLog`, `partsPricingAuditLog`, `reportAccessAudit`, `roleAssignmentAudit`, `routingHistory`, `superAuditSessions`, `weightAdjustmentLog`, `workflowAuditTrail`, `vehicleHistory`, `vehicleDamageHistory`, `vehicleMileageLogs`, `repairHistory`, `replayLogs`, `costLearningRecords`, `recoveryCorrespondenceLog`, `physicsValidationRecords`, `claimantHistory`, `commissionRecords`, `finalApprovalRecords`, `trainingRecords`

The fragmentation is understandable — each domain introduced its own audit table as it was built. The consequence is that a cross-domain audit query (e.g., "show all actions taken on claim X by user Y") requires joining multiple tables. The `superAuditSessions` table and the `super-audit` router partially address this by providing a unified query interface, but the underlying fragmentation remains.

This is not a blocking concern for Epic 4, but it represents technical debt that should be addressed in a future schema consolidation sprint. The recommended approach is to introduce a unified `platform_audit_events` table with a `domain`, `entity_type`, `entity_id`, `action`, `actor_id`, and `metadata` structure, and migrate domain-specific audit tables to write to this unified table while maintaining their own tables for domain-specific queries.

### 4.3 Report Table Proliferation — Observation

The schema contains four tables that store report-related data:

| Table | Purpose | Concern |
|---|---|---|
| `pdfReports` | Stores S3 URLs for generated PDF files, linked to `reportSnapshots` | Correct — stores file metadata |
| `reportSnapshots` | Stores immutable intelligence data snapshots with audit hash | Correct — stores versioned intelligence |
| `generatedReports` | Stores report metadata with `reportType` enum and S3 key | **Overlaps with `pdfReports`** |
| `reportLinks` | Stores access tokens and interactive URLs for report sharing | Correct — stores access control |

The `generatedReports` table partially overlaps with `pdfReports` — both store S3 keys and tenant IDs for generated reports. The `generatedReports` table uses a different `reportType` enum (8 values) than the `reportSnapshots` table (3 values: insurer/assessor/regulatory), creating an inconsistency in how report types are classified across the schema.

**Recommended resolution:** Consolidate `generatedReports` into `pdfReports` by adding the `reportType` and `claimId` columns to `pdfReports`. This eliminates the overlap while preserving all functionality. This is a low-risk schema change suitable for a targeted migration sprint.

### 4.4 Vehicle Table Observations

The schema contains 11 vehicle-related tables. The following relationships are noted:

- `vehicleRegistry` — canonical vehicle identity records (SR-12)
- `fleetVehicles` — fleet membership records (links `vehicleRegistry` to `fleets`)
- `thirdPartyVehicles` — third-party vehicle records from claims (not linked to `vehicleRegistry`)
- `vehicleHistory` — historical vehicle state records
- `vehicleDamageHistory` — damage event records
- `vehicleMileageLogs` — mileage tracking records
- `vehicleMarketValuations` — market valuation records
- `vehicleConditionAssessment` — condition assessment records
- `vehicleModels` — vehicle model reference data
- `vehicleGeometryMeasurements` — engineering geometry measurements
- `vehicleLandmarks` — engineering landmark reference data

The `thirdPartyVehicles` table is not linked to `vehicleRegistry`. This means that third-party vehicles involved in claims are not enriched with registry intelligence and do not appear in cross-claim analysis. The Epic 4 Vehicle Passport design should address this by adding a `vehicleRegistryId` nullable FK to `thirdPartyVehicles` and a matching process that attempts to link third-party vehicles to registry records via registration number.

### 4.5 Workflow Table Assessment

The six workflow-related tables are well-structured:

- `workflowStates` — current state per claim (canonical)
- `workflowAuditTrail` — immutable state transition log
- `workflowConfiguration` — tenant-level workflow configuration
- `tenantWorkflowConfigs` — tenant workflow customisation (overlaps with `workflowConfiguration`)
- `workflowTemplates` — reusable workflow templates
- `approvalWorkflow` — approval step tracking

The overlap between `workflowConfiguration` and `tenantWorkflowConfigs` should be investigated. If they serve the same purpose, one should be deprecated.

### 4.6 Normalisation Opportunities

The following normalisation opportunities are identified, in order of priority:

1. **Audit log consolidation** — 32 audit tables → 1 unified `platform_audit_events` + domain-specific views (Priority: Medium)
2. **Report table consolidation** — `generatedReports` merged into `pdfReports` (Priority: Low)
3. **Third-party vehicle linking** — `thirdPartyVehicles.vehicleRegistryId` FK (Priority: Medium — required for Epic 4 Vehicle Passport)
4. **Workflow configuration deduplication** — `workflowConfiguration` vs `tenantWorkflowConfigs` (Priority: Low)

---

## 5. API Architecture Review

### 5.1 Router Registration Consistency

The `appRouter` in `server/routers.ts` registers **47 sub-routers** plus the inline `claims`, `assessors`, `panelBeaters`, `auth`, `insurers`, and `integrity` routers. The total procedure count is approximately 850+ across all routers.

The router registration follows a consistent pattern — each sub-router is imported and registered with a camelCase namespace key. The naming conventions are generally consistent, with the following observations:

| Pattern | Examples | Assessment |
|---|---|---|
| Domain noun | `agency`, `fleet`, `inspections`, `marketplace` | Consistent |
| Domain noun + qualifier | `agencyBroker`, `fleetAccounts`, `claimsManager` | Consistent |
| Capability noun | `analytics`, `compliance`, `governance`, `audit` | Consistent |
| Compound capability | `crossClaim`, `vehicleStructural`, `pipelineObservability` | Consistent |
| Inconsistency: `integrity` is inline, not a sub-router | `integrityRouter` defined in `routers.ts` | Minor — should be extracted |

### 5.2 Authorisation Consistency

The platform uses four procedure types for authorisation:

| Procedure Type | Usage | Assessment |
|---|---|---|
| `publicProcedure` | Public endpoints (login URL, vehicle valuation public query) | Correctly scoped |
| `protectedProcedure` | Authenticated endpoints without domain restriction | Correctly scoped |
| `insurerDomainProcedure` | Insurer-domain endpoints | Correctly scoped |
| `agencyDomainProcedure` | Agency-domain endpoints | Correctly scoped |
| `engineerDomainProcedure` | Engineering-domain endpoints | Correctly scoped |

The domain middleware pattern is well-implemented. Each domain procedure validates both authentication and domain membership before allowing access.

**Observation:** The `cross-claim-intelligence` router accepts `input.tenantId` as an optional filter parameter, which is appropriate for `platform_super_admin` cross-tenant queries. However, the guard logic `if (input.tenantId)` means that a non-admin user who omits `tenantId` will receive cross-tenant data. This is a **P-16 partial compliance concern** — the router should explicitly default to `ctx.user.tenantId` when `input.tenantId` is not provided, rather than returning unfiltered results.

### 5.3 Versioning Readiness

The current API architecture does not include version prefixes (e.g., `/api/v1/trpc`). The tRPC router path is `/api/trpc`. This is appropriate for a single-version platform but will require a versioning strategy before the platform exposes its API to external consumers (e.g., third-party integrations, mobile applications).

The Epic 4 TDS does not introduce external API consumers, so versioning is not a blocking concern for Epic 4. It is recommended as a pre-Epic 5 architectural decision.

### 5.4 The `integrity` Router

The `integrityRouter` is defined inline in `server/routers.ts` rather than as a separate file in `server/routers/`. This was the subject of Fix 1 in the Platform Readiness Remediation Sprint (SQL injection fix). The router should be extracted to `server/routers/integrity.ts` to comply with the platform's file organisation conventions. This is a housekeeping item, not a functional concern.

---

## 6. Reporting Architecture Review

### 6.1 Report Renderer Compliance

All report generation functions in the `server/reporting/` directory use `buildKingaHtml()` from `server/reporting/templates/kingaDesignSystem.ts`. The compliance is complete:

| Report File | Uses `buildKingaHtml` | Assessment |
|---|---|---|
| `claimsIntelligenceReport.ts` | ✅ | Compliant |
| `engineerInspectionReport.ts` | ✅ | Compliant |
| `forensicDecisionReport.ts` | ✅ | Compliant |
| `riskSurveyReport.ts` | ✅ | Compliant |
| `vehicleValuationReport.ts` | ✅ | Compliant |
| `vehicleVerificationReport.ts` | ✅ | Compliant |
| `reportDefinitions.ts` (all cases) | ✅ (delegates to above) | Compliant |

P-18 (Reports are Rendered Once) is **FULLY COMPLIANT**.

### 6.2 Report Key Consistency

The `REPORT_ACCESS` map in `reportDefinitions.ts` defines 27 report keys across 8 domains:

| Domain | Report Keys | Access Roles |
|---|---|---|
| `claim.*` | 6 keys | insurer_admin, claims_manager, assessor, admin |
| `portfolio.*` | 5 keys | insurer_admin, risk_manager, claims_manager |
| `executive.*` | 7 keys | insurer_admin, platform_super_admin, admin |
| `governance.*` | 3 keys | platform_super_admin, admin |
| `assessor.*` | 2 keys | assessor, insurer_admin |
| `panel_beater.*` | 2 keys | panel_beater, insurer_admin |
| `recovery.*` | 3 keys | insurer_admin, recovery_officer, claims_manager |
| `agency.*` | 2 keys | agency |
| `engineer.*` | 2 keys | engineer, admin, insurer_admin, platform_super_admin |

The naming convention is consistent: `domain.report_type` in snake_case. The access roles are consistently defined using values from `shared/roles.ts`.

### 6.3 Duplicate Report Logic Assessment

No duplicate report logic was detected. Each report type has a single generation function. The `risk_manager_portfolio` key is an alias for `generateFraudSummaryReport()` — this is a deliberate design decision (risk managers see the fraud/risk portfolio view) and is not a duplication concern.

### 6.4 Report Queue Architecture

The `reportQueue.ts` implements an asynchronous report generation queue backed by the `pdfReports` table. This is a sound architectural pattern that prevents report generation from blocking API responses. The queue correctly uses S3 for PDF storage and records download events in `reportAccessAudit`.

---

## 7. Governance Compliance Assessment

The following table provides the Review Board's compliance finding for each of the 20 principles in the Platform Governance Standard v1.0.

| # | Principle | Finding | Justification |
|---|---|---|---|
| P-01 | Intelligence Belongs to the Platform | **COMPLIANT** | All intelligence is stored in canonical tables (`crossClaimSignals`, `claimConfidenceScores`, `vehicleMarketValuations`, `fraudAlerts`). No module-private intelligence tables detected. |
| P-02 | Modules Orchestrate Intelligence | **COMPLIANT** | All domain modules delegate intelligence production to platform services. The Engineering module's use of `reconcileEngineerMeasurements()` is a correct application. |
| P-03 | Reuse Before Create | **PARTIALLY COMPLIANT** | The `insurance/valuation-engine.ts` was created without consolidating into `services/vehicleValuation.ts`. This is the only identified instance of creating a new service when an existing service could have been extended. |
| P-04 | No Duplicate Engines | **COMPLIANT** | No duplicate engines detected for the 12 registered engines. The valuation concern (P-06) involves a service, not an engine. |
| P-05 | No Duplicate Workflows | **COMPLIANT** | All claim state transitions route through `WorkflowEngine.transition()`. The `workflow-middleware.ts` provides an additional guard layer. The deprecated `transitionWorkflowState()` function is no longer called. |
| P-06 | No Duplicate Valuation Logic | **PARTIALLY COMPLIANT** | Two valuation implementations exist: `services/vehicleValuation.ts` (registered) and `insurance/valuation-engine.ts` (unregistered). Both query the same `vehicleMarketValuations` table. Consolidation is required before Epic 4 implementation. |
| P-07 | No Duplicate Fraud Logic | **COMPLIANT** | All fraud scoring routes through `fraud-scoring.ts` and `cross-claim-intelligence.ts`. No custom fraud heuristics detected in module procedures. |
| P-08 | Physics Engine Immutability | **COMPLIANT** | No modifications to `stage-7-physics.ts` or `physicsNumericalContract.ts` detected outside the original Epic 2 implementation. The physics engine is treated as immutable in practice. |
| P-09 | AI is Advisory | **COMPLIANT** | All AI outputs include confidence scores. The `automationPolicies` table governs auto-approval thresholds. The FEL records all pipeline executions. Human override pathways exist for all claim categories. |
| P-10 | Every Inspection is Asset-Centric | **COMPLIANT** | All `inspections` records have an `assetRef` column. The `inspection_id` FK on `claim_documents` was added during the Remediation Sprint. |
| P-11 | Regression Tests are Non-Negotiable | **COMPLIANT** | 8,316 tests passing across 273 test files. The Remediation Sprint fixed two test failures and added the `server/scripts/**` exclusion. No new `@ts-nocheck` annotations added. |
| P-12 | Platform Assets are Shared | **COMPLIANT** | Vehicle Registry, Driver Registry, and Platform Roles are correctly shared. `shared/roles.ts` is the single source of truth for role constants following Fix 4. |
| P-13 | Evidence Must Preserve Provenance | **COMPLIANT** | All `claimDocuments` records include `uploadedBy`, `uploadedAt`, and `sourceClaimId`. The `inspection_id` FK was added in the Remediation Sprint. Evidence is stored in S3 via `storagePut()`. |
| P-14 | Every New Table Requires Justification | **PARTIALLY COMPLIANT** | The principle was ratified on 31 July 2026. Pre-existing tables (including the audit log fragmentation) were created before this standard. Going forward, the principle is enforceable. |
| P-15 | Every Epic Requires an Architecture Review | **COMPLIANT** | Epic 4 TDS was produced before implementation. Epics 1–3 had Architecture Freeze Reports. The ADR Library documents the architectural decisions. |
| P-16 | Tenant Isolation is Absolute | **PARTIALLY COMPLIANT** | The `cross-claim-intelligence` router accepts `input.tenantId` without defaulting to `ctx.user.tenantId` when the parameter is omitted. This creates a potential cross-tenant data exposure for non-admin users who omit the parameter. All other routers correctly use `ctx.user.tenantId`. |
| P-17 | Roles are Centralised | **COMPLIANT** | `shared/roles.ts` is the single source of truth following Fix 4. No other role constant definitions detected. |
| P-18 | Reports are Rendered Once | **COMPLIANT** | All report generation functions use `buildKingaHtml()` from the KINGA Design System. No alternative PDF generation libraries detected. |
| P-19 | Governance Violations are Logged | **COMPLIANT** | The `governanceViolationLog` table exists. The `workflow-middleware.ts` throws errors rather than silently suppressing violations. The `governance` router provides violation query capabilities. |
| P-20 | The FEL is Inviolable | **COMPLIANT** | The FEL is written by `forensicExecutionLedger.ts` exclusively. No `UPDATE` operations on FEL records detected. All pipeline executions write a FEL entry before returning results. |

**Summary:** 15 COMPLIANT, 4 PARTIALLY COMPLIANT, 0 NON-COMPLIANT.

The four PARTIALLY COMPLIANT findings are:
- **P-03 / P-06:** Valuation duplication (`insurance/valuation-engine.ts`) — requires consolidation before Epic 4
- **P-14:** Pre-existing tables created before the Governance Standard was ratified — not retroactively enforceable
- **P-16:** Cross-claim intelligence router tenant isolation gap — requires a targeted fix

---

## 8. Dependency Diagrams

### 8.1 Platform Services → Domain Modules

```
PLATFORM SERVICES LAYER
═══════════════════════════════════════════════════════════════════════════

  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────────────┐
  │  Workflow Engine │  │  AI Pipeline     │  │  Fraud Intelligence     │
  │  (SR-01)        │  │  Orchestrator    │  │  Engine (SR-08)         │
  │  workflow-      │  │  (SR-02)         │  │  fraud-scoring.ts +     │
  │  engine.ts      │  │  orchestrator.ts │  │  cross-claim-intel.ts   │
  └────────┬────────┘  └────────┬─────────┘  └───────────┬─────────────┘
           │                   │                          │
  ┌────────┴────────┐  ┌────────┴─────────┐  ┌───────────┴─────────────┐
  │  Physics Engine │  │  Vehicle         │  │  Cost Estimation        │
  │  (SR-03)        │  │  Valuation (SR-11│  │  Engine (SR-09)         │
  │  stage-7-       │  │  vehicleValuation│  │  cost-optimization.ts   │
  │  physics.ts     │  │  .ts ⚠ dual impl │  │                         │
  └────────┬────────┘  └────────┬─────────┘  └───────────┬─────────────┘
           │                   │                          │
  ┌────────┴────────┐  ┌────────┴─────────┐  ┌───────────┴─────────────┐
  │  Vehicle        │  │  Driver Registry │  │  Report Renderer        │
  │  Registry(SR-12)│  │  (SR-13)         │  │  (SR-16)                │
  │  vehicle-       │  │  driver-         │  │  pdfRenderer.ts +       │
  │  registry.ts    │  │  registry.ts     │  │  kingaDesignSystem.ts   │
  └────────┬────────┘  └────────┬─────────┘  └───────────┬─────────────┘
           │                   │                          │
           └──────────┬────────┘                          │
                      │                                   │
DOMAIN MODULES LAYER  │                                   │
═══════════════════════════════════════════════════════════════════════════

  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │    CLAIMS    │  │    AGENCY    │  │  ENGINEERING │  │    FLEET     │
  │              │  │              │  │              │  │              │
  │ ●SR-01       │  │ ●SR-11⚠     │  │ ●SR-03       │  │ ●SR-01       │
  │ ●SR-02       │  │ ●SR-12       │  │ ●SR-05       │  │ ●SR-12       │
  │ ●SR-03       │  │ ●SR-16       │  │ ●SR-17       │  │ ●SR-13       │
  │ ●SR-08       │  │              │  │ ●SR-15       │  │ ●SR-08       │
  │ ●SR-09       │  │              │  │              │  │ ●SR-16       │
  │ ●SR-11       │  │              │  │              │  │              │
  │ ●SR-12       │  │              │  │              │  │              │
  │ ●SR-13       │  │              │  │              │  │              │
  │ ●SR-14       │  │              │  │              │  │              │
  │ ●SR-15       │  │              │  │              │  │              │
  │ ●SR-16       │  │              │  │              │  │              │
  │ ●SR-20       │  │              │  │              │  │              │
  │ ●SR-21       │  │              │  │              │  │              │
  │ ●SR-23       │  │              │  │              │  │              │
  │ ●SR-24       │  │              │  │              │  │              │
  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘

  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │  VEHICLE     │  │    ASSET     │  │ CROSS-MODULE │  │  PORTFOLIO   │
  │  PASSPORT    │  │  PASSPORT    │  │ INTELLIGENCE │  │ INTELLIGENCE │
  │  (Epic 4)    │  │  (Epic 4)    │  │  (Epic 4)    │  │  (Epic 4)    │
  │              │  │              │  │              │  │              │
  │ ○SR-11       │  │ ○SR-22       │  │ ○SR-14       │  │ ○SR-08       │
  │ ○SR-12       │  │ ○SR-15       │  │ ○SR-08       │  │ ○SR-09       │
  │ ○SR-14       │  │ ○SR-16       │  │ ○SR-12       │  │ ○SR-11       │
  │ ○SR-08       │  │              │  │ ○SR-13       │  │ ○SR-14       │
  │ ○SR-10       │  │              │  │              │  │ ○SR-16       │
  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘

  ● = Currently implemented    ○ = Designed (Epic 4)    ⚠ = Concern

REPORTS LAYER
═══════════════════════════════════════════════════════════════════════════

  ┌──────────────────────────────────────────────────────────────────────┐
  │                    REPORT RENDERER (SR-16)                           │
  │                    pdfRenderer.ts + kingaDesignSystem.ts             │
  └──────┬──────────┬──────────┬──────────┬──────────┬──────────────────┘
         │          │          │          │          │
  ┌──────┴──┐ ┌─────┴──┐ ┌────┴───┐ ┌────┴──┐ ┌────┴──────────────────┐
  │ Claims  │ │ Agency │ │Engineer│ │ Fleet │ │ Executive / Portfolio  │
  │ Reports │ │ Reports│ │ Reports│ │Reports│ │ Reports                │
  │ (6 keys)│ │(2 keys)│ │(2 keys)│ │(TBD)  │ │ (7 keys)              │
  └─────────┘ └────────┘ └────────┘ └───────┘ └───────────────────────┘

DASHBOARDS LAYER
═══════════════════════════════════════════════════════════════════════════

  ┌──────────────────────────────────────────────────────────────────────┐
  │                    EXECUTIVE DASHBOARDS (Epic 4)                     │
  │          Platform | Insurer | Claims Mgr | Risk Mgr | Fleet | Eng   │
  └──────┬──────────┬──────────┬──────────┬──────────┬──────────────────┘
         │          │          │          │          │
  ┌──────┴──┐ ┌─────┴──┐ ┌────┴───┐ ┌────┴──┐ ┌────┴──────────────────┐
  │Portfolio│ │ Fleet  │ │ Pred.  │ │ Cross │ │ Vehicle / Asset       │
  │Intel.   │ │ Intel. │ │Analytic│ │Module │ │ Passports             │
  └─────────┘ └────────┘ └────────┘ └───────┘ └───────────────────────┘
```

---

## 9. Platform Health Assessment

### 9.1 Overall Platform Health Score: **81 / 100**

The score is computed across eight assessment dimensions:

| Dimension | Score | Weight | Weighted Score | Justification |
|---|---|---|---|---|
| Architectural Integrity | 85 | 20% | 17.0 | Strong foundational decisions; one material valuation duplication concern |
| Service Reuse | 78 | 15% | 11.7 | 28 of 29 services correctly reused; one parallel valuation implementation |
| Data Flow | 82 | 15% | 12.3 | Intelligence flows correctly through canonical tables; audit log fragmentation noted |
| Cross-Module Integration | 80 | 10% | 8.0 | Claims-centric today; Epic 4 will significantly improve cross-module integration |
| Platform Consistency | 88 | 10% | 8.8 | High consistency in naming, patterns, and design system usage |
| Governance Compliance | 83 | 15% | 12.5 | 15/20 COMPLIANT, 4/20 PARTIALLY COMPLIANT, 0/20 NON-COMPLIANT |
| Scalability | 75 | 10% | 7.5 | tRPC + MySQL architecture is sound; 188-table schema requires monitoring |
| Maintainability | 80 | 5% | 4.0 | 8,316 tests; 7 pre-existing TS errors; audit log fragmentation increases maintenance burden |
| **TOTAL** | | **100%** | **81.8 → 81** | |

### 9.2 Architecture Maturity Level

**Level 4 — Managed (out of 5)**

The platform demonstrates the characteristics of a Level 4 architecture:

- Architectural decisions are documented (ADR Library, TDS documents)
- Governance standards are defined and ratified (Platform Governance Standard v1.0)
- Service registry is maintained (Platform Service Registry v1.0)
- Test coverage is high (8,316 tests, 273 files)
- Regression testing is enforced
- Technical debt is tracked and actively reduced (Remediation Sprint)

The platform does not yet reach Level 5 (Optimising) because:
- The audit log fragmentation has not been addressed
- The valuation duplication has not been resolved
- API versioning is not yet in place
- The 7 pre-existing TypeScript errors remain unresolved

### 9.3 Scalability Assessment

**Rating: ADEQUATE for current scale; MONITOR for Epic 4 scale**

The platform's scalability characteristics are as follows:

**Strengths:**
- tRPC with Drizzle ORM provides type-safe, efficient database queries
- S3 for file storage eliminates database bloat
- Asynchronous report generation queue prevents blocking
- Tenant isolation is correctly implemented (with the one noted exception)
- The AI pipeline is stateless and can be parallelised

**Concerns:**
- The 188-table schema with 32 audit tables will produce increasingly complex cross-table queries as data volumes grow
- The `routers.ts` file at ~9,500 lines is approaching the maintenance boundary; the inline `claims` router should be extracted to `server/routers/claims.ts`
- The Epic 4 aggregation tables (`vehicle_passport_snapshots`, `fleet_intelligence_snapshots`) introduce snapshot invalidation complexity that must be managed carefully

**Recommendation:** Before Epic 4 implementation, extract the inline `claims` router from `routers.ts` to `server/routers/claims.ts`. This is a refactoring task with no functional impact but significant maintainability benefit.

### 9.4 Technical Debt Assessment

| Item | Severity | Effort | Priority |
|---|---|---|---|
| Valuation duplication (`insurance/valuation-engine.ts`) | High | Medium | P0 — before Epic 4 |
| Cross-claim intelligence tenant isolation gap | High | Low | P0 — immediate fix |
| `routers.ts` inline claims router extraction | Medium | Medium | P1 — before Epic 4 |
| `integrity` router extraction to `server/routers/integrity.ts` | Low | Low | P2 |
| Audit log fragmentation (32 tables) | Medium | High | P2 — dedicated sprint |
| Report table consolidation (`generatedReports` → `pdfReports`) | Low | Low | P3 |
| Workflow configuration deduplication | Low | Low | P3 |
| Third-party vehicle registry linking | Medium | Medium | P2 — required for Epic 4 Vehicle Passport |
| 7 pre-existing TypeScript errors in `pipeline-v2/` | Medium | Medium | P2 |
| `@ts-nocheck` annotations in legacy files | Low | High | P3 — ongoing |

### 9.5 Readiness for Epic 4 Implementation

**Assessment: READY WITH CONDITIONS**

The platform is ready for Epic 4 implementation subject to the following conditions being met before the Vehicle Passport wave begins:

1. **P0 — Valuation consolidation:** `insurance/valuation-engine.ts` must be consolidated into `services/vehicleValuation.ts`. The Vehicle Passport module depends on a single authoritative valuation source.

2. **P0 — Cross-claim tenant isolation fix:** The `cross-claim-intelligence` router must default to `ctx.user.tenantId` when `input.tenantId` is not provided. This is a targeted 3-line fix.

3. **P1 — Third-party vehicle registry linking:** Add `vehicleRegistryId` nullable FK to `thirdPartyVehicles` for the Vehicle Passport cross-claim intelligence feature.

The remaining Epic 4 waves (Asset Passport, Fleet Intelligence, Portfolio Intelligence, Executive Dashboards, Predictive Analytics) can proceed in parallel with the above conditions being met.

---

## 10. Recommended Improvements

### 10.1 Immediate Actions (Before Epic 4 Implementation)

**RI-01: Resolve Valuation Duplication**  
Consolidate `server/insurance/valuation-engine.ts` into `server/services/vehicleValuation.ts`. Add the Agency-specific query patterns (historical point-in-time valuation, condition-adjusted valuation) as new exported functions in the canonical service. Update all consumers (`agency.ts`, `vehicleValuationReport.ts`, `routers.ts getVehicleValuation`) to import from the canonical service. Register the consolidation in ADR-010.

**RI-02: Fix Cross-Claim Tenant Isolation**  
In `server/routers/cross-claim-intelligence.ts`, change the tenant filter logic to default to `ctx.user.tenantId` when `input.tenantId` is not provided, unless the user has `platform_super_admin` role. This is a 3-line targeted fix.

**RI-03: Add Third-Party Vehicle Registry Linking**  
Add `vehicleRegistryId` nullable FK column to `thirdPartyVehicles` table. Add a matching process that attempts to link third-party vehicles to registry records via registration number when a new third-party vehicle is created.

### 10.2 Near-Term Actions (During Epic 4 Implementation)

**RI-04: Extract Inline Claims Router**  
Extract the inline `claims` router from `server/routers.ts` (approximately lines 1111–4327) to `server/routers/claims.ts`. This reduces `routers.ts` from ~9,500 lines to ~6,300 lines and makes the claims router independently testable.

**RI-05: Extract Integrity Router**  
Extract `integrityRouter` from `server/routers.ts` to `server/routers/integrity.ts`. This is a minor housekeeping item consistent with the platform's file organisation conventions.

**RI-06: Register `insurance/valuation-engine.ts` Consumers in Service Registry**  
After consolidation (RI-01), update the Platform Service Registry to reflect that SR-11 now serves both the pipeline and the Agency module. Update the consumer count and consumer list accordingly.

### 10.3 Medium-Term Actions (Post-Epic 4)

**RI-07: Audit Log Consolidation Sprint**  
Design and implement a unified `platform_audit_events` table. Migrate domain-specific audit tables to write to this unified table while maintaining their own tables for domain-specific queries. Implement a cross-domain audit query interface in the `super-audit` router.

**RI-08: Report Table Consolidation**  
Consolidate `generatedReports` into `pdfReports` by adding `reportType` and `claimId` columns to `pdfReports`. Migrate existing `generatedReports` data. Update all consumers.

**RI-09: Resolve Pre-Existing TypeScript Errors**  
Address the 7 pre-existing TypeScript errors in `pipeline-v2/orchestrator.ts`, `speedInferenceEnsemble.ts`, `stage-4-validation.ts`, `stage-7-physics.ts`, `workflow-queries.ts`, and `stuck-assessment-recovery-job.ts`. These errors indicate type safety gaps in the most critical parts of the platform.

**RI-10: API Versioning Strategy**  
Before Epic 5, define and implement an API versioning strategy. The recommended approach is to add a version prefix to the tRPC base path (`/api/v1/trpc`) and implement a version negotiation middleware that routes requests to the appropriate router version.

---

## Appendix A — Governance Compliance Summary

| Principle | Finding | Severity |
|---|---|---|
| P-01 Intelligence Belongs to the Platform | COMPLIANT | — |
| P-02 Modules Orchestrate Intelligence | COMPLIANT | — |
| P-03 Reuse Before Create | PARTIALLY COMPLIANT | Medium |
| P-04 No Duplicate Engines | COMPLIANT | — |
| P-05 No Duplicate Workflows | COMPLIANT | — |
| P-06 No Duplicate Valuation Logic | PARTIALLY COMPLIANT | High |
| P-07 No Duplicate Fraud Logic | COMPLIANT | — |
| P-08 Physics Engine Immutability | COMPLIANT | — |
| P-09 AI is Advisory | COMPLIANT | — |
| P-10 Every Inspection is Asset-Centric | COMPLIANT | — |
| P-11 Regression Tests are Non-Negotiable | COMPLIANT | — |
| P-12 Platform Assets are Shared | COMPLIANT | — |
| P-13 Evidence Must Preserve Provenance | COMPLIANT | — |
| P-14 Every New Table Requires Justification | PARTIALLY COMPLIANT | Low (pre-standard) |
| P-15 Every Epic Requires an Architecture Review | COMPLIANT | — |
| P-16 Tenant Isolation is Absolute | PARTIALLY COMPLIANT | High |
| P-17 Roles are Centralised | COMPLIANT | — |
| P-18 Reports are Rendered Once | COMPLIANT | — |
| P-19 Governance Violations are Logged | COMPLIANT | — |
| P-20 The FEL is Inviolable | COMPLIANT | — |

**Score: 15 COMPLIANT / 4 PARTIALLY COMPLIANT / 0 NON-COMPLIANT**  
**Governance Compliance Rate: 75% fully compliant; 100% no critical violations**

---

## Appendix B — Platform Statistics

| Metric | Value |
|---|---|
| Total database tables | 188 |
| Total server TypeScript files | 466+ |
| Total test files | 273 |
| Total tests passing | 8,316 |
| Pre-existing TypeScript errors | 7 |
| Registered platform services | 29 |
| Registered report keys | 27 |
| Registered domain routers | 47+ |
| Governance principles | 20 |
| ADR entries | 14 |
| Epic TDS documents | 4 (Epics 1–4) |

---

*End of Document — KINGA Platform Validation Report v1.0*  
*Issued by the KINGA Enterprise Platform Review Board — 31 July 2026*
