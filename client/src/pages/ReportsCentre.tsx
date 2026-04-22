import { useState, useEffect } from "react";
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
const STATUS_ICONS: Record<string, JSX.Element> = {
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

const CATEGORY_ICONS: Record<string, JSX.Element> = {
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReportsCentre() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("catalogue");
  const [search, setSearch] = useState("");
  const [selectedReport, setSelectedReport] = useState<CatalogueEntry | null>(null);
  const [showRegen, setShowRegen] = useState(false);
  const [pollingJobId, setPollingJobId] = useState<string | null>(null);

  const { data: catalogue = [], isLoading: catLoading } = trpc.reportingEngine.getCatalogue.useQuery();
  const { data: myJobs = [], refetch: refetchJobs } = trpc.reportingEngine.getMyJobs.useQuery();

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
                      {(myJobs as ReportJob[]).map((job) => (
                        <JobRow key={job.job_id} job={job} onPoll={setPollingJobId} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Scheduled Reports ─────────────────────────────────────────── */}
          <TabsContent value="schedules">
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-start gap-3 mb-6">
                <Info className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-700">Scheduled Report Delivery</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Portfolio and executive reports can be scheduled for automatic delivery to designated email addresses.
                    Claims managers and insurer admins can create schedules for their tenant.
                    Platform admins can create global schedules.
                  </p>
                </div>
              </div>

              <div className="border border-dashed border-gray-200 rounded-lg p-8 text-center">
                <Calendar className="h-8 w-8 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">No scheduled reports configured.</p>
                <p className="text-xs text-gray-400 mt-1">
                  Schedule configuration UI is coming in the next release. Contact your platform admin to set up recurring reports.
                </p>
              </div>
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

      {/* Admin Regeneration Dialog */}
      {showRegen && (
        <Dialog open onOpenChange={() => setShowRegen(false)}>
          <AdminRegenDialog onClose={() => setShowRegen(false)} />
        </Dialog>
      )}
    </div>
  );
}
