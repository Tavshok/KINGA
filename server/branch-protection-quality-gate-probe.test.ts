import { describe, expect, it } from "vitest";

describe("branch protection quality-gate probe", () => {
  it("fails intentionally so the required check cannot pass", () => {
    expect("deliberate branch-protection probe").toBe("quality gate must block this pull request");
  });
});
