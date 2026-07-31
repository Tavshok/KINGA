# KINGA Platform — Epic 4 Technical Design Specification
## Intelligence Platform Transformation

**Document Reference:** KINGA-TDS-E4-v1.0  
**Status:** Design Complete — Pending Implementation Approval  
**Classification:** Internal — Confidential  
**Prepared by:** Platform Architecture Team  
**Date:** 31 July 2026  
**Supersedes:** N/A (first Epic 4 design document)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Objectives and Scope](#2-objectives-and-scope)
3. [Architecture Overview](#3-architecture-overview)
4. [Platform Service Reuse Mandate](#4-platform-service-reuse-mandate)
5. [Module Designs](#5-module-designs)
   - 5.1 [Vehicle Passport](#51-vehicle-passport)
   - 5.2 [Asset Passport](#52-asset-passport)
   - 5.3 [Cross-Module Intelligence](#53-cross-module-intelligence)
   - 5.4 [Fleet Intelligence](#54-fleet-intelligence)
   - 5.5 [Engineering Intelligence](#55-engineering-intelligence)
   - 5.6 [Portfolio Intelligence](#56-portfolio-intelligence)
   - 5.7 [Executive Dashboards](#57-executive-dashboards)
   - 5.8 [Timeline Intelligence](#58-timeline-intelligence)
   - 5.9 [Predictive Analytics](#59-predictive-analytics)
6. [Database Design](#6-database-design)
7. [API Design](#7-api-design)
8. [UI Design](#8-ui-design)
9. [Report Architecture](#9-report-architecture)
10. [Reuse Matrix](#10-reuse-matrix)
11. [Testing Strategy](#11-testing-strategy)
12. [Dependencies](#12-dependencies)
13. [Implementation Sequence](#13-implementation-sequence)
14. [Regression Risks](#14-regression-risks)
15. [Acceptance Criteria](#15-acceptance-criteria)

---

## 1. Executive Summary

Epic 4 transforms KINGA from a motor claims processing system into a full **Intelligence Platform**. The platform already possesses 29 reusable services, a 14-stage AI pipeline, cross-claim fraud intelligence, engineering inspection capabilities, vehicle and driver registries, and a multi-tenant reporting stack. Epic 4 does not rebuild any of these capabilities. Instead, it **aggregates, surfaces, and connects** the intelligence that already exists across the platform into nine new modules that deliver persistent, longitudinal, and predictive value to every stakeholder tier.

The central architectural principle of Epic 4 is **intelligence without duplication**. Every signal, score, and decision produced by the existing pipeline is captured once and consumed many times. The Vehicle Passport reads from `vehicle_registry`, `vehicle_damage_history`, `vehicleMarketValuations`, `claimDocuments`, `inspections`, and `cross_claim_signals` — it does not re-run the pipeline. The Fleet Intelligence module reads from `fleets`, `fleetVehicles`, `fleetDrivers`, `fleetRiskScores`, and the Driver Registry — it does not re-score drivers. The Predictive Analytics module reads from `historicalClaims`, `trainingDataset`, and `qualityMetrics` — it does not retrain models.

Epic 4 introduces **nine new tRPC router modules**, **twelve new database views** (no new base tables except three aggregation tables), **nine new report keys**, and **six new UI pages**. The total new code footprint is estimated at approximately 4,200 lines of TypeScript and 2,800 lines of React/TSX — a modest addition relative to the platform's existing 180,000-line codebase.

---

## 2. Objectives and Scope

### 2.1 Primary Objectives

Epic 4 has three primary objectives, each building on the platform's existing intelligence foundation.

**Objective 1 — Persistent Asset Intelligence.** Every vehicle and non-vehicle asset processed by the platform must accumulate a permanent, cross-claim, cross-inspection intelligence record. This record — the Passport — must be available to every authorised stakeholder without requiring a new pipeline run. The Passport is a read model, not a processing model.

**Objective 2 — Cross-Module Intelligence Synthesis.** Intelligence produced in one module (e.g., a fraud signal from a claims pipeline run) must be automatically visible in every other module that involves the same asset, driver, fleet, or policy. Cross-module intelligence is achieved through the existing `cross_claim_signals`, `vehicleDamageHistory`, `driverClaims`, and `fleetRiskScores` tables — Epic 4 adds the query and presentation layer only.

**Objective 3 — Predictive and Portfolio Intelligence.** The platform must transition from reactive (what happened) to predictive (what will happen). Portfolio Intelligence surfaces aggregate risk exposure. Predictive Analytics surfaces forward-looking risk scores. Executive Dashboards surface real-time KPIs. Timeline Intelligence surfaces the longitudinal history of any asset, claim, or driver.

### 2.2 Scope Boundaries

**In Scope:**
- Vehicle Passport (aggregation view over existing data)
- Asset Passport (aggregation view over existing data)
- Cross-Module Intelligence (signal propagation layer)
- Fleet Intelligence (fleet-level risk and performance analytics)
- Engineering Intelligence (inspection trend and findings analytics)
- Portfolio Intelligence (insurer-level portfolio risk and exposure)
- Executive Dashboards (role-differentiated KPI dashboards)
- Timeline Intelligence (longitudinal event timeline for any entity)
- Predictive Analytics (risk scoring, renewal risk, fraud propensity)

**Out of Scope for Epic 4:**
- Retraining or replacing any AI model
- Modifying the 14-stage pipeline
- Modifying the Workflow Engine
- Modifying the Physics Engine
- Modifying the Fraud Intelligence Engine
- Modifying the Report Renderer (new report keys are added; the renderer is unchanged)
- Any new external data integrations (vehicle data bureaux, credit bureaux)
- Mobile application

### 2.3 Design Constraints

The following constraints are non-negotiable and derive directly from the Platform Service Reuse Mandate (ADR-014) and the Never-Duplicate list in the Platform Service Registry:

1. **No new workflow engine.** All state transitions use `workflow-engine.ts`.
2. **No new fraud scoring engine.** All fraud signals use `fraud-scoring.ts` and `cross-claim-intelligence.ts`.
3. **No new vehicle valuation engine.** All valuations use `vehicleValuation.ts`.
4. **No new physics engine.** All physics calculations use `stage-7-physics.ts`.
5. **No new report renderer.** All reports use `reporting/pdfRenderer.ts` and the KINGA Design System.
6. **No new role constants.** All roles use `shared/roles.ts`.
7. **No data migration.** Epic 4 reads existing data; it does not move or transform stored records.

---

## 3. Architecture Overview

### 3.1 Layered Intelligence Architecture

Epic 4 introduces a **fourth architectural layer** above the existing three:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 4 — INTELLIGENCE PLATFORM (Epic 4)                               │
│  Vehicle Passport · Asset Passport · Fleet Intelligence                  │
│  Portfolio Intelligence · Executive Dashboards · Predictive Analytics   │
│  Timeline Intelligence · Cross-Module Intelligence · Engineering Intel  │
├─────────────────────────────────────────────────────────────────────────┤
│  LAYER 3 — DOMAIN MODULES (Epics 1–3)                                   │
│  Claims Processing · Inspections · Fleet Management                     │
│  Agency · Insurance · Reporting · Audit                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  LAYER 2 — PLATFORM SERVICES (29 registered services)                   │
│  Workflow Engine · Physics Engine · Fraud Intelligence                  │
│  Vehicle Valuation · Cross-Claim Intelligence · Report Renderer         │
│  Assignment Engine · Document Intelligence · Cost Estimation            │
├─────────────────────────────────────────────────────────────────────────┤
│  LAYER 1 — DATA FOUNDATION                                              │
│  MySQL/TiDB · S3 · Drizzle ORM · 180+ schema tables                    │
└─────────────────────────────────────────────────────────────────────────┘
```

Layer 4 is **read-only with respect to Layer 1 base tables**. It writes only to three new aggregation tables (`vehicle_passport_snapshots`, `fleet_intelligence_snapshots`, `predictive_risk_scores`) and twelve new database views. It never writes to claims, inspections, pipeline results, or any Layer 2 service output table.

### 3.2 Data Flow Architecture

The intelligence data flow in Epic 4 follows a **fan-in aggregation** pattern. Multiple existing data sources converge into a single Passport or Intelligence object, which is then fanned out to multiple consumers.

```
vehicle_registry ──────────────────────────┐
vehicle_damage_history ────────────────────┤
vehicleMarketValuations ───────────────────┤──► VehiclePassportAggregator ──► Passport API
cross_claim_signals ───────────────────────┤                                  ──► Timeline API
inspections ───────────────────────────────┤                                  ──► Report
claimDocuments ────────────────────────────┘                                  ──► Dashboard

fleets ─────────────────────────────────────┐
fleetVehicles ──────────────────────────────┤──► FleetIntelligenceAggregator ──► Fleet API
fleetRiskScores ────────────────────────────┤                                   ──► Report
drivers / driverClaims ─────────────────────┘                                   ──► Dashboard

historicalClaims ───────────────────────────┐
trainingDataset ────────────────────────────┤──► PredictiveAnalyticsEngine ──► Risk Score API
qualityMetrics ─────────────────────────────┤                                 ──► Dashboard
claimConfidenceScores ──────────────────────┘                                 ──► Report
```

### 3.3 Tenancy and Isolation

All Epic 4 modules inherit the existing multi-tenant isolation model. Every aggregation query is scoped by `tenantId`. The Vehicle Passport is cross-tenant only for the `platform_super_admin` role (consistent with existing cross-insurer access in `executive.cross_insurer_fraud`). Fleet Intelligence is scoped to the fleet's owning insurer tenant. Predictive Analytics scores are tenant-scoped.

### 3.4 Authentication and Authorisation

Epic 4 adds nine new tRPC router modules. All use `protectedProcedure` from the existing auth framework. Role-based access follows `shared/roles.ts` and the existing `REPORT_ACCESS` map in `reportDefinitions.ts`. No new auth mechanisms are introduced.

---

## 4. Platform Service Reuse Mandate

The following table documents every existing platform service consumed by Epic 4, the specific module that consumes it, and the nature of the consumption. This table is the primary enforcement mechanism for the no-duplication constraint.

| Service | Registry ID | Epic 4 Consumer(s) | Consumption Type |
|---|---|---|---|
| Vehicle Registry | SR-12 | Vehicle Passport, Fleet Intelligence, Timeline Intelligence | Read — `vehicleRegistry` table queries |
| Vehicle Valuation Service | SR-11 | Vehicle Passport, Portfolio Intelligence | Read — `vehicleMarketValuations` table queries |
| Cross-Claim Intelligence | SR-14 | Vehicle Passport, Fleet Intelligence, Cross-Module Intelligence | Read — `crossClaimSignals` table queries |
| Fraud Intelligence Engine | SR-08 | Portfolio Intelligence, Predictive Analytics, Executive Dashboards | Read — `fraudSignals`, `claimConfidenceScores` table queries |
| Driver Registry | SR-13 | Fleet Intelligence, Timeline Intelligence, Cross-Module Intelligence | Read — `drivers`, `driverClaims` table queries |
| Physics Engine | SR-03 | Engineering Intelligence | Read — `physicsResults` in pipeline output JSON |
| Cost Estimation Engine | SR-09 | Portfolio Intelligence, Predictive Analytics | Read — `costDecisions`, `quoteLineItems` table queries |
| Report Renderer | SR-16 | All nine new report keys | Write — new report functions calling `buildKingaHtml()` |
| Workflow Engine | SR-01 | Timeline Intelligence | Read — `workflowHistory` table queries |
| Document Intelligence | SR-15 | Vehicle Passport, Asset Passport | Read — `claimDocuments` table queries |
| Repair Intelligence | SR-10 | Vehicle Passport, Portfolio Intelligence | Read — `repairHistory`, `panelBeaterQuotes` table queries |
| Confidence Scoring | SR-24 | Predictive Analytics, Executive Dashboards | Read — `claimConfidenceScores` table queries |
| FEL Registry | SR-20 | Engineering Intelligence, Executive Dashboards | Read — `felVersionRegistry` pipeline output |
| Truth Governance Registry | SR-19 | Cross-Module Intelligence | Read — `multiReferenceTruth` table queries |
| Notification Service | SR-27 | Predictive Analytics (risk threshold alerts) | Write — `notifyOwner()` for threshold breaches |
| Platform Metering | SR-28 | Executive Dashboards | Read — `usageAggregator` service queries |
| Asset Registry | SR-22 | Asset Passport, Engineering Intelligence | Read — `assetRegistry`, `inspections` table queries |
| Assignment Engine | SR-17 | Fleet Intelligence | Read — `claimAssignments` table queries |

---

## 5. Module Designs

### 5.1 Vehicle Passport

#### 5.1.1 Purpose

The Vehicle Passport is a **persistent, longitudinal intelligence record** for every vehicle that has passed through the KINGA platform. It aggregates data from claims processing, inspections, valuations, fraud signals, and repair history into a single, unified view of the vehicle's history and current risk profile. The Passport is not a new processing pipeline — it is a structured read model over existing data.

#### 5.1.2 Data Sources (all existing tables)

| Data Domain | Source Table(s) | Fields Consumed |
|---|---|---|
| Vehicle Identity | `vehicle_registry` | `registrationNumber`, `make`, `model`, `year`, `vin`, `colour`, `engineSize`, `fuelType` |
| Market Valuation | `vehicleMarketValuations` | `marketValue`, `replacementValue`, `depreciatedValue`, `valuationDate`, `valuationMethod` |
| Damage History | `vehicle_damage_history` | `damageZone`, `severity`, `repairCost`, `repairDate`, `isRepeatZone`, `fraudRiskScore` |
| Claim History | `claims` (via `vehicleId`) | `claimRef`, `incidentType`, `status`, `totalApprovedAmount`, `createdAt` |
| Fraud Signals | `cross_claim_signals` | `signalType`, `confidence`, `scoreContribution`, `detectedAt` |
| Inspection History | `inspections` (via `assetRef`) | `inspectionType`, `status`, `engineerName`, `completedAt` |
| Document Evidence | `claim_documents` (via `inspectionId`) | `documentType`, `fileUrl`, `uploadedAt` |
| Repair History | `repair_history` | `repairerId`, `repairType`, `partsCost`, `labourCost`, `completedAt` |
| Condition Assessment | `vehicle_condition_assessment` | `overallCondition`, `assessedAt`, `assessorNotes` |
| Mileage Log | `vehicle_mileage_logs` | `mileage`, `recordedAt`, `source` |

#### 5.1.3 Passport Object Model

The Vehicle Passport is a computed TypeScript object assembled by the `VehiclePassportAggregator` service. It is not stored as a single row — it is assembled on demand from the source tables and optionally cached in `vehicle_passport_snapshots` for performance.

```typescript
interface VehiclePassport {
  // Identity
  vehicleId: number;
  registrationNumber: string;
  make: string;
  model: string;
  year: number;
  vin: string | null;
  colour: string | null;
  
  // Valuation
  currentMarketValue: number | null;
  replacementValue: number | null;
  lastValuationDate: string | null;
  valuationMethod: string | null;
  
  // Claim Intelligence
  totalClaimsCount: number;
  totalApprovedClaimAmount: number;
  firstClaimDate: string | null;
  lastClaimDate: string | null;
  claimFrequencyScore: number; // 0–100, derived from claim count / vehicle age
  
  // Damage Intelligence
  damageZoneHistory: DamageZoneRecord[];
  repeatDamageZones: string[];
  totalRepairCost: number;
  
  // Fraud Intelligence
  crossClaimSignals: CrossClaimSignal[];
  aggregateFraudScore: number; // 0–100, max of all signal contributions
  isFlaggedForFraud: boolean;
  
  // Inspection History
  inspections: InspectionSummary[];
  lastInspectionDate: string | null;
  lastInspectionType: string | null;
  
  // Condition
  currentConditionRating: string | null; // 'excellent'|'good'|'fair'|'poor'
  mileage: number | null;
  lastMileageDate: string | null;
  
  // Risk Profile
  vehicleRiskScore: number; // 0–100, composite
  riskTier: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: string[];
  
  // Metadata
  passportGeneratedAt: string;
  dataCompleteness: number; // 0–100, percentage of fields populated
}
```

#### 5.1.4 Risk Score Computation

The Vehicle Passport risk score is a **composite read-only score** computed from existing signals. It does not invoke any AI model. The formula is:

```
vehicleRiskScore = min(100, 
  (claimFrequencyScore × 0.30) +
  (aggregateFraudScore × 0.35) +
  (repeatDamageZoneScore × 0.20) +
  (conditionDegradationScore × 0.15)
)
```

Where:
- `claimFrequencyScore` = `min(100, totalClaimsCount × 20)` (capped at 5 claims = 100)
- `aggregateFraudScore` = maximum `scoreContribution` across all `cross_claim_signals` for this vehicle
- `repeatDamageZoneScore` = `min(100, repeatDamageZones.length × 25)`
- `conditionDegradationScore` = derived from `vehicle_condition_assessment.overallCondition` (excellent=0, good=20, fair=50, poor=80)

#### 5.1.5 New Router: `server/routers/vehicle-passport.ts`

```typescript
// Procedures:
vehiclePassport.getByRegistration(input: { registrationNumber: string })
vehiclePassport.getById(input: { vehicleId: number })
vehiclePassport.getTimeline(input: { vehicleId: number })
vehiclePassport.getRiskProfile(input: { vehicleId: number })
vehiclePassport.search(input: { query: string; tenantId?: string })
vehiclePassport.getSnapshot(input: { vehicleId: number; asOf?: string })
```

#### 5.1.6 Caching Strategy

The full Passport object is expensive to assemble (8 table joins). A `vehicle_passport_snapshots` table stores the last computed Passport JSON with a `computedAt` timestamp. The snapshot is invalidated and recomputed when any of the source tables are written to for the relevant `vehicleId`. Invalidation is triggered by a lightweight event hook in `db.ts` — not a background job.

---

### 5.2 Asset Passport

#### 5.2.1 Purpose

The Asset Passport extends the Passport concept to all non-vehicle assets registered in `asset_registry` — equipment, buildings, transformers, fire systems, solar plants, wind turbines, substations, and industrial assets. It aggregates inspection history, risk ratings, maintenance records, and document evidence into a unified asset intelligence record.

#### 5.2.2 Data Sources

| Data Domain | Source Table(s) | Fields Consumed |
|---|---|---|
| Asset Identity | `asset_registry` | `assetRef`, `assetType`, `assetName`, `manufacturer`, `model`, `yearManufactured`, `locationAddress` |
| Inspection History | `inspections` | `inspectionType`, `status`, `engineerName`, `completedAt`, `findingsJson` |
| Risk Rating | `asset_registry.riskRating` | Current risk rating |
| Maintenance Records | `maintenanceRecords` | `maintenanceType`, `completedAt`, `cost`, `technicianName` |
| Maintenance Alerts | `maintenanceAlerts` | `alertType`, `severity`, `dueDate`, `resolvedAt` |
| Documents | `claim_documents` (via `inspectionId`) | `documentType`, `fileUrl`, `uploadedAt` |
| Risk Register | `risk_register` | `riskCategory`, `likelihood`, `impact`, `mitigationStatus` |

#### 5.2.3 Asset Passport Object Model

```typescript
interface AssetPassport {
  assetId: number;
  assetRef: string;
  assetType: string;
  assetName: string;
  manufacturer: string | null;
  model: string | null;
  yearManufactured: number | null;
  locationAddress: string | null;
  locationLat: number | null;
  locationLng: number | null;
  
  // Inspection Intelligence
  totalInspections: number;
  lastInspectionDate: string | null;
  lastInspectionType: string | null;
  lastInspectionStatus: string | null;
  inspectionFrequency: number | null; // average days between inspections
  
  // Risk Intelligence
  currentRiskRating: 'low' | 'medium' | 'high' | 'critical' | null;
  riskTrend: 'improving' | 'stable' | 'deteriorating' | null;
  openRisks: number;
  criticalRisks: number;
  
  // Maintenance Intelligence
  totalMaintenanceRecords: number;
  lastMaintenanceDate: string | null;
  openMaintenanceAlerts: number;
  overdueMaintenanceAlerts: number;
  totalMaintenanceCost: number;
  
  // Document Evidence
  documentCount: number;
  lastDocumentDate: string | null;
  
  // Composite Score
  assetHealthScore: number; // 0–100 (100 = best health)
  assetRiskScore: number;   // 0–100 (100 = highest risk)
  
  passportGeneratedAt: string;
  dataCompleteness: number;
}
```

#### 5.2.4 New Router: `server/routers/asset-passport.ts`

```typescript
assetPassport.getByRef(input: { assetRef: string })
assetPassport.getById(input: { assetId: number })
assetPassport.getTimeline(input: { assetId: number })
assetPassport.getRiskProfile(input: { assetId: number })
assetPassport.search(input: { query: string; assetType?: string; tenantId?: string })
assetPassport.getMaintenanceSchedule(input: { assetId: number })
```

---

### 5.3 Cross-Module Intelligence

#### 5.3.1 Purpose

Cross-Module Intelligence is the **signal propagation layer** that ensures intelligence produced in one module is automatically visible in every other module involving the same entity. It is not a new engine — it is a structured query and notification service that reads from the existing signal tables and surfaces them in the correct context.

#### 5.3.2 Signal Propagation Rules

| Signal Source | Signal Table | Propagated To |
|---|---|---|
| Claims pipeline fraud detection | `cross_claim_signals` | Vehicle Passport, Fleet Intelligence, Driver Profile |
| Inspection findings | `inspections.findingsJson` | Asset Passport, Engineering Intelligence, Portfolio Intelligence |
| Driver risk score update | `drivers.driverRiskScore` | Fleet Intelligence, Cross-Module Intelligence feed |
| Vehicle damage zone repeat | `vehicle_damage_history.isRepeatZone` | Vehicle Passport, Portfolio Intelligence, Fraud Intelligence |
| Truth governance violation | `governance_violation_log` | Executive Dashboard, Cross-Module Intelligence feed |
| Workflow escalation | `workflow_history` (escalation events) | Executive Dashboard, Portfolio Intelligence |

#### 5.3.3 Cross-Module Intelligence Feed

The Cross-Module Intelligence Feed is a real-time query endpoint that returns all active signals for a given entity (vehicle, driver, fleet, or asset) across all modules. It is consumed by the Vehicle Passport, Asset Passport, Fleet Intelligence, and Executive Dashboard modules.

```typescript
// New Router: server/routers/cross-module-intelligence.ts
crossModuleIntelligence.getEntitySignals(input: {
  entityType: 'vehicle' | 'driver' | 'fleet' | 'asset';
  entityId: number;
  signalTypes?: string[];
  since?: string;
})
crossModuleIntelligence.getActiveFraudSignals(input: { tenantId: string })
crossModuleIntelligence.getEscalationFeed(input: { tenantId: string; limit?: number })
crossModuleIntelligence.getTrustViolationFeed(input: { tenantId: string; limit?: number })
```

---

### 5.4 Fleet Intelligence

#### 5.4.1 Purpose

Fleet Intelligence transforms the existing fleet management module (Epic 2) from an operational tool into an **intelligence platform for fleet operators and insurers**. It aggregates vehicle risk scores, driver risk scores, claim frequencies, and maintenance patterns across an entire fleet to produce fleet-level risk profiles, performance benchmarks, and actionable recommendations.

#### 5.4.2 Data Sources

All data sources are existing tables. No new data is collected.

| Data Domain | Source Table(s) |
|---|---|
| Fleet Identity | `fleets`, `fleetAccounts` |
| Fleet Vehicles | `fleetVehicles` |
| Fleet Drivers | `fleetDrivers` |
| Fleet Risk Scores | `fleetRiskScores` |
| Vehicle Risk | `vehicle_registry`, `vehicle_damage_history`, `cross_claim_signals` |
| Driver Risk | `drivers`, `driverClaims` |
| Claims | `claims` (filtered by fleet vehicle registration) |
| Incidents | `fleetIncidentReports` |
| Audit | `fleetAuditLogs` |

#### 5.4.3 Fleet Intelligence Object Model

```typescript
interface FleetIntelligence {
  fleetId: number;
  fleetName: string;
  tenantId: string;
  
  // Fleet Composition
  totalVehicles: number;
  activeVehicles: number;
  totalDrivers: number;
  activeDrivers: number;
  
  // Risk Profile
  fleetRiskScore: number;           // 0–100, fleet-level composite
  fleetRiskTier: 'low'|'medium'|'high'|'critical';
  highRiskVehicles: number;         // vehicles with vehicleRiskScore > 70
  highRiskDrivers: number;          // drivers with driverRiskScore > 70
  
  // Claims Intelligence
  totalClaimsLast12Months: number;
  claimsFrequencyRate: number;      // claims per vehicle per year
  averageClaimCost: number;
  totalClaimCost12Months: number;
  fraudSignalCount: number;
  
  // Performance Benchmarks
  claimsFrequencyVsBenchmark: number;  // % above/below industry benchmark
  averageCostVsBenchmark: number;      // % above/below benchmark
  
  // Top Risk Vehicles (top 5)
  topRiskVehicles: VehicleRiskSummary[];
  
  // Top Risk Drivers (top 5)
  topRiskDrivers: DriverRiskSummary[];
  
  // Trend Data (last 12 months, monthly)
  claimsTrend: MonthlyMetric[];
  riskScoreTrend: MonthlyMetric[];
  
  computedAt: string;
}
```

#### 5.4.4 New Router: `server/routers/fleet-intelligence.ts`

```typescript
fleetIntelligence.getFleetProfile(input: { fleetId: number })
fleetIntelligence.getFleetRiskMatrix(input: { fleetId: number })
fleetIntelligence.getDriverLeaderboard(input: { fleetId: number; orderBy: 'risk'|'claims'|'atFault' })
fleetIntelligence.getVehicleLeaderboard(input: { fleetId: number; orderBy: 'risk'|'claims'|'cost' })
fleetIntelligence.getFleetTrends(input: { fleetId: number; months?: number })
fleetIntelligence.getFleetBenchmark(input: { fleetId: number })
fleetIntelligence.getFleetAlerts(input: { fleetId: number })
```

---

### 5.5 Engineering Intelligence

#### 5.5.1 Purpose

Engineering Intelligence aggregates data from the Epic 3 inspection module to produce **trend analysis, findings intelligence, and risk escalation patterns** across all engineering inspections. It serves the `engineer`, `insurer_admin`, and `platform_super_admin` roles.

#### 5.5.2 Data Sources

| Data Domain | Source Table(s) |
|---|---|
| Inspections | `inspections` |
| Asset Registry | `asset_registry` |
| Inspection Documents | `claim_documents` (via `inspectionId`) |
| Risk Register | `risk_register` |
| Maintenance Alerts | `maintenanceAlerts` |
| Physics Results | Pipeline output JSON in `inspections.findingsJson` |

#### 5.5.3 Engineering Intelligence Metrics

The Engineering Intelligence module produces the following metrics, all derived from existing data:

- **Inspection Completion Rate** — percentage of scheduled inspections completed on time
- **Average Findings per Inspection** — mean number of findings per inspection type
- **Critical Risk Escalation Rate** — percentage of inspections resulting in critical risk findings
- **Repeat Finding Rate** — percentage of findings that recur across consecutive inspections of the same asset
- **Asset Risk Distribution** — distribution of assets across risk tiers (low/medium/high/critical)
- **Engineer Performance Metrics** — findings per engineer, completion time, report quality score
- **Physics Validation Pass Rate** — percentage of inspections where physics engine validation passed
- **Maintenance Compliance Rate** — percentage of maintenance alerts resolved within SLA

#### 5.5.4 New Router: `server/routers/engineering-intelligence.ts`

```typescript
engineeringIntelligence.getPortfolioOverview(input: { tenantId: string; dateRange?: DateRange })
engineeringIntelligence.getAssetRiskDistribution(input: { tenantId: string; assetType?: string })
engineeringIntelligence.getFindingsTrends(input: { tenantId: string; months?: number })
engineeringIntelligence.getEngineerPerformance(input: { tenantId: string })
engineeringIntelligence.getCriticalEscalations(input: { tenantId: string; limit?: number })
engineeringIntelligence.getRepeatFindingsAnalysis(input: { tenantId: string })
```

---

### 5.6 Portfolio Intelligence

#### 5.6.1 Purpose

Portfolio Intelligence provides **insurer-level aggregate risk and financial exposure analysis** across the entire claims portfolio. It is the primary analytical tool for `claims_manager`, `risk_manager`, and `executive` roles. It reads from existing claims, fraud, cost, and policy data — it does not re-process any claims.

#### 5.6.2 Portfolio Intelligence Dimensions

Portfolio Intelligence is organised around five analytical dimensions:

**Dimension 1 — Exposure Analysis.** Total outstanding liability, reserve adequacy, large loss concentration, and catastrophe exposure. Sources: `claims`, `claimConfidenceScores`, `costDecisions`.

**Dimension 2 — Fraud Intelligence.** Portfolio-level fraud rate, fraud signal distribution, confirmed fraud cases, estimated fraud savings, and emerging fraud patterns. Sources: `fraudSignals`, `crossClaimSignals`, `claimConfidenceScores`.

**Dimension 3 — Operational Performance.** Claims cycle time, dwell time by stage, assessor utilisation, panel beater performance, and SLA compliance. Sources: `workflowHistory`, `claimAssignments`, `repairHistory`.

**Dimension 4 — Financial Performance.** Loss ratio, average claim cost, cost variance (AI estimate vs approved), reserve movements, and recovery rates. Sources: `claims`, `quoteLineItems`, `costDecisions`.

**Dimension 5 — Risk Concentration.** Geographic concentration, vehicle make/model concentration, incident type distribution, and repeat claimant concentration. Sources: `claims`, `vehicleRegistry`, `driverClaims`.

#### 5.6.3 New Router: `server/routers/portfolio-intelligence.ts`

```typescript
portfolioIntelligence.getExposureSummary(input: { tenantId: string; asOf?: string })
portfolioIntelligence.getFraudIntelligence(input: { tenantId: string; dateRange?: DateRange })
portfolioIntelligence.getOperationalPerformance(input: { tenantId: string; dateRange?: DateRange })
portfolioIntelligence.getFinancialPerformance(input: { tenantId: string; dateRange?: DateRange })
portfolioIntelligence.getRiskConcentration(input: { tenantId: string })
portfolioIntelligence.getBenchmarkComparison(input: { tenantId: string })
portfolioIntelligence.getPortfolioTrends(input: { tenantId: string; months?: number })
```

---

### 5.7 Executive Dashboards

#### 5.7.1 Purpose

Executive Dashboards provide **role-differentiated, real-time KPI views** for every stakeholder tier. The design principle is that each role sees only the intelligence relevant to their decision-making authority — no information overload, no missing context.

#### 5.7.2 Dashboard Tiers

| Dashboard | Primary Role(s) | Key Metrics |
|---|---|---|
| **Platform Executive Dashboard** | `platform_super_admin` | Cross-insurer claims volume, AI pipeline health, fraud detection rate, platform revenue, tenant activity |
| **Insurer Executive Dashboard** | `executive`, `insurer_admin` | Portfolio loss ratio, fraud rate, claims cycle time, reserve adequacy, top risk vehicles/drivers |
| **Claims Manager Dashboard** | `claims_manager` | Open claims by stage, SLA breaches, assessor utilisation, dwell time, escalation queue |
| **Risk Manager Dashboard** | `risk_manager` | Fraud signal feed, risk concentration map, emerging patterns, governance violations |
| **Fleet Manager Dashboard** | `fleet_manager` | Fleet risk score, high-risk vehicles, high-risk drivers, claim frequency, incident feed |
| **Engineer Dashboard** | `engineer` | Assigned inspections, overdue inspections, critical findings, asset risk distribution |

#### 5.7.3 Dashboard Architecture

Each dashboard is a **React page** that composes data from multiple tRPC queries. Dashboards do not have their own backend router — they consume the existing module routers (Portfolio Intelligence, Fleet Intelligence, Engineering Intelligence, Cross-Module Intelligence) and the existing reporting procedures.

The dashboard pages are:
- `client/src/pages/dashboards/PlatformExecutiveDashboard.tsx`
- `client/src/pages/dashboards/InsurerExecutiveDashboard.tsx`
- `client/src/pages/dashboards/ClaimsManagerDashboard.tsx`
- `client/src/pages/dashboards/RiskManagerDashboard.tsx`
- `client/src/pages/dashboards/FleetManagerDashboard.tsx`
- `client/src/pages/dashboards/EngineerDashboard.tsx`

#### 5.7.4 Visualisation Standards

All dashboard charts use **Chart.js v3** (already in the project dependencies). The KINGA Design System colour palette is used for all charts. The following chart types are used:

- **Line charts** — trend data (claims over time, risk score trends)
- **Bar charts** — comparative data (claims by stage, cost by category)
- **Doughnut charts** — distribution data (fraud signal types, risk tier distribution)
- **Scatter plots** — correlation data (claim cost vs fraud score)
- **Heat maps** — geographic concentration (using the existing Map component)

No new charting library is introduced.

---

### 5.8 Timeline Intelligence

#### 5.8.1 Purpose

Timeline Intelligence provides a **chronological, multi-source event timeline** for any entity on the platform — a vehicle, a driver, a fleet, an asset, or a claim. It aggregates events from all relevant tables and presents them in a unified, filterable timeline view.

#### 5.8.2 Event Sources

| Event Type | Source Table | Key Fields |
|---|---|---|
| Claim Filed | `claims` | `createdAt`, `claimRef`, `incidentType` |
| Claim State Transition | `workflow_history` | `transitionedAt`, `fromState`, `toState`, `triggeredBy` |
| Damage Recorded | `vehicle_damage_history` | `createdAt`, `damageZone`, `severity` |
| Fraud Signal Detected | `cross_claim_signals` | `detectedAt`, `signalType`, `confidence` |
| Inspection Completed | `inspections` | `completedAt`, `inspectionType`, `status` |
| Valuation Recorded | `vehicleMarketValuations` | `valuationDate`, `marketValue` |
| Repair Completed | `repair_history` | `completedAt`, `repairType`, `repairCost` |
| Maintenance Alert | `maintenanceAlerts` | `createdAt`, `alertType`, `severity` |
| Driver Risk Update | `drivers` | `updatedAt`, `driverRiskScore` |
| Document Uploaded | `claim_documents` | `uploadedAt`, `documentType` |
| Governance Violation | `governance_violation_log` | `createdAt`, `violationType`, `severity` |

#### 5.8.3 Timeline Object Model

```typescript
interface TimelineEvent {
  eventId: string;           // composite key: sourceTable_recordId
  entityType: 'vehicle' | 'driver' | 'fleet' | 'asset' | 'claim';
  entityId: number;
  eventType: string;         // e.g. 'claim_filed', 'fraud_signal_detected'
  eventCategory: 'claim' | 'inspection' | 'fraud' | 'maintenance' | 'valuation' | 'governance';
  eventDate: string;         // ISO 8601
  title: string;             // human-readable event title
  description: string;       // human-readable event description
  severity: 'info' | 'warning' | 'critical' | null;
  relatedEntityType: string | null;
  relatedEntityId: number | null;
  metadata: Record<string, unknown>;
}

interface EntityTimeline {
  entityType: string;
  entityId: number;
  entityLabel: string;
  events: TimelineEvent[];
  totalEvents: number;
  firstEventDate: string | null;
  lastEventDate: string | null;
}
```

#### 5.8.4 New Router: `server/routers/timeline-intelligence.ts`

```typescript
timelineIntelligence.getVehicleTimeline(input: { vehicleId: number; filters?: TimelineFilters })
timelineIntelligence.getDriverTimeline(input: { driverId: number; filters?: TimelineFilters })
timelineIntelligence.getAssetTimeline(input: { assetId: number; filters?: TimelineFilters })
timelineIntelligence.getClaimTimeline(input: { claimId: number })
timelineIntelligence.getFleetTimeline(input: { fleetId: number; filters?: TimelineFilters })
```

---

### 5.9 Predictive Analytics

#### 5.9.1 Purpose

Predictive Analytics provides **forward-looking risk scores and propensity models** derived from the platform's existing historical data. It does not train new AI models — it applies statistical scoring rules to existing data to produce actionable predictions.

#### 5.9.2 Predictive Models

Epic 4 introduces four predictive scoring models, all implemented as deterministic TypeScript functions reading from existing tables:

**Model 1 — Vehicle Renewal Risk Score.** Predicts the likelihood that a vehicle will generate a claim in the next 12 months, based on claim frequency, damage zone history, fraud signals, and vehicle age. Score range: 0–100.

```
renewalRiskScore = (claimFrequencyFactor × 0.35) + (fraudSignalFactor × 0.30) + (vehicleAgeFactor × 0.20) + (repeatDamageFactor × 0.15)
```

**Model 2 — Driver Fraud Propensity Score.** Predicts the likelihood that a driver is involved in fraudulent activity, based on claim frequency, at-fault ratio, staged accident signals, and repairer collusion signals. Score range: 0–100.

```
fraudPropensityScore = (claimFrequencyFactor × 0.25) + (atFaultRatioFactor × 0.20) + (stagedAccidentFactor × 0.30) + (repairerCollusionFactor × 0.25)
```

**Model 3 — Fleet Risk Trajectory.** Predicts whether a fleet's risk score will increase, decrease, or remain stable over the next 6 months, based on the trend in claim frequency, driver risk scores, and vehicle condition. Output: `'improving' | 'stable' | 'deteriorating'` with a confidence percentage.

**Model 4 — Portfolio Loss Forecast.** Forecasts the expected total claims cost for the next quarter, based on the trailing 12-month average, seasonal adjustment factors, and the current pipeline of open claims. Output: a point estimate and a 90% confidence interval.

#### 5.9.3 New Router: `server/routers/predictive-analytics.ts`

```typescript
predictiveAnalytics.getVehicleRenewalRisk(input: { vehicleId: number })
predictiveAnalytics.getDriverFraudPropensity(input: { driverId: number })
predictiveAnalytics.getFleetRiskTrajectory(input: { fleetId: number })
predictiveAnalytics.getPortfolioLossForecast(input: { tenantId: string; quarters?: number })
predictiveAnalytics.getBatchVehicleRenewalRisk(input: { vehicleIds: number[] })
predictiveAnalytics.getHighRiskRenewalList(input: { tenantId: string; threshold?: number })
```

#### 5.9.4 Risk Score Storage

Predictive scores are stored in the new `predictive_risk_scores` table (see Section 6) with a `computedAt` timestamp and a `modelVersion` field. Scores are recomputed on demand and cached for 24 hours. The `modelVersion` field ensures that score comparisons are only made between scores computed by the same model version.

---

## 6. Database Design

### 6.1 Design Principle

Epic 4 follows a **minimal schema footprint** principle. The vast majority of Epic 4 data requirements are met by querying existing tables. New database objects are limited to:

- **3 new aggregation tables** — for caching computed Passport and score objects
- **12 new database views** — for efficient multi-table aggregation queries
- **0 new base tables** — no new operational data is collected by Epic 4

### 6.2 New Aggregation Tables

#### Table: `vehicle_passport_snapshots`

Caches the computed Vehicle Passport object for performance. Invalidated when source tables are updated.

```sql
CREATE TABLE vehicle_passport_snapshots (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  vehicle_id          INT NOT NULL,
  tenant_id           VARCHAR(255) NOT NULL,
  passport_json       JSON NOT NULL,          -- full VehiclePassport object
  risk_score          INT NOT NULL DEFAULT 0, -- denormalised for fast queries
  risk_tier           ENUM('low','medium','high','critical') NOT NULL DEFAULT 'low',
  data_completeness   INT NOT NULL DEFAULT 0,
  computed_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at          TIMESTAMP NOT NULL,     -- computed_at + 24 hours
  INDEX idx_vps_vehicle_id (vehicle_id),
  INDEX idx_vps_tenant (tenant_id),
  INDEX idx_vps_risk_tier (risk_tier),
  INDEX idx_vps_expires (expires_at)
);
```

#### Table: `fleet_intelligence_snapshots`

Caches the computed Fleet Intelligence object.

```sql
CREATE TABLE fleet_intelligence_snapshots (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  fleet_id            INT NOT NULL,
  tenant_id           VARCHAR(255) NOT NULL,
  intelligence_json   JSON NOT NULL,
  fleet_risk_score    INT NOT NULL DEFAULT 0,
  fleet_risk_tier     ENUM('low','medium','high','critical') NOT NULL DEFAULT 'low',
  computed_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at          TIMESTAMP NOT NULL,
  INDEX idx_fis_fleet_id (fleet_id),
  INDEX idx_fis_tenant (tenant_id),
  INDEX idx_fis_risk_tier (fleet_risk_tier)
);
```

#### Table: `predictive_risk_scores`

Stores computed predictive scores with model versioning.

```sql
CREATE TABLE predictive_risk_scores (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  entity_type         ENUM('vehicle','driver','fleet','portfolio') NOT NULL,
  entity_id           INT NOT NULL,
  tenant_id           VARCHAR(255) NOT NULL,
  model_type          ENUM('renewal_risk','fraud_propensity','fleet_trajectory','portfolio_forecast') NOT NULL,
  model_version       VARCHAR(20) NOT NULL DEFAULT '1.0.0',
  score               DECIMAL(5,2),           -- 0.00–100.00 for numeric scores
  prediction          VARCHAR(50),            -- for categorical predictions
  confidence          DECIMAL(5,2),           -- 0.00–100.00
  score_factors_json  JSON,                   -- breakdown of contributing factors
  computed_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at          TIMESTAMP NOT NULL,
  UNIQUE KEY uk_prs_entity_model (entity_type, entity_id, model_type, model_version),
  INDEX idx_prs_entity (entity_type, entity_id),
  INDEX idx_prs_tenant (tenant_id),
  INDEX idx_prs_model_type (model_type),
  INDEX idx_prs_expires (expires_at)
);
```

### 6.3 New Database Views

The following 12 views are created to support efficient aggregation queries. All views are read-only and reference existing base tables.

| View Name | Purpose | Source Tables |
|---|---|---|
| `vw_vehicle_claim_summary` | Aggregate claim stats per vehicle | `claims`, `vehicle_registry` |
| `vw_vehicle_fraud_summary` | Aggregate fraud signals per vehicle | `cross_claim_signals`, `vehicle_registry` |
| `vw_vehicle_damage_summary` | Aggregate damage zone stats per vehicle | `vehicle_damage_history` |
| `vw_driver_risk_summary` | Driver risk profile with claim history | `drivers`, `driver_claims`, `claims` |
| `vw_fleet_vehicle_risk` | Per-vehicle risk within a fleet | `fleet_vehicles`, `vehicle_registry`, `vehicle_damage_history` |
| `vw_fleet_driver_risk` | Per-driver risk within a fleet | `fleet_drivers`, `drivers`, `driver_claims` |
| `vw_fleet_claim_summary` | Fleet-level claim aggregation | `fleet_vehicles`, `claims` |
| `vw_portfolio_exposure` | Insurer portfolio exposure summary | `claims`, `claim_confidence_scores` |
| `vw_portfolio_fraud_summary` | Insurer fraud intelligence summary | `fraud_signals`, `cross_claim_signals` |
| `vw_asset_inspection_summary` | Asset inspection history summary | `asset_registry`, `inspections` |
| `vw_asset_risk_summary` | Asset risk profile | `asset_registry`, `risk_register`, `maintenance_alerts` |
| `vw_timeline_events` | Unified event stream for timeline queries | `claims`, `workflow_history`, `vehicle_damage_history`, `cross_claim_signals`, `inspections` |

---

## 7. API Design

### 7.1 New tRPC Router Modules

Epic 4 introduces nine new tRPC router modules. All are registered in `server/routers.ts` following the existing pattern.

| Router File | Router Key | Procedures |
|---|---|---|
| `server/routers/vehicle-passport.ts` | `vehiclePassport` | 6 |
| `server/routers/asset-passport.ts` | `assetPassport` | 6 |
| `server/routers/cross-module-intelligence.ts` | `crossModuleIntelligence` | 4 |
| `server/routers/fleet-intelligence.ts` | `fleetIntelligence` | 7 |
| `server/routers/engineering-intelligence.ts` | `engineeringIntelligence` | 6 |
| `server/routers/portfolio-intelligence.ts` | `portfolioIntelligence` | 7 |
| `server/routers/timeline-intelligence.ts` | `timelineIntelligence` | 5 |
| `server/routers/predictive-analytics.ts` | `predictiveAnalytics` | 6 |
| `server/routers/executive-dashboard.ts` | `executiveDashboard` | 6 |

**Total new procedures: 53**

### 7.2 API Access Control

All new procedures use `protectedProcedure`. Role-based access is enforced within each procedure using the existing `ctx.user.role` and `ctx.user.insurerRole` pattern. The following table documents the minimum required role for each router:

| Router | Minimum Role | Additional Roles |
|---|---|---|
| `vehiclePassport` | `claims_processor` | All insurer roles, `engineer`, `fleet_manager`, `admin` |
| `assetPassport` | `engineer` | `insurer_admin`, `admin`, `platform_super_admin` |
| `crossModuleIntelligence` | `risk_manager` | `claims_manager`, `insurer_admin`, `admin` |
| `fleetIntelligence` | `fleet_manager` | `fleet_admin`, `insurer_admin`, `admin` |
| `engineeringIntelligence` | `engineer` | `insurer_admin`, `admin`, `platform_super_admin` |
| `portfolioIntelligence` | `claims_manager` | `risk_manager`, `executive`, `insurer_admin`, `admin` |
| `timelineIntelligence` | `claims_processor` | All insurer roles, `engineer`, `fleet_manager`, `admin` |
| `predictiveAnalytics` | `risk_manager` | `executive`, `insurer_admin`, `admin` |
| `executiveDashboard` | `executive` | `insurer_admin`, `admin`, `platform_super_admin` |

### 7.3 Input Validation

All procedure inputs use **Zod schemas** following the existing pattern in `server/routers.ts`. Date range inputs use ISO 8601 strings. Pagination uses `limit` and `offset` with sensible defaults (limit=50, max=200).

### 7.4 Performance Targets

| Procedure Category | Target P95 Response Time |
|---|---|
| Passport (cached) | < 50ms |
| Passport (uncached, full assembly) | < 2,000ms |
| Intelligence aggregation (simple) | < 200ms |
| Intelligence aggregation (complex, multi-join) | < 1,000ms |
| Predictive score (cached) | < 50ms |
| Predictive score (uncached) | < 500ms |
| Timeline (100 events) | < 300ms |
| Dashboard (composed) | < 1,500ms (parallel queries) |

---

## 8. UI Design

### 8.1 New Pages

Epic 4 introduces six new UI page groups, all built with the existing shadcn/ui component library, Tailwind CSS 4, and Chart.js v3.

#### 8.1.1 Vehicle Passport Page

**Route:** `/vehicles/:id/passport`  
**Access:** All insurer roles, `engineer`, `fleet_manager`  
**Layout:** Two-column layout. Left column: identity card, risk score gauge, valuation card. Right column: tabbed content (Claims History, Damage History, Fraud Signals, Inspection History, Documents).

**Key UI Components:**
- `VehiclePassportCard` — identity and risk score summary
- `RiskScoreGauge` — circular gauge showing composite risk score (0–100)
- `DamageZoneMap` — vehicle silhouette with damage zones highlighted by severity
- `ClaimsTimeline` — chronological list of claims with status badges
- `FraudSignalBadges` — active fraud signals with confidence indicators
- `ValuationChart` — line chart showing market value over time

#### 8.1.2 Asset Passport Page

**Route:** `/assets/:id/passport`  
**Access:** `engineer`, `insurer_admin`, `admin`  
**Layout:** Two-column layout. Left column: asset identity card, health score, risk rating. Right column: tabbed content (Inspection History, Risk Register, Maintenance, Documents).

#### 8.1.3 Fleet Intelligence Page

**Route:** `/fleets/:id/intelligence`  
**Access:** `fleet_manager`, `fleet_admin`, `insurer_admin`  
**Layout:** Three-section layout. Top: fleet KPI cards (risk score, claims rate, high-risk vehicles, high-risk drivers). Middle: two-column charts (claims trend, risk score trend). Bottom: two tables (top risk vehicles, top risk drivers).

#### 8.1.4 Portfolio Intelligence Page

**Route:** `/portfolio/intelligence`  
**Access:** `claims_manager`, `risk_manager`, `executive`, `insurer_admin`  
**Layout:** Dashboard-style with five tab sections (Exposure, Fraud, Operations, Financial, Risk Concentration). Each tab contains 2–4 charts and a summary table.

#### 8.1.5 Timeline Page

**Route:** `/timeline/:entityType/:entityId`  
**Access:** All roles with access to the entity  
**Layout:** Full-width vertical timeline. Filter bar at top (event type, date range, severity). Events displayed as cards with icons, timestamps, and expandable detail.

#### 8.1.6 Executive Dashboard Pages

**Routes:** `/dashboard/platform`, `/dashboard/insurer`, `/dashboard/claims`, `/dashboard/risk`, `/dashboard/fleet`, `/dashboard/engineer`  
**Access:** Role-gated (see Section 5.7.2)  
**Layout:** Each dashboard uses the existing `DashboardLayout` component. Content is a grid of KPI cards, charts, and alert feeds specific to the role.

### 8.2 Shared UI Components (New)

| Component | Used By |
|---|---|
| `RiskScoreGauge` | Vehicle Passport, Asset Passport, Fleet Intelligence |
| `DamageZoneMap` | Vehicle Passport |
| `TimelineEventCard` | Timeline Intelligence |
| `KPICard` | All dashboards |
| `TrendChart` | Fleet Intelligence, Portfolio Intelligence, Executive Dashboards |
| `RiskMatrix` | Fleet Intelligence, Portfolio Intelligence |
| `SignalBadge` | Vehicle Passport, Cross-Module Intelligence |

### 8.3 Navigation Integration

New pages are added to the existing `DashboardLayout` sidebar navigation. The sidebar is extended with:
- **Intelligence** section: Vehicle Passport, Asset Passport, Timeline
- **Analytics** section: Fleet Intelligence, Portfolio Intelligence, Predictive Analytics
- **Dashboards** section: role-gated dashboard links

---

## 9. Report Architecture

### 9.1 New Report Keys

Epic 4 adds nine new report keys to the existing `REPORT_ACCESS` map in `reportDefinitions.ts`. All reports use the existing `pdfRenderer.ts` and KINGA Design System.

| Report Key | Description | Access Roles |
|---|---|---|
| `vehicle.passport_report` | Full Vehicle Passport PDF | `insurer_admin`, `claims_manager`, `risk_manager`, `agency`, `fleet_admin` |
| `asset.passport_report` | Full Asset Passport PDF | `engineer`, `insurer_admin`, `admin` |
| `fleet.intelligence_report` | Fleet Intelligence Summary | `fleet_admin`, `fleet_manager`, `insurer_admin` |
| `fleet.risk_matrix` | Fleet Risk Matrix Report | `fleet_admin`, `insurer_admin`, `risk_manager` |
| `portfolio.predictive_risk` | Predictive Risk Report | `insurer_admin`, `risk_manager`, `executive` |
| `portfolio.loss_forecast` | Portfolio Loss Forecast | `insurer_admin`, `executive` |
| `executive.platform_intelligence` | Platform Intelligence Summary | `platform_super_admin` |
| `engineer.findings_summary` | Engineering Findings Summary (Epic 3 TODO completed) | `engineer`, `insurer_admin`, `admin` |
| `timeline.entity_report` | Entity Timeline PDF | `insurer_admin`, `claims_manager`, `risk_manager` |

### 9.2 Report Generation Functions

Each new report key maps to a new report generation function in a new file `server/reporting/intelligenceReports.ts`. All functions follow the existing pattern: they accept `params` and `tenantId`, query the database directly, and return an HTML string using `buildKingaHtml()`.

### 9.3 Report Design Standards

All new reports follow the KINGA Design System established in Epic 2. Specifically:
- Header: KINGA logo, report title, generation date, tenant name
- Colour palette: existing KINGA palette (no new colours)
- Typography: existing KINGA typography scale
- Charts: Chart.js v3 rendered server-side via `canvas` (existing pattern)
- Footers: page numbers, confidentiality notice, KINGA watermark

---

## 10. Reuse Matrix

The following matrix documents every Epic 4 module's consumption of existing platform services. A filled cell (●) indicates direct consumption; a half-filled cell (◐) indicates indirect consumption via another module.

| Service | Vehicle Passport | Asset Passport | Cross-Module Intel | Fleet Intel | Engineering Intel | Portfolio Intel | Exec Dashboards | Timeline Intel | Predictive Analytics |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Workflow Engine | | | | | | ◐ | ◐ | ● | |
| AI Pipeline Orchestrator | | | | | | | | | |
| Physics Engine | | | | | ● | | | | |
| Cross-Claim Intelligence | ● | | ● | ● | | ● | ● | ● | ● |
| Fraud Intelligence Engine | ● | | ● | ● | | ● | ● | ● | ● |
| Vehicle Valuation Service | ● | | | ● | | ● | ● | ● | ● |
| Vehicle Registry | ● | | ● | ● | | ● | ● | ● | ● |
| Driver Registry | ● | | ● | ● | | ● | ● | ● | ● |
| Cost Estimation Engine | | | | | | ● | ● | | ● |
| Repair Intelligence | ● | | | ● | | ● | ● | ● | |
| Document Intelligence | ● | ● | | | ● | | | ● | |
| Confidence Scoring | | | | | | ● | ● | | ● |
| Report Renderer | ● | ● | | ● | ● | ● | ● | ● | ● |
| Asset Registry | | ● | | | ● | | | ● | |
| FEL Registry | | | | | ● | | ● | | |
| Truth Governance Registry | | | ● | | | ● | ● | | |
| Notification Service | | | | | | | | | ● |
| Platform Metering | | | | | | | ● | | |
| Assignment Engine | | | | ● | | ● | ● | | |

**Key:** ● Direct consumption · ◐ Indirect consumption · (blank) No consumption

---

## 11. Testing Strategy

### 11.1 Test Coverage Requirements

Epic 4 follows the existing Vitest testing framework. The following coverage targets apply:

| Module | Unit Tests | Integration Tests | Coverage Target |
|---|---|---|---|
| Vehicle Passport Aggregator | ✅ Required | ✅ Required | ≥ 85% |
| Asset Passport Aggregator | ✅ Required | ✅ Required | ≥ 85% |
| Fleet Intelligence Aggregator | ✅ Required | ✅ Required | ≥ 85% |
| Portfolio Intelligence | ✅ Required | ✅ Required | ≥ 80% |
| Predictive Analytics Models | ✅ Required | ✅ Required | ≥ 90% |
| Timeline Intelligence | ✅ Required | ◐ Optional | ≥ 80% |
| Engineering Intelligence | ✅ Required | ◐ Optional | ≥ 80% |
| Cross-Module Intelligence | ✅ Required | ✅ Required | ≥ 85% |
| Executive Dashboards (API) | ✅ Required | ◐ Optional | ≥ 75% |

### 11.2 Test File Naming Convention

Following the existing convention, test files are named `server/routers/<module>.test.ts` for router tests and `server/<service>.test.ts` for service tests.

### 11.3 Critical Test Cases

The following test cases are mandatory and must pass before any Epic 4 module is considered complete:

**Vehicle Passport:**
1. `getByRegistration` returns correct aggregate when vehicle has 0 claims
2. `getByRegistration` returns correct aggregate when vehicle has 5+ claims
3. `getRiskProfile` correctly computes composite risk score from all four factors
4. Snapshot cache is invalidated when `vehicle_damage_history` is updated
5. Passport returns `dataCompleteness = 0` when vehicle has no associated records

**Predictive Analytics:**
1. `getVehicleRenewalRisk` returns score in range [0, 100] for all inputs
2. `getDriverFraudPropensity` returns 0 for a driver with no claims
3. `getFleetRiskTrajectory` returns `'stable'` when trend data is flat
4. `getPortfolioLossForecast` returns a confidence interval where lower ≤ point ≤ upper
5. All model scores are idempotent (same input → same output)

**Cross-Module Intelligence:**
1. `getEntitySignals` returns signals from all source tables for a vehicle with signals in multiple tables
2. `getActiveFraudSignals` returns only signals with `confidence = 'high'` when filtered
3. Signal propagation does not duplicate signals already in `cross_claim_signals`

### 11.4 Regression Test Suite

Epic 4 must not break any existing tests. The full regression suite (`pnpm test`) must pass with 0 new failures after each Epic 4 module is implemented. The current baseline is 8,316 tests passing.

---

## 12. Dependencies

### 12.1 Internal Dependencies

Epic 4 has the following internal dependencies on existing platform modules:

| Dependency | Type | Required By | Risk if Missing |
|---|---|---|---|
| `vehicle_registry` table populated | Data | Vehicle Passport | Passport returns empty |
| `cross_claim_signals` table populated | Data | Vehicle Passport, Fleet Intelligence | No fraud signals in Passport |
| `vehicle_damage_history` table populated | Data | Vehicle Passport, Predictive Analytics | No damage history |
| `fleets` and `fleetVehicles` tables populated | Data | Fleet Intelligence | No fleet data |
| `drivers` and `driverClaims` tables populated | Data | Fleet Intelligence, Predictive Analytics | No driver intelligence |
| `inspections` table populated | Data | Asset Passport, Engineering Intelligence | No inspection history |
| `historicalClaims` table populated | Data | Predictive Analytics | Reduced forecast accuracy |
| `shared/roles.ts` | Code | All routers | Build failure |
| `reporting/pdfRenderer.ts` | Code | All new reports | Report generation failure |
| `reporting/templates/kingaDesignSystem.ts` | Code | All new reports | Report styling failure |

### 12.2 External Dependencies

Epic 4 introduces no new external dependencies. All required npm packages (Chart.js, shadcn/ui, Drizzle ORM, tRPC, Zod) are already in `package.json`.

### 12.3 Infrastructure Dependencies

Epic 4 requires no infrastructure changes. The three new aggregation tables are created via `pnpm db:push` following the existing migration workflow. The twelve new database views are created via `webdev_execute_sql` as they are not managed by Drizzle.

---

## 13. Implementation Sequence

### 13.1 Sequencing Principles

The implementation sequence is governed by three principles:

1. **Data before presentation.** Aggregation services and database views are implemented before UI pages.
2. **Foundation before superstructure.** Cross-Module Intelligence and Timeline Intelligence are implemented first, as they are consumed by all other modules.
3. **Regression safety.** Each wave is fully tested before the next wave begins.

### 13.2 Implementation Waves

#### Wave 1 — Foundation (Estimated: 3 days)

| Task | File | Depends On |
|---|---|---|
| Create `vehicle_passport_snapshots` table | `drizzle/schema.ts` | None |
| Create `fleet_intelligence_snapshots` table | `drizzle/schema.ts` | None |
| Create `predictive_risk_scores` table | `drizzle/schema.ts` | None |
| Create 12 database views | SQL via `webdev_execute_sql` | Existing tables |
| Implement `VehiclePassportAggregator` service | `server/vehicle-passport-aggregator.ts` | Views |
| Implement `vehicle-passport` router | `server/routers/vehicle-passport.ts` | Aggregator |
| Write Vehicle Passport tests | `server/routers/vehicle-passport.test.ts` | Router |

#### Wave 2 — Asset and Cross-Module (Estimated: 2 days)

| Task | File | Depends On |
|---|---|---|
| Implement `AssetPassportAggregator` service | `server/asset-passport-aggregator.ts` | Wave 1 views |
| Implement `asset-passport` router | `server/routers/asset-passport.ts` | Aggregator |
| Implement `cross-module-intelligence` router | `server/routers/cross-module-intelligence.ts` | Existing signal tables |
| Implement `timeline-intelligence` router | `server/routers/timeline-intelligence.ts` | `vw_timeline_events` view |
| Write Asset Passport and Timeline tests | Test files | Routers |

#### Wave 3 — Fleet and Engineering (Estimated: 2 days)

| Task | File | Depends On |
|---|---|---|
| Implement `FleetIntelligenceAggregator` service | `server/fleet-intelligence-aggregator.ts` | Wave 1 views |
| Implement `fleet-intelligence` router | `server/routers/fleet-intelligence.ts` | Aggregator |
| Implement `engineering-intelligence` router | `server/routers/engineering-intelligence.ts` | Existing inspection tables |
| Write Fleet and Engineering Intelligence tests | Test files | Routers |

#### Wave 4 — Portfolio and Predictive (Estimated: 3 days)

| Task | File | Depends On |
|---|---|---|
| Implement `portfolio-intelligence` router | `server/routers/portfolio-intelligence.ts` | Wave 1 views |
| Implement Predictive Analytics models | `server/predictive-analytics-engine.ts` | `predictive_risk_scores` table |
| Implement `predictive-analytics` router | `server/routers/predictive-analytics.ts` | Engine |
| Write Portfolio and Predictive tests | Test files | Routers |

#### Wave 5 — Reports (Estimated: 2 days)

| Task | File | Depends On |
|---|---|---|
| Implement `intelligenceReports.ts` | `server/reporting/intelligenceReports.ts` | All Wave 1–4 routers |
| Register 9 new report keys in `reportDefinitions.ts` | `server/reporting/reportDefinitions.ts` | Report functions |
| Update `REPORT_ACCESS` map | `server/reporting/reportDefinitions.ts` | New report keys |
| Write report generation tests | `server/reporting.test.ts` | Report functions |

#### Wave 6 — UI (Estimated: 4 days)

| Task | File | Depends On |
|---|---|---|
| Implement shared UI components | `client/src/components/intelligence/` | All routers |
| Implement Vehicle Passport page | `client/src/pages/VehiclePassport.tsx` | `vehiclePassport` router |
| Implement Asset Passport page | `client/src/pages/AssetPassport.tsx` | `assetPassport` router |
| Implement Fleet Intelligence page | `client/src/pages/FleetIntelligence.tsx` | `fleetIntelligence` router |
| Implement Portfolio Intelligence page | `client/src/pages/PortfolioIntelligence.tsx` | `portfolioIntelligence` router |
| Implement Timeline page | `client/src/pages/Timeline.tsx` | `timelineIntelligence` router |
| Implement Executive Dashboard pages (6) | `client/src/pages/dashboards/` | All routers |
| Update sidebar navigation | `client/src/components/DashboardLayout.tsx` | New pages |
| Register new routes | `client/src/App.tsx` | New pages |

**Total estimated implementation time: 16 working days**

---

## 14. Regression Risks

### 14.1 Risk Register

| Risk ID | Description | Probability | Impact | Mitigation |
|---|---|---|---|---|
| RR-01 | New database views slow down existing queries due to shared table locks | Medium | High | Views are read-only; test query performance on staging before production |
| RR-02 | `vehicle_passport_snapshots` cache invalidation logic triggers excessive writes | Low | Medium | Implement write debouncing; invalidate on batch completion, not per-row |
| RR-03 | New router registrations in `server/routers.ts` cause tRPC type inference to slow down | Low | Low | Split large routers into sub-routers following existing pattern |
| RR-04 | Predictive score computation causes timeout on large portfolios | Medium | Medium | Implement batch processing with pagination; cache aggressively |
| RR-05 | New report keys break existing `REPORT_ACCESS` exhaustiveness checks | Low | Medium | Add new keys to test `KNOWN_REPORT_KEYS` list before implementation |
| RR-06 | Dashboard pages cause memory pressure due to parallel tRPC queries | Low | Low | Use `Promise.all` with concurrency limits; implement query result caching |
| RR-07 | `vw_timeline_events` view is too slow for vehicles with 100+ events | Medium | Medium | Add `LIMIT` and date range filters; paginate timeline queries |
| RR-08 | New sidebar navigation items break existing DashboardLayout tests | Low | Low | Update DashboardLayout tests to include new navigation items |
| RR-09 | `predictive_risk_scores` table unique constraint conflicts on concurrent score computation | Low | Medium | Use `INSERT ... ON DUPLICATE KEY UPDATE` pattern |
| RR-10 | New Zod schemas in routers conflict with existing tRPC type inference | Low | Low | Follow existing Zod schema patterns exactly; run `pnpm test` after each router addition |

### 14.2 Protected Components

The following components must not be modified during Epic 4 implementation:

- `server/workflow-engine.ts` — Workflow Engine (NDL-01)
- `server/pipeline-v2/orchestrator.ts` — AI Pipeline Orchestrator
- `server/pipeline-v2/stage-7-physics.ts` — Physics Engine (NDL-04 adjacent)
- `server/fraud-scoring.ts` — Fraud Intelligence Engine (NDL-02)
- `server/reporting/pdfRenderer.ts` — Report Renderer
- `shared/roles.ts` — Platform Roles (NDL-10)
- `drizzle/schema.ts` base tables — No existing columns may be modified

---

## 15. Acceptance Criteria

### 15.1 Module-Level Acceptance Criteria

#### Vehicle Passport
- [ ] `getByRegistration` returns a complete Passport object for any vehicle with at least one claim
- [ ] Risk score is in range [0, 100] for all vehicles
- [ ] Passport correctly identifies all repeat damage zones
- [ ] Passport correctly aggregates all cross-claim fraud signals
- [ ] Snapshot cache reduces response time to < 50ms on second request
- [ ] Vehicle Passport page renders without errors for all insurer roles
- [ ] `vehicle.passport_report` PDF generates successfully and matches KINGA Design System

#### Asset Passport
- [ ] `getByRef` returns a complete Passport for any asset with at least one inspection
- [ ] Asset health score correctly reflects maintenance alert status
- [ ] Asset Passport page renders without errors for `engineer` role
- [ ] `asset.passport_report` PDF generates successfully

#### Cross-Module Intelligence
- [ ] `getEntitySignals` returns signals from all source tables for a test vehicle
- [ ] Signal propagation does not create duplicate entries
- [ ] `getActiveFraudSignals` correctly filters by confidence level

#### Fleet Intelligence
- [ ] `getFleetProfile` returns correct aggregate for a fleet with 10+ vehicles
- [ ] Fleet risk score correctly identifies high-risk vehicles and drivers
- [ ] Fleet Intelligence page renders correctly for `fleet_manager` role
- [ ] `fleet.intelligence_report` PDF generates successfully

#### Engineering Intelligence
- [ ] `getPortfolioOverview` returns correct metrics for a tenant with 20+ inspections
- [ ] Repeat finding rate is correctly calculated
- [ ] `engineer.findings_summary` PDF generates successfully

#### Portfolio Intelligence
- [ ] `getExposureSummary` returns correct total outstanding liability
- [ ] `getFraudIntelligence` correctly aggregates fraud rates
- [ ] Portfolio Intelligence page renders all five tabs without errors
- [ ] `portfolio.predictive_risk` PDF generates successfully

#### Executive Dashboards
- [ ] Platform Executive Dashboard is accessible only to `platform_super_admin`
- [ ] Insurer Executive Dashboard is accessible to `executive` and `insurer_admin`
- [ ] Each dashboard renders within 3 seconds on first load
- [ ] All KPI cards display correct values from the underlying data

#### Timeline Intelligence
- [ ] `getVehicleTimeline` returns events from all 11 source tables
- [ ] Timeline is correctly ordered by `eventDate` descending
- [ ] Timeline page renders correctly with 100+ events
- [ ] `timeline.entity_report` PDF generates successfully

#### Predictive Analytics
- [ ] All four predictive models return scores in their specified ranges
- [ ] `getPortfolioLossForecast` returns a valid confidence interval
- [ ] Scores are correctly cached and expire after 24 hours
- [ ] `portfolio.loss_forecast` PDF generates successfully

### 15.2 Platform-Level Acceptance Criteria

- [ ] All 8,316 existing tests continue to pass after Epic 4 implementation
- [ ] TypeScript error count does not increase above the current baseline of 7
- [ ] All new routers are registered in `server/routers.ts`
- [ ] All new report keys are registered in `reportDefinitions.ts` and `REPORT_ACCESS`
- [ ] All new pages are registered in `client/src/App.tsx`
- [ ] No new external npm dependencies are introduced
- [ ] No existing database tables are modified
- [ ] No existing service files are modified (except `server/routers.ts`, `reportDefinitions.ts`, `client/src/App.tsx`, `client/src/components/DashboardLayout.tsx`)
- [ ] `pnpm db:push` applies the three new aggregation tables without errors
- [ ] All new test files are excluded from the `server/scripts/**` Vitest exclusion pattern

### 15.3 Performance Acceptance Criteria

- [ ] Vehicle Passport (cached) P95 response time < 50ms
- [ ] Vehicle Passport (uncached) P95 response time < 2,000ms
- [ ] Fleet Intelligence P95 response time < 1,000ms
- [ ] Portfolio Intelligence P95 response time < 1,500ms
- [ ] Executive Dashboard page load time < 3,000ms
- [ ] Timeline (100 events) P95 response time < 300ms
- [ ] Predictive score (cached) P95 response time < 50ms

---

## Appendix A — File Creation Checklist

The following files are created by Epic 4. No existing files are modified except those listed in Section 15.2.

**New Server Files:**
- `server/vehicle-passport-aggregator.ts`
- `server/asset-passport-aggregator.ts`
- `server/fleet-intelligence-aggregator.ts`
- `server/predictive-analytics-engine.ts`
- `server/routers/vehicle-passport.ts`
- `server/routers/asset-passport.ts`
- `server/routers/cross-module-intelligence.ts`
- `server/routers/fleet-intelligence.ts`
- `server/routers/engineering-intelligence.ts`
- `server/routers/portfolio-intelligence.ts`
- `server/routers/timeline-intelligence.ts`
- `server/routers/predictive-analytics.ts`
- `server/routers/executive-dashboard.ts`
- `server/reporting/intelligenceReports.ts`

**New Test Files:**
- `server/routers/vehicle-passport.test.ts`
- `server/routers/asset-passport.test.ts`
- `server/routers/cross-module-intelligence.test.ts`
- `server/routers/fleet-intelligence.test.ts`
- `server/routers/engineering-intelligence.test.ts`
- `server/routers/portfolio-intelligence.test.ts`
- `server/routers/timeline-intelligence.test.ts`
- `server/routers/predictive-analytics.test.ts`
- `server/routers/executive-dashboard.test.ts`

**New Client Files:**
- `client/src/pages/VehiclePassport.tsx`
- `client/src/pages/AssetPassport.tsx`
- `client/src/pages/FleetIntelligence.tsx`
- `client/src/pages/PortfolioIntelligence.tsx`
- `client/src/pages/Timeline.tsx`
- `client/src/pages/dashboards/PlatformExecutiveDashboard.tsx`
- `client/src/pages/dashboards/InsurerExecutiveDashboard.tsx`
- `client/src/pages/dashboards/ClaimsManagerDashboard.tsx`
- `client/src/pages/dashboards/RiskManagerDashboard.tsx`
- `client/src/pages/dashboards/FleetManagerDashboard.tsx`
- `client/src/pages/dashboards/EngineerDashboard.tsx`
- `client/src/components/intelligence/RiskScoreGauge.tsx`
- `client/src/components/intelligence/DamageZoneMap.tsx`
- `client/src/components/intelligence/TimelineEventCard.tsx`
- `client/src/components/intelligence/KPICard.tsx`
- `client/src/components/intelligence/TrendChart.tsx`
- `client/src/components/intelligence/RiskMatrix.tsx`
- `client/src/components/intelligence/SignalBadge.tsx`

**Total new files: 37**

---

## Appendix B — Epic 4 vs Epic 1–3 Capability Comparison

| Capability | Epic 1 | Epic 2 | Epic 3 | Epic 4 |
|---|---|---|---|---|
| Claims Processing | ✅ | ✅ | ✅ | ✅ (read-only) |
| Vehicle Registry | ✅ | ✅ | ✅ | ✅ (Passport) |
| Fraud Detection | ✅ | ✅ | ✅ | ✅ (Predictive) |
| Fleet Management | | ✅ | ✅ | ✅ (Intelligence) |
| Engineering Inspections | | | ✅ | ✅ (Intelligence) |
| Vehicle Passport | | | | ✅ |
| Asset Passport | | | | ✅ |
| Portfolio Intelligence | | | | ✅ |
| Executive Dashboards | | | | ✅ |
| Timeline Intelligence | | | | ✅ |
| Predictive Analytics | | | | ✅ |
| Cross-Module Intelligence | | | | ✅ |

---

*End of Document — KINGA Epic 4 Technical Design Specification v1.0*
