/**
 * rinf-audit.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Static / structural audit tests for Batch 7 infrastructure hardening.
 * These tests verify the presence of the required patterns without executing
 * any real LLM calls or database connections.
 *
 * Coverage:
 *   R-INF-01  DB query timeout (withDbTimeout helper in db.ts)
 *   R-INF-02  stage-3 llmCall wrapped in withRetry
 *   R-INF-03  stage-5 invokeLLM calls wrapped in withRetry
 *   R-INF-04  stage-7b invokeLLM calls wrapped in withRetry
 *   R-INF-05  stage-6 PDF pass-1 and pass-2 wrapped in withRetry
 *   R-INF-06  quoteExtractionEngine all 7 invokeLLM calls wrapped in withRetry
 *   R-INF-08  DATABASE_URL startup validation (hard fail in prod, warn in dev)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "../..");

function readFile(relPath: string): string {
  return readFileSync(join(root, relPath), "utf8");
}

// ── R-INF-01: DB query timeout ────────────────────────────────────────────────
describe("R-INF-01: DB query timeout", () => {
  const dbTs = readFile("server/db.ts");

  it("exports withDbTimeout helper", () => {
    expect(dbTs).toMatch(/export.*function withDbTimeout|export.*withDbTimeout/);
  });

  it("withDbTimeout uses SET SESSION max_execution_time or similar timeout mechanism", () => {
    // Should contain either SET SESSION max_execution_time or a Promise.race timeout
    const hasSessionTimeout = dbTs.includes("max_execution_time") || dbTs.includes("SET SESSION");
    const hasPromiseRaceTimeout = dbTs.includes("Promise.race") && dbTs.includes("withDbTimeout");
    expect(hasSessionTimeout || hasPromiseRaceTimeout).toBe(true);
  });
});

// ── R-INF-02: stage-3 llmCall wrapped in withRetry ───────────────────────────
describe("R-INF-02: stage-3 LLM retry", () => {
  const stage3 = readFile("server/pipeline-v2/stage-3-structured-extraction.ts");

  it("imports withRetry from llm", () => {
    expect(stage3).toMatch(/import\s*\{[^}]*withRetry[^}]*\}\s*from\s*["'].*llm["']/);
  });

  it("llmCall is wrapped in withRetry", () => {
    expect(stage3).toMatch(/withRetry\s*\(\s*\(\s*\)\s*=>\s*(llmCall|invokeLLM)/);
  });

  it("withRetry label includes stage-3", () => {
    expect(stage3).toMatch(/withRetry.*stage-3/s);
  });
});

// ── R-INF-03: stage-5 invokeLLM calls wrapped in withRetry ───────────────────
describe("R-INF-03: stage-5 LLM retry", () => {
  const stage5 = readFile("server/pipeline-v2/stage-5-assembly.ts");

  it("imports withRetry from llm", () => {
    expect(stage5).toMatch(/import\s*\{[^}]*withRetry[^}]*\}\s*from\s*["'].*llm["']/);
  });

  it("valuation invokeLLM call is wrapped in withRetry", () => {
    expect(stage5).toMatch(/withRetry.*stage-5.*valuation/s);
  });

  it("incident-classifier invokeLLM call is wrapped in withRetry", () => {
    expect(stage5).toMatch(/withRetry.*stage-5.*incident/s);
  });

  it("no bare await invokeLLM calls remain in stage-5", () => {
    // All invokeLLM calls should be inside withRetry lambdas.
    // The valuation call uses withRetry(() => withTimeout(() => invokeLLM({...})))
    // so we count withRetry call sites (not just direct invokeLLM wraps).
    const bareCount = (stage5.match(/await invokeLLM\(/g) || []).length;
    expect(bareCount).toBe(0);
    // Count withRetry call sites (direct or nested via withTimeout)
    const withRetryCount = (stage5.match(/await withRetry\s*\(/g) || []).length;
    expect(withRetryCount).toBeGreaterThanOrEqual(2);
  });
});

// ── R-INF-04: stage-7b invokeLLM calls wrapped in withRetry ──────────────────
describe("R-INF-04: stage-7b LLM retry", () => {
  const stage7b = readFile("server/pipeline-v2/stage-7b-causal-reasoning.ts");

  it("imports withRetry from llm", () => {
    expect(stage7b).toMatch(/import\s*\{[^}]*withRetry[^}]*\}\s*from\s*["'].*llm["']/);
  });

  it("constraint-extraction call is wrapped in withRetry", () => {
    expect(stage7b).toMatch(/withRetry.*stage-7b.*constraint/s);
  });

  it("cause-narrative call is wrapped in withRetry", () => {
    expect(stage7b).toMatch(/withRetry.*stage-7b.*narrative/s);
  });

  it("causal-chain-vision call is wrapped in withRetry", () => {
    expect(stage7b).toMatch(/withRetry.*stage-7b.*causal/s);
  });

  it("no bare await invokeLLM calls remain in stage-7b", () => {
    const bareCount = (stage7b.match(/await invokeLLM\(/g) || []).length;
    expect(bareCount).toBe(0);
  });
});

// ── R-INF-05: stage-6 PDF passes wrapped in withRetry ────────────────────────
describe("R-INF-05: stage-6 PDF pass retry", () => {
  const visionStage = readFile("server/pipeline-v2/stage-6-damage-analysis.vision.ts");

  it("vision PDF pass-1 is wrapped in the vision retry helper", () => {
    expect(visionStage).toMatch(/withRetry.*stage-6.*PDF.*pass-1/s);
  });

  it("vision PDF pass-2 is wrapped in the vision retry helper", () => {
    expect(visionStage).toMatch(/withRetry.*stage-6.*PDF.*pass-2/s);
  });

  it("vision concern retains its local retry helper for per-image calls", () => {
    expect(visionStage).toMatch(/async function withRetry/);
  });
});

// ── R-INF-06: quoteExtractionEngine all 7 calls wrapped in withRetry ─────────
describe("R-INF-06: quoteExtractionEngine LLM retry", () => {
  const qee = readFile("server/pipeline-v2/quoteExtractionEngine.ts");

  it("imports withRetry from llm", () => {
    expect(qee).toMatch(/import\s*\{[^}]*withRetry[^}]*\}\s*from\s*["'].*llm["']/);
  });

  it("no bare await invokeLLM calls remain", () => {
    const bareCount = (qee.match(/await invokeLLM\(/g) || []).length;
    expect(bareCount).toBe(0);
  });

  it("has 7 withRetry-wrapped invokeLLM calls", () => {
    const wrappedCount = (qee.match(/withRetry\s*\(\s*\(\s*\)\s*=>\s*invokeLLM\(/g) || []).length;
    expect(wrappedCount).toBe(7);
  });

  it("all 7 withRetry labels are present", () => {
    const labels = [
      "quote-extraction text",
      "quote-detection",
      "quote-vision-reextract",
      "quote-image-extract",
      "quote-page-classifier",
      "quote-multipage-extract",
      "quote-pdf-detection",
    ];
    for (const label of labels) {
      expect(qee).toContain(label);
    }
  });
});

// ── R-INF-08: DATABASE_URL startup validation ─────────────────────────────────
describe("R-INF-08: DATABASE_URL startup validation", () => {
  const indexTs = readFile("server/_core/index.ts");

  it("checks for DATABASE_URL at startup", () => {
    expect(indexTs).toMatch(/DATABASE_URL/);
  });

  it("calls process.exit(1) when DATABASE_URL is missing in production", () => {
    expect(indexTs).toMatch(/process\.exit\s*\(\s*1\s*\)/);
  });

  it("guards process.exit behind NODE_ENV === 'production' check", () => {
    // Should only hard-fail in production, not in dev
    expect(indexTs).toMatch(/NODE_ENV.*production|production.*NODE_ENV/);
  });

  it("logs a warning when DATABASE_URL is missing in non-production", () => {
    expect(indexTs).toMatch(/warn|WARNING|missing.*DATABASE_URL|DATABASE_URL.*missing/i);
  });
});
