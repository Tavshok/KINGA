export interface ReportPrintWindow {
  requestAnimationFrame(callback: FrameRequestCallback): number;
  focus(): void;
  print(): void;
}

export type ReportPrintFailureCode =
  | "report-unavailable"
  | "popup-blocked"
  | "empty-report"
  | "print-window-closed";

export interface ReportPrintFailure {
  code: ReportPrintFailureCode;
  message: string;
}

export interface ReportPrintAttempt {
  started: boolean;
  failure?: ReportPrintFailure;
}

export interface DedicatedReportPrintWindow extends ReportPrintWindow {
  closed: boolean;
  close(): void;
  document: Document;
}

export interface EmbeddedReportPrintHandle {
  printReport(): ReportPrintAttempt;
}

const REPORT_READY_TIMEOUT_MS = 5_000;

function failed(code: ReportPrintFailureCode, message: string): ReportPrintAttempt {
  return { started: false, failure: { code, message } };
}

function hasSubstantiveReportContent(document: Pick<Document, "body" | "documentElement">): boolean {
  const text = document.body?.innerText?.replace(/\s+/g, " ").trim() ?? "";
  const height = Math.max(
    document.body?.scrollHeight ?? 0,
    document.documentElement?.scrollHeight ?? 0,
  );
  return text.length > 0 || height > 0;
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Copies the full server-rendered report document, including its head, inline print
 * CSS, and server-owned body markup. The explicit base makes relative resources work
 * even though the iframe document was created with document.write and has about:blank
 * as its own URL.
 */
export function serialiseReportPrintDocument(sourceDocument: Document, baseHref: string): string | null {
  const html = sourceDocument.documentElement?.outerHTML;
  if (!html) return null;

  const doctype = sourceDocument.doctype
    ? `<!DOCTYPE ${sourceDocument.doctype.name}>`
    : "<!DOCTYPE html>";
  const baseTag = `<base href="${escapeHtmlAttribute(baseHref)}">`;
  const withBase = /<base\b/i.test(html)
    ? html
    : html.replace(/<head(\b[^>]*)>/i, `<head$1>${baseTag}`);

  return `${doctype}${withBase}`;
}

function settleWithTimeout(promise: Promise<unknown>, timeoutMs: number): Promise<void> {
  return new Promise(resolve => {
    const timeout = globalThis.setTimeout(resolve, timeoutMs);
    void promise.finally(() => {
      globalThis.clearTimeout(timeout);
      resolve();
    });
  });
}

function waitForReportImages(document: Document): Promise<void> {
  const images = Array.from(document.images ?? []);
  return Promise.all(images.map(image => {
    if (image.complete) return Promise.resolve();
    return new Promise<void>(resolve => {
      const settled = () => resolve();
      image.addEventListener("load", settled, { once: true });
      image.addEventListener("error", settled, { once: true });
    });
  })).then(() => undefined);
}

function waitForReportFonts(document: Document): Promise<unknown> {
  return document.fonts?.ready ?? Promise.resolve();
}

function waitForReportDocumentLoad(document: Document): Promise<void> {
  if (document.readyState === "complete" || !document.defaultView) return Promise.resolve();
  return new Promise(resolve => {
    document.defaultView?.addEventListener("load", () => resolve(), { once: true });
  });
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

/**
 * Opens a separate same-origin window synchronously from the user gesture, writes a
 * complete server-rendered report document into it, waits for its visual resources,
 * and prints only that document. The portal shell, iframe controls, and parent print
 * CSS are deliberately excluded from this path.
 */
export function openReportPrintDocument(options: {
  sourceDocument: Document | null;
  baseHref: string;
  openWindow?: () => DedicatedReportPrintWindow | null;
  onFailure?: (failure: ReportPrintFailure) => void;
}): ReportPrintAttempt {
  const sourceDocument = options.sourceDocument;
  if (!sourceDocument) {
    const attempt = failed(
      "report-unavailable",
      "The report is not ready to print yet. Wait for it to finish loading and try again.",
    );
    options.onFailure?.(attempt.failure!);
    return attempt;
  }
  if (!hasSubstantiveReportContent(sourceDocument)) {
    const attempt = failed("empty-report", "The report document is empty and was not sent to print.");
    options.onFailure?.(attempt.failure!);
    return attempt;
  }

  const reportHtml = serialiseReportPrintDocument(sourceDocument, options.baseHref);
  if (!reportHtml) {
    const attempt = failed("empty-report", "The report document is empty and was not sent to print.");
    options.onFailure?.(attempt.failure!);
    return attempt;
  }

  // This call must remain synchronous with the click handler or browser popup rules
  // can reject it. Do not defer it through setTimeout, a promise, or a React effect.
  const browserWindow = typeof window === "undefined" ? null : window;
  const reportWindow = options.openWindow?.() ?? browserWindow?.open("", "_blank", "popup=yes,width=1100,height=850");
  if (!reportWindow) {
    const attempt = failed(
      "popup-blocked",
      "The report print window was blocked. Allow pop-ups for KINGA, then try printing again.",
    );
    options.onFailure?.(attempt.failure!);
    return attempt;
  }

  try {
    reportWindow.document.open();
    reportWindow.document.write(reportHtml);
    reportWindow.document.close();
  } catch {
    reportWindow.close();
    const attempt = failed("report-unavailable", "KINGA could not prepare the report print document.");
    options.onFailure?.(attempt.failure!);
    return attempt;
  }

  void settleWithTimeout(
    Promise.all([
      waitForReportDocumentLoad(reportWindow.document),
      waitForReportFonts(reportWindow.document),
      waitForReportImages(reportWindow.document),
    ]),
    REPORT_READY_TIMEOUT_MS,
  ).then(() => {
    if (reportWindow.closed) {
      options.onFailure?.({
        code: "print-window-closed",
        message: "The report print window was closed before printing could start.",
      });
      return;
    }
    if (!hasSubstantiveReportContent(reportWindow.document)) {
      reportWindow.close();
      options.onFailure?.({
        code: "empty-report",
        message: "The report print document contained no printable content.",
      });
      return;
    }
    scheduleReportDocumentPrint(reportWindow);
  });

  return { started: true };
}

/**
 * Routes portal-level export requests to CI/Forensic report documents. Standard
 * Claims Reports remain direct documents and retain their parent-window print path.
 * A failed embedded print never falls back to portal printing: that would recreate
 * the blank-first-page and visible-viewport defects this boundary eliminates.
 */
export function printActiveReportDocument(options: {
  reportView: "standard" | "intelligence" | "forensic";
  intelligence?: EmbeddedReportPrintHandle | null;
  forensic?: EmbeddedReportPrintHandle | null;
  printPortalDocument: () => void;
  onEmbeddedPrintUnavailable?: (failure: ReportPrintFailure) => void;
}): ReportPrintAttempt {
  if (options.reportView === "standard") {
    options.printPortalDocument();
    return { started: true };
  }

  const embeddedReport = options.reportView === "intelligence"
    ? options.intelligence
    : options.forensic;
  const attempt = embeddedReport?.printReport() ?? failed(
    "report-unavailable",
    "The selected report is not ready to print yet. Wait for it to finish loading and try again.",
  );

  if (!attempt.started) options.onEmbeddedPrintUnavailable?.(attempt.failure!);
  return attempt;
}
