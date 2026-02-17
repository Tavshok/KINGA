/**
 * Analytics Data Adapters
 * 
 * Provides safe data transformation utilities for analytics API responses.
 * Ensures charts never receive undefined, null, or incorrect types.
 * 
 * @module lib/analytics-adapters
 */

/**
 * Standardized analytics response from backend
 */
export interface AnalyticsResponse<T = any> {
  success: boolean;
  data: T;
  meta?: {
    tenantId?: string;
    timestamp?: Date;
    [key: string]: any;
  };
}

/**
 * Safe number extraction with fallback
 */
export function safeNumber(value: any, fallback: number = 0): number {
  if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return !isNaN(parsed) && isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/**
 * Safe string extraction with fallback
 */
export function safeString(value: any, fallback: string = ''): string {
  return typeof value === 'string' ? value : String(value || fallback);
}

/**
 * Safe array extraction with fallback
 */
export function safeArray<T>(value: any, fallback: T[] = []): T[] {
  return Array.isArray(value) ? value : fallback;
}

/**
 * Extract data from analytics response with null safety
 */
export function extractAnalyticsData<T>(
  response: AnalyticsResponse<T> | null | undefined,
  fallback: T
): T {
  if (!response || !response.success || response.data === null || response.data === undefined) {
    return fallback;
  }
  return response.data;
}

/**
 * KPI Card Data Structure
 */
export interface KPICardData {
  value: number;
  change: number;
  label: string;
  unit?: string;
}

/**
 * Adapt KPI response for dashboard cards
 */
export function adaptKPIResponse(response: AnalyticsResponse | null | undefined): {
  totalClaims: number;
  approvalRate: number;
  fraudScore: number;
  avgProcessingDays: number;
  costSavings: number;
} {
  const data = extractAnalyticsData(response, {
    claimsProcessed: { value: 0, change: 0, lastMonth: 0 },
    avgProcessingTime: { value: 0, change: 0, unit: 'days' },
    fraudDetectionRate: { value: 0, change: 0, flagged: 0, total: 0, unit: '%' },
    costSavings: { value: 0, change: 0, breakdown: {}, unit: 'USD' }
  });

  return {
    totalClaims: safeNumber(data.claimsProcessed?.value, 0),
    approvalRate: 0, // Calculated from other metrics if needed
    fraudScore: safeNumber(data.fraudDetectionRate?.value, 0),
    avgProcessingDays: safeNumber(data.avgProcessingTime?.value, 0),
    costSavings: safeNumber(data.costSavings?.value, 0),
  };
}

/**
 * Chart data point structure
 */
export interface ChartDataPoint {
  label: string;
  value: number;
  [key: string]: string | number;
}

/**
 * Adapt complexity breakdown for chart
 */
export function adaptComplexityChart(
  response: AnalyticsResponse | null | undefined
): ChartDataPoint[] {
  const data = extractAnalyticsData(response, {
    simple: 0,
    moderate: 0,
    complex: 0,
    exceptional: 0
  });

  return [
    { label: 'Simple', value: safeNumber(data.simple, 0) },
    { label: 'Moderate', value: safeNumber(data.moderate, 0) },
    { label: 'Complex', value: safeNumber(data.complex, 0) },
    { label: 'Exceptional', value: safeNumber(data.exceptional, 0) },
  ];
}

/**
 * SLA compliance data structure
 */
export interface SLAComplianceData {
  complexity: string;
  compliance: number;
  avgDays: number;
  target: number;
}

/**
 * Adapt SLA compliance for chart
 */
export function adaptSLAChart(
  response: AnalyticsResponse | null | undefined
): SLAComplianceData[] {
  const data = extractAnalyticsData(response, {
    simple: { compliance: 0, avgDays: 0, target: 0 },
    moderate: { compliance: 0, avgDays: 0, target: 0 },
    complex: { compliance: 0, avgDays: 0, target: 0 },
    exceptional: { compliance: 0, avgDays: 0, target: 0 }
  });

  return [
    {
      complexity: 'Simple',
      compliance: safeNumber(data.simple?.compliance, 0),
      avgDays: safeNumber(data.simple?.avgDays, 0),
      target: safeNumber(data.simple?.target, 0)
    },
    {
      complexity: 'Moderate',
      compliance: safeNumber(data.moderate?.compliance, 0),
      avgDays: safeNumber(data.moderate?.avgDays, 0),
      target: safeNumber(data.moderate?.target, 0)
    },
    {
      complexity: 'Complex',
      compliance: safeNumber(data.complex?.compliance, 0),
      avgDays: safeNumber(data.complex?.avgDays, 0),
      target: safeNumber(data.complex?.target, 0)
    },
    {
      complexity: 'Exceptional',
      compliance: safeNumber(data.exceptional?.compliance, 0),
      avgDays: safeNumber(data.exceptional?.avgDays, 0),
      target: safeNumber(data.exceptional?.target, 0)
    },
  ];
}

/**
 * Fraud metrics data structure
 */
export interface FraudMetricsData {
  flagged: number;
  confirmed: number;
  falsePositives: number;
  savedAmount: number;
  topIndicators: string[];
  accuracy: number;
}

/**
 * Adapt fraud metrics response
 */
export function adaptFraudMetrics(
  response: AnalyticsResponse | null | undefined
): FraudMetricsData {
  const data = extractAnalyticsData(response, {
    flagged: 0,
    confirmed: 0,
    falsePositives: 0,
    savedAmount: 0,
    topIndicators: [],
    accuracy: 0
  });

  return {
    flagged: safeNumber(data.flagged, 0),
    confirmed: safeNumber(data.confirmed, 0),
    falsePositives: safeNumber(data.falsePositives, 0),
    savedAmount: safeNumber(data.savedAmount, 0),
    topIndicators: safeArray(data.topIndicators, []),
    accuracy: safeNumber(data.accuracy, 0),
  };
}

/**
 * Cost savings data structure
 */
export interface CostSavingsData {
  total: number;
  aiAssessment: number;
  fraudPrevention: number;
  processOptimization: number;
  avgPerClaim: number;
  claimsProcessed: number;
}

/**
 * Adapt cost savings response
 */
export function adaptCostSavings(
  response: AnalyticsResponse | null | undefined
): CostSavingsData {
  const data = extractAnalyticsData(response, {
    total: 0,
    aiAssessment: 0,
    fraudPrevention: 0,
    processOptimization: 0,
    avgPerClaim: 0,
    claimsProcessed: 0
  });

  return {
    total: safeNumber(data.total, 0),
    aiAssessment: safeNumber(data.aiAssessment, 0),
    fraudPrevention: safeNumber(data.fraudPrevention, 0),
    processOptimization: safeNumber(data.processOptimization, 0),
    avgPerClaim: safeNumber(data.avgPerClaim, 0),
    claimsProcessed: safeNumber(data.claimsProcessed, 0),
  };
}

/**
 * Monthly breakdown data structure
 */
export interface MonthlyBreakdownData {
  month: string;
  claims: number;
  approved: number;
  rejected: number;
  pending: number;
}

/**
 * Adapt monthly breakdown for chart
 */
export function adaptMonthlyBreakdown(
  data: any[] | null | undefined
): MonthlyBreakdownData[] {
  if (!Array.isArray(data) || data.length === 0) {
    return [];
  }

  return data.map(item => ({
    month: safeString(item.month, 'Unknown'),
    claims: safeNumber(item.claims, 0),
    approved: safeNumber(item.approved, 0),
    rejected: safeNumber(item.rejected, 0),
    pending: safeNumber(item.pending, 0),
  }));
}

/**
 * Ensure chart data is never undefined/null
 */
export function ensureChartData<T>(
  data: T[] | null | undefined,
  fallback: T[] = []
): T[] {
  return Array.isArray(data) && data.length > 0 ? data : fallback;
}
