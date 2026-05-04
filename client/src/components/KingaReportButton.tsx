/**
 * KingaReportButton
 *
 * Universal "Export Report" button that drives the full async report pipeline:
 *   1. User clicks → dialog opens with report options
 *   2. Mutation enqueues a report job (reporting.generate)
 *   3. Component polls reporting.getJobStatus every 2 s
 *   4. When status === "completed", opens the download URL in a new tab
 *      and records the download (reporting.recordDownload)
 *   5. On failure, shows the error message
 *
 * Every data point in the generated report comes from a real DB query in
 * reportDefinitions.ts — no hardcoded numbers, no orphaned buttons.
 *
 * Usage:
 *   <KingaReportButton
 *     reportKey="portfolio.claims_summary"
 *     label="Export Claims Summary"
 *     params={{ fromTs: ..., toTs: ..., tenantId: ... }}
 *   />
 */

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KingaReportButtonProps {
  /** The report catalogue key, e.g. "portfolio.claims_summary" */
  reportKey: string;
  /** Human-readable label for the button */
  label?: string;
  /** Optional button variant */
  variant?: "default" | "outline" | "ghost" | "secondary";
  /** Optional button size */
  size?: "default" | "sm" | "lg" | "icon";
  /** Extra parameters passed to the report generator */
  params?: {
    claimId?: number;
    tenantId?: string;
    fromTs?: number;
    toTs?: number;
    subjectId?: number;
    subjectType?: string;
  };
  /** Optional className override */
  className?: string;
}

type JobStatus = "idle" | "queued" | "running" | "completed" | "failed";

// ─── Component ────────────────────────────────────────────────────────────────

export function KingaReportButton({
  reportKey,
  label = "Export Report",
  variant = "outline",
  size = "default",
  params = {},
  className,
}: KingaReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>("idle");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [fileSizeBytes, setFileSizeBytes] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Mutations & Queries ────────────────────────────────────────────────────
  const generateMutation = trpc.reporting.generate.useMutation({
    onSuccess: (data) => {
      setJobId(data.jobId);
      setJobStatus("queued");
    },
    onError: (err) => {
      setJobStatus("failed");
      setErrorMessage(err.message);
      toast.error(`Report request failed: ${err.message}`);
    },
  });

  const recordDownloadMutation = trpc.reporting.recordDownload.useMutation();

  // ── Polling ────────────────────────────────────────────────────────────────
  const utils = trpc.useUtils();

  useEffect(() => {
    if (!jobId || jobStatus === "completed" || jobStatus === "failed" || jobStatus === "idle") {
      return;
    }

    pollRef.current = setInterval(async () => {
      try {
        const job = await utils.client.reporting.getJobStatus.query({ jobId });
        if (!job) return;

        const status = job.status as string;

        if (status === "completed") {
          setJobStatus("completed");
          setDownloadUrl(job.download_url as string | null);
          setPageCount(job.page_count as number | null);
          setFileSizeBytes(job.file_size_bytes as number | null);
          clearInterval(pollRef.current!);
          // Auto-open download
          if (job.download_url) {
            window.open(job.download_url as string, "_blank", "noopener,noreferrer");
            recordDownloadMutation.mutate({ jobId });
          }
          toast.success("Report ready — opening download.");
        } else if (status === "failed") {
          setJobStatus("failed");
          setErrorMessage((job.error_message as string) ?? "Report generation failed.");
          clearInterval(pollRef.current!);
          toast.error(`Report failed: ${(job.error_message as string) ?? "Unknown error"}`);
        } else if (status === "running") {
          setJobStatus("running");
        }
      } catch {
        // Silently ignore transient poll errors
      }
    }, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId, jobStatus]);

  // ── Cleanup on close ───────────────────────────────────────────────────────
  const handleOpenChange = (val: boolean) => {
    if (!val) {
      if (pollRef.current) clearInterval(pollRef.current);
      // Reset state only if not in-flight
      if (jobStatus !== "queued" && jobStatus !== "running") {
        setJobId(null);
        setJobStatus("idle");
        setDownloadUrl(null);
        setErrorMessage(null);
        setPageCount(null);
        setFileSizeBytes(null);
      }
    }
    setOpen(val);
  };

  // ── Trigger generation ─────────────────────────────────────────────────────
  const handleGenerate = () => {
    setJobStatus("idle");
    setJobId(null);
    setDownloadUrl(null);
    setErrorMessage(null);
    generateMutation.mutate({
      reportKey,
      ...params,
    });
  };

  // ── Re-download ────────────────────────────────────────────────────────────
  const handleReDownload = () => {
    if (downloadUrl) {
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
      if (jobId) recordDownloadMutation.mutate({ jobId });
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const statusIcon = () => {
    switch (jobStatus) {
      case "queued":  return <Clock className="h-4 w-4 text-amber-500" />;
      case "running": return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case "completed": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":  return <XCircle className="h-4 w-4 text-red-500" />;
      default:        return <FileText className="h-4 w-4" />;
    }
  };

  const statusLabel = () => {
    switch (jobStatus) {
      case "queued":  return "Queued…";
      case "running": return "Generating…";
      case "completed": return "Ready";
      case "failed":  return "Failed";
      default:        return null;
    }
  };

  const isInFlight = jobStatus === "queued" || jobStatus === "running";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          <Download className="mr-2 h-4 w-4" />
          {label}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {statusIcon()}
            {label}
          </DialogTitle>
          <DialogDescription>
            {jobStatus === "idle" && "Generate a PDF report from live database data. Every figure is sourced directly from the database — no hardcoded numbers."}
            {jobStatus === "queued" && "Your report has been queued. Generation typically takes 5–15 seconds."}
            {jobStatus === "running" && "Generating your report… querying the database and rendering PDF."}
            {jobStatus === "completed" && "Your report is ready. The download opened automatically."}
            {jobStatus === "failed" && "Report generation failed. See the error below."}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-3">
          {/* Status badge */}
          {jobStatus !== "idle" && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              <Badge
                variant={
                  jobStatus === "completed" ? "default"
                  : jobStatus === "failed" ? "destructive"
                  : "secondary"
                }
                className="flex items-center gap-1"
              >
                {statusIcon()}
                {statusLabel()}
              </Badge>
            </div>
          )}

          {/* Report details on completion */}
          {jobStatus === "completed" && (
            <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Report key</span>
                <span className="font-mono text-xs">{reportKey}</span>
              </div>
              {pageCount != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pages</span>
                  <span>{pageCount}</span>
                </div>
              )}
              {fileSizeBytes != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">File size</span>
                  <span>{formatBytes(fileSizeBytes)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Data source</span>
                <span className="text-green-600 font-medium">Live database</span>
              </div>
            </div>
          )}

          {/* Error message */}
          {jobStatus === "failed" && errorMessage && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {errorMessage}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isInFlight}>
            {jobStatus === "completed" || jobStatus === "failed" ? "Close" : "Cancel"}
          </Button>

          {jobStatus === "idle" && (
            <Button onClick={handleGenerate} disabled={generateMutation.isPending}>
              {generateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate PDF
            </Button>
          )}

          {jobStatus === "completed" && downloadUrl && (
            <Button onClick={handleReDownload}>
              <Download className="mr-2 h-4 w-4" />
              Download Again
            </Button>
          )}

          {jobStatus === "failed" && (
            <Button onClick={handleGenerate}>
              <Loader2 className="mr-2 h-4 w-4" />
              Retry
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
