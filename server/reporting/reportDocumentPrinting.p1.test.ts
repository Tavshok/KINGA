import { describe, expect, it, vi } from "vitest";
import {
  openReportPrintDocument,
  printActiveReportDocument,
  scheduleReportDocumentPrint,
  type DedicatedReportPrintWindow,
} from "../../client/src/lib/reportDocumentPrinting";

function reportDocument(content: string, height = 640): Document {
  return {
    doctype: { name: "html" },
    documentElement: {
      outerHTML: `<html><head><style>@media print { .page { break-after: page; } }</style></head><body>${content}</body></html>`,
      scrollHeight: height,
    },
    body: { innerText: content.replace(/<[^>]+>/g, ""), scrollHeight: height },
    images: [],
  } as unknown as Document;
}

function printWindow(document: Document, calls: string[], frames: FrameRequestCallback[]): DedicatedReportPrintWindow {
  return {
    closed: false,
    document,
    close: () => calls.push("close"),
    focus: () => calls.push("focus"),
    print: () => calls.push("print"),
    requestAnimationFrame: callback => {
      calls.push("frame-requested");
      frames.push(callback);
      return frames.length;
    },
  };
}

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
    const intelligence = { printReport: () => { calls.push("intelligence"); return { started: true }; } };
    const forensic = { printReport: () => { calls.push("forensic"); return { started: true }; } };
    const fallback = () => calls.push("portal");

    expect(printActiveReportDocument({ reportView: "intelligence", intelligence, forensic, printPortalDocument: fallback }).started).toBe(true);
    expect(printActiveReportDocument({ reportView: "forensic", intelligence, forensic, printPortalDocument: fallback }).started).toBe(true);
    expect(printActiveReportDocument({ reportView: "standard", intelligence, forensic, printPortalDocument: fallback }).started).toBe(true);
    expect(calls).toEqual(["intelligence", "forensic", "portal"]);
  });

  it("uses a dedicated full-document window for CI/FR printing and preserves the report head, CSS, body, and base URL", async () => {
    const calls: string[] = [];
    const frames: FrameRequestCallback[] = [];
    const childDocument = reportDocument("<main>Claims Intelligence content</main>");
    const write = vi.fn();
    childDocument.open = vi.fn();
    childDocument.write = write;
    childDocument.close = vi.fn();
    const child = printWindow(childDocument, calls, frames);

    const result = openReportPrintDocument({
      sourceDocument: reportDocument("<main>Claims Intelligence content</main>"),
      baseHref: "https://kinga.example/insurer/claims/123/comparison",
      openWindow: () => child,
    });

    expect(result).toEqual({ started: true });
    expect(childDocument.open).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledOnce();
    expect(write.mock.calls[0]?.[0]).toContain("<!DOCTYPE html>");
    expect(write.mock.calls[0]?.[0]).toContain("<base href=\"https://kinga.example/insurer/claims/123/comparison\">");
    expect(write.mock.calls[0]?.[0]).toContain("@media print");
    expect(write.mock.calls[0]?.[0]).toContain("Claims Intelligence content");

    await vi.waitFor(() => expect(calls).toEqual(["frame-requested"]));
    frames.shift()?.(0);
    frames.shift()?.(0);
    expect(calls).toEqual(["frame-requested", "frame-requested", "focus", "print"]);
  });

  it("waits for the copied print document to load before it schedules printing", async () => {
    const calls: string[] = [];
    const frames: FrameRequestCallback[] = [];
    const childDocument = reportDocument("<main>Forensic content</main>");
    const listeners: Array<() => void> = [];
    Object.defineProperties(childDocument, {
      readyState: { value: "loading" },
      defaultView: {
        value: {
          addEventListener: (type: string, listener: () => void) => {
            if (type === "load") listeners.push(listener);
          },
        },
      },
    });
    childDocument.open = vi.fn();
    childDocument.write = vi.fn();
    childDocument.close = vi.fn();
    const child = printWindow(childDocument, calls, frames);

    expect(openReportPrintDocument({
      sourceDocument: reportDocument("<main>Forensic content</main>"),
      baseHref: "https://kinga.example/forensic",
      openWindow: () => child,
    })).toEqual({ started: true });
    await Promise.resolve();
    expect(calls).toEqual([]);

    listeners.forEach(listener => listener());
    await vi.waitFor(() => expect(calls).toEqual(["frame-requested"]));
  });

  it("reports a blocked popup or unavailable embedded report without falling back to portal printing", () => {
    const unavailable: string[] = [];
    const popupResult = openReportPrintDocument({
      sourceDocument: reportDocument("<main>Forensic content</main>"),
      baseHref: "https://kinga.example/report",
      openWindow: () => null,
      onFailure: failure => unavailable.push(failure.code),
    });
    expect(popupResult).toEqual({
      started: false,
      failure: expect.objectContaining({ code: "popup-blocked" }),
    });
    expect(unavailable).toEqual(["popup-blocked"]);

    const openEmptyReportWindow = vi.fn();
    const emptyResult = openReportPrintDocument({
      sourceDocument: reportDocument("", 0),
      baseHref: "https://kinga.example/report",
      openWindow: openEmptyReportWindow,
    });
    expect(emptyResult).toEqual({
      started: false,
      failure: expect.objectContaining({ code: "empty-report" }),
    });
    expect(openEmptyReportWindow).not.toHaveBeenCalled();

    const calls: string[] = [];
    const missingResult = printActiveReportDocument({
      reportView: "forensic",
      printPortalDocument: () => calls.push("portal"),
      onEmbeddedPrintUnavailable: failure => calls.push(failure.code),
    });
    expect(missingResult.started).toBe(false);
    expect(calls).toEqual(["report-unavailable"]);
  });
});
