# Routing Badges & Override Flags Integration Guide

This document provides examples of how to integrate the new **RoutingBadge** and **ExecutiveOverrideFlag** components into claim list views and detail pages across all dashboards.

## Components Overview

### 1. RoutingBadge Component

**Location:** `client/src/components/RoutingBadge.tsx`

**Purpose:** Displays AI routing decision with confidence component breakdown in a popover.

**Props:**
- `decision`: `"fast_track" | "manual_review" | "high_risk_escalated"`
- `confidenceComponents` (optional): Object containing:
  - `fraudRiskContribution`: number (0-100)
  - `quoteVarianceContribution`: number (0-100)
  - `claimCompletenessScore`: number (0-100)
  - `historicalPatternImpact`: number (0-100)
- `showPopover`: boolean (default: true)

### 2. ExecutiveOverrideFlag Component

**Location:** `client/src/components/ExecutiveOverrideFlag.tsx`

**Purpose:** Displays executive override badge with details (who, when, why, decision change).

**Props:**
- `overrideInfo`: Object containing:
  - `overriddenBy`: string (Executive name)
  - `overriddenByRole`: string (Executive role)
  - `justification`: string (Override reason)
  - `overriddenAt`: Date | string (Override timestamp)
  - `originalDecision`: string (Original AI decision)
  - `newDecision`: string (New decision after override)
- `showDetails`: boolean (default: true)

---

## Integration Examples

### Example 1: Claims Manager Dashboard - Claim List

**File:** `client/src/pages/ClaimsManagerDashboard.tsx`

```tsx
import { RoutingBadge, type RoutingDecision } from "@/components/RoutingBadge";
import { ExecutiveOverrideFlag } from "@/components/ExecutiveOverrideFlag";

// Inside your claim list mapping
{claims.map((claim) => {
  // Determine routing decision from claim data
  const routingDecision: RoutingDecision = claim.fastTrackEligible 
    ? "fast_track" 
    : claim.fraudRiskLevel === "high" 
    ? "high_risk_escalated" 
    : "manual_review";

  // Extract confidence components from AI assessment
  const confidenceComponents = claim.aiAssessment ? {
    fraudRiskContribution: claim.aiAssessment.fraudRiskScore || 0,
    quoteVarianceContribution: calculateQuoteVariance(claim),
    claimCompletenessScore: claim.aiAssessment.confidenceScore || 0,
    historicalPatternImpact: claim.historicalRiskScore || 0,
  } : undefined;

  return (
    <div key={claim.id} className="flex items-center gap-2">
      <span>{claim.claimNumber}</span>
      
      {/* Routing Badge */}
      <RoutingBadge 
        decision={routingDecision}
        confidenceComponents={confidenceComponents}
      />

      {/* Executive Override Flag (if applicable) */}
      {claim.executiveOverride && (
        <ExecutiveOverrideFlag 
          overrideInfo={{
            overriddenBy: claim.executiveOverride.executiveName,
            overriddenByRole: claim.executiveOverride.executiveRole,
            justification: claim.executiveOverride.justification,
            overriddenAt: claim.executiveOverride.overriddenAt,
            originalDecision: claim.executiveOverride.originalDecision,
            newDecision: claim.executiveOverride.newDecision,
          }}
        />
      )}
    </div>
  );
})}
```

### Example 2: Executive Dashboard - Analytics Tab

**File:** `client/src/pages/ExecutiveDashboard.tsx`

```tsx
import { RoutingBadge } from "@/components/RoutingBadge";

// In analytics section showing recent high-risk claims
{highRiskClaims.map((claim) => (
  <Card key={claim.id}>
    <CardHeader>
      <div className="flex items-center justify-between">
        <CardTitle>{claim.claimNumber}</CardTitle>
        <RoutingBadge 
          decision="high_risk_escalated"
          confidenceComponents={{
            fraudRiskContribution: claim.fraudRiskScore,
            quoteVarianceContribution: claim.quoteVariance,
            claimCompletenessScore: claim.completenessScore,
            historicalPatternImpact: claim.historicalRisk,
          }}
        />
      </div>
    </CardHeader>
  </Card>
))}
```

### Example 3: Claim Detail View - Header Section

**File:** `client/src/pages/ClaimsManagerComparisonView.tsx`

```tsx
import { RoutingBadge } from "@/components/RoutingBadge";
import { ExecutiveOverrideFlag } from "@/components/ExecutiveOverrideFlag";

// In the header section where status badges are displayed
<div className="flex gap-2">
  {user?.role && (
    <Badge variant="outline" className="capitalize">
      {user.role.replace(/_/g, " ")}
    </Badge>
  )}
  {claim.status && (
    <Badge variant="outline">
      {claim.status?.replace(/_/g, " ")?.toUpperCase() || "UNKNOWN"}
    </Badge>
  )}
  
  {/* Routing Badge */}
  <RoutingBadge 
    decision={getRoutingDecision(claim)}
    confidenceComponents={getConfidenceComponents(claim)}
  />

  {/* Executive Override Flag */}
  {claim.executiveOverride && (
    <ExecutiveOverrideFlag 
      overrideInfo={claim.executiveOverride}
    />
  )}
</div>
```

### Example 4: Risk Manager Dashboard - High-Risk Claims

**File:** `client/src/pages/RiskManagerDashboard.tsx`

```tsx
import { RoutingBadge } from "@/components/RoutingBadge";
import { ExecutiveOverrideFlag } from "@/components/ExecutiveOverrideFlag";

// In high-risk claims table
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Claim Number</TableHead>
      <TableHead>Routing Decision</TableHead>
      <TableHead>Override Status</TableHead>
      <TableHead>Actions</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {highRiskClaims.map((claim) => (
      <TableRow key={claim.id}>
        <TableCell>{claim.claimNumber}</TableCell>
        <TableCell>
          <RoutingBadge 
            decision="high_risk_escalated"
            confidenceComponents={{
              fraudRiskContribution: claim.fraudRiskScore,
              quoteVarianceContribution: claim.quoteVariance,
              claimCompletenessScore: claim.completenessScore,
              historicalPatternImpact: claim.historicalRisk,
            }}
          />
        </TableCell>
        <TableCell>
          {claim.executiveOverride ? (
            <ExecutiveOverrideFlag 
              overrideInfo={claim.executiveOverride}
              showDetails={true}
            />
          ) : (
            <span className="text-slate-500 text-sm">No Override</span>
          )}
        </TableCell>
        <TableCell>
          <Button variant="outline" size="sm">View Details</Button>
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

---

## Helper Functions

### Calculate Routing Decision

```tsx
function getRoutingDecision(claim: Claim): RoutingDecision {
  if (claim.aiAssessment?.fastTrackEligible) {
    return "fast_track";
  }
  if (claim.aiAssessment?.fraudRiskLevel === "high") {
    return "high_risk_escalated";
  }
  return "manual_review";
}
```

### Extract Confidence Components

```tsx
function getConfidenceComponents(claim: Claim) {
  if (!claim.aiAssessment) return undefined;

  return {
    fraudRiskContribution: claim.aiAssessment.fraudRiskScore || 0,
    quoteVarianceContribution: calculateQuoteVariance(claim),
    claimCompletenessScore: claim.aiAssessment.confidenceScore || 0,
    historicalPatternImpact: claim.priorClaimsCount ? 
      Math.min(claim.priorClaimsCount * 20, 100) : 0,
  };
}

function calculateQuoteVariance(claim: Claim): number {
  if (!claim.quotes || claim.quotes.length === 0) return 0;
  if (!claim.aiAssessment?.estimatedCost) return 0;

  const avgQuote = claim.quotes.reduce((sum, q) => sum + (q.quotedAmount || 0), 0) / claim.quotes.length;
  const aiEstimate = claim.aiAssessment.estimatedCost;
  const variance = Math.abs((avgQuote - aiEstimate) / aiEstimate) * 100;

  return Math.min(variance, 100);
}
```

---

## Data Requirements

### Backend Data Structure

To support these components, ensure your tRPC endpoints return claims with the following structure:

```typescript
interface Claim {
  id: number;
  claimNumber: string;
  status: string;
  
  // AI Assessment data
  aiAssessment?: {
    fastTrackEligible: boolean;
    fraudRiskLevel: "low" | "medium" | "high";
    fraudRiskScore: number; // 0-100
    confidenceScore: number; // 0-100
    estimatedCost: number; // in cents
  };

  // Quote data for variance calculation
  quotes?: Array<{
    id: number;
    quotedAmount: number; // in cents
  }>;

  // Historical data
  priorClaimsCount?: number;

  // Executive override data (if applicable)
  executiveOverride?: {
    executiveName: string;
    executiveRole: string;
    justification: string;
    overriddenAt: Date | string;
    originalDecision: string;
    newDecision: string;
  };
}
```

### Database Schema Considerations

If `executiveOverride` data is not currently stored, consider adding a table:

```sql
CREATE TABLE executive_overrides (
  id INT PRIMARY KEY AUTO_INCREMENT,
  claim_id INT NOT NULL,
  executive_id INT NOT NULL,
  executive_name VARCHAR(255),
  executive_role VARCHAR(100),
  justification TEXT,
  original_decision VARCHAR(100),
  new_decision VARCHAR(100),
  overridden_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (claim_id) REFERENCES claims(id)
);
```

---

## Best Practices

1. **Always provide confidence components** when available for maximum transparency
2. **Show override flags prominently** in both list and detail views for audit compliance
3. **Use consistent routing decision logic** across all dashboards (use helper functions)
4. **Handle missing data gracefully** - components support optional props
5. **Test popover interactions** on mobile devices for touch-friendly UX
6. **Maintain read-only override information** - never allow editing of historical overrides

---

## Testing Checklist

- [ ] Routing badges display correctly in all three states (fast-track, manual review, high-risk)
- [ ] Confidence popover shows all four components with correct percentages
- [ ] Executive override flag displays when override data is present
- [ ] Override popover shows complete information (who, when, why, decision change)
- [ ] Badges are clickable and popovers open correctly
- [ ] Popovers close when clicking outside
- [ ] Components work on mobile/tablet viewports
- [ ] No backend modifications to scoring logic, thresholds, or governance engine
- [ ] All dashboards (Claims Manager, Executive, Risk Manager) integrate badges correctly

---

## Support

For questions or issues with integration, refer to:
- Component source code: `client/src/components/RoutingBadge.tsx` and `ExecutiveOverrideFlag.tsx`
- shadcn/ui documentation: https://ui.shadcn.com/docs/components/popover
- tRPC query patterns: `client/src/lib/trpc.ts`
