export interface ReportPrintWindow {
  requestAnimationFrame(callback: FrameRequestCallback): number;
  focus(): void;
  print(): void;
}

export interface EmbeddedReportPrintHandle {
  printReport(): boolean;
}

/**
 * Schedules printing from the report document itself rather than its portal host.
 * Printing an iframe from the parent window produces an otherwise blank parent page
 * before the embedded report in Chromium's print pipeline.
 */
export function scheduleReportDocumentPrint(reportWindow: ReportPrintWindow): void {
  reportWindow.requestAnimationFrame(() => {
    reportWindow.requestAnimationFrame(() => {
      reportWindow.focus();
      reportWindow.print();
    });
  });
}

export function printIframeReport(iframe: HTMLIFrameElement | null, beforePrint?: () => void): boolean {
  const reportWindow = iframe?.contentWindow;
  if (!reportWindow) return false;
  beforePrint?.();
  scheduleReportDocumentPrint(reportWindow);
  return true;
}

/**
 * Routes a portal-level export request to the mounted report document when one
 * is embedded. Standard Claims Reports remain direct documents and retain the
 * caller's parent-window print fallback.
 */
export function printActiveReportDocument(options: {
  reportView: "standard" | "intelligence" | "forensic";
  intelligence?: EmbeddedReportPrintHandle | null;
  forensic?: EmbeddedReportPrintHandle | null;
  printPortalDocument: () => void;
}): boolean {
  const embeddedReport = options.reportView === "intelligence"
    ? options.intelligence
    : options.reportView === "forensic"
      ? options.forensic
      : null;

  if (embeddedReport?.printReport()) return true;
  options.printPortalDocument();
  return false;
}
