// @ts-nocheck
/**
 * Executive Dashboard - Premium Enterprise Command Center
 * 
 * Provides comprehensive analytics with enhanced data visualization
 * for executive decision-making.
 */

import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { 
  Search, TrendingUp, DollarSign, AlertTriangle, CheckCircle, 
  Clock, Users, Wrench, BarChart3, FileText, Activity,
  Shield, ShieldCheck, TrendingDown, Download,
  AlertCircle, Gauge, Target, Zap
} from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import ExecutiveAnalyticsCharts from "@/components/ExecutiveAnalyticsCharts";
import { AnalyticsExportButton } from "@/components/AnalyticsExportButton";
import { ClaimDrillDownModal } from "@/components/ClaimDrillDownModal";
import { KingaReportButton } from "@/components/KingaReportButton";
import ThemeToggle from "@/components/ThemeToggle";
import { NotificationsInbox, NotificationsTabBadge } from "@/components/NotificationsInbox";

import ReportsBadgeWidget from "@/components/ReportsBadgeWidget";
import {
  exportKPIsToPDF,
  exportAssessorPerformanceToExcel,
  exportPanelBeaterAnalyticsToExcel,
  exportCostSavingsTrendsToExcel,
  exportFinancialOverviewToPDF,
} from "@/lib/exportUtils";

// Gauge component for confidence score visualization
function ConfidenceGauge({ score }: { score: number }) {
  const getColor = (score: number) => {
    if (score <= 40) return { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300", stroke: "#22c55e" };
    if (score <= 70) return { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-300", stroke: "#f59e0b" };
    return { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300", stroke: "#ef4444" };
  };

  const color = getColor(score);
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center p-6">
      <div className="relative w-32 h-32">
        <svg className="transform -rotate-90 w-32 h-32">
          {/* Background circle */}
          <circle
            cx="64"
            cy="64"
            r="45"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="12"
            fill="none"
          />
          {/* Progress circle */}
          <circle
            cx="64"
            cy="64"
            r="45"
            stroke={color.stroke}
            strokeWidth="12"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className={`text-3xl font-bold ${color.text}`}>{score}</div>
            <div className="text-xs text-slate-700 dark:text-slate-400 dark:text-muted-foreground">Risk Score</div>
          </div>
        </div>
      </div>
      <div className="mt-4 flex gap-2 text-xs">
        <span className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          Low (0-40)
        </span>
        <span className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-amber-500"></div>
          Medium (41-70)
        </span>
        <span className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          High (71-100)
        </span>
      </div>
    </div>
  );
}

// Large KPI Card Component — World-class dark BI design
interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: { value: number; label: string };
  color: "blue" | "green" | "purple" | "red" | "amber" | "slate";
}

const BI_COLORS: Record<string, { icon: string; accent: string; glow: string }> = {
  blue:   { icon: 'var(--info)', accent: 'var(--fp-info-bg)', glow: 'var(--fp-info-bg)' },
  green:  { icon: 'var(--success)', accent: 'var(--fp-success-bg)', glow: 'var(--fp-success-bg)' },
  purple: { icon: 'var(--chart-5)', accent: 'var(--fp-info-bg)', glow: 'var(--fp-info-bg)' },
  red:    { icon: 'var(--chart-4)',  accent: 'var(--fp-critical-bg)',  glow: 'var(--fp-critical-bg)'  },
  amber:  { icon: 'var(--warning)',  accent: 'var(--fp-warning-bg)',  glow: 'var(--fp-warning-bg)'  },
  slate:  { icon: 'var(--muted-foreground)', accent: 'var(--muted)', glow: 'var(--muted)' },
};

function LargeKPICard({ title, value, subtitle, icon: Icon, trend, color }: KPICardProps) {
  const c = BI_COLORS[color] || BI_COLORS.slate;
  const isPositiveTrend = trend && trend.value >= 0;

  return (
    <div
      className="relative overflow-hidden rounded-xl p-5"
      style={{
        background: 'var(--background)',
        border: '1px solid var(--border)',
        boxShadow: `0 0 20px ${c.glow}`,
      }}
    >
      {/* Accent glow top-right */}
      <div
        className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl"
        style={{ background: c.accent, transform: 'translate(30%, -30%)' }}
      />
      <div className="relative">
        <div className="flex items-start justify-between mb-4">
          <div
            className="p-2.5 rounded-lg"
            style={{ background: c.accent, border: `1px solid ${c.icon}40` }}
          >
            <Icon className="h-5 w-5" style={{ color: c.icon }} />
          </div>
          {trend && (
            <div
              className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded"
              style={{
                background: isPositiveTrend ? 'var(--fp-success-bg)' : 'var(--fp-critical-bg)',
                color: isPositiveTrend ? 'var(--success)' : 'var(--chart-4)',
              }}
            >
              {isPositiveTrend ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(trend.value)}%
            </div>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>{title}</p>
          <p className="text-3xl font-bold" style={{ color: 'var(--foreground)' }}>{value}</p>
          {subtitle && (
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{subtitle}</p>
          )}
          {trend && (
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{trend.label}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ExecutiveDashboard() {
  const { fmt, currencySymbol } = useTenantCurrency();
  const [searchQuery, setSearchQuery] = useState("");
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  // Sync active tab with ?tab= query param from sidebar links
  // e.g. /insurer-portal/executive?tab=financials → roi-breakdown
  const TAB_MAP: Record<string, string> = {
    financials: "roi-breakdown",
    "roi-breakdown": "roi-breakdown",
    "operational-health": "operational-health",
    notifications: "notifications",
    overview: "overview",
  };
  const [activeTab, setActiveTab] = useState(() => {
    const param = new URLSearchParams(searchStr).get("tab") ?? "overview";
    return TAB_MAP[param] ?? "overview";
  });
  useEffect(() => {
    const param = new URLSearchParams(searchStr).get("tab") ?? "overview";
    const mapped = TAB_MAP[param] ?? "overview";
    setActiveTab(mapped);
  }, [searchStr]);
  
  // Comment & Review Request state
  const [selectedClaim, setSelectedClaim] = useState<any>(null);
  const [showCommentDialog, setShowCommentDialog] = useState(false);
  const [drillDownOpen, setDrillDownOpen] = useState(false);
  const [drillDownFilter, setDrillDownFilter] = useState<"all" | "high_fraud" | "overridden">("all");
  const [drillDownTitle, setDrillDownTitle] = useState("");
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [commentContent, setCommentContent] = useState("");
  const [commentType, setCommentType] = useState("general");
  const [reviewRole, setReviewRole] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");

  // ── Executive Summary Hero Numbers (Phase 1 analytics procedure) ──
  const [execFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]; });
  const [execTo] = useState(() => new Date().toISOString().split('T')[0]);
  const { data: execSummary, isLoading: execSummaryLoading } = trpc.claims.getExecutiveSummary.useQuery(
    { from: execFrom, to: execTo }, { retry: 0 }
  );

  // Fetch data (reusing existing endpoints - NO NEW QUERIES)
  const { data: kpisResponse, isLoading: kpisLoading, isError: kpisError } = trpc.analytics.getKPIs.useQuery({}, { retry: 0 });

  const { data: assessorPerfResponse, isLoading: assessorLoading } = trpc.analytics.getAssessorPerformance.useQuery(undefined, { retry: 0 });
  const { data: panelBeaterAnalyticsResponse, isLoading: panelBeaterLoading } = trpc.analytics.getPanelBeaterAnalytics.useQuery(undefined, { retry: 0 });
  const { data: savingsTrendsResponse, isLoading: savingsLoading } = trpc.analytics.getCostSavingsTrends.useQuery(undefined, { retry: 0 });
  const { data: bottlenecksResponse, isLoading: bottlenecksLoading } = trpc.analytics.getWorkflowBottlenecks.useQuery(undefined, { retry: 0 });
  const { data: financialsResponse, isLoading: financialsLoading } = trpc.analytics.getFinancialOverview.useQuery(undefined, { retry: 0 });
  
  // Governance metrics
  const { data: governanceResponse, isLoading: governanceLoading } = trpc.governance.getGovernanceSummary.useQuery(undefined, { retry: 0 });
  // Governance detail queries removed — executive sees snapshot KPIs only.
  
  const governanceMetrics = governanceResponse?.data;


  // Search query - only execute when searchQuery has value
  const { data: searchResultsResponse, isLoading: searchLoading, refetch: executeSearch } = trpc.analytics.globalSearch.useQuery(
    { query: searchQuery },
    { enabled: false }
  );

  // Adapt new standardized response format to legacy dashboard format
  const kpis = kpisResponse?.data?.summaryMetrics;

  const assessorPerf = assessorPerfResponse?.data?.assessors;
  const panelBeaterAnalytics = panelBeaterAnalyticsResponse?.data?.panelBeaters;
  const savingsTrends = savingsTrendsResponse?.data?.trends?.monthlySavings;
  const bottlenecks = bottlenecksResponse?.data?.riskIndicators?.bottlenecks;
  const financials = financialsResponse?.data?.summaryMetrics;
  const searchResults = searchResultsResponse?.data?.results;

  const handleSearch = async () => {
    if (searchQuery.trim()) {
      await executeSearch();
    }
  };

  // Transform bottleneck data for bar chart
  const bottleneckChartData = useMemo(() => {
    if (!bottlenecks || !Array.isArray(bottlenecks)) return [];
    return bottlenecks.map((b: any) => ({
      state: (b?.state || "UNKNOWN").replace(/_/g, " ").toUpperCase(),
      avgHours: Math.round((b?.avgDaysInState || 0) * 24), // Convert days to hours
      count: b?.count || 0,
    }));
  }, [bottlenecks]);

  // Calculate override metrics (30 days)
  const overrideMetrics = useMemo(() => {
    if (!kpis) return { count: 0, claimsOverridden: 0, percentage: 0 };
    
    // Mock calculation - replace with actual data from kpis
    const totalAutoApproved = kpis.autoApprovals || 0;
    const overrideCount = kpis.executiveOverrides || 0;
    const percentage = totalAutoApproved > 0 
      ? ((overrideCount / totalAutoApproved) * 100).toFixed(1)
      : 0;

    return {
      count: overrideCount,
      claimsOverridden: overrideCount,
      percentage: parseFloat(percentage as string),
    };
  }, [kpis]);

  // Add comment mutation — wired to real backend
  const addComment = trpc.comments.addComment.useMutation({
    onSuccess: () => {
      toast.success("Comment Added", {
        description: "Your comment has been added to the claim.",
      });
      setShowCommentDialog(false);
      setSelectedClaim(null);
      setCommentContent("");
      setCommentType("general");
    },
    onError: (err: any) => {
      toast.error("Failed to add comment", { description: err?.message ?? "Unknown error" });
    },
  });

  const handleAddComment = (claim: any) => {
    setSelectedClaim(claim);
    setShowCommentDialog(true);
  };
  const handleSubmitComment = () => {
    if (!selectedClaim || !commentContent.trim()) {
      toast.error("Validation Error", {
        description: "Please enter a comment.",
      });
      return;
    }
    addComment.mutate({
      claimId: selectedClaim.id,
      content: commentContent,
    });
  };
  const handleRequestReview = (claim: any) => {
    setSelectedClaim(claim);
    setShowReviewDialog(true);
  };
  const handleSubmitReviewRequest = () => {
    if (!selectedClaim || !reviewRole || !reviewNotes.trim()) {
      toast.error("Validation Error", {
        description: "Please select a role and provide review notes.",
      });
      return;
    }
    addComment.mutate({
      claimId: selectedClaim.id,
      content: `EXECUTIVE REVIEW REQUEST for ${reviewRole}: ${reviewNotes}`,
    });
    setShowReviewDialog(false);
    setSelectedClaim(null);
    setReviewRole("");
    setReviewNotes("");
  };

  if (kpisLoading && !kpisError) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <div className="text-center space-y-4">
          <Activity className="h-12 w-12 animate-spin mx-auto" style={{ color: 'var(--success)' }} />
          <p style={{ color: 'var(--muted-foreground)' }}>Loading Executive Command Center...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>

      {/* ── Page Header ── */}
      <div style={{ background: 'var(--background)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-[1600px] mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'var(--success)' }}>
                <BarChart3 className="h-6 w-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Executive Command Center</h1>
                  <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{ background: 'var(--success)', color: 'white' }}>LIVE</span>
                </div>
                <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Real-time insights · Decision intelligence · AI-powered analytics</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Last updated</p>
                <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{new Date().toLocaleTimeString()}</p>
              </div>
              <ThemeToggle />
              <Link href="/portal-hub">
                <Button variant="outline" size="sm" style={{ borderColor: 'var(--border)', color: 'var(--foreground)', background: 'transparent' }}>
                  <Target className="mr-2 h-4 w-4" />
                  Switch Portal
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── HERO NUMBERS: Three Large Numbers, Full Width, Always Visible ── */}
          <div className="flex justify-end mb-3"><ReportsBadgeWidget compact /></div>
      <div className="max-w-[1600px] mx-auto px-8 pt-8 pb-2">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {[
            {
              label: 'Total Claims (30d)',
              value: execSummaryLoading ? '…' : (execSummary?.totalClaims ?? kpis?.totalClaims ?? 0).toLocaleString(),
              sub: 'Submitted in period',
              color: 'var(--info)',
              icon: FileText,
            },
            {
              label: 'KINGA Savings',
              value: execSummaryLoading ? '…' : (() => { const s = execSummary?.totalSavings ?? 0; return s > 0 ? `${currencySymbol} ${(s/100).toLocaleString()}` : '—'; })(),
              sub: 'Est. value − approved',
              color: 'var(--success)',
              icon: TrendingUp,
            },
            {
              label: 'Resolution Rate',
              value: execSummaryLoading ? '…' : `${(execSummary?.resolutionRate ?? 0).toFixed(1)}%`,
              sub: 'Closed / total claims',
              color: 'var(--chart-5)',
              icon: CheckCircle,
            },
            {
              label: 'Avg Cycle Days',
              value: execSummaryLoading ? '…' : `${(execSummary?.avgCycleDays ?? 0).toFixed(1)}d`,
              sub: 'Submission to closure',
              color: execSummary?.avgCycleDays && execSummary.avgCycleDays > 14 ? 'var(--warning)' : 'var(--success)',
              icon: Clock,
            },
          ].map(({ label, value, sub, color, icon: Icon }, i) => (
            <div
              key={i}
              className="rounded-xl p-5"
              style={{ background: 'var(--background)', border: '1px solid var(--border)', boxShadow: `0 0 24px ${color}20` }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
                  <p className="text-3xl font-bold mt-1" style={{ color }}>{value}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{sub}</p>
                </div>
                <div className="p-2.5 rounded-lg" style={{ background: `${color}20` }}>
                  <Icon className="h-5 w-5" style={{ color }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Secondary KPI strip ── */}
      <div className="max-w-[1600px] mx-auto px-8 pb-6 pt-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div
            className="rounded-lg px-4 py-3 flex items-center gap-3 cursor-pointer"
            style={{ background: 'var(--fp-critical-bg)', border: '1px solid color-mix(in srgb, var(--chart-4) 30%, transparent)' }}
            onClick={() => { setDrillDownFilter("high_fraud"); setDrillDownTitle("High Fraud Risk Claims"); setDrillDownOpen(true); }}
          >
            <AlertTriangle className="h-5 w-5 shrink-0" style={{ color: 'var(--chart-4)' }} />
            <div>
              <p className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>Fraud Exposure</p>
              <p className="text-lg font-bold" style={{ color: 'var(--chart-4)' }}>{fmt((kpis?.fraudRiskAmount || 0) * 100)}</p>
            </div>
          </div>
          <div className="rounded-lg px-4 py-3 flex items-center gap-3" style={{ background: 'var(--fp-warning-bg)', border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)' }}>
            <Shield className="h-5 w-5 shrink-0" style={{ color: 'var(--warning)' }} />
            <div>
              <p className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>High-Risk Claims</p>
              <p className="text-lg font-bold" style={{ color: 'var(--warning)' }}>{kpis?.highRiskClaimsCount || 0}</p>
            </div>
          </div>
          <div className="rounded-lg px-4 py-3 flex items-center gap-3" style={{ background: 'var(--fp-success-bg)', border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)' }}>
            <Zap className="h-5 w-5 shrink-0" style={{ color: 'var(--success)' }} />
            <div>
              <p className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>Fast-Track Rate</p>
              <p className="text-lg font-bold" style={{ color: 'var(--success)' }}>{kpis?.fastTrackPercentage || 0}%</p>
            </div>
          </div>
          <div
            className="rounded-lg px-4 py-3 flex items-center gap-3 cursor-pointer"
            style={{ background: 'var(--fp-info-bg)', border: '1px solid color-mix(in srgb, var(--info) 30%, transparent)' }}
            onClick={() => { setDrillDownFilter("overridden"); setDrillDownTitle("Executive Override History"); setDrillDownOpen(true); }}
          >
            <AlertCircle className="h-5 w-5 shrink-0" style={{ color: 'var(--info)' }} />
            <div>
              <p className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>Executive Overrides</p>
              <p className="text-lg font-bold" style={{ color: 'var(--info)' }}>{overrideMetrics.count}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── 3-TAB SECTION ── */}
      <div className="max-w-[1600px] mx-auto px-8 pb-12">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="operational-health">Operational Health</TabsTrigger>
            <TabsTrigger value="roi-breakdown">ROI Breakdown</TabsTrigger>
            <TabsTrigger value="notifications"><NotificationsTabBadge /></TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Overview ── */}
          <TabsContent value="overview" className="space-y-6">
            {/* Chart row: Savings Trend + Fast-Track Analytics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card style={{ border: '1px solid var(--border)' }}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5" style={{ color: 'var(--success)' }} />
                        Cost Savings Trend
                      </CardTitle>
                      <CardDescription>Month-over-month KINGA savings</CardDescription>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => savingsTrends && exportCostSavingsTrendsToExcel(savingsTrends)}
                      disabled={!savingsTrends || savingsTrends.length === 0}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {savingsLoading ? (
                    <div className="h-64 flex items-center justify-center">
                      <Activity className="h-8 w-8 animate-spin" style={{ color: 'var(--success)' }} />
                    </div>
                  ) : savingsTrends && savingsTrends.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={savingsTrends}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="savings" stroke="var(--success)" strokeWidth={3} dot={{ fill: 'var(--success)', r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center py-12" style={{ color: 'var(--muted-foreground)' }}>No savings data available yet</p>
                  )}
                </CardContent>
              </Card>

              <Card style={{ border: '1px solid var(--border)' }}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gauge className="h-5 w-5" style={{ color: 'var(--info)' }} />
                    AI Confidence Distribution
                  </CardTitle>
                  <CardDescription>Risk classification across all assessed claims</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-center mb-4">
                    <div className="rounded-xl p-4" style={{ background: 'var(--fp-success-bg)' }}>
                      <p className="text-3xl font-bold" style={{ color: 'var(--success)' }}>{kpis?.lowRiskCount || 0}</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>Low Risk</p>
                    </div>
                    <div className="rounded-xl p-4" style={{ background: 'var(--fp-warning-bg)' }}>
                      <p className="text-3xl font-bold" style={{ color: 'var(--warning)' }}>{kpis?.mediumRiskCount || 0}</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>Medium Risk</p>
                    </div>
                    <div className="rounded-xl p-4" style={{ background: 'var(--fp-critical-bg)' }}>
                      <p className="text-3xl font-bold" style={{ color: 'var(--chart-4)' }}>{kpis?.highRiskCount || 0}</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>High Risk</p>
                    </div>
                  </div>
                  <ConfidenceGauge score={kpis?.avgConfidenceScore || 35} />
                </CardContent>
              </Card>
            </div>

            {/* Global Search */}
            <Card style={{ border: '1px solid var(--border)' }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Global Search
                </CardTitle>
                <CardDescription>Search across claims, assessors, and panel beaters</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter claim ID, assessor name, or keyword..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="flex-1"
                  />
                  <Button onClick={handleSearch} disabled={searchLoading}>
                    {searchLoading ? <Activity className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
                {searchResults && (
                  <div className="mt-4 space-y-2">
                    {searchResults.claims?.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2">Claims ({searchResults.claims.length})</h4>
                        <div className="space-y-2">
                          {searchResults.claims.map((claim: any) => (
                            <Link key={claim.id} href={`/insurer/claims/${claim.id}`}>
                              <div className="p-3 rounded-lg hover:opacity-80 transition-opacity cursor-pointer" style={{ background: 'var(--muted)' }}>
                                <div className="flex items-center justify-between">
                                  <span className="font-medium">Claim #{claim.id}</span>
                                  <Badge>{claim.status}</Badge>
                                </div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Fast-Track Analytics */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>Fast-Track Analytics</h2>
                <AnalyticsExportButton tenantId="default-tenant" variant="outline" size="sm" />
              </div>
              <ExecutiveAnalyticsCharts />
            </div>
          </TabsContent>

          {/* ── Tab 2: Operational Health ── */}
          <TabsContent value="operational-health" className="space-y-6">
            {/* Governance Summary — executive-level KPI snapshot */}
            <Card style={{ border: '1px solid var(--border)' }}>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" style={{ color: 'var(--warning)' }} />
                    Governance Health Snapshot
                  </CardTitle>
                  <CardDescription>High-level compliance indicators (30 days)</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => setLocation("/insurer-portal/reports-centre")}>
                  Governance Reports
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-xl p-4 text-center" style={{ background: 'var(--fp-warning-bg)', border: '1px solid color-mix(in srgb, var(--warning) 20%, transparent)' }}>
                    <p className="text-3xl font-bold" style={{ color: 'var(--warning)' }}>
                      {governanceMetrics ? `${governanceMetrics.overrideRate?.value ?? governanceMetrics.overrideRate ?? 0}%` : '—'}
                    </p>
                    <p className="text-sm font-medium mt-1" style={{ color: 'var(--foreground)' }}>AI Override Rate</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>AI decisions overridden by staff</p>
                  </div>
                  <div className="rounded-xl p-4 text-center" style={{ background: 'var(--fp-critical-bg)', border: '1px solid color-mix(in srgb, var(--chart-4) 20%, transparent)' }}>
                    <p className="text-3xl font-bold" style={{ color: 'var(--chart-4)' }}>
                      {governanceMetrics ? (governanceMetrics.segregationViolations?.value ?? governanceMetrics.segregationViolations ?? 0) : '—'}
                    </p>
                    <p className="text-sm font-medium mt-1" style={{ color: 'var(--foreground)' }}>Segregation Violations</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Duty-of-care conflicts detected</p>
                  </div>
                  <div className="rounded-xl p-4 text-center" style={{ background: 'var(--fp-info-bg)', border: '1px solid color-mix(in srgb, var(--info) 20%, transparent)' }}>
                    <p className="text-3xl font-bold" style={{ color: 'var(--info)' }}>
                      {governanceMetrics ? (governanceMetrics.roleChanges?.value ?? governanceMetrics.roleChanges30d ?? governanceMetrics.roleChanges ?? 0) : '—'}
                    </p>
                    <p className="text-sm font-medium mt-1" style={{ color: 'var(--foreground)' }}>Role Changes (30d)</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>User role modifications this month</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Workflow Bottleneck */}
            <Card style={{ border: '1px solid var(--border)' }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" style={{ color: 'var(--chart-5)' }} />
                  Workflow Bottleneck Analysis
                </CardTitle>
                <CardDescription>Average time spent in each workflow state (hours)</CardDescription>
              </CardHeader>
              <CardContent>
                {bottlenecksLoading ? (
                  <div className="h-64 flex items-center justify-center">
                    <Activity className="h-8 w-8 animate-spin" style={{ color: 'var(--chart-5)' }} />
                  </div>
                ) : bottleneckChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={bottleneckChartData} margin={{ top: 10, right: 20, left: 10, bottom: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="state" angle={-40} textAnchor="end" height={90} tick={{ fontSize: 11 }} />
                      <YAxis label={{ value: 'Hours', angle: -90, position: 'insideLeft' }} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="avgHours" radius={[6, 6, 0, 0]}>
                        {bottleneckChartData.map((entry: any, index: number) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.avgHours > 48 ? 'var(--chart-4)' : entry.avgHours > 24 ? 'var(--warning)' : 'var(--success)'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center" style={{ color: 'var(--muted-foreground)' }}>
                    No bottleneck data available yet
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Assessor + Panel Beater compact tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card style={{ border: '1px solid var(--border)' }}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" style={{ color: 'var(--info)' }} />
                      Top Assessors
                    </CardTitle>
                    <Button size="sm" variant="outline" onClick={() => assessorPerf && exportAssessorPerformanceToExcel(assessorPerf)} disabled={!assessorPerf}>
                      <Download className="h-4 w-4 mr-2" />Export
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {assessorLoading ? (
                    <div className="h-40 flex items-center justify-center"><Activity className="h-6 w-6 animate-spin" /></div>
                  ) : assessorPerf && assessorPerf.length > 0 ? (
                    <div className="space-y-2">
                      {assessorPerf.slice(0, 5).map((assessor: any, index: number) => (
                        <div key={assessor.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--muted)' }}>
                          <div className="flex items-center gap-3">
                            <span className="text-lg font-bold w-6 text-center" style={{ color: 'var(--muted-foreground)' }}>#{index + 1}</span>
                            <div>
                              <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>{assessor.name}</p>
                              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{assessor.claimsProcessed} claims · {assessor.avgTime} avg</p>
                            </div>
                          </div>
                          <span className="text-sm font-bold" style={{ color: 'var(--success)' }}>{assessor.accuracy}%</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center py-8" style={{ color: 'var(--muted-foreground)' }}>No assessor data available</p>
                  )}
                </CardContent>
              </Card>

              <Card style={{ border: '1px solid var(--border)' }}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Wrench className="h-5 w-5" style={{ color: 'var(--success)' }} />
                      Panel Beater Performance
                    </CardTitle>
                    <Button size="sm" variant="outline" onClick={() => panelBeaterAnalytics && exportPanelBeaterAnalyticsToExcel(panelBeaterAnalytics)} disabled={!panelBeaterAnalytics}>
                      <Download className="h-4 w-4 mr-2" />Export
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {panelBeaterLoading ? (
                    <div className="h-40 flex items-center justify-center"><Activity className="h-6 w-6 animate-spin" /></div>
                  ) : panelBeaterAnalytics && panelBeaterAnalytics.length > 0 ? (
                    <div className="space-y-2">
                      {panelBeaterAnalytics.slice(0, 5).map((beater: any) => (
                        <div key={beater.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--muted)' }}>
                          <div>
                            <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>{beater.name}</p>
                            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{beater.quotesSubmitted} quotes</p>
                          </div>
                          <Badge variant={beater.avgAccuracy >= 90 ? "default" : "secondary"}>{beater.avgAccuracy}% accuracy</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center py-8" style={{ color: 'var(--muted-foreground)' }}>No panel beater data available</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Tab 3: ROI Breakdown ── */}
          <TabsContent value="roi-breakdown" className="space-y-6">
            {/* Financial Overview: 4 big numbers */}
            <Card style={{ border: '1px solid var(--border)' }}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5" style={{ color: 'var(--success)' }} />
                      Financial Overview
                    </CardTitle>
                    <CardDescription>Claims payouts, reserves, and fraud prevention metrics</CardDescription>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => financials && exportFinancialOverviewToPDF(financials)} disabled={!financials}>
                    <Download className="h-4 w-4 mr-2" />Export PDF
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {financialsLoading ? (
                  <div className="h-48 flex items-center justify-center">
                    <Activity className="h-8 w-8 animate-spin" style={{ color: 'var(--success)' }} />
                  </div>
                ) : financials ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                    {[
                      { label: 'Total Payouts', value: `$${(financials.totalPayouts || 0).toLocaleString()}`, sub: 'Approved claims paid', color: 'var(--info)' },
                      { label: 'Total Reserves', value: `$${(financials.totalReserves || 0).toLocaleString()}`, sub: 'Pending claims estimated', color: 'var(--warning)' },
                      { label: 'Fraud Prevented', value: `$${(financials.fraudPrevented || 0).toLocaleString()}`, sub: 'High-risk claims rejected', color: 'var(--success)' },
                      { label: 'Net Exposure', value: `$${(financials.netExposure || 0).toLocaleString()}`, sub: 'Total financial exposure', color: 'var(--chart-5)' },
                    ].map(({ label, value, sub, color }) => (
                      <div key={label} className="rounded-xl p-5 text-center" style={{ background: `color-mix(in srgb, ${color} 10%, var(--background))`, border: `1px solid color-mix(in srgb, ${color} 25%, transparent)` }}>
                        <p className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
                        <p className="text-3xl font-bold mt-2" style={{ color }}>{value}</p>
                        <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>{sub}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center py-12" style={{ color: 'var(--muted-foreground)' }}>No financial data available yet</p>
                )}
              </CardContent>
            </Card>

            {/* KPI Export */}
            <Card style={{ border: '1px solid var(--border)' }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5" style={{ color: 'var(--info)' }} />
                  Export Reports
                </CardTitle>
                <CardDescription>Download executive reports in PDF or Excel format</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Button variant="outline" className="justify-start gap-2" onClick={() => kpis && exportKPIsToPDF(kpis)} disabled={!kpis}>
                    <FileText className="h-4 w-4" />Executive Summary (PDF)
                  </Button>
                  <Button variant="outline" className="justify-start gap-2" onClick={() => savingsTrends && exportCostSavingsTrendsToExcel(savingsTrends)} disabled={!savingsTrends}>
                    <TrendingUp className="h-4 w-4" />ROI & Cost Savings (Excel)
                  </Button>
                  <Button variant="outline" className="justify-start gap-2" onClick={() => financials && exportFinancialOverviewToPDF(financials)} disabled={!financials}>
                    <DollarSign className="h-4 w-4" />Financial Overview (PDF)
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        
          {/* ── Notifications Tab ─────────────────────────────────────── */}
          <TabsContent value="notifications" className="mt-6">
            <NotificationsInbox />
          </TabsContent>
</Tabs>
      </div>

      {/* Comment Dialog */}
      <Dialog open={showCommentDialog} onOpenChange={setShowCommentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Comment</DialogTitle>
            <DialogDescription>Add a comment to Claim #{selectedClaim?.id}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="commentType">Comment Type</Label>
              <Select value={commentType} onValueChange={setCommentType}>
                <SelectTrigger id="commentType"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="flag">Flag for Review</SelectItem>
                  <SelectItem value="approval">Approval Note</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="comment">Comment</Label>
              <Textarea id="comment" value={commentContent} onChange={(e) => setCommentContent(e.target.value)} placeholder="Enter your comment..." rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCommentDialog(false)}>Cancel</Button>
            <Button onClick={handleSubmitComment}>Submit Comment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Request Dialog */}
      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Review</DialogTitle>
            <DialogDescription>Request a specialist review for Claim #{selectedClaim?.id}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reviewRole">Reviewer Role</Label>
              <Select value={reviewRole} onValueChange={setReviewRole}>
                <SelectTrigger id="reviewRole"><SelectValue placeholder="Select role..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fraud-specialist">Fraud Specialist</SelectItem>
                  <SelectItem value="senior-assessor">Senior Assessor</SelectItem>
                  <SelectItem value="claims-manager">Claims Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reviewNotes">Review Notes</Label>
              <Textarea id="reviewNotes" value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} placeholder="Explain why this claim needs review..." rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReviewDialog(false)}>Cancel</Button>
            <Button onClick={handleSubmitReviewRequest}>Request Review</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Claim Drill-Down Modal */}
      <ClaimDrillDownModal
        open={drillDownOpen}
        onOpenChange={setDrillDownOpen}
        filter={drillDownFilter}
        title={drillDownTitle}
      />
    </div>
  );
}
