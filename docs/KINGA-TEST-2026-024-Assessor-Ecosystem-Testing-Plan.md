# KINGA Assessor Ecosystem Testing Plan

**Document ID:** KINGA-TEST-2026-024  
**Version:** 1.0  
**Last Updated:** February 12, 2026  
**Author:** Tavonga Shoko  
**Status:** Final  
**Classification:** Internal Testing Specification  
**Related Documents:** [KINGA-AEA-2026-018](KINGA-AEA-2026-018-Assessor-Ecosystem-Architecture.md) (Assessor Ecosystem Architecture), [KINGA-AWL-2026-019](KINGA-AWL-2026-019-Assessor-Workflow-Lifecycle.md) (Assessor Workflow Lifecycle)

---

## Executive Summary

This document provides a comprehensive testing plan for validating the KINGA Assessor Ecosystem implementation. The testing plan covers three assessor participation models (Internal, BYOA, Marketplace), multi-currency support, marketplace discovery, assignment workflows, and rating systems. The plan includes detailed test scenarios, test data requirements, expected outcomes, and success criteria to ensure production readiness.

**Testing Scope:** Phase 1 Foundation features currently implemented in the system, including assessor onboarding, marketplace listing, assignment workflows, and multi-currency transaction support.

**Testing Objectives:**
1. Validate all three assessor onboarding workflows function correctly
2. Verify marketplace discovery and search capabilities
3. Test assignment workflow from request to completion
4. Validate multi-currency support across all transaction types
5. Verify rating and review system functionality
6. Ensure data integrity and audit trail logging

---

## Table of Contents

1. [Testing Environment Setup](#testing-environment-setup)
2. [Test Data Requirements](#test-data-requirements)
3. [Test Scenarios](#test-scenarios)
4. [Expected Outcomes](#expected-outcomes)
5. [Success Criteria](#success-criteria)
6. [Known Limitations](#known-limitations)
7. [Post-Testing Actions](#post-testing-actions)

---

## 1. Testing Environment Setup

### 1.1 Prerequisites

Before beginning testing, ensure the following prerequisites are met:

**System Requirements:**
- KINGA application deployed and accessible
- Database schema migrated to latest version (includes assessor ecosystem tables)
- Test tenant account created with admin access
- Multi-currency support enabled (USD, ZIG, ZAR)

**User Accounts Required:**
- 1 × Insurer Admin account (for managing assessors)
- 1 × Claims Processor account (for assigning assessors)
- 3 × Assessor accounts (internal, BYOA, marketplace)
- 1 × Test claimant account (for creating test claims)

**Test Data Setup:**
- At least 5 test claims in various states
- Sample assessor credentials (licenses, certifications)
- Test vehicle data (make, model, VIN)
- Sample damage images

### 1.2 Environment Configuration

Configure the following environment variables for testing:

```bash
# Multi-currency support
DEFAULT_CURRENCY=USD
SUPPORTED_CURRENCIES=USD,ZIG,ZAR

# Exchange rate API (for testing, use mock rates)
EXCHANGE_RATE_API_KEY=test_key
EXCHANGE_RATE_UPDATE_INTERVAL=3600

# Feature flags
MONETIZATION_ENABLED=false  # Keep disabled for initial testing
MARKETPLACE_ENABLED=true
BYOA_ENABLED=true
```

---

## 2. Test Data Requirements

### 2.1 Assessor Test Data

Create the following test assessor profiles:

#### Internal Assessor (Employee)
- **Name:** John Mukwevho
- **Email:** john.mukwevho@testinsurer.co.zw
- **License Number:** ZIM-ASS-2024-001
- **Specializations:** Motor Vehicle, Hail Damage
- **Regions:** Harare, Bulawayo
- **Employment Status:** Full-time employee
- **Performance Score:** 85

#### BYOA Assessor (Partner)
- **Name:** Sarah Ncube
- **Email:** sarah.ncube@independentassessors.co.zw
- **License Number:** ZIM-ASS-2023-045
- **Specializations:** Motor Vehicle, Fire Damage, Theft
- **Regions:** Harare, Mutare, Gweru
- **Certifications:** FSCA Certified, IISA Member
- **Preferred Currency:** USD
- **Rate:** $150 per assessment

#### Marketplace Assessor (Independent)
- **Name:** Tendai Moyo
- **Email:** tendai.moyo@freelanceassessor.com
- **License Number:** ZIM-ASS-2022-089
- **Specializations:** Motor Vehicle, Commercial Vehicles
- **Regions:** Bulawayo, Victoria Falls, Hwange
- **Certifications:** FSCA Certified
- **Preferred Currency:** ZIG
- **Rate:** ZIG 400 per assessment
- **Availability:** Monday-Friday, 8AM-5PM

### 2.2 Claim Test Data

Create the following test claims for assignment testing:

#### Claim 1: Minor Damage (Harare)
- **Claim Number:** CLM-2026-001
- **Policy Number:** POL-ZW-2025-5678
- **Incident Date:** 2026-02-01
- **Location:** Harare CBD
- **Vehicle:** 2020 Toyota Corolla
- **Damage Type:** Rear-end collision
- **Estimated Cost:** $800 / ZIG 2,100
- **Status:** pending_assessment

#### Claim 2: Moderate Damage (Bulawayo)
- **Claim Number:** CLM-2026-002
- **Policy Number:** POL-ZW-2025-9012
- **Incident Date:** 2026-02-05
- **Location:** Bulawayo Industrial Area
- **Vehicle:** 2018 Nissan NP300
- **Damage Type:** Side impact
- **Estimated Cost:** $2,500 / ZIG 6,500
- **Status:** pending_assessment

#### Claim 3: Severe Damage (Mutare)
- **Claim Number:** CLM-2026-003
- **Policy Number:** POL-ZW-2025-3456
- **Incident Date:** 2026-02-08
- **Location:** Mutare-Harare Highway
- **Vehicle:** 2019 Honda CR-V
- **Damage Type:** Rollover accident
- **Estimated Cost:** $8,000 / ZIG 21,000
- **Status:** pending_assessment

---

## 3. Test Scenarios

### 3.1 Assessor Onboarding Workflows

#### Test Scenario 1.1: Internal Assessor Onboarding
**Objective:** Verify that insurer admins can successfully onboard internal assessors.

**Test Steps:**
1. Log in as Insurer Admin
2. Navigate to `/assessor/add`
3. Select "Internal Assessor (Employee)" model
4. Fill in assessor details:
   - Full name: John Mukwevho
   - Email: john.mukwevho@testinsurer.co.zw
   - License number: ZIM-ASS-2024-001
   - Specializations: Motor Vehicle, Hail Damage
   - Regions: Harare, Bulawayo
5. Click "Add Assessor"

**Expected Outcome:**
- Assessor profile created successfully
- Confirmation message displayed
- Assessor appears in assessor list at `/assessor/list`
- Assessor record in database with `assessor_type = 'internal'`
- Audit log entry created

**Success Criteria:**
- ✅ Assessor profile created without errors
- ✅ All fields saved correctly to database
- ✅ Assessor visible in list view
- ✅ Audit trail logged

---

#### Test Scenario 1.2: BYOA Assessor Onboarding
**Objective:** Verify that insurer admins can successfully onboard BYOA partner assessors.

**Test Steps:**
1. Log in as Insurer Admin
2. Navigate to `/assessor/add`
3. Select "BYOA (Bring Your Own Assessor)" model
4. Fill in assessor details:
   - Full name: Sarah Ncube
   - Email: sarah.ncube@independentassessors.co.zw
   - License number: ZIM-ASS-2023-045
   - Specializations: Motor Vehicle, Fire Damage, Theft
   - Regions: Harare, Mutare, Gweru
   - Certifications: FSCA Certified, IISA Member
   - Assessment fee: $150 USD
5. Click "Add Assessor"

**Expected Outcome:**
- Assessor profile created successfully
- Confirmation message displayed
- Assessor appears in assessor list
- Assessor record in database with `assessor_type = 'byoa'`
- `assessor_insurer_relationships` record created linking assessor to tenant
- Currency set to USD

**Success Criteria:**
- ✅ BYOA assessor profile created
- ✅ Relationship record created with correct tenant
- ✅ Assessment fee stored in USD
- ✅ Certifications saved correctly

---

#### Test Scenario 1.3: Marketplace Assessor Self-Registration
**Objective:** Verify that independent assessors can self-register on the marketplace.

**Test Steps:**
1. Navigate to `/assessor/join` (public page, no login required)
2. Fill in registration form:
   - Full name: Tendai Moyo
   - Email: tendai.moyo@freelanceassessor.com
   - Phone: +263 77 123 4567
   - License number: ZIM-ASS-2022-089
   - Specializations: Motor Vehicle, Commercial Vehicles
   - Regions: Bulawayo, Victoria Falls, Hwange
   - Certifications: FSCA Certified
   - Preferred currency: ZIG
   - Assessment fee: ZIG 400
3. Upload license document (PDF)
4. Click "Submit Application"

**Expected Outcome:**
- Application submitted successfully
- Confirmation screen displayed with "Application Pending Review" message
- Assessor record created with `assessor_type = 'marketplace'`
- `marketplace_status = 'pending_approval'`
- Email notification sent to assessor confirming application receipt
- Admin notification sent to insurer for review

**Success Criteria:**
- ✅ Marketplace assessor application submitted
- ✅ Status set to pending approval
- ✅ License document uploaded to S3
- ✅ Email notifications sent
- ✅ Currency set to ZIG

---

### 3.2 Marketplace Discovery and Search

#### Test Scenario 2.1: Search Marketplace Assessors by Region
**Objective:** Verify that claims processors can search for marketplace assessors by region.

**Test Steps:**
1. Log in as Claims Processor
2. Navigate to `/assessor/marketplace`
3. Enter search criteria:
   - Region: Bulawayo
   - Specialization: Motor Vehicle
4. Click "Search"

**Expected Outcome:**
- Search results display assessors matching criteria
- Tendai Moyo appears in results (region: Bulawayo, specialization: Motor Vehicle)
- John Mukwevho does NOT appear (region: Harare, not Bulawayo)
- Each result shows:
  - Assessor name
  - License number
  - Specializations
  - Regions served
  - Rating (if available)
  - Assessment fee in preferred currency

**Success Criteria:**
- ✅ Search returns correct results
- ✅ Filtering by region works correctly
- ✅ Assessment fees displayed in correct currency
- ✅ Results sorted by performance score (default)

---

#### Test Scenario 2.2: Filter Marketplace Assessors by Specialization
**Objective:** Verify that filtering by specialization returns correct results.

**Test Steps:**
1. Log in as Claims Processor
2. Navigate to `/assessor/marketplace`
3. Enter search criteria:
   - Specialization: Fire Damage
4. Click "Search"

**Expected Outcome:**
- Sarah Ncube appears in results (specialization includes Fire Damage)
- Tendai Moyo does NOT appear (no Fire Damage specialization)
- Results display specialization badges

**Success Criteria:**
- ✅ Specialization filter works correctly
- ✅ Only assessors with matching specialization returned
- ✅ Specialization badges displayed

---

### 3.3 Assessor Assignment Workflow

#### Test Scenario 3.1: Assign Internal Assessor to Claim
**Objective:** Verify that claims processors can assign internal assessors to claims.

**Test Steps:**
1. Log in as Claims Processor
2. Navigate to claim detail page for CLM-2026-001 (Harare claim)
3. Click "Assign Assessor"
4. Select John Mukwevho (internal assessor, Harare region)
5. Click "Assign to Claim"

**Expected Outcome:**
- Assignment successful
- Claim status updated to `assessment_pending`
- Assignment record created in database
- Email notification sent to John Mukwevho
- In-app notification created for assessor
- Audit log entry created
- Redirect to claims list

**Success Criteria:**
- ✅ Assignment completed without errors
- ✅ Claim status updated correctly
- ✅ Email notification sent
- ✅ In-app notification created
- ✅ Audit trail logged

---

#### Test Scenario 3.2: Assign BYOA Assessor to Claim
**Objective:** Verify that BYOA assessors can be assigned with correct fee tracking.

**Test Steps:**
1. Log in as Claims Processor
2. Navigate to claim detail page for CLM-2026-003 (Mutare claim)
3. Click "Assign Assessor"
4. Select Sarah Ncube (BYOA assessor, serves Mutare)
5. Confirm assessment fee: $150 USD
6. Click "Assign to Claim"

**Expected Outcome:**
- Assignment successful
- Claim status updated to `assessment_pending`
- Assignment record created with `assessment_fee = 150.00` and `currency = 'USD'`
- Email notification sent to Sarah Ncube
- Fee tracked for billing purposes

**Success Criteria:**
- ✅ BYOA assessor assigned
- ✅ Assessment fee recorded in USD
- ✅ Fee visible in claim details
- ✅ Email notification sent

---

#### Test Scenario 3.3: Assign Marketplace Assessor to Claim
**Objective:** Verify that marketplace assessors can be assigned with commission tracking.

**Test Steps:**
1. Log in as Claims Processor
2. Navigate to claim detail page for CLM-2026-002 (Bulawayo claim)
3. Click "Assign Assessor"
4. Select Tendai Moyo (marketplace assessor, Bulawayo region)
5. Confirm assessment fee: ZIG 400
6. Review commission breakdown:
   - Assessment fee: ZIG 400
   - KINGA commission (15%): ZIG 60
   - Assessor payout: ZIG 340
7. Click "Assign to Claim"

**Expected Outcome:**
- Assignment successful
- Claim status updated to `assessment_pending`
- `marketplace_transactions` record created with:
  - `assessment_fee = 400.00`
  - `currency = 'ZIG'`
  - `kinga_commission = 60.00`
  - `assessor_payout = 340.00`
  - `commission_rate = 15.00`
  - `transaction_status = 'pending'`
- Email notification sent to Tendai Moyo
- Commission tracked for payout processing

**Success Criteria:**
- ✅ Marketplace assessor assigned
- ✅ Transaction record created
- ✅ Commission calculated correctly (15%)
- ✅ Currency set to ZIG
- ✅ Email notification sent

---

### 3.4 Multi-Currency Support

#### Test Scenario 4.1: Display Fees in Multiple Currencies
**Objective:** Verify that assessment fees are displayed in the correct currency.

**Test Steps:**
1. Log in as Claims Processor
2. Navigate to `/assessor/marketplace`
3. View assessor cards for:
   - Sarah Ncube (USD)
   - Tendai Moyo (ZIG)

**Expected Outcome:**
- Sarah Ncube's card shows: "$150 USD per assessment"
- Tendai Moyo's card shows: "ZIG 400 per assessment"
- Currency symbols and codes displayed correctly

**Success Criteria:**
- ✅ Fees displayed in correct currency
- ✅ Currency symbols rendered properly
- ✅ No currency conversion applied (fees shown in assessor's preferred currency)

---

#### Test Scenario 4.2: Multi-Currency Transaction Recording
**Objective:** Verify that transactions in different currencies are recorded correctly.

**Test Steps:**
1. Assign Sarah Ncube (USD) to a claim
2. Assign Tendai Moyo (ZIG) to another claim
3. Query database for `marketplace_transactions` records

**Expected Outcome:**
- Sarah Ncube transaction:
  - `currency = 'USD'`
  - `assessment_fee = 150.00`
  - `kinga_commission = 22.50` (15%)
  - `assessor_payout = 127.50`
- Tendai Moyo transaction:
  - `currency = 'ZIG'`
  - `assessment_fee = 400.00`
  - `kinga_commission = 60.00` (15%)
  - `assessor_payout = 340.00`

**Success Criteria:**
- ✅ Transactions recorded in correct currency
- ✅ Commission calculated correctly for each currency
- ✅ No currency conversion applied

---

### 3.5 Rating and Review System

#### Test Scenario 5.1: Submit Assessor Review
**Objective:** Verify that insurers can submit reviews for marketplace assessors after assignment completion.

**Test Steps:**
1. Complete an assessment with Tendai Moyo (marketplace assessor)
2. Mark claim as `assessment_completed`
3. Navigate to assessor profile
4. Click "Submit Review"
5. Fill in review form:
   - Overall rating: 4/5
   - Accuracy rating: 5/5
   - Professionalism rating: 4/5
   - Timeliness rating: 3/5
   - Communication rating: 4/5
   - Review text: "Thorough assessment, slight delay in submission"
   - Would hire again: Yes
6. Click "Submit Review"

**Expected Outcome:**
- Review submitted successfully
- `assessor_marketplace_reviews` record created
- Tendai Moyo's average rating updated
- Review visible on assessor profile
- Rating badge updated on marketplace listing

**Success Criteria:**
- ✅ Review submitted without errors
- ✅ All rating dimensions saved
- ✅ Average rating recalculated
- ✅ Review visible on profile

---

### 3.6 Data Integrity and Audit Trails

#### Test Scenario 6.1: Verify Audit Trail Logging
**Objective:** Verify that all assessor-related actions are logged in audit trails.

**Test Steps:**
1. Perform the following actions:
   - Add internal assessor
   - Assign assessor to claim
   - Submit review
2. Query audit logs for these actions

**Expected Outcome:**
- Audit log entries created for each action with:
  - Timestamp
  - User ID (who performed the action)
  - Action type (e.g., "assessor_added", "assessor_assigned", "review_submitted")
  - Entity ID (assessor ID, claim ID)
  - Before/after state (for updates)
  - IP address
  - User agent

**Success Criteria:**
- ✅ All actions logged
- ✅ Timestamps accurate
- ✅ User attribution correct
- ✅ State changes captured

---

## 4. Expected Outcomes

### 4.1 Functional Outcomes

Upon successful completion of all test scenarios, the following functional outcomes should be achieved:

**Assessor Onboarding:**
- All three assessor models (Internal, BYOA, Marketplace) can be successfully onboarded
- Assessor profiles created with correct attributes
- Relationships established between assessors and tenants

**Marketplace Discovery:**
- Search and filter functionality returns correct results
- Assessors displayed with accurate information
- Currency displayed correctly for each assessor

**Assignment Workflow:**
- Assessors can be assigned to claims
- Claim status transitions correctly
- Notifications sent to all parties
- Fees and commissions tracked accurately

**Multi-Currency Support:**
- Transactions recorded in correct currency
- No unintended currency conversions
- Commission calculations accurate across currencies

**Rating System:**
- Reviews can be submitted
- Ratings calculated and displayed correctly
- Review history maintained

### 4.2 Non-Functional Outcomes

**Performance:**
- Assessor list page loads in < 2 seconds
- Marketplace search returns results in < 1 second
- Assignment workflow completes in < 3 seconds

**Usability:**
- All forms validate input correctly
- Error messages clear and actionable
- Success confirmations displayed
- Navigation intuitive

**Security:**
- Only authorized users can access assessor management
- Audit trails capture all actions
- Sensitive data (license numbers, fees) protected

---

## 5. Success Criteria

The testing phase is considered successful when the following criteria are met:

### 5.1 Functional Success Criteria

| Criterion | Target | Status |
|-----------|--------|--------|
| All three assessor onboarding workflows functional | 100% | ☐ |
| Marketplace search returns correct results | 100% accuracy | ☐ |
| Assignment workflow completes end-to-end | 100% | ☐ |
| Multi-currency transactions recorded correctly | 100% | ☐ |
| Rating and review system functional | 100% | ☐ |
| Audit trails logged for all actions | 100% | ☐ |

### 5.2 Data Integrity Success Criteria

| Criterion | Target | Status |
|-----------|--------|--------|
| No duplicate assessor records created | 0 duplicates | ☐ |
| All foreign key relationships valid | 100% | ☐ |
| Currency fields populated correctly | 100% | ☐ |
| Commission calculations accurate | 100% | ☐ |
| Audit log completeness | 100% | ☐ |

### 5.3 User Experience Success Criteria

| Criterion | Target | Status |
|-----------|--------|--------|
| Form validation prevents invalid data | 100% | ☐ |
| Error messages clear and actionable | 100% | ☐ |
| Success confirmations displayed | 100% | ☐ |
| Page load times acceptable | < 2s | ☐ |
| Mobile responsiveness | 100% | ☐ |

---

## 6. Known Limitations

The following features are **not yet implemented** and should not be tested in this phase:

**Not Implemented:**
- ❌ Assessor acceptance/rejection workflow (Phase 2 of KINGA-AWL-2026-019)
- ❌ Inspection scheduling interface (Phase 3 of KINGA-AWL-2026-019)
- ❌ AI reconciliation layer (Phase 6 of KINGA-AWL-2026-019)
- ❌ Premium subscription management (KINGA-PMA-2026-020)
- ❌ SLA monitoring dashboard (KINGA-AWL-2026-019)
- ❌ Continuous learning pipeline (KINGA-CLP-2026-021)
- ❌ Document intelligence pipeline (KINGA-DIP-2026-023)
- ❌ Compliance monitoring dashboards (KINGA-CGF-2026-022)

**Workarounds for Testing:**
- Assignment workflow stops after assignment creation (assessor acceptance not yet implemented)
- Use manual status updates in database to simulate workflow progression
- SLA tracking not active (no automated escalation)

---

## 7. Post-Testing Actions

### 7.1 Defect Reporting

For any defects discovered during testing:

1. **Document the defect** with:
   - Test scenario ID
   - Steps to reproduce
   - Expected outcome
   - Actual outcome
   - Screenshots/logs
   - Severity (Critical, High, Medium, Low)

2. **Create GitHub issue** with:
   - Title: `[BUG] Brief description`
   - Labels: `bug`, `assessor-ecosystem`
   - Assignee: Development team
   - Milestone: Phase 1 Foundation

3. **Track resolution** in project board

### 7.2 Test Results Documentation

After completing all test scenarios:

1. **Update success criteria table** with actual results
2. **Calculate pass rate**: (Passed tests / Total tests) × 100%
3. **Document any deviations** from expected outcomes
4. **Compile test report** summarizing:
   - Tests executed
   - Pass/fail rate
   - Defects found
   - Recommendations

### 7.3 Sign-Off

Testing phase requires sign-off from:
- ☐ Product Owner (functional acceptance)
- ☐ Technical Lead (technical acceptance)
- ☐ QA Lead (test coverage acceptance)

### 7.4 Next Steps After Testing

Upon successful completion of testing:

1. **Proceed to Phase 2 implementation:**
   - Assessor acceptance/rejection workflow
   - Inspection scheduling interface
   - Report submission workflow

2. **Implement Document Intelligence Pipeline (KINGA-DIP-2026-023):**
   - Document upload UI
   - Document classification service
   - Extraction and validation workflows

3. **Deploy to staging environment** for user acceptance testing (UAT)

---

## Appendix A: Test Data SQL Scripts

### A.1 Create Test Tenant

```sql
INSERT INTO tenants (tenant_id, name, default_currency, created_at)
VALUES ('test-tenant-001', 'Test Insurance Company', 'USD', NOW());
```

### A.2 Create Test Assessors

```sql
-- Internal Assessor
INSERT INTO assessors (
  full_name, email, phone, license_number, 
  assessor_type, specializations, regions_served, 
  performance_score, created_at
)
VALUES (
  'John Mukwevho', 'john.mukwevho@testinsurer.co.zw', '+263 77 111 2222',
  'ZIM-ASS-2024-001', 'internal', 
  JSON_ARRAY('Motor Vehicle', 'Hail Damage'),
  JSON_ARRAY('Harare', 'Bulawayo'),
  85, NOW()
);

-- BYOA Assessor
INSERT INTO assessors (
  full_name, email, phone, license_number,
  assessor_type, specializations, regions_served,
  certifications, marketplace_currency,
  performance_score, created_at
)
VALUES (
  'Sarah Ncube', 'sarah.ncube@independentassessors.co.zw', '+263 77 333 4444',
  'ZIM-ASS-2023-045', 'byoa',
  JSON_ARRAY('Motor Vehicle', 'Fire Damage', 'Theft'),
  JSON_ARRAY('Harare', 'Mutare', 'Gweru'),
  JSON_ARRAY('FSCA Certified', 'IISA Member'), 'USD',
  88, NOW()
);

-- Marketplace Assessor
INSERT INTO assessors (
  full_name, email, phone, license_number,
  assessor_type, specializations, regions_served,
  certifications, marketplace_currency, marketplace_rate,
  marketplace_status, performance_score, created_at
)
VALUES (
  'Tendai Moyo', 'tendai.moyo@freelanceassessor.com', '+263 77 555 6666',
  'ZIM-ASS-2022-089', 'marketplace',
  JSON_ARRAY('Motor Vehicle', 'Commercial Vehicles'),
  JSON_ARRAY('Bulawayo', 'Victoria Falls', 'Hwange'),
  JSON_ARRAY('FSCA Certified'), 'ZIG', 400.00,
  'approved', 82, NOW()
);
```

### A.3 Create Test Claims

```sql
-- Claim 1: Minor Damage (Harare)
INSERT INTO claims (
  claim_number, policy_number, tenant_id,
  incident_date, incident_location,
  vehicle_make, vehicle_model, vehicle_year,
  damage_type, estimated_cost, currency,
  status, created_at
)
VALUES (
  'CLM-2026-001', 'POL-ZW-2025-5678', 'test-tenant-001',
  '2026-02-01', 'Harare CBD',
  'Toyota', 'Corolla', 2020,
  'Rear-end collision', 800.00, 'USD',
  'pending_assessment', NOW()
);

-- Claim 2: Moderate Damage (Bulawayo)
INSERT INTO claims (
  claim_number, policy_number, tenant_id,
  incident_date, incident_location,
  vehicle_make, vehicle_model, vehicle_year,
  damage_type, estimated_cost, currency,
  status, created_at
)
VALUES (
  'CLM-2026-002', 'POL-ZW-2025-9012', 'test-tenant-001',
  '2026-02-05', 'Bulawayo Industrial Area',
  'Nissan', 'NP300', 2018,
  'Side impact', 2500.00, 'USD',
  'pending_assessment', NOW()
);

-- Claim 3: Severe Damage (Mutare)
INSERT INTO claims (
  claim_number, policy_number, tenant_id,
  incident_date, incident_location,
  vehicle_make, vehicle_model, vehicle_year,
  damage_type, estimated_cost, currency,
  status, created_at
)
VALUES (
  'CLM-2026-003', 'POL-ZW-2025-3456', 'test-tenant-001',
  '2026-02-08', 'Mutare-Harare Highway',
  'Honda', 'CR-V', 2019,
  'Rollover accident', 8000.00, 'USD',
  'pending_assessment', NOW()
);
```

---

## Appendix B: Testing Checklist

Use this checklist to track testing progress:

### Assessor Onboarding
- [ ] Test Scenario 1.1: Internal Assessor Onboarding
- [ ] Test Scenario 1.2: BYOA Assessor Onboarding
- [ ] Test Scenario 1.3: Marketplace Assessor Self-Registration

### Marketplace Discovery
- [ ] Test Scenario 2.1: Search by Region
- [ ] Test Scenario 2.2: Filter by Specialization

### Assignment Workflow
- [ ] Test Scenario 3.1: Assign Internal Assessor
- [ ] Test Scenario 3.2: Assign BYOA Assessor
- [ ] Test Scenario 3.3: Assign Marketplace Assessor

### Multi-Currency Support
- [ ] Test Scenario 4.1: Display Fees in Multiple Currencies
- [ ] Test Scenario 4.2: Multi-Currency Transaction Recording

### Rating and Review System
- [ ] Test Scenario 5.1: Submit Assessor Review

### Data Integrity
- [ ] Test Scenario 6.1: Verify Audit Trail Logging

### Sign-Off
- [ ] Product Owner approval
- [ ] Technical Lead approval
- [ ] QA Lead approval

---

**End of Testing Plan**
