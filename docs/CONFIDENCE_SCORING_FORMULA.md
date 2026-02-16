# Confidence Scoring Formula Documentation

## Overview

The KINGA confidence scoring system calculates a normalized score (0-100) for each insurance claim to determine the optimal routing path. The score combines multiple risk factors with scientifically-weighted components to provide an objective assessment of claim confidence.

## Formula Components

The confidence score is calculated as a weighted sum of five independent component scores:

```
ConfidenceScore = (FraudRisk × 0.30) + (AICertainty × 0.25) + (QuoteVariance × 0.20) + 
                  (ClaimCompleteness × 0.15) + (HistoricalRisk × 0.10)
```

### Component Weights

| Component | Weight | Rationale |
|-----------|--------|-----------|
| Fraud Risk Score | 30% | Fraud detection is the highest priority risk factor |
| AI Certainty | 25% | AI model confidence directly impacts automation viability |
| Quote Variance | 20% | Large discrepancies indicate potential issues |
| Claim Completeness | 15% | Incomplete claims require additional scrutiny |
| Historical Claimant Risk | 10% | Past behavior is a moderate predictor |

**Total Weight:** 100% (1.0)

---

## Component Calculations

### 1. Fraud Risk Score (0-100)

**Higher score = Lower fraud risk**

Factors considered:
- **Claim amount relative to policy limits** (-20 points if >$100k, additional -20 if >$500k)
- **Time since incident** (-15 points for same-day claims, -10 points if >90 days delayed)
- **Previous claim frequency** (-15 points if >2 prior claims, additional -15 if >5 prior claims)

```typescript
fraudRiskScore = 100 - penalties
```

**Example:**
- Claim amount: $150,000 → -20 points
- Reported same day → -15 points
- 3 previous claims → -15 points
- **Final Score: 50/100**

---

### 2. AI Damage Detection Certainty (0-100)

**Higher score = Higher AI confidence**

Uses the AI assessment model's confidence score directly. If no AI assessment exists, score defaults to 0.

```typescript
aiCertainty = aiAssessment.confidence || 0
```

**Example:**
- AI model confidence: 87%
- **Final Score: 87/100**

---

### 3. Quote Variance Score (0-100)

**Higher score = Lower variance between AI estimate and submitted quote**

Calculates the percentage difference between AI-estimated cost and claimant-submitted amount:

```typescript
variance = |aiEstimate - claimAmount| / claimAmount

if variance ≤ 5%:  score = 100
if variance ≤ 10%: score = 90
if variance ≤ 20%: score = 75
if variance ≤ 30%: score = 60
if variance ≤ 50%: score = 40
if variance > 50%:  score = 20
```

**Example:**
- AI estimate: $12,000
- Claim amount: $15,000
- Variance: 20%
- **Final Score: 75/100**

---

### 4. Claim Completeness Score (0-100)

**Higher score = More complete claim documentation**

Percentage of required fields that are filled:

Required fields:
1. Claim number
2. Policy number
3. Claimant name
4. Incident date
5. Claim amount
6. Incident description

```typescript
claimCompleteness = (filledFields / totalRequiredFields) × 100
```

**Example:**
- 5 out of 6 fields filled
- **Final Score: 83/100**

---

### 5. Historical Claimant Risk Score (0-100)

**Higher score = Lower historical risk**

Analyzes past claim patterns for the same claimant:

- **Number of previous claims** (-20 points if >2, additional -20 if >5)
- **Claim frequency** (-20 points if >2 claims/year, additional -20 if >4 claims/year)
- **Rejected/disputed claims** (-15 points if any, additional -15 if >2)

```typescript
historicalRisk = 100 - penalties
```

**Example:**
- 3 previous claims → -20 points
- 1.5 claims per year → 0 points
- 1 rejected claim → -15 points
- **Final Score: 65/100**

---

## Routing Categories

Based on the final confidence score, claims are categorized into three routing paths:

### HIGH Confidence (≥ 75 by default)

- **Recommended Path:** AI-only fast-track (if tenant enabled) or expedited internal review
- **External Assessment Required:** No
- **Eligible for Fast-Track:** Yes (if tenant configuration allows)

**Characteristics:**
- Low fraud risk
- High AI certainty
- Minimal quote variance
- Complete documentation
- Clean claimant history

---

### MEDIUM Confidence (50-74 by default)

- **Recommended Path:** Internal assessor review required
- **External Assessment Required:** No
- **Eligible for Fast-Track:** No

**Characteristics:**
- Moderate risk factors
- Acceptable AI confidence
- Some documentation gaps
- Requires human judgment

---

### LOW Confidence (< 50 by default)

- **Recommended Path:** Mandatory external independent assessment
- **External Assessment Required:** Yes
- **Eligible for Fast-Track:** No

**Characteristics:**
- High fraud risk indicators
- Low AI certainty or high variance
- Incomplete documentation
- Concerning claimant history

---

## Tenant-Configurable Thresholds

Tenants can customize routing thresholds to match their risk appetite:

```typescript
interface RoutingThresholds {
  highConfidenceThreshold: number;   // Default: 75
  mediumConfidenceThreshold: number;  // Default: 50
  aiFastTrackEnabled: boolean;        // Default: false
}
```

**Validation Rules:**
- `highConfidenceThreshold` must be > `mediumConfidenceThreshold`
- Both thresholds must be between 0 and 100
- Thresholds are tenant-isolated (no cross-tenant access)

---

## Example Scenarios

### Scenario 1: High-Confidence Claim

**Inputs:**
- Fraud Risk: 90/100 (small claim, reported promptly, first-time claimant)
- AI Certainty: 95/100 (high model confidence)
- Quote Variance: 90/100 (within 10% of AI estimate)
- Claim Completeness: 100/100 (all fields filled)
- Historical Risk: 100/100 (no prior claims)

**Calculation:**
```
Score = (90 × 0.30) + (95 × 0.25) + (90 × 0.20) + (100 × 0.15) + (100 × 0.10)
      = 27 + 23.75 + 18 + 15 + 10
      = 93.75
```

**Result:** HIGH confidence → Eligible for AI fast-track

---

### Scenario 2: Medium-Confidence Claim

**Inputs:**
- Fraud Risk: 70/100 (moderate claim amount, 2 prior claims)
- AI Certainty: 75/100 (acceptable model confidence)
- Quote Variance: 60/100 (30% variance)
- Claim Completeness: 67/100 (4 of 6 fields filled)
- Historical Risk: 80/100 (clean history)

**Calculation:**
```
Score = (70 × 0.30) + (75 × 0.25) + (60 × 0.20) + (67 × 0.15) + (80 × 0.10)
      = 21 + 18.75 + 12 + 10.05 + 8
      = 69.8
```

**Result:** MEDIUM confidence → Internal assessor review required

---

### Scenario 3: Low-Confidence Claim

**Inputs:**
- Fraud Risk: 35/100 (large claim, delayed reporting, 6 prior claims)
- AI Certainty: 40/100 (low model confidence)
- Quote Variance: 20/100 (>50% variance)
- Claim Completeness: 50/100 (3 of 6 fields filled)
- Historical Risk: 45/100 (2 rejected claims, frequent claimant)

**Calculation:**
```
Score = (35 × 0.30) + (40 × 0.25) + (20 × 0.20) + (50 × 0.15) + (45 × 0.10)
      = 10.5 + 10 + 4 + 7.5 + 4.5
      = 36.5
```

**Result:** LOW confidence → Mandatory external assessment

---

## Executive Override

Executives can override routing recommendations with mandatory justification:

```typescript
{
  overridden: true,
  overrideReason: "Additional context from field investigation",
  finalDecision: "Approve via fast-track despite LOW confidence"
}
```

All overrides are logged to the audit trail with:
- Original confidence score and category
- Override reason and final decision
- Executive user ID and timestamp
- Full component breakdown

---

## Audit Logging

Every routing decision is logged with complete transparency:

```typescript
{
  claimId: 12345,
  userId: 789,
  userRole: "executive",
  actionType: "routing_decision",
  metadata: {
    confidenceScore: 93.75,
    routingCategory: "HIGH",
    recommendedPath: "AI-only fast-track approval",
    reasoning: "High confidence score (93.8/100) indicates low risk...",
    components: {
      fraudRiskScore: 90,
      aiCertainty: 95,
      quoteVariance: 90,
      claimCompleteness: 100,
      historicalClaimantRisk: 100
    },
    executiveOverride: null
  },
  timestamp: "2026-02-16T15:30:00Z"
}
```

---

## Best Practices

1. **Review thresholds quarterly** - Adjust based on claim outcomes and tenant risk appetite
2. **Monitor override frequency** - High override rates indicate threshold miscalibration
3. **Validate AI model performance** - Ensure AI certainty scores correlate with actual accuracy
4. **Track routing outcomes** - Measure false positive/negative rates by category
5. **Document threshold changes** - Maintain audit trail of configuration updates

---

## Future Enhancements

Potential improvements to the confidence scoring system:

- **Machine learning-based weights** - Train weights on historical claim outcomes
- **Dynamic threshold adjustment** - Auto-tune thresholds based on performance metrics
- **Additional risk factors** - Incorporate external data sources (credit scores, social media)
- **Real-time model updates** - Continuously improve AI certainty calculations
- **Explainable AI** - Provide detailed reasoning for each component score

---

## Technical Implementation

See `server/services/confidence-scoring.ts` for complete implementation details.

**Key Functions:**
- `calculateConfidenceScore(claimId)` - Main scoring function
- `getRecommendedRoute(claimId, tenantId)` - Routing recommendation
- `determineRoutingCategory(score, thresholds)` - Category determination
- `logRoutingDecision(...)` - Audit trail logging

**Test Coverage:**
- Component score validation
- Threshold boundary conditions
- Tenant isolation
- Executive override scenarios
- Edge cases and error handling

See `server/services/confidence-scoring.test.ts` for complete test suite.
