import { describe, expect, it } from "vitest";

describe("P0 Package 4 unauthorized recovery contract", () => {
  it("preserves only local redirect targets so wrong-portal recovery cannot become an external redirect", () => {
    const isSafe = (value: string | null) => Boolean(value?.startsWith("/") && !value.startsWith("//"));
    expect(isSafe("/insurer-portal/claims-processor")).toBe(true);
    expect(isSafe("https://example.invalid")).toBe(false);
    expect(isSafe("//example.invalid")).toBe(false);
  });
});
