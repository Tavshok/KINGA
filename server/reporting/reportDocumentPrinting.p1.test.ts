import { describe, expect, it } from "vitest";
import { printActiveReportDocument, scheduleReportDocumentPrint } from "../../client/src/lib/reportDocumentPrinting";

describe("embedded report print routing", () => {
  it("waits for two report-document frames, then focuses and prints that document", () => {
    const calls: string[] = [];
    const frames: FrameRequestCallback[] = [];
    const reportWindow = {
      requestAnimationFrame(callback: FrameRequestCallback) {
        calls.push("frame-requested");
        frames.push(callback);
        return frames.length;
      },
      focus() { calls.push("report-focus"); },
      print() { calls.push("report-print"); },
    };

    scheduleReportDocumentPrint(reportWindow);
    expect(calls).toEqual(["frame-requested"]);
    frames.shift()?.(0);
    expect(calls).toEqual(["frame-requested", "frame-requested"]);
    frames.shift()?.(0);
    expect(calls).toEqual(["frame-requested", "frame-requested", "report-focus", "report-print"]);
  });

  it("routes portal export to the active embedded report and preserves direct Claims Report printing", () => {
    const calls: string[] = [];
    const intelligence = { printReport: () => { calls.push("intelligence"); return true; } };
    const forensic = { printReport: () => { calls.push("forensic"); return true; } };
    const fallback = () => calls.push("portal");

    expect(printActiveReportDocument({ reportView: "intelligence", intelligence, forensic, printPortalDocument: fallback })).toBe(true);
    expect(printActiveReportDocument({ reportView: "forensic", intelligence, forensic, printPortalDocument: fallback })).toBe(true);
    expect(printActiveReportDocument({ reportView: "standard", intelligence, forensic, printPortalDocument: fallback })).toBe(false);
    expect(calls).toEqual(["intelligence", "forensic", "portal"]);
  });
});
