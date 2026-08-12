import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("KingaClaimsReport R0 top cost view", () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), "client/src/components/KingaClaimsReport.tsx"), "utf8");

  it("never presents raw L2 unless the composite contract is complete", () => {
    expect(source).toContain("compOpt?.isComplete === true");
    expect(source).toContain("itemised repair scope incomplete — L2 withheld");
  });

  it("keeps submitted quote receipt visible in the active top cost view", () => {
    expect(source).toContain("Submitted quotation ledger:");
    expect(source).toContain("submitted quotation");
  });
});
