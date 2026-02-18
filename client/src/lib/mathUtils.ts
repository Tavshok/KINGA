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
