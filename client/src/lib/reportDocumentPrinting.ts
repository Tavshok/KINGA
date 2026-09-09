export interface ReportPrintWindow {
  requestAnimationFrame(callback: FrameRequestCallback): number;
  focus(): void;
  print(): void;
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
