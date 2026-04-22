/**
 * ForensicAuditValidationPanel.tsx
 * Stage 36 — Forensic Audit Validator UI
 *
 * Displays the 10-dimension post-pipeline validation report.
 * Uses a clean light-mode professional style consistent with the rest of the
 * ClaimDecisionReport page. No dark/coloured backgrounds.
 */

import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, ShieldCheck, ShieldAlert, ShieldX, CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types (mirrors forensicAuditValidator.ts)
// ─────────────────────────────────────────────────────────────────────────────

interface ValidationIssue {
  dimension: string;
  code: string;
  description: string;
  evidence?: string;
}

interface ForensicAuditValidationReport {
  overallStatus: "PASS" | "WARNING" | "FAIL";
  criticalFailures: ValidationIssue[];
  highSeverityIssues: ValidationIssue[];
  mediumIssues: ValidationIssue[];
  lowIssues: ValidationIssue[];
  consistencyScore: number;
  confidenceInAssessment: "HIGH" | "MEDIUM" | "LOW";
  summary: string;
  validatedAt: string;
  dimensionResults: {
    dataExtraction: "PASS" | "WARNING" | "FAIL";
    incidentClassification: "PASS" | "WARNING" | "FAIL";
    imageAnalysis: "PASS" | "WARNING" | "FAIL";
    physics: "PASS" | "WARNING" | "FAIL";
    costModel: "PASS" | "WARNING" | "FAIL";
    fraudAnalysis: "PASS" | "WARNING" | "FAIL";
    crossStageConsistency: "PASS" | "WARNING" | "FAIL";
    assumptionRegistry: "PASS" | "WARNING" | "FAIL";
    reportCompleteness: "PASS" | "WARNING" | "FAIL";
    claimQualityScore: "PASS" | "WARNING" | "FAIL";
  };
}

interface Props {
  validation: ForensicAuditValidationReport | null | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — light-mode colour tokens only
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  PASS: {
    bg: "bg-white",
    border: "border-emerald-300",
    headerBg: "bg-emerald-50",
    text: "text-emerald-700",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-300",
    icon: ShieldCheck,
    iconColor: "text-emerald-600",
    barColor: "bg-emerald-500",
    divider: "border-emerald-100",
  },
  WARNING: {
    bg: "bg-white",
    border: "border-amber-300",
    headerBg: "bg-amber-50",
    text: "text-amber-700",
    badge: "bg-amber-100 text-amber-700 border-amber-300",
    icon: ShieldAlert,
    iconColor: "text-amber-600",
    barColor: "bg-amber-500",
    divider: "border-amber-100",
  },
  FAIL: {
    bg: "bg-white",
    border: "border-red-300",
    headerBg: "bg-red-50",
    text: "text-red-700",
    badge: "bg-red-100 text-red-700 border-red-300",
    icon: ShieldX,
    iconColor: "text-red-600",
    barColor: "bg-red-500",
    divider: "border-red-100",
  },
};

const DIMENSION_LABELS: Record<string, string> = {
  dataExtraction: "Data Extraction",
  incidentClassification: "Incident Classification",
  imageAnalysis: "Image Analysis",
  physics: "Physics",
  costModel: "Cost Model",
  fraudAnalysis: "Fraud Analysis",
  crossStageConsistency: "Cross-Stage Consistency",
  assumptionRegistry: "Assumption Registry",
  reportCompleteness: "Report Completeness",
  claimQualityScore: "Quality Score",
};

const CONFIDENCE_CONFIG = {
  HIGH: { badge: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  MEDIUM: { badge: "bg-amber-100 text-amber-700 border-amber-300" },
  LOW: { badge: "bg-red-100 text-red-700 border-red-300" },
};

function DimensionPill({ label, status }: { label: string; status: "PASS" | "WARNING" | "FAIL" }) {
  const Icon = status === "PASS" ? CheckCircle2 : status === "WARNING" ? AlertTriangle : XCircle;
  const cls =
    status === "PASS"
      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
      : status === "WARNING"
      ? "bg-amber-50 border-amber-200 text-amber-700"
      : "bg-red-50 border-red-200 text-red-700";
  const iconCls =
    status === "PASS" ? "text-emerald-500" : status === "WARNING" ? "text-amber-500" : "text-red-500";
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-medium ${cls}`}>
      <Icon className={`w-3 h-3 ${iconCls} flex-shrink-0`} />
      <span>{label}</span>
    </div>
  );
}

function IssueItem({ issue, severity }: { issue: ValidationIssue; severity: "critical" | "high" | "medium" | "low" }) {
  const [open, setOpen] = useState(false);
  const borderColor =
    severity === "critical"
      ? "border-red-200"
      : severity === "high"
      ? "border-amber-200"
      : severity === "medium"
      ? "border-yellow-200"
      : "border-gray-200";
  const bgColor =
    severity === "critical"
      ? "bg-red-50"
      : severity === "high"
      ? "bg-amber-50"
      : severity === "medium"
      ? "bg-yellow-50"
      : "bg-gray-50";
  const codeColor =
    severity === "critical"
      ? "text-red-600"
      : severity === "high"
      ? "text-amber-600"
      : severity === "medium"
      ? "text-yellow-600"
      : "text-gray-500";

  return (
    <div className={`rounded border ${borderColor} ${bgColor} overflow-hidden`}>
      <button
        className="w-full flex items-start gap-2 px-3 py-2 text-left"
        onClick={() => setOpen(!open)}
      >
        <span className={`text-xs font-mono font-bold mt-0.5 flex-shrink-0 ${codeColor}`}>[{issue.code}]</span>
        <span className="text-xs text-gray-700 flex-1 leading-relaxed">{issue.description}</span>
        {issue.evidence && (
          open
            ? <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0 mt-0.5" />
            : <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0 mt-0.5" />
        )}
      </button>
      {open && issue.evidence && (
        <div className="px-3 pb-2 border-t border-gray-200">
          <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
            <span className="text-gray-600 font-medium">Evidence: </span>{issue.evidence}
          </p>
        </div>
      )}
    </div>
  );
}

function IssueGroup({
  title,
  issues,
  severity,
  defaultOpen = false,
}: {
  title: string;
  issues: ValidationIssue[];
  severity: "critical" | "high" | "medium" | "low";
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (issues.length === 0) return null;

  const countColor =
    severity === "critical"
      ? "text-red-600"
      : severity === "high"
      ? "text-amber-600"
      : severity === "medium"
      ? "text-yellow-600"
      : "text-gray-500";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-1">
        {open
          ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
        <span className="text-xs font-semibold text-gray-700">{title}</span>
        <span className={`text-xs font-bold ${countColor}`}>{issues.length}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-1.5 mt-1.5 ml-5">
          {issues.map((issue, i) => (
            <IssueItem key={i} issue={issue} severity={severity} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function ForensicAuditValidationPanel({ validation }: Props) {
  const [open, setOpen] = useState(true);

  if (!validation) return null;

  const cfg = STATUS_CONFIG[validation.overallStatus];
  const StatusIcon = cfg.icon;
  const confidenceCfg = CONFIDENCE_CONFIG[validation.confidenceInAssessment];

  const totalIssues =
    validation.criticalFailures.length +
    validation.highSeverityIssues.length +
    validation.mediumIssues.length +
    validation.lowIssues.length;

  const dimensionEntries = Object.entries(validation.dimensionResults) as [string, "PASS" | "WARNING" | "FAIL"][];
  const passCount = dimensionEntries.filter(([, v]) => v === "PASS").length;
  const warnCount = dimensionEntries.filter(([, v]) => v === "WARNING").length;
  const failCount = dimensionEntries.filter(([, v]) => v === "FAIL").length;

  return (
    <div className={`rounded-lg border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      {/* Header */}
      <button
        className={`w-full flex items-center gap-3 px-4 py-3 text-left ${cfg.headerBg}`}
        onClick={() => setOpen(!open)}
      >
        <StatusIcon className={`w-5 h-5 ${cfg.iconColor} flex-shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-gray-800">Forensic Audit Validation</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded border ${cfg.badge}`}>
              {validation.overallStatus}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded border ${confidenceCfg.badge}`}>
              Confidence: {validation.confidenceInAssessment}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Consistency Score: <span className={`font-bold ${cfg.text}`}>{validation.consistencyScore}/100</span>
            {" · "}
            {passCount}/{dimensionEntries.length} dimensions pass
            {totalIssues > 0 && ` · ${totalIssues} issue${totalIssues !== 1 ? "s" : ""} found`}
          </p>
        </div>
        {open
          ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
          : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
      </button>

      {open && (
        <div className={`px-4 pb-4 border-t ${cfg.divider} pt-3 flex flex-col gap-4`}>

          {/* Summary */}
          <div className="flex items-start gap-2 bg-gray-50 rounded px-3 py-2.5 border border-gray-200">
            <Info className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-gray-600 leading-relaxed">{validation.summary}</p>
          </div>

          {/* Consistency score bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500 font-medium">Consistency Score</span>
              <span className={`text-xs font-bold ${cfg.text}`}>{validation.consistencyScore}/100</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${cfg.barColor}`}
                style={{ width: `${Math.max(0, Math.min(100, validation.consistencyScore))}%` }}
              />
            </div>
          </div>

          {/* Dimension grid */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-700">10-Dimension Results</span>
              <div className="flex gap-2 text-xs">
                {passCount > 0 && <span className="text-emerald-600">{passCount} PASS</span>}
                {warnCount > 0 && <span className="text-amber-600">{warnCount} WARN</span>}
                {failCount > 0 && <span className="text-red-600">{failCount} FAIL</span>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {dimensionEntries.map(([key, status]) => (
                <DimensionPill key={key} label={DIMENSION_LABELS[key] ?? key} status={status} />
              ))}
            </div>
          </div>

          {/* Issue lists */}
          {totalIssues > 0 && (
            <div className={`flex flex-col gap-2 border-t ${cfg.divider} pt-3`}>
              <span className="text-xs font-semibold text-gray-700">Issues Found</span>
              <IssueGroup
                title="Critical Failures"
                issues={validation.criticalFailures}
                severity="critical"
                defaultOpen={true}
              />
              <IssueGroup
                title="High Severity"
                issues={validation.highSeverityIssues}
                severity="high"
                defaultOpen={validation.criticalFailures.length === 0}
              />
              <IssueGroup
                title="Medium"
                issues={validation.mediumIssues}
                severity="medium"
                defaultOpen={false}
              />
              <IssueGroup
                title="Low"
                issues={validation.lowIssues}
                severity="low"
                defaultOpen={false}
              />
            </div>
          )}

          {totalIssues === 0 && (
            <div className="flex items-center gap-2 text-emerald-600 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>No issues found across all 10 validation dimensions.</span>
            </div>
          )}

          {/* Validated at */}
          <p className="text-xs text-gray-400">
            Validated: {new Date(validation.validatedAt).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}
