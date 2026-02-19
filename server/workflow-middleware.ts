// @ts-nocheck
/**
 * Workflow Engine Middleware
 * 
 * Prevents direct updates to workflowState and status fields outside the WorkflowEngine.
 * This ensures all state transitions go through governance validation.
 * 
 * Usage: Import and call validateNoDirectStateUpdate() before any db.update(claims) call
 */

import type { SQL } from "drizzle-orm";

/**
 * Check if an update object contains direct state field modifications
 */
export function containsStateFields(updateData: Record<string, any>): boolean {
  return (
    updateData.hasOwnProperty("workflowState") ||
    updateData.hasOwnProperty("status")
  );
}

/**
 * Validate that no direct state updates are being performed
 * 
 * @throws Error if workflowState or status fields are being updated directly
 */
export function validateNoDirectStateUpdate(
  updateData: Record<string, any>,
  callerContext?: string
): void {
  if (containsStateFields(updateData)) {
    const fields = [];
    if (updateData.hasOwnProperty("workflowState")) fields.push("workflowState");
    if (updateData.hasOwnProperty("status")) fields.push("status");
    
    const context = callerContext ? ` (called from: ${callerContext})` : "";
    
    throw new Error(
      `GOVERNANCE VIOLATION: Direct update to ${fields.join(", ")} field(s) detected${context}. ` +
      `All workflow state transitions MUST go through WorkflowEngine.transition() for governance enforcement. ` +
      `See server/workflow-engine.ts for proper usage.`
    );
  }
}

/**
 * List of allowed callers that can bypass middleware (WorkflowEngine itself)
 */
const ALLOWED_BYPASS_CALLERS = [
  "workflow-engine.ts",
  "WorkflowEngine.transition",
];

/**
 * Check if caller is allowed to bypass middleware
 */
export function isAllowedBypass(stackTrace: string): boolean {
  return ALLOWED_BYPASS_CALLERS.some(caller => stackTrace.includes(caller));
}

/**
 * Get caller context from stack trace for debugging
 */
export function getCallerContext(): string {
  const stack = new Error().stack || "";
  const lines = stack.split("\n");
  
  // Skip first 3 lines (Error, this function, validateNoDirectStateUpdate)
  const callerLine = lines[3] || "";
  
  // Extract file and line number
  const match = callerLine.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
  if (match) {
    const [, functionName, filePath, lineNumber] = match;
    const fileName = filePath.split("/").pop();
    return `${fileName}:${lineNumber} (${functionName})`;
  }
  
  return "unknown";
}

/**
 * Middleware wrapper for db.update(claims) calls
 * 
 * Example usage:
 * ```ts
 * import { withWorkflowMiddleware } from "./workflow-middleware";
 * 
 * await withWorkflowMiddleware(() => 
 *   db.update(claims).set({ assignedAssessorId: 123 }).where(eq(claims.id, claimId))
 * );
 * ```
 */
export async function withWorkflowMiddleware<T>(
  operation: () => Promise<T>,
  updateData?: Record<string, any>
): Promise<T> {
  // If updateData provided, validate it
  if (updateData) {
    const callerContext = getCallerContext();
    const stackTrace = new Error().stack || "";
    
    // Allow bypass for WorkflowEngine itself
    if (!isAllowedBypass(stackTrace)) {
      validateNoDirectStateUpdate(updateData, callerContext);
    }
  }
  
  return operation();
}

/**
 * Development mode: Log warning instead of throwing error
 * Production mode: Throw error to enforce governance
 */
export const STRICT_MODE = process.env.NODE_ENV === "production";

/**
 * Lenient validation for development (logs warning instead of throwing)
 */
export function validateNoDirectStateUpdateLenient(
  updateData: Record<string, any>,
  callerContext?: string
): void {
  if (containsStateFields(updateData)) {
    const fields = [];
    if (updateData.hasOwnProperty("workflowState")) fields.push("workflowState");
    if (updateData.hasOwnProperty("status")) fields.push("status");
    
    const context = callerContext ? ` (called from: ${callerContext})` : "";
    const message =
      `⚠️  GOVERNANCE WARNING: Direct update to ${fields.join(", ")} detected${context}. ` +
      `Consider using WorkflowEngine.transition() for governance enforcement.`;
    
    if (STRICT_MODE) {
      throw new Error(message);
    } else {
      console.warn(message);
    }
  }
}
