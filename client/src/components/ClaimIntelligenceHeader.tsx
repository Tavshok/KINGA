/**
 * ClaimIntelligenceHeader.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 1 — Sprint 1: Interpretation Engine as Action-Driving Intelligence Layer
 *
 * Surfaces KINGA's Stage 10-I Interpretation Engine output at the top of every
 * claim workflow. This is NOT a display component — it is an action-driving
 * layer that tells the user what to do next, not just what was found.
 *
 * Two variants:
 *   - "full"    — complete header with classification, CGI verdict, narrative,
 *                 and top three priority actions (Claims Manager, Assessor)
 *   - "compact" — single-row badge strip with top action (Claimant, list views)
 *
 * Data source: aiAssessments.byClaim._interpretation and ._cgi
 * No new engines, no new DB queries — reads from already-fetched assessment data.
 */

import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ChevronRight,
  Brain,
  Shield,
  Zap,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type OverallClassification = "CRITICAL" | "CONCERN" | "ATTENTION" | "NORMAL" | null;
type CGIVerdict = "COHERENT" | "ANOMALOUS" | "INCOHERENT" | null;

interface InterpretedClaim {
  overallClassification?: OverallClassification;
  overallNarrative?: string;
  topThreeActions?: string[];
  llmEnriched?: boolean;
}

interface CGIResult {
  contactGeometryFlag?: boolean;
  forensicVerdict?: CGIVerdict;
  hiddenDamageProbabilityOverride?: number | null;
}

export interface ClaimIntelligenceHeaderProps {
  /** Stage 10-I interpretation output from aiAssessments.byClaim._interpretation */
  interpretation: InterpretedClaim | null | undefined;
  /** CGI output from aiAssessments.byClaim._cgi */
  cgi: CGIResult | null | undefined;
  /** "full" for claim detail views, "compact" for list rows and claimant portal */
  variant?: "full" | "compact";
  /** Optional additional className */
  className?: string;
}

// ── Classification styling ────────────────────────────────────────────────────

function classificationStyle(c: OverallClassification) {
  switch (c) {
    case "CRITICAL":
      return {
        bg: "#FDF1F1",
        border: "#F5C6C6",
        accent: "#A32D2D",
        text: "#A32D2D",
        icon: <XCircle className="h-4 w-4" />,
        label: "CRITICAL",
      };
    case "CONCERN":
      return {
        bg: "#FDF6EC",
        border: "#F5DFA0",
        accent: "#8A5C00",
        text: "#8A5C00",
        icon: <AlertTriangle className="h-4 w-4" />,
        label: "CONCERN",
      };
    case "ATTENTION":
      return {
        bg: "#EEF3F9",
        border: "#BDD4EC",
        accent: "#4878A8",
        text: "#4878A8",
        icon: <AlertCircle className="h-4 w-4" />,
        label: "ATTENTION",
      };
    case "NORMAL":
      return {
        bg: "#F0F7F2",
        border: "#C8E0CE",
        accent: "#3C7844",
        text: "#3C7844",
        icon: <CheckCircle2 className="h-4 w-4" />,
        label: "NORMAL",
      };
    default:
      return {
        bg: "#F9FAFB",
        border: "#E5E7EB",
        accent: "#6B7280",
        text: "#6B7280",
        icon: <Brain className="h-4 w-4" />,
        label: "ANALYSING",
      };
  }
}

function cgiVerdictStyle(v: CGIVerdict) {
  switch (v) {
    case "INCOHERENT":
      return { bg: "#FDF1F1", border: "#F5C6C6", text: "#A32D2D", label: "Geometry Incoherent" };
    case "ANOMALOUS":
      return { bg: "#FDF6EC", border: "#F5DFA0", text: "#8A5C00", label: "Geometry Anomalous" };
    case "COHERENT":
      return { bg: "#F0F7F2", border: "#C8E0CE", text: "#3C7844", label: "Geometry Coherent" };
    default:
      return null;
  }
}

// ── Compact variant ───────────────────────────────────────────────────────────

function CompactIntelligenceHeader({ interpretation, cgi, className }: ClaimIntelligenceHeaderProps) {
  const classification = interpretation?.overallClassification ?? null;
  const cs = classificationStyle(classification);
  const cgiStyle = cgi?.forensicVerdict ? cgiVerdictStyle(cgi.forensicVerdict) : null;
  const topAction = interpretation?.topThreeActions?.[0];

  if (!interpretation && !cgi) return null;

  return (
    <div
      className={cn("flex items-center gap-2 flex-wrap py-2 px-3 rounded-md text-xs", className)}
      style={{ background: cs.bg, border: `1px solid ${cs.border}` }}
    >
      {/* Classification badge */}
      <span
        className="inline-flex items-center gap-1 font-semibold"
        style={{ color: cs.text }}
      >
        {cs.icon}
        KINGA: {cs.label}
      </span>

      {/* CGI verdict badge */}
      {cgiStyle && (
        <>
          <span style={{ color: "#D1D5DB" }}>·</span>
          <span
            className="inline-flex items-center gap-1 font-medium"
            style={{ color: cgiStyle.text }}
          >
            <Shield className="h-3 w-3" />
            {cgiStyle.label}
          </span>
        </>
      )}

      {/* Top action */}
      {topAction && (
        <>
          <span style={{ color: "#D1D5DB" }}>·</span>
          <span className="text-muted-foreground flex items-center gap-1">
            <Zap className="h-3 w-3" />
            {topAction}
          </span>
        </>
      )}
    </div>
  );
}

// ── Full variant ──────────────────────────────────────────────────────────────

function FullIntelligenceHeader({ interpretation, cgi, className }: ClaimIntelligenceHeaderProps) {
  const classification = interpretation?.overallClassification ?? null;
  const cs = classificationStyle(classification);
  const cgiStyle = cgi?.forensicVerdict ? cgiVerdictStyle(cgi.forensicVerdict) : null;
  const actions = interpretation?.topThreeActions ?? [];
  const narrative = interpretation?.overallNarrative;

  if (!interpretation && !cgi) {
    return (
      <div
        className={cn("rounded-lg p-4 text-sm text-muted-foreground", className)}
        style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }}
      >
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4" />
          <span>KINGA intelligence analysis not yet available for this claim.</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("rounded-lg overflow-hidden", className)}
      style={{ border: `1px solid ${cs.border}` }}
    >
      {/* Header strip */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: cs.bg, borderBottom: `1px solid ${cs.border}` }}
      >
        <div className="flex items-center gap-3">
          {/* Classification badge */}
          <span
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full"
            style={{
              background: cs.accent + "18",
              color: cs.accent,
              border: `1px solid ${cs.accent}44`,
            }}
          >
            {cs.icon}
            KINGA Intelligence: {cs.label}
          </span>

          {/* CGI verdict badge */}
          {cgiStyle && (
            <span
              className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
              style={{
                background: cgiStyle.bg,
                color: cgiStyle.text,
                border: `1px solid ${cgiStyle.border}`,
              }}
            >
              <Shield className="h-3 w-3" />
              {cgiStyle.label}
            </span>
          )}

          {/* Hidden damage probability */}
          {cgi?.hiddenDamageProbabilityOverride != null && cgi.hiddenDamageProbabilityOverride > 0.4 && (
            <span
              className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
              style={{
                background: "#FDF6EC",
                color: "#8A5C00",
                border: "1px solid #F5DFA0",
              }}
            >
              <AlertTriangle className="h-3 w-3" />
              {Math.round(cgi.hiddenDamageProbabilityOverride * 100)}% hidden damage probability
            </span>
          )}
        </div>

        {interpretation?.llmEnriched === false && (
          <span className="text-xs text-muted-foreground">Deterministic analysis</span>
        )}
      </div>

      {/* Narrative */}
      {narrative && (
        <div
          className="px-4 py-3 text-sm leading-relaxed"
          style={{ background: cs.bg, color: "#374151", borderBottom: `1px solid ${cs.border}` }}
        >
          {narrative}
        </div>
      )}

      {/* Priority actions */}
      {actions.length > 0 && (
        <div className="px-4 py-3" style={{ background: "#FFFFFF" }}>
          <p
            className="text-xs font-semibold uppercase tracking-wide mb-2"
            style={{ color: "#9CA3AF", letterSpacing: "0.07em", fontSize: "0.6875rem" }}
          >
            Priority Actions
          </p>
          <div className="space-y-1.5">
            {actions.map((action, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 text-sm"
                style={{ color: "#111827" }}
              >
                <span
                  className="inline-flex items-center justify-center rounded-full text-xs font-bold flex-shrink-0 mt-0.5"
                  style={{
                    width: 18,
                    height: 18,
                    background: cs.accent + "18",
                    color: cs.accent,
                    fontSize: "0.6875rem",
                  }}
                >
                  {i + 1}
                </span>
                <span className="flex-1 leading-snug">{action}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 flex-shrink-0 mt-0.5" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function ClaimIntelligenceHeader({
  interpretation,
  cgi,
  variant = "full",
  className,
}: ClaimIntelligenceHeaderProps) {
  if (variant === "compact") {
    return (
      <CompactIntelligenceHeader
        interpretation={interpretation}
        cgi={cgi}
        className={className}
      />
    );
  }
  return (
    <FullIntelligenceHeader
      interpretation={interpretation}
      cgi={cgi}
      className={className}
    />
  );
}
