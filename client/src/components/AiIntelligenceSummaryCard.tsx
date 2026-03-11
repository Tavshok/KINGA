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

import { useState } from "react";
import { ConfidenceScorePanel } from "@/components/ConfidenceScorePanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Wrench,
  BarChart2,
  Brain,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DamagedComponent {
  name?: string;
  component?: string;
  location?: string;
  severity?: string;
  damageType?: string;
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
  confidenceScoreBreakdownJson?: string | null;
  fraudRiskLevel?: string | null;
  structuralDamageSeverity?: string | null;
  estimatedCost?: number | null;
  estimatedPartsCost?: number | null;
  estimatedLaborCost?: number | null;
  totalLossIndicated?: number | null;
  costIntelligenceJson?: string | null;
}

interface Props {
  aiAssessment: AiAssessment | null | undefined;
  quotes: Quote[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAmount(amount: number | null | undefined, sym: string = "US$"): string {
  if (amount == null || isNaN(amount)) return "—";
  // All monetary values are stored in cents — divide by 100 for display
  const value = amount / 100;
  return `${sym}${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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
      <Badge className="flex items-center gap-1 text-xs px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700">
        <ShieldAlert className="h-3 w-3" />
        MEDIUM
      </Badge>
    );
  }
  return (
    <Badge className="flex items-center gap-1 text-xs px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700">
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
      ? "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700"
      : normalized === "moderate"
      ? "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700"
      : "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700";

  return (
    <Badge className={`flex items-center gap-1 text-xs px-2 py-0.5 ${colorClass}`}>
      <Wrench className="h-3 w-3" />
      {label}
    </Badge>
  );
}

function SeverityBadge({ severity }: { severity: string | null | undefined }) {
  const s = (severity ?? "").toLowerCase();
  if (s === "total_loss") return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">TOTAL LOSS</Badge>;
  if (s === "severe") return <Badge className="text-[10px] px-1.5 py-0 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700">SEVERE</Badge>;
  if (s === "moderate") return <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700">MODERATE</Badge>;
  if (s === "minor") return <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700">MINOR</Badge>;
  return null;
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

export function AiIntelligenceSummaryCard({ aiAssessment, quotes }: Props) {
  const [showAllComponents, setShowAllComponents] = useState(false);

  // ── Derived values ──────────────────────────────────────────────────────────
  const components = parseComponents(aiAssessment?.damagedComponentsJson);
  const INITIAL_SHOW = 6;
  const visibleComponents = showAllComponents ? components : components.slice(0, INITIAL_SHOW);

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

  // Cost breakdown
  const partsCost = aiAssessment?.estimatedPartsCost;
  const laborCost = aiAssessment?.estimatedLaborCost;

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
          {aiAssessment.totalLossIndicated === 1 && (
            <Badge variant="destructive" className="ml-2 text-xs">TOTAL LOSS INDICATED</Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-0 space-y-5">

        {/* ── Row 1: Stats grid ─────────────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

          {/* Section 1: Repair Cost Intelligence */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <BarChart2 className="h-3.5 w-3.5" />
              Repair Cost Intelligence
            </p>
            <div className="space-y-1.5 text-sm">
              {/* Show AI benchmark (independent) if available, otherwise show document-extracted */}
              {(() => {
                const ci = (() => { try { return aiAssessment.costIntelligenceJson ? JSON.parse(aiAssessment.costIntelligenceJson) : null; } catch { return null; } })();
                const hasBenchmark = ci && ci.aiBenchmarkTotalCents > 0;
                const docCost = ci?.documentExtractedCostCents ?? aiAssessment.estimatedCost;
                const benchmarkLow = ci?.aiBenchmarkLowCents;
                const benchmarkHigh = ci?.aiBenchmarkHighCents;
                const variancePct = ci?.costVariancePct;
                return (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{hasBenchmark ? 'Document Quote' : 'AI Estimated Total'}</span>
                      <span className="font-semibold text-primary">{formatAmount(docCost)}</span>
                    </div>
                    {hasBenchmark && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">AI Benchmark</span>
                          <span className="font-semibold" style={{ color: 'oklch(0.62 0.18 155)' }}>{formatAmount(ci.aiBenchmarkTotalCents)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Fair Range</span>
                          <span className="font-medium text-xs">{formatAmount(benchmarkLow)} – {formatAmount(benchmarkHigh)}</span>
                        </div>
                        {variancePct != null && Math.abs(variancePct) > 5 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Variance</span>
                            <span className={`font-semibold text-xs ${variancePct > 20 ? 'text-destructive' : variancePct > 10 ? 'text-yellow-400' : 'text-green-400'}`}>
                              {variancePct > 0 ? '+' : ''}{variancePct}%
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </>
                );
              })()}
              {partsCost != null && partsCost > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Parts</span>
                  <span className="font-medium">{formatAmount(partsCost)}</span>
                </div>
              )}
              {laborCost != null && laborCost > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Labour</span>
                  <span className="font-medium">{formatAmount(laborCost)}</span>
                </div>
              )}
              {quoteAmounts.length > 0 ? (
                <>
                  <div className="flex justify-between pt-1 border-t border-border/50">
                    <span className="text-muted-foreground">Quote spread</span>
                    <span className="font-semibold">{spreadPct != null ? `${spreadPct}%` : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Median quote</span>
                    <span className="font-semibold">{formatAmount(medianQuote)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between pt-1 border-t border-border/50">
                  <span className="text-muted-foreground">Quotes</span>
                  <span className="text-xs text-muted-foreground">Awaiting quotes</span>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Risk Indicators */}
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
              {quoteAmounts.length > 0 && recommendedQuote && (
                <div className="flex items-start justify-between gap-2 pt-1 border-t border-border/50">
                  <span className="text-muted-foreground shrink-0">Recommended</span>
                  <span className="font-semibold text-primary text-right text-xs leading-tight">
                    {recommendedQuote.panelBeaterName ?? `Repairer #${recommendedQuote.panelBeaterId ?? recommendedQuote.id}`}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: AI Confidence — full breakdown panel */}
          <div className="space-y-2 col-span-full lg:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              AI Confidence
            </p>
            <ConfidenceScorePanel
              confidenceScore={aiAssessment.confidenceScore ?? 0}
              confidenceScoreBreakdownJson={aiAssessment.confidenceScoreBreakdownJson}
              compact={false}
            />
          </div>

          {/* Section 4: Damage Count */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Damage Summary
            </p>
            <p className="text-2xl font-bold text-primary">{components.length}</p>
            <p className="text-xs text-muted-foreground">
              component{components.length !== 1 ? "s" : ""} detected
            </p>
            <div className="flex gap-1.5 flex-wrap">
              {["total_loss", "severe", "moderate", "minor"].map((sev) => {
                const count = components.filter(c => (c.severity ?? "").toLowerCase() === sev).length;
                if (count === 0) return null;
                return (
                  <SeverityBadge key={sev} severity={sev} />
                );
              })}
            </div>
          </div>

        </div>

        {/* ── Row 2: All Damaged Components ─────────────────────────────── */}
        {components.length > 0 && (
          <div className="border-t border-border/50 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Detected Damage Components ({components.length})
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {visibleComponents.map((c, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 p-2 rounded-md bg-background/60 border border-border/40"
                >
                  <span className="mt-0.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium capitalize leading-tight">{componentLabel(c)}</p>
                    {c.location && (
                      <p className="text-xs text-muted-foreground capitalize">{c.location}</p>
                    )}
                  </div>
                  {c.severity && <SeverityBadge severity={c.severity} />}
                </div>
              ))}
            </div>
            {components.length > INITIAL_SHOW && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-xs text-muted-foreground"
                onClick={() => setShowAllComponents(!showAllComponents)}
              >
                {showAllComponents ? (
                  <><ChevronUp className="h-3 w-3 mr-1" />Show less</>
                ) : (
                  <><ChevronDown className="h-3 w-3 mr-1" />Show {components.length - INITIAL_SHOW} more components</>
                )}
              </Button>
            )}
          </div>
        )}

      </CardContent>
    </Card>
  );
}
