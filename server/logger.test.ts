/**
 * server/logger.test.ts — R-OBS-03 Verification Tests
 *
 * Verifies that the KingaLogger module-level singleton:
 * 1. Emits structured JSON to stdout
 * 2. Respects log level filtering
 * 3. makePipelineLog() produces ctx.log-compatible functions
 * 4. retry() emits WARN for attempts and ERROR for exhaustion
 * 5. stage() and timing() emit standardised structured events
 * 6. Never throws on serialisation errors
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { KingaLogger, type LogLevel } from "./logger";

// Capture stdout writes for assertion
function captureStdout(fn: () => void): string[] {
  const lines: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
    if (typeof chunk === "string") lines.push(chunk.trim());
    return true;
  });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return lines;
}

function parseLines(lines: string[]) {
  return lines.map(l => JSON.parse(l));
}

describe("KingaLogger — R-OBS-03", () => {
  describe("structured JSON output", () => {
    it("emits valid JSON for info()", () => {
      const log = new KingaLogger("INFO");
      const lines = captureStdout(() => log.info("Stage 3", "Extraction complete", { claimId: "abc123" }));
      expect(lines).toHaveLength(1);
      const entry = JSON.parse(lines[0]);
      expect(entry.level).toBe("INFO");
      expect(entry.stage).toBe("Stage 3");
      expect(entry.msg).toBe("Extraction complete");
      expect(entry.claimId).toBe("abc123");
      expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("emits valid JSON for warn()", () => {
      const log = new KingaLogger("INFO");
      const lines = captureStdout(() => log.warn("withRetry", "Attempt failed", { attempt: 2 }));
      const entry = JSON.parse(lines[0]);
      expect(entry.level).toBe("WARN");
      expect(entry.attempt).toBe(2);
    });

    it("emits valid JSON for error()", () => {
      const log = new KingaLogger("INFO");
      const lines = captureStdout(() => log.error("Stage 6", "Vision failed", { errorCode: "VISION_TIMEOUT" }));
      const entry = JSON.parse(lines[0]);
      expect(entry.level).toBe("ERROR");
      expect(entry.errorCode).toBe("VISION_TIMEOUT");
    });

    it("each line is terminated with a newline", () => {
      const log = new KingaLogger("INFO");
      const rawLines: string[] = [];
      const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
        if (typeof chunk === "string") rawLines.push(chunk);
        return true;
      });
      log.info("Test", "msg");
      spy.mockRestore();
      expect(rawLines[0]).toMatch(/\n$/);
    });
  });

  describe("log level filtering", () => {
    it("suppresses DEBUG when minLevel is INFO", () => {
      const log = new KingaLogger("INFO");
      const lines = captureStdout(() => log.debug("Stage 1", "debug msg"));
      expect(lines).toHaveLength(0);
    });

    it("emits DEBUG when minLevel is DEBUG", () => {
      const log = new KingaLogger("DEBUG");
      const lines = captureStdout(() => log.debug("Stage 1", "debug msg"));
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0]).level).toBe("DEBUG");
    });

    it("suppresses INFO and WARN when minLevel is ERROR", () => {
      const log = new KingaLogger("ERROR");
      const lines = captureStdout(() => {
        log.info("S", "info");
        log.warn("S", "warn");
        log.error("S", "error");
      });
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0]).level).toBe("ERROR");
    });

    it("emits all levels when minLevel is DEBUG", () => {
      const log = new KingaLogger("DEBUG");
      const lines = captureStdout(() => {
        log.debug("S", "d");
        log.info("S", "i");
        log.warn("S", "w");
        log.error("S", "e");
      });
      expect(lines).toHaveLength(4);
      const levels = parseLines(lines).map(e => e.level);
      expect(levels).toEqual(["DEBUG", "INFO", "WARN", "ERROR"]);
    });
  });

  describe("makePipelineLog() — ctx.log compatibility", () => {
    it("returns a (stage, msg) => void function", () => {
      const log = new KingaLogger("INFO");
      const ctxLog = log.makePipelineLog("claim-001");
      expect(typeof ctxLog).toBe("function");
    });

    it("emits structured INFO with claimId and stage", () => {
      const log = new KingaLogger("INFO");
      const ctxLog = log.makePipelineLog("claim-001");
      const lines = captureStdout(() => ctxLog("Stage 2", "Extraction started"));
      const entry = JSON.parse(lines[0]);
      expect(entry.level).toBe("INFO");
      expect(entry.stage).toBe("Stage 2");
      expect(entry.msg).toBe("Extraction started");
      expect(entry.claimId).toBe("claim-001");
    });

    it("different claimIds produce different log entries", () => {
      const log = new KingaLogger("INFO");
      const log1 = log.makePipelineLog("claim-A");
      const log2 = log.makePipelineLog("claim-B");
      const lines = captureStdout(() => {
        log1("Stage 1", "msg A");
        log2("Stage 1", "msg B");
      });
      const entries = parseLines(lines);
      expect(entries[0].claimId).toBe("claim-A");
      expect(entries[1].claimId).toBe("claim-B");
    });
  });

  describe("retry() — R-OBS-02 withRetry exhaustion logging", () => {
    it("emits WARN for non-final retry attempts", () => {
      const log = new KingaLogger("INFO");
      const lines = captureStdout(() => log.retry("quoteExtractionEngine", 1, 3, new Error("timeout")));
      const entry = JSON.parse(lines[0]);
      expect(entry.level).toBe("WARN");
      expect(entry.errorCode).toBe("RETRY_ATTEMPT");
      expect(entry.attempt).toBe(1);
      expect(entry.msg).toContain("attempt 1/3");
    });

    it("emits ERROR for final exhaustion (attempt === maxAttempts)", () => {
      const log = new KingaLogger("INFO");
      const lines = captureStdout(() => log.retry("quoteExtractionEngine", 3, 3, new Error("timeout")));
      const entry = JSON.parse(lines[0]);
      expect(entry.level).toBe("ERROR");
      expect(entry.errorCode).toBe("RETRY_EXHAUSTED");
      expect(entry.msg).toContain("exhausted after 3 attempts");
    });

    it("handles non-Error throwables", () => {
      const log = new KingaLogger("INFO");
      const lines = captureStdout(() => log.retry("engine", 3, 3, "string error"));
      const entry = JSON.parse(lines[0]);
      expect(entry.msg).toContain("string error");
    });

    it("includes claimId in retry events when provided", () => {
      const log = new KingaLogger("INFO");
      const lines = captureStdout(() => log.retry("engine", 2, 3, new Error("fail"), { claimId: "claim-xyz" }));
      const entry = JSON.parse(lines[0]);
      expect(entry.claimId).toBe("claim-xyz");
    });
  });

  describe("stage() — R-OBS-04 pipeline stage completion events", () => {
    it("emits INFO with outcome field for COMPLETE", () => {
      const log = new KingaLogger("INFO");
      const lines = captureStdout(() => log.stage("Stage 3", "COMPLETE", { claimId: "c1", durationMs: 1200 }));
      const entry = JSON.parse(lines[0]);
      expect(entry.level).toBe("INFO");
      expect(entry.msg).toBe("Stage COMPLETE");
      expect(entry.outcome).toBe("complete");
      expect(entry.durationMs).toBe(1200);
    });

    it("emits INFO with outcome field for FAILED", () => {
      const log = new KingaLogger("INFO");
      const lines = captureStdout(() => log.stage("Stage 6", "FAILED", { claimId: "c2" }));
      const entry = JSON.parse(lines[0]);
      expect(entry.outcome).toBe("failed");
    });

    it("supports all status values", () => {
      const log = new KingaLogger("INFO");
      const statuses = ["START", "COMPLETE", "DEGRADED", "FAILED", "SKIPPED"] as const;
      for (const status of statuses) {
        const lines = captureStdout(() => log.stage("S", status));
        const entry = JSON.parse(lines[0]);
        expect(entry.outcome).toBe(status.toLowerCase());
      }
    });
  });

  describe("timing() — R-OBS-05 per-engine timing events", () => {
    it("emits INFO with durationMs field", () => {
      const log = new KingaLogger("INFO");
      const lines = captureStdout(() => log.timing("quoteExtractionEngine", 4200, { claimId: "c1", outcome: "success" }));
      const entry = JSON.parse(lines[0]);
      expect(entry.level).toBe("INFO");
      expect(entry.durationMs).toBe(4200);
      expect(entry.stage).toBe("quoteExtractionEngine");
      expect(entry.msg).toContain("4200ms");
      expect(entry.outcome).toBe("success");
    });

    it("includes claimId in timing events", () => {
      const log = new KingaLogger("INFO");
      const lines = captureStdout(() => log.timing("stage-6-damage-analysis", 8100, { claimId: "claim-42" }));
      const entry = JSON.parse(lines[0]);
      expect(entry.claimId).toBe("claim-42");
    });
  });

  describe("error resilience", () => {
    it("never throws when stdout.write throws", () => {
      const log = new KingaLogger("INFO");
      const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => {
        throw new Error("stdout broken");
      });
      expect(() => log.info("S", "msg")).not.toThrow();
      spy.mockRestore();
    });

    it("never throws when fields contain circular references", () => {
      const log = new KingaLogger("INFO");
      const circular: any = {};
      circular.self = circular;
      // Should not throw even though JSON.stringify would fail
      expect(() => log.info("S", "msg", circular)).not.toThrow();
    });
  });
});
