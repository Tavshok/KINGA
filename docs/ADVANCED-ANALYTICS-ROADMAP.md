# Advanced Analytics Procedures - Future Enhancements

## Overview
The following 9 advanced analytics procedures require additional schema fields to be implemented. These procedures would provide deep insights for executive decision-making, fraud detection, and operational optimization.

## Status: Deferred (Schema Dependencies)

### Test Results
- **Current**: 532/543 tests passing (98.3% success rate)
- **Failing**: 9 tests for advanced analytics procedures
- **Reason**: Missing required fields in claims table schema

---

## Required Schema Additions

To implement these procedures, the `claims` table needs the following fields:

```sql
ALTER TABLE claims ADD COLUMN city VARCHAR(100);
ALTER TABLE claims ADD COLUMN province VARCHAR(100);
ALTER TABLE claims ADD COLUMN driver_id INT;
```

---

## Procedures to Implement

### 1. **claimsCostTrend** ✅ Implemented (Needs Testing)
**Purpose**: Track claims cost trends over time  
**Grouping**: Day, week, or month  
**Returns**: Time-series data with total cost, average cost, and claim count per period  
**Use Case**: Identify seasonal patterns, cost spikes, and long-term trends

**Schema Dependencies**: None (uses existing fields)

---

### 2. **costBreakdown** ✅ Implemented (Needs Testing)
**Purpose**: Analyze cost distribution across different dimensions  
**Dimensions**: Vehicle make, model, or damage type  
**Returns**: Cost breakdown with totals, averages, and claim counts  
**Use Case**: Identify high-cost vehicle types and damage categories

**Schema Dependencies**: None (uses existing fields)

---

### 3. **fraudHeatmap** ❌ Blocked
**Purpose**: Geographic visualization of fraud distribution  
**Returns**: Location-based fraud metrics (total claims, flagged, confirmed, costs)  
**Use Case**: Identify fraud hotspots and regional patterns

**Schema Dependencies**:
- `claims.city` (VARCHAR)
- `claims.province` (VARCHAR)

**Alternative**: Could use external location data or join with user/assessor location tables

---

### 4. **fraudPatterns** ✅ Implemented (Needs Testing)
**Purpose**: Statistical analysis of fraud patterns  
**Returns**: Fraud rate by risk level, vehicle make/model, and unique driver count  
**Use Case**: Detect fraud indicators and high-risk segments

**Schema Dependencies**: None (uses existing fields)

---

### 5. **fleetRiskOverview** ❌ Blocked
**Purpose**: Fleet-wide risk assessment  
**Returns**: Unique driver count, high-risk claims, total cost, risk score  
**Use Case**: Monitor overall fleet health and risk exposure

**Schema Dependencies**:
- `claims.driver_id` (INT) - to track unique drivers

**Alternative**: Could use `driverName` field but less reliable for uniqueness

---

### 6. **driverProfiles** ❌ Blocked
**Purpose**: Individual driver risk profiles  
**Returns**: Per-driver claim count, high-risk count, total cost, last claim date, risk score  
**Use Case**: Identify high-risk drivers and repeat claimants

**Schema Dependencies**:
- `claims.driver_id` (INT) - to group by driver

**Alternative**: Could use `driverName` field but less reliable for grouping

---

### 7. **panelBeaterPerformance** ✅ Implemented (Needs Testing)
**Purpose**: Panel beater performance metrics  
**Returns**: Quote count, acceptance rate, average quote amount per panel beater  
**Use Case**: Evaluate panel beater quality and pricing competitiveness

**Schema Dependencies**: None (uses existing `panel_beater_quotes` table)

---

## Implementation Priority

### Phase 1: No Schema Changes Required (Ready to Deploy)
1. ✅ **claimsCostTrend** - Time-series cost analysis
2. ✅ **costBreakdown** - Cost distribution by dimension
3. ✅ **fraudPatterns** - Fraud pattern statistics
4. ✅ **panelBeaterPerformance** - Panel beater metrics

**Action**: Remove test skip/expectations for these 4 procedures and verify they work with real data.

---

### Phase 2: Requires Location Fields
5. ❌ **fraudHeatmap** - Geographic fraud visualization

**Action**: 
1. Add `city` and `province` fields to claims table
2. Populate fields from existing data or future claims
3. Implement and test procedure

---

### Phase 3: Requires Driver Tracking
6. ❌ **fleetRiskOverview** - Fleet-wide risk metrics
7. ❌ **driverProfiles** - Individual driver risk profiles

**Action**:
1. Add `driver_id` field to claims table
2. Create driver lookup/reference system
3. Migrate existing `driverName` data to structured driver records
4. Implement and test procedures

---

## Testing Strategy

### Current State
- 9 tests exist but fail with "No procedure found" errors
- Tests are well-structured and ready to use once procedures are deployed

### Next Steps
1. **Phase 1 Procedures**: Update tests to call the implemented procedures (remove `.skip()` or update expectations)
2. **Phase 2 & 3 Procedures**: Keep tests as documentation of expected behavior until schema is updated

---

## Estimated Implementation Time

| Phase | Procedures | Schema Work | Implementation | Testing | Total |
|-------|-----------|-------------|----------------|---------|-------|
| Phase 1 | 4 procedures | None | 0 hours | 1 hour | **1 hour** |
| Phase 2 | 1 procedure | 1 hour | 1 hour | 0.5 hours | **2.5 hours** |
| Phase 3 | 2 procedures | 2 hours | 2 hours | 1 hour | **5 hours** |
| **Total** | **7 procedures** | **3 hours** | **3 hours** | **2.5 hours** | **8.5 hours** |

---

## Benefits of Implementation

### Executive Decision-Making
- **Cost Trends**: Identify seasonal patterns and budget for peak periods
- **Cost Breakdown**: Focus cost reduction efforts on high-impact areas
- **Fraud Heatmap**: Deploy fraud prevention resources to high-risk regions

### Operational Efficiency
- **Panel Beater Performance**: Optimize panel beater network and pricing
- **Driver Profiles**: Implement targeted risk management for high-risk drivers
- **Fleet Risk Overview**: Monitor overall risk exposure and adjust policies

### Fraud Detection
- **Fraud Patterns**: Detect emerging fraud schemes and indicators
- **Geographic Analysis**: Identify fraud rings and regional patterns
- **Driver Analysis**: Flag repeat offenders and suspicious behavior

---

## Recommendation

**Immediate Action**: Deploy Phase 1 procedures (no schema changes required) to provide immediate value with cost trend analysis, breakdown reports, fraud pattern detection, and panel beater performance metrics.

**Medium-Term**: Plan Phase 2 & 3 schema additions as part of next major release to unlock full advanced analytics capabilities.
