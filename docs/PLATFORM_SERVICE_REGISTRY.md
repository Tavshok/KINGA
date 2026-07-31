# KINGA Platform Service Registry

**Document Class:** Platform Architecture — Authoritative Reference  
**Version:** 1.0.0  
**Platform Version:** KINGA v3.0.0  
**Date:** 2026-07-31  
**Status:** Official

---

## Purpose

This registry is the authoritative inventory of every reusable platform capability within the KINGA Motor Claims Intelligence Platform. It defines the contract, ownership, dependencies, and consumption profile for each service so that engineering teams can build on existing capabilities rather than reimplementing them, and so that architects can reason about the platform's capability surface at a glance.

The registry is organised into three parts:

1. **Service Registry** — full metadata for every platform service
2. **Platform Assets Catalogue** — a module-by-module consumption matrix
3. **Never-Duplicate List** — services that must never be independently reimplemented

---

## Part 1 — Service Registry

### SR-01 · Workflow Engine

| Field | Value |
|---|---|
| **Service Name** | Workflow Engine |
| **Source File** | `server/workflow-engine.ts` |
| **Purpose** | The single, authoritative state machine for all claim lifecycle transitions. Enforces RBAC, segregation-of-duties, tenant-specific configuration, and produces an immutable audit trail for every state change. No claim state may change outside this engine. |
| **Current Consumers** | `server/db.ts` (claim submission), `server/services/fast-track-dispatcher.ts`, `server/routers/claim-completion.ts`, `server/routers/approval.ts`, `server/routers/workflow.ts`, `server/test-helpers/workflow.ts` |
| **Future Consumers** | Recovery module, Fleet claim auto-settlement, Agency policy-bound claim initiation, Inspection workflow integration |
| **Input** | `TransitionRequest { claimId, fromState, toState, userId, userRole, decisionData?, aiSnapshot?, executiveOverride?, overrideReason? }` |
| **Output** | `TransitionResult { success, claimId, previousState, newState, auditId, warnings? }` |
| **Dependencies** | `drizzle/schema` (claims, workflowAuditTrail, claimInvolvementTracking, workflowConfiguration, aiAssessments), `server/rbac.ts` (WORKFLOW_TRANSITIONS, canTransitionTo), `server/workflow-migration.ts` |
| **Owner** | Platform Engineering |
| **Test Coverage** | 4 test files (`workflow-engine.test.ts`, `workflow-governance.test.ts`, `workflow-integration.test.ts`, `workflow.test.ts`) |
| **Version** | KINGA v3.0.0 |
| **Reusable** | Yes |
| **Claims-Specific** | Yes (motor claims lifecycle) |
| **Should Be Generalised** | Yes — the state machine pattern is domain-agnostic; the transition table and RBAC rules are the only claims-specific parts and could be injected as configuration |

---

### SR-02 · AI Pipeline Orchestrator

| Field | Value |
|---|---|
| **Service Name** | AI Pipeline Orchestrator |
| **Source File** | `server/pipeline-v2/orchestrator.ts` |
| **Purpose** | Wires all 10 pipeline stages (ingestion → extraction → structured extraction → validation → assembly → damage analysis → physics → fraud → cost → report) into a single self-healing execution graph. Never aborts — every stage either succeeds, degrades gracefully, or produces a default output. Collects assumptions and recovery actions from all stages for the final report. |
| **Current Consumers** | `server/db.ts` (primary entry point via `runPipelineV2`) |
| **Future Consumers** | Batch re-analysis service, Scheduled re-scoring job, Inspection pipeline variant |
| **Input** | `PipelineContext { claimId, tenantId, documents[], claimRecord, ... }` |
| **Output** | `PipelineResult { stages, summary, forensicAnalysisResult, claimTruth, ... }` |
| **Dependencies** | All 10 pipeline stage modules, `server/services/vehicleValuation.ts`, `server/db.ts`, `server/pipeline-v2/felVersionRegistry.ts`, `server/pipeline-v2/pipelineContractRegistry.ts`, `server/pipeline-v2/engineFallback.ts` |
| **Owner** | AI Engineering |
| **Test Coverage** | Covered indirectly via `wave3-integration.test.ts`, `wave4-integration.test.ts`, `test-claim-lifecycle.test.ts` |
| **Version** | KINGA-v2.0 (pipeline model version) |
| **Reusable** | Partially — the orchestration pattern is reusable; the stage wiring is claims-specific |
| **Claims-Specific** | Yes |
| **Should Be Generalised** | The stage-graph execution harness (timeout, fallback, assumption collection) should be extracted as a generic pipeline runner |

---

### SR-03 · Physics Engine

| Field | Value |
|---|---|
| **Service Name** | Physics Engine |
| **Source File** | `server/pipeline-v2/stage-7-physics.ts` (Stage 7), `server/pipeline-v2/stage-7-unified.ts` (unified runner), `server/pipeline-v2/physicsTruth.ts` (canonical output) |
| **Purpose** | Computes accident physics from vehicle data, damage analysis, and incident description. Derives speed estimates using six independent methods (Campbell stiffness, energy balance, airbag deployment, severity-anchored inference, VGR cross-image, ensemble consensus). Gated to collision and unknown incident types; skipped for theft, fire, flood, vandalism. Never halts — produces estimated output from damage data if the primary engine fails. |
| **Current Consumers** | `server/pipeline-v2/orchestrator.ts`, `server/pipeline-v2/stage-integrity.ts`, `server/pipeline-v2/stage-explainability.ts`, `server/pipeline-v2/stage-uncertainty.ts`, `server/pipeline-v2/damagePhysicsCoherence.ts`, `server/pipeline-v2/weightedFraudScoring.ts` |
| **Future Consumers** | Inspection physics cross-check, Telematics EDR integration (via evidence plugin registry) |
| **Input** | `ClaimRecord` + `Stage6Output` (damage analysis) + `PipelineContext` |
| **Output** | `Stage7Output` containing `PhysicsTruth { speedEstimateKmh, confidenceScore, methodsUsed[], evidenceAgreementPct, physicalImpossibilityFlag, ... }` |
| **Dependencies** | `server/pipeline-v2/speedInferenceEnsemble.ts`, `server/pipeline-v2/damagePatternValidationEngine.ts`, `server/pipeline-v2/vehiclePanelDimensions.ts`, `server/pipeline-v2/engineFallback.ts`, `server/pipeline-v2/physicsNumericalContract.ts` |
| **Owner** | AI Engineering |
| **Test Coverage** | `wave3-integration.test.ts`, `wave4-integration.test.ts`, `speedInferenceEnsemble.test.ts` (3 files) |
| **Version** | Stage code version `stage-7` per `felVersionRegistry.ts` |
| **Reusable** | Yes — physics computation is vehicle-domain-agnostic |
| **Claims-Specific** | No — applicable to any motor incident analysis domain |
| **Should Be Generalised** | Yes — extract as `@kinga/physics-engine` package for use in inspection, telematics, and fleet incident analysis |

---

### SR-04 · Speed Inference Ensemble

| Field | Value |
|---|---|
| **Service Name** | Speed Inference Ensemble |
| **Source File** | `server/pipeline-v2/speedInferenceEnsemble.ts` |
| **Purpose** | Computes a weighted consensus speed estimate from up to six independent measurement methods (M1 Campbell, M2 energy balance, M3 VGR, M4 airbag deployment, M5 EDR, M6 severity-anchored). Produces method disagreement scoring, uncertainty bounds, and a structured disagreement report when evidence conflicts. |
| **Current Consumers** | `server/pipeline-v2/stage-7-physics.ts` |
| **Future Consumers** | Telematics EDR integration, Inspection speed cross-check |
| **Input** | `SpeedEnsembleInput { methods: SpeedMethod[], vehicleData, damageData }` |
| **Output** | `SpeedEnsembleResult { consensusSpeedKmh, confidenceScore, evidenceAgreementPct, methodResults[], disagreementReport? }` |
| **Dependencies** | `server/pipeline-v2/physicsTruth.ts`, `server/pipeline-v2/vehiclePanelDimensions.ts` |
| **Owner** | AI Engineering |
| **Test Coverage** | 3 test files (`speedInferenceEnsemble.test.ts`, `wave3-integration.test.ts`, `wave4-integration.test.ts`) |
| **Version** | Stage code version per `felVersionRegistry.ts` |
| **Reusable** | Yes |
| **Claims-Specific** | No |
| **Should Be Generalised** | Yes — applicable to any multi-source speed estimation domain |

---

### SR-05 · Cross-Stage Reconciliation Engine

| Field | Value |
|---|---|
| **Service Name** | Cross-Stage Reconciliation Engine |
| **Source File** | `server/pipeline-v2/reconciliation-engine.ts` |
| **Purpose** | Arbitrates conflicts between pipeline stages when multiple stages produce values for the same field. Applies the rule: if a later stage has higher confidence, its value wins. Every reconciliation event is logged with rationale for the audit trail and report. Reconciles five fields: `estimatedSpeedKmh`, `fraudScore`, `damageSeverity`, `estimatedCostUsd`, `incidentType`. |
| **Current Consumers** | `server/pipeline-v2/orchestrator.ts` (reconciliation pass after Stage 9) |
| **Future Consumers** | Any future pipeline that produces multi-stage field estimates |
| **Input** | `ClaimRecord` + outputs from Stages 3, 5, 6, 7, 7b, 8, 9 |
| **Output** | `ReconciliationLog[]` — ordered list of `ReconciliationEvent { field, previousValue, previousSource, previousConfidence, adoptedValue, adoptedSource, adoptedConfidence, rationale, reconciledAt }` |
| **Dependencies** | `server/pipeline-v2/types.ts` |
| **Owner** | AI Engineering |
| **Test Coverage** | 0 dedicated test files (covered indirectly via integration tests) |
| **Version** | 1.0.0 |
| **Reusable** | Yes — the confidence-arbitration pattern is domain-agnostic |
| **Claims-Specific** | No |
| **Should Be Generalised** | Yes — extract as a generic `ConfidenceArbiter` utility |

---

### SR-06 · Image Intelligence (Semantic Image Classifier)

| Field | Value |
|---|---|
| **Service Name** | Image Intelligence / Semantic Image Classifier |
| **Source File** | `server/pipeline-v2/semanticImageClassifier.ts`, `server/pipeline-v2/stage-6-damage-analysis.ts` |
| **Purpose** | Classifies vehicle damage photographs using LLM vision. Identifies damaged components, damage type, location, severity, and impact direction. Normalises vision component names via `visionTermNormaliser`. Produces structured `Stage6Output` consumed by the Physics Engine and Fraud Engine. |
| **Current Consumers** | `server/pipeline-v2/orchestrator.ts` (Stage 6), `server/pipeline-v2/stage-7-physics.ts`, `server/pipeline-v2/stage-8-fraud.ts` |
| **Future Consumers** | Inspection photo analysis, Fleet damage assessment, Telematics photo correlation |
| **Input** | `Stage5Output` (assembled claim) + `PipelineContext` (image URLs) |
| **Output** | `Stage6Output { damagedParts[], impactDirection, damageSeverity, consistencyScore, enrichedPhotosJson }` |
| **Dependencies** | `server/_core/llm.ts`, `server/services/visionTermNormaliser.ts`, `server/pipeline-v2/pipelineContractRegistry.ts` |
| **Owner** | AI Engineering |
| **Test Coverage** | `wave3-integration.test.ts`, `wave4-integration.test.ts`, `services/photoEnrichment.test.ts` |
| **Version** | Stage code version per `felVersionRegistry.ts` |
| **Reusable** | Yes |
| **Claims-Specific** | No — applicable to any vehicle damage assessment domain |
| **Should Be Generalised** | Yes — extract as `@kinga/vision-damage-classifier` |

---

### SR-07 · Photo Forensics (Photo Enrichment)

| Field | Value |
|---|---|
| **Service Name** | Photo Forensics / Photo Enrichment |
| **Source File** | `server/services/photoEnrichment.ts`, `server/pipeline-v2/stage-6-damage-analysis.ts` |
| **Purpose** | Performs deep forensic analysis of damage photographs: blur detection, rotation correction, duplicate detection, metadata extraction, and quality scoring. Feeds enriched photo data into the damage analysis stage. Supports re-extraction triggered by assessors post-submission. |
| **Current Consumers** | `server/pipeline-v2/stage-6-damage-analysis.ts`, `server/routers/photo-reextraction.ts` |
| **Future Consumers** | Inspection photo quality gate, Fleet damage photo audit |
| **Input** | Image URLs from claim documents |
| **Output** | `EnrichedPhoto { qualityScore, blurScore, isDuplicate, rotationCorrected, extractedMetadata }[]` |
| **Dependencies** | `server/_core/llm.ts`, `server/pdf-image-extractor.ts`, `server/storage.ts` |
| **Owner** | AI Engineering |
| **Test Coverage** | `services/photoEnrichment.test.ts`, `services/photoEnrichmentAutoTrigger.test.ts` |
| **Version** | 1.0.0 |
| **Reusable** | Yes |
| **Claims-Specific** | No |
| **Should Be Generalised** | Yes — applicable to any photo-submission workflow |

---

### SR-08 · Fraud Intelligence Engine

| Field | Value |
|---|---|
| **Service Name** | Fraud Intelligence Engine |
| **Source File** | `server/fraud-scoring.ts` (10-indicator engine), `server/weighted-fraud-scoring.ts` (weighted deterministic layer), `server/pipeline-v2/stage-8-fraud.ts` (pipeline stage), `server/cross-claim-intelligence.ts` (cross-entity signals) |
| **Purpose** | A four-layer fraud detection system. Layer 1: 10-indicator LLM-based scoring (physicsMismatch, claimantDriverRisk, stagedAccident, panelBeaterPatterns, assessorIntegrity, crossEntityCollusion, documentPhotoIntegrity, costAnomalies, vehicleOwnershipRisk, claimTimingBehaviour). Layer 2: Weighted deterministic scoring with consistency fraud penalty (Stage 29). Layer 3: Cross-claim signal detection (9 signal types including staged_accident_signal, repairer_driver_collusion_signal). Layer 4: Scenario-based fraud engine for specific incident patterns. |
| **Current Consumers** | `server/pipeline-v2/orchestrator.ts` (Stage 8), `server/db.ts` (post-pipeline cross-claim), `server/pipeline-v2/decisionOptimisationEngine.ts` (fraud disqualification gate) |
| **Future Consumers** | Fleet fraud detection, Policy issuance fraud screen, Real-time intake fraud gate |
| **Input** | `ClaimRecord` + `Stage6Output` + `Stage7Output` + cross-claim history |
| **Output** | `FraudResult { score: 0–100, level: minimal|low|moderate|high|elevated, indicators[], signals[], explanation }` |
| **Dependencies** | `server/_core/llm.ts`, `server/services/consistencyFraudPenalty.ts`, `server/pipeline-v2/scenarioFraudEngine.ts`, `drizzle/schema` (crossClaimSignals) |
| **Owner** | AI Engineering |
| **Test Coverage** | 5 test files (`weighted-fraud-scoring.test.ts`, `services/consistencyFraudPenalty.test.ts`, `services/consistencyConfidence.test.ts`, `wave3-integration.test.ts`, `wave4-integration.test.ts`) |
| **Version** | KINGA v3.0.0 |
| **Reusable** | Yes |
| **Claims-Specific** | Partially — the signal types and indicator weights are motor-claims-specific; the scoring framework is reusable |
| **Should Be Generalised** | Yes — extract the scoring framework as `@kinga/fraud-scoring-engine`; keep signal definitions as domain plugins |

---

### SR-09 · Cost Estimation Engine

| Field | Value |
|---|---|
| **Service Name** | Cost Estimation Engine |
| **Source File** | `server/cost-optimization.ts`, `server/pipeline-v2/stage-9-cost.ts`, `server/quote-ai-optimisation.ts` |
| **Purpose** | Performs component-level quote comparison, variance analysis, risk-adjusted quote scoring, and negotiation strategy generation. Computes median, lowest, highest, and variance across panel beater quotes. Detects fraud patterns through cost anomaly analysis. Produces the optimal cost recommendation consumed by the DOE. |
| **Current Consumers** | `server/routers.ts` (quote optimisation procedure), `server/quote-ai-optimisation.ts`, `server/pipeline-v2/orchestrator.ts` (Stage 9) |
| **Future Consumers** | Fleet repair cost benchmarking, Marketplace quote evaluation |
| **Input** | `QuoteAnalysis[]` — structured quote data per panel beater |
| **Output** | `OptimisationResult { recommendedQuote, componentComparisons[], negotiationStrategies[], fraudPatterns[] }` |
| **Dependencies** | `server/repair-intelligence/quote-intelligence.ts`, `server/repair-intelligence/cost-deviation.ts`, `server/repair-intelligence/country-repair-index.ts` |
| **Owner** | Claims Intelligence |
| **Test Coverage** | `cost-optimization.test.ts` (1 file), covered in `wave3-integration.test.ts` |
| **Version** | 1.0.0 |
| **Reusable** | Yes |
| **Claims-Specific** | Partially — the comparison logic is reusable; the motor-parts taxonomy is domain-specific |
| **Should Be Generalised** | Yes — the quote comparison and variance engine is applicable to any multi-supplier procurement domain |

---

### SR-10 · Repair Intelligence Service

| Field | Value |
|---|---|
| **Service Name** | Repair Intelligence Service |
| **Source File** | `server/repair-intelligence/` (10 files: `quote-intelligence.ts`, `part-reconciliation.ts`, `cost-deviation.ts`, `country-repair-index.ts`, `quote-comparison-stats.ts`, `risk-classifier.ts`, `learning-loop.ts`, `parts-dictionary.ts`, `repair-replace-router.ts`, `router.ts`) |
| **Purpose** | A seven-layer intelligence stack for repair quote analysis: (1) quote comparison statistics, (2) repair-to-vehicle-value ratio, (3) historical repair intelligence lookup, (4) country cost index normalisation, (5) parts certainty scoring, (6) AI recommendation output, (7) safety guardrails. Advisory only — does not modify tables or block workflows. |
| **Current Consumers** | `server/pipeline-v2/stage-9-cost.ts`, `server/routers.ts` (quoteIntelligenceRouter, repairReplaceRouter) |
| **Future Consumers** | Fleet maintenance cost benchmarking, Marketplace supplier evaluation |
| **Input** | `claimId`, `panelBeaterQuotes[]`, `vehicleValue` |
| **Output** | `EnhancedIntelligenceReport { detectedParts[], reconciliation, historicalDeviation, countryContext, partsCertainty, aiRecommendation, confidenceScore }` |
| **Dependencies** | `drizzle/schema` (aiAssessments, panelBeaterQuotes, repairCostIntelligence), `server/_core/llm.ts` |
| **Owner** | Claims Intelligence |
| **Test Coverage** | Covered via `cost-optimization.test.ts` and `wave3-integration.test.ts` |
| **Version** | 1.0.0 |
| **Reusable** | Yes |
| **Claims-Specific** | Partially — the part reconciliation and country index are motor-specific |
| **Should Be Generalised** | Yes — the statistical comparison layer is domain-agnostic |

---

### SR-11 · Vehicle Valuation Service

| Field | Value |
|---|---|
| **Service Name** | Vehicle Valuation Service |
| **Source File** | `server/services/vehicleValuation.ts`, `server/insurance/valuation-engine.ts` |
| **Purpose** | Determines the pre-accident market value of a vehicle using a six-source waterfall: (1) Facebook Marketplace, (2) classified listings, (3) AutoTrader SA, (4) historical claims database, (5) AI estimation via LLM, (6) manual assessor override. Computes price range (min/max/median/average) and a confidence score. Supports SA import duty calculation. |
| **Current Consumers** | `server/pipeline-v2/orchestrator.ts` (auto-valuation at pipeline end), `server/db.ts` (createVehicleMarketValuation), `server/routers.ts` (manual valuation trigger) |
| **Future Consumers** | Fleet vehicle book value tracking, Policy underwriting valuation, Total loss determination |
| **Input** | `VehicleDetails { make, model, year, mileage?, condition?, registration?, country? }` |
| **Output** | `ValuationResult { estimatedMarketValue, valuationMethod, confidenceScore, dataPointsCount, priceRange, dataPoints[] }` |
| **Dependencies** | `server/_core/llm.ts`, external market data sources |
| **Owner** | Claims Intelligence |
| **Test Coverage** | `vehicleValuation.test.ts` (1 file) |
| **Version** | 1.0.0 |
| **Reusable** | Yes |
| **Claims-Specific** | No — applicable to fleet, underwriting, and any vehicle-value domain |
| **Should Be Generalised** | Yes — extract as `@kinga/vehicle-valuation` |

---

### SR-12 · Vehicle Registry

| Field | Value |
|---|---|
| **Service Name** | Vehicle Registry |
| **Source File** | `server/vehicle-registry.ts`, `server/routers/vehicle-registry.ts` |
| **Purpose** | Canonical registry of all vehicles processed by the platform. Provides upsert-on-VIN logic, cross-claim vehicle matching, total-loss flagging, and structural intelligence integration. Normalises VIN, registration, make, model, and year. |
| **Current Consumers** | `server/db.ts` (upsertVehicleRegistry after claim submission), `server/routers.ts` (vehicleRegistryRouter), `server/cross-claim-intelligence.ts` |
| **Future Consumers** | Fleet vehicle onboarding, Policy underwriting vehicle check, Inspection vehicle lookup |
| **Input** | `VehicleRegistryUpsert { vin, registration, make, model, year, ... }` |
| **Output** | `VehicleRegistryRecord` with cross-claim history, total-loss flag, structural intelligence |
| **Dependencies** | `drizzle/schema` (vehicleRegistry, vehicleDamageHistory), `server/vehicle-structural-intelligence.ts` |
| **Owner** | Platform Engineering |
| **Test Coverage** | `vehicle-registry.test.ts` (1 file) |
| **Version** | 1.0.0 |
| **Reusable** | Yes |
| **Claims-Specific** | No |
| **Should Be Generalised** | Yes — the VIN-keyed registry pattern is applicable to any vehicle-centric domain |

---

### SR-13 · Driver Registry

| Field | Value |
|---|---|
| **Service Name** | Driver Registry |
| **Source File** | `server/driver-registry.ts`, `server/routers/driver-registry.ts` |
| **Purpose** | Canonical registry of all drivers processed by the platform. Provides OCR-tolerant licence number normalisation, name normalisation, date-of-birth parsing, and cross-claim driver matching. Supports repeat-claim signal detection. |
| **Current Consumers** | `server/db.ts` (driver upsert after claim submission), `server/routers.ts` (driverRegistryRouter), `server/cross-claim-intelligence.ts` |
| **Future Consumers** | Fleet driver onboarding, Policy underwriting driver check |
| **Input** | Raw driver data from claim form (name, licence number, DOB, contact) |
| **Output** | `DriverRegistryRecord` with normalised fields and cross-claim history |
| **Dependencies** | `drizzle/schema` (drivers, driverClaims) |
| **Owner** | Platform Engineering |
| **Test Coverage** | `driver-registry.test.ts` (1 file) |
| **Version** | 1.0.0 |
| **Reusable** | Yes |
| **Claims-Specific** | No |
| **Should Be Generalised** | Yes — the person-registry pattern with OCR-tolerant normalisation is broadly applicable |

---

### SR-14 · Cross-Claim Intelligence Engine

| Field | Value |
|---|---|
| **Service Name** | Cross-Claim Intelligence Engine |
| **Source File** | `server/cross-claim-intelligence.ts`, `server/routers/cross-claim-intelligence.ts` |
| **Purpose** | Detects nine cross-entity fraud and risk signals by querying historical claim data: repeat_damage_signal, driver_repeat_claim_signal, repairer_repeat_pattern_signal, vehicle_high_claim_frequency, damage_zone_repeat_signal, staged_accident_signal, repairer_driver_collusion_signal, claim_velocity_signal, total_loss_repeat_signal. All signals are idempotent (unique on claim_id + signal_type). |
| **Current Consumers** | `server/db.ts` (runs non-blocking after pipeline), `server/routers.ts` (crossClaimIntelligenceRouter) |
| **Future Consumers** | Real-time intake fraud gate, Fleet fraud monitoring |
| **Input** | `{ claimId, vehicleId, driverId, repairerId, tenantId }` |
| **Output** | `DetectedSignal[]` stored to `crossClaimSignals` table |
| **Dependencies** | `drizzle/schema` (crossClaimSignals, vehicleRegistry, vehicleDamageHistory, drivers, driverClaims, repairHistory, claims) |
| **Owner** | AI Engineering |
| **Test Coverage** | `cross-claim-intelligence.test.ts` (1 file) |
| **Version** | 1.0.0 |
| **Reusable** | Yes |
| **Claims-Specific** | Partially — the signal types are motor-specific; the cross-entity detection pattern is reusable |
| **Should Be Generalised** | Yes — extract the signal detection framework as a generic pattern |

---

### SR-15 · Document Intelligence (Document Ingestion)

| Field | Value |
|---|---|
| **Service Name** | Document Intelligence / Document Ingestion |
| **Source File** | `server/pipeline-v2/stage-1-ingestion.ts`, `server/pdf-image-extractor.ts`, `server/pipeline-v2/stage-2-extraction.ts`, `server/pipeline-v2/stage-3-structured-extraction.ts` |
| **Purpose** | Three-stage document processing pipeline. Stage 1: identifies and classifies documents using a pure Node.js PDF extractor (pdfjs-dist + @napi-rs/canvas) with poppler fallback. Stage 2: extracts raw text from all document types. Stage 3: converts raw text into a structured `ClaimRecord` using LLM with JSON schema enforcement. Never halts — produces degraded output if documents are absent. |
| **Current Consumers** | `server/pipeline-v2/orchestrator.ts` (Stages 1–3), `server/routers/document-ingestion.ts` |
| **Future Consumers** | Inspection document ingestion, Policy document parsing, Fleet compliance document processing |
| **Input** | `PipelineContext { documents: { url, type }[] }` |
| **Output** | `Stage1Output { documents[] }`, `Stage2Output { rawText }`, `Stage3Output { claimRecord: ClaimRecord }` |
| **Dependencies** | `server/_core/llm.ts`, `server/pdf-image-extractor.ts`, `server/pipeline-v2/pdfToImages.ts`, `server/pipeline-v2/pdfEmbeddedImages.ts` |
| **Owner** | AI Engineering |
| **Test Coverage** | Covered via integration tests; `document-ingestion.test.ts` in routers |
| **Version** | Stage code versions per `felVersionRegistry.ts` |
| **Reusable** | Yes |
| **Claims-Specific** | No — the PDF extraction and LLM-structured extraction pattern is domain-agnostic |
| **Should Be Generalised** | Yes — extract as `@kinga/document-intelligence` |

---

### SR-16 · Report Renderer

| Field | Value |
|---|---|
| **Service Name** | Report Renderer |
| **Source File** | `server/reporting/reportDefinitions.ts`, `server/reporting/reportQueue.ts`, `server/reporting/pdfRenderer.ts`, `server/reporting/templates/base.ts`, `server/reporting/templates/kingaDesignSystem.ts` |
| **Purpose** | Generates all platform reports as HTML (with optional PDF export). Maintains a typed report registry (`REPORT_ACCESS`) mapping report keys to generation functions and role-based access rules. Seven report types: Claims Intelligence, Forensic Decision, Vehicle Verification, Vehicle Valuation, Engineer Inspection, Risk Survey, and the KINGA AI Assessment Report. All reports use the KINGA Design System (black/white/grey palette; colour only in charts). |
| **Current Consumers** | `server/reporting/reportQueue.ts`, `server/routers/reporting.ts`, `server/routers.ts` (REPORT_ACCESS import) |
| **Future Consumers** | Scheduled report delivery, Executive dashboard PDF export, Regulatory submission package |
| **Input** | `reportKey: string`, `params: ReportParams`, `tenantId?: string` |
| **Output** | `string` (HTML), optionally converted to PDF via `pdfRenderer.ts` |
| **Dependencies** | `server/reporting/claimsIntelligenceReport.ts`, `server/reporting/forensicDecisionReport.ts`, `server/reporting/vehicleVerificationReport.ts`, `server/reporting/vehicleValuationReport.ts`, `server/reporting/engineerInspectionReport.ts`, `server/reporting/riskSurveyReport.ts`, `mysql2` |
| **Owner** | Platform Engineering |
| **Test Coverage** | `reporting.test.ts`, `reporting.access.test.ts` |
| **Version** | 1.0.0 |
| **Reusable** | Yes |
| **Claims-Specific** | Partially — the renderer and design system are reusable; the report definitions are domain-specific |
| **Should Be Generalised** | Yes — extract the renderer and design system; keep report definitions as plugins |

---

### SR-17 · Assignment Engine (Claim Routing Decision Engine)

| Field | Value |
|---|---|
| **Service Name** | Assignment Engine / Claim Routing Decision Engine |
| **Source File** | `server/claim-routing-engine.ts`, `server/pipeline-v2/claimsEscalationRouter.ts`, `server/workload-balancing.ts` |
| **Purpose** | Routes claims to AI-only, hybrid, or manual workflows based on composite confidence score, automation policy thresholds, and claim characteristics (type, amount, vehicle, fraud risk). The escalation router handles post-assessment routing decisions. The workload balancer assigns claims to processors using weighted scoring (active claims × 1.0, complex claims × 1.5, high-risk claims × 2.0). |
| **Current Consumers** | `server/routers/decision.ts` (routeClaim, routeClaimBatch), `server/db.ts` (auto-assignment), `server/services/fast-track-dispatcher.ts` |
| **Future Consumers** | Fleet claim auto-routing, Inspection assignment, Agency claim distribution |
| **Input** | `RoutingContext { claimId, tenantId, confidenceScore, automationPolicy, claimType, estimatedRepairCost, vehicleMake, vehicleYear, fraudScore }` |
| **Output** | `RoutingResult { workflow: "ai_only" | "hybrid" | "manual", reason, confidenceScoreId, policyId }` |
| **Dependencies** | `drizzle/schema` (claims, claimRoutingDecisions, claimConfidenceScores, automationPolicies), `server/workload-balancing.ts` |
| **Owner** | Platform Engineering |
| **Test Coverage** | `workload-balancing.test.ts` (2 files), `services/routing-re-evaluation.test.ts` |
| **Version** | 1.0.0 |
| **Reusable** | Yes |
| **Claims-Specific** | Partially — the routing logic is claims-specific; the workload balancing algorithm is generic |
| **Should Be Generalised** | Yes — the weighted workload balancer is applicable to any task-assignment domain |

---

### SR-18 · Fast-Track Engine

| Field | Value |
|---|---|
| **Service Name** | Fast-Track Engine |
| **Source File** | `server/services/fast-track-engine.ts`, `server/services/fast-track-dispatcher.ts`, `server/services/fast-track-analytics.ts`, `server/services/fast-track-config-service.ts`, `server/services/fast-track-workflow-integration.ts` |
| **Purpose** | Evaluates claims against configurable fast-track automation rules using hierarchical configuration resolution (most specific wins: claim_type + product + tenant → claim_type + tenant → product + tenant → tenant-wide default). Supports four actions: AUTO_APPROVE, PRIORITY_QUEUE, REDUCED_DOCUMENTATION, STRAIGHT_TO_PAYMENT. All actions execute through the Workflow Engine. Immutable configuration (always insert new version, never update). |
| **Current Consumers** | `server/db.ts` (post-pipeline fast-track evaluation), `server/routers/automation-policies.ts` |
| **Future Consumers** | Fleet claim auto-settlement, Policy renewal fast-track |
| **Input** | `{ claimId, tenantId, confidenceScore, fraudScore, claimValue, claimType }` |
| **Output** | `FastTrackEvaluationResult { eligible, action, configVersion, evaluationDetails }` |
| **Dependencies** | `server/workflow-engine.ts`, `drizzle/schema` (fastTrackConfig, fastTrackRoutingLog), `server/services/usage-meter.ts` |
| **Owner** | Platform Engineering |
| **Test Coverage** | `services/fast-track-engine.test.ts`, `services/fast-track-dispatcher.test.ts`, `services/fast-track-analytics.test.ts`, `services/fast-track-config-service.test.ts` |
| **Version** | 1.0.0 |
| **Reusable** | Yes |
| **Claims-Specific** | Partially — the action types are claims-specific; the hierarchical config resolution is generic |
| **Should Be Generalised** | Yes — extract the hierarchical config resolution as a generic policy engine |

---

### SR-19 · Input Fidelity Engine (IFE)

| Field | Value |
|---|---|
| **Service Name** | Input Fidelity Engine (IFE) |
| **Source File** | `server/pipeline-v2/inputFidelityEngine.ts` |
| **Purpose** | Assesses the completeness and quality of all input data submitted with a claim. Classifies every data gap by attribution (CLAIMANT_OMISSION, SYSTEM_EXTRACTION_FAILURE, DOCUMENT_QUALITY_FAILURE, ASSESSOR_OMISSION). Produces a completeness score (0–100) that gates DOE eligibility. Affects FCDI scoring. Output persisted to `ai_assessments.ife_result_json`. |
| **Current Consumers** | `server/pipeline-v2/orchestrator.ts` (Phase 4A), `server/pipeline-v2/decisionOptimisationEngine.ts` (eligibility gate), `server/pipeline-v2/dataResponsibilityMatrix.ts` |
| **Future Consumers** | Intake quality gate, Inspection completeness check |
| **Input** | `ClaimRecord` + `Stage1Output` + `Stage2Output` + image quality assessments |
| **Output** | `IFEReport { totalFieldsAssessed, gapCount, completenessScore, attributionBreakdown, imageQualityAssessments[], gaps[] }` |
| **Dependencies** | `server/pipeline-v2/types.ts`, `server/pipeline-v2/forensicCDI.ts` |
| **Owner** | AI Engineering |
| **Test Coverage** | 3 test files (covered via `inputFidelityEngine.test.ts` and integration tests) |
| **Version** | Phase 4A |
| **Reusable** | Yes |
| **Claims-Specific** | No — the data completeness assessment pattern is domain-agnostic |
| **Should Be Generalised** | Yes — applicable to any document submission workflow |

---

### SR-20 · Decision Optimisation Engine (DOE)

| Field | Value |
|---|---|
| **Service Name** | Decision Optimisation Engine (DOE) |
| **Source File** | `server/pipeline-v2/decisionOptimisationEngine.ts` |
| **Purpose** | Produces a single optimal defensible repair decision from multiple competing quotes and contextual signals. Selection rule: lowest-cost quote from eligible candidates (fraud-disqualified and anomalous quotes excluded). Gated by FCDI score (< 40 → disabled) and IFE completeness (< 55% → disabled). Multi-objective scores computed for audit trail only. |
| **Current Consumers** | `server/pipeline-v2/orchestrator.ts` (end of Stage 9) |
| **Future Consumers** | Fleet repair decision, Marketplace supplier selection |
| **Input** | `DOEInput { candidates: DOECandidate[], fcdiScore, inputCompleteness, fraudAnalysis }` |
| **Output** | `DOEResult { status: DOEStatus, selectedCandidate?, disqualifications[], auditTrail }` |
| **Dependencies** | `server/pipeline-v2/inputFidelityEngine.ts`, `server/pipeline-v2/forensicCDI.ts`, `server/pipeline-v2/quoteOptimisationEngine.ts` |
| **Owner** | AI Engineering |
| **Test Coverage** | 3 test files (covered via `decisionOptimisationEngine.test.ts` and integration tests) |
| **Version** | Phase 3C |
| **Reusable** | Yes |
| **Claims-Specific** | Partially — the disqualification rules are claims-specific; the multi-criteria selection logic is generic |
| **Should Be Generalised** | Yes — applicable to any multi-supplier selection domain |

---

### SR-21 · Forensic Execution Ledger (FEL)

| Field | Value |
|---|---|
| **Service Name** | Forensic Execution Ledger (FEL) |
| **Source File** | `server/pipeline-v2/forensicExecutionLedger.ts`, `server/pipeline-v2/felVersionRegistry.ts` |
| **Purpose** | Immutable per-run audit record of every pipeline stage execution. Records input hash (SHA-256), output snapshot, execution time, timeout status, fallback used, assumptions introduced, confidence score, model version, prompt version, and contract version for each stage. Supports deterministic replay verification. Stored as JSON in `ai_assessments.forensic_execution_ledger_json`. |
| **Current Consumers** | `server/pipeline-v2/orchestrator.ts` (built at pipeline end), `server/routers/pipeline-observability.ts` |
| **Future Consumers** | Regulatory audit submission, Model governance reporting, Replay verification service |
| **Input** | Stage execution records collected during pipeline run |
| **Output** | `ForensicExecutionLedger { version, claimId, pipelineRunAt, totalDurationMs, stages[], fcdiScorePercent, fcdiLabel, finalPipelineState, replayable }` |
| **Dependencies** | `server/pipeline-v2/forensicCDI.ts`, `server/pipeline-v2/felVersionRegistry.ts` |
| **Owner** | Platform Engineering |
| **Test Coverage** | `wave3-integration.test.ts`, `wave4-integration.test.ts`, `treGovernanceRouter.test.ts` |
| **Version** | Phase 3B |
| **Reusable** | Yes |
| **Claims-Specific** | No — the execution ledger pattern is applicable to any AI pipeline |
| **Should Be Generalised** | Yes — extract as `@kinga/execution-ledger` for any AI pipeline audit requirement |

---

### SR-22 · Truth Governance Registry (TGR / TRE)

| Field | Value |
|---|---|
| **Service Name** | Truth Governance Registry / Truth Reconciliation Engine (TRE) |
| **Source File** | `server/pipeline-v2/truthGovernanceRegistry.ts`, `server/pipeline-v2/truthReconciliationEngine.ts`, `server/pipeline-v2/claimTruthLayer.ts` |
| **Purpose** | Maintains a canonical `ClaimTruthObject` (CTO) that represents the platform's authoritative view of the claim facts. The TRE arbitrates between competing source engines (PhysicsEngine, VisionEngine, DocumentExtraction, DriverStatement, etc.) using a governance registry of source weights and conflict resolution rules. The CTO schema version is tracked independently of the TRE engine version. |
| **Current Consumers** | `server/pipeline-v2/orchestrator.ts`, `server/routers/truth-synthesis.ts`, `server/routers/tre-governance.ts`, `server/routers/tre-v4-governance.ts` |
| **Future Consumers** | Inspection truth layer, Regulatory audit truth export |
| **Input** | Outputs from all pipeline stages + source engine confidence scores |
| **Output** | `ClaimTruthObject { version: "2.0.0", fields: { [fieldName]: { value, source, confidence, reconciledAt } } }` |
| **Dependencies** | `server/pipeline-v2/truthLineageEngine.ts`, `server/pipeline-v2/truthMonitoringEngine.ts`, `server/pipeline-v2/truthRuleEngine.ts` |
| **Owner** | AI Engineering |
| **Test Coverage** | `truthReconciliationEngine.test.ts`, `treGovernanceRouter.test.ts`, `treV4Governance.test.ts` |
| **Version** | CTO Schema v2.0.0 / TRE Engine v2.0.0 |
| **Reusable** | Yes |
| **Claims-Specific** | No — the truth governance pattern is applicable to any multi-source data reconciliation domain |
| **Should Be Generalised** | Yes — this is a foundational platform capability |

---

### SR-23 · Evidence Services (Evidence Registry Engine)

| Field | Value |
|---|---|
| **Service Name** | Evidence Services / Evidence Registry Engine |
| **Source File** | `server/pipeline-v2/evidenceRegistryEngine.ts`, `server/pipeline-v2/evidencePluginRegistry.ts`, `server/pipeline-v2/evidenceStrengthScorer.ts` |
| **Purpose** | Pure document inventory engine (Stage 0). Catalogues every piece of evidence in the submitted document set and classifies each item as PRESENT, ABSENT, or UNKNOWN. Does not infer, guess, or analyse. The plugin registry extends the evidence surface to telematics (OBD/GPS), EDR (airbag module), LIDAR, 3D scan, witness statements, police reports, and weather data. |
| **Current Consumers** | `server/pipeline-v2/orchestrator.ts` (runs after Stage 1), `server/pipeline-v2/decisionReadinessEngine.ts` (minimum evidence gate) |
| **Future Consumers** | Inspection evidence checklist, Policy evidence requirements gate |
| **Input** | `Stage1Output + Stage2Output` |
| **Output** | `EvidenceRegistry { items: EvidenceItems, documentSummary, pluginContributions[] }` |
| **Dependencies** | `server/pipeline-v2/evidencePluginRegistry.ts` |
| **Owner** | AI Engineering |
| **Test Coverage** | Covered via integration tests |
| **Version** | 1.0.0 |
| **Reusable** | Yes |
| **Claims-Specific** | No — the evidence registry pattern is applicable to any document-submission workflow |
| **Should Be Generalised** | Yes — extract as `@kinga/evidence-registry` |

---

### SR-24 · Decision Transparency Engine (Explainability Engine)

| Field | Value |
|---|---|
| **Service Name** | Decision Transparency Engine / Explainability Engine |
| **Source File** | `server/pipeline-v2/stage-explainability.ts` |
| **Purpose** | Produces human-readable, legally defensible evidence chains for every physics finding. Each chain explains: (1) what was measured, (2) how it was measured, (3) what it implies, (4) confidence level, (5) what would change the conclusion. Produces a verdict paragraph for the report executive summary and an adjuster-facing plain-English summary. |
| **Current Consumers** | `server/pipeline-v2/orchestrator.ts` (Wave 3 explainability pass) |
| **Future Consumers** | Regulatory audit package, Adjuster training tool, Customer-facing claim explanation |
| **Input** | `PhysicsTruth + IntegrityEngineResult + UncertaintyPropagationResult` |
| **Output** | `ExplainabilityResult { evidenceChains[], methodologyCitations[], verdictParagraph, adjusterSummary }` |
| **Dependencies** | `server/pipeline-v2/physicsTruth.ts`, `server/pipeline-v2/stage-integrity.ts`, `server/pipeline-v2/stage-uncertainty.ts` |
| **Owner** | AI Engineering |
| **Test Coverage** | `wave3-integration.test.ts`, `wave4-integration.test.ts` |
| **Version** | Wave 3 |
| **Reusable** | Yes |
| **Claims-Specific** | No — the evidence chain pattern is applicable to any AI decision domain |
| **Should Be Generalised** | Yes — extract as `@kinga/explainability-engine` |

---

### SR-25 · Decision Governance Service

| Field | Value |
|---|---|
| **Service Name** | Decision Governance Service |
| **Source File** | `server/decision-governance.ts`, `server/decision-lifecycle.ts`, `server/decision-replay.ts` |
| **Purpose** | Governance layer for all human actions on claim decisions. Enforces six rules: (1) mandatory justification for REVIEWED/FINALISED/LOCKED/OVERRIDE, (2) override tracking when human decision differs from AI, (3) lock protection requiring FINALISED state + final snapshot, (4) bulk action safety, (5) immutable audit trail, (6) UI enforcement via server-side validation. Every response includes `{ action_allowed, validation_errors, override_flag }`. |
| **Current Consumers** | `server/routers/governance.ts`, `server/routers/governance-dashboard.ts`, `server/routers/approval.ts` |
| **Future Consumers** | Inspection decision governance, Fleet claim approval governance |
| **Input** | `GovernanceInput { claimId, tenantId, action, performedBy, reason, aiDecision?, humanDecision? }` |
| **Output** | `GovernanceResult { action_allowed, validation_errors, override_flag, auditEntryId }` |
| **Dependencies** | `drizzle/schema` (governanceAuditLog, claimDecisionLifecycle, decisionSnapshots) |
| **Owner** | Platform Engineering |
| **Test Coverage** | `workflow-governance.test.ts`, `governance-dashboard.test.ts` |
| **Version** | 1.0.0 |
| **Reusable** | Yes |
| **Claims-Specific** | No — the governance pattern is applicable to any AI-assisted decision domain |
| **Should Be Generalised** | Yes — this is a foundational compliance capability |

---

### SR-26 · Confidence Scoring Engine

| Field | Value |
|---|---|
| **Service Name** | Confidence Scoring Engine |
| **Source File** | `server/confidence-scoring-engine.ts`, `server/pipeline-v2/confidenceAggregationEngine.ts` |
| **Purpose** | Calculates composite confidence scores (0–100) for claim automation eligibility. Aggregates six independent metrics: damage detection certainty (25%), physics validation strength (20%), fraud scoring confidence (15%), historical AI accuracy (15%), data completeness (15%), vehicle risk intelligence (10%). The aggregation engine consolidates confidence signals from all pipeline stages. |
| **Current Consumers** | `server/pipeline-v2/orchestrator.ts` (confidence aggregation pass), `server/claim-routing-engine.ts`, `server/db.ts` |
| **Future Consumers** | Inspection confidence gate, Policy underwriting confidence |
| **Input** | `ConfidenceScoreComponents { damageCertainty, physicsStrength, fraudConfidence, historicalAccuracy, dataCompleteness, vehicleRiskIntelligence }` |
| **Output** | `ConfidenceScoreBreakdown { compositeConfidenceScore, scoringVersion, componentBreakdowns }` |
| **Dependencies** | `drizzle/schema` (claimConfidenceScores), `server/pipeline-v2/types.ts` |
| **Owner** | AI Engineering |
| **Test Coverage** | `services/confidence-scoring.test.ts`, `services/confidence-explainability.test.ts` |
| **Version** | 1.0.0 |
| **Reusable** | Yes |
| **Claims-Specific** | Partially — the weights are claims-specific; the aggregation framework is generic |
| **Should Be Generalised** | Yes — extract the weighted aggregation framework |

---

### SR-27 · Notification Service

| Field | Value |
|---|---|
| **Service Name** | Governance Notification Service |
| **Source File** | `server/notification-service.ts`, `server/notifications.ts`, `server/workflow-notifications.ts`, `server/services/workflow-notifications.ts` |
| **Purpose** | Manages in-app notifications for critical governance events. Supports five notification types: intake_escalation, auto_assignment, ai_rerun, executive_override, segregation_violation. Provides a hook-ready email adapter for future integration. Workflow notifications handle assessor assignment, AI assessment completion, quote submission, and fraud detection alerts. |
| **Current Consumers** | `server/routers/notifications.ts`, `server/services/fast-track-dispatcher.ts`, `server/db.ts` (assignment notifications) |
| **Future Consumers** | Fleet maintenance alerts, Policy renewal notifications, Inspection completion alerts |
| **Input** | `{ tenantId, type, title, message, recipients: userId[] }` |
| **Output** | `NotificationRecord` stored to `governanceNotifications` table |
| **Dependencies** | `drizzle/schema` (governanceNotifications, users), `server/_core/notification.ts` |
| **Owner** | Platform Engineering |
| **Test Coverage** | `notification-service.test.ts` (1 file) |
| **Version** | 1.0.0 |
| **Reusable** | Yes |
| **Claims-Specific** | No |
| **Should Be Generalised** | Already generic — extend notification types as new domains are added |

---

### SR-28 · Platform Metering Service

| Field | Value |
|---|---|
| **Service Name** | Platform Metering Service |
| **Source File** | `server/metering.ts`, `server/services/usage-meter.ts`, `server/services/usage-aggregator.ts` |
| **Purpose** | Silently tracks all billable activities across the KINGA platform for monetisation. Records usage events with compute unit costs: CLAIM_PROCESSED (1.0), AI_ASSESSMENT_TRIGGERED (5.0), DOCUMENT_INGESTED (0.5), EXECUTIVE_ANALYTICS_QUERY (2.0), GOVERNANCE_CHECK (1.5), FLEET_VEHICLE_MANAGED (0.3), MARKETPLACE_QUOTE_REQUEST (1.0). |
| **Current Consumers** | `server/services/fast-track-dispatcher.ts`, `server/db.ts`, `server/routers/monetization.ts` |
| **Future Consumers** | SaaS billing integration, Tenant usage dashboards, API rate limiting |
| **Input** | `MeteringEvent { tenantId, eventType, claimId?, metadata? }` |
| **Output** | `UsageEvent` stored to `usageEvents` table |
| **Dependencies** | `drizzle/schema` (usageEvents) |
| **Owner** | Platform Engineering |
| **Test Coverage** | `services/usage-meter.test.ts` |
| **Version** | 1.0.0 |
| **Reusable** | Yes |
| **Claims-Specific** | No |
| **Should Be Generalised** | Already generic — add new event types as new domains are added |

---

### SR-29 · PDF Storage Service

| Field | Value |
|---|---|
| **Service Name** | PDF Storage Service |
| **Source File** | `server/pdf-storage-service.ts`, `server/pdf-export.ts`, `server/claim-pdf-export.ts`, `server/final-claim-report-pdf.ts` |
| **Purpose** | Manages PDF report storage in S3 with immutability enforcement and metadata tracking. Verifies that a report snapshot is immutable before generating a PDF. Stores PDF bytes in S3 and records metadata (S3 URL, file size, snapshot ID) in the database. |
| **Current Consumers** | `server/routers/reports.ts`, `server/routers/reporting.ts` |
| **Future Consumers** | Regulatory submission package, Policy document archive |
| **Input** | `StorePdfParams { snapshotId, pdfBuffer, tenantId }` |
| **Output** | `{ id, s3Url, fileSizeBytes }` |
| **Dependencies** | `server/storage.ts` (S3), `server/report-snapshot-service.ts`, `drizzle/schema` (pdfReports, reportSnapshots) |
| **Owner** | Platform Engineering |
| **Test Coverage** | 0 dedicated test files |
| **Version** | 1.0.0 |
| **Reusable** | Yes |
| **Claims-Specific** | No |
| **Should Be Generalised** | Already generic |

---

## Part 2 — Platform Assets Catalogue

The following matrix maps each platform module (router) to the services it consumes. A filled cell (●) indicates direct consumption; a partial cell (◐) indicates indirect consumption via a shared helper.

| Module | WF Engine | AI Pipeline | Physics | Fraud Intel | Cost Est. | Vehicle Val. | Vehicle Reg. | Driver Reg. | Cross-Claim | Doc Intel | Report Renderer | Assignment | Fast-Track | IFE | DOE | FEL | TGR/TRE | Evidence Svc | Decision Gov. | Confidence | Notification | Metering |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `ai-analysis` | ◐ | ● | ◐ | ◐ | ◐ | ◐ | | | | ● | | | | ◐ | ◐ | ◐ | ◐ | | | ◐ | ● | ◐ |
| `ai-reanalysis` | ◐ | ● | ◐ | ◐ | ◐ | | | | | | | | | | | | | | | | ● | ◐ |
| `approval` | ● | | | | | | | | | | | | | | | | | | ● | | ● | |
| `audit` | | | | | | | | | | | | | | | | ● | | | ● | | | |
| `automation-policies` | | | | | | | | | | | | ● | ● | | | | | | | | | |
| `claim-completion` | ● | | | | | | | | | | | | | | | | | | | | ● | |
| `claim-replay` | | | | | | | | | | | | | | | | ● | | | | | | |
| `claims-manager` | ● | | | ◐ | | | | | | | | ● | | | | | | | | ◐ | ● | |
| `compliance` | | | | | | | | | | | ● | | | | | | | | ● | | | |
| `cross-claim-intelligence` | | | | ● | | | ● | ● | ● | | | | | | | | | | | | | |
| `decision` | ● | | | ◐ | | | | | | | | ● | | | ● | | | | ● | | | |
| `document-ingestion` | | | | | | | | | | ● | | | | | | | | ● | | | | |
| `driver-registry` | | | | | | | | ● | ◐ | | | | | | | | | | | | | |
| `exception-intelligence` | | | | ● | | | | | ● | | | | | | | | ● | | | | | |
| `executive` | | | | ◐ | | ◐ | | | | | ● | | | | | ● | | | | | | ● |
| `fleet-accounts` | ● | | | | | ◐ | ● | ● | | | | | | | | | | | | | ● | ◐ |
| `governance` | ● | | | | | | | | | | | | | | | | | | ● | | ● | |
| `governance-dashboard` | | | | | | | | | | | ● | | | | | | | | ● | | | |
| `historical-claims` | | | | | | | | | | ● | | | | | | | | | | | | |
| `inspections` | ● | | | | | ◐ | ◐ | | | ● | ● | | | | | | | ● | | | ● | |
| `intake-gate` | ● | | | ◐ | | | | | | | | | | ● | | | | ● | | | ● | |
| `intelligence` | | | ◐ | ● | ◐ | | | | ● | | | | | ◐ | ◐ | ◐ | ◐ | | | | | |
| `learning` | | | | | ◐ | | | | | | | | | | | | | | | | | |
| `marketplace` | | | | | ● | | | | | | | | | | | | | | | | | ● |
| `ml` | | ● | | | | | | | | | | | | | | ● | | | | ● | | |
| `monetization` | | | | | | | | | | | | | | | | | | | | | | ● |
| `notifications` | | | | | | | | | | | | | | | | | | | | | ● | |
| `operational-health` | | | | | | | | | | | | | | | | | | | | | | ● |
| `panel-beater-analytics` | | | | ◐ | ● | | | | ◐ | | ● | | | | | | | | | | | |
| `photo-reextraction` | | | | | | | | | | | | | | | | | | | | | ● | |
| `pipeline-observability` | | ◐ | | | | | | | | | | | | | | ● | | | | | | |
| `platform` | | | | | | | | | | | | | | | | | | | | | | |
| `platform-marketplace` | | | | | ● | | | | | | | | | | | | | | | | | ● |
| `platform-observability` | | ◐ | | | | | | | | | | | | | | ● | | | | | | |
| `policy-management` | | | | | | ● | | | | | | | | | | | | | | | | |
| `repair-history` | | | | | ◐ | | | | ◐ | | | | | | | | | | | | | |
| `reporting` | | | | | | ● | | | | | ● | | | | | | | | | | | |
| `reports` | | | | | | | | | | | ● | | | | | | | | | | | |
| `review-queue` | ● | | | ◐ | | | | | | | | | | | | | | | | | ● | |
| `routing-policy-version` | | | | | | | | | | | | ● | | | | | | | | | | |
| `simulation` | | ● | ◐ | ◐ | ◐ | ◐ | | | | | | | | | | | | | | | | |
| `super-audit` | | | | | | | | | | | | | | | | ● | | | ● | | | |
| `tenant` | | | | | | | | | | | | | | | | | | | | | | |
| `tre-governance` | | | | | | | | | | | | | | | | ● | ● | | | | | |
| `tre-v4-governance` | | | | | | | | | | | | | | | | ● | ● | | | | | |
| `truth-synthesis` | | | | | | | | | | | | | | | | | ● | | | | | |
| `vehicle-damage-history` | | | | | | | ● | | ◐ | | | | | | | | | | | | | |
| `vehicle-registry` | | | | | | | ● | | ◐ | | | | | | | | | | | | | |
| `vehicle-structural-intelligence` | | | ◐ | | | | ● | | | | | | | | | | | | | | | |
| `workflow` | ● | | | | | | | | | | | | | | | | | | | | | |
| `workflow-analytics` | | | | | | | | | | | | | | | | | | | | | | |
| `workflow-audit` | | | | | | | | | | | | | | | | ● | | | | | | |
| `workflow-queries` | ● | | | | | | | | | | | | | | | | | | | | | |

**Legend:** ● Direct consumer · ◐ Indirect consumer (via shared helper or db.ts)

---

## Part 3 — Services That Must Never Be Duplicated

The following services represent foundational platform capabilities where independent reimplementation would create critical risks: data inconsistency, audit trail fragmentation, governance bypass, or security vulnerabilities. Any new feature that requires one of these capabilities **must** integrate with the existing service rather than creating a parallel implementation.

### NDL-01 · Workflow Engine (`server/workflow-engine.ts`)

**Rationale:** The Workflow Engine is the single point of enforcement for claim state transitions, RBAC, segregation-of-duties, and the immutable audit trail. A parallel implementation would allow claims to change state without governance checks, without audit records, and without tenant isolation. This is a regulatory and legal risk.

**Enforcement Rule:** All claim state changes — whether triggered by AI, human action, fast-track automation, or scheduled jobs — must call `WorkflowEngine.transition()`. Direct database updates to the `status` column are prohibited outside this engine.

---

### NDL-02 · Fraud Intelligence Engine (`server/fraud-scoring.ts` + `server/weighted-fraud-scoring.ts` + `server/cross-claim-intelligence.ts`)

**Rationale:** Fraud detection requires a single, consistent scoring methodology so that fraud scores are comparable across claims, tenants, and time periods. A parallel implementation would produce incomparable scores, undermine the cross-claim signal detection that depends on consistent scoring, and create legal liability if a claim is paid that a unified engine would have flagged.

**Enforcement Rule:** All fraud scoring must flow through the canonical fraud scoring stack. New fraud signals must be added as indicators to the existing engine, not implemented as standalone scoring functions.

---

### NDL-03 · Truth Governance Registry / TRE (`server/pipeline-v2/truthGovernanceRegistry.ts`)

**Rationale:** The CTO is the platform's authoritative view of claim facts. If multiple modules maintain their own "truth" about a claim field, the platform cannot produce a consistent report, a consistent audit trail, or a defensible regulatory submission. The TRE's source-weight governance and conflict resolution rules are the mechanism by which the platform resolves disagreements between AI engines — bypassing it means accepting unresolved contradictions.

**Enforcement Rule:** Any new engine that produces a value for a field already tracked by the TRE must register as a source engine in `truthGovernanceRegistry.ts` and contribute its output through the TRE reconciliation pass, not write directly to the claim record.

---

### NDL-04 · Forensic Execution Ledger (`server/pipeline-v2/forensicExecutionLedger.ts`)

**Rationale:** The FEL is the immutable record of every AI decision made on a claim. It is the foundation of regulatory compliance, model governance, and replay verification. A parallel logging implementation would produce an incomplete audit trail and undermine the platform's ability to defend its AI decisions in a legal or regulatory context.

**Enforcement Rule:** Every pipeline stage must contribute a `StageExecutionRecord` to the FEL. New pipeline stages must register in `felVersionRegistry.ts` with a stage code version. No stage may bypass the FEL.

---

### NDL-05 · Decision Governance Service (`server/decision-governance.ts`)

**Rationale:** The governance service enforces the six rules that protect the integrity of human decisions on claims (mandatory justification, override tracking, lock protection, bulk action safety, audit trail, UI enforcement). A parallel implementation would allow decisions to be made without justification, without override tracking, and without an audit record — creating regulatory and legal exposure.

**Enforcement Rule:** All human actions on claim decisions (REVIEWED, FINALISED, LOCKED, OVERRIDE, REPLAY) must pass through `decision-governance.ts`. The governance check must occur server-side, not only in the UI.

---

### NDL-06 · Tenant Isolation Layer (`server/_core/context.ts` + `server/workflow-engine.ts` tenant checks)

**Rationale:** Tenant isolation is the security boundary that prevents one insurer's data from being accessed by another. Any service that queries claim data must apply tenant filtering. A new service that queries claims without tenant filtering would create a data breach risk.

**Enforcement Rule:** All database queries on tenant-scoped tables must include a `tenantId` filter. New procedures must use `insurerDomainProcedure` or `protectedProcedure` with explicit tenant context, never `publicProcedure` for claim data.

---

### NDL-07 · Immutable Routing Service (`server/services/immutable-routing.ts`)

**Rationale:** Once a claim has been routed to a workflow (AI-only, hybrid, manual), the routing decision is immutable. Allowing routing to be changed after the fact would undermine the integrity of the automation policy and create audit trail inconsistencies.

**Enforcement Rule:** Routing decisions must be written once via the immutable routing service. Re-evaluation is permitted only through the formal re-evaluation procedure, which creates a new routing record rather than modifying the existing one.

---

### NDL-08 · Vehicle Registry (`server/vehicle-registry.ts`)

**Rationale:** The vehicle registry is the single source of truth for vehicle identity across all claims. If multiple modules maintain their own vehicle records, cross-claim intelligence (repeat damage, total-loss flags, high claim frequency) becomes unreliable. A vehicle that has been flagged as a total loss in one module may be unknown to another.

**Enforcement Rule:** All vehicle upserts must go through `upsertVehicleRegistry()`. New modules that process vehicles must look up or register the vehicle via the canonical registry, not create their own vehicle tables.

---

### NDL-09 · Driver Registry (`server/driver-registry.ts`)

**Rationale:** Same reasoning as the Vehicle Registry. The driver registry is the single source of truth for driver identity, enabling cross-claim driver signal detection (repeat claims, collusion patterns). Parallel driver records would make these signals unreliable.

**Enforcement Rule:** All driver upserts must go through the canonical driver registry with OCR-tolerant normalisation. New modules must not create separate driver identity stores.

---

### NDL-10 · Platform Roles Constant (`shared/roles.ts`)

**Rationale:** `PLATFORM_ROLES` and `INSURER_ROLES` are the authoritative lists of all roles in the system. Duplicate role lists (as existed before Fix 4) create the risk of role drift — where a new role is added to one list but not another, causing access control inconsistencies.

**Enforcement Rule:** All role references must import from `shared/roles.ts`. No module may define its own role list. New roles must be added to `shared/roles.ts` and the corresponding RBAC rules updated in `server/rbac.ts`.

---

## Summary Statistics

| Metric | Value |
|---|---|
| Total services inventoried | 29 |
| Services with dedicated test files | 22 |
| Services with zero test coverage | 7 (SR-05 reconciliation, SR-29 PDF storage, SR-17 claim-routing-engine, SR-28 metering, SR-23 evidence registry, SR-25 decision-governance dedicated, SR-07 photo-forensics dedicated) |
| Services that should be generalised | 18 |
| Services that are already domain-agnostic | 11 |
| Never-Duplicate services | 10 |
| Platform modules (routers) | 60 |
| Total TypeScript service files | 466 |
| Total test files | 273 |
| Test assertions passing | 8,316 |

---

*This document was generated from a full static analysis of the KINGA v3.0.0 codebase on 2026-07-31. It should be reviewed and updated whenever a new service is introduced or an existing service's contract changes.*
