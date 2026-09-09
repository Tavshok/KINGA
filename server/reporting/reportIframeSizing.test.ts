import { describe, expect, it } from "vitest";
import { reportIframeHeight } from "../../client/src/lib/reportIframeSizing";

describe("reportIframeHeight", () => {
  it("uses the taller same-origin document dimension rather than retaining a viewport-sized iframe", () => {
    expect(reportIframeHeight({ bodyScrollHeight: 1200, documentScrollHeight: 6640 })).toBe(6640);
  });

  it("preserves a minimum usable portal height for a short or not-yet-measured report", () => {
    expect(reportIframeHeight({ bodyScrollHeight: 0, documentScrollHeight: null })).toBe(1200);
  });
});
