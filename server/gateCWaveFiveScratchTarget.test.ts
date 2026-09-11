import { describe, expect, it } from "vitest";
import { validateScratchTarget } from "../scripts/gate-c-wave-five-replay.mjs";

describe("Gate C Wave 5 scratch target guard", () => {
  it("accepts only a uniquely named loopback mysql scratch target", () => {
    expect(validateScratchTarget("mysql://root@127.0.0.1:3317/kinga_gatec_wave5_test_123")).toEqual({ database: "kinga_gatec_wave5_test_123", host: "127.0.0.1", port: "3317" });
  });
  it("rejects external, non-mysql, and non-scratch targets before a connection can open", () => {
    expect(() => validateScratchTarget("mysql://root@kinga-staging.example/kinga_gatec_wave5_test_123")).toThrow(/non-loopback/);
    expect(() => validateScratchTarget("mysql://root@127.0.0.1:3317/kinga_staging")).toThrow(/kinga_gatec/);
    expect(() => validateScratchTarget("postgres://root@127.0.0.1/kinga_gatec_wave5_test_123")).toThrow(/mysql/);
  });
});
