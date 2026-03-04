/**
 * QuoteOptimisationPanel
 *
 * Displays the AI cost optimisation summary on the insurer claim review page.
 * Shows:
 *   - Overall risk score + categorical badge
 *   - Per-quote cost deviation %
 *   - Flags (overpricing, parts inflation, labour inflation)
 *   - Recommended repairer
 *   - AI narrative summary
 *   - Insurer decision buttons (Accept Recommendation / Override)
 *
 * AI assists; insurer decides.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";

interface Props {
  claimId: number;
}

const RISK_COLORS: Record<string, string> = {
  low: "bg-green-100 text-green-800 border-green-300",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
  high: "bg-orange-100 text-orange-800 border-orange-300",
  critical: "bg-red-100 text-red-800 border-red-300",
};

const RISK_BORDER: Record<string, string> = {
  low: "border-green-200",
  medium: "border-yellow-200",
  high: "border-orange-300",
  critical: "border-red-400",
};

export function QuoteOptimisationPanel({ claimId }: Props) {
  const [showOverrideInput, setShowOverrideInput] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const utils = trpc.useUtils();

  const { data: result, isLoading, refetch } = trpc.quoteOptimisation.getResult.useQuery(
    { claimId },
    { enabled: !!claimId, refetchInterval: (query) => (!query.state.data || query.state.data.status === "processing" || query.state.data.status === "pending") ? 5000 : false }
  );

  const recordDecision = trpc.quoteOptimisation.recordDecision.useMutation({
    onSuccess: () => {
      toast.success("Decision recorded successfully.");
      utils.quoteOptimisation.getResult.invalidate({ claimId });
    },
    onError: (err) => toast.error(`Failed to record decision: ${err.message}`),
  });

  const retrigger = trpc.quoteOptimisation.retrigger.useMutation({
    onSuccess: () => {
      toast.success("AI optimisation re-triggered. Results will appear shortly.");
      utils.quoteOptimisation.getResult.invalidate({ claimId });
    },
    onError: (err) => toast.error(`Failed to re-trigger: ${err.message}`),
  });

  // Not yet triggered
  if (!isLoading && !result) {
    return (
      <Card className="mb-6 border-2 border-dashed border-muted-foreground/30">
        <CardContent className="py-8 text-center text-muted-foreground">
          <Brain className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">AI Cost Optimisation not yet triggered.</p>
          <p className="text-xs mt-1">It will run automatically once all 3 panel beater quotes are submitted.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 gap-2"
            onClick={() => retrigger.mutate({ claimId })}
            disabled={retrigger.isPending}
          >
            {retrigger.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Run Now
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Processing / pending
  if (isLoading || result?.status === "pending" || result?.status === "processing") {
    return (
      <Card className="mb-6 border-2 border-blue-200 bg-blue-50/30">
        <CardContent className="py-8 text-center">
          <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-blue-600" />
          <p className="text-sm font-medium text-blue-800">AI Cost Optimisation is running…</p>
          <p className="text-xs text-blue-600 mt-1">Comparing quotes against benchmarks. This takes 10–20 seconds.</p>
        </CardContent>
      </Card>
    );
  }

  // Failed
  if (result?.status === "failed") {
    return (
      <Card className="mb-6 border-2 border-red-200 bg-red-50/30">
        <CardContent className="py-6 text-center">
          <AlertTriangle className="h-7 w-7 mx-auto mb-2 text-red-500" />
          <p className="text-sm font-medium text-red-800">AI optimisation failed.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 gap-2"
            onClick={() => retrigger.mutate({ claimId })}
            disabled={retrigger.isPending}
          >
            {retrigger.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!result) return null;

  const riskScore = result.overallRiskScore ?? "medium";
  const riskNum = Number(result.riskScoreNumeric ?? 0);
  const quoteAnalysis: Array<{
    profileId: string;
    companyName: string;
    totalAmount: number;
    partsAmount: number;
    labourAmount: number;
    costDeviationPct: number;
    flags: string[];
  }> = Array.isArray(result.quoteAnalysis) ? (result.quoteAnalysis as typeof quoteAnalysis) : [];

  const alreadyDecided = result.insurerAcceptedRecommendation !== null && result.insurerAcceptedRecommendation !== undefined;

  return (
    <Card className={`mb-6 border-2 ${RISK_BORDER[riskScore] ?? "border-yellow-200"} bg-white`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-600" />
            <CardTitle className="text-base">AI Cost Optimisation</CardTitle>
            <Badge className={`text-xs border ${RISK_COLORS[riskScore]}`}>
              {riskScore.toUpperCase()} RISK — {riskNum.toFixed(0)}/100
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-xs text-muted-foreground"
            onClick={() => retrigger.mutate({ claimId })}
            disabled={retrigger.isPending}
          >
            {retrigger.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Re-run
          </Button>
        </div>
        <CardDescription className="text-xs mt-1">
          AI analysis compares 3 quotes against historical data, parts pricing benchmarks, and labour hour standards.
          <span className="font-semibold text-foreground"> AI assists — insurer decides.</span>
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Flags row */}
        <div className="flex flex-wrap gap-2">
          {result.overpricingDetected ? (
            <Badge variant="destructive" className="gap-1 text-xs">
              <AlertTriangle className="h-3 w-3" /> Overpricing Detected
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-xs text-green-700 border-green-300">
              <CheckCircle2 className="h-3 w-3" /> No Overpricing
            </Badge>
          )}
          {result.partsInflationDetected ? (
            <Badge variant="destructive" className="gap-1 text-xs">
              <AlertTriangle className="h-3 w-3" /> Parts Inflation
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-xs text-green-700 border-green-300">
              <CheckCircle2 className="h-3 w-3" /> Parts Within Benchmark
            </Badge>
          )}
          {result.labourInflationDetected ? (
            <Badge variant="destructive" className="gap-1 text-xs">
              <AlertTriangle className="h-3 w-3" /> Labour Inflation
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-xs text-green-700 border-green-300">
              <CheckCircle2 className="h-3 w-3" /> Labour Within Benchmark
            </Badge>
          )}
        </div>

        {/* Per-quote cost deviation table */}
        {quoteAnalysis.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Quote Breakdown</p>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Repairer</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Total</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">vs Median</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {quoteAnalysis.map((q, i) => {
                    const isRecommended = q.profileId === result.recommendedProfileId;
                    const dev = q.costDeviationPct;
                    return (
                      <tr key={q.profileId} className={`border-t ${isRecommended ? "bg-green-50" : ""}`}>
                        <td className="px-3 py-2 font-medium text-xs">
                          {q.companyName}
                          {isRecommended && (
                            <Badge className="ml-2 text-[10px] bg-green-600 text-white">Recommended</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-xs">
                          R{(q.totalAmount / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 text-right text-xs">
                          <span className={`flex items-center justify-end gap-1 font-semibold ${dev > 0 ? "text-red-600" : dev < 0 ? "text-green-600" : "text-muted-foreground"}`}>
                            {dev > 0 ? <TrendingUp className="h-3 w-3" /> : dev < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                            {dev > 0 ? "+" : ""}{dev.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {q.flags.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {q.flags.map((f) => (
                                <Badge key={f} variant="destructive" className="text-[10px] px-1 py-0">{f.replace(/_/g, " ")}</Badge>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* AI Narrative */}
        {result.optimisationSummary && (
          <div className="rounded-lg bg-muted/40 border p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">AI Analysis</p>
            <p className="text-sm leading-relaxed">{result.optimisationSummary}</p>
          </div>
        )}

        {/* Insurer Decision */}
        <div className="border-t pt-4">
          {alreadyDecided ? (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${result.insurerAcceptedRecommendation ? "bg-green-50 text-green-800 border border-green-200" : "bg-orange-50 text-orange-800 border border-orange-200"}`}>
              {result.insurerAcceptedRecommendation ? (
                <><ThumbsUp className="h-4 w-4" /> Insurer accepted AI recommendation</>
              ) : (
                <><ThumbsDown className="h-4 w-4" /> Insurer overrode AI recommendation{result.insurerOverrideReason ? ` — "${result.insurerOverrideReason}"` : ""}</>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground font-medium">Record your decision:</p>
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => recordDecision.mutate({ claimId, accepted: true })}
                  disabled={recordDecision.isPending}
                >
                  <ThumbsUp className="h-4 w-4" />
                  Accept Recommendation
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 border-orange-300 text-orange-700 hover:bg-orange-50"
                  onClick={() => setShowOverrideInput(!showOverrideInput)}
                >
                  <ThumbsDown className="h-4 w-4" />
                  Override
                </Button>
              </div>
              {showOverrideInput && (
                <div className="space-y-2">
                  <Textarea
                    placeholder="Reason for overriding AI recommendation (optional but recommended)…"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    className="text-sm min-h-[80px]"
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => recordDecision.mutate({ claimId, accepted: false, overrideReason: overrideReason || undefined })}
                    disabled={recordDecision.isPending}
                  >
                    {recordDecision.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    Confirm Override
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
