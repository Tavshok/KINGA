/**
 * ValidationGate.tsx
 *
 * Client-side rendering guard for the KINGA Output Validation Engine.
 *
 * Displays:
 *  - SUPPRESSED banner (critical — output should not be treated as final)
 *  - CORRECTED notice (informational — one or more fields were auto-corrected)
 *  - Per-rule flags (image_processing_missing, low_confidence, INCOMPLETE, etc.)
 *  - Corrections detail (collapsible, for audit/transparency)
 *
 * Usage:
 *   <ValidationGate claimId={claimId} />
 *
 * The component fetches the validation result from trpc.aiAssessments.validate
 * and renders inline notices. It does NOT block rendering of ForensicDecisionPanel —
 * it overlays notices so adjusters can still view the raw data while being
 * clearly informed of any quality issues.
 */

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Info,
  ShieldAlert,
  Eye,
  EyeOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { P0_B1_FRAUD_DECISION_HOLD } from "@shared/p0FraudDecisionHoldPresentation";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES (mirrored from server/output-validation-engine.ts)
// ─────────────────────────────────────────────────────────────────────────────

type ValidationStatus = "VALIDATED" | "CORRECTED" | "SUPPRESSED";

interface ValidationCorrection {
  rule: number;
  field: string;
  original: unknown;
  corrected: unknown;
  reason: string;
}

interface ValidationFlag {
  rule: number;
  field: string;
  flag: string;
  severity: "info" | "warning" | "critical";
  message: string;
}

interface LegacyValidationResult {
  status: ValidationStatus;
  flags: ValidationFlag[];
  suppressed_fields: string[];
  corrections: ValidationCorrection[];
  notes: string;
}

type P0FraudDecisionHold = {
  status: "FRAUD_DECISION_WITHHELD";
  explanation: string;
  requiredEvidence: readonly string[];
  resolver: Readonly<{ action: string }>;
};

export const P0_FRAUD_VALIDATION_HOLD_FALLBACK: P0FraudDecisionHold = {
  status: "FRAUD_DECISION_WITHHELD",
  explanation:
    "Fraud authority is withheld because the withholding response is incomplete; no automated fraud conclusion may be inferred.",
  requiredEvidence: P0_B1_FRAUD_DECISION_HOLD.requiredEvidence,
  resolver: {
    action: P0_B1_FRAUD_DECISION_HOLD.resolver.action,
  },
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * The API contract is expected to provide the complete shared P0-B1 hold. A
 * malformed sentinel must still fail closed with actionable evidence and
 * resolution guidance rather than silently rendering blank fields.
 */
export function normalizeP0FraudValidationHold(
  payload: unknown
): P0FraudDecisionHold {
  if (!payload || typeof payload !== "object") {
    return P0_FRAUD_VALIDATION_HOLD_FALLBACK;
  }

  const candidate = payload as Record<string, unknown>;
  const resolver = candidate.resolver;
  const requiredEvidence = candidate.requiredEvidence;
  const hasCompleteHold =
    candidate.status === "FRAUD_DECISION_WITHHELD" &&
    isNonEmptyString(candidate.explanation) &&
    Array.isArray(requiredEvidence) &&
    requiredEvidence.length > 0 &&
    requiredEvidence.every(isNonEmptyString) &&
    resolver &&
    typeof resolver === "object" &&
    isNonEmptyString((resolver as Record<string, unknown>).action);

  if (!hasCompleteHold) {
    return P0_FRAUD_VALIDATION_HOLD_FALLBACK;
  }

  return {
    status: "FRAUD_DECISION_WITHHELD",
    explanation: candidate.explanation as string,
    requiredEvidence: [...(requiredEvidence as string[])],
    resolver: { action: (resolver as Record<string, string>).action },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS BANNER CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  ValidationStatus,
  {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    description: string;
    containerClass: string;
    badgeClass: string;
  }
> = {
  VALIDATED: {
    icon: CheckCircle2,
    label: "Output Validated",
    description:
      "All 10 validation rules passed. Output is complete and reliable.",
    containerClass:
      "border border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100",
    badgeClass:
      "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-200 dark:border-emerald-700",
  },
  CORRECTED: {
    icon: AlertTriangle,
    label: "Output Auto-Corrected",
    description:
      "One or more fields were automatically corrected before display. Review corrections below.",
    containerClass:
      "border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100",
    badgeClass:
      "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700",
  },
  SUPPRESSED: {
    icon: XCircle,
    label: "Output Incomplete — Do Not Treat as Final",
    description:
      "Critical fields are missing or confidence is insufficient. This output should not be used as a final decision without manual review.",
    containerClass:
      "border border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100",
    badgeClass:
      "bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200 dark:border-red-700",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// FLAG SEVERITY ICONS
// ─────────────────────────────────────────────────────────────────────────────

const FLAG_SEVERITY_CONFIG = {
  critical: {
    icon: ShieldAlert,
    class: "text-red-700 dark:text-red-300",
    bg: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800",
  },
  warning: {
    icon: AlertTriangle,
    class: "text-amber-700 dark:text-amber-300",
    bg: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
  },
  info: {
    icon: Info,
    class: "text-blue-700 dark:text-blue-300",
    bg: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
  },
};

const RULE_LABELS: Record<number, string> = {
  1: "Terminology",
  2: "Cost Governance",
  3: "Panel Beater",
  4: "Accident Description",
  5: "Image Processing",
  6: "Physics Output",
  7: "UI Status Mapping",
  8: "Confidence Gate",
  9: "Data Completeness",
  10: "Data Integrity",
};

export function P0FraudValidationHold({
  hold,
  compact = false,
}: {
  hold: P0FraudDecisionHold;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Badge
        variant="outline"
        className="border-amber-300 bg-amber-50 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
      >
        <ShieldAlert className="mr-1 h-3 w-3" />
        Fraud decision withheld — manual review required
      </Badge>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        Fraud Decision Withheld — Manual Review Required
      </div>
      <p className="text-xs leading-relaxed">{hold.explanation}</p>
      <p className="text-xs leading-relaxed">
        <span className="font-semibold">What is missing:</span>{" "}
        {hold.requiredEvidence.join("; ")}
      </p>
      <p className="text-xs leading-relaxed">
        <span className="font-semibold">What resolves this:</span>{" "}
        {hold.resolver.action}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CORRECTION ROW
// ─────────────────────────────────────────────────────────────────────────────

function CorrectionRow({ correction }: { correction: ValidationCorrection }) {
  const ruleLabel = RULE_LABELS[correction.rule] ?? `Rule ${correction.rule}`;
  const originalStr =
    correction.original === null || correction.original === undefined
      ? "not available"
      : String(correction.original);
  const correctedStr =
    correction.corrected === null || correction.corrected === undefined
      ? "not available"
      : String(correction.corrected);

  return (
    <div className="grid grid-cols-[auto_1fr_1fr_2fr] gap-x-3 gap-y-1 items-start py-2 border-b border-border/50 last:border-0 text-xs">
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 shrink-0">
        Rule {correction.rule}
      </Badge>
      <span className="font-medium text-foreground truncate">{ruleLabel}</span>
      <span
        className="text-muted-foreground font-mono truncate"
        title={originalStr}
      >
        {originalStr.length > 40 ? originalStr.slice(0, 40) + "…" : originalStr}
      </span>
      <span className="text-foreground font-mono truncate" title={correctedStr}>
        →{" "}
        {correctedStr.length > 60
          ? correctedStr.slice(0, 60) + "…"
          : correctedStr}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FLAG ROW
// ─────────────────────────────────────────────────────────────────────────────

function FlagRow({ flag }: { flag: ValidationFlag }) {
  const config = FLAG_SEVERITY_CONFIG[flag.severity];
  const Icon = config.icon;
  return (
    <div
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${config.bg}`}
    >
      <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${config.class}`} />
      <div className="min-w-0">
        <span className={`font-semibold ${config.class}`}>
          Rule {flag.rule} ({RULE_LABELS[flag.rule] ?? "Unknown"}):
        </span>{" "}
        <span className="text-foreground">{flag.message}</span>
        {flag.flag !== flag.message && (
          <span className="ml-1 font-mono text-[10px] opacity-60">
            [{flag.flag}]
          </span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface ValidationGateProps {
  claimId: number;
  /** If true, shows a compact single-line badge instead of the full panel */
  compact?: boolean;
}

export function ValidationGate({
  claimId,
  compact = false,
}: ValidationGateProps) {
  const [showCorrections, setShowCorrections] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const { data: validation, isLoading } = trpc.aiAssessments.validate.useQuery(
    { claimId },
    {
      staleTime: 60_000,
      retry: false,
    }
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        Running output validation…
      </div>
    );
  }

  if (!validation) return null;

  if (validation.status === "FRAUD_DECISION_WITHHELD") {
    return (
      <P0FraudValidationHold
        hold={normalizeP0FraudValidationHold(validation)}
        compact={compact}
      />
    );
  }

  // The endpoint currently returns the P0 hold, but this view retains the
  // legacy validation renderer for compatibility with a future, separately
  // governed non-fraud validation contract.
  const legacyValidation = validation as unknown as LegacyValidationResult;
  const config = STATUS_CONFIG[legacyValidation.status];
  const Icon = config.icon;

  // In compact mode, just show the status badge
  if (compact) {
    return (
      <Badge variant="outline" className={`text-xs ${config.badgeClass}`}>
        <Icon className="mr-1 h-3 w-3" />
        {legacyValidation.status}
      </Badge>
    );
  }

  // VALIDATED with no flags — show a minimal green bar, dismissible
  if (
    legacyValidation.status === "VALIDATED" &&
    legacyValidation.flags.length === 0
  ) {
    if (dismissed) return null;
    return (
      <div
        className={`flex items-center justify-between rounded-md border px-3 py-2 text-xs ${config.containerClass}`}
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium">{config.label}</span>
          <span className="opacity-70">— {legacyValidation.notes}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 opacity-50 hover:opacity-100"
          onClick={() => setDismissed(true)}
        >
          <EyeOff className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border px-4 py-3 space-y-3 ${config.containerClass}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{config.label}</span>
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 h-4 ${config.badgeClass}`}
              >
                {legacyValidation.status}
              </Badge>
            </div>
            <p className="text-xs opacity-80 mt-0.5">{config.description}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 shrink-0 opacity-50 hover:opacity-100"
          onClick={() => setDismissed(!dismissed)}
          title={dismissed ? "Show validation details" : "Collapse"}
        >
          {dismissed ? (
            <Eye className="h-3.5 w-3.5" />
          ) : (
            <EyeOff className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {!dismissed && (
        <>
          {/* Flags */}
          {legacyValidation.flags.length > 0 && (
            <div className="space-y-1.5">
              {legacyValidation.flags.map((flag, i) => (
                <FlagRow key={i} flag={flag} />
              ))}
            </div>
          )}

          {/* Suppressed fields list */}
          {legacyValidation.suppressed_fields.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs font-medium opacity-70">
                Suppressed fields:
              </span>
              {legacyValidation.suppressed_fields.map(f => (
                <Badge
                  key={f}
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 h-4 font-mono opacity-80"
                >
                  {f}
                </Badge>
              ))}
            </div>
          )}

          {/* Corrections (collapsible) */}
          {legacyValidation.corrections.length > 0 && (
            <div>
              <button
                onClick={() => setShowCorrections(!showCorrections)}
                className="flex items-center gap-1.5 text-xs font-medium opacity-80 hover:opacity-100 transition-opacity"
              >
                {showCorrections ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                {legacyValidation.corrections.length} auto-correction
                {legacyValidation.corrections.length !== 1 ? "s" : ""} applied
              </button>

              {showCorrections && (
                <div className="mt-2 rounded-md border border-border/50 bg-background/50 px-3 py-2">
                  <div className="grid grid-cols-[auto_1fr_1fr_2fr] gap-x-3 pb-1 mb-1 border-b border-border/50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>Rule</span>
                    <span>Category</span>
                    <span>Original</span>
                    <span>Corrected</span>
                  </div>
                  {legacyValidation.corrections.map((c, i) => (
                    <CorrectionRow key={i} correction={c} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <p className="text-[11px] opacity-60 font-mono">
            {legacyValidation.notes}
          </p>
        </>
      )}
    </div>
  );
}
