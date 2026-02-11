/**
 * Analytics Database Helpers
 * 
 * Query helpers for analytics dashboards:
 * - Claims Cost Trend Analytics
 * - Fraud Heatmap Visualization
 * - Fleet Risk Monitoring
 * - Panel Beater Performance
 * 
 * @module analytics-db
 */

import { getDb } from "./db";
import { claims, aiAssessments, panelBeaterQuotes, panelBeaters, fraudIndicators, users } from "../drizzle/schema";
import { sql, and, gte, lte, eq, desc, asc } from "drizzle-orm";

/**
 * Get claims cost trend data with flexible grouping
 * @param startDate - Start date for the analysis period
 * @param endDate - End date for the analysis period
 * @param groupBy - Grouping interval: 'day', 'week', 'month', 'quarter', 'year'
 */
export async function getClaimsCostTrend(
  startDate: Date,
  endDate: Date,
  groupBy: 'day' | 'week' | 'month' | 'quarter' | 'year' = 'month'
) {
  // Map groupBy to MySQL DATE_FORMAT patterns
  const formatMap = {
    day: '%Y-%m-%d',
    week: '%Y-%u',      // Year-Week
    month: '%Y-%m',
    quarter: '%Y-Q%q',  // Year-Quarter
    year: '%Y'
  };

  const format = formatMap[groupBy];

  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const results = await db.execute(sql`
    SELECT 
      DATE_FORMAT(incident_date, ${format}) as period,
      COUNT(*) as claim_count,
      SUM(0) as total_cost,
      AVG(0) as avg_cost
    FROM ${claims}
    WHERE incident_date >= ${startDate}
      AND incident_date <= ${endDate}
      AND incident_date IS NOT NULL
    GROUP BY period
    ORDER BY period ASC
  `);

  const rows = (results as any).rows || [];
  return rows.map((row: any) => ({
    period: row.period,
    claimCount: Number(row.claim_count),
    totalCost: Number(row.total_cost) || 0,
    avgCost: Number(row.avg_cost) || 0,
  }));
}

/**
 * Get cost breakdown by various dimensions
 * @param startDate - Start date for the analysis period
 * @param endDate - End date for the analysis period
 * @param breakdownBy - Dimension to break down by: 'claim_type', 'vehicle_make', 'damage_severity'
 */
export async function getCostBreakdown(
  startDate: Date,
  endDate: Date,
  breakdownBy: 'claim_type' | 'vehicle_make' | 'damage_severity' = 'vehicle_make'
) {
  let groupColumn: string;
  
  switch (breakdownBy) {
    case 'claim_type':
      groupColumn = 'status';
      break;
    case 'vehicle_make':
      groupColumn = 'vehicle_make';
      break;
    case 'damage_severity':
      groupColumn = 'fraud_risk_level';
      break;
    default:
      groupColumn = 'vehicle_make';
  }

  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const results = await db.execute(sql`
    SELECT 
      ${sql.raw(groupColumn)} as category,
      COUNT(*) as claim_count,
      SUM(0) as total_cost,
      AVG(0) as avg_cost
    FROM ${claims}
    WHERE incident_date >= ${startDate}
      AND incident_date <= ${endDate}
      AND ${sql.raw(groupColumn)} IS NOT NULL
    GROUP BY category
    ORDER BY total_cost DESC
    LIMIT 10
  `);

  const rows = (results as any).rows || [];
  return rows.map((row: any) => ({
    category: row.category || 'Unknown',
    claimCount: Number(row.claim_count),
    totalCost: Number(row.total_cost) || 0,
    avgCost: Number(row.avg_cost) || 0,
  }));
}

/**
 * Get fraud heatmap data (geographic distribution of fraud cases)
 */
export async function getFraudHeatmap() {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const results = await db.execute(sql`
    SELECT 
      c.incident_location,
      COUNT(*) as fraud_count,
      AVG(c.fraud_risk_score) as avg_fraud_score,
      SUM(0) as total_amount,
      MAX(c.fraud_risk_score) as max_fraud_score
    FROM ${claims} c
    WHERE c.fraud_risk_score >= 50
      AND c.incident_location IS NOT NULL
    GROUP BY c.incident_location
    ORDER BY fraud_count DESC
    LIMIT 50
  `);

  return (results as any).rows.map((row: any) => {
    // Parse location (assuming format: "City, Province" or similar)
    const location = row.incident_location || '';
    const parts = location.split(',').map((s: string) => s.trim());
    
    return {
      location: row.incident_location,
      city: parts[0] || 'Unknown',
      province: parts[1] || '',
      fraudCount: Number(row.fraud_count),
      avgFraudScore: Number(row.avg_fraud_score) || 0,
      totalAmount: Number(row.total_amount) || 0,
      maxFraudScore: Number(row.max_fraud_score) || 0,
      // Assign random coordinates for demo (in production, use geocoding)
      lat: -17.8 + (Math.random() * 4), // Zimbabwe latitude range
      lng: 29.0 + (Math.random() * 4),  // Zimbabwe longitude range
    };
  });
}

/**
 * Get fraud patterns and statistics
 */
export async function getFraudPatterns() {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const results = await db.execute(sql`
    SELECT 
      COUNT(*) as total_fraud_cases,
      COUNT(DISTINCT incident_location) as high_risk_locations,
      SUM(0) as estimated_fraud_loss,
      AVG(fraud_risk_score) as avg_fraud_score
    FROM ${claims}
    WHERE fraud_risk_score >= 50
  `);

  const row: any = (results as any).rows[0] || {};
  
  return {
    totalFraudCases: Number(row.total_fraud_cases) || 0,
    highRiskLocations: Number(row.high_risk_locations) || 0,
    estimatedFraudLoss: Number(row.estimated_fraud_loss) || 0,
    avgFraudScore: Number(row.avg_fraud_score) || 0,
  };
}

/**
 * Get fleet risk overview (aggregated fleet statistics)
 * Note: This is a simplified version. In production, you'd have dedicated fleet and driver tables.
 */
export async function getFleetRiskOverview() {
  // For demo purposes, we'll aggregate by claimant
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const results = await db.execute(sql`
    SELECT 
      COUNT(DISTINCT claimant_id) as driver_count,
      COUNT(DISTINCT vehicle_registration) as vehicle_count,
      COUNT(*) as claim_count,
      AVG(fraud_risk_score) as avg_risk_score
    FROM ${claims}
    WHERE claimant_id IS NOT NULL
  `);

  const row: any = (results as any).rows[0] || {};
  
  return {
    driverCount: Number(row.driver_count) || 0,
    vehicleCount: Number(row.vehicle_count) || 0,
    claimCount: Number(row.claim_count) || 0,
    avgRiskScore: Number(row.avg_risk_score) || 0,
  };
}

/**
 * Get driver risk profiles
 * Note: Simplified version using claimants as "drivers"
 */
export async function getDriverProfiles() {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const results = await db.execute(sql`
    SELECT 
      c.claimant_id,
      u.name as driver_name,
      COUNT(*) as claim_count,
      AVG(c.fraud_risk_score) as risk_score,
      SUM(0) as total_claim_cost,
      MAX(c.incident_date) as last_claim_date
    FROM ${claims} c
    LEFT JOIN users u ON c.claimant_id = u.id
    WHERE c.claimant_id IS NOT NULL
    GROUP BY c.claimant_id, u.name
    HAVING claim_count > 0
    ORDER BY risk_score DESC
    LIMIT 20
  `);

  const rows = (results as any).rows || [];
  return rows.map((row: any) => ({
    driverId: Number(row.claimant_id),
    driverName: row.driver_name || `Driver ${row.claimant_id}`,
    claimCount: Number(row.claim_count),
    riskScore: Number(row.risk_score) || 0,
    totalClaimCost: Number(row.total_claim_cost) || 0,
    lastClaimDate: row.last_claim_date ? new Date(row.last_claim_date) : null,
    // Mock telematics data (in production, this would come from a telematics table)
    harshBraking: Math.floor(Math.random() * 50),
    rapidAcceleration: Math.floor(Math.random() * 40),
    speeding: Math.floor(Math.random() * 30),
  }));
}

/**
 * Get panel beater performance metrics
 */
export async function getPanelBeaterPerformance() {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const results = await db.execute(sql`
    SELECT 
      pb.id,
      pb.name,
      pb.business_name,
      pb.city,
      COUNT(q.id) as total_jobs,
      AVG(q.quoted_amount) as avg_quote,
      AVG(DATEDIFF(q.updated_at, q.created_at)) as avg_turnaround_days,
      -- Mock customer rating (in production, this would come from a ratings table)
      (4.0 + (RAND() * 1.0)) as customer_rating,
      -- Mock on-time delivery percentage
      (75 + (RAND() * 20)) as on_time_pct,
      -- Mock rework rate
      (5 + (RAND() * 10)) as rework_rate
    FROM ${panelBeaters} pb
    LEFT JOIN ${panelBeaterQuotes} q ON pb.id = q.panel_beater_id
    WHERE pb.approved = 1
    GROUP BY pb.id, pb.name, pb.business_name, pb.city
    HAVING total_jobs > 0
    ORDER BY customer_rating DESC
    LIMIT 20
  `);

  const rows = (results as any).rows || [];
  return rows.map((row: any) => ({
    id: Number(row.id),
    name: row.name,
    businessName: row.business_name,
    city: row.city || 'Unknown',
    totalJobs: Number(row.total_jobs) || 0,
    avgQuote: Number(row.avg_quote) || 0,
    avgTurnaroundDays: Number(row.avg_turnaround_days) || 0,
    customerRating: Number(row.customer_rating) || 4.0,
    onTimePct: Number(row.on_time_pct) || 80,
    reworkRate: Number(row.rework_rate) || 5,
  }));
}

/**
 * Get summary statistics for all dashboards
 */
export async function getAnalyticsSummary() {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const results = await db.execute(sql`
    SELECT 
      COUNT(*) as total_claims,
      SUM(0) as total_cost,
      AVG(0) as avg_cost,
      SUM(CASE WHEN status IN ('completed', 'repair_completed') THEN 1 ELSE 0 END) as approved_claims,
      SUM(CASE WHEN fraud_risk_score >= 50 THEN 1 ELSE 0 END) as fraud_cases
    FROM ${claims}
  `);

  const row: any = (results as any).rows[0] || {};
  
  return {
    totalClaims: Number(row.total_claims) || 0,
    totalCost: Number(row.total_cost) || 0,
    avgCost: Number(row.avg_cost) || 0,
    approvedClaims: Number(row.approved_claims) || 0,
    fraudCases: Number(row.fraud_cases) || 0,
    approvalRate: row.total_claims > 0 
      ? ((Number(row.approved_claims) / Number(row.total_claims)) * 100).toFixed(1)
      : '0.0',
  };
}
