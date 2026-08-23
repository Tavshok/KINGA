/**
 * PURPOSE: Render the Executive Report Tab interaction or visual surface within the KINGA client.
 * PRIMARY CALLERS: Role-specific pages and dashboard compositions that provide its state and callbacks.
 * NEVER: Treat client-side presentation state as the source of tenant, role, or workflow authority.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { FileText, Download, Loader2, Calendar, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function fmtDate(ts: number | string) {
  return new Date(Number(ts)).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

export function ExecutiveReportTab() {
  const utils = trpc.useUtils();
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [generating, setGenerating] = useState(false);

  // Use existing getMyJobs filtered to executive.full_report
  const { data: myJobs, isLoading: loadingJobs } = trpc.reportingEngine.getMyJobs.useQuery(undefined, {
    refetchInterval: 8_000,
  });

  const recentReports = myJobs
    ?.filter((j: Record<string, unknown>) => j.report_key === "executive.full_report")
    .slice(0, 5) ?? [];

  const generateMutation = trpc.reportingEngine.generate.useMutation({
    onMutate: () => setGenerating(true),
    onSuccess: () => {
      toast.success("Executive Report is being generated — it will appear below when ready.");
      utils.reportingEngine.getMyJobs.invalidate();
      setGenerating(false);
    },
    onError: (err: { message: string }) => {
      toast.error(`Report generation failed: ${err.message}`);
      setGenerating(false);
    },
  });

  function handleGenerate() {
    generateMutation.mutate({
      reportKey: "executive.full_report",
      fromTs: new Date(fromDate).getTime(),
      toTs: new Date(toDate + "T23:59:59").getTime(),
      outputFormat: "pdf",
    });
  }

  return (
    <div className="space-y-6" style={{ fontFamily: "Inter, sans-serif" }}>
      {/* Generation card */}
      <div
        className="rounded-lg p-5"
        style={{ background: "var(--background)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-start gap-4">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "rgba(16,185,129,0.1)" }}
          >
            <FileText className="h-5 w-5" style={{ color: "#10B981" }} />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold" style={{ color: "var(--foreground)" }}>
              Executive Intelligence Report
            </h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
              A 7-section AI-narrated report: portfolio performance, financial impact, fraud intelligence,
              operational health, recovery pipeline, assessor performance, and the executive action register.
              Generation takes approximately 20–30 seconds.
            </p>
          </div>
        </div>

        {/* Period selector */}
        <div className="mt-5 flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
              From
            </label>
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5" style={{ color: "var(--muted-foreground)" }} />
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="text-sm rounded-md px-3 py-1.5"
                style={{
                  background: "var(--muted)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                  fontFamily: "Inter, sans-serif",
                }}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
              To
            </label>
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5" style={{ color: "var(--muted-foreground)" }} />
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="text-sm rounded-md px-3 py-1.5"
                style={{
                  background: "var(--muted)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                  fontFamily: "Inter, sans-serif",
                }}
              />
            </div>
          </div>
          <Button
            onClick={handleGenerate}
            disabled={generating || !fromDate || !toDate}
            className="flex items-center gap-2"
            style={{
              background: "#10B981",
              color: "white",
              border: "none",
              fontFamily: "Inter, sans-serif",
              fontWeight: 600,
            }}
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" />
                Generate Report
              </>
            )}
          </Button>
        </div>

        {/* Progress indicator */}
        {generating && (
          <div
            className="mt-4 rounded-md px-4 py-3 flex items-center gap-3"
            style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}
          >
            <Loader2 className="h-4 w-4 animate-spin shrink-0" style={{ color: "#10B981" }} />
            <div>
              <p className="text-sm font-medium" style={{ color: "#10B981" }}>Generating Executive Intelligence Report</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                Running SQL queries and AI narrative calls in parallel. This takes 20–30 seconds.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Recent reports */}
      <div
        className="rounded-lg"
        style={{ background: "var(--background)", border: "1px solid var(--border)" }}
      >
        <div
          className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h3 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
            Recent Reports
          </h3>
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            Last 5 generated
          </span>
        </div>

        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {loadingJobs ? (
            <div className="p-5 space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-10 rounded-md animate-pulse" style={{ background: "var(--muted)" }} />
              ))}
            </div>
          ) : recentReports.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="h-8 w-8 mx-auto mb-2" style={{ color: "var(--muted-foreground)", opacity: 0.4 }} />
              <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>No reports generated yet</p>
              <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                Select a period above and click Generate Report
              </p>
            </div>
          ) : (
            recentReports.map((report: Record<string, unknown>) => {
              const isReady = report.status === "completed" && Boolean(report.download_url);
              const isPending = report.status === "pending" || report.status === "processing";
              const isFailed = report.status === "failed";
              return (
                <div key={String(report.job_id)} className="px-5 py-3.5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                      style={{
                        background: isReady ? "rgba(16,185,129,0.1)" : isPending ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)",
                      }}
                    >
                      {isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#F59E0B" }} />
                      ) : (
                        <FileText className="h-4 w-4" style={{ color: isReady ? "#10B981" : "#EF4444" }} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--foreground)" }}>
                        Executive Intelligence Report
                      </p>
                      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                        {report.created_at ? fmtDate(report.created_at as number) : "—"}
                        {" · "}
                        {isReady ? "Ready" : isPending ? "Generating…" : "Failed"}
                        {report.page_count ? ` · ${String(report.page_count)} pages` : ""}
                      </p>
                    </div>
                  </div>
                  {isReady && (report.download_url as string) && (
                    <a
                      href={String(report.download_url as string)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs font-medium shrink-0"
                      style={{ color: "#10B981" }}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download PDF
                      <ChevronRight className="h-3 w-3" />
                    </a>
                  )}
                  {isFailed && (
                    <span className="text-xs shrink-0" style={{ color: "#EF4444" }}>Failed</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
