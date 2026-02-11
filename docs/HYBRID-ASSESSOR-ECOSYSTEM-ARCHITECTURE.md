# KINGA Hybrid Assessor Ecosystem Architecture

**Document ID:** KINGA-HAEA-2026-014  
**Version:** 1.0  
**Date:** February 11, 2026  
**Author:** Tavonga Shoko  
**Status:** Architecture Design  
**Classification:** Internal - Strategic Architecture

---

## Executive Summary

This document specifies the **Hybrid Assessor Ecosystem Architecture** for the KINGA AutoVerify AI platform, supporting **both insurer-owned assessors (BYOA - Bring Your Own Assessor) and a KINGA marketplace network**. This dual-model approach provides maximum flexibility for insurers while creating a scalable revenue stream through marketplace commissions.

The architecture enables insurers to choose their preferred assessor sourcing strategy:

1. **BYOA Model** — Insurers bring their existing assessor relationships, KINGA provides workflow automation
2. **Marketplace Model** — Insurers discover and hire pre-vetted assessors from KINGA's network
3. **Hybrid Model** — Insurers use both their own assessors and marketplace assessors based on capacity, specialization, or geography

### Strategic Benefits

**For Insurers:**
- Flexibility to leverage existing assessor relationships
- Access to vetted marketplace assessors for overflow or specialized claims
- Transparent performance metrics for all assessors (internal and marketplace)
- Reduced onboarding friction (no forced marketplace adoption)

**For KINGA:**
- Multiple revenue streams (SaaS subscriptions + marketplace commissions)
- Competitive differentiation (most platforms force one model)
- Network effects (marketplace grows as more insurers join)
- Data advantage (performance benchmarks across all assessor types)

**For Assessors:**
- Flexibility to work as independent contractors or insurer employees
- Access to multiple insurers through marketplace
- Performance-based reputation system
- Transparent earnings and assignment opportunities

---

## 1. Assessor Classification System

### 1.1 Assessor Types

KINGA supports **three assessor classifications**:

| Type | Description | Relationship | Assignment | Revenue Model |
|------|-------------|--------------|------------|---------------|
| **Insurer-Owned** | Employed by specific insurer | Exclusive to one tenant | Insurer assigns directly | Included in SaaS subscription |
| **Marketplace** | Independent contractors | Available to all insurers | Insurer discovers & hires | KINGA takes commission (15-20%) |
| **Hybrid** | Works for specific insurer + marketplace | Primary insurer + open to others | Both direct and marketplace | Mixed (salary + commission) |

### 1.2 Database Schema Extensions

```sql
-- Assessor registry with classification
CREATE TABLE assessors (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL UNIQUE,
  professional_license_number VARCHAR(100) NOT NULL UNIQUE,
  license_expiry_date DATE NOT NULL,
  
  -- Assessor classification
  assessor_type ENUM('insurer_owned', 'marketplace', 'hybrid') NOT NULL,
  primary_tenant_id VARCHAR(36), -- For insurer-owned and hybrid assessors
  marketplace_enabled BOOLEAN DEFAULT FALSE, -- Can accept marketplace assignments
  
  -- Marketplace profile
  marketplace_status ENUM('pending_approval', 'active', 'suspended', 'inactive') DEFAULT 'pending_approval',
  marketplace_onboarded_at TIMESTAMP NULL,
  marketplace_bio TEXT, -- Public profile description
  marketplace_hourly_rate DECIMAL(10,2), -- Suggested rate for marketplace
  marketplace_availability ENUM('full_time', 'part_time', 'weekends_only', 'on_demand') DEFAULT 'on_demand',
  
  -- Specializations and certifications
  specializations JSON, -- ["vehicle", "property", "marine", "heavy_equipment"]
  certifications JSON, -- ["IICRC", "ASE", "I-CAR"]
  certification_level ENUM('junior', 'senior', 'expert', 'master') NOT NULL,
  years_of_experience INT,
  
  -- Geographic coverage
  service_regions JSON, -- ["Harare", "Bulawayo", "Mutare"]
  max_travel_distance_km INT DEFAULT 50,
  
  -- Performance metrics (unified across all types)
  active_status BOOLEAN DEFAULT TRUE,
  performance_score DECIMAL(5,2), -- 0.00 to 100.00
  total_assessments_completed INT DEFAULT 0,
  average_accuracy_score DECIMAL(5,2), -- Compared to AI baseline
  average_turnaround_hours DECIMAL(8,2),
  average_rating DECIMAL(3,2), -- 0.00 to 5.00 (marketplace ratings)
  total_ratings_count INT DEFAULT 0,
  
  -- Marketplace earnings (for marketplace and hybrid assessors)
  total_marketplace_earnings DECIMAL(12,2) DEFAULT 0.00,
  pending_payout DECIMAL(12,2) DEFAULT 0.00,
  last_payout_date TIMESTAMP NULL,
  
  -- Compliance and verification
  background_check_status ENUM('pending', 'passed', 'failed') DEFAULT 'pending',
  background_check_date TIMESTAMP NULL,
  insurance_verified BOOLEAN DEFAULT FALSE, -- Professional indemnity insurance
  insurance_expiry_date DATE NULL,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_type (assessor_type),
  INDEX idx_marketplace_status (marketplace_status),
  INDEX idx_primary_tenant (primary_tenant_id),
  INDEX idx_performance (performance_score DESC),
  INDEX idx_rating (average_rating DESC),
  INDEX idx_regions (service_regions(255)),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (primary_tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
);

-- Assessor-insurer relationships (for both BYOA and marketplace)
CREATE TABLE assessor_insurer_relationships (
  id VARCHAR(36) PRIMARY KEY,
  assessor_id VARCHAR(36) NOT NULL,
  tenant_id VARCHAR(36) NOT NULL,
  
  -- Relationship type
  relationship_type ENUM('insurer_owned', 'marketplace_contract', 'preferred_vendor') NOT NULL,
  relationship_status ENUM('active', 'suspended', 'terminated') DEFAULT 'active',
  
  -- Contract details
  contract_start_date DATE NOT NULL,
  contract_end_date DATE,
  contracted_rate_per_assessment DECIMAL(10,2), -- For insurer-owned assessors
  marketplace_commission_rate DECIMAL(5,2), -- For marketplace assessors (e.g., 15.00 = 15%)
  
  -- Performance tracking (tenant-specific)
  performance_rating DECIMAL(3,2), -- Insurer-specific rating 0.00 to 5.00
  total_assignments_completed INT DEFAULT 0,
  total_assignments_rejected INT DEFAULT 0,
  average_completion_time_hours DECIMAL(8,2),
  
  -- Preferred vendor status (for marketplace assessors)
  is_preferred_vendor BOOLEAN DEFAULT FALSE,
  preferred_vendor_since TIMESTAMP NULL,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_assessor_tenant (assessor_id, tenant_id),
  INDEX idx_tenant (tenant_id),
  INDEX idx_type (relationship_type),
  INDEX idx_status (relationship_status),
  INDEX idx_preferred (is_preferred_vendor),
  FOREIGN KEY (assessor_id) REFERENCES assessors(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Marketplace assessor ratings and reviews
CREATE TABLE assessor_marketplace_reviews (
  id VARCHAR(36) PRIMARY KEY,
  assessor_id VARCHAR(36) NOT NULL,
  claim_id VARCHAR(36) NOT NULL,
  tenant_id VARCHAR(36) NOT NULL,
  reviewer_user_id VARCHAR(36) NOT NULL, -- Insurer user who left review
  
  -- Rating (1-5 stars)
  overall_rating INT NOT NULL, -- 1-5
  accuracy_rating INT, -- 1-5
  professionalism_rating INT, -- 1-5
  timeliness_rating INT, -- 1-5
  communication_rating INT, -- 1-5
  
  -- Review content
  review_text TEXT,
  would_hire_again BOOLEAN,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_claim_review (claim_id, reviewer_user_id),
  INDEX idx_assessor (assessor_id),
  INDEX idx_rating (overall_rating DESC),
  INDEX idx_tenant (tenant_id),
  FOREIGN KEY (assessor_id) REFERENCES assessors(id) ON DELETE CASCADE,
  FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Marketplace transactions (for commission tracking)
CREATE TABLE marketplace_transactions (
  id VARCHAR(36) PRIMARY KEY,
  assignment_id VARCHAR(36) NOT NULL,
  assessor_id VARCHAR(36) NOT NULL,
  tenant_id VARCHAR(36) NOT NULL,
  claim_id VARCHAR(36) NOT NULL,
  
  -- Financial details
  assessment_fee DECIMAL(10,2) NOT NULL, -- Total fee charged to insurer
  kinga_commission DECIMAL(10,2) NOT NULL, -- KINGA's commission
  assessor_payout DECIMAL(10,2) NOT NULL, -- Assessor's net earnings
  commission_rate DECIMAL(5,2) NOT NULL, -- Percentage (e.g., 15.00)
  
  -- Transaction status
  transaction_status ENUM('pending', 'completed', 'paid_out', 'disputed', 'refunded') DEFAULT 'pending',
  completed_at TIMESTAMP NULL,
  paid_out_at TIMESTAMP NULL,
  
  -- Payment details
  payment_method VARCHAR(50), -- "stripe", "bank_transfer", "mobile_money"
  payment_reference VARCHAR(100),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_assignment (assignment_id),
  INDEX idx_assessor (assessor_id),
  INDEX idx_tenant (tenant_id),
  INDEX idx_status (transaction_status),
  FOREIGN KEY (assignment_id) REFERENCES assessor_claim_assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (assessor_id) REFERENCES assessors(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE
);
```

### 1.3 Assessor Type Decision Matrix

**When to Use Each Type:**

| Scenario | Recommended Type | Rationale |
|----------|------------------|-----------|
| Large insurer with in-house team | Insurer-Owned | Full control, existing relationships |
| Small insurer, no assessor team | Marketplace | No upfront hiring costs, pay-per-use |
| Medium insurer, seasonal overflow | Hybrid | Use internal team + marketplace for peaks |
| Geographic expansion | Marketplace | Access assessors in new regions without hiring |
| Specialized claims (marine, heavy equipment) | Marketplace | Access niche expertise on-demand |
| High-volume, predictable workload | Insurer-Owned | Lower per-assessment cost at scale |

---

## 2. Assessor Onboarding Workflows

### 2.1 Insurer-Owned Assessor Onboarding

**Trigger:** Insurer adds their existing assessor to KINGA

**Workflow:**

```
1. INSURER INITIATES ONBOARDING
   ├── Insurer admin navigates to "Team Management"
   ├── Clicks "Add Assessor"
   ├── Selects "Insurer-Owned Assessor"
   └── Enters assessor details (name, email, license number)

2. ASSESSOR ACCOUNT CREATION
   ├── System creates user account (role: assessor)
   ├── System creates assessor profile (type: insurer_owned)
   ├── System links assessor to tenant (primary_tenant_id)
   ├── System creates assessor-insurer relationship (type: insurer_owned)
   └── System sends invitation email to assessor

3. ASSESSOR PROFILE COMPLETION
   ├── Assessor logs in via invitation link
   ├── Assessor completes profile (certifications, experience, regions)
   ├── Assessor uploads professional license
   ├── Assessor uploads professional indemnity insurance
   └── Assessor sets availability preferences

4. VERIFICATION & ACTIVATION
   ├── System verifies license number (auto-check against registry)
   ├── System verifies insurance coverage
   ├── Insurer admin reviews and approves
   └── Assessor account activated (status: active)

5. ASSIGNMENT READY
   └── Assessor appears in insurer's assignment dropdown
```

**Key Characteristics:**
- **No marketplace exposure** — Assessor only visible to their insurer
- **No commission** — Included in insurer's SaaS subscription
- **Exclusive assignment** — Only receives assignments from their insurer
- **Full insurer control** — Insurer manages performance, rates, and status

### 2.2 Marketplace Assessor Onboarding

**Trigger:** Independent assessor applies to join KINGA marketplace

**Workflow:**

```
1. ASSESSOR SELF-REGISTRATION
   ├── Assessor visits KINGA marketplace landing page
   ├── Clicks "Join as Assessor"
   ├── Completes registration form (name, email, phone, license)
   └── Submits application

2. PROFILE CREATION
   ├── System creates user account (role: assessor)
   ├── System creates assessor profile (type: marketplace)
   ├── Assessor completes detailed profile:
   │   ├── Professional bio (public-facing)
   │   ├── Certifications and specializations
   │   ├── Years of experience
   │   ├── Service regions and travel distance
   │   ├── Hourly rate / per-assessment fee
   │   └── Availability (full-time, part-time, on-demand)
   └── Assessor uploads documents:
       ├── Professional license (front & back)
       ├── Proof of insurance
       ├── Certifications (IICRC, ASE, I-CAR, etc.)
       └── ID document

3. KINGA VERIFICATION
   ├── KINGA compliance team reviews application
   ├── Verifies license against professional registry
   ├── Verifies insurance coverage and expiry
   ├── Conducts background check (criminal record, fraud history)
   ├── Validates certifications
   └── Decision: Approve / Reject / Request More Info

4. MARKETPLACE ACTIVATION
   ├── If approved: marketplace_status = 'active'
   ├── Assessor receives approval email
   ├── Assessor profile goes live on marketplace
   └── Assessor can now receive assignment requests

5. ASSIGNMENT READY
   └── Assessor appears in marketplace search for all insurers
```

**Key Characteristics:**
- **Public marketplace profile** — Visible to all insurers
- **Commission-based** — KINGA takes 15-20% commission per assignment
- **Multi-insurer access** — Can work with any insurer on platform
- **Performance-based reputation** — Ratings and reviews visible to insurers

### 2.3 Hybrid Assessor Onboarding

**Trigger:** Insurer-owned assessor opts into marketplace OR marketplace assessor becomes preferred vendor

**Workflow:**

```
1. HYBRID CONVERSION REQUEST
   ├── Existing insurer-owned assessor: Clicks "Enable Marketplace"
   └── Existing marketplace assessor: Insurer clicks "Add to Team"

2. PROFILE ENHANCEMENT
   ├── Assessor completes marketplace profile (if not already done)
   ├── Assessor sets marketplace availability (e.g., "weekends only")
   ├── Assessor sets marketplace hourly rate
   └── Assessor confirms conflict-of-interest policy

3. DUAL-STATUS ACTIVATION
   ├── assessor_type = 'hybrid'
   ├── primary_tenant_id = [insurer ID]
   ├── marketplace_enabled = TRUE
   └── Creates two relationships:
       ├── Insurer-owned relationship (primary insurer)
       └── Marketplace relationship (other insurers)

4. ASSIGNMENT ROUTING
   ├── Primary insurer: Direct assignment (no commission)
   └── Other insurers: Marketplace assignment (commission applies)
```

**Key Characteristics:**
- **Dual revenue model** — Salary from primary insurer + commission from marketplace
- **Conflict management** — Cannot accept marketplace assignments from competing insurers (configurable)
- **Flexible capacity** — Primary insurer gets priority, marketplace fills gaps
- **Unified performance tracking** — All assignments tracked in one profile

---

## 3. Unified Assignment Workflow

### 3.1 Assignment Decision Flow

**When insurer needs to assign an assessor:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    ASSIGNMENT DECISION FLOW                      │
└─────────────────────────────────────────────────────────────────┘

1. INSURER TRIGGERS ASSIGNMENT
   └── Insurer clicks "Assign Assessor" on claim

2. SYSTEM PRESENTS OPTIONS
   ├── Tab 1: "My Assessors" (insurer-owned + hybrid)
   │   ├── Shows insurer's own assessors
   │   ├── Filtered by availability, region, specialization
   │   ├── Shows current workload and performance score
   │   └── No commission indicator
   │
   └── Tab 2: "Marketplace" (marketplace + hybrid from other insurers)
       ├── Shows all marketplace assessors matching criteria
       ├── Filtered by region, specialization, rating, price
       ├── Shows hourly rate and commission
       └── Shows reviews and performance metrics

3. INSURER SELECTS ASSESSOR
   ├── Option A: Select from "My Assessors"
   │   └── Direct assignment (no commission)
   │
   └── Option B: Select from "Marketplace"
       ├── System shows total cost (assessment fee + commission)
       └── Insurer confirms marketplace hire

4. ASSIGNMENT CREATION
   ├── System creates assessor_claim_assignment record
   ├── assignment_type = 'direct' OR 'marketplace'
   ├── If marketplace: Creates marketplace_transaction record
   └── Sends notification to assessor

5. ASSESSOR RESPONSE
   ├── Insurer-owned: Auto-accepted (employment obligation)
   ├── Marketplace: Assessor can accept/reject within 2 hours
   └── If rejected: System suggests alternative assessors
```

### 3.2 Assignment Type Comparison

| Attribute | Insurer-Owned Assignment | Marketplace Assignment |
|-----------|-------------------------|------------------------|
| **Cost to Insurer** | Fixed salary (already paid) | Per-assessment fee + 15-20% commission |
| **Assessor Response** | Auto-accepted | Must accept within 2 hours |
| **Assignment Priority** | High (employment obligation) | Medium (can reject if busy) |
| **Performance Tracking** | Internal metrics only | Public ratings + internal metrics |
| **Conflict of Interest** | None (exclusive to insurer) | Managed (cannot work for competitors) |
| **Capacity Management** | Insurer manages workload | Assessor manages own capacity |

### 3.3 Enhanced Assignment Schema

```sql
-- Extend assessor_claim_assignments table
ALTER TABLE assessor_claim_assignments ADD COLUMN assignment_type ENUM('direct', 'marketplace') NOT NULL DEFAULT 'direct';
ALTER TABLE assessor_claim_assignments ADD COLUMN marketplace_transaction_id VARCHAR(36) NULL;
ALTER TABLE assessor_claim_assignments ADD COLUMN assessment_fee DECIMAL(10,2) NULL; -- For marketplace assignments
ALTER TABLE assessor_claim_assignments ADD COLUMN rejection_reason TEXT NULL; -- If marketplace assessor rejects

-- Add foreign key for marketplace transactions
ALTER TABLE assessor_claim_assignments ADD CONSTRAINT fk_marketplace_transaction 
  FOREIGN KEY (marketplace_transaction_id) REFERENCES marketplace_transactions(id) ON DELETE SET NULL;
```

---

## 4. Marketplace Discovery & Search

### 4.1 Marketplace Search Interface

**Insurer Search Criteria:**

```typescript
interface MarketplaceSearchFilters {
  // Geographic filters
  serviceRegion?: string; // "Harare", "Bulawayo", etc.
  maxTravelDistance?: number; // km from claim location
  
  // Specialization filters
  specializations?: string[]; // ["vehicle", "heavy_equipment"]
  certifications?: string[]; // ["IICRC", "ASE"]
  certificationLevel?: 'junior' | 'senior' | 'expert' | 'master';
  
  // Performance filters
  minPerformanceScore?: number; // 0-100
  minAverageRating?: number; // 0-5
  minAssessmentsCompleted?: number;
  
  // Availability filters
  availability?: 'full_time' | 'part_time' | 'weekends_only' | 'on_demand';
  availableWithinHours?: number; // Can start within X hours
  
  // Pricing filters
  maxHourlyRate?: number;
  maxAssessmentFee?: number;
  
  // Sort options
  sortBy?: 'rating' | 'price' | 'performance' | 'experience' | 'availability';
  sortOrder?: 'asc' | 'desc';
}
```

**Search Algorithm:**

```typescript
async function searchMarketplaceAssessors(
  filters: MarketplaceSearchFilters,
  claimLocation: { lat: number; lng: number }
) {
  let query = db.select().from(assessors)
    .where(
      and(
        eq(assessors.marketplace_enabled, true),
        eq(assessors.marketplace_status, 'active'),
        eq(assessors.active_status, true)
      )
    );

  // Geographic filtering
  if (filters.serviceRegion) {
    query = query.where(
      sql`JSON_CONTAINS(service_regions, '"${filters.serviceRegion}"')`
    );
  }

  // Specialization filtering
  if (filters.specializations) {
    query = query.where(
      sql`JSON_OVERLAPS(specializations, '${JSON.stringify(filters.specializations)}')`
    );
  }

  // Performance filtering
  if (filters.minPerformanceScore) {
    query = query.where(gte(assessors.performance_score, filters.minPerformanceScore));
  }

  if (filters.minAverageRating) {
    query = query.where(gte(assessors.average_rating, filters.minAverageRating));
  }

  // Pricing filtering
  if (filters.maxHourlyRate) {
    query = query.where(lte(assessors.marketplace_hourly_rate, filters.maxHourlyRate));
  }

  // Sorting
  switch (filters.sortBy) {
    case 'rating':
      query = query.orderBy(desc(assessors.average_rating));
      break;
    case 'price':
      query = query.orderBy(asc(assessors.marketplace_hourly_rate));
      break;
    case 'performance':
      query = query.orderBy(desc(assessors.performance_score));
      break;
    case 'experience':
      query = query.orderBy(desc(assessors.years_of_experience));
      break;
  }

  const results = await query;

  // Calculate distance and filter by travel distance
  const resultsWithDistance = results.map(assessor => ({
    ...assessor,
    distanceKm: calculateDistance(claimLocation, assessor.serviceRegion)
  })).filter(a => a.distanceKm <= (filters.maxTravelDistance || a.max_travel_distance_km));

  return resultsWithDistance;
}
```

### 4.2 Assessor Profile Display

**Public Marketplace Profile:**

```typescript
interface MarketplaceAssessorProfile {
  // Basic info
  id: string;
  name: string;
  profilePhoto: string;
  bio: string;
  
  // Credentials
  professionalLicenseNumber: string; // Partially masked (e.g., "ABC***789")
  certifications: string[];
  certificationLevel: string;
  yearsOfExperience: number;
  
  // Performance metrics
  performanceScore: number; // 0-100
  averageRating: number; // 0-5
  totalRatingsCount: number;
  totalAssessmentsCompleted: number;
  averageTurnaroundHours: number;
  
  // Specializations
  specializations: string[];
  serviceRegions: string[];
  maxTravelDistanceKm: number;
  
  // Pricing
  hourlyRate: number;
  availability: string;
  
  // Reviews (top 5 most recent)
  recentReviews: {
    rating: number;
    reviewText: string;
    insurerName: string; // Anonymized (e.g., "Large Insurer in Harare")
    createdAt: Date;
  }[];
  
  // Badges (earned achievements)
  badges: string[]; // ["Top Performer", "Fast Responder", "5-Star Rated"]
}
```

---

## 5. Rating & Review System

### 5.1 Review Submission Workflow

**Trigger:** Assessor completes assessment and submits report

**Workflow:**

```
1. ASSESSMENT COMPLETION
   └── Assessor submits final assessment report

2. REVIEW REQUEST
   ├── System sends review request to insurer (24 hours after submission)
   └── Email + in-app notification

3. INSURER SUBMITS REVIEW
   ├── Insurer rates assessor (1-5 stars) across dimensions:
   │   ├── Overall rating
   │   ├── Accuracy (compared to AI baseline)
   │   ├── Professionalism
   │   ├── Timeliness
   │   └── Communication
   ├── Insurer writes review text (optional)
   └── Insurer answers: "Would you hire this assessor again?" (Yes/No)

4. REVIEW PUBLICATION
   ├── System stores review in assessor_marketplace_reviews
   ├── System recalculates assessor's average_rating
   ├── System updates assessor's total_ratings_count
   └── Review appears on assessor's marketplace profile

5. ASSESSOR NOTIFICATION
   └── Assessor receives notification of new review
```

### 5.2 Rating Calculation

**Weighted Average Rating:**

```typescript
function calculateAssessorRating(assessorId: string) {
  // Fetch all reviews
  const reviews = await db.query(
    `SELECT * FROM assessor_marketplace_reviews WHERE assessor_id = ?`,
    [assessorId]
  );

  // Calculate weighted average (more recent reviews weighted higher)
  const now = Date.now();
  const weights = reviews.map(r => {
    const ageInDays = (now - r.created_at.getTime()) / (1000 * 60 * 60 * 24);
    return Math.exp(-ageInDays / 180); // Exponential decay over 180 days
  });

  const weightedSum = reviews.reduce((sum, r, i) => sum + r.overall_rating * weights[i], 0);
  const weightSum = weights.reduce((sum, w) => sum + w, 0);

  const averageRating = weightedSum / weightSum;

  // Update assessor profile
  await db.update('assessors', assessorId, {
    average_rating: averageRating,
    total_ratings_count: reviews.length
  });

  return averageRating;
}
```

### 5.3 Badge System

**Earned Badges:**

| Badge | Criteria | Icon |
|-------|----------|------|
| **Top Performer** | Performance score ≥ 90 | 🏆 |
| **5-Star Rated** | Average rating ≥ 4.8 | ⭐ |
| **Fast Responder** | Average turnaround ≤ 24 hours | ⚡ |
| **Veteran Assessor** | 500+ assessments completed | 🎖️ |
| **Specialist** | 100+ assessments in niche category | 🔧 |
| **Preferred Vendor** | Marked as preferred by 3+ insurers | 💎 |

---

## 6. Revenue Models

### 6.1 KINGA Revenue Streams

| Revenue Stream | Model | Rate | Applicability |
|----------------|-------|------|---------------|
| **SaaS Subscription** | Monthly per-tenant fee | $500-$5,000/month | All insurers (includes insurer-owned assessors) |
| **Marketplace Commission** | Percentage of assessment fee | 15-20% | Marketplace assignments only |
| **Premium Assessor Listing** | Monthly fee for featured placement | $100-$500/month | Marketplace assessors (optional) |
| **Background Check Fee** | One-time per assessor | $50 | Marketplace assessor onboarding |
| **Data Analytics** | Add-on module | $200-$1,000/month | Insurers (optional) |

### 6.2 Commission Structure

**Tiered Commission Rates:**

| Assessment Fee | KINGA Commission | Assessor Payout |
|----------------|------------------|-----------------|
| $0 - $100 | 20% | 80% |
| $101 - $300 | 18% | 82% |
| $301 - $500 | 15% | 85% |
| $500+ | 12% | 88% |

**Example Transaction:**

```
Claim: Vehicle damage assessment
Assessor: Marketplace assessor (John Doe)
Assessment Fee: $250
Commission Rate: 18%

Breakdown:
- Total charged to insurer: $250.00
- KINGA commission (18%): $45.00
- Assessor payout (82%): $205.00

Transaction record:
{
  assessment_fee: 250.00,
  kinga_commission: 45.00,
  assessor_payout: 205.00,
  commission_rate: 18.00
}
```

### 6.3 Assessor Payout System

**Payout Schedule:**

- **Frequency:** Weekly (every Friday)
- **Minimum payout:** $50 (pending balance must exceed $50)
- **Payment methods:** Bank transfer, mobile money, Stripe
- **Processing time:** 3-5 business days

**Payout Workflow:**

```typescript
// Weekly payout cron job (runs every Friday)
async function processWeeklyPayouts() {
  // Fetch all marketplace assessors with pending balance ≥ $50
  const assessors = await db.query(
    `SELECT * FROM assessors 
     WHERE marketplace_enabled = TRUE 
     AND pending_payout >= 50.00`
  );

  for (const assessor of assessors) {
    // Fetch completed transactions not yet paid out
    const transactions = await db.query(
      `SELECT * FROM marketplace_transactions 
       WHERE assessor_id = ? 
       AND transaction_status = 'completed'`,
      [assessor.id]
    );

    const totalPayout = transactions.reduce((sum, t) => sum + t.assessor_payout, 0);

    // Initiate payout via payment provider
    const payoutResult = await initiatePayment({
      assessorId: assessor.id,
      amount: totalPayout,
      method: assessor.preferred_payment_method
    });

    if (payoutResult.success) {
      // Update transactions
      for (const transaction of transactions) {
        await db.update('marketplace_transactions', transaction.id, {
          transaction_status: 'paid_out',
          paid_out_at: new Date(),
          payment_reference: payoutResult.referenceNumber
        });
      }

      // Update assessor profile
      await db.update('assessors', assessor.id, {
        total_marketplace_earnings: assessor.total_marketplace_earnings + totalPayout,
        pending_payout: 0,
        last_payout_date: new Date()
      });

      // Send payout confirmation email
      await sendPayoutConfirmation(assessor, totalPayout, payoutResult.referenceNumber);
    }
  }
}
```

---

## 7. Performance Tracking Framework

### 7.1 Unified Performance Metrics

**All assessors (insurer-owned and marketplace) tracked on same metrics:**

| Metric | Description | Calculation | Target |
|--------|-------------|-------------|--------|
| **Performance Score** | Overall quality score | Weighted average of accuracy, timeliness, professionalism | ≥ 80 |
| **Accuracy Score** | Alignment with AI baseline and final approved cost | `100 - abs((assessor_cost - final_cost) / final_cost * 100)` | ≥ 85 |
| **Turnaround Time** | Hours from assignment to submission | Average across all assessments | ≤ 48 hours |
| **Acceptance Rate** | Percentage of assignments accepted (marketplace only) | `accepted / (accepted + rejected) * 100` | ≥ 90% |
| **Completion Rate** | Percentage of accepted assignments completed | `completed / accepted * 100` | ≥ 95% |
| **Customer Rating** | Average insurer rating | Weighted average of all reviews | ≥ 4.0 |

### 7.2 Performance Dashboard (Assessor View)

**Assessor Performance Dashboard:**

```typescript
interface AssessorPerformanceDashboard {
  // Overview KPIs
  performanceScore: number; // 0-100
  performanceScoreTrend: 'up' | 'down' | 'stable';
  averageRating: number; // 0-5
  totalAssessmentsCompleted: number;
  
  // Detailed metrics
  accuracyScore: number;
  averageTurnaroundHours: number;
  acceptanceRate: number; // Marketplace only
  completionRate: number;
  
  // Earnings (marketplace/hybrid only)
  totalMarketplaceEarnings: number;
  pendingPayout: number;
  lastPayoutDate: Date;
  thisMonthEarnings: number;
  
  // Recent activity
  recentAssignments: {
    claimId: string;
    insurerName: string; // Anonymized for marketplace
    status: string;
    submittedAt: Date;
    rating?: number;
  }[];
  
  // Performance trends (last 12 months)
  monthlyPerformance: {
    month: string;
    assessmentsCompleted: number;
    averageRating: number;
    earnings: number;
  }[];
  
  // Badges and achievements
  badges: string[];
  nextBadge: {
    name: string;
    progress: number; // 0-100
    requirement: string;
  };
}
```

### 7.3 Performance Alerts

**Automated Performance Monitoring:**

```typescript
// Daily performance check (cron job)
async function monitorAssessorPerformance() {
  const assessors = await db.query(`SELECT * FROM assessors WHERE active_status = TRUE`);

  for (const assessor of assessors) {
    const metrics = await calculatePerformanceMetrics(assessor.id);

    // Alert 1: Performance score dropping
    if (metrics.performanceScore < 70 && metrics.performanceScoreTrend === 'down') {
      await sendAlert({
        recipientId: assessor.user_id,
        type: 'performance_warning',
        title: 'Performance Score Alert',
        message: `Your performance score has dropped to ${metrics.performanceScore}. Review recent feedback to improve.`
      });
    }

    // Alert 2: Low acceptance rate (marketplace assessors)
    if (assessor.marketplace_enabled && metrics.acceptanceRate < 80) {
      await sendAlert({
        recipientId: assessor.user_id,
        type: 'acceptance_rate_warning',
        title: 'Low Acceptance Rate',
        message: `Your acceptance rate is ${metrics.acceptanceRate}%. Consider adjusting your availability or service regions.`
      });
    }

    // Alert 3: Pending payout available
    if (assessor.pending_payout >= 50) {
      await sendAlert({
        recipientId: assessor.user_id,
        type: 'payout_available',
        title: 'Payout Available',
        message: `You have $${assessor.pending_payout} pending payout. Payment will be processed on Friday.`
      });
    }

    // Alert 4: License/insurance expiring
    const daysUntilExpiry = daysBetween(new Date(), assessor.license_expiry_date);
    if (daysUntilExpiry <= 30) {
      await sendAlert({
        recipientId: assessor.user_id,
        type: 'license_expiry_warning',
        title: 'License Expiring Soon',
        message: `Your professional license expires in ${daysUntilExpiry} days. Please renew to avoid account suspension.`
      });
    }
  }
}
```

---

## 8. Quality Assurance & Compliance

### 8.1 Marketplace Assessor Vetting

**KINGA Vetting Process:**

| Step | Check | Verification Method | Pass Criteria |
|------|-------|---------------------|---------------|
| 1 | Professional License | API check against national registry | Valid, not suspended |
| 2 | Professional Insurance | Document upload + expiry check | Valid, coverage ≥ $1M |
| 3 | Certifications | Document upload + issuer verification | Valid, recognized certifications |
| 4 | Background Check | Third-party service (e.g., Checkr) | No fraud/criminal record |
| 5 | Sample Assessment | Test claim assessment | Accuracy ≥ 80% vs AI baseline |
| 6 | Interview | Video call with KINGA compliance team | Professionalism, communication skills |

**Ongoing Compliance Monitoring:**

```typescript
// Monthly compliance check (cron job)
async function monitorAssessorCompliance() {
  const assessors = await db.query(
    `SELECT * FROM assessors WHERE marketplace_enabled = TRUE`
  );

  for (const assessor of assessors) {
    const issues = [];

    // Check license expiry
    if (assessor.license_expiry_date < addDays(new Date(), 30)) {
      issues.push('License expiring within 30 days');
    }

    // Check insurance expiry
    if (assessor.insurance_expiry_date < addDays(new Date(), 30)) {
      issues.push('Insurance expiring within 30 days');
    }

    // Check performance score
    if (assessor.performance_score < 60) {
      issues.push('Performance score below minimum threshold (60)');
    }

    // Check complaint rate
    const complaints = await getAssessorComplaints(assessor.id);
    if (complaints.length > 3) {
      issues.push(`${complaints.length} unresolved complaints`);
    }

    // Suspend if critical issues
    if (issues.length > 0) {
      await db.update('assessors', assessor.id, {
        marketplace_status: 'suspended'
      });

      await sendAlert({
        recipientId: assessor.user_id,
        type: 'account_suspended',
        title: 'Account Suspended',
        message: `Your marketplace account has been suspended due to: ${issues.join(', ')}. Please contact support.`
      });
    }
  }
}
```

### 8.2 Conflict of Interest Management

**Conflict Rules:**

1. **Insurer-Owned Assessors:** Cannot accept marketplace assignments from competing insurers
2. **Marketplace Assessors:** Can work with any insurer (no conflicts)
3. **Hybrid Assessors:** Cannot accept marketplace assignments from insurers competing with primary employer

**Conflict Detection:**

```typescript
async function checkConflictOfInterest(
  assessorId: string,
  tenantId: string
) {
  const assessor = await db.query(
    `SELECT * FROM assessors WHERE id = ?`,
    [assessorId]
  );

  // No conflict for pure marketplace assessors
  if (assessor.assessor_type === 'marketplace') {
    return { hasConflict: false };
  }

  // Check if tenant is primary employer
  if (assessor.primary_tenant_id === tenantId) {
    return { hasConflict: false };
  }

  // Check if tenant is competitor of primary employer
  const primaryTenant = await db.query(
    `SELECT * FROM tenants WHERE id = ?`,
    [assessor.primary_tenant_id]
  );

  const requestingTenant = await db.query(
    `SELECT * FROM tenants WHERE id = ?`,
    [tenantId]
  );

  // Simple conflict check: same industry + same region
  if (
    primaryTenant.industry === requestingTenant.industry &&
    primaryTenant.primary_region === requestingTenant.primary_region
  ) {
    return {
      hasConflict: true,
      reason: 'Assessor works for competing insurer in same region'
    };
  }

  return { hasConflict: false };
}
```

---

## 9. Marketplace Analytics Dashboards

### 9.1 Insurer Marketplace Analytics

**Dashboard for insurers to track marketplace usage:**

```typescript
interface InsurerMarketplaceAnalytics {
  // Cost analysis
  totalMarketplaceSpend: number;
  averageCostPerAssessment: number;
  marketplaceVsInternalCostComparison: {
    marketplace: number;
    internal: number;
    savings: number; // Negative if marketplace more expensive
  };
  
  // Usage patterns
  totalMarketplaceAssignments: number;
  marketplaceAssignmentsPercentage: number; // % of total assignments
  topMarketplaceAssessors: {
    assessorName: string;
    assignmentsCount: number;
    averageRating: number;
    totalSpend: number;
  }[];
  
  // Performance comparison
  marketplaceVsInternalPerformance: {
    marketplace: {
      averageAccuracy: number;
      averageTurnaround: number;
      averageRating: number;
    };
    internal: {
      averageAccuracy: number;
      averageTurnaround: number;
      averageRating: number;
    };
  };
  
  // Trends
  monthlyMarketplaceUsage: {
    month: string;
    assignmentsCount: number;
    totalSpend: number;
    averageRating: number;
  }[];
}
```

### 9.2 Assessor Earnings Dashboard

**Dashboard for marketplace assessors to track earnings:**

```typescript
interface AssessorEarningsDashboard {
  // Current balance
  pendingPayout: number;
  nextPayoutDate: Date;
  totalLifetimeEarnings: number;
  
  // This month
  thisMonthEarnings: number;
  thisMonthAssignments: number;
  thisMonthAverageRating: number;
  
  // Earnings breakdown
  earningsByInsurer: {
    insurerName: string; // Anonymized
    assignmentsCount: number;
    totalEarnings: number;
    averageRating: number;
  }[];
  
  // Earnings trends
  monthlyEarnings: {
    month: string;
    totalEarnings: number;
    assignmentsCount: number;
    averageEarningsPerAssessment: number;
  }[];
  
  // Payout history
  recentPayouts: {
    payoutDate: Date;
    amount: number;
    paymentMethod: string;
    referenceNumber: string;
  }[];
}
```

---

## 10. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)

**Deliverables:**
- ✅ Database schema for hybrid assessor ecosystem
- ✅ Assessor classification system (insurer-owned, marketplace, hybrid)
- ✅ Basic onboarding workflows for both types
- ✅ Unified assignment workflow

**Tasks:**
1. Create database tables (assessors, relationships, reviews, transactions)
2. Implement assessor type classification logic
3. Build insurer-owned assessor onboarding UI
4. Build marketplace assessor registration UI
5. Create unified assignment interface with tabs

### Phase 2: Marketplace Core (Weeks 5-8)

**Deliverables:**
- ✅ Marketplace search and discovery
- ✅ Assessor public profiles
- ✅ Marketplace assignment workflow
- ✅ Commission calculation and tracking

**Tasks:**
1. Build marketplace search API with filters
2. Create assessor public profile pages
3. Implement marketplace assignment acceptance/rejection
4. Build commission calculation logic
5. Create marketplace transaction tracking

### Phase 3: Ratings & Reviews (Weeks 9-10)

**Deliverables:**
- ✅ Rating and review system
- ✅ Badge system
- ✅ Performance score calculation
- ✅ Review moderation

**Tasks:**
1. Build review submission UI
2. Implement rating calculation algorithm
3. Create badge earning logic
4. Build review moderation dashboard

### Phase 4: Payments & Payouts (Weeks 11-12)

**Deliverables:**
- ✅ Payout system for marketplace assessors
- ✅ Payment method integration (Stripe, bank transfer)
- ✅ Earnings dashboard
- ✅ Payout history tracking

**Tasks:**
1. Integrate payment provider (Stripe)
2. Build weekly payout cron job
3. Create assessor earnings dashboard
4. Implement payout notifications

### Phase 5: Analytics & Optimization (Weeks 13-14)

**Deliverables:**
- ✅ Insurer marketplace analytics dashboard
- ✅ Assessor performance dashboards
- ✅ Cost comparison analytics
- ✅ Usage trend reports

**Tasks:**
1. Build insurer marketplace analytics API
2. Create assessor performance dashboard
3. Implement cost comparison calculations
4. Build trend visualization charts

### Phase 6: Quality & Compliance (Weeks 15-16)

**Deliverables:**
- ✅ Assessor vetting workflow
- ✅ Compliance monitoring system
- ✅ Conflict of interest detection
- ✅ Performance alerts

**Tasks:**
1. Build assessor vetting UI for KINGA admin
2. Implement background check integration
3. Create compliance monitoring cron jobs
4. Build conflict detection logic
5. Implement performance alert system

---

## 11. Business Model Analysis

### 11.1 Revenue Projections

**Scenario: 100 Insurers on Platform**

| Metric | Insurer-Owned Model | Marketplace Model | Hybrid Model (50/50) |
|--------|---------------------|-------------------|----------------------|
| **Insurers** | 100 | 100 | 100 |
| **Avg Claims/Month/Insurer** | 200 | 200 | 200 |
| **Total Claims/Month** | 20,000 | 20,000 | 20,000 |
| **Marketplace Claims** | 0 | 20,000 | 10,000 |
| **Avg Assessment Fee** | N/A | $250 | $250 |
| **Commission Rate** | N/A | 18% | 18% |
| **Monthly Marketplace Revenue** | $0 | $900,000 | $450,000 |
| **Monthly SaaS Revenue** | $250,000 | $250,000 | $250,000 |
| **Total Monthly Revenue** | $250,000 | $1,150,000 | $700,000 |
| **Annual Revenue** | $3M | $13.8M | $8.4M |

**Key Insight:** Hybrid model provides **2.8x revenue** compared to pure SaaS model.

### 11.2 Competitive Advantages

**KINGA Hybrid Model vs Competitors:**

| Feature | KINGA (Hybrid) | Competitor A (Forced Marketplace) | Competitor B (BYOA Only) |
|---------|----------------|-----------------------------------|--------------------------|
| **Insurer Flexibility** | ✅ Use own or marketplace | ❌ Must use marketplace | ✅ Use own only |
| **Onboarding Friction** | ✅ Low (no forced change) | ❌ High (must switch) | ✅ Low |
| **Revenue Potential** | ✅ High (SaaS + commission) | ✅ High (commission only) | ❌ Low (SaaS only) |
| **Network Effects** | ✅ Strong (marketplace grows) | ✅ Strong | ❌ None |
| **Assessor Quality** | ✅ Vetted + internal | ⚠️ Vetted only | ⚠️ Unvetted |
| **Cost Transparency** | ✅ Full comparison | ⚠️ Marketplace only | ✅ Internal only |

---

## 12. Conclusion

The **KINGA Hybrid Assessor Ecosystem** provides a strategic competitive advantage by supporting **both insurer-owned assessors and a marketplace network**. This dual-model approach:

1. **Reduces onboarding friction** — Insurers can start with their existing assessors
2. **Maximizes revenue potential** — SaaS subscriptions + marketplace commissions
3. **Enables network effects** — Marketplace grows as more insurers join
4. **Provides flexibility** — Insurers choose the model that fits their needs
5. **Maintains quality** — Unified performance tracking across all assessor types

By implementing this architecture, KINGA positions itself as the **most flexible and insurer-friendly** claims management platform in the market.

---

**Document Control:**
- **Next Review Date:** March 11, 2026
- **Approval Required From:** CEO, CTO, Head of Product
- **Related Documents:** 
  - KINGA-AIA-2026-013 (Assessor Integration Architecture)
  - KINGA-HMSAA-2026-012 (Hierarchical Multi-Stakeholder Access Architecture)
  - KINGA-MTDA-2026-008 (Multi-Tenant Dashboard Architecture)

---

*End of Document*
