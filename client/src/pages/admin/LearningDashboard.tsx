/**
 * LearningDashboard.tsx — Phase 3 Learning & Calibration Admin Panel
 *
 * Surfaces:
 *  - Dataset health (total stored outcomes, quality tier breakdown)
 *  - Cost Pattern Analysis (top cost drivers, component weightings)
 *  - Fraud Pattern Analysis (emerging patterns, high-risk indicators, false positives)
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import KingaLogo from "@/components/KingaLogo";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  RefreshCw,
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  BarChart3,
  Database,
  Zap,
  Activity,
  Globe,
  MapPin,
  Search,
  AlertCircle,
} from "lucide-react";

// ─── Scenario options ──────────────────────────────────────────────────────────
const SCENARIOS = [
  { value: "all", label: "All Scenarios" },
  { value: "animal_strike", label: "Animal Strike" },
  { value: "vehicle_collision", label: "Vehicle Collision" },
  { value: "theft", label: "Theft" },
  { value: "fire", label: "Fire" },
  { value: "flood", label: "Flood" },
  { value: "vandalism", label: "Vandalism" },
  { value: "windscreen", label: "Windscreen" },
  { value: "cosmetic", label: "Cosmetic" },
  { value: "weather_event", label: "Weather Event" },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────
function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function TrendIcon({ trend }: { trend: "INCREASING" | "STABLE" | "DECREASING" }) {
  if (trend === "INCREASING") return <TrendingUp className="w-4 h-4 text-red-500" />;
  if (trend === "DECREASING") return <TrendingDown className="w-4 h-4 text-green-500" />;
  return <Minus className="w-4 h-4 text-yellow-500" />;
}

function HealthBadge({ health }: { health: string }) {
  if (health === "GOOD") return <Badge className="bg-green-600 text-white">GOOD</Badge>;
  if (health === "BUILDING") return <Badge className="bg-yellow-600 text-white">BUILDING</Badge>;
  return <Badge className="bg-red-600 text-white">INSUFFICIENT</Badge>;
}

// ─── Component ─────────────────────────────────────────────────────────────────
export default function LearningDashboard() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [scenarioFilter, setScenarioFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"overview" | "cost" | "fraud" | "calibration" | "jurisdiction" | "domain">("overview");
  const [jurisdictionInputs, setJurisdictionInputs] = useState({ country: "", region: "", claim_location: "" });

  const scenarioParam = scenarioFilter === "all" ? undefined : scenarioFilter;

  const { data: calibrationDrift, isLoading: calibrationLoading, refetch: refetchCalibration } =
    trpc.learning.getCalibrationDrift.useQuery(
      { scenario_filter: scenarioParam },
      { enabled: activeTab === "calibration" }
    );

  const { data: jurisdictionResult, isLoading: jurisdictionLoading, refetch: refetchJurisdiction } =
    trpc.learning.getJurisdictionCalibration.useQuery(
      {
        country: jurisdictionInputs.country || null,
        region: jurisdictionInputs.region || null,
        claim_location: jurisdictionInputs.claim_location || null,
      },
      { enabled: activeTab === "jurisdiction" }
    );

  const { data: jurisdictionSummary, isLoading: jurisdictionSummaryLoading } =
    trpc.learning.getJurisdictionSummary.useQuery(
      { limit: 1000 },
      { enabled: activeTab === "jurisdiction" }
    );

  const [domainSignature, setDomainSignature] = useState("");
  const [domainCheckSig, setDomainCheckSig] = useState<string | null>(null);

  const { data: domainCheck, isLoading: domainCheckLoading, refetch: refetchDomainCheck } =
    trpc.learning.checkOutOfDomain.useQuery(
      { case_signature: domainCheckSig },
      { enabled: activeTab === "domain" && domainCheckSig !== null }
    );

  const { data: domainSummary, isLoading: domainSummaryLoading } =
    trpc.learning.getOutOfDomainSummary.useQuery(
      { limit: 500 },
      { enabled: activeTab === "domain" }
    );

  // ── Queries ──────────────────────────────────────────────────────────────────
  const statsQuery = trpc.learning.getLearningStats.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const costQuery = trpc.learning.getCostPatternAnalysis.useQuery(
    { scenario_filter: scenarioParam, top_n: 8 },
    { refetchOnWindowFocus: false }
  );

  const fraudQuery = trpc.learning.getFraudPatternAnalysis.useQuery(
    { scenario_filter: scenarioParam },
    { refetchOnWindowFocus: false }
  );

  // ── Calibration Feedback state ──────────────────────────────────────────────
  const [calibFeedbackJurisdiction, setCalibFeedbackJurisdiction] = useState("global");
  const [calibFeedbackResult, setCalibFeedbackResult] = useState<{
    apply_update: boolean;
    risk_level: "LOW" | "MEDIUM" | "HIGH";
    reasoning: string;
    blocked_reason?: string;
    updates: { cost_multiplier: number; fraud_adjustments: Record<string, number>; notes: string };
    proposed_changes_count: number;
    sample_size: number;
    confidence: number;
    jurisdiction: string;
  } | null>(null);

  const evaluateCalibration = trpc.learning.evaluateCalibrationFeedback.useQuery(
    { jurisdiction: calibFeedbackJurisdiction },
    { enabled: false }
  );
  const triggerEvaluation = () => {
    evaluateCalibration.refetch().then((result) => {
      if (result.data) setCalibFeedbackResult(result.data as typeof calibFeedbackResult);
    }).catch((err: any) => alert(`Evaluation failed: ${err.message}`));
  };

  const applyCalibration = trpc.learning.applyCalibrationUpdate.useMutation({
    onSuccess: () => {
      alert("Calibration update applied successfully!");
      setCalibFeedbackResult(null);
    },
    onError: (err) => alert(`Apply failed: ${err.message}`),
  });

  const { data: calibrationHistory } = trpc.learning.getCalibrationHistory.useQuery(
    { jurisdiction: undefined },
    { enabled: activeTab === "calibration" }
  );

  const utils = trpc.useUtils();
  const handleRefresh = () => {
    utils.learning.getLearningStats.invalidate();
    utils.learning.getCostPatternAnalysis.invalidate();
    utils.learning.getFraudPatternAnalysis.invalidate();
  };

  const stats = statsQuery.data;
  const cost = costQuery.data;
  const fraud = fraudQuery.data;
  const isLoading = statsQuery.isLoading || costQuery.isLoading || fraudQuery.isLoading;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Admin
          </Button>
          <KingaLogo size="sm" />
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-500" />
              Learning & Calibration Dashboard
            </h1>
            <p className="text-xs text-muted-foreground">
              Phase 3 — AI self-improvement via validated outcomes
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Select value={scenarioFilter} onValueChange={setScenarioFilter}>
            <SelectTrigger className="w-48 h-8 text-sm">
              <SelectValue placeholder="All Scenarios" />
            </SelectTrigger>
            <SelectContent>
              {SCENARIOS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <ThemeToggle />
        </div>
      </div>

      {/* Tab Bar */}
      <div className="border-b border-border px-6 flex gap-1 pt-2">
       {(["overview", "cost", "fraud", "calibration", "jurisdiction", "domain"] as const).map((tab) => (          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
              activeTab === tab
                ? "bg-background border border-b-background border-border text-foreground -mb-px"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "overview" && <Database className="w-4 h-4 inline mr-1" />}
            {tab === "cost" && <BarChart3 className="w-4 h-4 inline mr-1" />}
            {tab === "fraud" && <ShieldAlert className="w-4 h-4 inline mr-1" />}
            {tab === "calibration" && <Activity className="w-4 h-4 inline mr-1" />}
            {tab === "jurisdiction" && <Globe className="w-4 h-4 inline mr-1" />}
            {tab === "domain" && <Search className="w-4 h-4 inline mr-1" />}
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="p-6 space-y-6">
        {/* ── OVERVIEW TAB ─────────────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Stored</p>
                  <p className="text-3xl font-bold mt-1">{stats?.total_stored ?? "—"}</p>
                  <p className="text-xs text-muted-foreground mt-1">validated outcomes</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">HIGH Quality</p>
                  <p className="text-3xl font-bold mt-1 text-green-500">{stats?.by_quality_tier.HIGH ?? "—"}</p>
                  <p className="text-xs text-muted-foreground mt-1">assessor-validated</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">MEDIUM Quality</p>
                  <p className="text-3xl font-bold mt-1 text-yellow-500">{stats?.by_quality_tier.MEDIUM ?? "—"}</p>
                  <p className="text-xs text-muted-foreground mt-1">system-optimised</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Dataset Health</p>
                  <div className="mt-2">
                    {stats ? <HealthBadge health={stats.dataset_health} /> : "—"}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stats?.total_stored ?? 0} / 100 target
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Recommendation */}
            {stats?.recommendation && (
              <Card className="border-blue-500/30 bg-blue-500/5">
                <CardContent className="pt-4 flex items-start gap-3">
                  <Zap className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-muted-foreground">{stats.recommendation}</p>
                </CardContent>
              </Card>
            )}

            {/* By Scenario */}
            {stats && Object.keys(stats.by_scenario).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Stored Outcomes by Scenario</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.entries(stats.by_scenario)
                      .sort(([, a], [, b]) => b - a)
                      .map(([scenario, count]) => (
                        <div key={scenario} className="flex items-center justify-between p-2 rounded bg-muted/40">
                          <span className="text-sm capitalize">{scenario.replace(/_/g, " ")}</span>
                          <Badge variant="secondary">{count}</Badge>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {stats?.total_stored === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Database className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No validated outcomes stored yet.</p>
                <p className="text-xs mt-1">Process claims through the AI pipeline and have assessors review them to build the learning dataset.</p>
              </div>
            )}
          </>
        )}

        {/* ── COST PATTERNS TAB ────────────────────────────────────────────────── */}
        {activeTab === "cost" && (
          <>
            {costQuery.isLoading && (
              <div className="text-center py-12 text-muted-foreground">
                <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin opacity-50" />
                <p className="text-sm">Analysing cost patterns…</p>
              </div>
            )}

            {!costQuery.isLoading && cost && (
              <>
                {/* Summary */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Records Analysed</p>
                      <p className="text-3xl font-bold mt-1">{cost.metadata?.claims_analysed ?? cost.total_stored_records ?? 0}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Top Cost Drivers</p>
                      <p className="text-3xl font-bold mt-1">{cost.high_cost_drivers?.length ?? 0}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Avg Claim Value</p>
                      <p className="text-3xl font-bold mt-1">
                        {cost.metadata?.total_cost_analysed_usd != null && cost.metadata?.claims_analysed > 0
                          ? `$${Math.round(cost.metadata.total_cost_analysed_usd / cost.metadata.claims_analysed).toLocaleString()}`
                          : "—"}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Top Cost Drivers */}
                {cost.high_cost_drivers && cost.high_cost_drivers.length > 0 ? (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <BarChart3 className="w-4 h-4" />
                        Top Cost Drivers
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                        (cost.high_cost_drivers as any[]).map((driver, i: number) => (
                          <div key={driver.component} className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                            <div className="flex-1">
                              <div className="flex justify-between text-sm mb-1">
                                <span className="capitalize">{driver.component.replace(/_/g, " ")}</span>
                                <span className="text-muted-foreground">
                                  ${Math.round(driver.avg_cost).toLocaleString()} avg · {driver.frequency} claims
                                </span>
                              </div>
                              <div className="h-2 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full bg-blue-500 rounded-full"
                                  style={{ width: `${Math.min(driver.cost_share * 100, 100)}%` }}
                                />
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {pct(driver.cost_share)} of total cost
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No cost pattern data available yet.</p>
                    <p className="text-xs mt-1">Store more validated outcomes to enable cost pattern analysis.</p>
                  </div>
                )}

                {/* Insights */}
                {cost.insights && cost.insights.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Cost Insights</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {cost.insights.map((insight: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                            {insight}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </>
        )}

        {/* ── FRAUD PATTERNS TAB ───────────────────────────────────────────────── */}
        {activeTab === "fraud" && (
          <>
            {fraudQuery.isLoading && (
              <div className="text-center py-12 text-muted-foreground">
                <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin opacity-50" />
                <p className="text-sm">Analysing fraud patterns…</p>
              </div>
            )}

            {!fraudQuery.isLoading && fraud && (
              <>
                {/* Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Records Analysed</p>
                      <p className="text-3xl font-bold mt-1">{fraud.metadata?.total_records_analysed ?? 0}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Confirmed Fraud</p>
                      <p className="text-3xl font-bold mt-1 text-red-500">{fraud.metadata?.confirmed_fraud_count ?? 0}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Cleared Claims</p>
                      <p className="text-3xl font-bold mt-1 text-green-500">{fraud.metadata?.cleared_count ?? 0}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Emerging Patterns</p>
                      <p className="text-3xl font-bold mt-1 text-orange-500">{fraud.emerging_patterns?.length ?? 0}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Emerging Patterns */}
                {fraud.emerging_patterns && fraud.emerging_patterns.length > 0 ? (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-orange-500" />
                        Emerging Fraud Patterns
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {fraud.emerging_patterns.map((p: {
                          pattern_id: string;
                          is_new: boolean;
                          trend: "INCREASING" | "STABLE" | "DECREASING";
                          description: string;
                          flag_codes: string[];
                          scenario_types: string[];
                          frequency: number;
                          fraud_confirmation_rate: number;
                        }) => (
                          <div key={p.pattern_id} className="p-3 rounded border border-border bg-muted/20">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  {p.is_new && (
                                    <Badge className="bg-orange-500 text-white text-xs">NEW</Badge>
                                  )}
                                  <TrendIcon trend={p.trend} />
                                  <span className="text-xs text-muted-foreground">{p.trend}</span>
                                </div>
                                <p className="text-sm">{p.description}</p>
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {p.flag_codes.map((code: string) => (
                                    <Badge key={code} variant="outline" className="text-xs">
                                      {code.replace(/_/g, " ")}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-lg font-bold text-red-500">{pct(p.fraud_confirmation_rate)}</p>
                                <p className="text-xs text-muted-foreground">fraud rate</p>
                                <p className="text-xs text-muted-foreground">{p.frequency} claims</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-dashed">
                    <CardContent className="pt-6 text-center text-muted-foreground">
                      <ShieldAlert className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No emerging patterns detected yet.</p>
                    </CardContent>
                  </Card>
                )}

                {/* High-Risk Indicators */}
                {fraud.high_risk_indicators && fraud.high_risk_indicators.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                        High-Precision Fraud Indicators
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-xs text-muted-foreground">
                              <th className="text-left py-2 pr-4">Flag</th>
                              <th className="text-right py-2 px-2">Precision</th>
                              <th className="text-right py-2 px-2">Recall</th>
                              <th className="text-right py-2 px-2">F1</th>
                              <th className="text-right py-2 px-2">TP</th>
                              <th className="text-right py-2 px-2">FP</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fraud.high_risk_indicators.map((ind: {
                              flag_code: string;
                              label: string;
                              precision: number;
                              recall: number;
                              f1_score: number;
                              true_positives: number;
                              false_positives: number;
                            }) => (
                              <tr key={ind.flag_code} className="border-b border-border/50 hover:bg-muted/20">
                                <td className="py-2 pr-4">
                                  <span className="font-medium">{ind.label}</span>
                                  <span className="text-xs text-muted-foreground ml-2">{ind.flag_code}</span>
                                </td>
                                <td className="text-right py-2 px-2 text-green-500 font-mono">{pct(ind.precision)}</td>
                                <td className="text-right py-2 px-2 font-mono">{pct(ind.recall)}</td>
                                <td className="text-right py-2 px-2 font-mono font-bold">{ind.f1_score.toFixed(2)}</td>
                                <td className="text-right py-2 px-2 text-green-500">{ind.true_positives}</td>
                                <td className="text-right py-2 px-2 text-red-500">{ind.false_positives}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* False Positive Patterns */}
                {fraud.false_positive_patterns && fraud.false_positive_patterns.length > 0 && (
                  <Card className="border-yellow-500/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-yellow-500" />
                        False Positive Patterns — Flags to Recalibrate
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {fraud.false_positive_patterns.map((fp: {
                          flag_code: string;
                          label: string;
                          false_positive_rate: number;
                          false_positive_count: number;
                          true_positive_count: number;
                          recommendation: string;
                          suggested_score_reduction: number;
                        }) => (
                          <div key={fp.flag_code} className="p-3 rounded border border-yellow-500/20 bg-yellow-500/5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className="text-sm font-medium">{fp.label}</p>
                                <p className="text-xs text-muted-foreground mt-1">{fp.recommendation}</p>
                                {fp.suggested_score_reduction > 0 && (
                                  <Badge variant="outline" className="mt-2 text-xs border-yellow-500/50 text-yellow-600">
                                    Suggested reduction: −{fp.suggested_score_reduction} pts
                                  </Badge>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-lg font-bold text-yellow-500">{pct(fp.false_positive_rate)}</p>
                                <p className="text-xs text-muted-foreground">FP rate</p>
                                <p className="text-xs text-muted-foreground">{fp.false_positive_count} FP / {fp.true_positive_count} TP</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {fraud.metadata?.total_records_analysed === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <ShieldAlert className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No fraud pattern data available yet.</p>
                    <p className="text-xs mt-1">Process more claims with fraud assessments to enable pattern analysis.</p>
                  </div>
                )}
              </>
            )}
          </>
        )}
        {/* ── Calibration Drift Tab ─────────────────────────────────────────── */}
          {activeTab === "calibration" && (
            <>
              {calibrationLoading ? (
                <div className="text-center py-12 text-muted-foreground">
                  <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin opacity-50" />
                  <p className="text-sm">Analysing calibration drift…</p>
                </div>
              ) : calibrationDrift ? (
                <>
                  {/* Status Banner */}
                  <Card className={calibrationDrift.drift_detected
                    ? calibrationDrift.severity === "HIGH"
                      ? "border-red-500/50 bg-red-500/5"
                      : "border-yellow-500/50 bg-yellow-500/5"
                    : "border-green-500/50 bg-green-500/5"
                  }>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          {calibrationDrift.drift_detected ? (
                            <AlertTriangle className={`w-8 h-8 ${calibrationDrift.severity === "HIGH" ? "text-red-500" : "text-yellow-500"}`} />
                          ) : (
                            <CheckCircle2 className="w-8 h-8 text-green-500" />
                          )}
                          <div>
                            <p className="font-semibold text-sm">
                              {calibrationDrift.drift_detected ? `Calibration Drift Detected — ${calibrationDrift.severity} Severity` : "No Calibration Drift Detected"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">{calibrationDrift.recommendation}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <Badge variant="outline" className={`text-xs ${
                            calibrationDrift.severity === "HIGH" ? "border-red-500/50 text-red-500" :
                            calibrationDrift.severity === "MEDIUM" ? "border-yellow-500/50 text-yellow-500" :
                            "border-green-500/50 text-green-500"
                          }`}>{calibrationDrift.severity}</Badge>
                          <p className="text-xs text-muted-foreground mt-1">{calibrationDrift.metadata.records_analysed} records</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Statistics Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {([
                      { label: "Mean Cost Error", value: `${calibrationDrift.statistics.mean_cost_error_pct.toFixed(1)}%`, sub: "absolute" },
                      { label: "Median Cost Error", value: `${calibrationDrift.statistics.median_cost_error_pct.toFixed(1)}%`, sub: "absolute" },
                      { label: "Severity Mismatch", value: `${Math.round(calibrationDrift.statistics.severity_mismatch_rate * 100)}%`, sub: "of records" },
                      { label: "MAE (USD)", value: `$${calibrationDrift.statistics.mean_absolute_error_usd.toLocaleString()}`, sub: "mean abs error" },
                    ] as const).map(({ label, value, sub }) => (
                      <Card key={label}>
                        <CardContent className="pt-4 pb-4">
                          <p className="text-xs text-muted-foreground">{label}</p>
                          <p className="text-2xl font-bold mt-1">{value}</p>
                          <p className="text-xs text-muted-foreground">{sub}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Over/Under Estimate Breakdown */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Activity className="w-4 h-4" />
                        Prediction Direction Breakdown
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-6">
                        <div>
                          <p className="text-xs text-muted-foreground">Over-estimates</p>
                          <p className="text-xl font-bold text-red-500">{calibrationDrift.statistics.over_estimate_count}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Under-estimates</p>
                          <p className="text-xl font-bold text-blue-500">{calibrationDrift.statistics.under_estimate_count}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Windows Analysed</p>
                          <p className="text-xl font-bold">{calibrationDrift.statistics.windows_analysed}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Continuous Drift</p>
                          <p className="text-xl font-bold">{calibrationDrift.statistics.continuous_drift_detected ? <span className="text-red-500">YES</span> : <span className="text-green-500">NO</span>}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Drift Areas */}
                  {calibrationDrift.drift_areas.length > 0 && (
                    <Card className="border-red-500/30">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-500" />
                          Drift Areas Detected
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {calibrationDrift.drift_areas.map((area: {
                            dimension: string;
                            description: string;
                            measured_value: number;
                            threshold: number;
                            direction: string | null;
                            affected_scenarios: string[];
                            affected_record_count: number;
                            is_continuous: boolean;
                            consecutive_window_count: number;
                          }, idx: number) => (
                            <div key={idx} className="p-3 rounded border border-red-500/20 bg-red-500/5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs border-red-500/50 text-red-500 uppercase">{area.dimension}</Badge>
                                    {area.is_continuous && <Badge className="text-xs bg-red-600 text-white">CONTINUOUS</Badge>}
                                    {area.direction && <Badge variant="outline" className="text-xs">{area.direction.replace("_", " ")}</Badge>}
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1.5">{area.description}</p>
                                  {area.affected_scenarios.length > 0 && (
                                    <p className="text-xs text-muted-foreground mt-1">Scenarios: {area.affected_scenarios.join(", ")}</p>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-lg font-bold text-red-500">{area.dimension === "cost" || area.dimension === "cost_direction" ? `${Math.round(area.measured_value * 100)}%` : area.measured_value}</p>
                                  <p className="text-xs text-muted-foreground">{area.affected_record_count} records</p>
                                  {area.consecutive_window_count > 1 && <p className="text-xs text-muted-foreground">{area.consecutive_window_count} windows</p>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Severity Confusion Matrix */}
                  {calibrationDrift.statistics.total_records > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Severity Confusion Matrix</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-border">
                                <th className="text-left py-1.5 pr-4 text-muted-foreground">AI Predicted</th>
                                <th className="text-center py-1.5 px-2">Actual: Minor</th>
                                <th className="text-center py-1.5 px-2">Actual: Moderate</th>
                                <th className="text-center py-1.5 px-2">Actual: Severe</th>
                              </tr>
                            </thead>
                            <tbody>
                              {([
                                { label: "Minor", moderate: calibrationDrift.statistics.severity_confusion.minor_predicted_as_moderate, severe: calibrationDrift.statistics.severity_confusion.minor_predicted_as_severe, minor: calibrationDrift.statistics.severity_confusion.correct },
                                { label: "Moderate", moderate: calibrationDrift.statistics.severity_confusion.correct, severe: calibrationDrift.statistics.severity_confusion.moderate_predicted_as_severe, minor: calibrationDrift.statistics.severity_confusion.moderate_predicted_as_minor },
                                { label: "Severe", moderate: calibrationDrift.statistics.severity_confusion.severe_predicted_as_moderate, severe: calibrationDrift.statistics.severity_confusion.correct, minor: calibrationDrift.statistics.severity_confusion.severe_predicted_as_minor },
                              ] as const).map(({ label, minor, moderate, severe }) => (
                                <tr key={label} className="border-b border-border/50">
                                  <td className="py-1.5 pr-4 font-medium">{label}</td>
                                  <td className="text-center py-1.5 px-2">{minor}</td>
                                  <td className="text-center py-1.5 px-2">{moderate}</td>
                                  <td className="text-center py-1.5 px-2">{severe}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {calibrationDrift.metadata.records_analysed === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">No validated outcomes with cost data available yet.</p>
                      <p className="text-xs mt-1">Calibration drift analysis requires claims with both AI cost estimates and assessor-approved final amounts.</p>
                    </div>
                  )}
                </>
              ) : null}
            </>
          )}
         {/* ── Calibration Feedback Panel (inside calibration tab) ──────────────────── */}
        {activeTab === "calibration" && calibrationDrift && (
          <div className="space-y-4 mt-4">
            {/* Apply Recommendations Section */}
            <Card className="border-purple-200 bg-purple-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Brain className="w-4 h-4 text-purple-600" />
                  Apply Calibration Recommendations
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Run the Calibration Feedback Controller to evaluate whether the detected drift
                  justifies a safe, gradual correction. Requires <strong>claims_manager</strong> approval before writing.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-medium">Jurisdiction scope</label>
                    <input
                      type="text"
                      value={calibFeedbackJurisdiction}
                      onChange={(e) => setCalibFeedbackJurisdiction(e.target.value)}
                      placeholder="e.g. ZW, global, Southern Africa"
                      className="mt-1 w-full text-sm border rounded px-2 py-1 bg-background"
                    />
                  </div>
                  <Button
                    size="sm"
                    className="mt-5"
                    onClick={() => triggerEvaluation()}
                    disabled={evaluateCalibration.isFetching}
                  >
                    {evaluateCalibration.isFetching ? (
                      <><Activity className="w-3 h-3 mr-1 animate-spin" /> Evaluating…</>
                    ) : (
                      <><Zap className="w-3 h-3 mr-1" /> Evaluate Recommendations</>
                    )}
                  </Button>
                </div>

                {/* Evaluation result */}
                {calibFeedbackResult && (
                  <div className={`rounded-lg border p-3 space-y-2 ${
                    !calibFeedbackResult.apply_update
                      ? "bg-gray-50 border-gray-200"
                      : calibFeedbackResult.risk_level === "HIGH"
                      ? "bg-red-50 border-red-200"
                      : calibFeedbackResult.risk_level === "MEDIUM"
                      ? "bg-yellow-50 border-yellow-200"
                      : "bg-green-50 border-green-200"
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {calibFeedbackResult.apply_update ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-gray-500" />
                        )}
                        <span className="text-sm font-medium">
                          {calibFeedbackResult.apply_update
                            ? `${calibFeedbackResult.proposed_changes_count} update(s) proposed`
                            : "No update recommended"}
                        </span>
                      </div>
                      <Badge className={`text-xs ${
                        calibFeedbackResult.risk_level === "HIGH" ? "bg-red-100 text-red-700" :
                        calibFeedbackResult.risk_level === "MEDIUM" ? "bg-yellow-100 text-yellow-700" :
                        "bg-green-100 text-green-700"
                      }`}>
                        {calibFeedbackResult.risk_level} RISK
                      </Badge>
                    </div>

                    <p className="text-xs text-muted-foreground">{calibFeedbackResult.reasoning}</p>

                    {calibFeedbackResult.blocked_reason && (
                      <p className="text-xs text-red-600 font-medium">⚠️ {calibFeedbackResult.blocked_reason}</p>
                    )}

                    {calibFeedbackResult.apply_update && (
                      <div className="space-y-1 text-xs">
                        <p><strong>Cost multiplier:</strong> {calibFeedbackResult.updates.cost_multiplier.toFixed(3)}</p>
                        {Object.keys(calibFeedbackResult.updates.fraud_adjustments).length > 0 && (
                          <p><strong>Fraud adjustments:</strong> {Object.keys(calibFeedbackResult.updates.fraud_adjustments).length} flag(s)</p>
                        )}
                        <p className="text-muted-foreground">{calibFeedbackResult.updates.notes}</p>
                      </div>
                    )}

                    {calibFeedbackResult.apply_update && (
                      <div className="pt-1">
                        <p className="text-xs text-muted-foreground mb-2">
                          Requires <strong>claims_manager</strong> or <strong>admin</strong> role to apply.
                        </p>
                        <Button
                          size="sm"
                          className="bg-purple-600 hover:bg-purple-700 text-white"
                          onClick={() => {
                            applyCalibration.mutate({
                              jurisdiction: calibFeedbackResult.jurisdiction,
                              cost_multiplier: calibFeedbackResult.updates.cost_multiplier,
                              fraud_adjustments: calibFeedbackResult.updates.fraud_adjustments,
                              notes: calibFeedbackResult.updates.notes,
                              risk_level: calibFeedbackResult.risk_level,
                            });
                          }}
                          disabled={applyCalibration.isPending}
                        >
                          {applyCalibration.isPending ? (
                            <><Activity className="w-3 h-3 mr-1 animate-spin" /> Applying…</>
                          ) : (
                            <><CheckCircle2 className="w-3 h-3 mr-1" /> Apply Update
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Calibration Override History */}
            {calibrationHistory && calibrationHistory.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    Applied Calibration Overrides
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {calibrationHistory.slice(0, 10).map((override) => (
                      <div key={override.id} className="flex items-center justify-between text-xs border rounded px-3 py-2">
                        <div>
                          <span className="font-medium">{override.jurisdiction}</span>
                          <span className="text-muted-foreground ml-2">
                            ×{((override.costMultiplier ?? 1000) / 1000).toFixed(3)} cost
                          </span>
                          {override.reasoning && (
                            <p className="text-muted-foreground mt-0.5 truncate max-w-xs">{override.reasoning}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={`text-xs ${
                            override.riskLevel === "HIGH" ? "bg-red-100 text-red-700" :
                            override.riskLevel === "MEDIUM" ? "bg-yellow-100 text-yellow-700" :
                            "bg-green-100 text-green-700"
                          }`}>{override.riskLevel}</Badge>
                          <span className="text-muted-foreground">{override.createdAt?.slice(0, 10)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ── Jurisdiction Calibration Tab ────────────────────────────────── */}
        {activeTab === "jurisdiction" && (
          <>
            {/* Input Panel */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Jurisdiction Lookup
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Country (name or ISO code)</label>
                    <input
                      type="text"
                      value={jurisdictionInputs.country}
                      onChange={(e) => setJurisdictionInputs((p) => ({ ...p, country: e.target.value }))}
                      placeholder="e.g. ZW, Zimbabwe, ZWE"
                      className="w-full text-sm border border-border rounded px-3 py-1.5 bg-background text-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Region / Province</label>
                    <input
                      type="text"
                      value={jurisdictionInputs.region}
                      onChange={(e) => setJurisdictionInputs((p) => ({ ...p, region: e.target.value }))}
                      placeholder="e.g. Harare, Gauteng"
                      className="w-full text-sm border border-border rounded px-3 py-1.5 bg-background text-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Claim Location (free text)</label>
                    <input
                      type="text"
                      value={jurisdictionInputs.claim_location}
                      onChange={(e) => setJurisdictionInputs((p) => ({ ...p, claim_location: e.target.value }))}
                      placeholder="e.g. Harare CBD, Bulawayo Road"
                      className="w-full text-sm border border-border rounded px-3 py-1.5 bg-background text-foreground"
                    />
                  </div>
                </div>
                <button
                  onClick={() => refetchJurisdiction()}
                  className="mt-3 px-4 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <RefreshCw className="w-3 h-3 inline mr-1" />
                  Resolve Jurisdiction
                </button>
              </CardContent>
            </Card>

            {/* Result */}
            {jurisdictionLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin opacity-50" />
                <p className="text-sm">Resolving jurisdiction…</p>
              </div>
            ) : jurisdictionResult ? (
              <Card className={jurisdictionResult.jurisdiction === "GLOBAL"
                ? "border-yellow-500/40 bg-yellow-500/5"
                : "border-green-500/40 bg-green-500/5"
              }>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Globe className={`w-6 h-6 ${jurisdictionResult.jurisdiction === "GLOBAL" ? "text-yellow-500" : "text-green-500"}`} />
                        <p className="text-xl font-bold">{jurisdictionResult.jurisdiction}</p>
                        <Badge variant="outline" className="text-xs">{jurisdictionResult.resolution_method.replace(/_/g, " ")}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{jurisdictionResult.notes}</p>
                      {jurisdictionResult.warnings.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {jurisdictionResult.warnings.map((w, i) => (
                            <p key={i} className="text-xs text-yellow-600 flex items-start gap-1">
                              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                              {w}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-3xl font-bold">{jurisdictionResult.confidence}</p>
                      <p className="text-xs text-muted-foreground">confidence</p>
                      <Badge variant="outline" className="mt-1 text-xs">{jurisdictionResult.recommended_profile}</Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <div className="p-2 rounded border border-border/50">
                      <p className="text-xs text-muted-foreground">Country Profile</p>
                      <p className="text-sm font-medium">{jurisdictionResult.has_country_profile ? "✓ Available" : "✗ Not found"}</p>
                    </div>
                    <div className="p-2 rounded border border-border/50">
                      <p className="text-xs text-muted-foreground">Region Profile</p>
                      <p className="text-sm font-medium">{jurisdictionResult.has_region_profile ? "✓ Available" : "—"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {/* Fleet Summary */}
            {jurisdictionSummaryLoading ? (
              <div className="text-center py-6 text-muted-foreground">
                <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin opacity-40" />
                <p className="text-xs">Loading fleet jurisdiction summary…</p>
              </div>
            ) : jurisdictionSummary ? (
              <>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      Fleet Jurisdiction Summary — {jurisdictionSummary.summary.total} claims
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Avg Confidence</p>
                        <p className="text-2xl font-bold">{jurisdictionSummary.summary.average_confidence}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Global Fallback</p>
                        <p className="text-2xl font-bold text-yellow-500">{jurisdictionSummary.summary.global_fallback_count}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">With Warnings</p>
                        <p className="text-2xl font-bold text-orange-500">{jurisdictionSummary.summary.claims_with_warnings}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Unique Jurisdictions</p>
                        <p className="text-2xl font-bold">{Object.keys(jurisdictionSummary.summary.by_jurisdiction).length}</p>
                      </div>
                    </div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Resolution Methods</p>
                    <div className="space-y-1.5">
                      {Object.entries(jurisdictionSummary.summary.by_method)
                        .filter(([, count]) => count > 0)
                        .sort(([, a], [, b]) => b - a)
                        .map(([method, count]) => (
                          <div key={method} className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-36 shrink-0">{method.replace(/_/g, " ")}</span>
                            <div className="flex-1 bg-muted rounded-full h-1.5">
                              <div
                                className="bg-primary rounded-full h-1.5"
                                style={{ width: `${jurisdictionSummary.summary.total > 0 ? Math.round((count / jurisdictionSummary.summary.total) * 100) : 0}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium w-8 text-right">{count}</span>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>

                {jurisdictionSummary.sample_results.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Sample Claim Jurisdictions (first 20)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-1.5 pr-3">Claim ID</th>
                              <th className="text-left py-1.5 pr-3">Jurisdiction</th>
                              <th className="text-left py-1.5 pr-3">Method</th>
                              <th className="text-center py-1.5 pr-3">Confidence</th>
                              <th className="text-center py-1.5">Profile</th>
                            </tr>
                          </thead>
                          <tbody>
                            {jurisdictionSummary.sample_results.map((r) => (
                              <tr key={r.claim_id} className="border-b border-border/40">
                                <td className="py-1.5 pr-3 font-mono">{r.claim_id}</td>
                                <td className="py-1.5 pr-3 font-medium">{r.jurisdiction}</td>
                                <td className="py-1.5 pr-3 text-muted-foreground">{r.resolution_method.replace(/_/g, " ")}</td>
                                <td className="py-1.5 pr-3 text-center">{r.confidence}</td>
                                <td className="py-1.5 text-center">{r.has_country_profile ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 inline" /> : <span className="text-muted-foreground">—</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : null}
          </>
        )}
        {/* ── Out-of-Domain Tab ─────────────────────────────────────────────── */}
        {activeTab === "domain" && (
          <>
            {/* Summary KPI cards */}
            {domainSummaryLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Loading domain coverage summary…</span>
              </div>
            ) : domainSummary ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-xs text-muted-foreground mb-1">Total Analysed</div>
                      <div className="text-2xl font-bold">{domainSummary.summary.total.toLocaleString()}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-xs text-muted-foreground mb-1">In-Domain Rate</div>
                      <div className="text-2xl font-bold text-green-600">{pct(domainSummary.summary.in_domain_rate)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-xs text-muted-foreground mb-1">Out-of-Domain</div>
                      <div className="text-2xl font-bold text-red-500">{domainSummary.summary.out_of_domain_count.toLocaleString()}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-xs text-muted-foreground mb-1">Known Signatures</div>
                      <div className="text-2xl font-bold">{domainSummary.known_signatures_count.toLocaleString()}</div>
                    </CardContent>
                  </Card>
                </div>

                {/* Match tier breakdown */}
                <Card className="mb-6">
                  <CardHeader><CardTitle className="text-sm">Match Tier Breakdown</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-4 gap-4 text-center">
                      {(["exact", "grouping", "partial", "none"] as const).map((tier) => (
                        <div key={tier}>
                          <div className="text-lg font-bold">{domainSummary.summary.by_match_tier[tier]}</div>
                          <div className="text-xs text-muted-foreground capitalize">{tier}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Sample results table */}
                {domainSummary.sample_results.length > 0 && (
                  <Card className="mb-6">
                    <CardHeader><CardTitle className="text-sm">Recent Claims Sample (first 20)</CardTitle></CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border bg-muted/30">
                              <th className="text-left py-2 px-3">Claim ID</th>
                              <th className="text-left py-2 px-3">Signature</th>
                              <th className="text-center py-2 px-3">In-Domain</th>
                              <th className="text-center py-2 px-3">Match Tier</th>
                              <th className="text-center py-2 px-3">Similarity</th>
                              <th className="text-center py-2 px-3">Confidence Cap</th>
                            </tr>
                          </thead>
                          <tbody>
                            {domainSummary.sample_results.map((r, i) => (
                              <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                                <td className="py-1.5 px-3">{r.claim_id}</td>
                                <td className="py-1.5 px-3 font-mono text-xs">{r.case_signature}</td>
                                <td className="py-1.5 px-3 text-center">
                                  {r.in_domain
                                    ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 inline" />
                                    : <AlertCircle className="w-3.5 h-3.5 text-red-500 inline" />}
                                </td>
                                <td className="py-1.5 px-3 text-center capitalize">{r.match_tier}</td>
                                <td className="py-1.5 px-3 text-center">{pct(r.similarity_score)}</td>
                                <td className="py-1.5 px-3 text-center">
                                  <Badge className={r.confidence_cap === 100 ? "bg-green-600 text-white" : "bg-amber-600 text-white"}>
                                    {r.confidence_cap}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : null}

            {/* Manual signature checker */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Manual Signature Checker</CardTitle></CardHeader>
              <CardContent>
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={domainSignature}
                    onChange={(e) => setDomainSignature(e.target.value)}
                    placeholder="e.g. pickup_animal_frontal_severe_8c_high"
                    className="flex-1 border border-border rounded px-3 py-1.5 text-sm bg-background"
                  />
                  <Button
                    size="sm"
                    onClick={() => { setDomainCheckSig(domainSignature.trim() || null); }}
                    disabled={!domainSignature.trim()}
                  >
                    <Search className="w-3.5 h-3.5 mr-1" /> Check
                  </Button>
                </div>

                {domainCheckLoading && (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <RefreshCw className="w-4 h-4 animate-spin" /> Checking…
                  </div>
                )}

                {domainCheck && !domainCheckLoading && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      {domainCheck.in_domain
                        ? <Badge className="bg-green-600 text-white">IN-DOMAIN</Badge>
                        : <Badge className="bg-red-600 text-white">OUT-OF-DOMAIN</Badge>}
                      <Badge className={domainCheck.confidence_cap === 100 ? "bg-green-600 text-white" : "bg-amber-600 text-white"}>
                        Confidence Cap: {domainCheck.confidence_cap}
                      </Badge>
                      <Badge variant="outline" className="capitalize">{domainCheck.match_tier}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{domainCheck.reasoning}</p>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div><span className="text-muted-foreground">Matches Found:</span> <strong>{domainCheck.match_count}</strong></div>
                      <div><span className="text-muted-foreground">Best Match:</span> <strong className="font-mono">{domainCheck.best_match_signature ?? "—"}</strong></div>
                      <div><span className="text-muted-foreground">Similarity:</span> <strong>{pct(domainCheck.similarity_score)}</strong></div>
                    </div>
                    {domainCheck.token_overlap && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {(Object.entries(domainCheck.token_overlap) as [string, boolean][]).map(([dim, match]) => (
                          <span key={dim} className={`text-xs px-2 py-0.5 rounded-full border ${
                            match ? "border-green-500 text-green-600" : "border-red-400 text-red-500"
                          }`}>{dim}</span>
                        ))}
                      </div>
                    )}
                    {domainCheck.warnings.length > 0 && (
                      <div className="text-xs text-amber-600 flex items-start gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        {domainCheck.warnings.join(" ")}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
        </div>
    </div>
  );
}
