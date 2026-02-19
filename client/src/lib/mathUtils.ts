/**
 * Math Utility Functions
 * Reusable mathematical operations for physics calculations and UI rendering
 */

/**
 * Clamps a numeric value between a minimum and maximum bound
 * 
 * @param value - The value to clamp
 * @param min - The minimum allowed value
 * @param max - The maximum allowed value
 * @returns The clamped value, guaranteed to be between min and max (inclusive)
 * 
 * @example
 * clamp(150, 0, 100) // returns 100
 * clamp(-10, 0, 100) // returns 0
 * clamp(50, 0, 100)  // returns 50
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Confidence level thresholds for AI assessments
 */
export const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.85,
  MEDIUM: 0.6,
} as const;

/**
 * Confidence color configuration with Tailwind CSS classes
 * Ensures WCAG AA accessibility standards (contrast ratio ≥4.5:1)
 */
export interface ConfidenceColorConfig {
  text: string; // Tailwind text color class
  bg: string; // Tailwind background color class
  border: string; // Tailwind border color class
  vector: string; // SVG stroke color (hex for compatibility)
  label: string; // Human-readable label
}

/**
 * Returns semantic color configuration based on AI confidence score.
 * 
 * Confidence Levels:
 * - High (>0.85): Green - High confidence in AI assessment
 * - Medium (0.6-0.85): Amber - Moderate confidence, review recommended
 * - Low (<0.6): Red - Low confidence, manual verification required
 * 
 * @param score - Confidence score between 0 and 1
 * @returns Color configuration object with Tailwind classes and accessibility-compliant colors
 * 
 * @example
 * const colors = getConfidenceColor(0.92);
 * // Returns: { text: 'text-green-700', bg: 'bg-green-100', ... }
 */
export function getConfidenceColor(score: number): ConfidenceColorConfig {
  if (score > CONFIDENCE_THRESHOLDS.HIGH) {
    return {
      text: 'text-green-700',
      bg: 'bg-green-100',
      border: 'border-green-300',
      vector: '#15803d', // green-700 (WCAG AA compliant)
      label: 'High Confidence',
    };
  } else if (score >= CONFIDENCE_THRESHOLDS.MEDIUM) {
    return {
      text: 'text-amber-700',
      bg: 'bg-amber-100',
      border: 'border-amber-300',
      vector: '#b45309', // amber-700 (WCAG AA compliant)
      label: 'Medium Confidence',
    };
  } else {
    return {
      text: 'text-red-700',
      bg: 'bg-red-100',
      border: 'border-red-300',
      vector: '#b91c1c', // red-700 (WCAG AA compliant)
      label: 'Low Confidence',
    };
  }
}

/**
 * Formats confidence score as percentage string.
 * 
 * @param score - Confidence score between 0 and 1
 * @returns Formatted percentage string (e.g., "85%")
 * 
 * @example
 * formatConfidenceScore(0.8532) // Returns: "85%"
 */
export function formatConfidenceScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}
