/**
 * DamageConsistencyPanel
 *
 * Displays the three-source damage consistency check result:
 *   - Consistency score gauge
 *   - Source summary (document / photos / physics)
 *   - Typed mismatch list with severity badges
 *   - "Run Check" button to trigger or re-run the check
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  FileText,
  Camera,
  Zap,
  Info,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types (mirror server types) ─────────────────────────────────────────────

type MismatchSeverity = "low" | "medium" | "high";
type MismatchType =
  | "zone_mismatch"
  | "component_unreported"
  | "component_not_visible"
  | "severity_mismatch"
  | "physics_zone_conflict"
  | "photo_zone_conflict"
  | "no_photo_evidence"
  | "no_document_evidence";

interface DamageMismatch {
  type: MismatchType;
  severity: MismatchSeverity;
  details: string;
  source_a?: string;
  source_b?: string;
  component?: string;
}

interface SourceSummary {
  document: { zones: string[]; components: string[]; available: boolean };
  photos: { zones: string[]; components: string[]; available: boolean };
  physics: { primaryZone: string | null; available: boolean };
}

interface ConsistencyCheckResult {
  consistency_score: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  mismatches: DamageMismatch[];
  source_summary: SourceSummary;
  checked_at: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DamageConsistencyPanelProps {
  claimId: number | undefined;
  consistencyCheckJson: string | null | undefined;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseResult(json: string | null | undefined): ConsistencyCheckResult | null {
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}

const SEVERITY_CONFIG: Record<MismatchSeverity, { label: string; classes: string; dot: string }> = {
  high: {
    label: "HIGH",
    classes: "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800",
    dot: "bg-red-500",
  },
  medium: {
    label: "MED",
    classes: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800",
    dot: "bg-amber-500",
  },
  low: {
    label: "LOW",
    classes: "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800",
    dot: "bg-blue-400",
  },
};

const TYPE_LABELS: Record<MismatchType, string> = {
  zone_mismatch: "Zone Mismatch",
  component_unreported: "Unreported Component",
  component_not_visible: "Component Not Visible",
  severity_mismatch: "Severity Mismatch",
  physics_zone_conflict: "Physics Conflict",
  photo_zone_conflict: "Photo Zone Conflict",
  no_photo_evidence: "No Photo Evidence",
  no_document_evidence: "No Document Evidence",
};

function ScoreGauge({ score }: { score: number }) {
  const color =
    score >= 75 ? "text-emerald-600 dark:text-emerald-400" :
    score >= 50 ? "text-amber-600 dark:text-amber-400" :
    "text-red-600 dark:text-red-400";

  const barColor =
    score >= 75 ? "bg-emerald-500" :
    score >= 50 ? "bg-amber-500" :
    "bg-red-500";

  return (
    <div className="flex items-center gap-3">
      <span className={`text-3xl font-bold tabular-nums ${color}`}>{score}</span>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>Consistency Score</span>
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>/100</span>
        </div>
        <div className="h-2 rounded-full" style={{ background: "var(--muted)" }}>
          <div
            className={`h-2 rounded-full transition-all ${barColor}`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function SourceChip({
  icon: Icon,
  label,
  available,
  detail,
}: {
  icon: React.ElementType;
  label: string;
  available: boolean;
  detail: string;
}) {
  return (
    <div
      className="flex items-start gap-2 p-2.5 rounded-lg"
      style={{ background: "var(--muted)", border: "1px solid var(--border)" }}
    >
      <Icon
        className="h-4 w-4 mt-0.5 flex-shrink-0"
        style={{ color: available ? "var(--foreground)" : "var(--muted-foreground)" }}
      />
      <div className="min-w-0">
        <p className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>{label}</p>
        <p className="text-xs mt-0.5 truncate" style={{ color: "var(--muted-foreground)" }}>{detail}</p>
      </div>
      {available ? (
        <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500 mt-0.5" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-amber-400 mt-0.5" />
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DamageConsistencyPanel({ claimId, consistencyCheckJson }: DamageConsistencyPanelProps) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [localResult, setLocalResult] = useState<ConsistencyCheckResult | null>(null);

  const storedResult = parseResult(consistencyCheckJson);
  const result = localResult ?? storedResult;

  const canRun = user?.role === "assessor" || user?.role === "insurer" || user?.role === "admin";

  const runMutation = (trpc.aiAssessments as any).runConsistencyCheck.useMutation({
    onSuccess: (data: ConsistencyCheckResult) => {
      setLocalResult(data);
      utils.aiAssessments.byClaim.invalidate({ claimId });
      toast.success("Consistency check complete", {
        description: `Score: ${data.consistency_score}/100 — ${data.mismatches.length} issue(s) found`,
      });
    },
    onError: (err: any) => {
      toast.error(`Consistency check failed: ${err.message}`);
    },
  });

  const handleRun = () => {
    if (!claimId) return;
    runMutation.mutate({ claimId });
  };

  const highCount = result?.mismatches.filter(m => m.severity === "high").length ?? 0;
  const medCount = result?.mismatches.filter(m => m.severity === "medium").length ?? 0;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
            Three-Source Damage Consistency
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            Cross-checks document extraction, photo detection, and physics impact zone
          </p>
        </div>
        {canRun && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleRun}
            disabled={runMutation.isPending || !claimId}
            className="gap-1.5 text-xs"
          >
            {runMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {result ? "Re-run Check" : "Run Check"}
          </Button>
        )}
      </div>

      {/* Loading state */}
      {runMutation.isPending && (
        <div className="flex items-center gap-3 py-4">
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--muted-foreground)" }} />
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            Comparing damage sources…
          </p>
        </div>
      )}

      {/* No result yet */}
      {!result && !runMutation.isPending && (
        <div
          className="flex items-center gap-3 p-4 rounded-lg"
          style={{ background: "var(--muted)", border: "1px solid var(--border)" }}
        >
          <Info className="h-4 w-4 flex-shrink-0" style={{ color: "var(--muted-foreground)" }} />
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            {canRun
              ? "No consistency check has been run yet. Click \"Run Check\" to compare all three damage sources."
              : "Consistency check has not been run for this claim."}
          </p>
        </div>
      )}

      {/* Result */}
      {result && !runMutation.isPending && (
        <div className="space-y-4">
          {/* Score + confidence */}
          <div
            className="p-4 rounded-lg"
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
          >
            <ScoreGauge score={result.consistency_score} />
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Confidence:</span>
              <Badge
                variant="outline"
                className={
                  result.confidence === "HIGH"
                    ? "text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700"
                    : result.confidence === "MEDIUM"
                    ? "text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700"
                    : "text-red-600 dark:text-red-400 border-red-300 dark:border-red-700"
                }
              >
                {result.confidence}
              </Badge>
              {result.mismatches.length > 0 && (
                <span className="text-xs ml-auto" style={{ color: "var(--muted-foreground)" }}>
                  {highCount > 0 && <span className="text-red-600 dark:text-red-400 font-medium">{highCount} high</span>}
                  {highCount > 0 && medCount > 0 && <span className="mx-1">·</span>}
                  {medCount > 0 && <span className="text-amber-600 dark:text-amber-400 font-medium">{medCount} medium</span>}
                  {(highCount > 0 || medCount > 0) && result.mismatches.length - highCount - medCount > 0 && <span className="mx-1">·</span>}
                  {result.mismatches.length - highCount - medCount > 0 && (
                    <span>{result.mismatches.length - highCount - medCount} low</span>
                  )}
                </span>
              )}
            </div>
            {result.checked_at && (
              <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>
                Checked {new Date(result.checked_at).toLocaleString()}
              </p>
            )}
          </div>

          {/* Source summary */}
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: "var(--muted-foreground)" }}>
              DATA SOURCES
            </p>
            <div className="grid grid-cols-3 gap-2">
              <SourceChip
                icon={FileText}
                label="Document"
                available={result.source_summary.document.available}
                detail={
                  result.source_summary.document.available
                    ? `${result.source_summary.document.components.length} component(s), zones: ${result.source_summary.document.zones.join(", ") || "inferred"}`
                    : "No extracted components"
                }
              />
              <SourceChip
                icon={Camera}
                label="Photos"
                available={result.source_summary.photos.available}
                detail={
                  result.source_summary.photos.available
                    ? `${result.source_summary.photos.components.length} component(s), zones: ${result.source_summary.photos.zones.join(", ") || "unknown"}`
                    : "No enriched photos"
                }
              />
              <SourceChip
                icon={Zap}
                label="Physics"
                available={result.source_summary.physics.available}
                detail={
                  result.source_summary.physics.available
                    ? `Primary zone: ${result.source_summary.physics.primaryZone}`
                    : "No physics analysis"
                }
              />
            </div>
          </div>

          {/* Mismatches */}
          {result.mismatches.length > 0 ? (
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: "var(--muted-foreground)" }}>
                MISMATCHES ({result.mismatches.length})
              </p>
              <div className="space-y-2">
                {result.mismatches.map((m, i) => {
                  const cfg = SEVERITY_CONFIG[m.severity];
                  return (
                    <div
                      key={i}
                      className="flex items-start gap-3 p-3 rounded-lg"
                      style={{ background: "var(--muted)", border: "1px solid var(--border)" }}
                    >
                      <div className={`flex-shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full ${cfg.dot}`} style={{ marginTop: "6px" }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>
                            {TYPE_LABELS[m.type] ?? m.type}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cfg.classes}`}>
                            {cfg.label}
                          </span>
                          {m.source_a && m.source_b && (
                            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                              {m.source_a} vs {m.source_b}
                            </span>
                          )}
                        </div>
                        <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                          {m.details}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
              <p className="text-sm text-emerald-700 dark:text-emerald-300">
                All three damage sources are consistent — no mismatches detected.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
