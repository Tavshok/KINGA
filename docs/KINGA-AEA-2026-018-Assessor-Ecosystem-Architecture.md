# KINGA Assessor Ecosystem Architecture

**Document ID:** KINGA-AEA-2026-018  
**Version:** 1.1  
**Date:** February 12, 2026  
**Last Updated:** February 12, 2026 (Multi-Currency Support)  
**Author:** Tavonga Shoko  
**Status:** Final  
**Classification:** Internal Architecture Specification  
**Related Documents:** [KINGA-AWL-2026-019](KINGA-AWL-2026-019-Assessor-Workflow-Lifecycle.md) (Assessor Workflow Lifecycle), [KINGA-PMA-2026-020](KINGA-PMA-2026-020-Premium-Monetization-Architecture.md) (Premium Monetization Architecture), [KINGA-CLP-2026-021](KINGA-CLP-2026-021-Continuous-Learning-Pipeline.md) (Continuous Learning Feedback Pipeline)

---

## Executive Summary

This document specifies the complete **Assessor Ecosystem Architecture** for the KINGA multi-tenant insurance claims intelligence platform. The ecosystem supports three distinct assessor participation models—**Insurer Internal Assessors**, **Bring-Your-Own-Assessor (BYOA)**, and **KINGA Marketplace Assessors**—within a unified technical framework that balances insurer control, assessor autonomy, and platform intelligence.

The architecture integrates **AI-powered damage assessment** with **human assessor verification** through a sophisticated reconciliation layer that detects variances, scores confidence, and feeds ground truth data back into continuous learning pipelines. Premium assessor intelligence tools provide optional paid features that enhance assessor productivity while generating incremental platform revenue. The system operates on an **event-driven microservices architecture** with strict multi-tenant isolation, comprehensive audit trails, and regulatory compliance alignment (POPIA, GDPR, FSCA, ISO 27001).

This design consolidates the existing hybrid assessor implementation (4 database tables, 8 tRPC procedures, marketplace search, and rating infrastructure) with expanded capabilities including automated assignment engines, performance analytics, premium tooling, and Kafka-based event orchestration. The result is a scalable, extensible assessor ecosystem that positions KINGA as both a workflow platform and an intelligence layer for the insurance assessment industry.

---

## 1. System Context and Scope

### 1.1 Platform Overview

KINGA is a **multi-tenant insurance claims intelligence and workflow orchestration platform** designed to serve insurers, assessors, claimants, panel beaters, brokers, and fleet operators across the Southern African insurance market. The platform's core value proposition rests on three pillars: **AI-powered damage assessment**, **human assessor verification**, and **AI-human reconciliation intelligence** that continuously improves both AI accuracy and assessor performance.

The Assessor Ecosystem is the **human intelligence layer** of the platform. While AI models provide rapid initial assessments, human assessors deliver the nuanced judgment, physical inspection verification, and regulatory compliance that insurers require for high-value claims, fraud investigations, and contested cases. The ecosystem must therefore support multiple assessor engagement models while maintaining consistent data quality, security, and auditability across all participation types.

### 1.2 Assessor Participation Models

The architecture supports three distinct assessor engagement models, each with different access rights, data visibility, and commercial relationships:

| **Model** | **Description** | **Insurer Relationship** | **Platform Relationship** | **Revenue Model** |
|-----------|----------------|-------------------------|--------------------------|-------------------|
| **Insurer Internal Assessors** | Full-time employees of the insurer organization | Direct employment | Platform user account | Included in insurer subscription |
| **Bring-Your-Own-Assessor (BYOA)** | Independent assessors contracted directly by the insurer | Direct contract with insurer | Platform user account (insurer-sponsored) | Included in insurer subscription |
| **KINGA Marketplace Assessors** | Independent assessors registered on the KINGA marketplace | No pre-existing relationship | Direct platform relationship | 12-20% commission on assignments |

Each model requires different onboarding workflows, access control policies, performance tracking mechanisms, and billing integrations. The architecture must support **hybrid assessors** who operate in multiple modes simultaneously (e.g., an insurer's internal assessor who also accepts marketplace assignments from other insurers).

### 1.3 Architectural Principles

The Assessor Ecosystem architecture adheres to the following design principles:

**Multi-Tenant Isolation:** Assessor data, performance metrics, and assignment histories are strictly isolated by tenant (insurer organization). Marketplace assessors operate across multiple tenants but with assignment-scoped access controls that prevent cross-tenant data leakage.

**Event-Driven Orchestration:** All assessor lifecycle events (registration, assignment, report submission, performance scoring, payment processing) are published to a Kafka event bus, enabling asynchronous processing, audit logging, and integration with external systems.

**AI-Human Symbiosis:** The architecture treats AI and human assessors as complementary intelligence sources rather than competing alternatives. The reconciliation layer compares both outputs, detects variances, and uses disagreements as training signals for continuous improvement.

**Premium Feature Extensibility:** The system supports optional paid features (AI cost optimization recommendations, damage detection overlays, parts pricing intelligence) that enhance assessor productivity while generating incremental platform revenue through tiered subscription models.

**Regulatory Compliance by Design:** All assessor credentials, certifications, licensing, and professional indemnity insurance are tracked with expiry monitoring and automated renewal reminders to ensure continuous regulatory compliance (FSCA requirements for insurance assessors in South Africa).

**Multi-Currency Flexibility:** The system supports any market currency (USD, ZIG, ZAR, GHS, KES, NGN, etc.) with explicit currency tracking at tenant, assessor, and transaction levels. All monetary values are stored with ISO 4217 currency codes, and platform analytics normalize to USD for cross-market reporting.

---

## 2. Assessor Identity and Registration Service

### 2.1 Service Responsibilities

The **Assessor Identity and Registration Service** manages the complete lifecycle of assessor accounts from initial registration through credential verification, profile management, multi-insurer eligibility mapping, and eventual deactivation. The service maintains a **unified assessor identity** that can operate across multiple participation models and multiple insurer tenants simultaneously.

**Core Responsibilities:**

- **Assessor Onboarding:** Three distinct onboarding workflows for internal assessors (insurer-initiated), BYOA assessors (insurer-invited), and marketplace assessors (self-registration with vetting).
- **Credential Verification:** Automated verification of professional licenses, certifications, and insurance coverage through integration with regulatory databases (FSCA, SAQA) and third-party verification services.
- **Profile Management:** Structured storage of assessor specializations (collision, theft, hail damage, fire), service regions, certification levels (junior, senior, expert, master), years of experience, and availability schedules.
- **Multi-Insurer Eligibility:** Mapping of assessor relationships to multiple insurer tenants with relationship-specific metadata (hourly rate, commission tier, access level, approval status).
- **Compliance Monitoring:** Continuous tracking of license expiry dates, insurance renewal deadlines, and certification validity with automated alerts and suspension triggers.

### 2.2 Database Schema

The service operates on four primary database tables (already implemented in the KINGA platform):

**`assessors` Table:**

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT (PK) | Unique assessor identifier |
| `user_id` | INT (FK → users) | Link to platform user account |
| `professional_license_number` | VARCHAR(50) | Regulatory license number (FSCA) |
| `license_expiry_date` | DATE | License expiration date |
| `certification_level` | ENUM | junior, senior, expert, master |
| `years_of_experience` | INT | Total years in assessment field |
| `specializations` | JSON | Array of specialization areas |
| `certifications` | JSON | Array of professional certifications |
| `service_regions` | JSON | Geographic service coverage areas |
| `max_travel_distance_km` | INT | Maximum travel radius for assignments |
| `assessor_type` | ENUM | insurer_owned, marketplace, hybrid |
| `marketplace_enabled` | BOOLEAN | Marketplace participation flag |
| `marketplace_bio` | TEXT | Public marketplace profile description |
| `marketplace_hourly_rate` | DECIMAL(10,2) | Marketplace hourly rate (base currency) |
| `marketplace_currency` | VARCHAR(3) | ISO 4217 currency code (USD, ZIG, ZAR, etc.) |
| `marketplace_availability` | ENUM | full_time, part_time, on_demand |
| `insurance_expiry_date` | DATE | Professional indemnity insurance expiry |
| `average_rating` | DECIMAL(3,2) | Marketplace average rating (0-5) |
| `total_reviews` | INT | Total marketplace reviews received |
| `total_assignments_completed` | INT | Lifetime assignment count |
| `created_at` | TIMESTAMP | Registration timestamp |
| `updated_at` | TIMESTAMP | Last profile update timestamp |

**`assessor_insurer_relationships` Table:**

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT (PK) | Unique relationship identifier |
| `assessor_id` | INT (FK → assessors) | Assessor reference |
| `tenant_id` | VARCHAR(64) | Insurer tenant identifier |
| `relationship_type` | ENUM | insurer_owned, byoa, marketplace |
| `approval_status` | ENUM | pending, approved, suspended, terminated |
| `hourly_rate` | DECIMAL(10,2) | Insurer-specific hourly rate |
| `currency` | VARCHAR(3) | ISO 4217 currency code for this relationship |
| `commission_tier` | ENUM | gold (12%), silver (15%), bronze (20%) |
| `access_level` | ENUM | full, restricted, read_only |
| `approved_by` | INT (FK → users) | Insurer user who approved relationship |
| `approved_at` | TIMESTAMP | Approval timestamp |
| `created_at` | TIMESTAMP | Relationship creation timestamp |

**`assessor_marketplace_reviews` Table:**

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT (PK) | Unique review identifier |
| `assessor_id` | INT (FK → assessors) | Assessor being reviewed |
| `claim_id` | INT (FK → claims) | Claim assignment reference |
| `reviewer_user_id` | INT (FK → users) | Insurer user who submitted review |
| `tenant_id` | VARCHAR(64) | Reviewing insurer tenant |
| `rating` | INT | Rating score (1-5) |
| `review_text` | TEXT | Written review content |
| `created_at` | TIMESTAMP | Review submission timestamp |

**`marketplace_transactions` Table:**

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT (PK) | Unique transaction identifier |
| `assessor_id` | INT (FK → assessors) | Assessor receiving payment |
| `claim_id` | INT (FK → claims) | Claim assignment reference |
| `tenant_id` | VARCHAR(64) | Paying insurer tenant |
| `currency` | VARCHAR(3) | ISO 4217 currency code (USD, ZIG, ZAR, etc.) |
| `gross_amount` | DECIMAL(10,2) | Total assignment fee in transaction currency |
| `commission_rate` | DECIMAL(5,2) | KINGA commission percentage |
| `commission_amount` | DECIMAL(10,2) | KINGA commission in transaction currency |
| `net_amount` | DECIMAL(10,2) | Assessor payout in transaction currency |
| `exchange_rate` | DECIMAL(10,6) | Exchange rate to USD (for reporting) |
| `gross_amount_usd` | DECIMAL(10,2) | Gross amount in USD (for platform analytics) |
| `payment_status` | ENUM | pending, processed, paid, failed |
| `payment_date` | TIMESTAMP | Payout processing timestamp |
| `created_at` | TIMESTAMP | Transaction creation timestamp |

### 2.3 Onboarding Workflows

**Insurer Internal Assessor Onboarding:**

1. Insurer admin initiates onboarding via `/add-assessor` UI page
2. Admin provides assessor name, email, professional license number, certification level, specializations, and service regions
3. System creates user account with `role=assessor` and `tenant_id=insurer_tenant`
4. System creates assessor profile with `assessor_type=insurer_owned`
5. System creates `assessor_insurer_relationships` entry with `relationship_type=insurer_owned` and `approval_status=approved`
6. System sends invitation email to assessor with account activation link
7. Assessor completes profile setup and uploads credential documents
8. System triggers credential verification workflow (automated license check via FSCA API)
9. Upon verification success, assessor account is activated and appears in insurer's assessor team list

**BYOA Assessor Onboarding:**

1. Insurer admin invites external assessor via `/add-assessor` UI page (same interface as internal assessor)
2. System creates user account with `role=assessor` and `tenant_id=insurer_tenant`
3. System creates assessor profile with `assessor_type=insurer_owned` (BYOA assessors are treated as insurer-owned for access control purposes)
4. System creates `assessor_insurer_relationships` entry with `relationship_type=byoa` and `approval_status=approved`
5. Workflow proceeds identically to internal assessor onboarding
6. **Key Difference:** BYOA assessors can later enable marketplace participation via profile settings, converting to `assessor_type=hybrid`

**KINGA Marketplace Assessor Onboarding:**

1. Independent assessor self-registers via public `/join-as-assessor` page
2. Assessor provides professional license number, certification level, years of experience, specializations, service regions, marketplace bio, hourly rate, and availability
3. System creates user account with `role=assessor` and `tenant_id=NULL` (marketplace assessors are not tenant-bound)
4. System creates assessor profile with `assessor_type=marketplace` and `marketplace_enabled=true`
5. System triggers **5-stage vetting pipeline:**
   - **Stage 1:** Automated license verification via FSCA API
   - **Stage 2:** Professional indemnity insurance verification
   - **Stage 3:** Background check (criminal record, credit check)
   - **Stage 4:** Reference verification (minimum 2 professional references)
   - **Stage 5:** Manual review by KINGA compliance team
6. Upon vetting approval, assessor profile is published to marketplace and appears in insurer search results
7. Assessor receives onboarding email with marketplace guidelines, commission structure, and payment terms

### 2.4 Credential Verification Integration

The service integrates with the following external verification providers:

| **Provider** | **Purpose** | **Integration Method** | **Verification Frequency** |
|-------------|------------|----------------------|---------------------------|
| FSCA (Financial Sector Conduct Authority) | Professional license verification | REST API | Initial + annual renewal check |
| SAQA (South African Qualifications Authority) | Educational qualification verification | REST API | Initial verification only |
| CompuScan / TransUnion | Background and credit checks | REST API | Initial verification only |
| Insurance Provider APIs | Professional indemnity insurance verification | REST API | Initial + quarterly renewal check |

All verification results are stored in an `assessor_verifications` audit table with timestamps, verification provider, verification status, and expiry dates. The system monitors expiry dates and triggers automated renewal reminders 30 days before expiration.

### 2.5 API Procedures (Already Implemented)

The following tRPC procedures are operational in the current KINGA platform:

**`assessorOnboarding.addInsurerOwnedAssessor`** — Insurer admin adds internal or BYOA assessor  
**`assessorOnboarding.registerMarketplaceAssessor`** — Independent assessor self-registers for marketplace  
**`assessorOnboarding.getMyProfile`** — Assessor retrieves own profile data  
**`assessorOnboarding.updateProfile`** — Assessor updates profile fields  
**`assessorOnboarding.enableMarketplace`** — Insurer-owned assessor converts to hybrid model  
**`assessorOnboarding.listInsurerAssessors`** — Insurer retrieves list of their assessors  
**`assessorOnboarding.searchMarketplace`** — Insurer searches marketplace assessors with filters (region, specialization, rating, performance score)  
**`assessorOnboarding.getAssessorById`** — Retrieve assessor profile by ID (with access control)

---

## 3. Assessor Assignment Engine

### 3.1 Assignment Models

The **Assessor Assignment Engine** orchestrates the matching of claims to assessors based on automated rules, manual insurer selection, and intelligent recommendation algorithms. The engine supports three assignment models:

**Manual Assignment:** Insurer user manually selects an assessor from their team or the marketplace via the `/assign-assessor/:claimId` UI page. This is the current operational mode in the KINGA platform.

**Automated Assignment:** The system automatically assigns claims to assessors based on configurable rules (geographic proximity, specialization match, availability, workload balancing, performance score). This mode requires the **Assignment Rule Engine** component (not yet implemented).

**Hybrid Assignment:** The system recommends a ranked list of suitable assessors, and the insurer user makes the final selection. This mode combines automated intelligence with human oversight.

### 3.2 Assignment Rule Engine Design

The **Assignment Rule Engine** evaluates each available assessor against a weighted scoring algorithm that considers multiple factors:

| **Factor** | **Weight** | **Scoring Logic** | **Data Source** |
|-----------|-----------|------------------|----------------|
| **Geographic Proximity** | 30% | Distance from claim location to assessor service region. Score = 100 - (distance_km / max_travel_distance_km * 100) | `assessors.service_regions`, `claims.incident_location` |
| **Specialization Match** | 25% | Percentage of claim damage types matching assessor specializations | `assessors.specializations`, `ai_assessments.damage_categories` |
| **Availability** | 20% | Assessor current workload vs capacity. Score = 100 - (active_assignments / max_concurrent_assignments * 100) | Real-time assignment tracking |
| **Performance Score** | 15% | Composite performance score (accuracy, turnaround time, insurer satisfaction) | `assessors.performance_score` (calculated by Performance Analytics Engine) |
| **Cost Efficiency** | 10% | Inverse of hourly rate. Score = 100 - (hourly_rate / max_market_rate * 100) | `assessor_insurer_relationships.hourly_rate` or `assessors.marketplace_hourly_rate` |

The engine calculates a **composite assignment score** for each eligible assessor and returns a ranked list. The top-ranked assessor is auto-assigned in **Automated Assignment** mode, or the top 5 assessors are presented to the insurer user in **Hybrid Assignment** mode.

### 3.3 Conflict-of-Interest Detection

Before assigning an assessor to a claim, the engine performs conflict-of-interest checks:

**Vehicle Ownership Check:** Assessor cannot be assigned to claims involving vehicles they own or have ownership interest in (cross-reference `claims.vehicle_registration` with assessor personal vehicle database).

**Family Relationship Check:** Assessor cannot be assigned to claims involving family members (cross-reference `claimant_id` with assessor family relationship declarations).

**Prior Involvement Check:** Assessor cannot be assigned to claims they have previously assessed for a different insurer (prevents double-dipping and collusion).

**Panel Beater Relationship Check:** Assessor cannot be assigned to claims where they have financial relationships with the selected panel beaters (prevents kickback schemes).

All conflict checks are logged in the `audit_trail` table with conflict type, detection timestamp, and resolution action.

### 3.4 Assignment Lifecycle State Machine

Each claim assignment progresses through the following states:

```
ASSIGNMENT_PENDING → ASSIGNED → ACCEPTED → IN_PROGRESS → SUBMITTED → REVIEWED → COMPLETED → PAID
                         ↓
                    REJECTED (assessor declines assignment)
                         ↓
                    REASSIGNMENT_PENDING (system finds new assessor)
```

**State Transition Events:**

- **ASSIGNMENT_PENDING → ASSIGNED:** Assignment engine selects assessor and creates assignment record
- **ASSIGNED → ACCEPTED:** Assessor accepts assignment via mobile app or web portal (24-hour acceptance window)
- **ASSIGNED → REJECTED:** Assessor declines assignment (triggers reassignment workflow)
- **ACCEPTED → IN_PROGRESS:** Assessor begins inspection (first photo uploaded or location check-in)
- **IN_PROGRESS → SUBMITTED:** Assessor submits completed report
- **SUBMITTED → REVIEWED:** Insurer reviews report and AI-human reconciliation analysis
- **REVIEWED → COMPLETED:** Insurer approves report and closes assignment
- **COMPLETED → PAID:** Payment processed to assessor (marketplace assessors only)

All state transitions publish events to the Kafka `assessor.assignment.state_changed` topic for audit logging and downstream processing.

### 3.5 Load Balancing and Capacity Management

The engine tracks real-time assessor workload to prevent over-assignment:

**Capacity Tracking:** Each assessor declares a `max_concurrent_assignments` value (default: 5 for full-time, 3 for part-time, 1 for on-demand). The engine counts active assignments (states: ACCEPTED, IN_PROGRESS, SUBMITTED) and excludes assessors at capacity from assignment eligibility.

**Fair Distribution:** For insurer internal assessors, the engine implements **round-robin load balancing** to ensure equitable assignment distribution across the team. For marketplace assessors, the engine prioritizes **performance-weighted distribution** to reward high-performing assessors with more assignments.

**Geographic Load Balancing:** If multiple assessors serve the same region, the engine distributes assignments based on current workload to prevent clustering.

### 3.6 Assignment API Procedures

**`claims.assignToAssessor`** (Already Implemented) — Manually assign claim to specific assessor  
**`claims.autoAssignClaim`** (To Be Implemented) — Trigger automated assignment for claim  
**`claims.getRecommendedAssessors`** (To Be Implemented) — Retrieve ranked list of recommended assessors for claim  
**`claims.acceptAssignment`** (To Be Implemented) — Assessor accepts assignment  
**`claims.rejectAssignment`** (To Be Implemented) — Assessor rejects assignment with reason  
**`claims.reassignClaim`** (To Be Implemented) — Insurer manually reassigns claim to different assessor

---

## 4. Assessor Reporting Interface

### 4.1 Digital Inspection Reporting Tools

The **Assessor Reporting Interface** provides structured digital tools for assessors to conduct inspections, document damage, estimate costs, and submit reports. The interface is accessible via web portal and mobile app (iOS/Android) with offline-first architecture for field inspections.

**Core Reporting Components:**

**Damage Documentation Module:** Photo capture with GPS tagging, timestamp watermarking, and automatic orientation correction. Assessors capture multiple angles of each damage area with guided photo checklists (front, rear, left, right, undercarriage, interior). Photos are uploaded to S3 with SHA-256 integrity verification.

**AI-Assisted Damage Identification:** As assessors upload photos, the AI damage detection model (already operational in KINGA) analyzes images and highlights detected damage areas with bounding boxes and confidence scores. Assessors can accept, reject, or modify AI detections, providing ground truth feedback for continuous learning.

**Structured Damage Categorization:** Assessors classify each damage area by type (collision, scratch, dent, crack, shatter, burn, water damage), severity (minor, moderate, severe, total loss), and affected components (body panel, window, tire, engine, interior). This structured data feeds the AI training pipeline.

**Cost Estimation Tools:** Assessors use integrated parts pricing databases (AutoTrader, Midas, Motus Parts) to lookup component replacement costs. Labor cost estimation uses standardized labor rate tables (MIWA labor guides) with time multipliers based on damage complexity. The system calculates total repair cost as: `Total = Parts Cost + Labor Cost + Paint/Materials + VAT`.

**Repair Recommendation Engine:** Assessors select recommended repair strategy (replace, repair, paint, ignore) for each damaged component. The system flags cost-inefficient recommendations (e.g., recommending replacement when repair cost is <40% of replacement cost) for assessor review.

**Fraud Indicator Tagging:** Assessors can flag fraud indicators detected during inspection (pre-existing damage, inconsistent damage patterns, odometer tampering, VIN alterations, staged accident evidence). These tags feed the fraud detection analytics engine.

### 4.2 Report Submission Workflow

1. Assessor completes all required sections (damage documentation, cost estimation, repair recommendations)
2. System validates report completeness (minimum photo count, all damage areas categorized, cost estimates provided)
3. Assessor reviews AI-human comparison preview (variance highlights, confidence scores)
4. Assessor submits report with digital signature and timestamp
5. System publishes `assessor.report.submitted` event to Kafka
6. System triggers AI-Human Reconciliation Layer analysis
7. System notifies insurer of report availability
8. Report enters SUBMITTED state in assignment lifecycle

### 4.3 Timestamped Audit Trails

All assessor actions during inspection are logged with microsecond-precision timestamps:

- Photo capture timestamp (device time + GPS time for verification)
- Damage categorization timestamp
- Cost estimation timestamp
- AI detection acceptance/rejection timestamp
- Report submission timestamp
- Report modification timestamp (if insurer requests changes)

Audit trails are immutable and stored in the `audit_trail` table with SHA-256 hash chains to prevent tampering. This provides regulatory compliance for dispute resolution and fraud investigations.

### 4.4 Reporting API Procedures

**`assessor.getAssignedClaims`** (Already Implemented) — Retrieve list of assigned claims  
**`assessor.getClaimDetails`** (Already Implemented) — Retrieve claim details for inspection  
**`assessor.uploadInspectionPhoto`** (To Be Implemented) — Upload inspection photo to S3  
**`assessor.submitDamageAssessment`** (To Be Implemented) — Submit damage categorization and cost estimates  
**`assessor.submitReport`** (To Be Implemented) — Finalize and submit complete inspection report  
**`assessor.updateReport`** (To Be Implemented) — Modify submitted report (with version tracking)

---

## 5. AI-Human Reconciliation Layer

### 5.1 Reconciliation Architecture

The **AI-Human Reconciliation Layer** is the intelligence core of the KINGA platform. It compares AI-generated assessments with human assessor reports across three dimensions—**damage scope**, **cost estimates**, and **fraud indicators**—and produces variance detection scores, confidence metrics, and escalation recommendations.

The reconciliation process operates asynchronously after both AI and human assessor reports are submitted for a claim. The layer does not block the claims workflow; instead, it provides **decision support intelligence** to insurer users during the comparison review phase.

### 5.2 Variance Detection Algorithm

The reconciliation engine calculates variance across three dimensions:

**Damage Scope Variance:**

Compares the set of damaged components identified by AI vs assessor. Calculates:

- **Precision:** Percentage of AI-detected components confirmed by assessor  
  `Precision = (AI ∩ Assessor) / AI`
- **Recall:** Percentage of assessor-identified components detected by AI  
  `Recall = (AI ∩ Assessor) / Assessor`
- **F1 Score:** Harmonic mean of precision and recall  
  `F1 = 2 * (Precision * Recall) / (Precision + Recall)`

**Example:**

- AI detects: [front_bumper, hood, left_fender, headlight]
- Assessor identifies: [front_bumper, hood, left_fender, windshield]
- Intersection: [front_bumper, hood, left_fender]
- Precision: 3/4 = 75%
- Recall: 3/4 = 75%
- F1 Score: 75%

**Cost Estimate Variance:**

Compares total repair cost estimates:

- **Absolute Variance:** `|AI_Cost - Assessor_Cost|`
- **Percentage Variance:** `(|AI_Cost - Assessor_Cost| / Assessor_Cost) * 100`

**Variance Severity Classification:**

| Variance % | Severity | Action |
|-----------|----------|--------|
| 0-10% | Low | Auto-approve (high confidence) |
| 11-25% | Moderate | Insurer review recommended |
| 26-50% | High | Insurer review required |
| >50% | Critical | Escalate to senior claims manager |

**Fraud Indicator Variance:**

Compares fraud risk scores:

- **AI Fraud Score:** Composite score from physics validation, pattern detection, and anomaly detection (0-100)
- **Assessor Fraud Flags:** Binary flags for specific fraud indicators (pre-existing damage, staged accident, etc.)
- **Variance:** If AI fraud score >70 and assessor flags no fraud indicators, or vice versa, trigger **fraud investigation escalation**

### 5.3 Confidence Scoring Methodology

The reconciliation engine calculates an **aggregate confidence score** (0-100) that represents the system's confidence in the final assessment recommendation:

```
Confidence Score = (
  0.40 * Damage_Scope_F1_Score +
  0.35 * (100 - Cost_Variance_Percentage) +
  0.15 * Assessor_Performance_Score +
  0.10 * AI_Model_Confidence
)
```

**Interpretation:**

- **90-100:** Very High Confidence — Auto-approve claim with AI or assessor recommendation
- **75-89:** High Confidence — Insurer review recommended but low risk
- **60-74:** Moderate Confidence — Insurer review required
- **<60:** Low Confidence — Escalate to senior claims manager or request second assessor opinion

### 5.4 Escalation Protocol

The reconciliation layer implements a **six-tier escalation protocol** based on variance severity and confidence scores:

| **Tier** | **Trigger Condition** | **Escalation Action** | **Responsible Party** |
|---------|----------------------|----------------------|----------------------|
| **Tier 0** | Confidence >90%, Variance <10% | Auto-approve, no human review | System (automated) |
| **Tier 1** | Confidence 75-89%, Variance 11-25% | Flag for insurer review (optional) | Claims processor |
| **Tier 2** | Confidence 60-74%, Variance 26-50% | Require insurer review and approval | Claims processor |
| **Tier 3** | Confidence <60%, Variance >50% | Escalate to senior claims manager | Claims manager |
| **Tier 4** | Fraud variance detected | Escalate to fraud investigation unit | Fraud investigator |
| **Tier 5** | Assessor-AI disagreement on total loss | Escalate to executive claims committee | Executive team |

All escalations are logged in the `audit_trail` table with escalation tier, trigger reason, assigned reviewer, and resolution outcome.

### 5.5 Decision Audit Trail

Every reconciliation analysis generates an immutable audit record stored in the `ai_human_reconciliation` table:

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT (PK) | Unique reconciliation record ID |
| `claim_id` | INT (FK → claims) | Claim reference |
| `ai_assessment_id` | INT (FK → ai_assessments) | AI assessment reference |
| `assessor_evaluation_id` | INT (FK → assessor_evaluations) | Assessor report reference |
| `damage_scope_precision` | DECIMAL(5,2) | Damage scope precision score (%) |
| `damage_scope_recall` | DECIMAL(5,2) | Damage scope recall score (%) |
| `damage_scope_f1` | DECIMAL(5,2) | Damage scope F1 score (%) |
| `cost_variance_absolute` | DECIMAL(10,2) | Absolute cost variance (transaction currency) |
| `cost_variance_percentage` | DECIMAL(5,2) | Percentage cost variance (%) |
| `fraud_variance_detected` | BOOLEAN | Fraud indicator disagreement flag |
| `confidence_score` | DECIMAL(5,2) | Aggregate confidence score (0-100) |
| `escalation_tier` | INT | Escalation tier (0-5) |
| `recommended_action` | ENUM | auto_approve, review_recommended, review_required, escalate |
| `final_decision` | ENUM | approved, rejected, pending_review |
| `decision_maker_id` | INT (FK → users) | User who made final decision |
| `decision_timestamp` | TIMESTAMP | Decision timestamp |
| `created_at` | TIMESTAMP | Reconciliation analysis timestamp |

This table provides complete traceability for regulatory audits, dispute resolution, and continuous learning feedback.

### 5.6 Reconciliation API Procedures

**`reconciliation.analyzeClaimVariance`** (To Be Implemented) — Trigger reconciliation analysis for claim  
**`reconciliation.getReconciliationReport`** (To Be Implemented) — Retrieve reconciliation analysis results  
**`reconciliation.overrideRecommendation`** (To Be Implemented) — Insurer overrides system recommendation  
**`reconciliation.escalateClaim`** (To Be Implemented) — Manually escalate claim to higher tier

---

## 6. Assessor Performance Analytics Engine

### 6.1 Performance Scoring Framework

The **Assessor Performance Analytics Engine** calculates a **composite performance score** (0-100) for each assessor based on six weighted dimensions:

| **Dimension** | **Weight** | **Measurement** | **Data Source** |
|--------------|-----------|----------------|----------------|
| **Accuracy vs AI** | 25% | Average F1 score from AI-human reconciliation | `ai_human_reconciliation.damage_scope_f1` |
| **Cost Optimization** | 20% | Percentage of cost estimates within 15% of final approved cost | `ai_human_reconciliation.cost_variance_percentage` |
| **Turnaround Time** | 20% | Average time from assignment acceptance to report submission vs SLA | `audit_trail` timestamps |
| **Insurer Satisfaction** | 20% | Average rating from insurer reviews | `assessor_marketplace_reviews.rating` |
| **Fraud Detection Participation** | 10% | Percentage of fraud cases where assessor flagged fraud indicators before AI | `fraud_indicators` table |
| **Report Quality** | 5% | Percentage of reports requiring revisions | `audit_trail` report modification count |

**Composite Performance Score Calculation:**

```
Performance Score = (
  0.25 * Accuracy_Score +
  0.20 * Cost_Optimization_Score +
  0.20 * Turnaround_Time_Score +
  0.20 * Insurer_Satisfaction_Score +
  0.10 * Fraud_Detection_Score +
  0.05 * Report_Quality_Score
)
```

Each dimension score is normalized to 0-100 scale before weighted aggregation.

### 6.2 Performance Tier Classification

Assessors are classified into performance tiers based on composite scores:

| **Tier** | **Score Range** | **Badge** | **Benefits** |
|---------|----------------|----------|-------------|
| **Master** | 90-100 | Gold Star | 12% commission, priority assignment, featured marketplace listing |
| **Expert** | 75-89 | Silver Star | 15% commission, standard assignment priority |
| **Proficient** | 60-74 | Bronze Star | 18% commission, standard assignment priority |
| **Developing** | 40-59 | No Badge | 20% commission, lower assignment priority |
| **Probationary** | <40 | Warning Flag | 20% commission, manual review required for assignments |

Performance tiers are recalculated monthly based on trailing 90-day performance data. Tier changes trigger automated notifications to assessors with performance improvement recommendations.

### 6.3 Performance Dashboard Metrics

Each assessor has access to a **personal performance dashboard** (`/assessor/performance`) displaying:

**Overall Performance Score:** Current composite score with trend graph (last 12 months)

**Dimension Breakdown:** Radar chart showing scores across all 6 dimensions

**Accuracy Metrics:**
- Average F1 score vs AI
- Precision and recall trends
- Most frequently missed damage categories

**Cost Optimization Metrics:**
- Average cost variance percentage
- Over-estimation vs under-estimation ratio
- Cost accuracy trend over time

**Turnaround Time Metrics:**
- Average time to report submission
- SLA compliance rate
- Fastest and slowest assignments

**Insurer Satisfaction Metrics:**
- Average rating (1-5 stars)
- Total reviews received
- Recent review highlights

**Fraud Detection Metrics:**
- Fraud cases participated in
- Fraud detection accuracy rate
- Fraud indicators flagged

**Earnings Summary:**
- Total assignments completed
- Total earnings (gross)
- Average earnings per assignment
- Commission tier and next tier threshold

### 6.4 Insurer-Facing Analytics

Insurers have access to **assessor performance comparison dashboards** (`/insurer/assessor-analytics`) displaying:

**Team Performance Overview:** Aggregate performance scores for all internal and BYOA assessors

**Individual Assessor Profiles:** Detailed performance breakdowns for each assessor

**Marketplace Assessor Comparison:** Side-by-side comparison of marketplace assessors by performance tier, cost efficiency, and availability

**Assignment Distribution Analysis:** Visualization of assignment distribution across assessors with workload balancing metrics

**Cost Efficiency Analysis:** Comparison of average cost estimates by assessor vs final approved costs (identifies over-estimators and under-estimators)

**Turnaround Time Analysis:** Average turnaround time by assessor with SLA compliance rates

### 6.5 Performance Analytics API Procedures

**`analytics.getAssessorPerformanceScore`** (To Be Implemented) — Retrieve composite performance score for assessor  
**`analytics.getPerformanceDashboard`** (To Be Implemented) — Retrieve assessor performance dashboard data  
**`analytics.getInsurerAssessorAnalytics`** (To Be Implemented) — Retrieve insurer-facing assessor analytics  
**`analytics.compareAssessors`** (To Be Implemented) — Side-by-side comparison of multiple assessors

---

## 7. Premium Assessor Intelligence Tools

### 7.1 Freemium Business Model

The **Premium Assessor Intelligence Tools** operate on a **freemium subscription model** where basic assessment tools are included in all assessor accounts, but advanced AI-powered intelligence features require paid subscriptions. This generates incremental platform revenue while enhancing assessor productivity and accuracy.

**Subscription Tiers:**

| **Tier** | **Monthly Fee** | **Features Included** | **Target Audience** |
|---------|----------------|----------------------|-------------------|
| **Free** | $0 / R0 / ZIG0 | Basic reporting tools, photo upload, manual cost estimation, performance dashboard | Entry-level assessors, low-volume users |
| **Premium** | $19 / R350 / ZIG500 per month | All Free features + AI cost optimization recommendations, damage detection overlays, parts pricing intelligence | Independent assessors, moderate-volume users |
| **Enterprise** | $59 / R1,100 / ZIG1,500 per month | All Premium features + repair strategy suggestions, comparative benchmarking, performance coaching analytics, priority support | High-volume assessors, assessment firms |

### 7.2 AI Cost Optimization Recommendations

**Feature Description:** The system analyzes the assessor's cost estimates and provides AI-powered recommendations to optimize repair costs while maintaining quality standards.

**Capabilities:**

- **Alternative Parts Sourcing:** Suggests aftermarket or OEM-equivalent parts with lower costs (e.g., "Replace OEM bumper ($850 / ZIG2,200) with certified aftermarket bumper ($420 / ZIG1,100) — 51% savings")
- **Repair vs Replace Analysis:** Recommends repair strategies when replacement costs exceed repair costs by >40% (e.g., "Dent removal ($120 / ZIG300) recommended instead of panel replacement ($650 / ZIG1,700)")
- **Labor Efficiency Suggestions:** Identifies opportunities to combine labor tasks and reduce total labor hours (e.g., "Combine front bumper removal with headlight replacement to save 1.5 labor hours")
- **Paint Optimization:** Recommends spot painting vs full panel painting when damage is localized (e.g., "Spot paint left door ($80 / ZIG200) vs full panel paint ($240 / ZIG600)")

**Implementation:** The AI model is trained on historical claims data (approved vs rejected cost estimates, final repair costs, insurer feedback) and uses reinforcement learning to optimize recommendations based on approval rates.

### 7.3 Damage Detection Enhancement Overlays

**Feature Description:** The system overlays AI-detected damage areas on assessor-uploaded photos with bounding boxes, confidence scores, and damage type labels to assist in damage identification.

**Capabilities:**

- **Real-Time Damage Highlighting:** As assessor uploads photos, AI model analyzes images and highlights detected damage areas with color-coded bounding boxes (red = high confidence, yellow = medium confidence, gray = low confidence)
- **Damage Type Classification:** Each bounding box is labeled with detected damage type (dent, scratch, crack, shatter, etc.) and severity (minor, moderate, severe)
- **Missed Damage Alerts:** If AI detects damage areas not documented by assessor, system triggers alert: "AI detected potential damage on right rear quarter panel — please review"
- **Confidence Score Display:** Each detection shows AI confidence score (0-100%) to help assessor prioritize review

**Implementation:** Uses the existing KINGA AI damage detection model (already operational) with enhanced visualization layer in the assessor mobile app and web portal.

### 7.4 Parts Pricing Intelligence

**Feature Description:** The system provides real-time parts pricing data from multiple suppliers with automated price comparison and availability checking.

**Capabilities:**

- **Multi-Supplier Price Comparison:** Queries parts pricing APIs from AutoTrader, Midas, Motus Parts, and aftermarket suppliers to display lowest available prices
- **Availability Status:** Shows real-time stock availability and estimated delivery times for each supplier
- **Price History Trends:** Displays 12-month price trend graphs for each part to identify pricing anomalies
- **Bulk Pricing Discounts:** Flags opportunities for bulk pricing when multiple parts can be sourced from same supplier

**Implementation:** Integrates with parts supplier APIs via REST endpoints with 15-minute cache refresh intervals. Pricing data is stored in `parts_pricing_cache` table for offline access.

### 7.5 Repair Strategy Suggestions

**Feature Description:** The system recommends optimal repair strategies based on damage severity, vehicle age, market value, and historical repair outcomes.

**Capabilities:**

- **Total Loss Analysis:** Calculates total loss threshold (repair cost vs vehicle market value) and recommends total loss declaration when repair cost exceeds 70% of market value
- **Repair Sequencing:** Recommends optimal repair task sequencing to minimize labor time and prevent rework (e.g., "Complete structural repairs before paint work")
- **Quality vs Cost Tradeoffs:** Suggests repair strategy options with quality-cost tradeoff analysis (e.g., "Option A: OEM parts + dealership labor = $4,500 / ZIG11,500, Option B: Aftermarket parts + independent shop = $2,800 / ZIG7,200")

### 7.6 Comparative Repair Benchmarking

**Feature Description:** The system provides benchmarking data comparing the assessor's cost estimates against historical averages for similar repairs.

**Capabilities:**

- **Peer Comparison:** Shows how assessor's cost estimate compares to average estimates from other assessors for similar damage types (e.g., "Your estimate: $1,250 / ZIG3,200 | Peer average: $1,080 / ZIG2,800 | Variance: +15.7%")
- **Regional Benchmarking:** Compares cost estimates against regional averages to account for geographic cost variations
- **Historical Trend Analysis:** Shows cost trends for specific repair types over time to identify inflation patterns

### 7.7 Performance Coaching Analytics

**Feature Description:** The system provides personalized coaching recommendations to help assessors improve performance scores.

**Capabilities:**

- **Accuracy Improvement Tips:** Identifies damage categories where assessor frequently misses detections and provides training resources
- **Cost Estimation Calibration:** Highlights systematic over-estimation or under-estimation patterns and suggests calibration adjustments
- **Turnaround Time Optimization:** Analyzes time spent on each inspection phase and recommends workflow improvements
- **Best Practice Sharing:** Surfaces best practices from top-performing assessors (anonymized) for learning

### 7.8 Premium Features API Procedures

**`premium.getCostOptimizationRecommendations`** (To Be Implemented) — Retrieve AI cost optimization suggestions  
**`premium.getDamageDetectionOverlay`** (To Be Implemented) — Retrieve AI damage detection overlay data  
**`premium.getPartsPricing`** (To Be Implemented) — Retrieve multi-supplier parts pricing comparison  
**`premium.getRepairStrategyRecommendations`** (To Be Implemented) — Retrieve repair strategy suggestions  
**`premium.getBenchmarkingData`** (To Be Implemented) — Retrieve comparative benchmarking metrics  
**`premium.getPerformanceCoaching`** (To Be Implemented) — Retrieve personalized coaching recommendations

---

## 8. Marketplace Management Service

### 8.1 Service Responsibilities

The **Marketplace Management Service** orchestrates the KINGA Assessor Marketplace, enabling independent assessors to register, list their services, accept assignments from multiple insurers, receive ratings and reviews, and process commission-based payments.

**Core Responsibilities:**

- **Assessor Listing and Discovery:** Searchable marketplace directory with filters (region, specialization, certification level, rating, hourly rate, availability)
- **Insurer-Assessor Contracting:** Workflow for insurers to invite marketplace assessors to join their approved assessor pool with custom terms (hourly rate, access level, approval status)
- **Rating and Review System:** Post-assignment review workflow where insurers rate marketplace assessors and provide written feedback
- **Availability Scheduling:** Calendar-based availability management where assessors block out unavailable dates and set maximum concurrent assignments
- **Commission and Billing Tracking:** Automated calculation of KINGA commission (12-20% based on performance tier), payment processing, and payout scheduling

### 8.2 Marketplace Search and Discovery

Insurers search the marketplace via the `/assign-assessor/:claimId` page (Marketplace tab) with the following filters:

**Geographic Filters:**
- Service region (multi-select: Gauteng, Western Cape, KwaZulu-Natal, etc.)
- Maximum distance from claim location (slider: 0-200 km)

**Expertise Filters:**
- Specializations (multi-select: Collision, Theft, Hail Damage, Fire, Water Damage, etc.)
- Certification level (multi-select: Junior, Senior, Expert, Master)
- Years of experience (slider: 0-30 years)

**Performance Filters:**
- Minimum performance score (slider: 0-100)
- Minimum average rating (slider: 0-5 stars)
- Performance tier (multi-select: Master, Expert, Proficient)

**Availability Filters:**
- Available within (dropdown: 24 hours, 48 hours, 1 week)
- Current workload (dropdown: Low, Medium, High)

**Cost Filters:**
- Maximum hourly rate (slider: $0-$200 / ZIG0-ZIG500)
- Commission tier (multi-select: Gold 12%, Silver 15%, Bronze 20%)

Search results display assessor cards with:
- Name and profile photo
- Certification level and years of experience
- Average rating and total reviews
- Hourly rate and commission tier
- Service regions and specializations
- Current availability status
- Performance score badge
- "Assign to Claim" button

### 8.3 Insurer-Assessor Contracting Workflow

When an insurer assigns a marketplace assessor to a claim for the first time, the system automatically creates an `assessor_insurer_relationships` entry with `relationship_type=marketplace` and `approval_status=approved`. This establishes an ongoing relationship where the insurer can assign future claims to the same assessor without re-approval.

**Custom Terms Negotiation:**

Insurers can negotiate custom terms with marketplace assessors:

- **Custom Hourly Rate:** Override marketplace hourly rate with negotiated rate (stored in `assessor_insurer_relationships.hourly_rate`)
- **Access Level:** Set access level (full, restricted, read_only) to control assessor visibility of claim data
- **Preferred Assessor Status:** Mark assessor as "preferred" for priority assignment recommendations

### 8.4 Rating and Review System

After an assessor completes a marketplace assignment, the insurer user receives a notification to submit a rating and review. The review workflow:

1. Insurer receives email and in-app notification: "Please rate your experience with [Assessor Name] on claim [Claim Number]"
2. Insurer navigates to review form with 5-star rating scale and optional written review
3. Insurer submits review (stored in `assessor_marketplace_reviews` table)
4. System recalculates assessor's average rating and total review count
5. System publishes `marketplace.review.submitted` event to Kafka
6. Assessor receives notification of new review (rating visible, review text visible)

**Review Moderation:**

All reviews are subject to automated moderation to detect:
- Profanity or abusive language (flagged for manual review)
- Spam or duplicate reviews (auto-rejected)
- Competitor sabotage (reviews from users with no assignment history with the assessor)

Flagged reviews are held for manual moderation by KINGA compliance team before publication.

### 8.5 Commission Structure and Payment Processing

Marketplace assessors earn commission-based income with tiered rates based on performance:

| **Performance Tier** | **Commission Rate** | **Assessor Payout** | **KINGA Revenue** |
|---------------------|-------------------|-------------------|------------------|
| **Master (Gold)** | 12% | 88% of assignment fee | 12% of assignment fee |
| **Expert (Silver)** | 15% | 85% of assignment fee | 15% of assignment fee |
| **Proficient (Bronze)** | 18% | 82% of assignment fee | 18% of assignment fee |
| **Developing** | 20% | 80% of assignment fee | 20% of assignment fee |

**Payment Processing Workflow:**

1. Assessor completes assignment and submits report
2. Insurer approves report and closes assignment
3. System calculates assignment fee based on assessor hourly rate and time spent (tracked via `audit_trail` timestamps)
4. System creates `marketplace_transactions` entry with gross amount, commission rate, commission amount, and net amount
5. System aggregates all completed assignments for the week (Monday-Sunday)
6. Every Monday, system generates payout batch for all assessors with completed assignments from previous week
7. System initiates bank transfer via payment gateway (PayFast, Ozow, or direct EFT)
8. System updates `marketplace_transactions.payment_status` to "processed" and sets `payment_date`
9. Assessor receives email notification with payout summary and transaction details

**Payout Threshold:**

Minimum payout threshold is currency-dependent (e.g., $50 USD, ZIG130, R500 ZAR). If an assessor's weekly earnings are below the threshold, the payout is deferred to the following week and accumulated until threshold is met.

**Currency Conversion and Exchange Rate Handling:**

The system handles multi-currency transactions with the following architecture:

**Currency Determination:**
- Each insurer tenant has a default currency (stored in `tenants.default_currency`)
- Assessor marketplace rates are stored in their preferred currency (`assessors.marketplace_currency`)
- Insurer-assessor relationships can override currency (`assessor_insurer_relationships.currency`)
- Transaction currency defaults to the tenant's currency unless overridden

**Exchange Rate Management:**
- System integrates with exchange rate API (e.g., Open Exchange Rates, XE.com) for real-time rates
- Exchange rates are cached hourly and stored in `exchange_rates` table with timestamp
- All transactions store both the transaction currency amount and USD-normalized amount for platform analytics
- Exchange rate used for each transaction is stored in `marketplace_transactions.exchange_rate` for audit trail

**Cross-Currency Scenarios:**

| **Scenario** | **Example** | **Handling** |
|-------------|------------|-------------|
| **Assessor currency ≠ Tenant currency** | Assessor rates in USD, Insurer pays in ZIG | System converts at transaction time using current exchange rate, stores both amounts |
| **Multi-currency earnings** | Assessor earns USD from one insurer, ZIG from another | Payout dashboard shows earnings by currency, with USD-normalized totals |
| **Currency fluctuation** | Exchange rate changes between assignment and payout | Exchange rate locked at transaction creation time (when report approved) |

**Payout Currency:**
- Assessors specify payout currency and bank account details in profile settings
- If payout currency differs from transaction currency, system converts at payout processing time
- Currency conversion fees (typically 2-3%) are deducted from assessor payout

### 8.6 Availability Scheduling

Assessors manage availability via the `/assessor/availability` page with calendar interface:

**Availability Settings:**
- **Working Days:** Select days of the week available for assignments (Monday-Sunday)
- **Working Hours:** Set daily working hours (e.g., 8:00 AM - 5:00 PM)
- **Blocked Dates:** Mark specific dates as unavailable (vacation, training, etc.)
- **Maximum Concurrent Assignments:** Set maximum number of simultaneous active assignments (default: 5)

The Assignment Engine queries availability data in real-time to exclude unavailable assessors from assignment eligibility.

### 8.7 Marketplace API Procedures

**`marketplace.searchAssessors`** (Already Implemented as `assessorOnboarding.searchMarketplace`) — Search marketplace with filters  
**`marketplace.submitReview`** (To Be Implemented) — Submit rating and review for assessor  
**`marketplace.getAssessorReviews`** (To Be Implemented) — Retrieve reviews for specific assessor  
**`marketplace.updateAvailability`** (To Be Implemented) — Update assessor availability calendar  
**`marketplace.getPayoutHistory`** (To Be Implemented) — Retrieve payout transaction history  
**`marketplace.getEarningsSummary`** (To Be Implemented) — Retrieve earnings dashboard data

---

## 9. Access Control and Multi-Tenant Isolation

### 9.1 RBAC and ABAC Models

The Assessor Ecosystem implements a **hybrid RBAC (Role-Based Access Control) and ABAC (Attribute-Based Access Control)** model to enforce fine-grained access policies across multiple participation models and tenant boundaries.

**Role-Based Access Control (RBAC):**

| **Role** | **Access Scope** | **Permissions** |
|---------|----------------|----------------|
| **Insurer Admin** | Full tenant access | Create/update/delete assessors, assign claims, view all reports, configure assignment rules |
| **Claims Processor** | Tenant claims access | Assign claims, view reports, approve/reject assessments |
| **Assessor (Internal)** | Assigned claims only | View assigned claims, submit reports, upload photos, view own performance |
| **Assessor (BYOA)** | Assigned claims only | Same as internal assessor |
| **Assessor (Marketplace)** | Assigned claims only (cross-tenant) | Same as internal assessor, but scoped to specific claim assignments |
| **KINGA Admin** | Platform-wide access | Manage marketplace, moderate reviews, configure commission tiers, view all analytics |

**Attribute-Based Access Control (ABAC):**

ABAC policies enforce access based on contextual attributes:

- **Tenant Isolation:** Assessors can only access claims from tenants where they have an active `assessor_insurer_relationships` entry with `approval_status=approved`
- **Assignment Scoping:** Assessors can only access claim details, photos, and documents for claims where they are the assigned assessor (`claims.assigned_assessor_id = assessor.user_id`)
- **Time-Based Access:** Assignment access expires 30 days after assignment completion (configurable per tenant)
- **Data Minimization:** Marketplace assessors have restricted access to claimant personal data (name, contact info, policy details) — only vehicle and damage data is visible

### 9.2 Multi-Tenant Data Isolation

All assessor-related data is isolated by `tenant_id` to prevent cross-tenant data leakage:

**Tenant-Scoped Tables:**

- `assessor_insurer_relationships` — Each relationship is scoped to a specific `tenant_id`
- `assessor_marketplace_reviews` — Reviews are scoped to the reviewing insurer's `tenant_id`
- `marketplace_transactions` — Transactions are scoped to the paying insurer's `tenant_id`
- `claims` — Claims are scoped to the insurer's `tenant_id`
- `ai_assessments` — AI assessments inherit `tenant_id` from parent claim
- `assessor_evaluations` — Assessor reports inherit `tenant_id` from parent claim

**Cross-Tenant Access for Marketplace Assessors:**

Marketplace assessors operate across multiple tenants but with strict assignment-based scoping:

```sql
-- Assessor can only access claims where they are assigned
SELECT * FROM claims
WHERE assigned_assessor_id = :assessor_user_id
AND id IN (
  SELECT claim_id FROM assessor_evaluations
  WHERE assessor_id = :assessor_id
);
```

**Tenant Isolation Enforcement:**

All database queries include `tenant_id` filters in WHERE clauses. The application middleware automatically injects `tenant_id` from the authenticated user's session context to prevent accidental cross-tenant queries.

### 9.3 Premium Feature Subscription Gating

Access to Premium Assessor Intelligence Tools is gated by subscription tier:

**Subscription Enforcement:**

```typescript
// Middleware checks assessor subscription tier before allowing access
if (feature === 'cost_optimization' && assessor.subscription_tier === 'free') {
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'Cost optimization requires Premium subscription'
  });
}
```

**Feature Availability Matrix:**

| **Feature** | **Free** | **Premium** | **Enterprise** |
|------------|---------|-----------|--------------|
| Basic reporting tools | ✅ | ✅ | ✅ |
| Performance dashboard | ✅ | ✅ | ✅ |
| AI cost optimization | ❌ | ✅ | ✅ |
| Damage detection overlays | ❌ | ✅ | ✅ |
| Parts pricing intelligence | ❌ | ✅ | ✅ |
| Repair strategy suggestions | ❌ | ❌ | ✅ |
| Comparative benchmarking | ❌ | ❌ | ✅ |
| Performance coaching | ❌ | ❌ | ✅ |
| Priority support | ❌ | ❌ | ✅ |

---

## 10. Continuous Learning Feedback Pipeline

### 10.1 Pipeline Architecture

The **Continuous Learning Feedback Pipeline** uses assessor reports as **ground truth validation data** to continuously improve AI model accuracy, detect model drift, monitor bias, and trigger retraining workflows. The pipeline operates asynchronously via Kafka event streams and batch processing jobs.

**Pipeline Components:**

1. **Ground Truth Data Collection:** Assessor reports are tagged as ground truth after insurer approval
2. **AI-Assessor Variance Analysis:** Reconciliation layer outputs feed variance metrics into training dataset
3. **Model Drift Detection:** Statistical tests detect when AI accuracy degrades over time
4. **Bias Detection Monitoring:** Fairness metrics detect demographic or geographic bias in AI predictions
5. **Training Dataset Validation:** Data quality checks ensure ground truth data meets training standards
6. **Model Retraining Workflow:** Automated retraining triggered when drift exceeds thresholds
7. **Model Version Rollback:** Automated rollback if new model performs worse than previous version

### 10.2 Ground Truth Data Collection

After an assessor submits a report and the insurer approves it, the system tags the report as **ground truth** and publishes it to the training dataset:

**Ground Truth Criteria:**

- Assessor report has been submitted and approved by insurer
- AI-human reconciliation confidence score >75% (high agreement)
- No fraud indicators flagged (ensures clean training data)
- All required fields populated (damage categories, cost estimates, photos)

**Data Extraction:**

The system extracts the following data points from approved assessor reports:

- **Image Data:** Inspection photos with damage area bounding boxes (manually annotated by assessor)
- **Damage Labels:** Damage type classifications (collision, scratch, dent, crack, etc.)
- **Severity Labels:** Damage severity classifications (minor, moderate, severe, total loss)
- **Component Labels:** Affected vehicle components (body panel, window, tire, engine, etc.)
- **Cost Estimates:** Parts cost, labor cost, total repair cost (used for cost prediction model training)
- **Fraud Labels:** Fraud indicator flags (used for fraud detection model training)

**Data Storage:**

Ground truth data is stored in a **versioned training dataset** in S3 with the following structure:

```
s3://kinga-training-data/
  ├── v1.0/
  │   ├── images/
  │   ├── labels/
  │   └── metadata.json
  ├── v1.1/
  │   ├── images/
  │   ├── labels/
  │   └── metadata.json
  └── latest/ (symlink to most recent version)
```

Each dataset version includes:
- `images/`: Inspection photos (JPEG format)
- `labels/`: COCO-format annotation files with bounding boxes and class labels
- `metadata.json`: Dataset statistics (image count, label distribution, assessor demographics)

### 10.3 Model Drift Detection

The system monitors AI model accuracy over time to detect **model drift** (degradation in prediction accuracy due to changing data distributions, seasonal patterns, or new vehicle models).

**Drift Detection Metrics:**

| **Metric** | **Calculation** | **Drift Threshold** | **Action** |
|-----------|----------------|-------------------|-----------|
| **Accuracy Drift** | Current month F1 score vs baseline F1 score | >5% decrease | Trigger retraining |
| **Precision Drift** | Current month precision vs baseline precision | >5% decrease | Trigger retraining |
| **Recall Drift** | Current month recall vs baseline recall | >5% decrease | Trigger retraining |
| **Cost Estimation Drift** | Current month cost variance vs baseline variance | >10% increase | Trigger retraining |
| **Fraud Detection Drift** | Current month fraud detection F1 vs baseline F1 | >5% decrease | Trigger retraining |

**Drift Detection Workflow:**

1. Every Monday, the system calculates trailing 30-day performance metrics for all AI models
2. System compares current metrics against baseline metrics (established during initial model training)
3. If any metric exceeds drift threshold, system publishes `ai.model.drift_detected` event to Kafka
4. Event triggers automated retraining workflow (see Section 10.6)
5. System sends alert to KINGA AI team with drift analysis report

### 10.4 Bias Detection Monitoring

The system monitors AI model predictions for **demographic bias** (unfair treatment of specific demographic groups) and **geographic bias** (accuracy variations across regions).

**Bias Detection Metrics:**

**Demographic Bias:**

- **Gender Bias:** Compare AI accuracy for claims involving male vs female claimants
- **Age Bias:** Compare AI accuracy across claimant age groups (<25, 25-40, 40-60, >60)
- **Vehicle Value Bias:** Compare AI accuracy for low-value (<$10k USD / <ZIG26k / <R100k ZAR) vs high-value (>$50k USD / >ZIG130k / >R500k ZAR) vehicles

**Geographic Bias:**

- **Regional Bias:** Compare AI accuracy across provinces (Gauteng, Western Cape, KwaZulu-Natal, etc.)
- **Urban vs Rural Bias:** Compare AI accuracy for urban vs rural claim locations

**Fairness Thresholds:**

If accuracy difference between any two demographic groups exceeds **10 percentage points**, the system flags a bias alert and triggers manual review by the AI team.

**Bias Mitigation:**

- **Balanced Sampling:** Ensure training dataset includes proportional representation of all demographic groups
- **Fairness Constraints:** Apply fairness constraints during model training to equalize accuracy across groups
- **Bias Auditing:** Monthly bias audit reports reviewed by AI team and compliance team

### 10.5 Training Dataset Validation Controls

Before adding assessor reports to the training dataset, the system performs data quality checks:

**Validation Rules:**

| **Check** | **Criteria** | **Rejection Reason** |
|----------|-------------|---------------------|
| **Image Quality** | Minimum resolution 1024x768, no blur, proper lighting | Poor image quality |
| **Label Completeness** | All damage areas annotated with bounding boxes and labels | Incomplete annotations |
| **Label Consistency** | Damage labels match AI-detected categories (>80% overlap) | Inconsistent labels |
| **Fraud Contamination** | No fraud indicators flagged | Fraudulent data |
| **Outlier Detection** | Cost estimates within 3 standard deviations of mean | Statistical outlier |

**Validation Workflow:**

1. Assessor report approved by insurer
2. System extracts ground truth data
3. System runs validation checks
4. If all checks pass, data is added to training dataset
5. If any check fails, data is rejected and logged in `training_data_rejections` table
6. Monthly report summarizes rejection reasons and assessor-specific rejection rates

### 10.6 Model Retraining Workflow

When model drift is detected or training dataset reaches a size threshold (e.g., 10,000 new ground truth samples), the system triggers automated retraining:

**Retraining Trigger Conditions:**

- Drift detection threshold exceeded (see Section 10.3)
- Training dataset size increased by >20% since last training
- Manual retraining requested by AI team
- Scheduled monthly retraining (regardless of drift)

**Retraining Workflow:**

1. System publishes `ai.model.retraining_triggered` event to Kafka
2. Event triggers AWS SageMaker training job with latest training dataset
3. Training job runs for 6-12 hours (depending on dataset size)
4. Upon completion, new model version is saved to S3 with version tag (e.g., `v2.3`)
5. System deploys new model to **staging environment** for validation
6. System runs **A/B testing** on staging environment (50% of claims use new model, 50% use old model)
7. After 7 days, system compares performance metrics (F1 score, cost variance, fraud detection accuracy)
8. If new model outperforms old model by >2%, system promotes new model to **production environment**
9. If new model underperforms, system triggers **rollback** to previous model version

**Retraining Frequency:**

- **Minimum Interval:** 30 days (prevents excessive retraining)
- **Maximum Interval:** 90 days (ensures continuous improvement)
- **Typical Frequency:** Monthly retraining on the 1st of each month

### 10.7 Model Version Rollback Strategy

If a newly deployed model performs worse than the previous version, the system automatically rolls back to the previous stable version:

**Rollback Trigger Conditions:**

- New model F1 score <95% of previous model F1 score
- New model cost variance >110% of previous model cost variance
- New model fraud detection accuracy <95% of previous model accuracy
- Manual rollback requested by AI team

**Rollback Workflow:**

1. System detects performance degradation in production model
2. System publishes `ai.model.rollback_triggered` event to Kafka
3. Event triggers rollback script that updates model endpoint to previous version
4. System sends alert to AI team with rollback reason and performance comparison
5. AI team investigates root cause (data quality issue, training bug, etc.)
6. System maintains rollback history in `model_deployment_history` table

**Model Version History:**

All model versions are retained in S3 for 2 years with the following metadata:

- Version tag (e.g., `v2.3`)
- Training date
- Training dataset version
- Performance metrics (F1 score, precision, recall, cost variance)
- Deployment status (staging, production, retired, rolled_back)
- Rollback history (if applicable)

### 10.8 Performance Monitoring Dashboards

The AI team has access to **Model Performance Monitoring Dashboards** (`/admin/ai-monitoring`) displaying:

**Real-Time Metrics:**
- Current model version in production
- Live F1 score, precision, recall (updated hourly)
- Live cost variance percentage (updated hourly)
- Live fraud detection accuracy (updated hourly)

**Drift Detection Charts:**
- 90-day trend graphs for all drift metrics
- Drift threshold lines with alert indicators
- Comparison of current vs baseline performance

**Bias Detection Reports:**
- Demographic bias heatmaps (accuracy by gender, age, vehicle value)
- Geographic bias maps (accuracy by province and urban/rural)
- Fairness metric trends over time

**Training Dataset Statistics:**
- Total ground truth samples collected
- Monthly sample collection rate
- Label distribution (damage types, severity levels)
- Assessor contribution statistics (samples per assessor)

**Retraining History:**
- List of all retraining events with timestamps
- Performance comparison (old vs new model)
- Deployment status and rollback history

---

## 11. Event-Driven Integration Architecture

### 11.1 Kafka Event Bus

The Assessor Ecosystem operates on an **event-driven microservices architecture** using **Apache Kafka** as the central event bus. All assessor lifecycle events, assignment state changes, report submissions, performance scoring updates, and payment transactions are published to Kafka topics for asynchronous processing, audit logging, and integration with external systems.

**Kafka Cluster Configuration:**

- **Cluster Size:** 3 brokers (production), 1 broker (staging/development)
- **Replication Factor:** 3 (ensures fault tolerance)
- **Retention Period:** 30 days (configurable per topic)
- **Partitioning Strategy:** Partition by `tenant_id` for tenant-level parallelism

### 11.2 Event Schema Design

All events follow a standardized schema with the following structure:

```json
{
  "event_id": "uuid-v4",
  "event_type": "assessor.assignment.created",
  "event_version": "1.0",
  "timestamp": "2026-02-12T10:30:45.123Z",
  "tenant_id": "tenant-bb427411-1cb9-4767-b354-61831d4d2106",
  "user_id": 42,
  "correlation_id": "claim-12345",
  "payload": {
    "claim_id": 12345,
    "assessor_id": 67,
    "assignment_id": 890,
    "assignment_type": "manual",
    "assigned_by": 42
  },
  "metadata": {
    "source_service": "assignment-engine",
    "source_version": "2.3.1",
    "environment": "production"
  }
}
```

**Schema Fields:**

- `event_id`: Unique event identifier (UUID v4)
- `event_type`: Event type in dot-notation (e.g., `assessor.assignment.created`)
- `event_version`: Event schema version (semantic versioning)
- `timestamp`: Event timestamp (ISO 8601 format with millisecond precision)
- `tenant_id`: Tenant identifier for multi-tenant isolation
- `user_id`: User who triggered the event (if applicable)
- `correlation_id`: Correlation identifier for tracing related events (e.g., claim ID)
- `payload`: Event-specific data (varies by event type)
- `metadata`: Event metadata (source service, version, environment)

### 11.3 Kafka Topics and Event Types

**Assessor Registration and Onboarding Events:**

| **Topic** | **Event Type** | **Payload** | **Subscribers** |
|----------|---------------|------------|----------------|
| `assessor.registration` | `assessor.registered` | `assessor_id`, `assessor_type`, `tenant_id` | Notification Service, Analytics Service |
| `assessor.registration` | `assessor.verified` | `assessor_id`, `verification_type`, `verification_status` | Notification Service, Compliance Service |
| `assessor.registration` | `assessor.approved` | `assessor_id`, `tenant_id`, `approved_by` | Notification Service, Assignment Engine |

**Assessor Assignment Events:**

| **Topic** | **Event Type** | **Payload** | **Subscribers** |
|----------|---------------|------------|----------------|
| `assessor.assignment` | `assignment.created` | `claim_id`, `assessor_id`, `assignment_id`, `assignment_type` | Notification Service, Analytics Service |
| `assessor.assignment` | `assignment.accepted` | `assignment_id`, `assessor_id`, `accepted_at` | Notification Service, SLA Tracker |
| `assessor.assignment` | `assignment.rejected` | `assignment_id`, `assessor_id`, `rejection_reason` | Assignment Engine (triggers reassignment) |
| `assessor.assignment` | `assignment.completed` | `assignment_id`, `assessor_id`, `completed_at` | Payment Service, Performance Analytics |

**Assessor Report Events:**

| **Topic** | **Event Type** | **Payload** | **Subscribers** |
|----------|---------------|------------|----------------|
| `assessor.report` | `report.submitted` | `claim_id`, `assessor_id`, `report_id` | Reconciliation Layer, Notification Service |
| `assessor.report` | `report.approved` | `claim_id`, `report_id`, `approved_by` | Payment Service, Training Pipeline |
| `assessor.report` | `report.rejected` | `claim_id`, `report_id`, `rejection_reason` | Notification Service, Assessor Dashboard |

**AI-Human Reconciliation Events:**

| **Topic** | **Event Type** | **Payload** | **Subscribers** |
|----------|---------------|------------|----------------|
| `reconciliation` | `variance.detected` | `claim_id`, `variance_type`, `variance_percentage`, `confidence_score` | Notification Service, Analytics Service |
| `reconciliation` | `escalation.triggered` | `claim_id`, `escalation_tier`, `escalation_reason` | Notification Service, Claims Manager Dashboard |

**Performance Scoring Events:**

| **Topic** | **Event Type** | **Payload** | **Subscribers** |
|----------|---------------|------------|----------------|
| `assessor.performance` | `score.updated` | `assessor_id`, `performance_score`, `previous_score` | Notification Service, Marketplace Service |
| `assessor.performance` | `tier.changed` | `assessor_id`, `new_tier`, `previous_tier` | Notification Service, Payment Service (commission rate update) |

**Marketplace Events:**

| **Topic** | **Event Type** | **Payload** | **Subscribers** |
|----------|---------------|------------|----------------|
| `marketplace` | `review.submitted` | `assessor_id`, `reviewer_id`, `rating`, `claim_id` | Notification Service, Performance Analytics |
| `marketplace` | `transaction.created` | `transaction_id`, `assessor_id`, `gross_amount`, `commission_amount` | Payment Service, Analytics Service |
| `marketplace` | `payout.processed` | `transaction_id`, `assessor_id`, `net_amount`, `payment_date` | Notification Service, Assessor Dashboard |

**AI Training Pipeline Events:**

| **Topic** | **Event Type** | **Payload** | **Subscribers** |
|----------|---------------|------------|----------------|
| `ai.training` | `ground_truth.collected` | `claim_id`, `assessor_id`, `dataset_version` | Training Pipeline, Analytics Service |
| `ai.training` | `drift.detected` | `model_id`, `drift_metric`, `drift_percentage` | AI Team Dashboard, Training Pipeline |
| `ai.training` | `retraining.triggered` | `model_id`, `trigger_reason`, `dataset_version` | AI Team Dashboard, Monitoring Service |
| `ai.training` | `model.deployed` | `model_id`, `model_version`, `deployment_environment` | AI Team Dashboard, Monitoring Service |
| `ai.training` | `rollback.triggered` | `model_id`, `rollback_reason`, `previous_version` | AI Team Dashboard, Monitoring Service |

### 11.4 Event Subscribers and Consumers

**Notification Service:**

Consumes all events that require user notifications (email, SMS, in-app notifications). Examples:
- `assessor.registered` → Send welcome email to assessor
- `assignment.created` → Send assignment notification to assessor
- `report.approved` → Send approval notification to assessor
- `payout.processed` → Send payout confirmation email to assessor

**Analytics Service:**

Consumes all events for real-time analytics and dashboard updates. Examples:
- `assignment.created` → Update assignment count metrics
- `performance.score.updated` → Update performance leaderboards
- `transaction.created` → Update revenue metrics

**Payment Service:**

Consumes payment-related events for commission calculation and payout processing. Examples:
- `assignment.completed` → Calculate commission and create transaction
- `report.approved` → Mark transaction as eligible for payout
- `payout.processed` → Update transaction status

**Training Pipeline:**

Consumes AI training-related events for continuous learning. Examples:
- `report.approved` → Extract ground truth data
- `drift.detected` → Trigger retraining workflow
- `model.deployed` → Update production model endpoint

**Audit Service:**

Consumes all events for immutable audit trail storage. All events are written to `audit_trail` table with full event payload for regulatory compliance and dispute resolution.

### 11.5 Event-Driven Workflow Example

**Example: Marketplace Assessor Assignment and Payment Workflow**

1. **Insurer assigns marketplace assessor to claim**
   - `assignment.created` event published to `assessor.assignment` topic
   - Notification Service sends assignment email to assessor
   - Analytics Service updates assignment count metrics

2. **Assessor accepts assignment**
   - `assignment.accepted` event published to `assessor.assignment` topic
   - Notification Service sends confirmation to insurer
   - SLA Tracker starts turnaround time monitoring

3. **Assessor submits report**
   - `report.submitted` event published to `assessor.report` topic
   - Reconciliation Layer triggers AI-human variance analysis
   - Notification Service sends report notification to insurer

4. **Insurer approves report**
   - `report.approved` event published to `assessor.report` topic
   - Payment Service calculates commission and creates transaction
   - `transaction.created` event published to `marketplace` topic
   - Training Pipeline extracts ground truth data
   - `ground_truth.collected` event published to `ai.training` topic

5. **Weekly payout processing**
   - Payment Service aggregates all completed transactions for the week
   - Payment Service initiates bank transfers
   - `payout.processed` event published to `marketplace` topic
   - Notification Service sends payout confirmation email to assessor

6. **Assessor performance scoring**
   - Performance Analytics Service recalculates performance score
   - `score.updated` event published to `assessor.performance` topic
   - If tier changes, `tier.changed` event published
   - Payment Service updates commission rate for future assignments

---

## 12. Implementation Roadmap

### 12.1 Phase 1: Foundation (Weeks 1-8) — **COMPLETED**

**Deliverables:**

✅ Database schema design (4 tables: assessors, assessor_insurer_relationships, assessor_marketplace_reviews, marketplace_transactions)  
✅ Assessor Identity and Registration Service (8 tRPC procedures)  
✅ Insurer-owned assessor onboarding UI (`/add-assessor`)  
✅ Marketplace assessor self-registration UI (`/join-as-assessor`)  
✅ Assessor list management UI (`/assessors`)  
✅ Marketplace search UI (`/assign-assessor/:claimId`)  
✅ Manual assignment workflow (wired to backend)  
✅ Unit tests (5/5 passing)

### 12.2 Phase 2: Assignment Engine (Weeks 9-16)

**Deliverables:**

- Automated assignment rule engine with weighted scoring algorithm
- Conflict-of-interest detection logic
- Load balancing and capacity management
- Assignment recommendation API (`claims.getRecommendedAssessors`)
- Automated assignment API (`claims.autoAssignClaim`)
- Assignment acceptance/rejection workflow
- Reassignment workflow for rejected assignments
- SLA tracking and turnaround time monitoring
- Unit tests for assignment engine

### 12.3 Phase 3: Reporting Interface (Weeks 17-24)

**Deliverables:**

- Mobile app (iOS/Android) for field inspections
- Photo capture with GPS tagging and timestamp watermarking
- AI-assisted damage detection overlays
- Structured damage categorization UI
- Cost estimation tools with parts pricing integration
- Repair recommendation engine
- Fraud indicator tagging
- Report submission workflow with validation
- Offline-first architecture for field use
- Unit tests for reporting interface

### 12.4 Phase 4: AI-Human Reconciliation (Weeks 25-32)

**Deliverables:**

- Variance detection algorithm (damage scope, cost, fraud)
- Confidence scoring methodology
- Six-tier escalation protocol
- Reconciliation dashboard UI for insurers
- Side-by-side comparison view (AI vs assessor)
- Decision audit trail storage
- Reconciliation API procedures
- Unit tests for reconciliation layer

### 12.5 Phase 5: Performance Analytics (Weeks 33-40)

**Deliverables:**

- Performance scoring framework (6 dimensions)
- Performance tier classification logic
- Assessor performance dashboard UI (`/assessor/performance`)
- Insurer assessor analytics dashboard UI (`/insurer/assessor-analytics`)
- Performance comparison tools
- Cost efficiency analysis
- Turnaround time analysis
- Performance API procedures
- Unit tests for analytics engine

### 12.6 Phase 6: Premium Features (Weeks 41-48)

**Deliverables:**

- Subscription tier management (Free, Premium, Enterprise)
- AI cost optimization recommendation engine
- Damage detection enhancement overlays
- Parts pricing intelligence integration
- Repair strategy suggestion engine
- Comparative repair benchmarking
- Performance coaching analytics
- Premium feature subscription gating
- Billing integration (Stripe/PayFast)
- Unit tests for premium features

### 12.7 Phase 7: Marketplace Management (Weeks 49-56)

**Deliverables:**

- Rating and review submission workflow
- Review moderation system
- Availability scheduling calendar UI (`/assessor/availability`)
- Commission calculation engine
- Weekly payout batch processing
- Payout history dashboard (`/assessor/earnings`)
- Marketplace analytics dashboard
- Marketplace API procedures
- Unit tests for marketplace service

### 12.8 Phase 8: Continuous Learning Pipeline (Weeks 57-64)

**Deliverables:**

- Ground truth data extraction pipeline
- Training dataset validation controls
- Model drift detection monitoring
- Bias detection monitoring
- Automated retraining workflow (AWS SageMaker integration)
- A/B testing framework for model validation
- Model version rollback strategy
- Performance monitoring dashboards (`/admin/ai-monitoring`)
- Unit tests for training pipeline

### 12.9 Phase 9: Event-Driven Integration (Weeks 65-72)

**Deliverables:**

- Kafka cluster setup (3-broker production cluster)
- Event schema design and versioning
- Event publisher service
- Event subscriber services (Notification, Analytics, Payment, Training, Audit)
- Event monitoring dashboard
- Dead letter queue handling
- Event replay capability
- Integration tests for event flows

### 12.10 Phase 10: Production Hardening (Weeks 73-80)

**Deliverables:**

- Load testing and performance optimization
- Security audit and penetration testing
- POPIA/GDPR compliance audit
- FSCA regulatory compliance verification
- Disaster recovery and backup procedures
- Production deployment runbook
- Monitoring and alerting setup (Datadog/New Relic)
- User acceptance testing (UAT)
- Production launch

---

## 13. Security and Governance Model

### 13.1 Security Architecture

**Data Encryption:**

- **At Rest:** All database tables encrypted using AES-256 encryption (MySQL TDE)
- **In Transit:** All API traffic encrypted using TLS 1.3
- **S3 Storage:** All inspection photos and documents encrypted using S3 server-side encryption (SSE-S3)

**Authentication and Authorization:**

- **User Authentication:** Manus OAuth 2.0 with JWT tokens
- **API Authentication:** Bearer token authentication for all tRPC procedures
- **Session Management:** 24-hour session expiry with automatic renewal
- **Multi-Factor Authentication (MFA):** Optional MFA for assessor accounts (SMS or authenticator app)

**Access Control:**

- **RBAC:** Role-based access control for coarse-grained permissions
- **ABAC:** Attribute-based access control for fine-grained tenant and assignment scoping
- **Principle of Least Privilege:** Assessors only access assigned claims, insurers only access their tenant data

**Audit Logging:**

- **Comprehensive Logging:** All user actions logged with timestamps, user IDs, IP addresses, and action descriptions
- **Immutable Audit Trail:** Audit logs stored in append-only table with SHA-256 hash chains
- **7-Year Retention:** Audit logs retained for 7 years for regulatory compliance (FSCA requirement)

### 13.2 Regulatory Compliance

**POPIA (Protection of Personal Information Act):**

- **Data Minimization:** Marketplace assessors only access vehicle and damage data, not claimant personal data
- **Consent Management:** Claimants consent to data sharing with assigned assessors
- **Right to Erasure:** Claimants can request data deletion (assessor reports anonymized after 7 years)

**GDPR (General Data Protection Regulation):**

- **Data Portability:** Assessors can export their performance data and earnings history
- **Right to Access:** Assessors can request access to all data stored about them
- **Data Breach Notification:** 72-hour breach notification to affected users

**FSCA (Financial Sector Conduct Authority):**

- **Assessor Licensing:** All assessors must hold valid FSCA professional licenses
- **Professional Indemnity Insurance:** All assessors must maintain active professional indemnity insurance
- **Credential Verification:** Automated verification of licenses and insurance via FSCA API

**ISO 27001 (Information Security Management):**

- **Security Controls:** 114 security controls implemented across 14 domains
- **Risk Assessment:** Annual risk assessment and security audit
- **Incident Response:** 24-hour incident response plan with escalation procedures

### 13.3 Data Governance

**Data Ownership:**

- **Insurer Data:** Insurers own all claims data, AI assessments, and assessor reports for their tenants
- **Assessor Data:** Assessors own their profile data, performance metrics, and earnings history
- **Platform Data:** KINGA owns aggregated anonymized analytics data for platform intelligence

**Data Retention:**

- **Active Claims:** Retained indefinitely while claim is active
- **Closed Claims:** Retained for 7 years after claim closure (regulatory requirement)
- **Assessor Profiles:** Retained indefinitely while assessor account is active
- **Deactivated Assessors:** Profile data anonymized after 2 years of inactivity

**Data Deletion:**

- **Soft Delete:** Initial deletion marks records as deleted but retains data for 90-day recovery window
- **Hard Delete:** After 90 days, data is permanently deleted from production database
- **Backup Deletion:** Deleted data purged from backups after 1 year

---

## 14. Conclusion

The **KINGA Assessor Ecosystem Architecture** establishes a comprehensive, scalable, and intelligent framework for managing the full lifecycle of insurance assessors across three participation models: Insurer Internal Assessors, Bring-Your-Own-Assessor (BYOA), and KINGA Marketplace Assessors. The architecture integrates AI-powered damage assessment with human assessor verification through a sophisticated reconciliation layer that continuously improves both AI accuracy and assessor performance.

**Key Architectural Achievements:**

**Unified Multi-Model Support:** The system supports three distinct assessor engagement models within a single technical framework, enabling insurers to choose the model that best fits their operational needs while maintaining consistent data quality and security.

**AI-Human Symbiosis:** The reconciliation layer treats AI and human assessors as complementary intelligence sources, using disagreements as training signals for continuous improvement rather than viewing them as competing alternatives.

**Premium Revenue Model:** The freemium subscription model for premium assessor intelligence tools generates incremental platform revenue while enhancing assessor productivity, creating a sustainable business model beyond pure SaaS subscriptions.

**Event-Driven Scalability:** The Kafka-based event architecture enables asynchronous processing, horizontal scaling, and seamless integration with external systems, positioning KINGA for future expansion into adjacent insurance verticals.

**Continuous Learning Pipeline:** The automated training pipeline uses assessor reports as ground truth to continuously improve AI models, detect drift, monitor bias, and trigger retraining workflows, ensuring the platform's intelligence layer remains accurate and fair over time.

**Regulatory Compliance by Design:** The architecture embeds POPIA, GDPR, FSCA, and ISO 27001 compliance requirements into every component, from credential verification to audit logging to data retention policies, reducing regulatory risk and enabling enterprise adoption.

The implementation roadmap spans 80 weeks across 10 phases, with Phase 1 (Foundation) already completed and operational in the KINGA platform. The remaining phases will progressively build out the assignment engine, reporting interface, reconciliation layer, performance analytics, premium features, marketplace management, continuous learning pipeline, and event-driven integration.

**KINGA is positioned to become the intelligence layer for the insurance assessment industry**—not just a workflow platform, but a continuous learning system that makes both AI and human assessors better over time.

---

## Appendix A: Database Entity Relationship Diagram

```
┌─────────────────────┐
│      users          │
├─────────────────────┤
│ id (PK)             │
│ openId              │
│ name                │
│ email               │
│ role                │
│ tenant_id           │
└──────────┬──────────┘
           │
           │ 1:1
           │
┌──────────▼──────────┐         ┌─────────────────────────────────┐
│    assessors        │         │ assessor_insurer_relationships  │
├─────────────────────┤         ├─────────────────────────────────┤
│ id (PK)             │◄────────┤ assessor_id (FK)                │
│ user_id (FK)        │    1:N  │ tenant_id                       │
│ license_number      │         │ relationship_type               │
│ certification_level │         │ approval_status                 │
│ assessor_type       │         │ hourly_rate                     │
│ marketplace_enabled │         │ commission_tier                 │
│ average_rating      │         └─────────────────────────────────┘
└──────────┬──────────┘
           │
           │ 1:N
           │
┌──────────▼──────────────────┐
│ assessor_marketplace_reviews│
├─────────────────────────────┤
│ id (PK)                     │
│ assessor_id (FK)            │
│ claim_id (FK)               │
│ reviewer_user_id (FK)       │
│ rating                      │
│ review_text                 │
└─────────────────────────────┘

┌──────────────────────┐
│       claims         │
├──────────────────────┤
│ id (PK)              │
│ claim_number         │
│ tenant_id            │
│ assigned_assessor_id │◄───────┐
└──────────┬───────────┘        │
           │                    │
           │ 1:1                │ 1:N
           │                    │
┌──────────▼──────────────┐    │
│ assessor_evaluations    │    │
├─────────────────────────┤    │
│ id (PK)                 │    │
│ claim_id (FK)           │    │
│ assessor_id (FK)        ├────┘
│ damage_description      │
│ estimated_repair_cost   │
│ labor_cost              │
│ parts_cost              │
└─────────────────────────┘

┌──────────────────────────┐
│ marketplace_transactions │
├──────────────────────────┤
│ id (PK)                  │
│ assessor_id (FK)         │
│ claim_id (FK)            │
│ tenant_id                │
│ gross_amount             │
│ commission_rate          │
│ commission_amount        │
│ net_amount               │
│ payment_status           │
└──────────────────────────┘

┌──────────────────────────────┐
│ ai_human_reconciliation      │
├──────────────────────────────┤
│ id (PK)                      │
│ claim_id (FK)                │
│ ai_assessment_id (FK)        │
│ assessor_evaluation_id (FK)  │
│ damage_scope_f1              │
│ cost_variance_percentage     │
│ confidence_score             │
│ escalation_tier              │
│ recommended_action           │
└──────────────────────────────┘
```

---

## Appendix B: API Service Interaction Map

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ AddAssessor  │  │ JoinAsAssessor│  │AssignAssessor│          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
└─────────┼──────────────────┼──────────────────┼─────────────────┘
          │                  │                  │
          │ tRPC             │ tRPC             │ tRPC
          │                  │                  │
┌─────────▼──────────────────▼──────────────────▼─────────────────┐
│                    tRPC API Gateway                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              assessorOnboardingRouter                      │ │
│  │  - addInsurerOwnedAssessor                                 │ │
│  │  - registerMarketplaceAssessor                             │ │
│  │  - searchMarketplace                                       │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                  claimsRouter                              │ │
│  │  - assignToAssessor                                        │ │
│  │  - getRecommendedAssessors (to be implemented)             │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────┬────────────────────────────────────────────────────────┘
          │
          │ Database Queries
          │
┌─────────▼──────────────────────────────────────────────────────┐
│                      Database Layer (MySQL)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │assessors │  │ claims   │  │assessor_ │  │marketplace│       │
│  │          │  │          │  │insurer_  │  │transactions│      │
│  │          │  │          │  │relations │  │           │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│                    Kafka Event Bus                              │
│  Topics:                                                        │
│  - assessor.registration                                        │
│  - assessor.assignment                                          │
│  - assessor.report                                              │
│  - reconciliation                                               │
│  - assessor.performance                                         │
│  - marketplace                                                  │
│  - ai.training                                                  │
└─────────┬──────────────────────────────────────────────────────┘
          │
          │ Event Consumers
          │
┌─────────▼──────────────────────────────────────────────────────┐
│                    Microservices Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │Notification  │  │  Analytics   │  │   Payment    │         │
│  │  Service     │  │   Service    │  │   Service    │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  Training    │  │    Audit     │  │  Assignment  │         │
│  │  Pipeline    │  │   Service    │  │    Engine    │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│                  External Integrations                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  FSCA API    │  │  SAQA API    │  │  Parts       │         │
│  │  (License    │  │  (Qualif.    │  │  Pricing     │         │
│  │  Verification)│  │  Verification)│  │  APIs        │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  PayFast/    │  │  AWS         │  │  Email/SMS   │         │
│  │  Ozow        │  │  SageMaker   │  │  Gateway     │         │
│  │  (Payments)  │  │  (AI Training)│  │              │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└────────────────────────────────────────────────────────────────┘
```

---

## Appendix C: Workflow State Integration Map

```
┌─────────────────────────────────────────────────────────────────┐
│                    Claim Lifecycle Workflow                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │
                    ┌─────────▼─────────┐
                    │   SUBMITTED       │
                    │   (Claimant)      │
                    └─────────┬─────────┘
                              │
                              │ Insurer verifies policy
                              │
                    ┌─────────▼─────────┐
                    │   TRIAGE          │
                    │   (Insurer)       │
                    └─────────┬─────────┘
                              │
                              │ AI assessment triggered
                              │
                    ┌─────────▼─────────┐
                    │ AI_ASSESSMENT     │
                    │ (AI Model)        │
                    └─────────┬─────────┘
                              │
                              │ Assessor assigned
                              │
┌─────────────────────────────▼─────────────────────────────────┐
│              Assessor Assignment Workflow                     │
└───────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │ ASSIGNMENT_PENDING│
                    │ (Assignment Engine)│
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │    ASSIGNED       │
                    │  (Notification    │
                    │   sent to assessor)│
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │   ACCEPTED        │
                    │  (Assessor)       │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │  IN_PROGRESS      │
                    │  (Field Inspection)│
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │   SUBMITTED       │
                    │  (Assessor Report)│
                    └─────────┬─────────┘
                              │
┌─────────────────────────────▼─────────────────────────────────┐
│              AI-Human Reconciliation Workflow                 │
└───────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │ RECONCILIATION    │
                    │ (Variance Analysis)│
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │ CONFIDENCE SCORING│
                    │ (0-100 score)     │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │ ESCALATION ROUTING│
                    │ (Tier 0-5)        │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │   REVIEWED        │
                    │  (Insurer Decision)│
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │   COMPLETED       │
                    │  (Assignment Closed)│
                    └─────────┬─────────┘
                              │
┌─────────────────────────────▼─────────────────────────────────┐
│              Payment Processing Workflow                      │
│              (Marketplace Assessors Only)                     │
└───────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │ TRANSACTION_CREATED│
                    │ (Commission Calc) │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │ PAYOUT_PENDING    │
                    │ (Weekly Batch)    │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │ PAYOUT_PROCESSED  │
                    │ (Bank Transfer)   │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │     PAID          │
                    │ (Notification Sent)│
                    └───────────────────┘
```

---

**End of Document**
