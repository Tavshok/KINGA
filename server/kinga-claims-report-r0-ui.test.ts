import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("KingaClaimsReport R0 top cost view", () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), "client/src/components/KingaClaimsReport.tsx"), "utf8");

  it("keeps L2 analysis visible while withholding only an unsupported final all-in value", () => {
    expect(source).toContain("compOpt?.isComplete === true");
    expect(source).toContain("evidenceQualifiedL2");
    expect(source).toContain("L2 analysis evidence-qualified");
    expect(source).toContain("no final all-in L2, savings, settlement");
  });

  it("keeps submitted quote receipt visible in the active top cost view", () => {
    expect(source).toContain("Submitted quotation ledger:");
    expect(source).toContain("submitted quotation");
  });
});
