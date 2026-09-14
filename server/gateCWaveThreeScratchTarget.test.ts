import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateScratchTarget } from "../scripts/gate-c-wave-three-replay.mjs";
import { WAVE_THREE_TABLES, validateWaveThreeSql } from "../scripts/gate-c-wave-three-contract.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const sqlPath = path.join(repoRoot, "audit/gate-c-scratch-baseline/wave-03-generated/wave-03-assessment-evidence-reporting.sql");

describe("Gate C Wave 3 scratch target", () => {
  it("accepts only a uniquely named loopback mysql scratch database", () => {
    expect(validateScratchTarget("mysql://scratch:scratch@127.0.0.1:3317/kinga_gatec_wave3_test").database).toBe("kinga_gatec_wave3_test");
    expect(() => validateScratchTarget("mysql://user:pass@kinga-staging.example/kinga_gatec_wave3_test")).toThrow(/non-loopback/);
    expect(() => validateScratchTarget("mysql://user:pass@127.0.0.1:3317/kinga_staging")).toThrow(/kinga_gatec/);
  });

  it("contains exactly the reviewed 50-table Wave 3 source-derived SQL contract", () => {
    const inspected = validateWaveThreeSql(fs.readFileSync(sqlPath, "utf8"));
    expect(inspected.createdTables).toEqual(WAVE_THREE_TABLES);
    expect(inspected.createdTables).toHaveLength(50);
  });
});
