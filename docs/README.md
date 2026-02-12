# KINGA Architecture Documentation

**Project:** KINGA - AutoVerify AI Insurance Claims Intelligence Platform  
**Organization:** KINGA Systems  
**Last Updated:** February 12, 2026

---

## Overview

This directory contains the complete architecture documentation for the KINGA multi-tenant insurance claims intelligence platform. The documentation covers the assessor ecosystem, workflow lifecycle, AI-human reconciliation, and continuous learning pipeline.

---

## Architecture Documents

### Core Architecture Specifications

| Document ID | Title | Version | Date | Description |
|------------|-------|---------|------|-------------|
| **[KINGA-AEA-2026-018](KINGA-AEA-2026-018-Assessor-Ecosystem-Architecture.md)** | Assessor Ecosystem Architecture | 1.1 | Feb 12, 2026 | Complete specification of the assessor ecosystem supporting three participation models (Internal, BYOA, Marketplace) with AI-human reconciliation, premium intelligence tools, and multi-currency support |
| **[KINGA-AWL-2026-019](KINGA-AWL-2026-019-Assessor-Workflow-Lifecycle.md)** | Assessor Workflow Lifecycle | 1.0 | Feb 12, 2026 | Complete workflow lifecycle integrated into claims state machine, including SLA enforcement, notification triggers, escalation rules, and audit logging |
| **[KINGA-PMA-2026-020](KINGA-PMA-2026-020-Premium-Monetization-Architecture.md)** | Premium AI Tools Monetization Architecture | 1.0 | Feb 12, 2026 | Complete monetization framework for premium assessor AI tools with freemium subscription tiers, Stripe payment integration, feature gating middleware, usage metering, and ROI analytics dashboard |
| **[KINGA-CLP-2026-021](KINGA-CLP-2026-021-Continuous-Learning-Pipeline.md)** | Continuous Learning Feedback Pipeline | 1.0 | Feb 12, 2026 | Complete ML pipeline transforming approved assessor reports into ground truth training data with automated drift detection, model retraining, privacy-preserving anonymization, MLflow version tracking, and performance monitoring |
| **[KINGA-CGF-2026-022](KINGA-CGF-2026-022-Compliance-Governance-Framework.md)** | Compliance & Governance Framework | 1.0 | Feb 12, 2026 | Complete compliance framework covering data privacy (POPIA/GDPR), immutable audit trails, evidence integrity validation, zero-trust access control, end-to-end encryption, insider fraud monitoring, and digital signature authentication |

### Supporting Assets

| Asset | Type | Description |
|-------|------|-------------|
| **[kinga-state-diagram.png](kinga-state-diagram.png)** | Diagram | Visual state machine diagram showing parallel AI and assessor workflow paths with reconciliation convergence |

---

## Document Relationships

```
KINGA-AEA-2026-018 (Assessor Ecosystem Architecture)
    │
    ├─── Defines: Assessor Identity & Registration Service
    ├─── Defines: Assessor Assignment Engine
    ├─── Defines: AI-Human Reconciliation Layer
    ├─── Defines: Assessor Performance Analytics Engine
    ├─── Defines: Premium Assessor Intelligence Tools
    ├─── Defines: Marketplace Management Service
    ├─── Defines: Continuous Learning Feedback Pipeline
    └─── Defines: Event-Driven Integration Architecture
    
KINGA-AWL-2026-019 (Assessor Workflow Lifecycle)
    │
    ├─── Implements: Assignment Request → Acceptance → Inspection → Report → Reconciliation → Review
    ├─── Integrates: Claims State Machine (12 immutable stages)
    ├─── Specifies: SLA Parameters & Enforcement Logic
    ├─── Specifies: Notification Triggers (20+ events)
    ├─── Specifies: Escalation Rules (6 tiers)
    ├─── Specifies: Retry & Reassignment Logic
    ├─── Specifies: Kafka Event Mapping (8 topics)
    └─── Specifies: Audit Logging Model (hash-chained immutability)

KINGA-PMA-2026-020 (Premium Monetization Architecture)
    │
    ├─── Defines: Subscription Tier System (Free, Premium, Enterprise)
    ├─── Defines: Free Trial Logic (14-day trial with credit card required)
    ├─── Defines: Usage-Based Pricing (hybrid model with overage billing)
    ├─── Defines: Payment Gateway Integration (Stripe + PayFast)
    ├─── Defines: Feature Gating Middleware (server-side + client-side)
    ├─── Defines: Usage Metering Architecture (API call tracking)
    ├─── Defines: ROI Analytics Dashboard (performance uplift, cost optimization, revenue growth)
    └─── Defines: Performance-Based Incentives (20-30% discounts for top assessors)

KINGA-CLP-2026-021 (Continuous Learning Feedback Pipeline)
    │
    ├─── Defines: Ground Truth Data Extraction Pipeline (eligibility criteria, batch ingestion)
    ├─── Defines: Label Validation Process (quality checks, outlier detection, manual review)
    ├─── Defines: AI Retraining Triggers (data drift, concept drift, performance degradation)
    ├─── Defines: Model Evaluation Metrics (F1 score 0.92+, MAPE <8%, AUC-ROC 0.88+)
    ├─── Defines: Fraud Pattern Learning (5 categories, ensemble classifier)
    ├─── Defines: Cost Optimization Learning (aftermarket parts, repair vs replace)
    ├─── Defines: Data Anonymization Strategy (PII removal, differential privacy, k-anonymity)
    ├─── Defines: Model Version Tracking (MLflow integration, lifecycle management)
    └─── Defines: Performance Monitoring Dashboards (drift detection, model performance, training pipeline)

KINGA-CGF-2026-022 (Compliance & Governance Framework)
    │
    ├─── Defines: Data Privacy Compliance (POPIA, GDPR, Zimbabwe Data Protection Act)
    ├─── Defines: Consent Management System (6 consent types, withdrawal workflows)
    ├─── Defines: Data Subject Rights (7 POPIA/GDPR rights, self-service portal)
    ├─── Defines: Immutable Audit Trails (hash-chained logging, 7-year retention)
    ├─── Defines: Evidence Integrity Validation (photo tampering detection, blockchain anchoring)
    ├─── Defines: Zero-Trust Access Control (RBAC + ABAC, MFA, tenant isolation)
    ├─── Defines: End-to-End Encryption (AES-256, TLS 1.3, AWS KMS)
    ├─── Defines: Insider Fraud Monitoring (10 threat indicators, risk scoring)
    └─── Defines: Digital Signature Authentication (PKI, RSA-4096, X.509 certificates)
```

**Integration Points:**
- KINGA-AWL-2026-019 implements the workflow orchestration for the assessor ecosystem defined in KINGA-AEA-2026-018
- KINGA-PMA-2026-020 monetizes the premium intelligence tools defined in KINGA-AEA-2026-018 Section 7
- KINGA-CLP-2026-021 implements the continuous learning pipeline defined in KINGA-AEA-2026-018 Section 9
- KINGA-CLP-2026-021 consumes approved assessor reports from KINGA-AWL-2026-019 Phase 9 (Feedback Submission)
- KINGA-CGF-2026-022 provides compliance controls for all data processing activities across all documents
- KINGA-CGF-2026-022 audit trails track all workflow events from KINGA-AWL-2026-019
- KINGA-CGF-2026-022 data anonymization integrates with KINGA-CLP-2026-021 training pipeline
- All documents share the same database schema (4 core assessor tables + workflow tables + ML training tables + compliance tables)
- Event-driven architecture (Kafka topics) connects all ecosystem services across all five documents

---

## Quick Navigation

### By Topic

**Assessor Onboarding & Registration:**
- [KINGA-AEA-2026-018 § 2: Assessor Identity and Registration Service](KINGA-AEA-2026-018-Assessor-Ecosystem-Architecture.md#2-assessor-identity-and-registration-service)
- [KINGA-AWL-2026-019 § 2.2: Phase 1 - Assignment Request](KINGA-AWL-2026-019-Assessor-Workflow-Lifecycle.md#22-phase-1-assignment-request)

**Assessor Assignment & Workflow:**
- [KINGA-AEA-2026-018 § 3: Assessor Assignment Engine](KINGA-AEA-2026-018-Assessor-Ecosystem-Architecture.md#3-assessor-assignment-engine)
- [KINGA-AWL-2026-019 § 2: Assessor Workflow Lifecycle](KINGA-AWL-2026-019-Assessor-Workflow-Lifecycle.md#2-assessor-workflow-lifecycle)

**AI-Human Reconciliation:**
- [KINGA-AEA-2026-018 § 5: AI-Human Reconciliation Layer](KINGA-AEA-2026-018-Assessor-Ecosystem-Architecture.md#5-ai-human-reconciliation-layer)
- [KINGA-AWL-2026-019 § 2.7: Phase 6 - AI Reconciliation](KINGA-AWL-2026-019-Assessor-Workflow-Lifecycle.md#27-phase-6-ai-reconciliation)

**Performance Analytics:**
- [KINGA-AEA-2026-018 § 6: Assessor Performance Analytics Engine](KINGA-AEA-2026-018-Assessor-Ecosystem-Architecture.md#6-assessor-performance-analytics-engine)
- [KINGA-AWL-2026-019 § 2.10: Phase 9 - Feedback Submission to Learning Pipeline](KINGA-AWL-2026-019-Assessor-Workflow-Lifecycle.md#210-phase-9-feedback-submission-to-learning-pipeline)

**Premium Features:**
- [KINGA-AEA-2026-018 § 7: Premium Assessor Intelligence Tools](KINGA-AEA-2026-018-Assessor-Ecosystem-Architecture.md#7-premium-assessor-intelligence-tools)

**Marketplace Management:**
- [KINGA-AEA-2026-018 § 8: Marketplace Management Service](KINGA-AEA-2026-018-Assessor-Ecosystem-Architecture.md#8-marketplace-management-service)
- [KINGA-AWL-2026-019 § 2.8: Phase 8 - Approval or Dispute Escalation](KINGA-AWL-2026-019-Assessor-Workflow-Lifecycle.md#28-phase-8-approval-or-dispute-escalation)

**SLA & Compliance:**
- [KINGA-AWL-2026-019 § 5: SLA Enforcement Logic](KINGA-AWL-2026-019-Assessor-Workflow-Lifecycle.md#5-sla-enforcement-logic)
- [KINGA-AWL-2026-019 § 6: Audit Logging Model](KINGA-AWL-2026-019-Assessor-Workflow-Lifecycle.md#6-audit-logging-model)

**Event-Driven Architecture:**
- [KINGA-AEA-2026-018 § 11: Event-Driven Integration Architecture](KINGA-AEA-2026-018-Assessor-Ecosystem-Architecture.md#11-event-driven-integration-architecture)
- [KINGA-AWL-2026-019 § 4: Workflow Event Mapping](KINGA-AWL-2026-019-Assessor-Workflow-Lifecycle.md#4-workflow-event-mapping)

**Continuous Learning:**
- [KINGA-AEA-2026-018 § 10: Continuous Learning Feedback Pipeline](KINGA-AEA-2026-018-Assessor-Ecosystem-Architecture.md#10-continuous-learning-feedback-pipeline)
- [KINGA-AWL-2026-019 § 2.10: Phase 9 - Feedback Submission](KINGA-AWL-2026-019-Assessor-Workflow-Lifecycle.md#210-phase-9-feedback-submission-to-learning-pipeline)

---

## Implementation Status

### Phase 1: Foundation (COMPLETED ✅)

**Database Schema:**
- ✅ `assessors` table (20 columns)
- ✅ `assessor_insurer_relationships` table (11 columns)
- ✅ `assessor_marketplace_reviews` table (9 columns)
- ✅ `marketplace_transactions` table (12 columns with multi-currency support)

**API Procedures:**
- ✅ `assessorOnboarding.addAssessor` — Add new assessor (internal/BYOA)
- ✅ `assessorOnboarding.joinAsAssessor` — Self-registration (marketplace)
- ✅ `assessorOnboarding.searchMarketplace` — Search marketplace assessors
- ✅ `assessorOnboarding.getAssessorProfile` — Retrieve assessor details
- ✅ `assessorOnboarding.updateAssessorProfile` — Update assessor profile
- ✅ `assessorOnboarding.listAssessors` — List all assessors (tenant-scoped)
- ✅ `assessorOnboarding.getAssessorStats` — Performance statistics
- ✅ `claims.assignToAssessor` — Manual assignment workflow

**UI Pages:**
- ✅ `/add-assessor` — Add internal/BYOA assessor
- ✅ `/join-as-assessor` — Marketplace self-registration
- ✅ `/assessor-list` — Browse all assessors
- ✅ `/assign-assessor/:claimId` — Assignment interface with mutation wiring
- ✅ `/assessor/profile` — Assessor profile management

### Phase 2-10: Remaining Implementation (PENDING)

See [KINGA-AEA-2026-018 § 13: Implementation Roadmap](KINGA-AEA-2026-018-Assessor-Ecosystem-Architecture.md#13-implementation-roadmap) for complete 80-week implementation plan.

---

## Key Features

### Multi-Currency Support

The platform supports **any market currency** (USD, ZIG, ZAR, GHS, KES, NGN, etc.) with:
- ISO 4217 currency codes stored at tenant, assessor, and transaction levels
- Real-time exchange rate integration (Open Exchange Rates, XE.com)
- USD-normalized amounts for platform analytics
- Currency conversion at transaction time with locked exchange rates

**Example Pricing (Multi-Currency):**
- Premium Subscription: **$19 / R350 / ZIG500 per month**
- Enterprise Subscription: **$59 / R1,100 / ZIG1,500 per month**
- Payout Threshold: **$50 USD / ZIG130 / R500 ZAR**

### Three Assessor Participation Models

| Model | Description | Revenue Model |
|-------|-------------|---------------|
| **Insurer Internal** | Full-time employees | Included in insurer subscription |
| **BYOA** | Independent contractors (insurer-managed) | Included in insurer subscription |
| **Marketplace** | Independent assessors (KINGA-managed) | 12-20% commission on assignments |

### AI-Human Reconciliation

**Variance Detection Across:**
- Damage scope (F1 score comparing AI vs assessor component identification)
- Cost estimates (percentage variance between AI and assessor estimates)
- Fraud indicators (comparison of AI fraud score vs assessor flags)

**6-Tier Escalation Protocol:**
- Tier 0: Auto-approve (>90% confidence, <10% variance)
- Tier 1-2: Manual review (60-89% confidence, 11-50% variance)
- Tier 3-5: Escalate to management (fraud, total loss disagreement)

### Premium Intelligence Tools

**Freemium Subscription Model:**
- **Free:** Basic reporting, photo upload, manual cost estimation
- **Premium ($19/month):** AI cost optimization, damage detection overlays, parts pricing
- **Enterprise ($59/month):** Repair strategy suggestions, benchmarking, performance coaching

---

## Technical Stack

**Backend:**
- Node.js 22 + TypeScript
- tRPC 11 (end-to-end type safety)
- Express 4 (HTTP server)
- Drizzle ORM (MySQL/TiDB)
- Kafka (event bus)

**Frontend:**
- React 19
- Tailwind CSS 4
- Wouter (routing)
- shadcn/ui (component library)

**Infrastructure:**
- AWS S3 (file storage)
- AWS SageMaker (ML model training)
- MySQL/TiDB (primary database)
- Kafka (event streaming)

---

## Compliance & Security

**Regulatory Compliance:**
- POPIA (Protection of Personal Information Act - South Africa)
- GDPR (General Data Protection Regulation - EU)
- FSCA (Financial Sector Conduct Authority - South Africa)
- ISO 27001 (Information Security Management)

**Security Measures:**
- AES-256 encryption at rest
- TLS 1.3 encryption in transit
- RBAC + ABAC access control
- SHA-256 hash-chained audit trail
- 7-year audit retention policy
- Multi-tenant data isolation

---

## Contact & Support

**Project Owner:** Tavonga Shoko  
**Organization:** KINGA Systems  
**Documentation Version:** 1.0  
**Last Updated:** February 12, 2026

For questions or clarifications about this architecture documentation, please contact the KINGA technical team.

---

**End of Documentation Index**
