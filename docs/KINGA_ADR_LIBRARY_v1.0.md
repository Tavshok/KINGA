# KINGA Architecture Decision Record Library

**Document Class:** Platform Architecture — Authoritative Reference  
**Version:** 1.0.0  
**Platform Version:** KINGA v3.0.0  
**Date:** 2026-07-31  
**Status:** Official  
**Custodian:** Platform Architecture

---

## Executive Summary

This library is the authoritative record of every significant architectural decision made during the design and evolution of the KINGA Motor Claims Intelligence Platform from Epic 1 through Epic 3. Each record captures the context that made a decision necessary, the decision itself, the consequences that followed, and the alternatives that were considered and rejected. Together, these records constitute the institutional memory of the platform's architecture and serve as the primary reference for engineers extending or modifying the system.

The records are ordered by architectural domain, beginning with the most foundational decisions (platform identity and workflow governance) and progressing through intelligence services, data architecture, and operational concerns.

---

## ADR Index

| ADR | Title | Status | Priority | Implementation |
|---|---|---|---|---|
| ADR-001 | Shared Intelligence Architecture | Accepted | Critical | Epic 1 |
| ADR-002 | Platform Workflow Engine | Accepted | Critical | Epic 1 |
| ADR-003 | RBAC Strategy | Accepted | Critical | Epic 1 |
| ADR-004 | AI Advisory Policy | Accepted | Critical | Epic 1 |
| ADR-005 | Physics Engine Immutability | Accepted | High | Epic 2 |
| ADR-006 | Engineering Measurement Integration | Accepted | High | Epic 2 |
| ADR-007 | Cross-Stage Reconciliation | Accepted | High | Epic 2 |
| ADR-008 | Evidence Model | Accepted | High | Epic 2 |
| ADR-009 | Report Architecture | Accepted | High | Epic 1–2 |
| ADR-010 | Vehicle Valuation Reuse | Accepted | High | Epic 2 |
| ADR-011 | Vehicle Passport Strategy | Accepted | High | Epic 3 |
| ADR-012 | Asset-Centric Inspection | Accepted | High | Epic 3 |
| ADR-013 | Assignment Strategy | Accepted | Medium | Epic 1 |
| ADR-014 | Platform Service Reuse | Accepted | Critical | Epic 1–3 |

---

## ADR-001 — Shared Intelligence Architecture

**Title:** All AI intelligence services are shared platform capabilities, not per-tenant or per-module implementations

**Status:** Accepted

### Context

During the design of Epic 1, the question arose of how AI intelligence capabilities (fraud scoring, physics analysis, damage assessment, cost estimation) should be structured. Two competing models were considered: a per-tenant model where each insurer tenant could configure or replace individual AI services, and a shared platform model where all tenants consume the same canonical intelligence stack.

The motor insurance market in southern Africa is characterised by high fraud rates, thin margins, and limited actuarial data. The platform's value proposition depends on the intelligence stack improving over time as it processes more claims. A per-tenant model would fragment the training signal and prevent cross-tenant learning. It would also create an unmanageable maintenance burden as each tenant's AI configuration diverged.

At the same time, the platform is designed to serve multiple insurers simultaneously, each with different risk appetites, product types, and geographic markets. The intelligence stack must therefore be configurable at the tenant level without being replaceable.

### Decision

All AI intelligence services — the Physics Engine, Fraud Intelligence Engine, Image Intelligence, Cost Estimation Engine, Vehicle Valuation Service, and Cross-Claim Intelligence Engine — are implemented as shared platform capabilities. Every tenant consumes the same canonical implementation. Tenant-specific behaviour is achieved through configuration parameters (fraud sensitivity thresholds, automation policy thresholds, fast-track rules) rather than through separate implementations.

Cross-tenant learning is enabled by design: the Cross-Claim Intelligence Engine queries across all tenants' historical data to detect repeat vehicles, repeat drivers, and repairer collusion patterns. This is the primary mechanism by which the platform's intelligence improves over time.

The intelligence stack is advisory only: it produces recommendations and evidence bundles, but no AI service may autonomously approve, reject, or pay a claim without a human decision in the governance layer.

### Consequences

**Positive.** The intelligence stack improves as claim volume grows across all tenants. Cross-tenant fraud signals (repeat vehicles, repeat drivers, repairer networks) are detectable. Maintenance is concentrated in a single implementation. New intelligence capabilities (e.g., the Speed Inference Ensemble in Epic 2) are immediately available to all tenants.

**Negative.** A bug in a shared intelligence service affects all tenants simultaneously. Tenant-specific intelligence requirements (e.g., a tenant operating in a market with different vehicle types) must be addressed through configuration rather than custom implementation, which may not always be sufficient.

**Constraint introduced.** No new intelligence capability may be implemented as a tenant-specific module. All intelligence must be contributed to the shared stack and made available to all tenants through configuration.

### Alternatives Considered

**Per-tenant AI configuration.** Each tenant could configure their own fraud scoring weights, physics parameters, and cost benchmarks. Rejected because it would fragment the cross-tenant learning signal and create an unmanageable configuration surface.

**Pluggable AI providers.** Tenants could replace individual AI services with their own implementations. Rejected because it would make the platform's output non-deterministic and undermine the audit trail.

**Federated learning.** Each tenant's data would train a separate model, with periodic aggregation. Rejected as architecturally premature for the current scale and as incompatible with the deterministic, rule-based fraud scoring approach chosen for regulatory defensibility.

### Related Components

`server/fraud-scoring.ts`, `server/weighted-fraud-scoring.ts`, `server/cross-claim-intelligence.ts`, `server/pipeline-v2/orchestrator.ts`, `server/services/vehicleValuation.ts`, `server/cost-optimization.ts`, `shared/roles.ts`

**Implementation Date:** Epic 1 (February 2026)  
**Priority:** Critical

---

## ADR-002 — Platform Workflow Engine

**Title:** All claim state transitions must pass through a single, centralised Workflow Engine

**Status:** Accepted

### Context

During Epic 1, claim state was managed through direct database updates scattered across multiple router procedures. By the time the platform reached production scale, at least three independent mechanisms for changing claim state had emerged: direct `db.update()` calls in `routers.ts`, a `transitionWorkflowState()` helper in `workflow.ts`, and the `WorkflowEngine.transition()` method in `workflow-engine.ts`. Each mechanism had different levels of governance enforcement. The `transitionWorkflowState()` helper bypassed the segregation-of-duties checks and the immutable audit trail that `WorkflowEngine.transition()` enforced.

The Platform Readiness Report (July 2026) classified this as a BLOCKER: any claim state change that bypassed the Workflow Engine was invisible to the governance audit trail and could not be replayed or audited. The report also identified that the fast-track dispatcher and the claim completion router were correctly using `WorkflowEngine.transition()`, while one procedure in `routers.ts` was still using the legacy `transitionWorkflowState()` helper.

### Decision

`WorkflowEngine.transition()` in `server/workflow-engine.ts` is the single, authoritative mechanism for all claim state changes. No other mechanism may change the `status` column on the `claims` table. The `transitionWorkflowState()` function in `workflow.ts` is deprecated and must not be used for new development. Direct `db.update()` calls on `claims.status` are prohibited.

The Workflow Engine enforces: (1) RBAC — only roles with the correct permission may trigger a given transition; (2) segregation of duties — the same person who submitted a claim may not approve it; (3) tenant isolation — transitions are scoped to the authenticated user's tenant; (4) immutable audit trail — every transition is recorded in `workflowAuditTrail` with the actor, timestamp, previous state, new state, and decision data; (5) AI snapshot capture — if an AI assessment exists at the time of transition, a snapshot is captured for the audit record.

### Consequences

**Positive.** Every claim state change is auditable, replayable, and governance-compliant. The audit trail is complete and immutable. Segregation-of-duties violations are detected at the engine level, not the UI level. The workflow configuration is tenant-specific (via `workflowConfiguration` table) without requiring separate engine implementations.

**Negative.** All claim state changes must pass through the engine, which adds latency for high-volume automated transitions (e.g., fast-track auto-approval). The engine's RBAC table (`WORKFLOW_TRANSITIONS` in `server/rbac.ts`) must be updated whenever a new transition is introduced, creating a maintenance dependency.

**Constraint introduced.** The `workflow.ts` module's `transitionWorkflowState()` function is deprecated. It must not be called from any new code. The deprecation notice has been added to the function's JSDoc. The function will be removed in a future sprint once all legacy call sites have been confirmed clear.

### Alternatives Considered

**Event sourcing.** Claim state would be derived from an immutable event log rather than a mutable status column. Rejected as architecturally premature and incompatible with the existing Drizzle ORM schema.

**State machine library (XState).** A formal state machine library would enforce valid transitions at the type level. Rejected because the transition table is tenant-configurable and cannot be fully expressed as a static type.

**Distributed saga pattern.** Long-running claim workflows would be managed by a saga orchestrator. Rejected as over-engineered for the current scale.

### Related Components

`server/workflow-engine.ts`, `server/rbac.ts`, `server/workflow.ts` (deprecated), `server/services/fast-track-dispatcher.ts`, `server/routers/claim-completion.ts`, `server/routers/approval.ts`, `drizzle/schema.ts` (workflowAuditTrail, workflowConfiguration)

**Implementation Date:** Epic 1 (February 2026); consolidated in Platform Readiness Remediation Sprint (July 2026)  
**Priority:** Critical

---

## ADR-003 — RBAC Strategy

**Title:** Role-based access control is implemented at two levels: platform roles and insurer roles, with a single shared constant as the source of truth

**Status:** Accepted

### Context

The KINGA platform serves multiple distinct actor types: platform operators (who manage the platform itself), insurer staff (who process claims), assessors (who evaluate damage), fleet operators (who manage vehicle fleets), and agency brokers (who sell policies). Each actor type requires a different set of permissions, and the permissions must be enforced consistently across all tRPC procedures, database queries, and UI routes.

During Epic 1, role constants were defined independently in multiple files. The Platform Readiness Report (July 2026) identified that `server/routers/platform-user-roles.ts` and `client/src/pages/PlatformUserRoleManager.tsx` each maintained their own `PLATFORM_ROLES` array, and the client array was missing four roles (`fleet_admin`, `fleet_manager`, `fleet_driver`, `engineer`) that existed in the server array. This created a risk of role drift where a new role added to one list would be invisible to the other.

### Decision

All role constants are defined in `shared/roles.ts` as the single source of truth. The file exports two constants: `PLATFORM_ROLES` (14 roles: `platform_super_admin`, `insurer_admin`, `claims_manager`, `claims_processor`, `assessor_internal`, `assessor_external`, `risk_manager`, `executive`, `fleet_admin`, `fleet_manager`, `fleet_driver`, `engineer`, `agency`, `marketplace_vendor`) and `INSURER_ROLES` (5 roles: `insurer_admin`, `claims_manager`, `claims_processor`, `assessor_internal`, `risk_manager`).

Access control is enforced at three levels. At the procedure level, tRPC procedures use `protectedProcedure`, `insurerDomainProcedure`, `agencyDomainProcedure`, or `adminProcedure` middleware from `server/_core/trpc.ts` and `server/_core/domain-middleware.ts`. At the state level, the `ROLE_STATE_ACCESS` table in `server/rbac.ts` maps each insurer role to the workflow states it may view. At the transition level, the `WORKFLOW_TRANSITIONS` table in `server/rbac.ts` maps each role to the transitions it may trigger.

The `user` table includes a `role` field (enum: `admin` | `user`) for the Manus OAuth identity layer, which is separate from the KINGA platform role system. Platform roles are stored in the `platformUserRoles` table and insurer roles are stored in the `insurerTenantUsers` table.

### Consequences

**Positive.** A single source of truth for role constants eliminates role drift. The three-level enforcement (procedure → state → transition) provides defence in depth. New roles can be added to `shared/roles.ts` and the corresponding RBAC rules updated in `server/rbac.ts` without touching any other file.

**Negative.** The two-role-system architecture (Manus OAuth role + KINGA platform role) adds complexity for new engineers who must understand that `ctx.user.role` is the OAuth role and the KINGA role must be looked up separately.

**Constraint introduced.** No module may define its own role list. All role references must import from `shared/roles.ts`. The `domain-middleware.ts` local `PLATFORM_ROLES` constant (which was a different concept — a list of routes requiring platform-level access) was renamed to `PLATFORM_ROUTE_ROLES` to avoid confusion with the shared constant.

### Alternatives Considered

**Database-driven RBAC.** Roles and permissions would be stored in the database and loaded at runtime. Rejected because it would make the permission model non-deterministic and difficult to audit. The current approach uses database storage for role assignments but code-defined permission rules.

**Attribute-based access control (ABAC).** Permissions would be based on attributes of the user, resource, and environment rather than roles. Rejected as over-engineered for the current actor model.

**Single role hierarchy.** All roles would be in a single hierarchy (e.g., `platform_super_admin > insurer_admin > claims_manager`). Rejected because platform roles and insurer roles are orthogonal — a `fleet_admin` is not a sub-type of `insurer_admin`.

### Related Components

`shared/roles.ts`, `server/rbac.ts`, `server/_core/trpc.ts`, `server/_core/domain-middleware.ts`, `server/routers/platform-user-roles.ts`, `client/src/pages/PlatformUserRoleManager.tsx`, `drizzle/schema.ts` (platformUserRoles, insurerTenantUsers)

**Implementation Date:** Epic 1 (February 2026); shared constant consolidated in Platform Readiness Remediation Sprint (July 2026)  
**Priority:** Critical

---

## ADR-004 — AI Advisory Policy

**Title:** All AI outputs are advisory only; no AI service may autonomously execute a financial or legal action without a human decision in the governance layer

**Status:** Accepted

### Context

The KINGA platform uses large language models and deterministic algorithms to analyse motor insurance claims. The output of this analysis — a recommended decision of APPROVE, REJECT, REVIEW, ESCALATE, NEGOTIATE, or PROCEED_TO_ASSESSMENT — has direct financial and legal consequences. If the AI were permitted to autonomously approve or reject claims, the platform would be making legally binding decisions without human oversight, which is incompatible with the regulatory environment in which the platform operates.

The fast-track engine (introduced in Epic 1) raised this question acutely: it is designed to automatically route low-risk claims through an AUTO_APPROVE action. The question was whether AUTO_APPROVE constitutes an autonomous AI decision or a human-configured automation rule.

### Decision

All AI outputs are advisory. The AI pipeline produces a recommended decision and a supporting evidence bundle; it does not execute the decision. Every claim that reaches a financial outcome (approved, rejected, payment authorised) must have a human actor recorded in the `workflowAuditTrail` as the decision-maker.

The fast-track engine's AUTO_APPROVE action is classified as a human-configured automation rule, not an autonomous AI decision. The rule is configured by an authorised human administrator (`insurer_admin` or `platform_super_admin`) who sets the eligibility criteria (confidence score threshold, fraud score ceiling, claim value ceiling). When the engine evaluates a claim against these rules, it is executing a human-authored policy, not making an independent decision. The human who configured the rule is the decision-maker of record.

The Decision Governance Service enforces this policy at the procedure level: any transition to `approved`, `rejected`, or `payment_authorized` that does not have a recorded human actor or a valid fast-track configuration reference is rejected with a governance violation error.

The AI pipeline is explicitly described in the Engineering Manual as "not a decision-making system in the legal sense — it produces recommendations and evidence bundles that human adjusters review and act on."

### Consequences

**Positive.** The platform is defensible in a regulatory context. Every financial outcome has a human decision-maker of record. The audit trail is complete. The fast-track engine can operate at scale without requiring a human to review every low-risk claim, because the human decision is embedded in the configuration of the automation rule.

**Negative.** The governance layer adds latency to every claim transition. The requirement to record a human actor for every financial outcome means that the fast-track engine must write a governance record attributing the decision to the configuration author, which adds complexity to the fast-track dispatcher.

**Constraint introduced.** No procedure may transition a claim to `approved`, `rejected`, or `payment_authorized` without either (a) a human actor in the session context or (b) a valid `fastTrackConfigId` reference in the transition data. The Decision Governance Service validates this constraint server-side.

### Alternatives Considered

**Full automation for low-risk claims.** Claims below a confidence and value threshold would be automatically approved without any governance record. Rejected on regulatory grounds.

**Human-in-the-loop for every claim.** Every claim would require a human review before any AI output is acted upon. Rejected as commercially unviable — the platform's value proposition depends on reducing the manual review burden for low-risk claims.

**Probabilistic approval.** Claims would be approved with a probability proportional to the AI confidence score, with the probability recorded as the decision. Rejected as legally indefensible.

### Related Components

`server/decision-governance.ts`, `server/services/fast-track-engine.ts`, `server/services/fast-track-dispatcher.ts`, `server/workflow-engine.ts`, `server/pipeline-v2/decisionOptimisationEngine.ts`, `drizzle/schema.ts` (governanceAuditLog, fastTrackConfig)

**Implementation Date:** Epic 1 (February 2026)  
**Priority:** Critical

---

## ADR-005 — Physics Engine Immutability

**Title:** The Physics Engine produces immutable, deterministic outputs that are never overwritten by downstream stages

**Status:** Accepted

### Context

The Physics Engine (Stage 7) computes speed estimates and physical consistency scores from vehicle damage photographs and incident data. These outputs are used by the Fraud Intelligence Engine (Stage 8), the Cost Estimation Engine (Stage 9), and the Forensic Decision Report. If a downstream stage could modify the physics output — for example, if the fraud engine could lower the consistency score to increase the fraud score — the physics output would no longer be a reliable, independent measurement.

The Epic 2 Physics Audit Findings identified a specific risk: the Stage 7 output was being passed by reference through the pipeline context, meaning that any stage could mutate it. The audit also identified that the `physicsNumericalContract.ts` cross-check was being called after Stage 7 and could theoretically overwrite the primary speed estimate.

### Decision

The Physics Engine output (`PhysicsTruth`) is frozen after Stage 7 completes. The pipeline context stores it as a read-only object. No downstream stage may modify any field of the `PhysicsTruth` object. The `physicsNumericalContract.ts` cross-check is classified as a validation pass, not a correction pass: it may flag inconsistencies but may not modify the `PhysicsTruth` output.

The Speed Inference Ensemble (Stage 7's sub-component) uses a weighted consensus of up to six independent measurement methods. The consensus result is final. If individual methods disagree, the disagreement is recorded in the `SpeedEnsembleResult.disagreementReport` field and surfaced in the Forensic report, but the consensus value is not adjusted.

The `PhysicsTruth` object is persisted to `ai_assessments.physics_truth_json` immediately after Stage 7 completes, before any downstream stage runs. This ensures that the physics output is preserved even if a downstream stage fails.

The Cross-Stage Reconciliation Engine may adopt a physics value over a conflicting downstream value (e.g., if Stage 9's cost estimate implies a speed inconsistent with Stage 7's measurement), but it may not modify the `PhysicsTruth` object itself — it records the reconciliation event and uses the physics value in the final output.

### Consequences

**Positive.** The physics output is a reliable, independent measurement that can be cited in a legal or regulatory context. The Forensic Decision Report can accurately describe the physics analysis as an objective measurement, not a negotiated value. The audit trail is clean.

**Negative.** If the Physics Engine produces an incorrect output (e.g., due to a bug in the Speed Inference Ensemble), the error propagates to all downstream stages and cannot be corrected without re-running the entire pipeline. The `forceRerun=true` flag must be used to correct a physics error.

**Constraint introduced.** No pipeline stage after Stage 7 may write to `ctx.physicsTruth`. The `reconciliation-engine.ts` may read from it and adopt its values but may not modify it. New stages that require physics data must consume the frozen `PhysicsTruth` object.

### Alternatives Considered

**Mutable physics output.** Downstream stages could refine the physics estimate as more evidence becomes available (e.g., if the fraud engine detects that the damage photos are inconsistent with the reported speed, it could lower the speed estimate). Rejected because it would make the physics output a negotiated value rather than an independent measurement, undermining its evidentiary value.

**Physics engine as a separate service.** The physics computation would run as a separate microservice that could be called multiple times with different inputs. Rejected as architecturally premature and as creating a distributed systems complexity that is not warranted at the current scale.

### Related Components

`server/pipeline-v2/stage-7-physics.ts`, `server/pipeline-v2/speedInferenceEnsemble.ts`, `server/pipeline-v2/physicsTruth.ts`, `server/pipeline-v2/physicsNumericalContract.ts`, `server/pipeline-v2/reconciliation-engine.ts`, `server/pipeline-v2/orchestrator.ts`

**Implementation Date:** Epic 2 (April 2026)  
**Priority:** High

---

## ADR-006 — Engineering Measurement Integration

**Title:** Physical measurements from engineering inspections are integrated into the AI pipeline as first-class evidence, not as post-hoc annotations

**Status:** Accepted

### Context

Epic 3 introduced the Inspection module, which enables qualified engineers to conduct physical inspections of vehicles and produce structured measurements (crush depth, deformation angle, component damage, structural displacement). These measurements are more accurate than the LLM-based visual estimates produced by the AI pipeline, because they are obtained from direct physical contact with the vehicle rather than from photographs.

The question was how to integrate engineering measurements into the AI pipeline. Two models were considered: a post-hoc annotation model where engineering measurements would be added as notes to an existing AI assessment, and a first-class evidence model where engineering measurements would be fed into the pipeline as a higher-confidence evidence source that could supersede the LLM estimates.

### Decision

Engineering measurements from inspections are integrated as first-class evidence in the AI pipeline. When an inspection is linked to a claim, the inspection's physical measurements are available to the Physics Engine as a `DIRECT_MEASUREMENT` evidence source with confidence weight 1.0 (the highest possible weight, above all LLM-based methods).

The Speed Inference Ensemble's method hierarchy is: M1 Direct Measurement (from inspection, weight 1.0) > M2 Campbell Stiffness (from crush depth, weight 0.85) > M3 Energy Balance (weight 0.80) > M4 VGR Cross-Image (weight 0.75) > M5 Airbag Deployment (weight 0.70) > M6 Severity-Anchored (weight 0.60). If a direct measurement is available, it dominates the consensus and the other methods are recorded as corroborating evidence.

The `claim_documents` table has an `inspection_id` FK column (added in Platform Readiness Remediation Sprint, July 2026) that links evidence documents to the inspection that produced them. This enables the pipeline to distinguish between documents submitted by the claimant and documents produced by the engineer.

The AI analysis in the inspection workflow is advisory only (consistent with ADR-004): the engineer must review and approve the AI analysis before it is incorporated into the inspection report.

### Consequences

**Positive.** Engineering measurements significantly improve the accuracy of the physics analysis for complex claims. The platform can produce a forensic report that cites direct physical measurements alongside LLM-based estimates, with clear attribution for each value. The inspection workflow creates a new revenue stream (engineering inspection as a service).

**Negative.** The integration of engineering measurements requires the pipeline to handle a new evidence source type that was not present in Epic 1 or Epic 2. The `inspection_id` FK on `claim_documents` must be populated correctly by the inspection router, or the pipeline will not be able to distinguish inspection documents from claimant documents.

**Constraint introduced.** Any new evidence source that produces physical measurements must be registered in the Speed Inference Ensemble's method hierarchy with an appropriate confidence weight. The method hierarchy is defined in `server/pipeline-v2/speedInferenceEnsemble.ts` and must not be modified without an architecture review.

### Related Components

`server/routers/inspections.ts`, `server/pipeline-v2/speedInferenceEnsemble.ts`, `server/pipeline-v2/stage-7-physics.ts`, `drizzle/schema.ts` (inspections, physicalMeasurements, engineerObservations, claim_documents.inspection_id), `server/pipeline-v2/evidencePluginRegistry.ts`

**Implementation Date:** Epic 3 (July 2026)  
**Priority:** High

---

## ADR-007 — Cross-Stage Reconciliation

**Title:** Conflicts between pipeline stage outputs are resolved by a dedicated Reconciliation Engine using confidence-priority arbitration, not by ad-hoc overrides

**Status:** Accepted

### Context

The KINGA pipeline produces multiple independent estimates for the same claim fields. Stage 6 (Damage Analysis) produces a `damageSeverity` estimate from visual inspection. Stage 7 (Physics Engine) produces a `damageSeverity` estimate from physics calculations. Stage 8 (Fraud Intelligence) produces a `fraudScore`. Stage 9 (Cost Estimation) produces an `estimatedCostUsd`. When these estimates conflict, the pipeline must resolve the conflict in a principled, auditable way.

Before Epic 2, conflicts were resolved ad-hoc: later stages would simply overwrite earlier stages' values without recording the conflict or the resolution rationale. This meant that the final output could not be traced back to its source, and the audit trail was incomplete.

### Decision

A dedicated Cross-Stage Reconciliation Engine (`server/pipeline-v2/reconciliation-engine.ts`) runs after Stage 9 and before the Claim Truth Layer. It arbitrates conflicts between stages using a single rule: if a later stage has higher confidence than an earlier stage for the same field, the later stage's value is adopted. Every reconciliation event is recorded as a `ReconciliationEvent` with the field name, previous value, previous source, previous confidence, adopted value, adopted source, adopted confidence, and rationale.

The five fields subject to reconciliation are: `estimatedSpeedKmh`, `fraudScore`, `damageSeverity`, `estimatedCostUsd`, and `incidentType`. These are the fields for which multiple stages produce independent estimates.

The reconciliation log is stored in `ai_assessments.reconciliationLog` and is surfaced in the Forensic Decision Report as a transparency section showing how conflicts were resolved.

The Claim Truth Layer (Truth Reconciliation Engine) runs after the Reconciliation Engine and applies a higher-level priority hierarchy: physics measurements > damage analysis > OCR extraction > claimant statements. The TRE produces the canonical `ClaimTruthObject` (CTO) that is the single source of truth for all downstream consumers.

### Consequences

**Positive.** Every value in the final output can be traced to its source stage and the reconciliation rationale. The audit trail is complete. The reconciliation logic is centralised and testable. The Forensic report can accurately describe how conflicts were resolved.

**Negative.** The reconciliation engine adds a processing step after Stage 9, increasing pipeline latency. The confidence-priority rule is simple and may not always produce the most accurate result (e.g., a later stage with high confidence may be wrong if it was trained on biased data).

**Constraint introduced.** Any new pipeline stage that produces a value for a field already tracked by the Reconciliation Engine must register its confidence score in the stage output so that the engine can arbitrate correctly. New fields that require reconciliation must be added to the engine's field list.

### Related Components

`server/pipeline-v2/reconciliation-engine.ts`, `server/pipeline-v2/orchestrator.ts`, `server/pipeline-v2/truthGovernanceRegistry.ts`, `server/pipeline-v2/truthReconciliationEngine.ts`, `server/pipeline-v2/claimTruthLayer.ts`

**Implementation Date:** Epic 2 (April 2026)  
**Priority:** High

---

## ADR-008 — Evidence Model

**Title:** Evidence is catalogued as a pure inventory before analysis, and the evidence registry is updated incrementally as stages complete

**Status:** Accepted

### Context

The KINGA pipeline processes claims that may contain a wide variety of evidence types: damage photographs, repair quotations, police reports, assessor reports, telematics data, EDR (airbag module) data, LIDAR scans, witness statements, and weather data. The pipeline must know what evidence is present before it can determine which analysis stages are applicable and what confidence level is achievable.

Before Epic 2, evidence availability was assessed implicitly: stages would attempt to process evidence and handle the absence of expected evidence through error handling. This made it difficult to distinguish between "evidence was absent" and "evidence processing failed", and it made the pipeline's behaviour difficult to predict for new claim types.

### Decision

Evidence is catalogued by a dedicated Evidence Registry Engine (Stage 0) that runs before any analysis stage. The registry classifies every piece of evidence as PRESENT, ABSENT, or UNKNOWN. It does not infer, guess, or analyse — it only inventories. The registry is updated incrementally as subsequent stages complete (Stage 0b updates the registry after image classification; Stage 38 scores evidence strength after all analysis stages).

The Evidence Plugin Registry (`server/pipeline-v2/evidencePluginRegistry.ts`) extends the evidence surface to non-document sources: telematics (OBD/GPS), EDR (airbag module), LIDAR, 3D scan, witness statements, police reports, and weather data. Each plugin registers its evidence type, the conditions under which it is available, and the confidence contribution it makes to the overall assessment.

The Decision Readiness Engine uses the evidence registry to determine whether the minimum evidence threshold for a given claim type has been met before allowing the pipeline to proceed to the decision stage. Claims that do not meet the minimum evidence threshold are routed to `PROCEED_TO_ASSESSMENT` rather than `APPROVE` or `REJECT`.

The raw OCR text from Stage 2 is stored in `ai_assessments.stage2RawOcrText` and is never overwritten — it is the immutable evidence record of what was in the document at the time of submission.

### Consequences

**Positive.** The pipeline's behaviour is predictable: stages can query the evidence registry to determine whether their required inputs are available before attempting to process them. The audit trail clearly distinguishes between absent evidence and processing failures. The evidence registry provides the foundation for the IFE's data completeness assessment.

**Negative.** The evidence registry adds a processing step at the start of the pipeline. The registry must be updated by each stage that discovers new evidence, creating a dependency between stages and the registry.

**Constraint introduced.** Any new pipeline stage that discovers evidence must update the evidence registry. New evidence source types must be registered in the Evidence Plugin Registry before they can be consumed by analysis stages.

### Related Components

`server/pipeline-v2/evidenceRegistryEngine.ts`, `server/pipeline-v2/evidencePluginRegistry.ts`, `server/pipeline-v2/evidenceStrengthScorer.ts`, `server/pipeline-v2/decisionReadinessEngine.ts`, `server/pipeline-v2/inputFidelityEngine.ts`, `server/pipeline-v2/orchestrator.ts`

**Implementation Date:** Epic 2 (April 2026)  
**Priority:** High

---

## ADR-009 — Report Architecture

**Title:** All platform reports use a single design system and are registered in a typed report registry with role-based access control

**Status:** Accepted

### Context

During Epic 1, reports were generated by ad-hoc HTML string concatenation in individual router procedures. Each report had its own styling, layout, and data access pattern. By Epic 2, the platform had accumulated seven distinct report types (Claims Intelligence, Forensic Decision, Vehicle Verification, Vehicle Valuation, Engineer Inspection, Risk Survey, and the KINGA AI Assessment Report) with no consistent visual identity, no role-based access control, and no mechanism for scheduling or queuing report generation.

The Epic 2 Architecture Freeze Report mandated that all new report templates must use the KINGA Design System (`server/reporting/templates/kingaDesignSystem.ts`) exclusively and register via `reportDefinitions.ts`. The design system enforces: black/white/grey palette with colour only in charts; specific typography hierarchy; immutable snapshot requirement before PDF generation.

### Decision

All platform reports are generated through the Report Renderer (`server/reporting/`), which consists of: a typed report registry (`reportDefinitions.ts`) mapping report keys to generation functions and role-based access rules; a report queue (`reportQueue.ts`) for asynchronous generation; a PDF renderer (`pdfRenderer.ts`) that converts HTML to PDF via Puppeteer; and the KINGA Design System (`kingaDesignSystem.ts`) providing all visual primitives.

The report registry uses the `REPORT_ACCESS` constant to define which roles may access each report. This constant is imported by `server/routers.ts` to enforce access control at the procedure level. New report types must be registered in `reportDefinitions.ts` with an explicit access rule before they can be generated.

Reports are generated in two phases: first, a `reportSnapshot` is created (an immutable JSON record of the data at the time of generation); second, the HTML is rendered from the snapshot; third, the PDF is generated from the HTML. The immutability of the snapshot ensures that the report can be regenerated identically at any future time, which is required for regulatory compliance.

The dual-layer system (HTML + PDF) allows the platform to serve reports in the browser for interactive viewing and as PDF attachments for regulatory submission.

### Consequences

**Positive.** All reports have a consistent visual identity. Role-based access is enforced at the registry level. Report snapshots are immutable, enabling regulatory compliance. New report types can be added without modifying the rendering infrastructure.

**Negative.** The design system constrains report layout to a specific visual language. Reports that require non-standard layouts (e.g., a multi-column actuarial table) must work within the design system's constraints or request a design system extension.

**Constraint introduced.** All new report templates must use `kingaDesignSystem.ts` primitives exclusively. No report template may use inline CSS or external stylesheets. Every report type must be registered in `reportDefinitions.ts` with an explicit access rule.

### Related Components

`server/reporting/reportDefinitions.ts`, `server/reporting/reportQueue.ts`, `server/reporting/pdfRenderer.ts`, `server/reporting/templates/kingaDesignSystem.ts`, `server/pdf-storage-service.ts`, `server/report-snapshot-service.ts`, `server/routers/reporting.ts`

**Implementation Date:** Epic 1 (February 2026); design system formalised in Epic 2 (April 2026)  
**Priority:** High

---

## ADR-010 — Vehicle Valuation Reuse

**Title:** The vehicle valuation capability is consolidated into a single canonical engine that serves all platform domains

**Status:** Accepted

### Context

The Platform Architecture Audit (July 2026) identified a HIGH finding: two independent vehicle valuation implementations existed in the codebase. `server/services/vehicleValuation.ts` was a multi-source valuation service supporting Zimbabwe, Zambia, and South Africa markets, using LLM estimation and Facebook Marketplace data. `server/insurance/valuation-engine.ts` was the Epic 2/3 engine connected to the `vehicleMarketValuations` database table and covered by tests. Both exposed a `getVehicleValuation`-style function with no documentation of which was authoritative.

The duplication created a risk that the two engines would produce different valuations for the same vehicle, making it impossible to produce a consistent report or a consistent audit trail.

### Decision

`server/insurance/valuation-engine.ts` is designated as the canonical vehicle valuation engine. It is the authoritative source for all vehicle valuations across the platform: claims processing, inspection reports, fleet vehicle book value tracking, and policy underwriting. The `server/services/vehicleValuation.ts` file's unique capabilities (multi-source waterfall, LLM fallback, Facebook Marketplace data, Zimbabwe/Zambia/South Africa market support) are to be merged into the canonical engine as additional data sources. The redundant file is to be deleted after the merge.

The canonical engine uses a six-source waterfall: (1) Facebook Marketplace, (2) classified listings, (3) AutoTrader SA, (4) historical claims database, (5) AI estimation via LLM, (6) manual assessor override. The waterfall is ordered by data quality: market data sources are preferred over AI estimation, and AI estimation is preferred over manual override. The engine records which source was used and the confidence score for each valuation.

The Vehicle Valuation Report (registered as `agency.vehicle_valuation` in the report registry) is generated from the canonical engine's output.

### Consequences

**Positive.** All vehicle valuations are produced by a single, auditable engine. The audit trail is consistent. The multi-source waterfall improves valuation accuracy by using the best available data source for each vehicle. The canonical engine is covered by tests.

**Negative.** The merge of the two engines requires careful testing to ensure that the multi-source waterfall behaves correctly for all supported markets. The Facebook Marketplace data source is external and may be unavailable, requiring the waterfall to fall back gracefully.

**Constraint introduced.** No new module may implement its own vehicle valuation logic. All vehicle valuations must be requested from the canonical engine. New data sources must be added to the canonical engine's waterfall, not implemented as standalone valuation functions.

### Related Components

`server/insurance/valuation-engine.ts` (canonical), `server/services/vehicleValuation.ts` (to be merged and deleted), `server/reporting/vehicleValuationReport.ts`, `drizzle/schema.ts` (vehicleMarketValuations)

**Implementation Date:** Epic 2 (April 2026); consolidation mandated in Platform Architecture Audit (July 2026)  
**Priority:** High

---

## ADR-011 — Vehicle Passport Strategy

**Title:** Vehicle identity is managed through a two-phase migration from vehicle_history to asset_registry, with dual-write during the transition period

**Status:** Accepted (Phase 1 approved; Phase 2 pending)

### Context

Epic 1 introduced the `vehicle_history` table as the canonical store for vehicle identity and damage history. Epic 3 introduced the `asset_registry` table as a more general asset identity store that can represent not only vehicles but also equipment, buildings, transformers, fire systems, solar plants, wind turbines, substations, and industrial assets. The Epic 3 Technical Design Specification correctly identified that `asset_registry` should become the master asset index, with vehicles migrating into it over time.

However, the migration path was not defined, and the two tables currently exist independently with no cross-reference. New inspections reference `asset_registry_id` (or fall back to `vehicle_registration`), but the vehicle data itself remains only in `vehicle_history`. This creates a fragmented asset identity model where the same vehicle may be represented in both tables with no link between them.

### Decision

The migration from `vehicle_history` to `asset_registry` is structured as a four-phase plan:

**Phase 1 (Approved — Epic 3):** Add `asset_registry_id INT NULL` to `vehicle_history` as a soft link. This creates the bridge without breaking any existing functionality. New vehicles registered through the Vehicle Registry are dual-written to both `vehicle_history` and `asset_registry`. The `asset_registry_id` column in `vehicle_history` is populated for dual-written vehicles.

**Phase 2 (Planned):** Backfill `asset_registry_id` for all existing `vehicle_history` records by creating corresponding `asset_registry` records. This is a data migration, not a schema migration.

**Phase 3 (Planned):** Migrate all read paths from `vehicle_history` to `asset_registry`. The `vehicle_history` table becomes a read-only archive.

**Phase 4 (Planned):** Deprecate `vehicle_history` and redirect all write paths to `asset_registry`. The `vehicle_history` table is retained as a historical archive.

The `asset_registry` table is designed to be extensible: the `metadata_json` column stores asset-type-specific fields (e.g., engine number, VIN, colour for vehicles; rated capacity, manufacturer, installation date for equipment). The `asset_type` column determines which fields are expected in `metadata_json`.

### Consequences

**Positive.** The `asset_registry` table provides a unified asset identity model that supports the platform's expansion into engineering inspection, fleet management, and property assessment. The phased migration minimises disruption to existing functionality.

**Negative.** During the transition period (Phases 1–3), the platform maintains two parallel asset identity stores, which increases the risk of data inconsistency. The dual-write pattern must be implemented carefully to ensure that both stores are always in sync.

**Constraint introduced.** All new modules that process vehicles must use the `asset_registry` as the primary identity store, with `vehicle_history` as a fallback for vehicles not yet migrated. The Vehicle Registry (`server/vehicle-registry.ts`) is the canonical entry point for vehicle identity operations and must be used by all modules.

### Related Components

`drizzle/schema.ts` (vehicle_history, asset_registry), `server/vehicle-registry.ts`, `server/routers/vehicle-registry.ts`, `server/routers/inspections.ts`, `server/routers/vehicle-structural-intelligence.ts`

**Implementation Date:** Phase 1 approved in Epic 3 (July 2026); Phases 2–4 pending  
**Priority:** High

---

## ADR-012 — Asset-Centric Inspection

**Title:** The inspection framework is asset-centric, not vehicle-centric, to enable reuse across all engineering domains

**Status:** Accepted

### Context

Epic 3 was originally scoped as a vehicle inspection module for motor claims. During the design phase, the question arose of whether the inspection framework should be specific to vehicles or generic enough to support other asset types. The platform's roadmap includes engineering inspection services for transformers, fire systems, solar plants, substations, and industrial equipment — all of which require the same core inspection workflow (schedule, assign, conduct, measure, observe, report) but with different asset-specific fields.

A vehicle-centric design would have required a separate inspection framework for each asset type, creating significant duplication and maintenance burden. The Epic 3 Technical Design Specification (Amendment 2) mandated an asset-centric design.

### Decision

The inspection entity always references an **asset**, not a vehicle. The `inspections` table uses `asset_registry_id` (FK to `asset_registry`) as the primary asset reference, with `vehicle_registration` as a convenience reference for motor claims during the transition period. The `asset_type` column on the `inspections` table determines the inspection type and the expected measurement schema.

The `inspection_type` column supports: `vehicle`, `engineering`, `risk_survey`, `fleet`, `property`, `equipment`, `industrial`. Each inspection type has its own set of expected measurements and observations, defined in the `physicalMeasurements` and `engineerObservations` tables. The `measurements_json` column on `physicalMeasurements` stores the type-specific measurement data as JSON, allowing the schema to be extended for new asset types without a database migration.

The AI analysis in the inspection workflow is advisory only (consistent with ADR-004). The `ai_analysis_json` column stores the AI's analysis of the inspection data, and the `ai_analysis_approved` flag records whether the engineer has reviewed and approved the AI analysis before it is incorporated into the report.

### Consequences

**Positive.** The inspection framework is immediately reusable for engineering inspection, fleet inspection, property inspection, and any other asset type. New asset types can be added by defining the expected measurement schema in the application layer, without a database migration. The `asset_registry` table provides the unified asset identity model that the inspection framework requires.

**Negative.** The asset-centric design adds complexity to the inspection workflow for the motor claims use case, where the asset is always a vehicle and the vehicle-specific fields (VIN, registration, make, model) are well-known. Engineers working on the motor claims integration must understand the asset-centric model even when they are only working with vehicles.

**Constraint introduced.** All new inspection types must reference an asset in `asset_registry`, not a vehicle in `vehicle_history`. The `vehicle_registration` convenience reference is permitted during the transition period (Phase 1 of ADR-011) but must be deprecated in Phase 3.

### Related Components

`drizzle/schema.ts` (inspections, physicalMeasurements, engineerObservations, asset_registry), `server/routers/inspections.ts`, `server/pipeline-v2/evidencePluginRegistry.ts`, `server/reporting/engineerInspectionReport.ts`

**Implementation Date:** Epic 3 (July 2026)  
**Priority:** High

---

## ADR-013 — Assignment Strategy

**Title:** Claim assignment uses a weighted workload scoring algorithm to ensure fair distribution, with fast-track automation as a configurable overlay

**Status:** Accepted

### Context

During Epic 1, claim assignment was manual: a claims manager would select a processor from a list and assign the claim. As claim volume grew, this became a bottleneck. The platform needed an automated assignment mechanism that could distribute claims fairly across available processors while accounting for claim complexity and risk.

Two competing models were considered: a round-robin model (simple, fair, but ignores workload) and a weighted workload model (more complex, but accounts for the actual burden of each claim on the processor).

### Decision

Claim assignment uses a weighted workload scoring algorithm (`server/workload-balancing.ts`). Each processor's workload score is computed as: `(active_claims × 1.0) + (complex_claims × 1.5) + (high_risk_claims × 2.0)`, where complex claims are those with `estimatedClaimValue > $20,000` and high-risk claims are those with `earlyFraudSuspicion = true`. The processor with the lowest weighted workload score is selected for assignment.

The fast-track engine provides a configurable overlay: claims that meet the fast-track eligibility criteria (confidence score, fraud score, claim value thresholds) are routed to AUTO_APPROVE, PRIORITY_QUEUE, REDUCED_DOCUMENTATION, or STRAIGHT_TO_PAYMENT before reaching the assignment step. This reduces the volume of claims that require manual assignment.

The Claim Routing Decision Engine (`server/claim-routing-engine.ts`) determines the workflow type (AI-only, hybrid, manual) based on the composite confidence score and the tenant's automation policy. Claims routed to `ai_only` do not require assignment to a human processor.

All assignment decisions are recorded in `claimRoutingDecisions` with the routing rationale, confidence score, and policy reference, providing a complete audit trail.

### Consequences

**Positive.** The weighted workload algorithm ensures that processors with complex or high-risk claims are not overloaded with additional assignments. The fast-track overlay reduces the manual assignment burden for low-risk claims. The routing decision audit trail enables performance analysis and policy tuning.

**Negative.** The weighted workload algorithm requires real-time workload data for all active processors, which adds a database query to the assignment path. The algorithm's weights (`1.0`, `1.5`, `2.0`) are hardcoded and may need to be tuned as the platform scales.

**Constraint introduced.** All claim assignments must go through the Assignment Engine. Direct database updates to the `assignedProcessorId` column are prohibited. The fast-track configuration must be set by an authorised administrator before fast-track routing can occur.

### Related Components

`server/workload-balancing.ts`, `server/claim-routing-engine.ts`, `server/services/fast-track-engine.ts`, `server/services/fast-track-dispatcher.ts`, `drizzle/schema.ts` (claimRoutingDecisions, fastTrackConfig, fastTrackRoutingLog)

**Implementation Date:** Epic 1 (February 2026)  
**Priority:** Medium

---

## ADR-014 — Platform Service Reuse

**Title:** No platform service may be independently reimplemented; all new features must integrate with existing canonical services

**Status:** Accepted

### Context

As the platform grew from Epic 1 through Epic 3, a pattern of parallel implementation emerged. The vehicle valuation service was implemented twice (ADR-010). The workflow engine was bypassed by a legacy helper function (ADR-002). The PLATFORM_ROLES constant was defined independently in the server and client (ADR-003). Each duplication created a risk of divergence, inconsistency, and audit trail fragmentation.

The Platform Service Registry (July 2026) identified 29 platform services and 10 services that must never be independently reimplemented. The Platform Readiness Report classified the workflow engine duplication as a BLOCKER and the vehicle valuation duplication as HIGH priority.

### Decision

The platform adopts a strict service reuse policy: no new feature may implement a capability that already exists as a canonical platform service. Before implementing any new capability, the engineer must consult the Platform Service Registry to determine whether an existing service can be extended or configured to meet the requirement.

The ten Never-Duplicate services (as defined in the Platform Service Registry) are: Workflow Engine, Fraud Intelligence Engine, Truth Governance Registry, Forensic Execution Ledger, Decision Governance Service, Tenant Isolation Layer, Immutable Routing Service, Vehicle Registry, Driver Registry, and Platform Roles Constant. These services represent foundational platform capabilities where independent reimplementation would create critical risks: data inconsistency, audit trail fragmentation, governance bypass, or security vulnerabilities.

The Architecture Freeze Review process (established in Epic 1 and formalised in Epic 2) requires every proposed change to pass a seven-question review: (1) Is this genuinely required? (2) Does an existing KINGA implementation already satisfy this requirement? (3) Can an existing component simply be exposed instead? (4) Is there a smaller change that achieves the same result? (5) Does this introduce unnecessary architectural complexity? (6) Does this duplicate an existing KINGA capability? (7) Does this violate any platform principles? A change classified as DUPLICATE is rejected.

### Consequences

**Positive.** The platform's capability surface is well-defined and auditable. New features build on existing services, improving them rather than duplicating them. The audit trail is consistent across all features. The maintenance burden is concentrated in canonical implementations.

**Negative.** The service reuse policy requires engineers to understand the full Platform Service Registry before implementing new features, which increases the onboarding burden. Extending an existing service to meet a new requirement may be more complex than implementing a standalone solution.

**Constraint introduced.** The Architecture Freeze Review process is mandatory for all changes that introduce new services, modify existing service contracts, or add new call sites to canonical services. The Platform Service Registry must be updated whenever a new service is introduced or an existing service's contract changes.

### Related Components

`docs/PLATFORM_SERVICE_REGISTRY.md`, `docs/KINGA-Architecture-Freeze-Report-Epic1.md`, `docs/KINGA-Architecture-Freeze-Report-Epic2.md`, `shared/roles.ts`, `server/workflow-engine.ts`, `server/vehicle-registry.ts`, `server/driver-registry.ts`

**Implementation Date:** Epic 1 (February 2026); formalised in Platform Readiness Remediation Sprint (July 2026)  
**Priority:** Critical

---

## Appendix A — ADR Template

For future ADRs, use the following template:

```markdown
## ADR-NNN — [Short Title]

**Title:** [Full descriptive title]

**Status:** [Proposed | Accepted | Deprecated | Superseded by ADR-NNN]

### Context

[What is the issue that is motivating this decision? What is the background?]

### Decision

[What is the change that we're proposing and/or doing?]

### Consequences

[What becomes easier or more difficult to do because of this change?]

### Alternatives Considered

[What other options were evaluated and why were they rejected?]

### Related Components

[List of source files, tables, or documents affected by this decision]

**Implementation Date:** [Epic N (Month Year)]  
**Priority:** [Critical | High | Medium | Low]
```

---

## Appendix B — Decision Status Definitions

| Status | Meaning |
|---|---|
| **Proposed** | Under discussion; not yet implemented |
| **Accepted** | Implemented and in effect |
| **Deprecated** | Superseded by a later decision; the old approach is still in the codebase but should not be used for new development |
| **Superseded** | Replaced by a specific later ADR; the old approach must be migrated away from |

---

## Appendix C — Priority Definitions

| Priority | Meaning |
|---|---|
| **Critical** | Violating this decision creates a security, regulatory, or data integrity risk |
| **High** | Violating this decision creates a significant technical debt or audit trail gap |
| **Medium** | Violating this decision creates a maintenance burden or consistency issue |
| **Low** | Violating this decision is suboptimal but has no immediate consequence |

---

*This document was produced from a full review of the KINGA codebase, Epic 1–3 Architecture Freeze Reports, the Platform Architecture Audit, the Platform Readiness Report, the Engineering Manual, and the Physics Audit Findings. It should be reviewed and updated whenever a new architectural decision is made.*
