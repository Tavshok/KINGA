import { describe, expect, it } from "vitest";
import { validateScratchTarget } from "../scripts/gate-c-photo-reextraction-supplement-replay.mjs";

describe("Gate C photo-reextraction supplemental scratch target guard", () => {
  it("accepts only a unique loopback mysql scratch target", () => {
    expect(validateScratchTarget("mysql://root@127.0.0.1:3317/kinga_gatec_photo_reextract_123")).toEqual({ database: "kinga_gatec_photo_reextract_123", host: "127.0.0.1", port: "3317" });
  });
  it("rejects external, non-mysql, and non-scratch targets before opening a connection", () => {
    expect(() => validateScratchTarget("mysql://root@kinga-staging.example/kinga_gatec_photo_reextract_123")).toThrow(/non-loopback/);
    expect(() => validateScratchTarget("mysql://root@127.0.0.1:3317/kinga_staging")).toThrow(/kinga_gatec/);
    expect(() => validateScratchTarget("postgres://root@127.0.0.1/kinga_gatec_photo_reextract_123")).toThrow(/mysql/);
  });
});
