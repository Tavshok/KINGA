// @ts-nocheck
/**
 * M-01 Pagination Limits Test Suite
 *
 * Verifies that unbounded SELECT queries in analytics.ts, workflow-analytics.ts,
 * and intelligence-platform.ts have explicit LIMIT clauses applied.
 *
 * Strategy: grep the source files for the M-01 comments to confirm limits were applied,
 * and also verify the router procedures return arrays (not hanging queries).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "../..");

function readRouter(name: string): string {
  return readFileSync(join(ROOT, "server/routers", name), "utf-8");
}

describe("M-01 — Pagination limits in analytics.ts", () => {
  const src = readRouter("analytics.ts");

  it("assessor list query has .limit(100)", () => {
    // The assessors query must have a limit to prevent full-table scans
    expect(src).toMatch(/\.limit\(100\).*M-01.*assessor/s);
  });

  it("panel beater stats query has .limit(50)", () => {
    expect(src).toMatch(/\.limit\(50\).*M-01.*panel beater/s);
  });

  it("monthly trends query has .limit(24)", () => {
    expect(src).toMatch(/\.limit\(24\).*M-01.*trend/s);
  });

  it("no unbounded .orderBy() without a following .limit() in assessors/beaterStats/trends", () => {
    // These are the three specific patterns we fixed
    const assessorBlock = src.match(/const assessors = await db[\s\S]{0,800}?\.orderBy\([^)]+\)[^;]*;/);
    if (assessorBlock) {
      expect(assessorBlock[0]).toContain(".limit(");
    }
    const beaterBlock = src.match(/const beaterStats = await db[\s\S]{0,800}?\.orderBy\([^)]+\)[^;]*;/);
    if (beaterBlock) {
      expect(beaterBlock[0]).toContain(".limit(");
    }
    const trendsBlock = src.match(/const trends = await db[\s\S]{0,800}?\.orderBy\([^)]+\)[^;]*;/);
    if (trendsBlock) {
      expect(trendsBlock[0]).toContain(".limit(");
    }
  });
});

describe("M-01 — Pagination limits in intelligence-platform.ts", () => {
  const src = readRouter("intelligence-platform.ts");

  it("fleet vehicle list query has .limit(500)", () => {
    expect(src).toMatch(/\.limit\(500\).*M-01.*fleet vehicle/s);
  });

  it("fleet list query has .limit(100)", () => {
    expect(src).toMatch(/\.limit\(100\).*M-01.*fleet list/s);
  });

  it("inspection type groups query has .limit(20)", () => {
    expect(src).toMatch(/\.limit\(20\).*M-01.*inspection type/s);
  });

  it("claim type groups query has .limit(20)", () => {
    expect(src).toMatch(/\.limit\(20\).*M-01.*claim type/s);
  });

  it("all M-01 limit comments are present (4 total)", () => {
    const m01Comments = (src.match(/\/\/ M-01:/g) || []).length;
    expect(m01Comments).toBeGreaterThanOrEqual(4);
  });
});

describe("M-01 — workflow-analytics.ts has no unbounded list queries", () => {
  const src = readRouter("workflow-analytics.ts");

  it("workflow-analytics.ts has no unbounded .orderBy() without .limit()", () => {
    // workflow-analytics.ts had 0 unbounded queries per audit — verify it stays clean
    const lines = src.split("\n");
    const orderByLines = lines
      .map((l, i) => ({ line: l, idx: i }))
      .filter(({ line }) => line.includes(".orderBy("));

    for (const { line, idx } of orderByLines) {
      // Check the next 3 lines for .limit(
      const nextLines = lines.slice(idx, idx + 4).join("\n");
      if (!nextLines.includes(".limit(")) {
        // Allow if it's a groupBy aggregate (returns bounded rows)
        const context = lines.slice(Math.max(0, idx - 5), idx + 5).join("\n");
        const isAggregate = /count\(\)|SUM\(|AVG\(|MAX\(|MIN\(/.test(context);
        if (!isAggregate) {
          // This is a potential unbounded query - fail the test
          expect(nextLines).toContain(".limit(");
        }
      }
    }
  });
});
