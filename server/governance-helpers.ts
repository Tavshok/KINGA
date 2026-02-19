// @ts-nocheck
/**
 * Governance Dashboard Helper Functions
 * 
 * Utility functions for governance metrics calculations and data transformations.
 */

/**
 * Safely convert a value to a number, returning 0 if null/undefined/NaN
 * 
 * @param value - The value to convert
 * @param defaultValue - Default value to return if conversion fails (default: 0)
 * @returns The converted number or default value
 */
export function safeNumber(value: any, defaultValue: number = 0): number {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Calculate percentage with safe division
 * 
 * @param numerator - The numerator
 * @param denominator - The denominator
 * @param decimals - Number of decimal places (default: 1)
 * @returns Percentage value or 0 if denominator is 0
 */
export function safePercentage(numerator: number, denominator: number, decimals: number = 1): number {
  if (denominator === 0) {
    return 0;
  }
  return Number(((numerator / denominator) * 100).toFixed(decimals));
}

/**
 * Get date range for last N days
 * 
 * @param days - Number of days to go back (default: 30)
 * @returns Object with startDate and endDate
 */
export function getDateRange(days: number = 30): { startDate: Date; endDate: Date } {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return { startDate, endDate };
}

/**
 * Format date to ISO string without time
 * 
 * @param date - The date to format
 * @returns ISO date string (YYYY-MM-DD)
 */
export function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0];
}
