/**
 * RepairIntelligencePanel
 *
 * Displays the enhanced AI Repair Intelligence summary for a claim.
 * Advisory only — does not modify any claim data.
 *
 * Sections:
 *   1. AI Repair Intelligence header (confidence score, risk badge)
 *   2. Garage Comparison (quote amounts, outlier flags)
 *   3. Quote Statistics (median, fair range, spread)
 *   4. Repair-to-Vehicle Value Ratio
 *   5. Confidence Factors
 *   6. Part Reconciliation (detected vs quoted)
 *   7. Historical Cost Comparison
 *   8. Country Repair Context
 */

import { trpc } from "@/lib/trpc";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  CheckCircle,
  Info,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart2,
  Car,
  Gauge,
} from "lucide-react";

interface Props {
  claimId: number;
  countryCode?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// formatRands replaced by useTenantCurrency hook in component body

// ─── Sub-components ───────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: "low" | "medium" | "high" }) {
  if (level === "high") {
    return (
      <Badge variant="destructive" className="flex items-center gap-1 text-sm px-3 py-1">
        <ShieldAlert className="h-4 w-4" />
        High Risk
      </Badge>
    );
  }
  if (level === "medium") {
    return (
      <Badge className="flex items-center gap-1 text-sm px-3 py-1 bg-amber-500 hover:bg-amber-500 text-white">
        <AlertTriangle className="h-4 w-4" />
        Medium Risk
      </Badge>
    );
  }
  return (
    <Badge className="flex items-center gap-1 text-sm px-3 py-1 bg-emerald-600 hover:bg-emerald-600 text-white">
      <CheckCircle className="h-4 w-4" />
      Low Risk
    </Badge>
  );
}

function ConfidenceBadge({ level }: { level: "high" | "medium" | "low" }) {
  const styles = {
    high: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    low: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[level]}`}>
      {level} confidence
    </span>
  );
}

function CoverageBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const colour =
    pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-medium tabular-nums w-10 text-right">{pct}%</span>
    </div>
  );
}

function ConfidenceBar({ score }: { score: number }) {
  const colour =
    score >= 70 ? "bg-emerald-500" : score >= 45 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-sm font-bold tabular-nums w-10 text-right">{score}%</span>
    </div>
  );
}

function DeviationIndicator({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-muted-foreground text-sm">—</span>;
  if (pct > 0) {
    return (
      <span className={`flex items-center gap-1 font-semibold ${pct > 20 ? "text-red-500" : "text-amber-500"}`}>
        <TrendingUp className="h-4 w-4" />
        +{pct.toFixed(1)}%
      </span>
    );
  }
  if (pct < 0) {
    return (
      <span className="flex items-center gap-1 font-semibold text-emerald-600">
        <TrendingDown className="h-4 w-4" />
        {pct.toFixed(1)}%
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 font-semibold text-muted-foreground">
      <Minus className="h-4 w-4" />
      0%
    </span>
  );
}

const RATIO_CATEGORY_LABELS: Record<string, { label: string; colour: string }> = {
  minor: { label: "Minor repair (<20% of vehicle value)", colour: "text-emerald-600" },
  moderate: { label: "Moderate repair (20–40% of vehicle value)", colour: "text-amber-600" },
  major: { label: "Major repair (40–60% of vehicle value)", colour: "text-orange-600" },
  near_write_off: { label: "Near economic write-off (>60% of vehicle value)", colour: "text-red-600" },
  unknown: { label: "Vehicle value not provided", colour: "text-muted-foreground" },
};

// ─── Main Component ───────────────────────────────────────────────────────────

export function RepairIntelligencePanel({ claimId, countryCode = "ZA" }: Props) {
  const { fmt: formatRands } = useTenantCurrency();
  const { data, isLoading, error } = trpc.quoteIntelligence.getReport.useQuery(
    { claimId, countryCode },
    { retry: false }
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4 text-primary" />
            AI Repair Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-4 bg-muted rounded w-3/4" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="border-muted">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4 text-muted-foreground" />
            AI Repair Intelligence
          </CardTitle>
          <CardDescription>
            {error?.message ?? "No intelligence data available for this claim."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const {
    reconciliation,
    historicalDeviation,
    countryContext,
    riskLevel,
    riskFactors,
    // Enhanced layers
    quoteComparison,
    garageQuotes,
    repairRatio,
    repairCostBenchmark,
    partsCertainty,
    confidence,
    aiRecommendation,
  } = data as any;

  const hasEnhancedData = !!quoteComparison;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart2 className="h-4 w-4 text-primary" />
            AI Repair Intelligence
          </CardTitle>
          <RiskBadge level={riskLevel} />
        </div>
        <CardDescription className="text-xs text-muted-foreground mt-1">
          Advisory only — the claims processor remains the final decision maker
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">

        {/* ── Confidence Score ─────────────────────────────────────────────── */}
        {hasEnhancedData && (
          <>
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Confidence Score
                </p>
                <span className="text-xs text-muted-foreground">
                  {confidence.score}%
                </span>
              </div>
              <ConfidenceBar score={confidence.score} />
              <ul className="mt-2 space-y-1">
                {confidence.factors.map((f: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="mt-0.5 shrink-0">•</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <Separator />
          </>
        )}

        {/* ── Garage Comparison ────────────────────────────────────────────── */}
        {hasEnhancedData && garageQuotes?.length > 0 && (
          <>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Garage Comparison ({aiRecommendation.quotesAnalysed} quotes)
              </p>
              <div className="space-y-2">
                {garageQuotes.map((g: any) => (
                  <div key={g.garageName} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{g.garageName}</span>
                    <div className="flex items-center gap-2">
                      <span className={g.isOutlier ? "text-amber-600 font-semibold" : "font-medium"}>
                        {formatRands(g.totalAmount)}
                      </span>
                      {g.isOutlier && (
                        <Badge className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-300">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Potential cost outlier
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div className="text-muted-foreground">Median repair cost</div>
                <div className="font-semibold">{formatRands(quoteComparison.medianQuote)}</div>
                <div className="text-muted-foreground">Recommended fair range</div>
                <div className="font-medium text-emerald-700 dark:text-emerald-400">
                  {formatRands(quoteComparison.fairRangeLow)} – {formatRands(quoteComparison.fairRangeHigh)}
                </div>
                <div className="text-muted-foreground">Quote spread</div>
                <div className="font-medium">{quoteComparison.spreadPercentage?.toFixed(1)}%</div>
              </div>
            </div>
            <Separator />
          </>
        )}

        {/* ── Repair-to-Vehicle Ratio ──────────────────────────────────────── */}
        {hasEnhancedData && repairRatio && (
          <>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1">
                <Car className="h-3.5 w-3.5" />
                Repair-to-Vehicle Value Ratio
              </p>
              {repairRatio.ratio !== null ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          repairRatio.category === "minor"
                            ? "bg-emerald-500"
                            : repairRatio.category === "moderate"
                            ? "bg-amber-500"
                            : repairRatio.category === "major"
                            ? "bg-orange-500"
                            : "bg-red-500"
                        }`}
                        style={{ width: `${Math.min(100, repairRatio.ratioPercentage ?? 0)}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold tabular-nums w-12 text-right">
                      {repairRatio.ratioPercentage?.toFixed(1)}%
                    </span>
                  </div>
                  <p className={`text-sm font-medium ${RATIO_CATEGORY_LABELS[repairRatio.category]?.colour}`}>
                    {RATIO_CATEGORY_LABELS[repairRatio.category]?.label}
                  </p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mt-1">
                    <div className="text-muted-foreground">Vehicle market value</div>
                    <div className="font-medium">{formatRands(repairRatio.vehicleMarketValue)}</div>
                    <div className="text-muted-foreground">Repair cost (median)</div>
                    <div className="font-medium">{formatRands(repairRatio.repairCost)}</div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Vehicle market value not provided — ratio unavailable
                </p>
              )}
            </div>
            <Separator />
          </>
        )}

        {/* ── Risk Factors ─────────────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Risk Factors
          </p>
          <ul className="space-y-1">
            {riskFactors.map((factor: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 shrink-0">
                  {riskLevel === "high" ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                  ) : riskLevel === "medium" ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  ) : (
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                  )}
                </span>
                {factor}
              </li>
            ))}
          </ul>
        </div>

        <Separator />

        {/* ── Parts Certainty ──────────────────────────────────────────────── */}
        {hasEnhancedData && partsCertainty && (
          <>
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Parts Certainty
                </p>
                <ConfidenceBadge level={partsCertainty.level} />
              </div>
              <p className="text-sm text-muted-foreground">{partsCertainty.summary}</p>
              {partsCertainty.level === "low" && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Parts classification unknown — confidence score reduced
                </p>
              )}
            </div>
            <Separator />
          </>
        )}

        {/* ── Part Reconciliation ──────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Part Reconciliation
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-3">
            <div className="text-muted-foreground">Detected parts</div>
            <div className="font-medium">{reconciliation.detectedCount}</div>
            <div className="text-muted-foreground">Quoted parts</div>
            <div className="font-medium">{reconciliation.quotedCount}</div>
            <div className="text-muted-foreground">Matched</div>
            <div className="font-medium text-emerald-600">{reconciliation.matchedParts.length}</div>
          </div>

          <div className="mb-2">
            <p className="text-xs text-muted-foreground mb-1">Quote coverage</p>
            <CoverageBar score={reconciliation.coverageScore} />
          </div>

          {reconciliation.missingParts.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                Missing parts ({reconciliation.missingParts.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {reconciliation.missingParts.map((p: string) => (
                  <Badge key={p} variant="outline" className="text-xs border-red-300 text-red-700 dark:text-red-300">
                    {p}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {reconciliation.extraParts.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">
                Extra parts ({reconciliation.extraParts.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {reconciliation.extraParts.map((p: string) => (
                  <Badge key={p} variant="outline" className="text-xs border-amber-300 text-amber-700 dark:text-amber-300">
                    {p}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* ── Historical Cost Comparison ───────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Historical Cost Comparison
            </p>
            <ConfidenceBadge level={historicalDeviation.confidence} />
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div className="text-muted-foreground">Historical median</div>
            <div className="font-medium">{formatRands(historicalDeviation.medianCost)}</div>
            <div className="text-muted-foreground">Historical average</div>
            <div className="font-medium">{formatRands(historicalDeviation.averageCost)}</div>
            <div className="text-muted-foreground">Sample size</div>
            <div className="font-medium">{historicalDeviation.sampleSize} claims</div>
            <div className="text-muted-foreground">Deviation</div>
            <div className="font-medium">
              <DeviationIndicator pct={historicalDeviation.deviationPct} />
            </div>
          </div>

          {/* Repair Cost Intelligence Benchmark */}
          {repairCostBenchmark && (
            <div className="mt-3 p-3 bg-muted/40 rounded-md">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Repair Cost Intelligence — {repairCostBenchmark.vehicleMake} {repairCostBenchmark.vehicleModel}
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="text-muted-foreground">Benchmark median</div>
                <div className="font-medium">{formatRands(repairCostBenchmark.medianRepairCost)}</div>
                <div className="text-muted-foreground">Benchmark range</div>
                <div className="font-medium">
                  {formatRands(repairCostBenchmark.minRepairCost)} – {formatRands(repairCostBenchmark.maxRepairCost)}
                </div>
                <div className="text-muted-foreground">Based on</div>
                <div className="font-medium">{repairCostBenchmark.claimCount} completed claims</div>
              </div>
              <div className="mt-1">
                <ConfidenceBadge level={repairCostBenchmark.intelligenceConfidence} />
              </div>
            </div>
          )}
        </div>

        {/* ── Country Context ──────────────────────────────────────────────── */}
        {countryContext && (
          <>
            <Separator />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Repair Context — {countryContext.countryName}
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div className="text-muted-foreground">VAT rate</div>
                <div className="font-medium">{(countryContext.vatRate * 100).toFixed(1)}%</div>
                <div className="text-muted-foreground">Import duty</div>
                <div className="font-medium">{(countryContext.importDutyRate * 100).toFixed(1)}%</div>
                <div className="text-muted-foreground">Avg labour rate</div>
                <div className="font-medium">
                  {countryContext.currencyCode} {(countryContext.avgLabourRatePerHour / 100).toFixed(0)}/hr
                </div>
              </div>
            </div>
          </>
        )}

        <p className="text-xs text-muted-foreground pt-1 border-t border-muted">
          Generated {new Date(data.generatedAt).toLocaleString()} · Advisory only
        </p>
      </CardContent>
    </Card>
  );
}
