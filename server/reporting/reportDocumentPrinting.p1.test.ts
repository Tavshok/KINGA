import { describe, expect, it } from "vitest";
import { scheduleReportDocumentPrint } from "../../client/src/lib/reportDocumentPrinting";

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
});
