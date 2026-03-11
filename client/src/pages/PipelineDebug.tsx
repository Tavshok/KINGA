/**
 * /platform/pipeline-debug/:claimId
 *
 * Pipeline Debug Mode — 9-step diagnostic view.
 * Runs the full 10-stage pipeline in debug mode and displays
 * all intermediate data at every stage.
 */

import { useState, useMemo } from "react";
import { useRoute, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Search,
  RefreshCw,
  FileText,
  Database,
  Cpu,
  Shield,
  Activity,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  Zap,
  BarChart3,
  FileWarning,
  Wrench,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DocumentEntry {
  documentId: string;
  fileName: string;
  detectedDocumentType: string;
  ocrStatus: string;
  textExtractionStatus: string;
  mimeType: string;
  sourceUrl: string;
  containsImages: boolean;
  imageCount: number;
}

interface RawTextEntry {
  documentId: string;
  fileName: string;
  rawText: string;
  textLength: number;
  tableCount: number;
  ocrConfidence: number;
  tables: Array<{ headers: string[]; rows: string[][]; context: string }>;
}

interface ExtractedField {
  fieldName: string;
  extractedValue: string | number | boolean | null;
  confidence: string;
  sourceDocument: string;
}

interface EngineInput {
  engineName: string;
  inputs: Array<{
    fieldName: string;
    value: string | number | boolean | null;
    status: string;
  }>;
  missingRequiredFields: string[];
  canExecute: boolean;
}

interface EngineResult {
  engineName: string;
  executionStatus: string;
  durationMs: number;
  reason?: string;
  outputData: Record<string, any>;
}

interface ReportSectionStatus {
  sectionName: string;
  status: string;
  dataSource: string;
  fieldCount: number;
  populatedFieldCount: number;
}

interface ErrorDiagnostic {
  stage: string;
  component: string;
  errorType: string;
  description: string;
  recommendation: string;
}

interface SystemHealth {
  dataExtractionCompleteness: number;
  engineSuccessRate: number;
  totalEngines: number;
  successfulEngines: number;
  failedEngines: number;
  skippedEngines: number;
  missingFieldsList: string[];
  recommendedFixes: string[];
  overallStatus: string;
}

// ─── Step icons ──────────────────────────────────────────────────────────────

const stepConfig = [
  { num: 1, title: "Document Registry", icon: FileText, color: "text-blue-400", bg: "bg-blue-500/10" },
  { num: 2, title: "Raw Text Output", icon: Eye, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  { num: 3, title: "Structured Data Extraction", icon: Database, color: "text-violet-400", bg: "bg-violet-500/10" },
  { num: 4, title: "Claim Data Object", icon: Zap, color: "text-amber-400", bg: "bg-amber-500/10" },
  { num: 5, title: "Engine Input Check", icon: Cpu, color: "text-orange-400", bg: "bg-orange-500/10" },
  { num: 6, title: "Engine Execution Results", icon: BarChart3, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { num: 7, title: "Report Generation Check", icon: FileWarning, color: "text-pink-400", bg: "bg-pink-500/10" },
  { num: 8, title: "Error Diagnostics", icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
  { num: 9, title: "System Health Summary", icon: Activity, color: "text-teal-400", bg: "bg-teal-500/10" },
];

// ─── Collapsible Section ─────────────────────────────────────────────────────

function Section({
  step,
  children,
  defaultOpen = false,
  badge,
}: {
  step: (typeof stepConfig)[number];
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = step.icon;
  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-900/50 hover:bg-gray-900 transition-colors text-left"
      >
        <div className={`w-7 h-7 rounded flex items-center justify-center ${step.bg}`}>
          <Icon className={`w-4 h-4 ${step.color}`} />
        </div>
        <span className="text-xs font-mono text-gray-500 dark:text-muted-foreground">STEP {step.num}</span>
        <span className="text-sm font-medium text-gray-200 flex-1">{step.title}</span>
        {badge}
        {open ? (
          <ChevronDown className="w-4 h-4 text-gray-500 dark:text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500 dark:text-muted-foreground" />
        )}
      </button>
      {open && <div className="px-4 py-4 bg-gray-950/50 border-t border-gray-800">{children}</div>}
    </div>
  );
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    success: { cls: "bg-emerald-600/20 text-emerald-400 border-emerald-600/30", label: "Success" },
    completed: { cls: "bg-emerald-600/20 text-emerald-400 border-emerald-600/30", label: "Completed" },
    successful: { cls: "bg-emerald-600/20 text-emerald-400 border-emerald-600/30", label: "Successful" },
    ok: { cls: "bg-emerald-600/20 text-emerald-400 border-emerald-600/30", label: "OK" },
    failed: { cls: "bg-red-600/20 text-red-400 border-red-600/30", label: "Failed" },
    skipped: { cls: "bg-gray-600/20 text-gray-400 dark:text-muted-foreground/70 border-gray-600/30", label: "Skipped" },
    partial: { cls: "bg-amber-600/20 text-amber-400 border-amber-600/30", label: "Partial" },
    not_required: { cls: "bg-gray-600/20 text-gray-400 dark:text-muted-foreground/70 border-gray-600/30", label: "Not Required" },
    not_started: { cls: "bg-gray-600/20 text-gray-400 dark:text-muted-foreground/70 border-gray-600/30", label: "Not Started" },
    present: { cls: "bg-emerald-600/20 text-emerald-400 border-emerald-600/30", label: "Present" },
    missing: { cls: "bg-red-600/20 text-red-400 border-red-600/30", label: "Missing" },
    default: { cls: "bg-amber-600/20 text-amber-400 border-amber-600/30", label: "Default" },
    missing_inputs: { cls: "bg-red-600/20 text-red-400 border-red-600/30", label: "Missing Inputs" },
    empty: { cls: "bg-gray-600/20 text-gray-400 dark:text-muted-foreground/70 border-gray-600/30", label: "Empty" },
    healthy: { cls: "bg-emerald-600/20 text-emerald-400 border-emerald-600/30", label: "Healthy" },
    degraded: { cls: "bg-amber-600/20 text-amber-400 border-amber-600/30", label: "Degraded" },
    critical: { cls: "bg-red-600/20 text-red-400 border-red-600/30", label: "Critical" },
  };
  const cfg = map[status] || { cls: "bg-gray-600/20 text-gray-400 dark:text-muted-foreground/70 border-gray-600/30", label: status };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function PipelineDebug() {
  const [, params] = useRoute("/platform/pipeline-debug/:claimId");
  const [inputId, setInputId] = useState<string>(params?.claimId ?? "");
  const [queryId, setQueryId] = useState<number | null>(
    params?.claimId ? Number(params.claimId) : null
  );

  const { data, isLoading, error, refetch } = (trpc as any).claims.debugPipeline.useQuery(
    { claimId: queryId! },
    { enabled: queryId !== null && !isNaN(queryId), retry: false }
  );

  function handleSearch() {
    const n = Number(inputId);
    if (!isNaN(n) && n > 0) setQueryId(n);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center">
            <Wrench className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Pipeline Debug Mode</h1>
            <p className="text-sm text-gray-400 dark:text-muted-foreground/70">
              Full 10-stage pipeline diagnostic · Read-only · No DB modifications
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-6 text-xs text-gray-500 dark:text-muted-foreground">
          <Link href="/platform/overview" className="hover:text-gray-300">Platform</Link>
          <span>/</span>
          <span className="text-gray-400 dark:text-muted-foreground/70">Pipeline Debug</span>
        </div>

        {/* Search bar */}
        <div className="flex gap-3 mb-6">
          <Input
            type="number"
            placeholder="Enter Claim ID…"
            value={inputId}
            onChange={(e) => setInputId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-500 dark:text-muted-foreground max-w-xs"
          />
          <Button onClick={handleSearch} className="bg-violet-600 hover:bg-violet-700">
            <Search className="w-4 h-4 mr-2" />
            Run Debug
          </Button>
          {data && (
            <Button variant="outline" onClick={() => refetch()} className="border-gray-700 text-gray-300">
              <RefreshCw className="w-4 h-4 mr-2" />
              Re-run
            </Button>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="text-center py-16">
            <div className="inline-flex items-center gap-3 text-gray-400 dark:text-muted-foreground/70">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>Running 10-stage pipeline in debug mode… This may take 30-60 seconds.</span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-800 bg-red-950 p-4 text-red-300">
            <AlertCircle className="w-4 h-4 inline mr-2" />
            {(error as any).message}
          </div>
        )}

        {/* Results */}
        {data && <DebugReport data={data} />}

        {/* Empty state */}
        {!data && !isLoading && !error && (
          <div className="text-center py-16 text-gray-500 dark:text-muted-foreground">
            <Wrench className="w-8 h-8 mx-auto mb-3 opacity-50" />
            Enter a Claim ID above and click Run Debug to execute the full pipeline diagnostic.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Debug Report ────────────────────────────────────────────────────────────

function DebugReport({ data }: { data: any }) {
  const health: SystemHealth = data.systemHealth;

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center gap-4 px-4 py-3 rounded-lg bg-gray-900 border border-gray-800 text-sm">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-500 dark:text-muted-foreground" />
          <span className="text-gray-400 dark:text-muted-foreground/70">Claim #{data.claimId}</span>
        </div>
        <div className="text-gray-600 dark:text-muted-foreground">|</div>
        <div className="text-gray-400 dark:text-muted-foreground/70">
          Duration: <span className="text-white font-mono">{(data.totalDurationMs / 1000).toFixed(1)}s</span>
        </div>
        <div className="text-gray-600 dark:text-muted-foreground">|</div>
        <div className="text-gray-400 dark:text-muted-foreground/70">
          Completeness: <span className="text-white font-mono">{data.completenessScore}%</span>
        </div>
        <div className="text-gray-600 dark:text-muted-foreground">|</div>
        <StatusBadge status={health.overallStatus} />
      </div>

      {/* Stage timing bar */}
      <StageTimingBar stages={data.stageSummaries} totalMs={data.totalDurationMs} />

      {/* Step 1 — Document Registry */}
      <Section
        step={stepConfig[0]}
        defaultOpen={true}
        badge={<Badge variant="outline" className="text-xs border-gray-700 text-gray-400 dark:text-muted-foreground/70">{data.documentRegistry?.length ?? 0} docs</Badge>}
      >
        <DocumentRegistryTable docs={data.documentRegistry || []} />
      </Section>

      {/* Step 2 — Raw Text Output */}
      <Section
        step={stepConfig[1]}
        badge={<Badge variant="outline" className="text-xs border-gray-700 text-gray-400 dark:text-muted-foreground/70">{data.rawTextOutputs?.length ?? 0} texts</Badge>}
      >
        <RawTextView texts={data.rawTextOutputs || []} />
      </Section>

      {/* Step 3 — Structured Data Extraction */}
      <Section
        step={stepConfig[2]}
        badge={<Badge variant="outline" className="text-xs border-gray-700 text-gray-400 dark:text-muted-foreground/70">{data.structuredExtractions?.length ?? 0} fields</Badge>}
      >
        <ExtractedFieldsTable fields={data.structuredExtractions || []} />
      </Section>

      {/* Step 4 — Claim Data Object */}
      <Section
        step={stepConfig[3]}
        badge={
          <div className="flex gap-1">
            {data.validationIssues?.length > 0 && (
              <Badge variant="outline" className="text-xs border-amber-700 text-amber-400">
                {data.validationIssues.length} issues
              </Badge>
            )}
            {data.missingFields?.length > 0 && (
              <Badge variant="outline" className="text-xs border-red-700 text-red-400">
                {data.missingFields.length} missing
              </Badge>
            )}
          </div>
        }
      >
        <ClaimDataObjectView
          claimData={data.claimDataObject}
          validationIssues={data.validationIssues || []}
          missingFields={data.missingFields || []}
          completeness={data.completenessScore}
        />
      </Section>

      {/* Step 5 — Engine Input Check */}
      <Section
        step={stepConfig[4]}
        badge={
          <Badge variant="outline" className="text-xs border-gray-700 text-gray-400 dark:text-muted-foreground/70">
            {data.engineInputChecks?.length ?? 0} engines
          </Badge>
        }
      >
        <EngineInputChecks checks={data.engineInputChecks || []} />
      </Section>

      {/* Step 6 — Engine Execution Results */}
      <Section
        step={stepConfig[5]}
        defaultOpen={true}
        badge={
          <div className="flex gap-1">
            {data.engineResults?.filter((r: EngineResult) => r.executionStatus === "success").length > 0 && (
              <Badge variant="outline" className="text-xs border-emerald-700 text-emerald-400">
                {data.engineResults.filter((r: EngineResult) => r.executionStatus === "success").length} passed
              </Badge>
            )}
            {data.engineResults?.filter((r: EngineResult) => r.executionStatus === "failed").length > 0 && (
              <Badge variant="outline" className="text-xs border-red-700 text-red-400">
                {data.engineResults.filter((r: EngineResult) => r.executionStatus === "failed").length} failed
              </Badge>
            )}
          </div>
        }
      >
        <EngineResultsView results={data.engineResults || []} />
      </Section>

      {/* Step 7 — Report Generation Check */}
      <Section step={stepConfig[6]}>
        <ReportSectionStatusView sections={data.reportSectionStatuses || []} />
      </Section>

      {/* Step 8 — Error Diagnostics */}
      <Section
        step={stepConfig[7]}
        defaultOpen={(data.errorDiagnostics?.length ?? 0) > 0}
        badge={
          data.errorDiagnostics?.length > 0 ? (
            <Badge variant="outline" className="text-xs border-red-700 text-red-400">
              {data.errorDiagnostics.length} errors
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs border-emerald-700 text-emerald-400">
              No errors
            </Badge>
          )
        }
      >
        <ErrorDiagnosticsView errors={data.errorDiagnostics || []} />
      </Section>

      {/* Step 9 — System Health Summary */}
      <Section step={stepConfig[8]} defaultOpen={true}>
        <SystemHealthView health={health} />
      </Section>
    </div>
  );
}

// ─── Stage Timing Bar ────────────────────────────────────────────────────────

function StageTimingBar({ stages, totalMs }: { stages: Record<string, any>; totalMs: number }) {
  const stageNames = [
    "1_ingestion", "2_extraction", "3_structured_extraction", "4_validation",
    "5_assembly", "6_damage_analysis", "7_physics", "8_fraud", "9_cost", "10_report",
  ];
  const colors = [
    "bg-blue-500", "bg-cyan-500", "bg-violet-500", "bg-amber-500", "bg-orange-500",
    "bg-emerald-500", "bg-lime-500", "bg-rose-500", "bg-pink-500", "bg-teal-500",
  ];

  return (
    <div className="px-4 py-3 rounded-lg bg-gray-900 border border-gray-800">
      <div className="text-xs text-gray-500 dark:text-muted-foreground mb-2 font-mono">STAGE TIMING</div>
      <div className="flex h-6 rounded overflow-hidden gap-px">
        {stageNames.map((name, i) => {
          const stage = stages[name];
          if (!stage) return null;
          const pct = totalMs > 0 ? Math.max((stage.durationMs / totalMs) * 100, 1) : 0;
          return (
            <div
              key={name}
              className={`${colors[i]} ${stage.status === "failed" ? "opacity-40" : ""} relative group`}
              style={{ width: `${pct}%`, minWidth: "2px" }}
              title={`Stage ${i + 1}: ${(stage.durationMs / 1000).toFixed(1)}s (${stage.status})`}
            >
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-800 text-gray-200 text-xs px-2 py-1 rounded whitespace-nowrap z-10 border border-gray-700">
                S{i + 1}: {(stage.durationMs / 1000).toFixed(1)}s ({stage.status})
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-gray-600 dark:text-muted-foreground font-mono">
        <span>0s</span>
        <span>{(totalMs / 1000).toFixed(1)}s</span>
      </div>
    </div>
  );
}

// ─── Step 1: Document Registry ───────────────────────────────────────────────

function DocumentRegistryTable({ docs }: { docs: DocumentEntry[] }) {
  if (docs.length === 0) return <p className="text-gray-500 dark:text-muted-foreground text-sm">No documents found.</p>;
  return (
    <div className="space-y-3">
      {docs.map((doc, i) => (
        <div key={i} className="flex items-start gap-3 p-3 rounded bg-gray-900/50 border border-gray-800">
          <FileText className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-white">{doc.documentId}</span>
              <span className="text-xs text-gray-500 dark:text-muted-foreground">·</span>
              <span className="text-sm text-gray-300">{doc.fileName}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div>
                <span className="text-gray-500 dark:text-muted-foreground">Type:</span>{" "}
                <span className="text-gray-300">{doc.detectedDocumentType}</span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-muted-foreground">OCR:</span>{" "}
                <StatusBadge status={doc.ocrStatus} />
              </div>
              <div>
                <span className="text-gray-500 dark:text-muted-foreground">Text:</span>{" "}
                <StatusBadge status={doc.textExtractionStatus} />
              </div>
              <div>
                <span className="text-gray-500 dark:text-muted-foreground">Images:</span>{" "}
                <span className="text-gray-300">{doc.imageCount}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Step 2: Raw Text Output ─────────────────────────────────────────────────

function RawTextView({ texts }: { texts: RawTextEntry[] }) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  if (texts.length === 0) return <p className="text-gray-500 dark:text-muted-foreground text-sm">No text extracted.</p>;
  return (
    <div className="space-y-3">
      {texts.map((t, i) => (
        <div key={i} className="rounded bg-gray-900/50 border border-gray-800 overflow-hidden">
          <div className="flex items-center gap-3 px-3 py-2 border-b border-gray-800">
            <span className="text-sm font-medium text-gray-200">{t.documentId}: {t.fileName}</span>
            <span className="text-xs text-gray-500 dark:text-muted-foreground">{t.textLength.toLocaleString()} chars</span>
            <span className="text-xs text-gray-500 dark:text-muted-foreground">{t.tableCount} tables</span>
            <span className="text-xs text-gray-500 dark:text-muted-foreground">OCR conf: {(t.ocrConfidence * 100).toFixed(0)}%</span>
            <button
              onClick={() => setExpanded(p => ({ ...p, [i]: !p[i] }))}
              className="ml-auto text-xs text-violet-400 hover:text-violet-300"
            >
              {expanded[i] ? "Collapse" : "Show Text"}
            </button>
          </div>
          {expanded[i] && (
            <pre className="p-3 text-xs text-gray-400 dark:text-muted-foreground/70 font-mono whitespace-pre-wrap max-h-96 overflow-y-auto">
              {t.rawText || "(empty)"}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Step 3: Structured Data Extraction ──────────────────────────────────────

function ExtractedFieldsTable({ fields }: { fields: ExtractedField[] }) {
  if (fields.length === 0) return <p className="text-gray-500 dark:text-muted-foreground text-sm">No fields extracted.</p>;

  const nullCount = fields.filter(f => f.confidence === "null").length;
  const lowCount = fields.filter(f => f.confidence === "low").length;

  return (
    <div>
      <div className="flex gap-3 mb-3 text-xs">
        <span className="text-gray-500 dark:text-muted-foreground">{fields.length} fields total</span>
        {nullCount > 0 && <span className="text-red-400">{nullCount} NULL</span>}
        {lowCount > 0 && <span className="text-amber-400">{lowCount} low confidence</span>}
      </div>
      <div className="rounded border border-gray-800 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-900/80 text-gray-500 dark:text-muted-foreground border-b border-gray-800">
              <th className="text-left px-3 py-2 font-medium">Field</th>
              <th className="text-left px-3 py-2 font-medium">Value</th>
              <th className="text-left px-3 py-2 font-medium">Confidence</th>
              <th className="text-left px-3 py-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f, i) => (
              <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-900/30">
                <td className="px-3 py-1.5 font-mono text-gray-300">{f.fieldName}</td>
                <td className="px-3 py-1.5 text-gray-200 max-w-xs truncate">
                  {f.extractedValue === null || f.extractedValue === undefined ? (
                    <span className="text-red-400 font-mono">NULL</span>
                  ) : (
                    String(f.extractedValue)
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <StatusBadge status={f.confidence === "null" ? "missing" : f.confidence} />
                </td>
                <td className="px-3 py-1.5 text-gray-500 dark:text-muted-foreground">{f.sourceDocument}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Step 4: Claim Data Object ───────────────────────────────────────────────

function ClaimDataObjectView({
  claimData,
  validationIssues,
  missingFields,
  completeness,
}: {
  claimData: any;
  validationIssues: any[];
  missingFields: string[];
  completeness: number;
}) {
  const [showJson, setShowJson] = useState(false);

  return (
    <div className="space-y-4">
      {/* Completeness bar */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500 dark:text-muted-foreground">Completeness:</span>
        <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden max-w-xs">
          <div
            className={`h-full rounded-full ${
              completeness >= 80 ? "bg-emerald-500" : completeness >= 60 ? "bg-amber-500" : "bg-red-500"
            }`}
            style={{ width: `${completeness}%` }}
          />
        </div>
        <span className="text-sm font-mono text-white">{completeness}%</span>
      </div>

      {/* Missing fields */}
      {missingFields.length > 0 && (
        <div className="p-3 rounded bg-red-950/30 border border-red-900/50">
          <div className="text-xs text-red-400 font-medium mb-1">Missing Fields ({missingFields.length})</div>
          <div className="flex flex-wrap gap-1">
            {missingFields.map((f, i) => (
              <span key={i} className="text-xs font-mono px-1.5 py-0.5 rounded bg-red-900/30 text-red-300 border border-red-800/50">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Validation issues */}
      {validationIssues.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-amber-400 font-medium">Validation Issues</div>
          {validationIssues.map((issue: any, i: number) => (
            <div key={i} className="flex items-start gap-2 text-xs p-2 rounded bg-amber-950/20 border border-amber-900/30">
              <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-amber-300 font-mono">{issue.field}</span>
                <span className="text-gray-400 dark:text-muted-foreground/70 ml-2">{issue.message}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* JSON toggle */}
      {claimData && (
        <div>
          <button
            onClick={() => setShowJson(!showJson)}
            className="text-xs text-violet-400 hover:text-violet-300 mb-2"
          >
            {showJson ? "Hide" : "Show"} Full Claim Object JSON
          </button>
          {showJson && (
            <pre className="p-3 rounded bg-gray-900 border border-gray-800 text-xs text-gray-400 dark:text-muted-foreground/70 font-mono whitespace-pre-wrap max-h-96 overflow-y-auto">
              {JSON.stringify(claimData, null, 2)}
            </pre>
          )}
        </div>
      )}

      {!claimData && (
        <p className="text-red-400 text-sm">Claim data object was not assembled. Check Stages 1-4 for errors.</p>
      )}
    </div>
  );
}

// ─── Step 5: Engine Input Check ──────────────────────────────────────────────

function EngineInputChecks({ checks }: { checks: EngineInput[] }) {
  if (checks.length === 0) return <p className="text-gray-500 dark:text-muted-foreground text-sm">No engine input data.</p>;
  return (
    <div className="space-y-4">
      {checks.map((check, i) => (
        <div key={i} className="rounded bg-gray-900/50 border border-gray-800 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800">
            <Cpu className="w-4 h-4 text-orange-400" />
            <span className="text-sm font-medium text-gray-200">{check.engineName}</span>
            <StatusBadge status={check.canExecute ? "success" : "failed"} />
            {check.missingRequiredFields.length > 0 && (
              <span className="text-xs text-red-400 ml-auto">
                {check.missingRequiredFields.length} missing required
              </span>
            )}
          </div>
          <div className="p-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 dark:text-muted-foreground">
                  <th className="text-left pb-1 font-medium">Input Field</th>
                  <th className="text-left pb-1 font-medium">Value</th>
                  <th className="text-left pb-1 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {check.inputs.map((inp, j) => (
                  <tr key={j} className="border-t border-gray-800/30">
                    <td className="py-1 font-mono text-gray-300">{inp.fieldName}</td>
                    <td className="py-1 text-gray-400 dark:text-muted-foreground/70 max-w-xs truncate">
                      {inp.value === null || inp.value === undefined ? (
                        <span className="text-red-400 font-mono">NULL</span>
                      ) : (
                        String(inp.value)
                      )}
                    </td>
                    <td className="py-1"><StatusBadge status={inp.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Step 6: Engine Execution Results ────────────────────────────────────────

function EngineResultsView({ results }: { results: EngineResult[] }) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  if (results.length === 0) return <p className="text-gray-500 dark:text-muted-foreground text-sm">No engine results.</p>;
  return (
    <div className="space-y-3">
      {results.map((r, i) => (
        <div key={i} className="rounded bg-gray-900/50 border border-gray-800 overflow-hidden">
          <div className="flex items-center gap-3 px-3 py-2">
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-gray-200">{r.engineName}</span>
            <StatusBadge status={r.executionStatus} />
            <span className="text-xs text-gray-500 dark:text-muted-foreground font-mono ml-auto">{(r.durationMs / 1000).toFixed(1)}s</span>
            {r.reason && <span className="text-xs text-red-400">· {r.reason}</span>}
            <button
              onClick={() => setExpanded(p => ({ ...p, [i]: !p[i] }))}
              className="text-xs text-violet-400 hover:text-violet-300"
            >
              {expanded[i] ? "Hide" : "Output"}
            </button>
          </div>
          {expanded[i] && Object.keys(r.outputData).length > 0 && (
            <pre className="px-3 py-2 border-t border-gray-800 text-xs text-gray-400 dark:text-muted-foreground/70 font-mono whitespace-pre-wrap max-h-64 overflow-y-auto">
              {JSON.stringify(r.outputData, null, 2)}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Step 7: Report Section Status ───────────────────────────────────────────

function ReportSectionStatusView({ sections }: { sections: ReportSectionStatus[] }) {
  if (sections.length === 0) return <p className="text-gray-500 dark:text-muted-foreground text-sm">No report sections.</p>;
  return (
    <div className="rounded border border-gray-800 overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-900/80 text-gray-500 dark:text-muted-foreground border-b border-gray-800">
            <th className="text-left px-3 py-2 font-medium">Section</th>
            <th className="text-left px-3 py-2 font-medium">Status</th>
            <th className="text-left px-3 py-2 font-medium">Data Source</th>
            <th className="text-left px-3 py-2 font-medium">Fields</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((s, i) => (
            <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-900/30">
              <td className="px-3 py-2 text-gray-200 font-medium">{s.sectionName}</td>
              <td className="px-3 py-2"><StatusBadge status={s.status} /></td>
              <td className="px-3 py-2 text-gray-500 dark:text-muted-foreground text-[11px]">{s.dataSource}</td>
              <td className="px-3 py-2 text-gray-400 dark:text-muted-foreground/70 font-mono">
                {s.populatedFieldCount}/{s.fieldCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Step 8: Error Diagnostics ───────────────────────────────────────────────

function ErrorDiagnosticsView({ errors }: { errors: ErrorDiagnostic[] }) {
  if (errors.length === 0) {
    return (
      <div className="flex items-center gap-2 text-emerald-400 text-sm">
        <CheckCircle2 className="w-4 h-4" />
        No errors detected. All pipeline stages completed successfully.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {errors.map((err, i) => (
        <div key={i} className="p-3 rounded bg-red-950/20 border border-red-900/40">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="w-3.5 h-3.5 text-red-400" />
            <span className="text-xs font-medium text-red-300">{err.stage}</span>
            <span className="text-[10px] font-mono text-gray-600 dark:text-muted-foreground">· {err.component} · {err.errorType}</span>
          </div>
          <p className="text-xs text-gray-300 mb-1">{err.description}</p>
          <div className="flex items-start gap-1">
            <Wrench className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-300">{err.recommendation}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Step 9: System Health Summary ───────────────────────────────────────────

function SystemHealthView({ health }: { health: SystemHealth }) {
  return (
    <div className="space-y-4">
      {/* Metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          label="Data Extraction"
          value={`${health.dataExtractionCompleteness}%`}
          status={health.dataExtractionCompleteness >= 80 ? "good" : health.dataExtractionCompleteness >= 60 ? "warn" : "bad"}
        />
        <MetricCard
          label="Engine Success"
          value={`${health.engineSuccessRate}%`}
          status={health.engineSuccessRate >= 80 ? "good" : health.engineSuccessRate >= 60 ? "warn" : "bad"}
        />
        <MetricCard
          label="Engines Passed"
          value={`${health.successfulEngines}/${health.totalEngines}`}
          status={health.failedEngines === 0 ? "good" : "bad"}
        />
        <MetricCard
          label="Overall Status"
          value={health.overallStatus.toUpperCase()}
          status={health.overallStatus === "healthy" ? "good" : health.overallStatus === "degraded" ? "warn" : "bad"}
        />
      </div>

      {/* Missing fields */}
      {health.missingFieldsList.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 dark:text-muted-foreground mb-1 font-medium">Missing Fields</div>
          <div className="flex flex-wrap gap-1">
            {health.missingFieldsList.map((f, i) => (
              <span key={i} className="text-xs font-mono px-1.5 py-0.5 rounded bg-red-900/20 text-red-300 border border-red-800/30">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recommended fixes */}
      {health.recommendedFixes.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 dark:text-muted-foreground mb-1 font-medium">Recommended Fixes</div>
          <div className="space-y-1">
            {health.recommendedFixes.map((fix, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <Shield className="w-3 h-3 text-teal-400 mt-0.5 flex-shrink-0" />
                <span className="text-gray-300">{fix}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, status }: { label: string; value: string; status: "good" | "warn" | "bad" }) {
  const colors = {
    good: "border-emerald-800/50 bg-emerald-950/20",
    warn: "border-amber-800/50 bg-amber-950/20",
    bad: "border-red-800/50 bg-red-950/20",
  };
  const textColors = {
    good: "text-emerald-400",
    warn: "text-amber-400",
    bad: "text-red-400",
  };
  return (
    <div className={`rounded-lg border p-3 ${colors[status]}`}>
      <div className="text-[10px] text-gray-500 dark:text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-lg font-mono font-bold ${textColors[status]}`}>{value}</div>
    </div>
  );
}
