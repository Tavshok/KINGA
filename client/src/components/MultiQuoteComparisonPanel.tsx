/**
 * MultiQuoteComparisonPanel
 *
 * Renders the QUOTE-FIRST cost optimisation results:
 *   - Which panel beater was selected and why
 *   - All evaluated quotes ranked by composite score
 *   - AI estimate source badge (quote_derived / learning_db / insufficient_data)
 *   - Disqualified quotes with reasons
 */
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CheckCircle2, XCircle, AlertTriangle, Trophy, BarChart3, Wrench } from "lucide-react";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

interface SelectedQuote {
  panel_beater: string;
  total_cost: number;
  composite_score: number;
  coverage_score: number;
  completeness_score: number;
  confidence_score: number;
  weight: number;
  labour_cost?: number | null;
  parts_cost?: number | null;
}

interface DisqualifiedQuote {
  panel_beater: string;
  total_cost: number;
  reason: string;
}

interface QuoteOptimisationResult {
  quotes_evaluated: number;
  selected_quotes: SelectedQuote[];
  disqualified_quotes?: DisqualifiedQuote[];
  optimised_cost_usd: number;
  selection_rationale?: string;
}

interface MultiQuoteComparisonPanelProps {
  costIntelligenceJson?: string | null;
}

function ScoreBar({ value, max = 1, color = "bg-emerald-500" }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}

export function MultiQuoteComparisonPanel({ costIntelligenceJson }: MultiQuoteComparisonPanelProps) {
  const { fmt } = useTenantCurrency();

  const ci = (() => {
    try { return costIntelligenceJson ? JSON.parse(costIntelligenceJson) : null; } catch { return null; }
  })();

  if (!ci) return null;

  const optimisation: QuoteOptimisationResult | null = ci.quoteOptimisation ?? null;
  const aiEstimateSource: string = ci.aiEstimateSource ?? "insufficient_data";
  const quoteCount: number = ci.quoteCount ?? 0;
  const bestSelectedQuote: SelectedQuote | null = ci.bestSelectedQuote ?? null;

  // Nothing to show if no quotes were evaluated
  if (quoteCount === 0 || !optimisation) {
    return (
      <Card className="p-4 border-dashed">
        <div className="flex items-center gap-3 text-muted-foreground">
          <BarChart3 className="h-4 w-4 shrink-0" />
          <p className="text-sm">No repair quotes have been extracted for this claim yet. Once quotes are uploaded, the AI will rank and optimise them automatically.</p>
        </div>
      </Card>
    );
  }

  const selected = optimisation.selected_quotes ?? [];
  const disqualified = optimisation.disqualified_quotes ?? [];

  const sourceLabel: Record<string, { label: string; color: string }> = {
    quote_derived: { label: "Quote-derived", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
    learning_db: { label: "Learning DB", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
    insufficient_data: { label: "Awaiting itemised quote", color: "bg-muted text-muted-foreground border-border" },
  };
  const src = sourceLabel[aiEstimateSource] ?? sourceLabel.insufficient_data;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Quote Optimisation</h3>
          <Badge variant="outline" className="text-xs">{quoteCount} quote{quoteCount !== 1 ? "s" : ""} evaluated</Badge>
        </div>
        <Badge variant="outline" className={`text-xs border ${src.color}`}>{src.label}</Badge>
      </div>

      {/* Optimised cost summary */}
      {optimisation.optimised_cost_usd > 0 && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/50">
          <span className="text-sm text-muted-foreground">Optimised cost</span>
          <span className="text-base font-bold text-primary">{fmt(optimisation.optimised_cost_usd)}</span>
        </div>
      )}

      {/* Selection rationale */}
      {optimisation.selection_rationale && (
        <p className="text-xs text-muted-foreground italic border-l-2 border-primary/30 pl-3">
          {optimisation.selection_rationale}
        </p>
      )}

      {/* Selected quotes ranked table */}
      {selected.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected Quotes (ranked)</p>
          <div className="space-y-2">
            {selected.map((q, i) => (
              <div key={i} className={`rounded-lg border p-3 space-y-2 ${i === 0 ? "border-emerald-500/40 bg-emerald-500/5" : "border-border/50"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {i === 0 && <Trophy className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                    {i > 0 && <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    <span className="text-sm font-medium leading-tight">{q.panel_beater || "Unknown panel beater"}</span>
                  </div>
                  <span className="text-sm font-bold shrink-0">{fmt(q.total_cost)}</span>
                </div>
                {/* Score bars */}
                <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
                  <div>
                    <span className="text-muted-foreground">Coverage</span>
                    <ScoreBar value={q.coverage_score} color={i === 0 ? "bg-emerald-500" : "bg-blue-400"} />
                  </div>
                  <div>
                    <span className="text-muted-foreground">Completeness</span>
                    <ScoreBar value={q.completeness_score} color={i === 0 ? "bg-emerald-500" : "bg-blue-400"} />
                  </div>
                  <div>
                    <span className="text-muted-foreground">Confidence</span>
                    <ScoreBar value={q.confidence_score} color={i === 0 ? "bg-emerald-500" : "bg-blue-400"} />
                  </div>
                </div>
                {/* Parts / labour breakdown if available */}
                {(q.parts_cost != null || q.labour_cost != null) && (
                  <div className="flex gap-4 pt-1 border-t border-border/30 text-xs text-muted-foreground">
                    {q.parts_cost != null && (
                      <span><span className="font-medium text-foreground">{fmt(q.parts_cost)}</span> parts</span>
                    )}
                    {q.labour_cost != null && (
                      <span><span className="font-medium text-foreground">{fmt(q.labour_cost)}</span> labour</span>
                    )}
                  </div>
                )}
                {/* Weight badge */}
                <div className="flex justify-end">
                  <Badge variant="outline" className="text-xs">weight {(q.weight * 100).toFixed(0)}%</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disqualified quotes */}
      {disqualified.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Disqualified Quotes</p>
          <div className="space-y-1.5">
            {disqualified.map((q, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg border border-destructive/20 bg-destructive/5 text-xs">
                <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{q.panel_beater || "Unknown"}</span>
                  <span className="text-muted-foreground"> · {fmt(q.total_cost)}</span>
                  <p className="text-muted-foreground mt-0.5 leading-snug">{q.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Insufficient data notice */}
      {aiEstimateSource === "insufficient_data" && selected.length === 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <p>No itemised quotes are available. The AI cost estimate is based on historical learning data or is unavailable. Upload itemised repair quotes to enable quote-derived cost optimisation.</p>
        </div>
      )}
    </div>
  );
}
