import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { formatCurrency, getCurrencySymbol } from "@/lib/currency";
import { BarChart3, TrendingUp, TrendingDown, Minus, AlertTriangle, History, Database } from "lucide-react";

interface HistoricalBenchmarkCardProps {
  vehicleMake: string;
  vehicleModel?: string;
  currentQuotedCost: number; // In cents
  currentFraudScore?: number; // 0-100
}

export function HistoricalBenchmarkCard({
  vehicleMake,
  vehicleModel,
  currentQuotedCost,
  currentFraudScore,
}: HistoricalBenchmarkCardProps) {
  const { data: benchmarks, isLoading } = trpc.aiAssessments.historicalBenchmarks.useQuery(
    { vehicleMake, vehicleModel },
    { enabled: !!vehicleMake }
  );

  if (isLoading) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <History className="h-4 w-4 text-emerald-600" />
            Historical Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-emerald-100 rounded w-3/4" />
            <div className="h-4 bg-emerald-100 rounded w-1/2" />
            <div className="h-4 bg-emerald-100 rounded w-2/3" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!benchmarks || benchmarks.claimCount === 0) {
    return (
      <Card className="border-gray-200 bg-gray-50/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Database className="h-4 w-4 text-gray-500" />
            Historical Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No historical data available for {vehicleMake} {vehicleModel || ""} yet.
            As more claims are processed, benchmarks will appear here automatically.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Calculate how current quote compares to historical average
  const avgQuote = benchmarks.avgQuoteCost;
  const avgFinal = benchmarks.avgFinalCost;
  const quoteVariance = avgQuote && currentQuotedCost
    ? ((currentQuotedCost - avgQuote) / avgQuote) * 100
    : null;
  const finalVariance = avgFinal && currentQuotedCost
    ? ((currentQuotedCost - avgFinal) / avgFinal) * 100
    : null;

  const getVarianceColor = (variance: number | null) => {
    if (variance === null) return "text-gray-500";
    if (Math.abs(variance) < 10) return "text-emerald-600";
    if (Math.abs(variance) < 25) return "text-amber-600";
    return "text-red-600";
  };

  const getVarianceBadge = (variance: number | null) => {
    if (variance === null) return null;
    if (Math.abs(variance) < 10) return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Within Range</Badge>;
    if (variance > 25) return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Above Average</Badge>;
    if (variance < -25) return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Below Average</Badge>;
    return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Moderate Variance</Badge>;
  };

  const VarianceIcon = ({ variance }: { variance: number | null }) => {
    if (variance === null) return <Minus className="h-4 w-4 text-gray-400" />;
    if (variance > 5) return <TrendingUp className="h-4 w-4 text-red-500" />;
    if (variance < -5) return <TrendingDown className="h-4 w-4 text-emerald-500" />;
    return <Minus className="h-4 w-4 text-emerald-500" />;
  };

  return (
    <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-white">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-emerald-600" />
            Historical Intelligence — {vehicleMake} {vehicleModel || ""}
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {benchmarks.claimCount} historical claim{benchmarks.claimCount !== 1 ? "s" : ""}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cost Comparison Grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Average Quote */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Avg. Historical Quote</p>
            <p className="text-lg font-semibold">
              {avgQuote ? formatCurrency(avgQuote) : "N/A"}
            </p>
            {quoteVariance !== null && (
              <div className="flex items-center gap-1">
                <VarianceIcon variance={quoteVariance} />
                <span className={`text-xs font-medium ${getVarianceColor(quoteVariance)}`}>
                  {quoteVariance > 0 ? "+" : ""}{quoteVariance.toFixed(1)}% vs current
                </span>
              </div>
            )}
          </div>

          {/* Average Final Approved */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Avg. Final Approved</p>
            <p className="text-lg font-semibold">
              {avgFinal ? formatCurrency(avgFinal) : "N/A"}
            </p>
            {finalVariance !== null && (
              <div className="flex items-center gap-1">
                <VarianceIcon variance={finalVariance} />
                <span className={`text-xs font-medium ${getVarianceColor(finalVariance)}`}>
                  {finalVariance > 0 ? "+" : ""}{finalVariance.toFixed(1)}% vs current
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Variance Badge */}
        <div className="flex items-center gap-2">
          {getVarianceBadge(quoteVariance)}
          {benchmarks.avgVariance !== null && (
            <span className="text-xs text-muted-foreground">
              Historical quote-to-final variance: {benchmarks.avgVariance > 0 ? "+" : ""}{benchmarks.avgVariance.toFixed(1)}%
            </span>
          )}
        </div>

        {/* Fraud Rate Warning */}
        {benchmarks.fraudRate !== null && benchmarks.fraudRate > 15 && (
          <div className="flex items-start gap-2 p-2 bg-amber-50 rounded-lg border border-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-amber-800">Elevated Fraud Rate for This Vehicle</p>
              <p className="text-xs text-amber-700">
                {benchmarks.fraudRate.toFixed(1)}% of historical claims for {vehicleMake} {vehicleModel || ""} were flagged as suspicious.
                Exercise additional scrutiny on this claim.
              </p>
            </div>
          </div>
        )}

        {/* Current Quote Context */}
        {currentQuotedCost > 0 && avgFinal && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-1">Current Quote Assessment</p>
            {currentQuotedCost > avgFinal * 1.3 ? (
              <p className="text-xs text-red-600 font-medium">
                Current quote ({formatCurrency(currentQuotedCost)}) is significantly higher than the historical average final approved cost. Consider negotiation or additional assessment.
              </p>
            ) : currentQuotedCost < avgFinal * 0.7 ? (
              <p className="text-xs text-blue-600 font-medium">
                Current quote ({formatCurrency(currentQuotedCost)}) is significantly lower than the historical average. Verify scope of work is complete.
              </p>
            ) : (
              <p className="text-xs text-emerald-600 font-medium">
                Current quote ({formatCurrency(currentQuotedCost)}) is within the expected range based on historical data for this vehicle type.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
