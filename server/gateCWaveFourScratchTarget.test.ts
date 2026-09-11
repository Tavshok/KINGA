import { describe, expect, it } from "vitest";
import { validateScratchTarget } from "../scripts/gate-c-wave-four-replay.mjs";

describe("Gate C Wave 4 scratch target guard", () => {
  it("accepts only a local uniquely named mysql scratch database", () => {
    expect(validateScratchTarget("mysql://root@127.0.0.1:3317/kinga_gatec_wave4_contract")).toEqual({ database: "kinga_gatec_wave4_contract", host: "127.0.0.1", port: "3317" });
  });

  it.each([
    "mysql://root@db.example.com/kinga_gatec_wave4_contract",
    "mysql://root@127.0.0.1:3317/kinga_staging",
    "postgres://root@127.0.0.1:3317/kinga_gatec_wave4_contract",
  ])("rejects an unsafe target: %s", (target) => {
    expect(() => validateScratchTarget(target)).toThrow();
  });
});
