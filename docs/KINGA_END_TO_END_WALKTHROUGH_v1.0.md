# KINGA End-to-End Platform Walkthrough
## Integration Proof: One Vehicle. One Platform. Eight Scenarios.

**Document Reference:** KINGA-E2E-v1.0  
**Classification:** Internal — Platform Architecture  
**Purpose:** Demonstrate that KINGA operates as a single integrated intelligence platform  
**Date:** 31 July 2026

---

## Executive Summary

This document traces a single vehicle — a 2021 Toyota Fortuner 2.8 GD-6 registered **GP 47 RX 23** — and its owner, **Mr Sipho Dlamini**, through eight complete platform scenarios. The vehicle is registered to a fleet operated by **Nexus Logistics (Pty) Ltd**, insured under **Sentinel Insurance Group**, and managed through the KINGA platform.

The walkthrough proves that KINGA is not a collection of modules — it is a single intelligence platform. Every piece of intelligence produced in Scenario 1 is available, enriched, and reused in Scenario 8. No intelligence is re-computed. No data is re-entered. No engine is duplicated. The vehicle's history, risk profile, damage record, and fraud signals accumulate in canonical platform tables and are consumed by every subsequent module without modification.

The document uses the following notation:

- `trpc.router.procedure` — the exact tRPC procedure invoked
- `TABLE: table_name` — the database table written or read
- `SERVICE: service_name` — the platform service consumed
- `ENGINE: engine_name` — the intelligence engine invoked
- `FEL:` — a Forensic Execution Ledger entry
- `AUDIT:` — an audit trail entry
- `INTEL REUSE ↑` — a point where intelligence produced in an earlier scenario is reused

---

## Scenario Reference Card

| # | Scenario | Primary Actor | Module | Key Intelligence Produced |
|---|---|---|---|---|
| S1 | Insurance Quotation | Mr Dlamini | Agency / Insurance | Vehicle valuation, risk score, quote record |
| S2 | Vehicle Verification | Agency Inspector | Agency | Verification report, vehicle condition, photo evidence |
| S3 | Policy Issuance | Underwriter | Insurance | Policy record, inception valuation, coverage terms |
| S4 | Motor Claim | Mr Dlamini / Assessor | Claims | AI assessment, fraud score, physics validation, FEL |
| S5 | Engineering Inspection | Engineer | Engineering | Physical measurements, reconciliation, inspection report |
| S6 | Fleet Monitoring | Fleet Manager | Fleet | Fleet risk score, cross-claim signals, driver profile |
| S7 | Vehicle Passport | Risk Manager | Vehicle Passport (E4) | Aggregated vehicle intelligence record |
| S8 | Executive Analytics | CEO / Risk Director | Executive Dashboards | Portfolio health, fraud trends, cost analytics |

---

## The Vehicle: GP 47 RX 23

Before any scenario begins, the vehicle exists in the **Vehicle Registry** — the canonical platform record for all vehicle intelligence.

```
TABLE: vehicleRegistry
  id:               VR-00847
  registrationNo:   GP 47 RX 23
  make:             Toyota
  model:            Fortuner 2.8 GD-6
  year:             2021
  colour:           White
  engineNo:         1GD-0284710
  vinNo:            AHTFZ29G600284710
  ownerId:          USR-00291 (Mr Sipho Dlamini)
  fleetId:          FL-00044 (Nexus Logistics)
  tenantId:         TNT-00012 (Sentinel Insurance Group)
  createdAt:        2021-08-15T08:00:00Z
```

This record is the **single source of truth** for the vehicle's identity across all eight scenarios. It is never duplicated.

---

## Scenario 1: Insurance Quotation

### 1.1 User Journey

Mr Dlamini contacts Sentinel Insurance Group's agency partner, **Prestige Motor Agency**, to obtain a comprehensive motor insurance quotation for his company vehicle. The agency user logs into KINGA and initiates the quotation workflow.

### 1.2 APIs Invoked

| Step | tRPC Procedure | Actor |
|---|---|---|
| 1 | `trpc.getVehicleValuation` (publicProcedure) | Agency user — retrieves current market value for GP 47 RX 23 |
| 2 | `trpc.agency.submitQuotation` | Agency user — creates the quotation record |
| 3 | `trpc.agency.getValuation` (agencyProcedure) | Agency user — retrieves the detailed valuation breakdown |
| 4 | `trpc.quoteOptimisation.*` | System — optimises the premium based on vehicle risk profile |

### 1.3 Platform Services Consumed

**SERVICE: Vehicle Valuation Service** (`server/services/vehicleValuation.ts`)  
The `getVehicleValuation` procedure invokes the Vehicle Valuation Service, which queries `vehicleMarketValuations` for the current retail, trade, and book values of a 2021 Toyota Fortuner 2.8 GD-6 with 47,200 km on the odometer. The service applies a depreciation curve and returns a structured valuation object with confidence interval.

**SERVICE: Vehicle Registry** (`server/vehicle-registry.ts`)  
The quotation procedure reads `vehicleRegistry` to confirm the vehicle's identity, VIN, engine number, and current ownership. This prevents the agency from quoting on a vehicle with a flagged registration.

### 1.4 Intelligence Engines Used

No AI pipeline engines are invoked at the quotation stage. The valuation is deterministic — it uses the registered market data from `vehicleMarketValuations` and the depreciation model in the Vehicle Valuation Service.

### 1.5 Evidence Generated

```
TABLE: agencyDocuments
  - Quotation request form (PDF, uploaded by agency user)
  - Vehicle registration certificate (PDF, uploaded by Mr Dlamini)
  - Driver's licence (PDF, uploaded by Mr Dlamini)

TABLE: vehicleMarketValuations
  - Retail value:  R 648,000
  - Trade value:   R 582,000
  - Book value:    R 601,500
  - Valuation date: 2026-03-01
  - Confidence:    HIGH (market data: 847 comparable transactions)
```

### 1.6 Reports Produced

No formal report is generated at the quotation stage. The agency user views the valuation summary inline.

### 1.7 Audit Trail Entries

```
AUDIT: {
  action:    "quotation_submitted",
  entityId:  QUO-00291,
  userId:    AGN-00044 (agency user),
  tenantId:  TNT-00012,
  timestamp: 2026-03-01T09:14:22Z
}
```

### 1.8 FEL Entries

No FEL entries at the quotation stage. The FEL is written exclusively by the AI Pipeline Orchestrator during claim assessment.

### 1.9 Governance Principles Exercised

| Principle | How Exercised |
|---|---|
| P-06 No Duplicate Valuation Logic | The quotation uses the canonical Vehicle Valuation Service — no inline valuation logic in the agency procedure |
| P-12 Platform Assets are Shared | The `vehicleMarketValuations` data produced here is available to all subsequent scenarios |
| P-16 Tenant Isolation | The quotation is scoped to `TNT-00012` — Prestige Motor Agency cannot see Sentinel's other clients |

### 1.10 Intelligence Produced for Reuse

```
INTEL PRODUCED:
  vehicleMarketValuations record for VR-00847:
    retail: R648,000 | trade: R582,000 | book: R601,500
  
  This valuation is consumed in:
    → S3 (Policy Issuance): inception value for sum insured
    → S4 (Motor Claim): pre-loss value for settlement calculation
    → S7 (Vehicle Passport): historical valuation timeline
    → S8 (Executive Analytics): portfolio exposure calculation
```

---

## Scenario 2: Vehicle Verification Before Policy Inception

### 2.1 User Journey

Before Sentinel Insurance Group issues the policy, their agency partner is required to conduct a pre-inception vehicle inspection. An agency inspector visits Mr Dlamini's premises, photographs the vehicle, and submits a verification report through KINGA.

### 2.2 APIs Invoked

| Step | tRPC Procedure | Actor |
|---|---|---|
| 1 | `trpc.agency.uploadDocument` | Inspector — uploads 12 vehicle photographs to S3 |
| 2 | `trpc.agency.getValuation` (agencyProcedure) | Inspector — retrieves the current valuation for the verification report |
| 3 | `trpc.agency.updateQuotation` | Inspector — records vehicle condition as "GOOD", no pre-existing damage |
| 4 | `trpc.reporting.generateReport` (key: `agency.vehicle_verification`) | System — generates the Vehicle Verification Report |

### 2.3 Platform Services Consumed

**SERVICE: Vehicle Registry** (`server/vehicle-registry.ts`)  
The verification procedure reads the vehicle's VIN and engine number from `vehicleRegistry` and validates them against the physical vehicle. Any discrepancy is flagged as a `crossClaimSignal` of type `VIN_MISMATCH`.

**SERVICE: Vehicle Valuation Service** (`server/services/vehicleValuation.ts`)  
The verification report includes the current market valuation, sourced from the canonical service. This is the same valuation produced in S1 — it is not re-computed.

**SERVICE: Report Renderer** (`server/reporting/templates/kingaDesignSystem.ts`)  
The Vehicle Verification Report is generated using `buildKingaHtml()` and stored in S3 via `storagePut()`.

**SERVICE: Document Intelligence** (`server/pipeline-v2/stage-1-documents.ts`)  
The 12 uploaded photographs are stored in `claimDocuments` with S3 keys. They are not yet processed by the AI pipeline — that occurs in S4 when a claim is submitted.

### 2.4 Intelligence Engines Used

No AI pipeline engines are invoked during vehicle verification. The Photo Forensics and Image Intelligence engines are reserved for the claims assessment pipeline.

### 2.5 Evidence Generated

```
TABLE: agencyDocuments (12 records)
  - Front-left exterior photograph
  - Front-right exterior photograph
  - Rear-left exterior photograph
  - Rear-right exterior photograph
  - Interior dashboard photograph
  - Engine bay photograph
  - Odometer reading photograph (47,200 km)
  - VIN plate photograph
  - Engine number photograph
  - Windscreen photograph
  - Tyre condition photographs (×2)

TABLE: vehicleConditionAssessment
  overallCondition:  GOOD
  preExistingDamage: NONE
  odometerReading:   47,200 km
  inspectionDate:    2026-03-02
  inspectorId:       AGN-00044
```

### 2.6 Reports Produced

**Vehicle Verification Report** (report key: `agency.vehicle_verification`)  
Generated via `buildKingaHtml()`. Stored in S3. Contains:
- Vehicle identity confirmation (VIN, engine number, registration)
- 12 photographs with timestamps and GPS coordinates
- Condition assessment: GOOD
- Pre-existing damage declaration: NONE
- Current market valuation: R648,000 (retail)
- Inspector signature and timestamp

```
TABLE: pdfReports
  reportType:  agency.vehicle_verification
  claimId:     null (pre-policy)
  vehicleId:   VR-00847
  s3Url:       s3://kinga-reports/TNT-00012/VR-00847/verification-2026-03-02.pdf
  tenantId:    TNT-00012
```

### 2.7 Audit Trail Entries

```
AUDIT: {
  action:    "vehicle_verification_completed",
  entityId:  VR-00847,
  userId:    AGN-00044,
  tenantId:  TNT-00012,
  timestamp: 2026-03-02T11:47:33Z,
  metadata:  { condition: "GOOD", odometerKm: 47200, reportUrl: "s3://..." }
}
```

### 2.8 FEL Entries

No FEL entries at the verification stage.

### 2.9 Governance Principles Exercised

| Principle | How Exercised |
|---|---|
| P-13 Evidence Must Preserve Provenance | All 12 photographs are stored with `uploadedBy`, `uploadedAt`, GPS metadata, and S3 key |
| P-18 Reports are Rendered Once | The verification report uses `buildKingaHtml()` — no alternative PDF generation |
| P-10 Every Inspection is Asset-Centric | The `vehicleConditionAssessment` record is linked to `VR-00847` — the canonical asset record |

### 2.10 Intelligence Produced for Reuse

```
INTEL PRODUCED:
  vehicleConditionAssessment for VR-00847:
    condition: GOOD | odometer: 47,200 km | preExistingDamage: NONE
  
  12 pre-inception photographs (S3 keys stored in agencyDocuments)
  
  This intelligence is consumed in:
    → S4 (Motor Claim): pre-loss condition baseline for damage assessment
    → S5 (Engineering Inspection): pre-existing damage baseline
    → S7 (Vehicle Passport): condition history timeline
```

---

## Scenario 3: Policy Issuance

### 3.1 User Journey

The quotation is accepted. The underwriter at Sentinel Insurance Group reviews the verification report, confirms the vehicle condition, and issues the policy. KINGA records the policy inception with the verified valuation as the sum insured.

### 3.2 APIs Invoked

| Step | tRPC Procedure | Actor |
|---|---|---|
| 1 | `trpc.insurers.*` (policy management procedures) | Underwriter — reviews quotation and verification report |
| 2 | `trpc.policyManagement.issuePolicy` (or inline `issuePolicyFromQuote`) | Underwriter — issues the policy |
| 3 | `trpc.agency.myPolicies` | Agency user — confirms policy issuance to Mr Dlamini |

### 3.3 Platform Services Consumed

**SERVICE: Vehicle Valuation Service** (`server/services/vehicleValuation.ts`)  
**INTEL REUSE ↑ S1:** The inception sum insured is set to R648,000 — the retail value produced in S1. The valuation is not re-computed; it is read from `vehicleMarketValuations` where it was stored in S1.

**SERVICE: Vehicle Registry** (`server/vehicle-registry.ts`)  
The policy record references `vehicleRegistry.id = VR-00847` as the insured asset. This creates the permanent link between the policy and the canonical vehicle record.

### 3.4 Intelligence Engines Used

No AI pipeline engines are invoked at policy issuance. The policy is a contractual record, not an intelligence output.

### 3.5 Evidence Generated

```
TABLE: insurancePolicies
  id:              POL-00847-2026
  policyNumber:    SNT/2026/GP47RX23/001
  vehicleId:       VR-00847
  driverId:        DRV-00291 (Mr Sipho Dlamini)
  fleetId:         FL-00044 (Nexus Logistics)
  tenantId:        TNT-00012
  inceptionDate:   2026-03-05
  expiryDate:      2027-03-04
  sumInsured:      R648,000
  premium:         R1,847/month
  coverType:       COMPREHENSIVE
  excess:          R5,000
  status:          ACTIVE
```

### 3.6 Reports Produced

No formal report is generated at policy issuance. The policy schedule is generated as a standard document outside the KINGA reporting pipeline.

### 3.7 Audit Trail Entries

```
AUDIT: {
  action:    "policy_issued",
  entityId:  POL-00847-2026,
  userId:    UND-00012 (underwriter),
  tenantId:  TNT-00012,
  timestamp: 2026-03-05T08:30:00Z,
  metadata:  { sumInsured: 648000, vehicleId: "VR-00847", policyNumber: "SNT/2026/GP47RX23/001" }
}
```

### 3.8 FEL Entries

No FEL entries at policy issuance.

### 3.9 Governance Principles Exercised

| Principle | How Exercised |
|---|---|
| P-06 No Duplicate Valuation Logic | Sum insured is sourced from the canonical `vehicleMarketValuations` record — not re-computed |
| P-01 Intelligence Belongs to the Platform | The policy record references the canonical vehicle and driver records — no private copies |

### 3.10 Intelligence Produced for Reuse

```
INTEL PRODUCED:
  insurancePolicies record POL-00847-2026:
    sumInsured: R648,000 | inceptionDate: 2026-03-05 | coverType: COMPREHENSIVE
  
  This intelligence is consumed in:
    → S4 (Motor Claim): policy validation and excess calculation
    → S6 (Fleet Monitoring): fleet insurance coverage tracking
    → S7 (Vehicle Passport): insurance history timeline
    → S8 (Executive Analytics): portfolio exposure and premium analytics
```

---

## Scenario 4: Motor Claim

### 4.1 User Journey

On 14 June 2026, the Toyota Fortuner is involved in a rear-end collision on the N1 highway. Mr Dlamini submits a claim through the KINGA portal. The claim enters the platform's AI assessment pipeline, which produces a comprehensive intelligence package. An assessor reviews the AI output and approves the claim.

This is the most intelligence-intensive scenario in the platform. Every major platform service is invoked.

### 4.2 APIs Invoked

| Step | tRPC Procedure | Actor |
|---|---|---|
| 1 | `trpc.claims.create` (createClaim) | Mr Dlamini — submits claim with incident description and photographs |
| 2 | `trpc.intakeGate.*` | System — validates claim completeness before pipeline entry |
| 3 | `trpc.claims.uploadDocument` | Mr Dlamini — uploads 8 damage photographs and police report |
| 4 | `trpc.claims.triggerAssessment` | System (auto) / Claims Manager — triggers AI pipeline |
| 5 | `trpc.assessors.*` (assignment) | System — assigns assessor via workload balancing |
| 6 | `trpc.claims.quotes.submit` | Panel beater — submits repair quotation |
| 7 | `trpc.quoteOptimisation.*` | System — optimises and validates the repair quotation |
| 8 | `trpc.claims.approve` | Assessor — approves claim with AI recommendation |
| 9 | `trpc.reporting.generateReport` (key: `claim.ai_assessment`) | System — generates Claims Intelligence Report |

### 4.3 Platform Services Consumed

The claim assessment pipeline invokes the following services in sequence:

**SERVICE: Document Intelligence** (`server/pipeline-v2/stage-1-documents.ts`, `stage-2-extraction.ts`, `stage-3-classification.ts`)  
The 8 damage photographs and police report are ingested, classified, and validated. The police report is OCR-extracted to produce structured incident data (date, location, third-party details, officer badge number).

**SERVICE: Image Intelligence** (`server/pipeline-v2/semanticImageClassifier.ts`)  
**INTEL REUSE ↑ S2:** The 8 claim photographs are compared against the 12 pre-inception photographs stored in S2. The Image Intelligence engine identifies that the rear bumper, left rear quarter panel, and boot lid are damaged — none of which showed damage in the pre-inception photographs. This confirms the damage is claim-related, not pre-existing.

**SERVICE: Photo Forensics** (`server/pipeline-v2/photoEnrichment.ts`)  
Each photograph is analysed for metadata integrity (GPS coordinates, timestamp consistency, EXIF data). The engine confirms all 8 photographs were taken on 14 June 2026 within 2 hours of the incident, at the GPS coordinates matching the N1 highway location.

**SERVICE: Vehicle Valuation Service** (`server/services/vehicleValuation.ts`)  
**INTEL REUSE ↑ S1, S3:** The pre-loss vehicle value is retrieved from `vehicleMarketValuations`. The vehicle is now 15 months old with 54,800 km (7,600 km added since inception). The service applies the depreciation curve and returns a current value of R589,000 retail. This is compared against the sum insured of R648,000 to confirm the claim is within policy limits.

**SERVICE: Physics Engine** (`server/pipeline-v2/stage-7-physics.ts`)  
The Physics Engine analyses the damage pattern against the reported impact scenario (rear-end collision at approximately 60 km/h). The engine validates that the damage extent (rear bumper, left rear quarter panel, boot lid) is **physically consistent** with a rear-end impact at that speed. The physics validation result is stored in `physicsValidationRecords`.

**SERVICE: Speed Inference Ensemble** (`server/pipeline-v2/speedInferenceEnsemble.ts`)  
The Speed Inference Ensemble analyses the deformation geometry from the photographs and estimates the impact speed at 58–67 km/h (95% confidence interval). This is consistent with the claimant's reported speed of 60 km/h.

**SERVICE: Fraud Intelligence Engine** (`server/fraud-scoring.ts`, `server/pipeline-v2/stage-8-fraud.ts`)  
The fraud engine runs a multi-layer assessment:
- Layer 1 (Behavioural): Policy age 101 days — within normal range. No previous claims on this vehicle.
- Layer 2 (Network): `crossClaimSignals` query for VR-00847 returns 0 signals. The third-party vehicle (GP 31 KL 88) is queried — 0 prior signals.
- Layer 3 (Physics): Physics validation PASSED — damage is consistent with reported scenario.
- Layer 4 (Document): Photo forensics PASSED — no metadata manipulation detected.
- **Composite Fraud Score: 12/100 (LOW RISK)**

**SERVICE: Cross-Stage Reconciliation** (`server/pipeline-v2/reconciliation-engine.ts`)  
The reconciliation engine validates consistency across all pipeline stages. The document stage, image stage, physics stage, and fraud stage all agree on the damage extent and incident scenario. Reconciliation result: CONSISTENT.

**SERVICE: Cost Estimation Engine** (`server/cost-optimization.ts`)  
The cost engine analyses the panel beater's quotation against the KINGA parts pricing baseline (`marketQuotes`) and historical repair costs for this damage type. The quotation of R42,800 is within 4.2% of the AI-estimated repair cost of R41,000. The engine approves the quotation.

**SERVICE: IFE — Input Fidelity Engine** (`server/pipeline-v2/inputFidelityEngine.ts`)  
The IFE assesses the completeness and quality of all input data. All required fields are present. Document quality is HIGH. Photo quality is HIGH. IFE score: 94/100.

**SERVICE: DOE — Decision Optimisation Engine** (`server/pipeline-v2/decisionOptimisationEngine.ts`)  
The DOE evaluates all repair quotations and produces a ranked recommendation. The single quotation from the panel beater is within the acceptable range. DOE recommendation: APPROVE at R42,800.

**SERVICE: Decision Transparency** (`server/pipeline-v2/decisionTransparencyLayer.ts`)  
The Decision Transparency Layer produces a human-readable explanation of the AI recommendation, documenting every factor that contributed to the APPROVE decision. This is stored in `claimDecisionLifecycle`.

**SERVICE: Assignment Engine** (`server/workload-balancing.ts`)  
The assessor is assigned using the workload balancing algorithm, which considers current queue depth, specialisation (motor claims), and geographic proximity. Assessor ASR-00089 is assigned.

**SERVICE: FEL Registry** (`server/pipeline-v2/forensicExecutionLedger.ts`)  
The FEL records the complete execution trace of the AI pipeline, including every stage's input hash, output hash, model version, execution time, and confidence score. This is stored in `aiAssessments.forensicExecutionLedgerJson`.

### 4.4 Intelligence Engines Used

| Engine | Stage | Result |
|---|---|---|
| Document Intelligence | Stage 1–3 | Police report extracted, 8 photos classified |
| Image Intelligence | Stage 4 | Damage confirmed: rear bumper, LRQ panel, boot lid |
| Photo Forensics | Stage 4 | Metadata integrity: PASSED |
| Physics Engine | Stage 7 | Impact consistency: VALIDATED (58–67 km/h) |
| Speed Inference Ensemble | Stage 7 | Speed estimate: 58–67 km/h |
| Fraud Intelligence Engine | Stage 8 | Fraud score: 12/100 (LOW) |
| IFE | Stage 9 | Input fidelity: 94/100 |
| DOE | Stage 9 | Decision: APPROVE at R42,800 |
| Cross-Stage Reconciliation | Stage 9 | Consistency: CONSISTENT |

### 4.5 Evidence Generated

```
TABLE: claims
  id:              CLM-00847-2026-001
  claimNumber:     SNT/CLM/2026/001847
  vehicleId:       VR-00847
  policyId:        POL-00847-2026
  driverId:        DRV-00291
  fleetId:         FL-00044
  tenantId:        TNT-00012
  incidentDate:    2026-06-14
  status:          approved
  estimatedLoss:   R42,800

TABLE: aiAssessments
  claimId:         CLM-00847-2026-001
  fraudScore:      12
  confidenceScore: 91
  recommendation:  APPROVE
  damageExtent:    ["rear_bumper", "lrq_panel", "boot_lid"]
  physicsValidated: true
  speedEstimate:   { min: 58, max: 67, unit: "km/h" }
  forensicExecutionLedgerJson: { ... 47 stage entries ... }

TABLE: physicsValidationRecords
  claimId:         CLM-00847-2026-001
  vehicleId:       VR-00847
  impactScenario:  REAR_END
  speedRange:      [58, 67]
  damageConsistent: true
  validatedAt:     2026-06-14T16:22:11Z

TABLE: vehicleDamageHistory (new record)
  vehicleId:       VR-00847
  claimId:         CLM-00847-2026-001
  damageDate:      2026-06-14
  damagedParts:    ["rear_bumper", "lrq_panel", "boot_lid"]
  repairCost:      R42,800
  fraudScore:      12
```

### 4.6 Reports Produced

**Claims Intelligence Report** (report key: `claim.ai_assessment`)  
Generated via `buildKingaHtml()`. Contains:
- Incident summary and timeline
- AI damage assessment with annotated photographs
- Physics validation result and speed inference
- Fraud score breakdown (12/100 — LOW)
- Cost analysis and quotation validation
- Decision transparency narrative
- Assessor review and approval record

```
TABLE: reportSnapshots
  claimId:     CLM-00847-2026-001
  reportType:  insurer
  version:     1
  auditHash:   sha256:a4f8c2...
  isImmutable: 1
```

### 4.7 Audit Trail Entries

```
AUDIT: claim_submitted       | CLM-00847-2026-001 | DRV-00291 | 2026-06-14T14:08:00Z
AUDIT: intake_gate_passed    | CLM-00847-2026-001 | SYSTEM    | 2026-06-14T14:08:45Z
AUDIT: pipeline_triggered    | CLM-00847-2026-001 | SYSTEM    | 2026-06-14T14:09:00Z
AUDIT: assessor_assigned     | CLM-00847-2026-001 | SYSTEM    | 2026-06-14T14:09:12Z (ASR-00089)
AUDIT: quotation_submitted   | CLM-00847-2026-001 | PNB-00177 | 2026-06-15T09:30:00Z
AUDIT: claim_approved        | CLM-00847-2026-001 | ASR-00089 | 2026-06-15T11:45:00Z
AUDIT: report_generated      | CLM-00847-2026-001 | SYSTEM    | 2026-06-15T11:46:00Z

TABLE: workflowAuditTrail (state transitions)
  submitted → triage → assessment_in_progress → quotes_pending → comparison → approved
```

### 4.8 FEL Entries

The FEL is written once per pipeline execution. It contains 47 stage entries covering every AI model invocation:

```
FEL: {
  claimId:         "CLM-00847-2026-001",
  pipelineVersion: "v2.4.1",
  executionId:     "EXE-20260614-847001",
  stages: [
    { stage: 1, name: "document_ingestion",    inputHash: "sha256:...", outputHash: "sha256:...", durationMs: 1240, modelVersion: "whisper-v3" },
    { stage: 2, name: "text_extraction",        inputHash: "sha256:...", outputHash: "sha256:...", durationMs: 890  },
    { stage: 3, name: "document_classification",inputHash: "sha256:...", outputHash: "sha256:...", durationMs: 340  },
    { stage: 4, name: "image_intelligence",     inputHash: "sha256:...", outputHash: "sha256:...", durationMs: 3210, modelVersion: "vision-v2.1" },
    { stage: 5, name: "photo_forensics",        inputHash: "sha256:...", outputHash: "sha256:...", durationMs: 1870 },
    { stage: 6, name: "vehicle_valuation",      inputHash: "sha256:...", outputHash: "sha256:...", durationMs: 120  },
    { stage: 7, name: "physics_validation",     inputHash: "sha256:...", outputHash: "sha256:...", durationMs: 2100, modelVersion: "physics-immutable-v1.0" },
    { stage: 8, name: "fraud_scoring",          inputHash: "sha256:...", outputHash: "sha256:...", durationMs: 890  },
    { stage: 9, name: "cost_optimisation",      inputHash: "sha256:...", outputHash: "sha256:...", durationMs: 560  },
    ... (38 additional sub-stage entries)
  ],
  ifeScore:        94,
  doeDecision:     "APPROVE",
  totalDurationMs: 14820,
  completedAt:     "2026-06-14T16:22:11Z"
}
```

### 4.9 Governance Principles Exercised

| Principle | How Exercised |
|---|---|
| P-01 Intelligence Belongs to the Platform | All AI outputs stored in canonical tables (`aiAssessments`, `physicsValidationRecords`, `vehicleDamageHistory`) |
| P-02 Modules Orchestrate Intelligence | The claims router calls `WorkflowEngine.transition()` and the pipeline orchestrator — it does not implement intelligence |
| P-05 No Duplicate Workflows | All state transitions use `WorkflowEngine.transition()` — 6 transitions, all governed |
| P-08 Physics Engine Immutability | The physics engine runs at `physics-immutable-v1.0` — no modifications since Epic 2 |
| P-09 AI is Advisory | The assessor reviews the AI recommendation before approval — the system does not auto-approve |
| P-13 Evidence Must Preserve Provenance | All 8 photographs stored with S3 keys, upload timestamps, and GPS metadata |
| P-20 The FEL is Inviolable | FEL written once, stored in `aiAssessments.forensicExecutionLedgerJson`, never updated |

### 4.10 Intelligence Produced for Reuse

```
INTEL PRODUCED:
  aiAssessments record for CLM-00847-2026-001:
    fraudScore: 12 | confidence: 91 | recommendation: APPROVE
    physicsValidated: true | speedRange: [58, 67]
  
  vehicleDamageHistory record for VR-00847:
    damagedParts: [rear_bumper, lrq_panel, boot_lid] | repairCost: R42,800
  
  physicsValidationRecords record:
    impactScenario: REAR_END | speedRange: [58, 67] | consistent: true
  
  This intelligence is consumed in:
    → S5 (Engineering Inspection): damage baseline for physical measurement validation
    → S6 (Fleet Monitoring): fleet risk score update, cross-claim signal check
    → S7 (Vehicle Passport): damage history, claim history, fraud score history
    → S8 (Executive Analytics): fraud trend, cost trend, processing time analytics
```

---

## Scenario 5: Engineering Inspection

### 5.1 User Journey

Following the claim approval, Sentinel Insurance Group commissions a post-repair engineering inspection to verify that the repairs were completed to the required standard. An engineer from **TechAssess Engineering** is assigned through KINGA. The engineer visits the panel beater's premises, takes physical measurements, and submits an inspection report.

### 5.2 APIs Invoked

| Step | tRPC Procedure | Actor |
|---|---|---|
| 1 | `trpc.inspections.create` (engineerDomainProcedure) | Claims manager — creates the inspection request |
| 2 | `trpc.inspections.assign` (engineerDomainProcedure) | System — assigns engineer via workload balancing |
| 3 | `trpc.inspections.addMeasurement` (engineerDomainProcedure) | Engineer — records physical measurements |
| 4 | `trpc.inspections.addObservation` (engineerDomainProcedure) | Engineer — records qualitative observations |
| 5 | `trpc.inspections.transcribeVoice` (engineerDomainProcedure) | Engineer — transcribes voice notes |
| 6 | `trpc.inspections.runAiAnalysis` (engineerDomainProcedure) | Engineer — triggers AI analysis of measurements |
| 7 | `trpc.inspections.runPhysicsReconciliation` (engineerDomainProcedure) | Engineer — reconciles measurements against claim physics |
| 8 | `trpc.inspections.approveAiAnalysis` (engineerDomainProcedure) | Engineer — approves the AI analysis |
| 9 | `trpc.reporting.generateReport` (key: `engineer.inspection_report`) | System — generates Engineering Inspection Report |

### 5.3 Platform Services Consumed

**SERVICE: Assignment Engine** (`server/workload-balancing.ts`)  
**INTEL REUSE ↑ S4:** The assignment engine considers the claim's damage profile (rear-end impact, body panel repairs) when selecting the engineer. Engineers with motor body repair specialisation are prioritised.

**SERVICE: Physics Engine** (`server/pipeline-v2/stage-7-physics.ts`)  
**INTEL REUSE ↑ S4:** The `runPhysicsReconciliation` procedure invokes the Physics Engine to validate the engineer's physical measurements against the physics validation record produced in S4. The engine confirms that the deformation measurements taken by the engineer are consistent with the S4 physics model (rear-end impact at 58–67 km/h). This is the cross-stage reconciliation between the claims pipeline and the engineering inspection.

**SERVICE: Cross-Stage Reconciliation** (`server/pipeline-v2/crossStageConsistencyEngine.ts`)  
The `reconcileEngineerMeasurements()` function compares the engineer's physical measurements against the AI pipeline's damage assessment from S4. The reconciliation confirms that the repaired panels match the damaged panels identified in S4 — no additional damage was repaired that was not in the original claim.

**SERVICE: LLM** (`server/_core/llm.ts`)  
The `draftObservationWithAi` procedure uses the LLM to draft a structured observation from the engineer's voice notes. The LLM is used in advisory capacity — the engineer reviews and approves the draft before it is committed.

**SERVICE: Voice Transcription** (`server/_core/voiceTranscription.ts`)  
The engineer's 3-minute voice note is transcribed using the Whisper API. The transcription is used as input to the LLM observation drafter.

**SERVICE: Report Renderer** (`server/reporting/templates/kingaDesignSystem.ts`)  
The Engineering Inspection Report is generated using `buildKingaHtml()`.

### 5.4 Intelligence Engines Used

| Engine | Invocation | Result |
|---|---|---|
| Physics Engine | `runPhysicsReconciliation` | Measurements consistent with S4 physics model |
| Cross-Stage Reconciliation | `reconcileEngineerMeasurements()` | Repaired panels match S4 damage assessment |
| LLM (Advisory) | `draftObservationWithAi` | Draft observation from voice notes |
| Voice Transcription | `transcribeVoice` | Voice notes → structured text |

### 5.5 Evidence Generated

```
TABLE: inspections
  id:              INS-00847-2026-001
  claimId:         CLM-00847-2026-001
  vehicleId:       VR-00847
  assetRef:        VR-00847
  engineerId:      ENG-00044 (TechAssess Engineering)
  status:          completed
  inspectionDate:  2026-07-02

TABLE: physicalMeasurements (3 records)
  - Rear bumper deformation depth: 0mm (repaired to OEM spec)
  - Left rear quarter panel gap: 4.2mm (within tolerance)
  - Boot lid alignment: 2.1mm offset (within tolerance)

TABLE: engineerObservations (2 records)
  - "Rear bumper replacement completed with OEM part. Paint match: EXCELLENT."
  - "Left rear quarter panel straightened and repainted. No filler detected."

TABLE: repairHistory (new record)
  vehicleId:       VR-00847
  claimId:         CLM-00847-2026-001
  repairDate:      2026-06-28
  repairedParts:   ["rear_bumper", "lrq_panel", "boot_lid"]
  repairQuality:   EXCELLENT
  inspectedBy:     ENG-00044
```

### 5.6 Reports Produced

**Engineering Inspection Report** (report key: `engineer.inspection_report`)  
Generated via `buildKingaHtml()`. Contains:
- Vehicle identity and claim reference
- Physical measurements with tolerances
- Engineer observations with photographic evidence
- Physics reconciliation result: CONSISTENT with S4 model
- Cross-stage reconciliation: CONSISTENT with S4 damage assessment
- Repair quality assessment: EXCELLENT
- Engineer certification and signature

### 5.7 Audit Trail Entries

```
AUDIT: inspection_created    | INS-00847-2026-001 | CLM-MGR-001 | 2026-06-29T08:00:00Z
AUDIT: engineer_assigned     | INS-00847-2026-001 | SYSTEM      | 2026-06-29T08:00:15Z (ENG-00044)
AUDIT: measurements_added    | INS-00847-2026-001 | ENG-00044   | 2026-07-02T10:15:00Z
AUDIT: physics_reconciled    | INS-00847-2026-001 | ENG-00044   | 2026-07-02T10:45:00Z (CONSISTENT)
AUDIT: inspection_completed  | INS-00847-2026-001 | ENG-00044   | 2026-07-02T11:30:00Z
AUDIT: report_generated      | INS-00847-2026-001 | SYSTEM      | 2026-07-02T11:31:00Z
```

### 5.8 FEL Entries

No new FEL entry is created for the engineering inspection. The FEL is exclusively written by the AI Pipeline Orchestrator during claim assessment. The `physicsReconciliation` result references the original FEL entry from S4 by `executionId`.

### 5.9 Governance Principles Exercised

| Principle | How Exercised |
|---|---|
| P-02 Modules Orchestrate Intelligence | The engineering router calls `reconcileEngineerMeasurements()` — it does not implement reconciliation logic |
| P-08 Physics Engine Immutability | The physics reconciliation uses the same immutable physics model as S4 |
| P-09 AI is Advisory | The LLM observation draft is reviewed and approved by the engineer before commitment |
| P-10 Every Inspection is Asset-Centric | The inspection is linked to `assetRef: VR-00847` — the canonical vehicle record |
| P-13 Evidence Must Preserve Provenance | All measurements and observations include `engineerId`, `timestamp`, and `inspectionId` |

### 5.10 Intelligence Produced for Reuse

```
INTEL PRODUCED:
  repairHistory record for VR-00847:
    repairedParts: [rear_bumper, lrq_panel, boot_lid] | quality: EXCELLENT
  
  physicalMeasurements: all within tolerance
  
  Physics reconciliation: CONSISTENT with S4 model
  
  This intelligence is consumed in:
    → S7 (Vehicle Passport): repair quality history, inspection record
    → S8 (Executive Analytics): engineer performance, repair quality trends
```

---

## Scenario 6: Fleet Monitoring

### 6.1 User Journey

The fleet manager at Nexus Logistics monitors the fleet's risk profile through KINGA. Following the claim in S4, the platform has automatically updated the fleet's risk score and generated cross-claim signals. The fleet manager reviews the updated risk profile and flags the vehicle for enhanced monitoring.

### 6.2 APIs Invoked

| Step | tRPC Procedure | Actor |
|---|---|---|
| 1 | `trpc.fleetAccounts.getClaimsForAccount` | Fleet manager — views all claims for FL-00044 |
| 2 | `trpc.crossClaim.getByClaim` | Fleet manager — checks cross-claim signals for CLM-00847-2026-001 |
| 3 | `trpc.crossClaim.getTopEntities` | Fleet manager — views top risk entities in the fleet |
| 4 | `trpc.crossClaim.getStats` | Fleet manager — views fleet-level fraud statistics |
| 5 | `trpc.fleetAccounts.flagClaimForReview` | Fleet manager — flags VR-00847 for enhanced monitoring |
| 6 | `trpc.analytics.getRiskManagerKPIs` | Fleet manager — views fleet risk KPIs |

### 6.3 Platform Services Consumed

**SERVICE: Cross-Claim Intelligence** (`server/cross-claim-intelligence.ts`)  
**INTEL REUSE ↑ S4:** The Cross-Claim Intelligence service queries `crossClaimSignals` for all vehicles in fleet FL-00044. The S4 claim has been processed and the fraud score of 12/100 has been stored. The service confirms that VR-00847 has no cross-claim signals — this is the vehicle's first claim.

**SERVICE: Fraud Intelligence Engine** (`server/fraud-scoring.ts`)  
**INTEL REUSE ↑ S4:** The fleet risk score is updated using the fraud scores from all claims in the fleet. The S4 claim's fraud score of 12/100 is incorporated into the fleet's rolling fraud profile. The fleet's composite fraud score remains LOW.

**SERVICE: Vehicle Registry** (`server/vehicle-registry.ts`)  
**INTEL REUSE ↑ S1, S2, S3:** The fleet monitoring view reads `vehicleRegistry` for all vehicles in FL-00044. VR-00847's record now includes the claim reference, damage history, and repair record from S4 and S5.

**SERVICE: Driver Registry** (`server/driver-registry.ts`)  
The driver profile for Mr Dlamini (DRV-00291) is updated with the claim event. The driver's claim frequency metric is updated from 0 to 1.

### 6.4 Intelligence Engines Used

No new AI pipeline engines are invoked during fleet monitoring. The fleet monitoring view consumes intelligence produced in S4 — it does not re-compute it.

### 6.5 Evidence Generated

```
TABLE: fleetRiskScores (updated)
  fleetId:         FL-00044
  vehicleCount:    23
  activeClaimCount: 1 (CLM-00847-2026-001 — now closed)
  compositeRiskScore: 18/100 (LOW — updated from 14/100)
  lastUpdated:     2026-07-02T12:00:00Z

TABLE: fleetAuditLogs
  action:    "vehicle_flagged_for_monitoring",
  vehicleId: VR-00847,
  fleetId:   FL-00044,
  userId:    FLT-MGR-00044,
  timestamp: 2026-07-02T14:00:00Z
```

### 6.6 Reports Produced

No formal report is generated during fleet monitoring. The fleet manager views the risk profile inline. A fleet risk report can be generated via `trpc.reporting.generateReport` (key: `fleet.risk_summary`) — this is available but not triggered in this scenario.

### 6.7 Audit Trail Entries

```
AUDIT: fleet_risk_score_updated  | FL-00044 | SYSTEM      | 2026-07-02T12:00:00Z
AUDIT: vehicle_flagged           | VR-00847 | FLT-MGR-00044 | 2026-07-02T14:00:00Z
```

### 6.8 FEL Entries

No FEL entries during fleet monitoring.

### 6.9 Governance Principles Exercised

| Principle | How Exercised |
|---|---|
| P-01 Intelligence Belongs to the Platform | Fleet risk scores are computed from canonical `aiAssessments` and `crossClaimSignals` — no private fleet intelligence tables |
| P-07 No Duplicate Fraud Logic | Fleet fraud profile uses the same fraud scores from `aiAssessments` — not re-computed by a fleet-specific fraud engine |
| P-12 Platform Assets are Shared | Vehicle Registry and Driver Registry data is read directly — no fleet-private copies |

### 6.10 Intelligence Produced for Reuse

```
INTEL PRODUCED:
  fleetRiskScores updated for FL-00044:
    compositeRiskScore: 18/100 | vehicleCount: 23
  
  Driver profile updated for DRV-00291:
    claimFrequency: 1 claim in 15 months
  
  This intelligence is consumed in:
    → S7 (Vehicle Passport): fleet membership and fleet risk context
    → S8 (Executive Analytics): fleet portfolio risk, driver risk profiles
```

---

## Scenario 7: Vehicle Passport Generation

### 7.1 User Journey

Three months after the claim is closed, a risk manager at Sentinel Insurance Group requests a Vehicle Passport for GP 47 RX 23 as part of a portfolio review. The Vehicle Passport aggregates all intelligence produced across S1–S6 into a single, comprehensive vehicle intelligence record. This is an Epic 4 capability.

### 7.2 APIs Invoked

| Step | tRPC Procedure | Actor |
|---|---|---|
| 1 | `trpc.vehiclePassport.getPassport` | Risk manager — retrieves the Vehicle Passport for VR-00847 |
| 2 | `trpc.vehiclePassport.getTimeline` | Risk manager — views the complete event timeline |
| 3 | `trpc.vehiclePassport.getRiskProfile` | Risk manager — views the current risk profile |
| 4 | `trpc.vehiclePassport.getClaimHistory` | Risk manager — views the complete claim history |
| 5 | `trpc.reporting.generateReport` (key: `vehicle.passport`) | Risk manager — generates the Vehicle Passport PDF |

### 7.3 Platform Services Consumed — Intelligence Reuse Summary

The Vehicle Passport is the definitive demonstration of platform intelligence reuse. Every piece of intelligence produced in S1–S6 is consumed here without re-computation.

| Intelligence Source | Scenario | Table Read | Data Consumed |
|---|---|---|---|
| Vehicle identity | S1 | `vehicleRegistry` | Make, model, VIN, engine number, registration |
| Market valuation history | S1, S3 | `vehicleMarketValuations` | Retail: R648,000 (S1) → R589,000 (S4) → R571,000 (current) |
| Pre-inception condition | S2 | `vehicleConditionAssessment` | GOOD condition, 47,200 km, no pre-existing damage |
| Pre-inception photographs | S2 | `agencyDocuments` | 12 photographs with GPS and timestamps |
| Policy record | S3 | `insurancePolicies` | POL-00847-2026, R648,000 sum insured |
| Claim record | S4 | `claims` | CLM-00847-2026-001, R42,800 settlement |
| AI assessment | S4 | `aiAssessments` | Fraud score 12/100, confidence 91%, APPROVE |
| Damage history | S4 | `vehicleDamageHistory` | Rear bumper, LRQ panel, boot lid — 14 June 2026 |
| Physics validation | S4 | `physicsValidationRecords` | VALIDATED, 58–67 km/h rear-end |
| FEL reference | S4 | `aiAssessments.forensicExecutionLedgerJson` | Pipeline execution trace |
| Repair record | S5 | `repairHistory` | EXCELLENT quality, all panels within tolerance |
| Inspection record | S5 | `inspections` | INS-00847-2026-001, physics reconciliation CONSISTENT |
| Fleet membership | S6 | `fleetVehicles` | FL-00044 (Nexus Logistics) |
| Fleet risk context | S6 | `fleetRiskScores` | Fleet composite risk: 18/100 |
| Driver profile | S6 | `drivers` | DRV-00291, 1 claim in 15 months |
| Cross-claim signals | S4, S6 | `crossClaimSignals` | 0 signals — no cross-claim fraud patterns |

### 7.4 Intelligence Engines Used

No new AI engines are invoked during Vehicle Passport generation. The passport is a pure aggregation of existing intelligence. This is the architectural proof of P-01 (Intelligence Belongs to the Platform) — the intelligence was produced once, stored canonically, and is now consumed by any authorised module.

### 7.5 Evidence Generated

```
TABLE: vehicle_passport_snapshots (Epic 4 — new)
  vehicleId:       VR-00847
  snapshotDate:    2026-10-01
  currentValue:    R571,000
  claimCount:      1
  totalClaimValue: R42,800
  fraudScore:      12 (lifetime average)
  repairQuality:   EXCELLENT
  physicsValidated: true
  conditionRating: GOOD (post-repair)
  odometerKm:      61,400 (estimated)
  fleetId:         FL-00044
  policyId:        POL-00847-2026
  snapshotHash:    sha256:b7e9d1...
```

### 7.6 Reports Produced

**Vehicle Passport Report** (report key: `vehicle.passport`)  
Generated via `buildKingaHtml()`. The most comprehensive single-vehicle report on the platform. Contains:
- Vehicle identity card (VIN, engine number, registration, photographs)
- Valuation timeline: R648,000 (March 2026) → R589,000 (June 2026) → R571,000 (October 2026)
- Pre-inception condition record with 12 photographs
- Policy history
- Complete claim history with AI assessment summary
- Physics validation record
- Repair quality certification
- Engineering inspection record
- Fleet membership and fleet risk context
- Driver profile summary
- Cross-claim signal history (0 signals)
- Risk rating: LOW

### 7.7 Audit Trail Entries

```
AUDIT: vehicle_passport_generated | VR-00847 | RSK-MGR-001 | 2026-10-01T09:00:00Z
AUDIT: report_access              | vehicle.passport | RSK-MGR-001 | 2026-10-01T09:00:15Z

TABLE: reportAccessAudit
  reportType:  vehicle.passport
  vehicleId:   VR-00847
  accessedBy:  RSK-MGR-001
  accessedAt:  2026-10-01T09:00:15Z
```

### 7.8 FEL Entries

No new FEL entries. The Vehicle Passport references the original FEL entry from S4 by `executionId: EXE-20260614-847001`.

### 7.9 Governance Principles Exercised

| Principle | How Exercised |
|---|---|
| P-01 Intelligence Belongs to the Platform | The passport aggregates 14 canonical tables — no intelligence is re-computed |
| P-03 Reuse Before Create | The passport creates zero new intelligence — it only reads and aggregates |
| P-12 Platform Assets are Shared | Vehicle Registry, Driver Registry, and all intelligence tables are shared across all modules |
| P-14 Every New Table Requires Justification | The single new table (`vehicle_passport_snapshots`) is justified as a performance cache — the underlying data remains in canonical tables |

---

## Scenario 8: Executive Portfolio Analytics

### 8.1 User Journey

The CEO and Risk Director of Sentinel Insurance Group review the quarterly portfolio performance through the KINGA Executive Dashboard. The dashboard aggregates intelligence from all claims, all vehicles, all fleet accounts, and all assessors processed during Q2 2026. The Toyota Fortuner claim (CLM-00847-2026-001) is one of 847 claims processed during the quarter.

### 8.2 APIs Invoked

| Step | tRPC Procedure | Actor |
|---|---|---|
| 1 | `trpc.executive.getClaimsVolumeOverTime` | CEO — views quarterly claims volume trend |
| 2 | `trpc.executive.getFraudDetectionTrends` | Risk Director — views fraud score distribution |
| 3 | `trpc.executive.getCostBreakdownByStatus` | CFO — views cost breakdown by claim status |
| 4 | `trpc.executive.getTotalAISavings` | CEO — views AI-driven cost savings |
| 5 | `trpc.executive.getFraudRiskDistribution` | Risk Director — views fraud risk distribution |
| 6 | `trpc.analytics.getKPIs` | Claims Manager — views operational KPIs |
| 7 | `trpc.analytics.getAssessorPerformance` | Claims Manager — views assessor performance |
| 8 | `trpc.analytics.getRiskManagerKPIs` | Risk Director — views risk-specific KPIs |
| 9 | `trpc.analytics.getFinancialOverview` | CFO — views financial overview |
| 10 | `trpc.reporting.generateReport` (key: `executive.portfolio_summary`) | CEO — generates quarterly portfolio report |

### 8.3 Platform Services Consumed

**INTEL REUSE ↑ S1–S7 (ALL SCENARIOS):**

Every executive analytics procedure reads from the canonical intelligence tables populated across all eight scenarios. The following table shows which S4 intelligence from the Toyota Fortuner claim contributes to each executive metric:

| Executive Metric | Table Read | S4 Contribution |
|---|---|---|
| Claims volume | `claims` | +1 claim (CLM-00847-2026-001) |
| Average fraud score | `aiAssessments` | Score: 12/100 (contributes to Q2 average) |
| AI savings | `aiAssessments`, `panelBeaterQuotes` | R1,800 saved (AI estimate R41,000 vs quoted R42,800) |
| Physics validation rate | `physicsValidationRecords` | +1 validated claim |
| Average processing time | `claims`, `workflowAuditTrail` | 1.1 days (submission to approval) |
| Assessor performance | `aiAssessments`, `claims` | ASR-00089: +1 approved claim |
| Fleet risk portfolio | `fleetRiskScores` | FL-00044: risk score 18/100 |
| Repair quality | `repairHistory` | +1 EXCELLENT quality repair |

**SERVICE: Report Renderer** (`server/reporting/templates/kingaDesignSystem.ts`)  
The quarterly portfolio report is generated using `buildKingaHtml()`.

**SERVICE: Fraud Intelligence Engine** (`server/fraud-scoring.ts`)  
**INTEL REUSE ↑ S4:** The portfolio fraud analytics read `aiAssessments.fraudScore` for all Q2 claims. The Toyota Fortuner's score of 12/100 contributes to the Q2 fraud distribution chart.

**SERVICE: Cost Estimation Engine** (`server/cost-optimization.ts`)  
**INTEL REUSE ↑ S4:** The AI savings calculation reads the cost optimisation results from `aiAssessments`. The R1,800 saving on the Toyota Fortuner claim is included in the Q2 total AI savings figure.

### 8.4 Intelligence Engines Used

No new AI engines are invoked during executive analytics. All analytics are computed from canonical intelligence tables. This is the architectural proof of P-01 at the portfolio level — intelligence produced at the claim level aggregates naturally to the portfolio level without re-computation.

### 8.5 Evidence Generated

```
No new tables written during executive analytics viewing.

TABLE: reportAccessAudit (read events logged)
  reportType:  executive.portfolio_summary
  accessedBy:  CEO-00001, RSK-DIR-001, CFO-00001
  accessedAt:  2026-10-15T09:00:00Z
```

### 8.6 Reports Produced

**Executive Portfolio Summary Report** (report key: `executive.portfolio_summary`)  
Generated via `buildKingaHtml()`. Contains:
- Q2 2026 claims volume: 847 claims
- Average fraud score: 19/100 (LOW portfolio risk)
- Physics validation rate: 94.2% (797 of 847 claims validated)
- Total AI savings: R2.4M (Q2 2026)
- Average processing time: 1.8 days
- Top risk fleet: FL-00044 (Nexus Logistics) — risk score 18/100
- Assessor performance leaderboard
- Cost breakdown by claim category
- Fraud trend: declining (Q1: 23/100 → Q2: 19/100)

### 8.7 Audit Trail Entries

```
AUDIT: executive_dashboard_accessed | CEO-00001    | 2026-10-15T09:00:00Z
AUDIT: portfolio_report_generated   | CEO-00001    | 2026-10-15T09:15:00Z
AUDIT: report_access                | RSK-DIR-001  | 2026-10-15T09:16:00Z
```

### 8.8 FEL Entries

No FEL entries during executive analytics. The FEL entries from all 847 Q2 claims (including S4's `EXE-20260614-847001`) are available for regulatory audit via the `super-audit` router.

### 8.9 Governance Principles Exercised

| Principle | How Exercised |
|---|---|
| P-01 Intelligence Belongs to the Platform | All portfolio analytics read from canonical tables — no private executive intelligence |
| P-02 Modules Orchestrate Intelligence | The executive router reads canonical tables — it does not re-compute intelligence |
| P-18 Reports are Rendered Once | The portfolio report uses `buildKingaHtml()` — same renderer as all other reports |
| P-16 Tenant Isolation | The executive dashboard is scoped to `TNT-00012` — Sentinel cannot see other insurers' data |

---

## Cross-Module Intelligence Reuse Map

The following diagram shows every point where intelligence produced in one scenario is consumed by a subsequent scenario. This is the definitive proof that KINGA operates as a single integrated platform.

```
INTELLIGENCE FLOW ACROSS 8 SCENARIOS
═══════════════════════════════════════════════════════════════════════════════════════

  S1: QUOTATION          S2: VERIFICATION       S3: POLICY ISSUANCE
  ─────────────────      ─────────────────      ─────────────────────
  vehicleMarketVal ──────────────────────────────────────────────────→ S4 (pre-loss value)
  vehicleMarketVal ──────────────────────────────→ sumInsured         → S7 (valuation history)
                         vehicleCondition ──────────────────────────→ S4 (damage baseline)
                         12 photographs ────────────────────────────→ S4 (pre-loss photos)
                         vehicleCondition ──────────────────────────→ S5 (pre-existing baseline)
                                                insurancePolicies ──→ S4 (policy validation)
                                                insurancePolicies ──→ S6 (fleet coverage)
                                                insurancePolicies ──→ S7 (policy history)
                                                insurancePolicies ──→ S8 (portfolio exposure)

  S4: MOTOR CLAIM
  ─────────────────────────────────────────────────────────────────────────────────────
  aiAssessments.fraudScore ──────────────────────────────────────────→ S6 (fleet risk)
  aiAssessments.fraudScore ──────────────────────────────────────────→ S7 (vehicle risk profile)
  aiAssessments.fraudScore ──────────────────────────────────────────→ S8 (portfolio fraud trend)
  vehicleDamageHistory ──────────────────────────────────────────────→ S5 (damage baseline)
  vehicleDamageHistory ──────────────────────────────────────────────→ S7 (damage history)
  physicsValidationRecords ──────────────────────────────────────────→ S5 (physics reconciliation)
  physicsValidationRecords ──────────────────────────────────────────→ S7 (physics history)
  physicsValidationRecords ──────────────────────────────────────────→ S8 (validation rate KPI)
  FEL (forensicExecutionLedger) ─────────────────────────────────────→ S7 (audit reference)
  FEL (forensicExecutionLedger) ─────────────────────────────────────→ S8 (regulatory audit)
  aiAssessments.costSaving ──────────────────────────────────────────→ S8 (AI savings KPI)
  workflowAuditTrail ────────────────────────────────────────────────→ S8 (processing time KPI)

  S5: ENGINEERING INSPECTION
  ─────────────────────────────────────────────────────────────────────────────────────
  repairHistory ─────────────────────────────────────────────────────→ S7 (repair quality)
  repairHistory ─────────────────────────────────────────────────────→ S8 (repair quality trend)
  inspections ───────────────────────────────────────────────────────→ S7 (inspection record)

  S6: FLEET MONITORING
  ─────────────────────────────────────────────────────────────────────────────────────
  fleetRiskScores ───────────────────────────────────────────────────→ S7 (fleet context)
  fleetRiskScores ───────────────────────────────────────────────────→ S8 (fleet portfolio)
  drivers (claimFrequency) ──────────────────────────────────────────→ S7 (driver profile)
  drivers (claimFrequency) ──────────────────────────────────────────→ S8 (driver risk analytics)

  S7: VEHICLE PASSPORT
  ─────────────────────────────────────────────────────────────────────────────────────
  vehicle_passport_snapshots ────────────────────────────────────────→ S8 (vehicle risk portfolio)

  CANONICAL TABLES (always available to all modules)
  ─────────────────────────────────────────────────────────────────────────────────────
  vehicleRegistry ───────────────────────────────────────────────────→ S1,S2,S3,S4,S5,S6,S7,S8
  crossClaimSignals ─────────────────────────────────────────────────→ S4,S6,S7,S8
```

---

## Platform Integration Proof Summary

The walkthrough demonstrates the following integration properties:

**1. Single Vehicle Record.** The `vehicleRegistry` record `VR-00847` is the only vehicle record on the platform. It is read 8 times across 8 scenarios. It is never duplicated.

**2. Single Valuation Source.** The `vehicleMarketValuations` record for VR-00847 is written once in S1 and read in S3, S4, S7, and S8. The valuation is never re-computed by a different engine.

**3. Single Workflow Engine.** The claim progresses through 6 state transitions across S4. Every transition uses `WorkflowEngine.transition()`. The workflow audit trail records all 6 transitions.

**4. Single FEL.** One FEL entry is written in S4 (`EXE-20260614-847001`). It is referenced in S7 and S8. It is never modified.

**5. Single Fraud Score.** The fraud score of 12/100 is computed once in S4. It is consumed in S6 (fleet risk), S7 (vehicle passport), and S8 (portfolio analytics). It is never re-computed.

**6. Single Physics Validation.** The physics validation is performed once in S4. It is reconciled (not re-performed) in S5. It is referenced in S7 and S8.

**7. Single Report Renderer.** All 5 reports generated across the 8 scenarios use `buildKingaHtml()`. No alternative PDF generation is used.

**8. Zero Intelligence Duplication.** Across 8 scenarios, 14 canonical tables, 29 platform services, and 9 intelligence engines, no intelligence is computed twice. Every subsequent module reads from the canonical store.

**This is one integrated platform.**

---

*End of Document — KINGA End-to-End Platform Walkthrough v1.0*  
*Issued by the KINGA Platform Architecture Team — 31 July 2026*
