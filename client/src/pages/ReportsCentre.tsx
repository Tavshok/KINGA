import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Download, RefreshCw, Clock, CheckCircle, XCircle,
  AlertTriangle, Play, Calendar, Shield, BarChart3, Search,
  FileBarChart, RotateCcw, Info, ChevronRight
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ReportJob {
  job_id: string;
  report_key: string;
  status: "queued" | "processing" | "completed" | "failed";
  output_format: string;
  download_count: number;
  error_message?: string;
  started_at?: number;
  completed_at?: number;
  file_size_bytes?: number;
  page_count?: number;
  created_at: number;
  download_url?: string;
}

interface CatalogueEntry {
  key: string;
  name: string;
  category: string;
  description: string;
  requiresClaimId: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_ICONS: Record<string, React.ReactElement> = {
  queued:     <Clock className="h-4 w-4 text-gray-400" />,
  processing: <RefreshCw className="h-4 w-4 text-gray-500 animate-spin" />,
  completed:  <CheckCircle className="h-4 w-4 text-gray-700" />,
  failed:     <XCircle className="h-4 w-4 text-red-500" />,
};

const STATUS_BADGE: Record<string, string> = {
  queued:     "bg-gray-100 text-gray-600 border border-gray-200",
  processing: "bg-gray-200 text-gray-700 border border-gray-300",
  completed:  "bg-gray-800 text-white",
  failed:     "bg-red-100 text-red-700 border border-red-200",
};

const CATEGORY_ICONS: Record<string, React.ReactElement> = {
  "Individual Claim": <FileText className="h-4 w-4" />,
  "Portfolio":        <BarChart3 className="h-4 w-4" />,
  "Executive":        <FileBarChart className="h-4 w-4" />,
  "Governance":       <Shield className="h-4 w-4" />,
};

function fmtBytes(b?: number): string {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDuration(start?: number, end?: number): string {
  if (!start || !end) return "—";
  const secs = Math.round((end - start) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function fmtDate(ts?: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Generate Report Dialog ────────────────────────────────────────────────────
function GenerateDialog({
  report,
  onClose,
  onGenerated,
}: {
  report: CatalogueEntry;
  onClose: () => void;
  onGenerated: (jobId: string) => void;
}) {
  const { toast } = useToast();
  const [claimId, setClaimId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [format, setFormat] = useState<"pdf" | "excel">("pdf");
  const [subjectId, setSubjectId] = useState("");

  const generate = trpc.reportingEngine.generate.useMutation({
    onSuccess: (data) => {
      toast({ title: "Report queued", description: `Job ${data.jobId} is being generated.` });
      onGenerated(data.jobId);
      onClose();
    },
    onError: (e) => toast({ title: "Failed to queue report", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    generate.mutate({
      reportKey: report.key,
      claimId:   report.requiresClaimId && claimId ? parseInt(claimId) : undefined,
      fromTs:    fromDate ? new Date(fromDate).getTime() : undefined,
      toTs:      toDate   ? new Date(toDate).getTime()   : undefined,
      subjectId: subjectId ? parseInt(subjectId) : undefined,
      outputFormat: format,
    });
  };

  return (
    <DialogContent className="max-w-md bg-white">
      <DialogHeader>
        <DialogTitle className="text-base font-semibold text-gray-900">{report.name}</DialogTitle>
        <p className="text-xs text-gray-500 mt-1">{report.description}</p>
      </DialogHeader>

      <div className="space-y-4 py-2">
        {report.requiresClaimId && (
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Claim ID *</label>
            <Input
              type="number"
              placeholder="e.g. 4560001"
              value={claimId}
              onChange={(e) => setClaimId(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        )}

        {!report.requiresClaimId && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">From Date</label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">To Date</label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
        )}

        {report.key === "governance.sar" && (
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Data Subject Claimant ID *</label>
            <Input
              type="number"
              placeholder="Claimant ID"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">Output Format</label>
          <Select value={format} onValueChange={(v) => setFormat(v as "pdf" | "excel")}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pdf">PDF Document</SelectItem>
              <SelectItem value="excel">Excel Spreadsheet</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose} className="text-xs">Cancel</Button>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={generate.isPending || (report.requiresClaimId && !claimId)}
          className="text-xs bg-gray-900 text-white hover:bg-gray-700"
        >
          {generate.isPending ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
          Generate Report
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Admin Regeneration Dialog ────────────────────────────────────────────────
function AdminRegenDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [claimId, setClaimId] = useState("");
  const [reason, setReason] = useState("");

  const regen = trpc.reportingEngine.adminRegeneratePipeline.useMutation({
    onSuccess: (data) => {
      toast({ title: "Pipeline reset", description: data.message });
      onClose();
    },
    onError: (e) => toast({ title: "Cannot regenerate", description: e.message, variant: "destructive" }),
  });

  return (
    <DialogContent className="max-w-md bg-white">
      <DialogHeader>
        <DialogTitle className="text-base font-semibold text-gray-900">Admin Pipeline Regeneration</DialogTitle>
      </DialogHeader>

      <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800 space-y-1">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <div>
            <strong>Governance Notice:</strong> This action resets the claim to <code>intake_pending</code> and triggers a new AI assessment. The original assessment is preserved as an immutable record. Only claims in <em>intake_pending, failed, or in_review</em> states can be regenerated. This action is fully audited.
          </div>
        </div>
      </div>

      <div className="space-y-4 py-2">
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">Claim ID *</label>
          <Input
            type="number"
            placeholder="e.g. 4560001"
            value={claimId}
            onChange={(e) => setClaimId(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">Reason for Regeneration * (min 10 chars)</label>
          <Textarea
            placeholder="e.g. Client uploaded corrected police report — original extraction failed due to poor scan quality."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="text-sm min-h-[80px]"
          />
          <p className="text-xs text-gray-400 mt-1">{reason.length}/10 minimum characters</p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose} className="text-xs">Cancel</Button>
        <Button
          size="sm"
          onClick={() => regen.mutate({ claimId: parseInt(claimId), reason })}
          disabled={regen.isPending || !claimId || reason.length < 10}
          className="text-xs bg-gray-900 text-white hover:bg-gray-700"
        >
          {regen.isPending ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <RotateCcw className="h-3 w-3 mr-1" />}
          Reset & Regenerate
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Job Row ──────────────────────────────────────────────────────────────────
function JobRow({ job, onPoll }: { job: ReportJob; onPoll: (jobId: string) => void }) {
  const { toast } = useToast();
  const recordDownload = trpc.reportingEngine.recordDownload.useMutation();

  const handleDownload = () => {
    if (job.download_url) {
      recordDownload.mutate({ jobId: job.job_id });
      window.open(job.download_url, "_blank");
    } else {
      toast({ title: "Download not available", description: "The report file URL is not yet available.", variant: "destructive" });
    }
  };

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="py-3 px-4">
        <div className="font-mono text-xs text-gray-500">{job.job_id.slice(0, 12)}…</div>
        <div className="text-xs text-gray-700 font-medium mt-0.5">{job.report_key}</div>
      </td>
      <td className="py-3 px-4">
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[job.status] ?? STATUS_BADGE.queued}`}>
          {STATUS_ICONS[job.status]}
          {job.status}
        </span>
      </td>
      <td className="py-3 px-4 text-xs text-gray-600">{job.output_format.toUpperCase()}</td>
      <td className="py-3 px-4 text-xs text-gray-600">{fmtDate(job.created_at)}</td>
      <td className="py-3 px-4 text-xs text-gray-600">
        {fmtDuration(job.started_at, job.completed_at)}
      </td>
      <td className="py-3 px-4 text-xs text-gray-600">{fmtBytes(job.file_size_bytes)}</td>
      <td className="py-3 px-4 text-xs text-gray-600">{job.download_count}</td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          {job.status === "completed" && (
            <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={handleDownload}>
              <Download className="h-3 w-3 mr-1" /> Download
            </Button>
          )}
          {(job.status === "queued" || job.status === "processing") && (
            <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => onPoll(job.job_id)}>
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
          )}
          {job.status === "failed" && (
            <span className="text-xs text-red-500 max-w-[180px] truncate" title={job.error_message}>
              {job.error_message ?? "Unknown error"}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Schedule Report Dialog ────────────────────────────────────────────────────────────────────────────────
const CRON_PRESETS = [
  { label: "Daily at 06:00",       value: "0 6 * * *" },
  { label: "Weekly (Mon 06:00)",   value: "0 6 * * 1" },
  { label: "Monthly (1st 06:00)",  value: "0 6 1 * *" },
  { label: "Quarterly (1st Jan/Apr/Jul/Oct)", value: "0 6 1 1,4,7,10 *" },
  { label: "Custom",               value: "custom" },
];

const SCHEDULABLE_REPORTS = [
  "portfolio.claims_summary",
  "portfolio.fraud_summary",
  "portfolio.assessor_performance",
  "portfolio.panel_beater_performance",
  "portfolio.dwell_time",
  "executive.platform_dashboard",
  "governance.regulatory_compliance",
];

interface ScheduleEntry {
  id: number;
  report_key: string;
  schedule_cron: string;
  schedule_label: string;
  is_active: number;
  tenant_id: string | null;
  delivery_emails: string;
  last_run_at?: number;
  next_run_at?: number;
  created_at: number;
}

function ScheduleDialog({
  catalogue,
  onClose,
  onCreated,
}: {
  catalogue: CatalogueEntry[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [reportKey, setReportKey] = useState(SCHEDULABLE_REPORTS[0]);
  const [label, setLabel] = useState("");
  const [cronPreset, setCronPreset] = useState(CRON_PRESETS[1].value);
  const [customCron, setCustomCron] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [emails, setEmails] = useState<string[]>([]);

  const create = trpc.reportingEngine.createSchedule.useMutation({
    onSuccess: () => {
      toast({ title: "Schedule created", description: `Report will be delivered on the configured schedule.` });
      onCreated();
      onClose();
    },
    onError: (e) => toast({ title: "Failed to create schedule", description: e.message, variant: "destructive" }),
  });

  const addEmail = () => {
    const e = emailInput.trim();
    if (e && /^[^@]+@[^@]+\.[^@]+$/.test(e) && !emails.includes(e)) {
      setEmails([...emails, e]);
      setEmailInput("");
    }
  };

  const cronValue = cronPreset === "custom" ? customCron : cronPreset;

  return (
    <DialogContent className="max-w-lg bg-white">
      <DialogHeader>
        <DialogTitle className="text-base font-semibold text-gray-900">Create Scheduled Report</DialogTitle>
        <p className="text-xs text-gray-500 mt-1">Reports will be generated automatically and emailed to the specified recipients.</p>
      </DialogHeader>

      <div className="space-y-4 py-2">
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">Report Type *</label>
          <Select value={reportKey} onValueChange={setReportKey}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCHEDULABLE_REPORTS.map((key) => {
                const entry = catalogue.find((c) => c.key === key);
                return (
                  <SelectItem key={key} value={key}>
                    {entry?.name ?? key}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">Schedule Label *</label>
          <Input
            placeholder="e.g. Monthly Fraud Summary — Finance Team"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">Frequency *</label>
          <Select value={cronPreset} onValueChange={setCronPreset}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CRON_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {cronPreset === "custom" && (
            <Input
              placeholder="Cron expression e.g. 0 8 * * 1"
              value={customCron}
              onChange={(e) => setCustomCron(e.target.value)}
              className="h-8 text-sm mt-2 font-mono"
            />
          )}
          {cronValue && cronPreset !== "custom" && (
            <p className="text-xs text-gray-400 mt-1 font-mono">{cronValue}</p>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">Delivery Email Addresses *</label>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="email@insurer.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEmail())}
              className="h-8 text-sm flex-1"
            />
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={addEmail}>
              Add
            </Button>
          </div>
          {emails.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {emails.map((e) => (
                <span key={e} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded">
                  {e}
                  <button onClick={() => setEmails(emails.filter((x) => x !== e))} className="text-gray-400 hover:text-gray-700">×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose} className="text-xs">Cancel</Button>
        <Button
          size="sm"
          onClick={() => create.mutate({ reportKey, scheduleLabel: label, scheduleCron: cronValue, deliveryEmails: emails })}
          disabled={create.isPending || !label || !cronValue || emails.length === 0}
          className="text-xs bg-gray-900 text-white hover:bg-gray-700"
        >
          {create.isPending ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <Calendar className="h-3 w-3 mr-1" />}
          Create Schedule
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────────────────────
export default function ReportsCentre() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("catalogue");
  const [search, setSearch] = useState("");
  const [selectedReport, setSelectedReport] = useState<CatalogueEntry | null>(null);
  const [showRegen, setShowRegen] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [pollingJobId, setPollingJobId] = useState<string | null>(null);
  const { data: catalogue = [], isLoading: catLoading } = trpc.reportingEngine.getCatalogue.useQuery();
  const { data: myJobs = [], refetch: refetchJobs } = trpc.reportingEngine.getMyJobs.useQuery();
  const { data: schedules = [], refetch: refetchSchedules } = trpc.reportingEngine.getScheduledReports.useQuery();
  const deleteSchedule = trpc.reportingEngine.deleteSchedule.useMutation({
    onSuccess: () => { toast({ title: "Schedule deleted" }); refetchSchedules(); },
    onError: (e) => toast({ title: "Failed to delete schedule", description: e.message, variant: "destructive" }),
  });
  const toggleSchedule = trpc.reportingEngine.toggleSchedule.useMutation({
    onSuccess: () => refetchSchedules(),
    onError: (e) => toast({ title: "Failed to update schedule", description: e.message, variant: "destructive" }),
  });

  // Poll a specific job
  const { data: polledJob } = trpc.reportingEngine.getJobStatus.useQuery(
    { jobId: pollingJobId! },
    { enabled: !!pollingJobId, refetchInterval: pollingJobId ? 3000 : false }
  );

  useEffect(() => {
    if (polledJob && (polledJob.status === "completed" || polledJob.status === "failed")) {
      setPollingJobId(null);
      refetchJobs();
      if (polledJob.status === "completed") {
        toast({ title: "Report ready", description: "Your report has been generated and is ready to download." });
      }
    }
  }, [polledJob]);

  const isAdmin = user?.role === "admin";
  const canSchedule = ["admin", "insurer_admin", "claims_manager"].includes(user?.role ?? "");
  const categories = [...new Set(catalogue.map((r) => r.category))];

  const filtered = catalogue.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.description.toLowerCase().includes(search.toLowerCase()) ||
      r.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Reports Centre</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Generate, schedule, and download intelligence reports. All report access is role-gated and fully audited.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canSchedule && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-gray-300"
                onClick={() => setShowSchedule(true)}
              >
                <Calendar className="h-3.5 w-3.5 mr-1.5" />
                New Schedule
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-gray-300"
                onClick={() => setShowRegen(true)}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Admin: Regenerate Pipeline
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-gray-100 border border-gray-200 mb-6">
            <TabsTrigger value="catalogue" className="text-xs data-[state=active]:bg-white data-[state=active]:text-gray-900">
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Report Catalogue
            </TabsTrigger>
            <TabsTrigger value="jobs" className="text-xs data-[state=active]:bg-white data-[state=active]:text-gray-900">
              <Clock className="h-3.5 w-3.5 mr-1.5" />
              My Jobs {myJobs.length > 0 && <span className="ml-1 bg-gray-200 text-gray-700 rounded-full px-1.5 py-0.5 text-xs">{myJobs.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="schedules" className="text-xs data-[state=active]:bg-white data-[state=active]:text-gray-900">
              <Calendar className="h-3.5 w-3.5 mr-1.5" />
              Scheduled Reports
            </TabsTrigger>
          </TabsList>

          {/* ── Report Catalogue ─────────────────────────────────────────── */}
          <TabsContent value="catalogue">
            <div className="mb-4 flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <Input
                  placeholder="Search reports…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-8 text-sm"
                />
              </div>
              <span className="text-xs text-gray-500">{filtered.length} reports available</span>
            </div>

            {catLoading ? (
              <div className="text-center py-12 text-gray-400 text-sm">Loading catalogue…</div>
            ) : (
              <div className="space-y-6">
                {categories.map((cat) => {
                  const catReports = filtered.filter((r) => r.category === cat);
                  if (catReports.length === 0) return null;
                  return (
                    <div key={cat}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-gray-400">{CATEGORY_ICONS[cat] ?? <FileText className="h-4 w-4" />}</span>
                        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{cat}</h2>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {catReports.map((report) => (
                          <div
                            key={report.key}
                            className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-400 transition-colors cursor-pointer group"
                            onClick={() => setSelectedReport(report)}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-medium text-gray-900 group-hover:text-gray-700 leading-tight">
                                  {report.name}
                                </h3>
                                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{report.description}</p>
                              </div>
                              <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0 ml-2 mt-0.5" />
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                              <span className="text-xs text-gray-400 font-mono">{report.key}</span>
                              {report.requiresClaimId && (
                                <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">requires claim ID</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── My Jobs ──────────────────────────────────────────────────── */}
          <TabsContent value="jobs">
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-medium text-gray-900">Recent Report Jobs</h2>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => refetchJobs()}>
                  <RefreshCw className="h-3 w-3 mr-1" /> Refresh
                </Button>
              </div>
              {myJobs.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-8 w-8 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">No report jobs yet.</p>
                  <p className="text-xs text-gray-400 mt-1">Generate a report from the catalogue to see it here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">Report</th>
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">Status</th>
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">Format</th>
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">Requested</th>
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">Duration</th>
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">Size</th>
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">Downloads</th>
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(myJobs as unknown as ReportJob[]).map((job) => (
                        <JobRow key={job.job_id} job={job} onPoll={setPollingJobId} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Scheduled Reports ───────────────────────────────────────────────────── */}
          <TabsContent value="schedules">
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div>
                  <h2 className="text-sm font-medium text-gray-900">Scheduled Report Delivery</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Portfolio and executive reports delivered automatically to designated email addresses.
                  </p>
                </div>
                {canSchedule && (
                  <Button size="sm" variant="outline" className="text-xs h-7 border-gray-300" onClick={() => setShowSchedule(true)}>
                    <Calendar className="h-3 w-3 mr-1" /> New Schedule
                  </Button>
                )}
              </div>
              {(schedules as unknown as ScheduleEntry[]).length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="h-8 w-8 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">No scheduled reports configured.</p>
                  {canSchedule && (
                    <p className="text-xs text-gray-400 mt-1">Click <strong>New Schedule</strong> to set up recurring report delivery.</p>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">Label</th>
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">Report</th>
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">Frequency</th>
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">Recipients</th>
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">Status</th>
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">Last Run</th>
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(schedules as unknown as ScheduleEntry[]).map((s) => {
                        const emailList: string[] = (() => { try { return JSON.parse(s.delivery_emails); } catch { return []; } })();
                        return (
                          <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 px-4">
                              <div className="text-xs font-medium text-gray-900">{s.schedule_label}</div>
                              <div className="text-xs text-gray-400 mt-0.5">Created {fmtDate(s.created_at)}</div>
                            </td>
                            <td className="py-3 px-4 text-xs font-mono text-gray-600">{s.report_key}</td>
                            <td className="py-3 px-4 text-xs font-mono text-gray-600">{s.schedule_cron}</td>
                            <td className="py-3 px-4">
                              <div className="flex flex-wrap gap-1">
                                {emailList.slice(0, 2).map((e) => (
                                  <span key={e} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{e}</span>
                                ))}
                                {emailList.length > 2 && (
                                  <span className="text-xs text-gray-400">+{emailList.length - 2} more</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                                s.is_active ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-500 border border-gray-200"
                              }`}>
                                {s.is_active ? "Active" : "Paused"}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-xs text-gray-600">{fmtDate(s.last_run_at)}</td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm" variant="ghost" className="h-7 text-xs px-2"
                                  onClick={() => toggleSchedule.mutate({ scheduleId: s.id, isActive: !s.is_active })}
                                  disabled={toggleSchedule.isPending}
                                >
                                  {s.is_active ? "Pause" : "Resume"}
                                </Button>
                                <Button
                                  size="sm" variant="ghost" className="h-7 text-xs px-2 text-red-500 hover:text-red-700"
                                  onClick={() => { if (confirm("Delete this schedule?")) deleteSchedule.mutate({ scheduleId: s.id }); }}
                                  disabled={deleteSchedule.isPending}
                                >
                                  Delete
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Generate Report Dialog */}
      {selectedReport && (
        <Dialog open onOpenChange={() => setSelectedReport(null)}>
          <GenerateDialog
            report={selectedReport}
            onClose={() => setSelectedReport(null)}
            onGenerated={(jobId) => {
              setPollingJobId(jobId);
              setActiveTab("jobs");
              refetchJobs();
            }}
          />
        </Dialog>
      )}

      {/* Schedule Report Dialog */}
      {showSchedule && (
        <Dialog open onOpenChange={() => setShowSchedule(false)}>
          <ScheduleDialog
            catalogue={catalogue as CatalogueEntry[]}
            onClose={() => setShowSchedule(false)}
            onCreated={() => { refetchSchedules(); setActiveTab("schedules"); }}
          />
        </Dialog>
      )}
      {/* Admin Regeneration Dialog */}
      {showRegen && (
        <Dialog open onOpenChange={() => setShowRegen(false)}>
          <AdminRegenDialog onClose={() => setShowRegen(false)} />
        </Dialog>
      )}
    </div>
  );
}
