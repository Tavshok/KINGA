import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("Stage 9.5 CGI VGR handoff", () => {
  it("passes the populated VGE reconciliation result to CGI", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "orchestrator.ts"),
      "utf8"
    );
    const cgiInvocation = source.slice(
      source.indexOf("const cgiInput"),
      source.indexOf("stage9_5Data = runContactGeometryIntelligence")
    );

    expect(cgiInvocation).toContain(
      "vgrResult: (ctx as any).vgeReconciliationResult ?? null"
    );
    expect(cgiInvocation).not.toContain(
      "vgrResult: (ctx as any).vgrConsensusResult ?? null"
    );
  });
});
