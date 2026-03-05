/**
 * AiIntelligenceSummaryCard
 *
 * A compact, read-only card that surfaces the key AI intelligence signals
 * already stored in the database for a given claim.  It is placed above the
 * quotes comparison table in InsurerComparisonView.
 *
 * Data sources consumed (all read-only):
 *   - aiAssessment.damagedComponentsJson   — detected components
 *   - aiAssessment.confidenceScore         — AI confidence %
 *   - aiAssessment.fraudRiskLevel          — fraud risk indicator
 *   - aiAssessment.structuralDamageSeverity — repair complexity proxy
 *   - panel beater quotes array            — quote spread + median
 *
 * No workflow logic is modified.  No new tRPC calls are made.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Wrench,
  BarChart2,
  Brain,
  AlertCircle,
} from "lucide-react";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DamagedComponent {
  name?: string;
  component?: string;
  location?: string;
  severity?: string;
  type?: string;
}

interface Quote {
  id: number;
  quotedAmount?: number | null;
  panelBeaterId?: number | null;
  panelBeaterName?: string | null;
}

interface AiAssessment {
  damagedComponentsJson?: string | null;
  confidenceScore?: number | null;
  fraudRiskLevel?: string | null;
  structuralDamageSeverity?: string | null;
  estimatedCost?: number | null;
}

interface Props {
  aiAssessment: AiAssessment | null | undefined;
  quotes: Quote[];
  /** Optional override — if omitted, falls back to tenant currency */
  currencySymbol?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCents(cents: number | null | undefined, sym: string): string {
  if (cents == null || isNaN(cents)) return "—";
  return `${sym}${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function parseComponents(json: string | null | undefined): DamagedComponent[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function componentLabel(c: DamagedComponent): string {
  return c.name || c.component || "Unknown component";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FraudBadge({ level }: { level: string | null | undefined }) {
  const normalized = (level ?? "low").toLowerCase();
  if (normalized === "high") {
    return (
      <Badge variant="destructive" className="flex items-center gap-1 text-xs px-2 py-0.5">
        <ShieldX className="h-3 w-3" />
        HIGH
      </Badge>
    );
  }
  if (normalized === "medium") {
    return (
      <Badge className="flex items-center gap-1 text-xs px-2 py-0.5 bg-amber-100 text-amber-800 border-amber-300">
        <ShieldAlert className="h-3 w-3" />
        MEDIUM
      </Badge>
    );
  }
  return (
    <Badge className="flex items-center gap-1 text-xs px-2 py-0.5 bg-emerald-100 text-emerald-800 border-emerald-300">
      <ShieldCheck className="h-3 w-3" />
      LOW
    </Badge>
  );
}

function ComplexityBadge({ severity }: { severity: string | null | undefined }) {
  const normalized = (severity ?? "moderate").toLowerCase();
  const label =
    normalized === "total_loss" ? "TOTAL LOSS" :
    normalized === "severe"     ? "HIGH" :
    normalized === "moderate"   ? "MEDIUM" :
    normalized === "minor"      ? "LOW" :
    normalized === "none"       ? "NONE" :
    normalized.toUpperCase();

  const colorClass =
    normalized === "total_loss" || normalized === "severe"
      ? "bg-red-100 text-red-800 border-red-300"
      : normalized === "moderate"
      ? "bg-amber-100 text-amber-800 border-amber-300"
      : "bg-emerald-100 text-emerald-800 border-emerald-300";

  return (
    <Badge className={`flex items-center gap-1 text-xs px-2 py-0.5 ${colorClass}`}>
      <Wrench className="h-3 w-3" />
      {label}
    </Badge>
  );
}

function ConfidenceBar({ score }: { score: number | null | undefined }) {
  const pct = Math.min(100, Math.max(0, score ?? 0));
  const color =
    pct >= 75 ? "bg-emerald-500" :
    pct >= 50 ? "bg-amber-400" :
    "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-semibold tabular-nums w-10 text-right">{pct}%</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AiIntelligenceSummaryCard({ aiAssessment, quotes, currencySymbol: injectedSym }: Props) {
  const { currencySymbol: tenantSym, fmt: tenantFmt } = useTenantCurrency();
  const sym = injectedSym ?? tenantSym;
  const fmt = injectedSym
    ? (cents: number | null | undefined) => formatCents(cents, sym)
    : tenantFmt;
  // ── Derived values ──────────────────────────────────────────────────────────
  const components = parseComponents(aiAssessment?.damagedComponentsJson);
  const top3 = components.slice(0, 3);

  const quoteAmounts = quotes
    .map((q) => q.quotedAmount ?? 0)
    .filter((v) => v > 0);

  const minQuote = quoteAmounts.length > 0 ? Math.min(...quoteAmounts) : null;
  const maxQuote = quoteAmounts.length > 0 ? Math.max(...quoteAmounts) : null;
  const medianQuote = quoteAmounts.length > 0 ? median(quoteAmounts) : null;

  const spreadPct =
    minQuote != null && maxQuote != null && minQuote > 0
      ? Math.round(((maxQuote - minQuote) / minQuote) * 100)
      : null;

  // Recommended repairer = quote closest to median
  let recommendedQuote: Quote | null = null;
  if (medianQuote != null && quotes.length > 0) {
    recommendedQuote = quotes.reduce((best, q) => {
      const diff = Math.abs((q.quotedAmount ?? 0) - medianQuote);
      const bestDiff = Math.abs((best.quotedAmount ?? 0) - medianQuote);
      return diff < bestDiff ? q : best;
    });
  }

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!aiAssessment) {
    return (
      <Card className="mb-6 border-dashed border-muted-foreground/30 bg-muted/20">
        <CardContent className="py-5 flex items-center gap-3 text-muted-foreground">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm">
            AI Intelligence Summary will appear here once the AI assessment has completed.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Populated state ─────────────────────────────────────────────────────────
  return (
    <Card className="mb-6 border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Brain className="h-5 w-5 text-primary" />
          AI Intelligence Summary
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">

          {/* ── Section 1: Damage Detection ─────────────────────────────── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              AI Damage Detection
            </p>
            <p className="text-sm">
              <span className="font-semibold text-foreground">{components.length}</span>
              {" "}component{components.length !== 1 ? "s" : ""} detected
            </p>
            {top3.length > 0 ? (
              <ul className="space-y-0.5">
                {top3.map((c, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-1.5">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    <span className="capitalize">{componentLabel(c)}</span>
                  </li>
                ))}
                {components.length > 3 && (
                  <li className="text-xs text-muted-foreground pl-3">
                    +{components.length - 3} more
                  </li>
                )}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No component data</p>
            )}
          </div>

          {/* ── Section 2: Repair Cost Intelligence ─────────────────────── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <BarChart2 className="h-3.5 w-3.5" />
              Repair Cost Intelligence
            </p>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Quote spread</span>
                <span className="font-semibold">
                  {spreadPct != null ? `${spreadPct}%` : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Median cost</span>
                <span className="font-semibold">{fmt(medianQuote)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Recommended</span>
                <span className="font-semibold text-primary truncate max-w-[120px] text-right">
                  {recommendedQuote
                    ? recommendedQuote.panelBeaterName ?? `Repairer #${recommendedQuote.panelBeaterId ?? recommendedQuote.id}`
                    : "—"}
                </span>
              </div>
            </div>
          </div>

          {/* ── Section 3: Risk Indicators ───────────────────────────────── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Risk Indicators
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Fraud risk</span>
                <FraudBadge level={aiAssessment.fraudRiskLevel} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Repair complexity</span>
                <ComplexityBadge severity={aiAssessment.structuralDamageSeverity} />
              </div>
            </div>
          </div>

          {/* ── Section 4: Confidence ────────────────────────────────────── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              AI Confidence
            </p>
            <ConfidenceBar score={aiAssessment.confidenceScore} />
            <p className="text-xs text-muted-foreground">
              {(aiAssessment.confidenceScore ?? 0) >= 75
                ? "High confidence — assessment is reliable."
                : (aiAssessment.confidenceScore ?? 0) >= 50
                ? "Moderate confidence — manual review recommended."
                : "Low confidence — additional photos may improve accuracy."}
            </p>
          </div>

        </div>
      </CardContent>
    </Card>
  );
}
