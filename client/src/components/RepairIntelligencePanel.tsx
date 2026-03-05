/**
 * RepairIntelligencePanel
 *
 * Displays the Repair Quote Intelligence summary for a claim.
 * Advisory only — does not modify any claim data.
 *
 * Sections:
 *   1. Risk classification badge + factors
 *   2. Part reconciliation (detected vs quoted, missing, extra)
 *   3. Historical cost deviation
 *   4. Country repair context
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, CheckCircle, Info, ShieldAlert, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Props {
  claimId: number;
  countryCode?: string;
}

// ─── Risk Badge ───────────────────────────────────────────────────────────────

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

// ─── Coverage Bar ─────────────────────────────────────────────────────────────

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

// ─── Deviation Indicator ──────────────────────────────────────────────────────

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

// ─── Confidence Badge ─────────────────────────────────────────────────────────

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

// ─── Main Component ───────────────────────────────────────────────────────────

export function RepairIntelligencePanel({ claimId, countryCode = "ZA" }: Props) {
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
            Repair Intelligence Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
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
            Repair Intelligence Summary
          </CardTitle>
          <CardDescription>
            {error?.message ?? "No intelligence data available for this claim."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { reconciliation, historicalDeviation, countryContext, riskLevel, riskFactors, detectedParts, quotedParts } = data;

  const formatCents = (cents: number | null) => {
    if (cents === null) return "—";
    return `R ${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4 text-primary" />
            Repair Intelligence Summary
          </CardTitle>
          <RiskBadge level={riskLevel} />
        </div>
        <CardDescription className="text-xs text-muted-foreground mt-1">
          Advisory only — does not affect the claim workflow
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Risk Factors */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Risk Factors
          </p>
          <ul className="space-y-1">
            {riskFactors.map((factor, i) => (
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

        {/* Part Reconciliation */}
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
                {reconciliation.missingParts.map((p) => (
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
                {reconciliation.extraParts.map((p) => (
                  <Badge key={p} variant="outline" className="text-xs border-amber-300 text-amber-700 dark:text-amber-300">
                    {p}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Historical Cost Deviation */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Historical Cost Comparison
            </p>
            <ConfidenceBadge level={historicalDeviation.confidence} />
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div className="text-muted-foreground">Historical median</div>
            <div className="font-medium">{formatCents(historicalDeviation.medianCost)}</div>
            <div className="text-muted-foreground">Historical average</div>
            <div className="font-medium">{formatCents(historicalDeviation.averageCost)}</div>
            <div className="text-muted-foreground">Sample size</div>
            <div className="font-medium">{historicalDeviation.sampleSize} claims</div>
            <div className="text-muted-foreground">Deviation</div>
            <div className="font-medium">
              <DeviationIndicator pct={historicalDeviation.deviationPct} />
            </div>
          </div>
        </div>

        {/* Country Context */}
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

        <p className="text-xs text-muted-foreground pt-1">
          Generated {new Date(data.generatedAt).toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}
