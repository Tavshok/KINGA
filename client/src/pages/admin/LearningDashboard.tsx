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
  const [activeTab, setActiveTab] = useState<"overview" | "cost" | "fraud" | "calibration">("overview");

  const scenarioParam = scenarioFilter === "all" ? undefined : scenarioFilter;

  const { data: calibrationDrift, isLoading: calibrationLoading, refetch: refetchCalibration } =
    trpc.learning.getCalibrationDrift.useQuery(
      { scenario_filter: scenarioParam },
      { enabled: activeTab === "calibration" }
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
       {(["overview", "cost", "fraud", "calibration"] as const).map((tab) => (          <button
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
        </div>
    </div>
  );
}
