/**
 * server/logger.ts — KINGA Structured Logger Singleton
 *
 * R-OBS-03: Module-level structured logger for pipeline observability.
 * Emits newline-delimited JSON to stdout. No external dependencies.
 *
 * Design principles:
 * - Single import, no per-call configuration required
 * - Structured fields (claimId, stage, durationMs, errorCode) for log aggregation
 * - Never throws — log failures are silently swallowed to avoid disrupting the pipeline
 * - Compatible with Cloud Run / stdout log ingestion (Google Cloud Logging auto-parses JSON)
 *
 * Usage:
 *   import { logger } from "./logger";
 *   logger.info("Stage 3", "Extraction complete", { claimId: "abc", durationMs: 1200 });
 *   logger.warn("withRetry", "Attempt 2 failed — retrying", { claimId, attempt: 2, error: err.message });
 *   logger.error("Stage 6", "Vision analysis failed", { claimId, errorCode: "VISION_TIMEOUT" });
 *   logger.stage("Stage 2", "COMPLETE", { claimId, durationMs, outcome: "success" });
 *   logger.timing("quoteExtractionEngine", durationMs, { claimId, outcome: "success" });
 */

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface LogEntry {
  ts: string;           // ISO-8601 UTC timestamp
  level: LogLevel;
  stage: string;        // Pipeline stage or engine name
  msg: string;          // Human-readable message
  claimId?: string;     // Claim being processed (if known)
  durationMs?: number;  // Duration of the operation (if applicable)
  attempt?: number;     // Retry attempt number (for withRetry events)
  errorCode?: string;   // Structured error code (for error events)
  outcome?: string;     // "success" | "degraded" | "failed" | "timeout"
  [key: string]: unknown; // Additional structured fields
}

class KingaLogger {
  private readonly minLevel: LogLevel;
  private readonly levelOrder: Record<LogLevel, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
  };

  constructor(minLevel: LogLevel = "INFO") {
    this.minLevel = minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelOrder[level] >= this.levelOrder[this.minLevel];
  }

  private emit(level: LogLevel, stage: string, msg: string, fields?: Partial<LogEntry>): void {
    if (!this.shouldLog(level)) return;
    try {
      const entry: LogEntry = {
        ts: new Date().toISOString(),
        level,
        stage,
        msg,
        ...fields,
      };
      process.stdout.write(JSON.stringify(entry) + "\n");
    } catch {
      // Never throw from logger — silently swallow serialisation errors
    }
  }

  debug(stage: string, msg: string, fields?: Partial<LogEntry>): void {
    this.emit("DEBUG", stage, msg, fields);
  }

  info(stage: string, msg: string, fields?: Partial<LogEntry>): void {
    this.emit("INFO", stage, msg, fields);
  }

  warn(stage: string, msg: string, fields?: Partial<LogEntry>): void {
    this.emit("WARN", stage, msg, fields);
  }

  error(stage: string, msg: string, fields?: Partial<LogEntry>): void {
    this.emit("ERROR", stage, msg, fields);
  }

  /**
   * Emit a pipeline stage completion event (R-OBS-04).
   * Always INFO level. Standardised fields for stage duration tracking.
   */
  stage(
    stageName: string,
    status: "START" | "COMPLETE" | "DEGRADED" | "FAILED" | "SKIPPED",
    fields?: Partial<LogEntry>
  ): void {
    this.emit("INFO", stageName, `Stage ${status}`, { ...fields, outcome: status.toLowerCase() });
  }

  /**
   * Emit a per-engine timing event (R-OBS-05).
   * Always INFO level. Standardised fields for engine latency tracking.
   */
  timing(engineName: string, durationMs: number, fields?: Partial<LogEntry>): void {
    this.emit("INFO", engineName, `Engine completed in ${durationMs}ms`, { ...fields, durationMs });
  }

  /**
   * Emit a withRetry exhaustion or retry event (R-OBS-02).
   * Uses WARN for retry attempts, ERROR for final exhaustion.
   */
  retry(
    engineName: string,
    attempt: number,
    maxAttempts: number,
    err: unknown,
    fields?: Partial<LogEntry>
  ): void {
    const isExhausted = attempt >= maxAttempts;
    const errMsg = err instanceof Error ? err.message : String(err);
    const level: LogLevel = isExhausted ? "ERROR" : "WARN";
    const msg = isExhausted
      ? `withRetry exhausted after ${maxAttempts} attempts: ${errMsg}`
      : `withRetry attempt ${attempt}/${maxAttempts} failed — retrying: ${errMsg}`;
    this.emit(level, engineName, msg, {
      ...fields,
      attempt,
      errorCode: isExhausted ? "RETRY_EXHAUSTED" : "RETRY_ATTEMPT",
    });
  }

  /**
   * Build a ctx.log-compatible function that emits structured logs via this logger.
   * Use this at PipelineContext construction sites to replace the console.log lambda.
   *
   * @param claimId  The claim being processed
   * @returns A (stage, msg) => void function compatible with PipelineContext.log
   */
  makePipelineLog(claimId: string): (stage: string, msg: string) => void {
    return (stage: string, msg: string) => {
      this.info(stage, msg, { claimId });
    };
  }
}

// Module-level singleton — import and use directly, no instantiation required
export const logger = new KingaLogger(
  process.env.LOG_LEVEL as LogLevel | undefined ?? "INFO"
);

// Export the class for testing
export { KingaLogger };
