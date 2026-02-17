/**
 * Analytics Utilities
 * 
 * Provides utility functions and types for safe analytics data handling:
 * - analyticsSafeResponse: Ensures consistent data structure with fallbacks
 * - Standardized response types for all analytics endpoints
 * - Null guards and type safety for chart data
 * 
 * @module utils/analytics-utils
 */

/**
 * Standardized analytics response structure
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
 * Safe response handler for analytics data
 * Ensures data is never undefined/null and provides sensible fallbacks
 * 
 * @param data - Raw data from database or computation
 * @param fallback - Fallback value if data is invalid
 * @returns Sanitized data or fallback
 */
export function analyticsSafeResponse<T>(data: T | null | undefined, fallback: T): T {
  // Handle null/undefined
  if (data === null || data === undefined) {
    return fallback;
  }

  // Handle arrays - return as-is if valid, fallback if empty
  if (Array.isArray(data)) {
    return data.length > 0 ? data : fallback;
  }

  // Handle objects - convert to array of values if needed
  if (typeof data === 'object') {
    const values = Object.values(data);
    return (values.length > 0 ? data : fallback) as T;
  }

  // Return data as-is for primitives
  return data;
}

/**
 * Ensure numeric value with fallback
 */
export function safeNumber(value: any, fallback: number = 0): number {
  if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
    return value;
  }
  const parsed = parseFloat(value);
  return !isNaN(parsed) && isFinite(parsed) ? parsed : fallback;
}

/**
 * Ensure string value with fallback
 */
export function safeString(value: any, fallback: string = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Ensure array value with fallback
 */
export function safeArray<T>(value: any, fallback: T[] = []): T[] {
  return Array.isArray(value) ? value : fallback;
}

/**
 * Create standardized analytics response
 */
export function createAnalyticsResponse<T>(
  data: T,
  meta?: AnalyticsResponse<T>['meta']
): AnalyticsResponse<T> {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date(),
      ...meta,
    },
  };
}

/**
 * KPI data structure with null guards
 */
export interface SafeKPIData {
  totalClaims: number;
  approvalRate: number;
  fraudScore: number;
  avgProcessingDays: number;
  costSavings: number;
}

/**
 * Ensure safe KPI data structure
 */
export function safeKPIData(data: Partial<SafeKPIData> | null | undefined): SafeKPIData {
  return {
    totalClaims: safeNumber(data?.totalClaims, 0),
    approvalRate: safeNumber(data?.approvalRate, 0),
    fraudScore: safeNumber(data?.fraudScore, 0),
    avgProcessingDays: safeNumber(data?.avgProcessingDays, 0),
    costSavings: safeNumber(data?.costSavings, 0),
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
 * Ensure safe monthly breakdown array
 */
export function safeMonthlyBreakdown(
  data: Partial<MonthlyBreakdownData>[] | null | undefined
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
 * Chart data point structure
 */
export interface ChartDataPoint {
  label: string;
  value: number;
  [key: string]: string | number;
}

/**
 * Ensure safe chart data array
 */
export function safeChartData(
  data: Partial<ChartDataPoint>[] | null | undefined
): ChartDataPoint[] {
  if (!Array.isArray(data) || data.length === 0) {
    return [];
  }

  return data.map(item => ({
    label: safeString(item.label, 'Unknown'),
    value: safeNumber(item.value, 0),
    ...item,
  }));
}
