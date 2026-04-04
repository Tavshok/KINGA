/**
 * ReportReadinessPanel.tsx
 *
 * Displays the Report Readiness Gate result for a given claim.
 * Shows READY / HOLD status with per-gate pass/fail detail,
 * hold reasons, warnings, and an Export button when ready.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Download,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface ReportReadinessPanelProps {
  claimId: number;
  aiAssessment: {
    fraudRiskLevel?: string | null;
    confidenceScore?: number | null;
    structuralDamageSeverity?: string | null;
    estimatedCost?: number | null;
    consistencyCheckJson?: string | null;
  } | null;
  claim: {
    workflowState?: string | null;
    finalApprovedAmount?: number | null;
    isHighValue?: boolean | null;
    documentsAttached?: boolean | null;
  } | null;
  /** Whether the decision authority has produced a valid recommendation */
  decisionReady?: boolean;
  /** The recommendation from the decision authority */
  recommendation?: "APPROVE" | "REVIEW" | "REJECT" | null;
  /** Whether the contradiction gate passed */
  contradictionValid?: boolean;
  contradictionAction?: "ALLOW" | "BLOCK" | null;
  contradictionCriticalCount?: number | null;
  contradictionMajorCount?: number | null;
  contradictionMinorCount?: number | null;
  /** Whether the assessor has validated the claim */
  assessorValidated?: boolean;
  /** Callback when export is triggered */
  onExport?: () => void;
}

function GateRow({ gate, passed, detail }: { gate: string; passed: boolean; detail: string }) {
  const [expanded, setExpanded] = useState(false);
  const label =
    gate === "decision_ready" ? "Decision Ready" :
    gate === "contradiction_check" ? "Contradiction Check" :
    gate === "overall_confidence" ? "Confidence Threshold" :
    gate;

  return (
    <div
      className="rounded-lg p-3"
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {passed
            ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-green-600 dark:text-green-400" />
            : <XCircle className="w-4 h-4 flex-shrink-0 text-red-600 dark:text-red-400" />}
          <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{label}</span>
          <Badge
            variant="outline"
            className="text-xs px-1.5 py-0"
            style={{
              borderColor: passed ? "var(--status-approve-border)" : "var(--status-reject-border)",
              color: passed ? "var(--status-approve-text)" : "var(--status-reject-text)",
            }}
          >
            {passed ? "PASS" : "FAIL"}
          </Badge>
        </div>
        <button
          className="text-xs"
          style={{ color: "var(--muted-foreground)" }}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>
      {expanded && (
        <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
          {detail}
        </p>
      )}
    </div>
  );
}

export default function ReportReadinessPanel({
  claimId,
  aiAssessment,
  claim,
  decisionReady = false,
  recommendation = null,
  contradictionValid = true,
  contradictionAction = "ALLOW",
  contradictionCriticalCount = 0,
  contradictionMajorCount = 0,
  contradictionMinorCount = 0,
  assessorValidated = false,
  onExport,
}: ReportReadinessPanelProps) {
  const [runKey, setRunKey] = useState(0);
  const readinessMutation = trpc.decision.checkReportReadiness.useMutation();
  const [result, setResult] = useState<Awaited<ReturnType<typeof readinessMutation.mutateAsync>> | null>(null);
  const [loading, setLoading] = useState(false);

  // Parse consistency check from JSON
  const consistencyCheck = (() => {
    try {
      return aiAssessment?.consistencyCheckJson
        ? JSON.parse(aiAssessment.consistencyCheckJson)
        : null;
    } catch {
      return null;
    }
  })();

  const confidence = aiAssessment?.confidenceScore != null
    ? Number(aiAssessment.confidenceScore)
    : null;

  const runGate = async () => {
    setLoading(true);
    try {
      const r = await readinessMutation.mutateAsync({
        decision_ready: {
          is_ready: decisionReady,
          recommendation: recommendation ?? undefined,
          decision_basis: assessorValidated ? "assessor_validated" : "system_validated",
          assessor_validated: assessorValidated,
          has_blocking_factors: false,
        },
        contradiction_check: {
          valid: contradictionValid,
          action: contradictionAction ?? undefined,
          critical_count: contradictionCriticalCount ?? 0,
          major_count: contradictionMajorCount ?? 0,
          minor_count: contradictionMinorCount ?? 0,
        },
        overall_confidence: confidence,
        assessor_override: assessorValidated,
        documents_attached: claim?.documentsAttached ?? undefined,
        intake_validated: claim?.workflowState
          ? !["created", "intake_queue"].includes(claim.workflowState)
          : undefined,
      });
      setResult(r);
    } catch (e) {
      console.error("Report readiness gate error:", e);
    } finally {
      setLoading(false);
    }
  };

  // Auto-run on mount
  useState(() => { runGate(); });

  if (loading && !result) {
    return (
      <div className="flex items-center gap-3 py-6" style={{ color: "var(--muted-foreground)" }}>
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Checking export readiness…</span>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <ShieldCheck className="w-10 h-10" style={{ color: "var(--muted-foreground)" }} />
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Export readiness not yet evaluated.</p>
        <Button variant="outline" size="sm" onClick={runGate} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Check Readiness
        </Button>
      </div>
    );
  }

  const isReady = result.status === "READY";

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div
        className="flex items-center justify-between gap-3 p-3 rounded-lg"
        style={{
          background: isReady
            ? "oklch(0.35 0.12 145 / 0.2)"
            : "var(--status-reject-bg)",
          border: `1.5px solid ${isReady ? "var(--status-approve-border)" : "oklch(0.55 0.22 25 / 0.4)"}`,
        }}
      >
        <div className="flex items-center gap-2">
          {isReady
            ? <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
            : <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />}
          <div>
            <p
              className="font-bold text-sm"
              style={{ color: isReady ? "oklch(0.72 0.18 145)" : "var(--status-reject-text)" }}
            >
              {isReady ? "READY FOR EXPORT" : "EXPORT ON HOLD"}
            </p>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
              {result.reason}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setRunKey((k) => k + 1); runGate(); }}
            disabled={loading}
            className="text-xs"
            style={{ color: "var(--muted-foreground)" }}
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          </Button>
          {isReady && (
            <Button
              size="sm"
              onClick={onExport}
              className="text-xs font-semibold"
              style={{
                background: "var(--status-approve-text)",
                color: "oklch(0.98 0.01 145)",
              }}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export Report
            </Button>
          )}
        </div>
      </div>

      {/* Gate results */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>
          Gate Results — {result.metadata.gates_passed}/{result.gate_results.length} passed
        </p>
        <div className="space-y-2">
          {result.gate_results.map((g) => (
            <GateRow key={g.gate} gate={g.gate} passed={g.passed} detail={g.detail} />
          ))}
        </div>
      </div>

      {/* Hold reasons */}
      {result.hold_reasons.length > 0 && (
        <div
          className="p-3 rounded-lg space-y-1.5"
          style={{ background: "oklch(0.35 0.18 25 / 0.10)", border: "1px solid oklch(0.55 0.22 25 / 0.3)" }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
            Blocking Issues
          </p>
          {result.hold_reasons.map((reason, i) => (
            <div key={i} className="flex items-start gap-2">
              <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-red-600 dark:text-red-400" />
              <p className="text-xs leading-relaxed" style={{ color: "var(--foreground)" }}>{reason}</p>
            </div>
          ))}
        </div>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div
          className="p-3 rounded-lg space-y-1.5"
          style={{ background: "oklch(0.38 0.14 70 / 0.12)", border: "1px solid oklch(0.55 0.18 70 / 0.3)" }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            Advisory Notes
          </p>
          {result.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "oklch(0.68 0.18 70)" }} />
              <p className="text-xs leading-relaxed" style={{ color: "var(--foreground)" }}>{w}</p>
            </div>
          ))}
        </div>
      )}

      {/* Metadata footer */}
      <div className="flex flex-wrap gap-3 pt-1 border-t" style={{ borderColor: "var(--border)" }}>
        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          Engine: {result.metadata.engine} v{result.metadata.version}
        </span>
        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          Confidence threshold: {result.metadata.confidence_threshold_used}%
        </span>
      </div>
    </div>
  );
}
