# KINGA Fleet Management Intelligence Platform
## Architecture Documentation

**Version:** 1.0  
**Date:** February 13, 2026  
**Status:** Design Phase

---

## Executive Summary

The KINGA Fleet Management Intelligence Platform is a multi-tenant module integrated into the KINGA ecosystem that provides fleet owners with complete vehicle lifecycle visibility, maintenance optimization, risk intelligence scoring, and seamless integration with insurance underwriting and claims processing.

**Core Value Propositions:**
- **Risk Intelligence Engine**: Real-time risk scoring based on maintenance compliance, claims history, and vehicle condition
- **Maintenance Optimization**: Predictive maintenance scheduling with cost optimization
- **Insurance Intelligence**: Direct feed into underwriting models and premium optimization
- **Service Marketplace**: Competitive quote comparison for repairs and maintenance
- **Claims Integration**: Auto-population of vehicle data and maintenance context for faster claims processing

---

## System Architecture

### High-Level Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    KINGA Fleet Management Platform               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Fleet      │  │ Maintenance  │  │   Service    │          │
│  │   Registry   │  │ Intelligence │  │  Marketplace │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                   │
│  ┌──────▼──────────────────▼──────────────────▼───────┐         │
│  │         Fleet Risk Intelligence Scoring             │         │
│  └──────┬──────────────────┬──────────────────┬───────┘         │
│         │                  │                  │                   │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐          │
│  │  Valuation   │  │   Claims     │  │  Insurance   │          │
│  │   Engine     │  │ Integration  │  │ Underwriting │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Multi-Tenant Architecture

```
Fleet Owner A (Tenant A)
├── Fleet 1: Mining Vehicles
│   ├── Vehicle 1: CAT 777D Dump Truck
│   ├── Vehicle 2: Volvo A45G Articulated Hauler
│   └── Vehicle 3: Komatsu PC8000 Excavator
└── Fleet 2: Logistics Vehicles
    ├── Vehicle 1: Mercedes Actros 2646
    └── Vehicle 2: Scania R500

Fleet Owner B (Tenant B)
└── Fleet 1: Corporate Fleet
    ├── Vehicle 1: Toyota Hilux 2.8GD
    ├── Vehicle 2: Ford Ranger 3.2 TDCi
    └── Vehicle 3: Isuzu D-Max 3.0TD

Data Isolation: Each tenant's data is completely isolated at database level
Access Control: Role-based access control (RBAC) per tenant
Audit Trail: Full audit logging of all fleet operations per tenant
```

---

## Module Specifications

### 1. Fleet Registry Module

**Purpose**: Central repository for all fleet vehicles with complete specifications, ownership documents, and inspection records.

**Key Features:**
- Multi-fleet support per owner
- Vehicle registration with comprehensive specifications
- Document management (registration books, ownership docs, inspection photos)
- Insurance policy tracking
- Replacement value management

**Data Model:**

```typescript
interface Fleet {
  id: number;
  ownerId: number; // Link to users table
  tenantId: string; // Multi-tenant isolation
  fleetName: string;
  fleetType: "mining" | "logistics" | "corporate" | "rental" | "public_transport";
  totalVehicles: number;
  activeVehicles: number;
  createdAt: Date;
  updatedAt: Date;
}

interface FleetVehicle {
  id: number;
  fleetId: number;
  ownerId: number;
  tenantId: string;
  
  // Vehicle Identification
  registrationNumber: string; // Unique
  vinNumber: string; // Vehicle Identification Number
  chassisNumber: string;
  engineNumber: string;
  
  // Vehicle Specifications
  make: string;
  model: string;
  year: number;
  engineCapacity: number; // in cc
  vehicleMass: number; // in kg
  color: string;
  fuelType: "petrol" | "diesel" | "electric" | "hybrid";
  transmissionType: "manual" | "automatic";
  
  // Usage Classification
  usageType: "private" | "commercial" | "logistics" | "mining" | "agriculture" | "public_transport";
  primaryUse: string; // Free text description
  averageMonthlyMileage: number;
  
  // Insurance Details
  currentInsurer: string;
  policyNumber: string;
  policyStartDate: Date;
  policyEndDate: Date;
  coverageType: "comprehensive" | "third_party" | "third_party_fire_theft";
  
  // Valuation
  purchasePrice: number; // in cents
  purchaseDate: Date;
  currentValuation: number; // in cents
  valuationDate: Date;
  replacementValue: number; // in cents
  
  // Status
  status: "active" | "inactive" | "sold" | "written_off" | "under_repair";
  lastInspectionDate: Date;
  nextInspectionDue: Date;
  
  // Risk & Compliance
  riskScore: number; // 0-100
  maintenanceComplianceScore: number; // 0-100
  
  createdAt: Date;
  updatedAt: Date;
}

interface FleetDocument {
  id: number;
  fleetId: number;
  vehicleId: number;
  tenantId: string;
  
  documentType: "registration_book" | "ownership_certificate" | "inspection_report" | "insurance_policy" | "service_history" | "photo";
  documentName: string;
  s3Key: string;
  s3Url: string;
  fileSize: number;
  mimeType: string;
  
  uploadedBy: number;
  uploadedAt: Date;
  verificationStatus: "pending" | "verified" | "rejected";
  verifiedBy: number;
  verifiedAt: Date;
}
```

---

### 2. Maintenance Intelligence Engine

**Purpose**: Predictive maintenance scheduling and compliance tracking to optimize vehicle uptime and reduce unexpected failures.

**Key Features:**
- Service interval tracking (mileage-based and time-based)
- Maintenance due date prediction
- Automated maintenance alerts
- Historical service record management
- Maintenance compliance scoring
- Regulatory inspection reminders

**Maintenance Scheduling Logic:**

```typescript
interface MaintenanceSchedule {
  id: number;
  vehicleId: number;
  tenantId: string;
  
  // Schedule Definition
  maintenanceType: "oil_change" | "tire_rotation" | "brake_inspection" | "engine_service" | "transmission_service" | "annual_inspection" | "safety_inspection" | "custom";
  description: string;
  
  // Interval Configuration
  intervalType: "mileage" | "time" | "both";
  mileageInterval: number; // km
  timeInterval: number; // days
  
  // Current Status
  lastServiceDate: Date;
  lastServiceMileage: number;
  nextDueDate: Date;
  nextDueMileage: number;
  
  // Alert Configuration
  alertDaysBefore: number; // Alert X days before due
  alertMileageBefore: number; // Alert X km before due
  
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface MaintenanceRecord {
  id: number;
  vehicleId: number;
  scheduleId: number;
  tenantId: string;
  
  // Service Details
  serviceDate: Date;
  serviceMileage: number;
  serviceType: string;
  serviceProvider: string;
  serviceLocation: string;
  
  // Cost Information
  laborCost: number; // in cents
  partsCost: number; // in cents
  totalCost: number; // in cents
  
  // Service Items
  serviceItems: string; // JSON array of items serviced
  partsReplaced: string; // JSON array of parts replaced
  
  // Documentation
  invoiceUrl: string;
  serviceReportUrl: string;
  
  // Compliance
  isCompliant: boolean;
  wasOverdue: boolean;
  daysOverdue: number;
  
  performedBy: number;
  recordedBy: number;
  createdAt: Date;
}

interface MaintenanceAlert {
  id: number;
  vehicleId: number;
  scheduleId: number;
  tenantId: string;
  
  alertType: "upcoming_maintenance" | "overdue_maintenance" | "inspection_due" | "safety_alert";
  severity: "low" | "medium" | "high" | "critical";
  
  title: string;
  message: string;
  dueDate: Date;
  dueMileage: number;
  
  status: "pending" | "acknowledged" | "resolved" | "dismissed";
  acknowledgedBy: number;
  acknowledgedAt: Date;
  resolvedAt: Date;
  
  createdAt: Date;
}
```

**Maintenance Compliance Score Calculation:**

```
Compliance Score = (
  0.40 × On-Time Service Rate +
  0.30 × Service Interval Adherence +
  0.20 × Inspection Currency +
  0.10 × Documentation Completeness
) × 100

Where:
- On-Time Service Rate = Services completed on time / Total services due
- Service Interval Adherence = Services within recommended interval / Total services
- Inspection Currency = Current inspections / Required inspections
- Documentation Completeness = Documented services / Total services
```

---

### 3. Service Quote Marketplace

**Purpose**: Enable fleet owners to request competitive quotes for repairs and maintenance, with AI-powered cost optimization and provider performance tracking.

**Key Features:**
- Service/repair quote requests with problem descriptions and images
- Multi-provider quote submission
- AI cost benchmarking and optimization
- Repair duration prediction
- Service provider performance tracking
- Cost deviation alerts

**Data Model:**

```typescript
interface ServiceRequest {
  id: number;
  vehicleId: number;
  fleetId: number;
  ownerId: number;
  tenantId: string;
  
  // Request Details
  requestType: "maintenance" | "repair" | "inspection" | "emergency";
  serviceCategory: "engine" | "transmission" | "brakes" | "suspension" | "electrical" | "bodywork" | "tires" | "general";
  
  title: string;
  description: string;
  urgency: "low" | "medium" | "high" | "critical";
  
  // Vehicle Condition
  currentMileage: number;
  problemImages: string; // JSON array of S3 URLs
  diagnosticCodes: string; // JSON array of OBD codes if available
  
  // Request Status
  status: "open" | "quotes_received" | "quote_accepted" | "in_progress" | "completed" | "cancelled";
  quotesReceived: number;
  
  // Selected Quote
  selectedQuoteId: number;
  selectedProviderId: number;
  
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date;
}

interface ServiceQuote {
  id: number;
  requestId: number;
  providerId: number; // Link to panel_beaters or service_providers table
  tenantId: string;
  
  // Quote Details
  quotedAmount: number; // in cents
  laborCost: number;
  partsCost: number;
  additionalCosts: number;
  
  // Timeline
  estimatedDuration: number; // in hours
  availabilityDate: Date;
  completionDate: Date;
  
  // Quote Items
  quoteLineItems: string; // JSON array of line items
  partsRequired: string; // JSON array of parts
  
  // Provider Information
  providerName: string;
  providerLocation: string;
  providerRating: number; // 0-5
  providerCompletedJobs: number;
  
  // AI Analysis
  aiCostScore: number; // 0-100 (how competitive is this quote)
  costDeviationPercent: number; // % deviation from market average
  recommendationScore: number; // 0-100 (AI recommendation)
  
  // Status
  status: "pending" | "accepted" | "rejected" | "expired";
  validUntil: Date;
  
  submittedAt: Date;
  acceptedAt: Date;
}

interface ServiceProvider {
  id: number;
  providerName: string;
  providerType: "panel_beater" | "mechanic" | "dealership" | "specialist";
  
  // Contact Information
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  region: string;
  
  // Specializations
  specializations: string; // JSON array
  certifications: string; // JSON array
  
  // Performance Metrics
  averageRating: number; // 0-5
  totalJobsCompleted: number;
  averageCompletionTime: number; // in hours
  averageCostDeviation: number; // % from quoted amount
  onTimeCompletionRate: number; // %
  
  // Status
  isActive: boolean;
  isVerified: boolean;
  verifiedAt: Date;
  
  createdAt: Date;
  updatedAt: Date;
}
```

**AI Cost Optimization Algorithm:**

```typescript
function calculateQuoteRecommendationScore(quote: ServiceQuote, marketData: MarketData): number {
  // Factors:
  // 1. Price competitiveness (40%)
  // 2. Provider reputation (30%)
  // 3. Estimated duration (20%)
  // 4. Availability (10%)
  
  const priceScore = calculatePriceScore(quote.quotedAmount, marketData.averagePrice);
  const reputationScore = (quote.providerRating / 5) * 100;
  const durationScore = calculateDurationScore(quote.estimatedDuration, marketData.averageDuration);
  const availabilityScore = calculateAvailabilityScore(quote.availabilityDate);
  
  return (
    priceScore * 0.40 +
    reputationScore * 0.30 +
    durationScore * 0.20 +
    availabilityScore * 0.10
  );
}
```

---

### 4. Vehicle Valuation Engine Integration

**Purpose**: Leverage KINGA's existing claims-based valuation AI to provide accurate vehicle valuations for insurance, resale, and replacement cost analysis.

**Integration Points:**

```typescript
// Existing valuation engine (already implemented)
import { generateVehicleValuation, calculateVehicleRiskScore } from "./insurance/valuation-engine";

// Fleet-specific valuation service
interface FleetValuationService {
  // Generate comprehensive valuation report for fleet vehicle
  generateFleetVehicleValuation(vehicleId: number): Promise<ValuationReport>;
  
  // Batch valuation for entire fleet
  generateFleetValuationReport(fleetId: number): Promise<FleetValuationReport>;
  
  // Export valuation as PDF for insurer submission
  exportValuationPDF(vehicleId: number): Promise<string>; // Returns S3 URL
  
  // Calculate depreciation curve
  calculateDepreciationCurve(vehicleId: number, years: number): Promise<DepreciationCurve>;
  
  // Estimate resale value
  estimateResaleValue(vehicleId: number): Promise<ResaleEstimate>;
}

interface ValuationReport {
  vehicleId: number;
  registrationNumber: string;
  
  // Current Valuation
  currentMarketValue: number; // in cents
  replacementValue: number;
  resaleValue: number;
  
  // Valuation Factors
  baseValue: number;
  conditionAdjustment: number;
  ageAdjustment: number;
  mileageAdjustment: number;
  maintenanceAdjustment: number;
  
  // Confidence & Source
  confidence: number; // 0-100
  valuationSource: string;
  valuationDate: Date;
  
  // Market Comparables
  comparables: Array<{
    make: string;
    model: string;
    year: number;
    price: number;
    source: string;
  }>;
  
  // Depreciation Analysis
  annualDepreciationRate: number; // %
  projectedValue1Year: number;
  projectedValue3Years: number;
  projectedValue5Years: number;
}
```

**PDF Export Specification:**

```
Valuation Report PDF Structure:
┌─────────────────────────────────────────────┐
│ KINGA Fleet Valuation Report                │
│ [KINGA Logo]                                 │
├─────────────────────────────────────────────┤
│ Vehicle Information                          │
│ - Registration Number                        │
│ - Make/Model/Year                            │
│ - VIN Number                                 │
│ - Current Mileage                            │
├─────────────────────────────────────────────┤
│ Valuation Summary                            │
│ - Current Market Value: $XX,XXX              │
│ - Replacement Value: $XX,XXX                 │
│ - Resale Value: $XX,XXX                      │
│ - Confidence Score: XX%                      │
├─────────────────────────────────────────────┤
│ Valuation Breakdown                          │
│ [Table showing adjustment factors]           │
├─────────────────────────────────────────────┤
│ Market Comparables                           │
│ [Table of similar vehicles and prices]       │
├─────────────────────────────────────────────┤
│ Depreciation Projection                      │
│ [Chart showing value over time]              │
├─────────────────────────────────────────────┤
│ Maintenance History Impact                   │
│ - Maintenance Compliance: XX%                │
│ - Service Records: Complete/Incomplete       │
├─────────────────────────────────────────────┤
│ Certification                                │
│ Generated by KINGA AI Valuation Engine       │
│ Date: YYYY-MM-DD                             │
│ Report ID: XXXXX                             │
└─────────────────────────────────────────────┘
```

---

### 5. Fleet Risk Intelligence Scoring

**Purpose**: Comprehensive risk scoring system that feeds into insurance underwriting, fraud detection, and premium optimization.

**Risk Score Calculation:**

```typescript
interface FleetRiskScore {
  vehicleId: number;
  fleetId: number;
  
  // Overall Risk Score (0-100, higher = more risky)
  overallRiskScore: number;
  
  // Component Scores
  maintenanceRisk: number; // Based on compliance and service history
  claimsRisk: number; // Based on claims frequency and severity
  vehicleAgeRisk: number; // Based on age and depreciation
  usageRisk: number; // Based on mileage and usage type
  repairCostRisk: number; // Based on historical repair costs
  
  // Risk Factors
  riskFactors: Array<{
    factor: string;
    impact: "low" | "medium" | "high";
    description: string;
  }>;
  
  // Insurance Impact
  premiumImpact: "decrease" | "neutral" | "increase";
  recommendedPremiumAdjustment: number; // % adjustment
  
  calculatedAt: Date;
  nextReviewDate: Date;
}

function calculateFleetRiskScore(vehicle: FleetVehicle, maintenanceHistory: MaintenanceRecord[], claimsHistory: Claim[]): FleetRiskScore {
  // 1. Maintenance Risk (30%)
  const maintenanceRisk = calculateMaintenanceRisk(vehicle, maintenanceHistory);
  
  // 2. Claims Risk (35%)
  const claimsRisk = calculateClaimsRisk(vehicle, claimsHistory);
  
  // 3. Vehicle Age Risk (15%)
  const vehicleAgeRisk = calculateAgeRisk(vehicle);
  
  // 4. Usage Risk (10%)
  const usageRisk = calculateUsageRisk(vehicle);
  
  // 5. Repair Cost Risk (10%)
  const repairCostRisk = calculateRepairCostRisk(vehicle, maintenanceHistory);
  
  const overallRiskScore = (
    maintenanceRisk * 0.30 +
    claimsRisk * 0.35 +
    vehicleAgeRisk * 0.15 +
    usageRisk * 0.10 +
    repairCostRisk * 0.10
  );
  
  return {
    vehicleId: vehicle.id,
    fleetId: vehicle.fleetId,
    overallRiskScore,
    maintenanceRisk,
    claimsRisk,
    vehicleAgeRisk,
    usageRisk,
    repairCostRisk,
    riskFactors: identifyRiskFactors(overallRiskScore, maintenanceRisk, claimsRisk),
    premiumImpact: determinePremiumImpact(overallRiskScore),
    recommendedPremiumAdjustment: calculatePremiumAdjustment(overallRiskScore),
    calculatedAt: new Date(),
    nextReviewDate: addMonths(new Date(), 3),
  };
}
```

**Risk Score Integration:**

```
Fleet Risk Score → Insurance Underwriting
                 → Fraud Detection Models
                 → Premium Optimization
                 → Claims Prioritization
                 → Maintenance Recommendations
```

---

### 6. Fleet Dashboard and Visualization

**Dashboard Components:**

```typescript
interface FleetDashboard {
  // Overview Metrics
  totalVehicles: number;
  activeVehicles: number;
  vehiclesUnderMaintenance: number;
  vehiclesWithAlerts: number;
  
  // Maintenance Compliance
  overallComplianceScore: number; // %
  vehiclesCompliant: number;
  vehiclesOverdue: number;
  upcomingMaintenanceCount: number;
  
  // Claims Analytics
  totalClaims: number;
  claimsThisMonth: number;
  claimsThisYear: number;
  averageClaimCost: number;
  claimFrequencyRate: number; // Claims per 100 vehicles per year
  
  // Cost Analytics
  totalMaintenanceCost: number; // Year-to-date
  averageCostPerVehicle: number;
  costTrend: "increasing" | "stable" | "decreasing";
  costOptimizationSavings: number; // Estimated savings from KINGA recommendations
  
  // Risk Analytics
  averageFleetRiskScore: number;
  highRiskVehicles: number;
  riskTrend: "improving" | "stable" | "deteriorating";
  
  // Downtime Analytics
  totalDowntimeDays: number;
  averageDowntimePerVehicle: number;
  downtimeCost: number; // Estimated cost of downtime
  
  // Charts Data
  maintenanceComplianceChart: ChartData;
  claimsFrequencyChart: ChartData;
  costTrendChart: ChartData;
  riskScoreTrendChart: ChartData;
  downtimeAnalysisChart: ChartData;
}
```

**Visualization Specifications:**

1. **Maintenance Compliance Chart** (Donut Chart)
   - Compliant Vehicles (Green)
   - Due Soon (Yellow)
   - Overdue (Red)

2. **Claims Frequency Chart** (Line Chart)
   - X-axis: Time (months)
   - Y-axis: Number of claims
   - Multiple lines for different vehicle types

3. **Cost Trend Chart** (Bar + Line Chart)
   - Bars: Monthly maintenance costs
   - Line: Cumulative cost
   - Benchmark line: Industry average

4. **Risk Score Trend Chart** (Area Chart)
   - X-axis: Time
   - Y-axis: Average risk score
   - Color gradient: Green (low) → Yellow (medium) → Red (high)

5. **Downtime Analysis Chart** (Horizontal Bar Chart)
   - Vehicles ranked by downtime days
   - Color-coded by reason (maintenance, repair, accident)

---

### 7. Claims Integration

**Auto-Population Workflow:**

```
Fleet Vehicle → Claim Submission
     ↓
   [Auto-populate from fleet registry]
     ↓
   ✓ Vehicle specifications
   ✓ Current valuation
   ✓ Maintenance history
   ✓ Insurance policy details
   ✓ Risk score
   ✓ Previous claims
     ↓
   [Enhanced AI Assessment]
     ↓
   ✓ Maintenance context
   ✓ Service history analysis
   ✓ Risk intelligence metadata
   ✓ Valuation confidence boost
```

**Integration API:**

```typescript
interface FleetClaimsIntegration {
  // Auto-populate claim from fleet vehicle
  populateClaimFromFleet(vehicleId: number, claimData: Partial<Claim>): Promise<Claim>;
  
  // Get maintenance context for claim
  getMaintenanceContext(vehicleId: number): Promise<MaintenanceContext>;
  
  // Get risk intelligence for claim
  getRiskIntelligence(vehicleId: number): Promise<RiskIntelligence>;
  
  // Link claim to fleet vehicle
  linkClaimToFleetVehicle(claimId: number, vehicleId: number): Promise<void>;
  
  // Update fleet vehicle after claim settlement
  updateVehicleAfterClaim(vehicleId: number, claimId: number, outcome: ClaimOutcome): Promise<void>;
}

interface MaintenanceContext {
  lastServiceDate: Date;
  lastServiceMileage: number;
  maintenanceCompliance: number; // %
  overdueServices: Array<{
    serviceType: string;
    daysOverdue: number;
  }>;
  recentRepairs: Array<{
    date: Date;
    description: string;
    cost: number;
  }>;
  maintenanceImpact: "positive" | "neutral" | "negative";
}

interface RiskIntelligence {
  currentRiskScore: number;
  riskTrend: "improving" | "stable" | "deteriorating";
  riskFactors: string[];
  previousClaims: number;
  claimFrequency: number;
  fraudRiskIndicators: string[];
}
```

---

## Security and Governance

### Multi-Tenant Data Isolation

```sql
-- All fleet tables include tenantId for isolation
-- Row-level security enforced at database level

CREATE TABLE fleet_vehicles (
  id INT PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  -- ... other columns
  INDEX idx_tenant_id (tenant_id)
);

-- Application-level enforcement
SELECT * FROM fleet_vehicles 
WHERE tenant_id = :current_user_tenant_id;
```

### Role-Based Access Control (RBAC)

```typescript
enum FleetRole {
  FLEET_OWNER = "fleet_owner",           // Full access to fleet
  FLEET_MANAGER = "fleet_manager",       // Manage vehicles and maintenance
  FLEET_OPERATOR = "fleet_operator",     // View-only access
  MAINTENANCE_COORDINATOR = "maintenance_coordinator", // Manage maintenance schedules
  FINANCE_MANAGER = "finance_manager",   // View costs and reports
}

interface FleetPermissions {
  canViewFleet: boolean;
  canEditFleet: boolean;
  canDeleteFleet: boolean;
  canManageVehicles: boolean;
  canScheduleMaintenance: boolean;
  canRequestQuotes: boolean;
  canViewFinancials: boolean;
  canExportReports: boolean;
}
```

### Audit Trail

```typescript
interface FleetAuditLog {
  id: number;
  tenantId: string;
  
  entityType: "fleet" | "vehicle" | "maintenance" | "service_request" | "quote";
  entityId: number;
  
  action: "create" | "update" | "delete" | "view" | "export";
  userId: number;
  userName: string;
  
  changesBefore: string; // JSON snapshot
  changesAfter: string; // JSON snapshot
  
  ipAddress: string;
  userAgent: string;
  
  timestamp: Date;
}
```

### Document Encryption

```typescript
// All uploaded documents encrypted at rest in S3
// Encryption keys managed per tenant

interface DocumentEncryption {
  encryptDocument(file: Buffer, tenantId: string): Promise<EncryptedDocument>;
  decryptDocument(encryptedFile: EncryptedDocument, tenantId: string): Promise<Buffer>;
  rotateEncryptionKey(tenantId: string): Promise<void>;
}
```

---

## API Contracts

### Fleet Registry API

```typescript
// Create fleet
POST /api/fleet/create
Request: {
  fleetName: string;
  fleetType: string;
}
Response: Fleet

// Register vehicle
POST /api/fleet/vehicles/register
Request: FleetVehicle
Response: FleetVehicle

// Upload document
POST /api/fleet/documents/upload
Request: FormData (file + metadata)
Response: FleetDocument

// Get fleet vehicles
GET /api/fleet/:fleetId/vehicles
Response: FleetVehicle[]

// Update vehicle
PUT /api/fleet/vehicles/:vehicleId
Request: Partial<FleetVehicle>
Response: FleetVehicle
```

### Maintenance API

```typescript
// Create maintenance schedule
POST /api/fleet/maintenance/schedule
Request: MaintenanceSchedule
Response: MaintenanceSchedule

// Record maintenance
POST /api/fleet/maintenance/record
Request: MaintenanceRecord
Response: MaintenanceRecord

// Get maintenance alerts
GET /api/fleet/maintenance/alerts
Response: MaintenanceAlert[]

// Get maintenance history
GET /api/fleet/vehicles/:vehicleId/maintenance
Response: MaintenanceRecord[]

// Calculate compliance score
GET /api/fleet/vehicles/:vehicleId/compliance
Response: { score: number; details: object }
```

### Service Marketplace API

```typescript
// Create service request
POST /api/fleet/service/request
Request: ServiceRequest
Response: ServiceRequest

// Submit quote
POST /api/fleet/service/quote
Request: ServiceQuote
Response: ServiceQuote

// Get quotes for request
GET /api/fleet/service/requests/:requestId/quotes
Response: ServiceQuote[]

// Accept quote
POST /api/fleet/service/quotes/:quoteId/accept
Response: ServiceQuote

// Get AI recommendation
GET /api/fleet/service/requests/:requestId/recommendation
Response: { recommendedQuoteId: number; reasoning: string }
```

### Valuation API

```typescript
// Generate valuation
POST /api/fleet/valuation/generate
Request: { vehicleId: number }
Response: ValuationReport

// Export valuation PDF
POST /api/fleet/valuation/export-pdf
Request: { vehicleId: number }
Response: { pdfUrl: string }

// Get depreciation curve
GET /api/fleet/valuation/:vehicleId/depreciation
Response: DepreciationCurve

// Batch fleet valuation
POST /api/fleet/valuation/fleet-report
Request: { fleetId: number }
Response: FleetValuationReport
```

### Risk Intelligence API

```typescript
// Calculate risk score
POST /api/fleet/risk/calculate
Request: { vehicleId: number }
Response: FleetRiskScore

// Get fleet risk overview
GET /api/fleet/:fleetId/risk-overview
Response: {
  averageRiskScore: number;
  highRiskVehicles: number;
  riskDistribution: object;
}

// Get risk trends
GET /api/fleet/vehicles/:vehicleId/risk-trends
Response: Array<{ date: Date; riskScore: number }>
```

### Dashboard API

```typescript
// Get fleet dashboard
GET /api/fleet/:fleetId/dashboard
Response: FleetDashboard

// Get maintenance compliance chart
GET /api/fleet/:fleetId/charts/maintenance-compliance
Response: ChartData

// Get cost analytics
GET /api/fleet/:fleetId/analytics/costs
Response: CostAnalytics

// Export dashboard report
POST /api/fleet/:fleetId/dashboard/export
Response: { reportUrl: string }
```

---

## Event Schema

### Maintenance Events

```typescript
// Maintenance due event
{
  eventType: "maintenance.due",
  vehicleId: number,
  scheduleId: number,
  dueDate: Date,
  maintenanceType: string,
  severity: "low" | "medium" | "high"
}

// Maintenance overdue event
{
  eventType: "maintenance.overdue",
  vehicleId: number,
  scheduleId: number,
  daysOverdue: number,
  maintenanceType: string
}

// Maintenance completed event
{
  eventType: "maintenance.completed",
  vehicleId: number,
  recordId: number,
  serviceType: string,
  cost: number
}
```

### Risk Events

```typescript
// Risk score updated event
{
  eventType: "risk.score_updated",
  vehicleId: number,
  previousScore: number,
  newScore: number,
  trend: "improving" | "deteriorating"
}

// High risk alert event
{
  eventType: "risk.high_risk_alert",
  vehicleId: number,
  riskScore: number,
  riskFactors: string[]
}
```

### Service Marketplace Events

```typescript
// Quote received event
{
  eventType: "service.quote_received",
  requestId: number,
  quoteId: number,
  providerId: number,
  quotedAmount: number
}

// Quote accepted event
{
  eventType: "service.quote_accepted",
  requestId: number,
  quoteId: number,
  providerId: number
}

// Service completed event
{
  eventType: "service.completed",
  requestId: number,
  vehicleId: number,
  actualCost: number,
  actualDuration: number
}
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1)
- ✓ Architecture documentation
- Database schema design
- Core API contracts
- Multi-tenant infrastructure

### Phase 2: Fleet Registry (Week 2)
- Vehicle registration UI
- Document upload system
- Fleet management dashboard
- Basic vehicle CRUD operations

### Phase 3: Maintenance Intelligence (Week 3)
- Maintenance scheduling engine
- Alert generation system
- Service record tracking
- Compliance scoring

### Phase 4: Service Marketplace (Week 4)
- Service request creation
- Quote submission interface
- AI cost optimization
- Provider performance tracking

### Phase 5: Integration (Week 5)
- Valuation engine integration
- Claims auto-population
- Risk scoring integration
- Dashboard analytics

### Phase 6: Testing & Deployment (Week 6)
- End-to-end testing
- Performance optimization
- Security audit
- Production deployment

---

## Success Metrics

**Operational Metrics:**
- Fleet vehicle registration rate
- Maintenance compliance improvement
- Service quote response time
- Cost optimization savings

**Business Metrics:**
- Insurance premium reduction for compliant fleets
- Claims processing time reduction
- Fleet downtime reduction
- Customer satisfaction score

**Technical Metrics:**
- API response time < 200ms
- 99.9% uptime
- Zero data breaches
- Audit log completeness 100%

---

## Conclusion

The KINGA Fleet Management Intelligence Platform transforms fleet operations by providing comprehensive vehicle lifecycle management, predictive maintenance optimization, and seamless integration with insurance underwriting and claims processing. This platform positions KINGA as the central intelligence hub for fleet risk management and cost optimization in the insurance ecosystem.
