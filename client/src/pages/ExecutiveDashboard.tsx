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
  AlertCircle, Gauge, Target, Zap, RefreshCw
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
import { PortalHeader, PortalKPIStrip, PortalAlerts, type PortalKPI, type PortalAlert } from "@/components/KingaPortalShell";
import { ExecutiveAlertsCenter } from "@/components/executive/ExecutiveAlertsCenter";
import { ExecutiveEscalationQueue } from "@/components/executive/ExecutiveEscalationQueue";
import { ExecutiveReportTab } from "@/components/executive/ExecutiveReportTab";
import { ClaimsAgeingPanel } from "@/components/executive/ClaimsAgeingPanel";
import { FraudInvestigationFunnel } from "@/components/executive/FraudInvestigationFunnel";
import {
  DEMO_EXEC_SUMMARY,
  DEMO_KPI_SUMMARY,
  DEMO_FINANCIALS,
  DEMO_GOVERNANCE,
  DEMO_ASSESSORS,
  DEMO_PANEL_BEATERS,
  DEMO_BOTTLENECKS,
  DEMO_MONTH_COMPARISON,
  isEmptyData,
} from "@/lib/demoData";
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
    if (score <= 40) return { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300", stroke: "#3C7844" };
    if (score <= 70) return { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-300", stroke: "#8A5C00" };
    return { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300", stroke: "#A32D2D" };
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
  // Month-on-Month Comparison — replaces hardcoded DEMO_MONTH_COMPARISON
  const { data: monthComparisonResponse } = trpc.analytics.getMonthComparison.useQuery(undefined, { retry: 0 });
  // Governance detail queries removed — executive sees snapshot KPIs only.
  
  // ── Demo mode: fall back to realistic fixture data when DB is empty ──
  const _execRaw = execSummary;
  const isDemo = !_execRaw || (_execRaw.totalClaims === 0);
  const effectiveExecSummary = isDemo ? DEMO_EXEC_SUMMARY : _execRaw;

  const _kpisRaw = kpisResponse?.data?.summaryMetrics;
  const kpisFull = (!_kpisRaw || _kpisRaw.totalClaims === 0) ? DEMO_KPI_SUMMARY : _kpisRaw;

  const _govRaw = governanceResponse?.data;
  const governanceMetrics = (!_govRaw || isEmptyData(_govRaw)) ? DEMO_GOVERNANCE : _govRaw;
  // Month comparison: use real data if available, fall back to demo fixture
  const monthComparisonItems = monthComparisonResponse?.items ?? DEMO_MONTH_COMPARISON;
  const monthComparisonLabel = monthComparisonResponse?.label ?? 'MONTH-ON-MONTH';

  // Search query - only execute when searchQuery has value
  const { data: searchResultsResponse, isLoading: searchLoading, refetch: executeSearch } = trpc.analytics.globalSearch.useQuery(
    { query: searchQuery },
    { enabled: false }
  );

  // Adapt new standardized response format to legacy dashboard format
  const kpis = kpisFull;

  const _assessorRaw = assessorPerfResponse?.data?.assessors;
  const assessorPerf = (!_assessorRaw || _assessorRaw.length === 0) ? DEMO_ASSESSORS : _assessorRaw;

  const _panelRaw = panelBeaterAnalyticsResponse?.data?.panelBeaters;
  const panelBeaterAnalytics = (!_panelRaw || _panelRaw.length === 0) ? DEMO_PANEL_BEATERS : _panelRaw;

  const savingsTrends = savingsTrendsResponse?.data?.trends?.monthlySavings;

  const _bottlenecksRaw = bottlenecksResponse?.data?.riskIndicators?.bottlenecks;
  const bottlenecks = (!_bottlenecksRaw || !Array.isArray(_bottlenecksRaw) || _bottlenecksRaw.length === 0) ? DEMO_BOTTLENECKS : _bottlenecksRaw;

  const _financialsRaw = financialsResponse?.data?.summaryMetrics;
  const financials = (!_financialsRaw || (_financialsRaw.totalPayouts === 0 && _financialsRaw.fraudPrevented === 0)) ? DEMO_FINANCIALS : _financialsRaw;

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

  // Design tokens
  const G = {
    g900: '#103A23', g700: '#1C5C39', g600: '#237049', g100: '#E7F1EA',
    gold600: '#B8923A', gold300: '#E3CD8F',
    ink: '#15201A', muted: '#6B7568', muted2: '#9AA293',
    line: '#E7E2D6', card: '#FFFFFF', bodyBg: '#F7F8F6',
    red: '#B1402F', redSoft: '#F8E9E4', amber: '#A6730B',
  };
  const slaBreach = kpis?.slaBreachedCount ?? kpis?.highRiskCount ?? 0;
  const fraudFlags = kpis?.fraudFlagCount ?? 0;
  const highRisk = kpis?.highRiskCount ?? 0;

  return (
    <div className="exec-dashboard min-h-screen" style={{ background: G.bodyBg, fontFamily: 'Inter, sans-serif' }}>

      {/* ── WHITE IDENTITY STRIP ── */}
      <header style={{ background: '#FFFFFF', borderBottom: '1px solid #E7E2D6', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100, fontFamily: 'Inter, sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png" alt="KINGA" style={{ height: '28px', width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
          <div style={{ width: '1px', height: '22px', background: '#C8C4BA' }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#15201A', letterSpacing: '-0.01em' }}>Executive Dashboard</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button title="Notifications" style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', cursor: 'pointer', color: '#6B7568', background: 'none', border: 'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </button>
        </div>
      </header>
      {/* ── DARK GREEN HERO BAND ── */}
      <section style={{
        background: `linear-gradient(155deg, ${G.g900} 0%, ${G.g700} 100%)`,
        borderBottom: `2px solid ${G.gold600}`,
        padding: '20px 24px 0',
      }}>
        {/* Hero top row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '4px' }}>
              KINGA · Executive
            </div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              Portfolio Overview
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '3px' }}>
              Live · Updated just now · {isDemo ? 'Demo Mode' : 'Live Data'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <button style={{ padding: '7px 14px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', background: 'transparent', color: 'rgba(255,255,255,0.8)', fontSize: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Activity className="h-3 w-3" />
              Refresh
            </button>
            <button style={{ padding: '7px 14px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', background: 'transparent', color: 'rgba(255,255,255,0.8)', fontSize: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileText className="h-3 w-3" />
              Q2 2024
            </button>
            <button style={{ padding: '7px 16px', border: 'none', borderRadius: '6px', background: '#B8923A', color: '#FFFFFF', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileText className="h-3 w-3" />
              Board Report
            </button>
          </div>
        </div>
        {/* KPI grid — 6 columns, white-on-dark */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px 8px 0 0', overflow: 'hidden', marginTop: '4px' }}>
          {[
            { label: 'Total Claims Value', value: execSummaryLoading ? '…' : (() => { const s = (execSummary as any)?.roiBreakdown?.totalEstimated ?? 0; return s > 0 ? `${currencySymbol} ${(s/100/1000).toFixed(0)}K` : '—'; })(), delta: '', up: true, headline: true },
            { label: 'Active Claims', value: execSummaryLoading ? '…' : ((effectiveExecSummary?.totalClaims ?? kpis?.totalClaims ?? 0) > 0 ? (effectiveExecSummary?.totalClaims ?? kpis?.totalClaims ?? 0).toLocaleString() : '—'), delta: 'Open claims', up: null },
            { label: 'KINGA Savings', value: execSummaryLoading ? '…' : (() => { const s = effectiveExecSummary?.totalSavings ?? 0; return s > 0 ? `${currencySymbol} ${(s/100/1000).toFixed(0)}K` : '—'; })(), delta: '', up: true },
            { label: 'Resolution Rate', value: execSummaryLoading ? '…' : (() => { const r = effectiveExecSummary?.resolutionRate ?? 0; return r > 0 ? `${r.toFixed(0)}%` : '—'; })(), delta: '', up: true },
            { label: 'Avg Cycle Time', value: execSummaryLoading ? '…' : (() => { const d = effectiveExecSummary?.avgCycleDays ?? 0; return d > 0 ? `${d.toFixed(1)}d` : '—'; })(), delta: '', up: true },
            { label: 'SLA Compliance', value: (() => { const rate = kpis?.completionRate ?? 0; return rate > 0 ? `${Math.min(100, Math.round(rate))}%` : '—'; })(), delta: '', up: false },
          ].map((kpi, i) => (
            <div key={i} style={{ padding: '14px 16px 16px', borderRight: i < 5 ? '1px solid rgba(255,255,255,0.1)' : 'none', position: 'relative' }}>
              {kpi.headline && <div style={{ position: 'absolute', top: 0, left: '16px', right: '16px', height: '2px', background: G.gold600, borderRadius: '0 0 2px 2px' }} />}
              <div style={{ fontSize: '10px', fontWeight: 500, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '6px' }}>{kpi.label}</div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: kpi.headline ? G.gold300 : '#FFFFFF', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{kpi.value}</div>
              <div style={{ fontSize: '11px', marginTop: '4px', color: kpi.up === true ? '#6EE7A0' : kpi.up === false ? '#FCA5A5' : 'rgba(255,255,255,0.35)' }}>{kpi.delta}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          TAB BAR + ALERT BAR — full-width, no max-width wrapper
      ═══════════════════════════════════════════════════════ */}
      <div style={{ background: G.card, borderBottom: `1px solid ${G.line}`, padding: '0 24px', display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto' }}>
        {([
          { value: 'overview', label: 'Overview' },
          { value: 'operational-health', label: 'Operational Health' },
          { value: 'roi-breakdown', label: 'ROI & Financials' },
          { value: 'notifications', label: 'Notifications', badge: true },
          { value: 'reports', label: 'Executive Report' },
        ] as const).map(tab => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            style={{ padding: '12px 16px', fontSize: '13px', fontWeight: activeTab === tab.value ? 600 : 500, color: activeTab === tab.value ? G.g700 : G.muted, cursor: 'pointer', borderBottom: `2px solid ${activeTab === tab.value ? G.g700 : 'transparent'}`, marginBottom: '-1px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', background: 'none', border: 'none', borderBottomStyle: 'solid', borderBottomWidth: '2px', borderBottomColor: activeTab === tab.value ? G.g700 : 'transparent', fontFamily: 'inherit' }}
          >
            {tab.badge ? <NotificationsTabBadge /> : tab.label}
          </button>
        ))}
      </div>

      {/* Alert bar */}
      <div style={{ background: G.card, borderBottom: `1px solid ${G.line}`, padding: '0 24px', display: 'flex', alignItems: 'stretch', gap: 0, minHeight: '40px' }}>
        <div onClick={() => setActiveTab('overview')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px 8px 12px', borderLeft: `3px solid ${G.red}`, borderRight: `1px solid ${G.line}`, fontSize: '12px', cursor: 'pointer' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: G.red, fontVariantNumeric: 'tabular-nums' }}>{slaBreach}</span>
          <span style={{ color: G.muted }}>claims breaching SLA</span>
        </div>
        <div onClick={() => setActiveTab('overview')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px 8px 12px', borderLeft: `3px solid ${G.red}`, borderRight: `1px solid ${G.line}`, fontSize: '12px', cursor: 'pointer' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: G.red, fontVariantNumeric: 'tabular-nums' }}>{fraudFlags}</span>
          <span style={{ color: G.muted }}>fraud flags requiring executive sign-off</span>
        </div>
        <div onClick={() => setActiveTab('overview')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px 8px 12px', borderLeft: `3px solid ${G.amber}`, borderRight: `1px solid ${G.line}`, fontSize: '12px', cursor: 'pointer' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: G.amber, fontVariantNumeric: 'tabular-nums' }}>{highRisk}</span>
          <span style={{ color: G.muted }}>high-risk claims in AI review</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', padding: '0 0 0 16px' }}>
          <button onClick={() => setActiveTab('overview')} style={{ fontSize: '12px', fontWeight: 500, color: G.g600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '4px' }}>
            View escalation queue
            <AlertCircle className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* ── TAB CONTENT ── */}
      <div className="px-6 pb-12">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-0">
          {/* invisible TabsList needed for Tabs component to work */}
          <TabsList className="hidden">
            {([
              { value: 'overview', label: 'Overview' },
              { value: 'operational-health', label: 'Operational Health' },
              { value: 'roi-breakdown', label: 'ROI & Financials' },
              { value: 'notifications', label: 'Notifications', badge: true },
                { value: 'reports', label: 'Executive Report' },
              ] as const).map(tab => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="rounded-none border-b-2 px-5 py-3 text-sm font-medium transition-colors"
                  style={{
                    borderBottomColor: activeTab === tab.value ? '#1C5C39' : 'transparent',
                    color: activeTab === tab.value ? '#1C5C39' : '#6B7280',
                    background: 'transparent',
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: activeTab === tab.value ? 600 : 400,
                    letterSpacing: '-0.005em',
                  }}
                                >
                  {tab.badge ? <NotificationsTabBadge /> : tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          {/* ── Tab 1: Overview ── */}
          <TabsContent value="overview">
            {/* ══ PROTOTYPE-EXACT 3-COLUMN GRID BODY ══
                Row 1: Claims Ageing (span-2, with Fraud Funnel below) | Escalation Queue
                Row 2: Period Comparison | Cost Savings Trend | AI Confidence Doughnut
                Row 3: Global Claim Search (span-2) | Fast-Track Analytics
            */}
            <div style={{ padding: '20px 0', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>

              {/* ── Row 1 Col 1-2: Claims Ageing + Fraud Funnel ── */}
              <div style={{ gridColumn: 'span 2', background: '#FFFFFF', border: '1px solid #E7E2D6', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #E7E2D6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#15201A', letterSpacing: '-0.01em' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: '5px', background: '#E7F1EA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1C5C39' }}>
                      <Clock className="h-3 w-3" />
                    </div>
                    Claims Ageing — Operational Pulse
                  </div>
                  <button style={{ padding: '5px 10px', border: '1px solid #E7E2D6', borderRadius: '6px', background: 'transparent', color: '#6B7568', fontSize: '11px', fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>View all</button>
                </div>
                <div style={{ padding: '16px' }}>
                  <ClaimsAgeingPanel compact />
                </div>
                {/* Fraud Detection Funnel embedded below ageing chart */}
                <div style={{ borderTop: '1px solid #E7E2D6', padding: '12px 16px 4px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#9AA293', marginBottom: '10px' }}>Fraud Detection Funnel</div>
                  <FraudInvestigationFunnel compact />
                </div>
              </div>

              {/* ── Row 1 Col 3: Escalation Queue ── */}
              <div style={{ background: '#FFFFFF', border: '1px solid #E7E2D6', borderRadius: '10px', overflow: 'hidden' }}>
                <ExecutiveEscalationQueue />
              </div>

              {/* ── Row 2 Col 1: Period Comparison ── */}
              <div style={{ background: '#FFFFFF', border: '1px solid #E7E2D6', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #E7E2D6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#15201A' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: '5px', background: '#E7F1EA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1C5C39' }}>
                      <Activity className="h-3 w-3" />
                    </div>
                    Period Comparison
                  </div>
                  <button style={{ padding: '5px 10px', border: '1px solid #E7E2D6', borderRadius: '6px', background: 'transparent', color: '#6B7568', fontSize: '11px', fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Q1 vs Q2</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                  {monthComparisonItems.slice(0, 4).map((item: any, i: number) => {
                    const delta = item.current - item.prior;
                    const pct = item.prior > 0 ? ((delta / item.prior) * 100).toFixed(1) : '0.0';
                    const isPositive = item.higherIsBetter ? delta >= 0 : delta <= 0;
                    const arrowUp = delta > 0;
                    const displayCurrent = item.isCurrency ? `${currencySymbol}${(item.current/1000).toFixed(0)}k` : `${item.current}${item.unit || ''}`;
                    const displayPrior = item.isCurrency ? `${currencySymbol}${(item.prior/1000).toFixed(0)}k` : `${item.prior}${item.unit || ''}`;
                    const isLastRow = i >= 2;
                    const isRightCol = i % 2 === 1;
                    return (
                      <div key={item.label} style={{ padding: '14px 16px', borderRight: isRightCol ? 'none' : '1px solid #E7E2D6', borderBottom: isLastRow ? 'none' : '1px solid #E7E2D6' }}>
                        <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#9AA293', marginBottom: '6px' }}>{item.label}</div>
                        <div style={{ fontSize: '20px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', color: '#15201A' }}>{displayCurrent}</div>
                        <div style={{ fontSize: '11px', marginTop: '3px', color: isPositive ? '#237049' : '#B1402F' }}>{arrowUp ? '↑' : '↓'} {Math.abs(parseFloat(pct))}% vs {displayPrior}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Row 2 Col 2: Cost Savings Trend ── */}
              <div style={{ background: '#FFFFFF', border: '1px solid #E7E2D6', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #E7E2D6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#15201A' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: '5px', background: '#E7F1EA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1C5C39' }}>
                      <TrendingUp className="h-3 w-3" />
                    </div>
                    Cost Savings Trend
                  </div>
                </div>
                <div style={{ padding: '16px', height: '180px' }}>
                  {savingsTrends && savingsTrends.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={savingsTrends}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E7E2D6" />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7568', fontFamily: 'Inter' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#6B7568', fontFamily: 'Inter' }} />
                        <Tooltip contentStyle={{ fontFamily: 'Inter', fontSize: 11, background: '#15201A', border: 'none', borderRadius: '6px', color: '#fff', padding: '8px' }} />
                        <Line type="monotone" dataKey="savings" stroke="#B8923A" strokeWidth={2} dot={{ fill: '#B8923A', r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9AA293', fontSize: '12px' }}>No savings data available yet</div>
                  )}
                </div>
              </div>

              {/* ── Row 2 Col 3: AI Confidence Distribution (Doughnut) ── */}
              <div style={{ background: '#FFFFFF', border: '1px solid #E7E2D6', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #E7E2D6', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#15201A' }}>
                  <div style={{ width: '22px', height: '22px', borderRadius: '5px', background: '#E7F1EA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1C5C39' }}>
                    <Shield className="h-3 w-3" />
                  </div>
                  AI Confidence Distribution
                </div>
                <div style={{ padding: '16px', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
                  {/* Doughnut via recharts */}
                  <div style={{ position: 'relative', width: '130px', height: '130px', flexShrink: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[
                        { name: 'Auto-approved', value: kpis?.lowRiskCount || 0, fill: '#2E8557' },
                        { name: 'Escalated', value: kpis?.mediumRiskCount || 0, fill: '#A6730B' },
                        { name: 'Fraud flagged', value: kpis?.highRiskCount || 0, fill: '#B1402F' },
                        { name: 'Pending', value: kpis?.pendingCount || 0, fill: '#D8D2C2' },
                      ]} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" hide />
                        <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                          {[{ fill: '#2E8557' }, { fill: '#A6730B' }, { fill: '#B1402F' }, { fill: '#D8D2C2' }].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: '#15201A', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{kpis?.aiAccuracy ? `${kpis.aiAccuracy}%` : '—'}</div>
                      <div style={{ fontSize: '10px', color: '#6B7568' }}>accuracy</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    {[
                      { color: '#2E8557', label: 'Auto-approved', count: kpis?.lowRiskCount || 0 },
                      { color: '#A6730B', label: 'Escalated', count: kpis?.mediumRiskCount || 0 },
                      { color: '#B1402F', label: 'Fraud flagged', count: kpis?.highRiskCount || 0 },
                      { color: '#D8D2C2', label: 'Pending review', count: kpis?.pendingCount || 0 },
                    ].map(item => (
                      <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '9px', height: '9px', borderRadius: '2px', background: item.color, flexShrink: 0 }} />
                        <span style={{ fontSize: '11px', color: '#6B7568' }}>{item.label}</span>
                        <span style={{ fontSize: '12px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', marginLeft: 'auto', color: '#15201A' }}>{item.count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Row 3 Col 1-2: Global Claim Search ── */}
              <div style={{ gridColumn: 'span 2', background: '#FFFFFF', border: '1px solid #E7E2D6', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #E7E2D6', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#15201A' }}>
                  <div style={{ width: '22px', height: '22px', borderRadius: '5px', background: '#E7F1EA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1C5C39' }}>
                    <Search className="h-3 w-3" />
                  </div>
                  Global Claim Search
                </div>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #E7E2D6', display: 'flex', gap: '8px' }}>
                  <Input
                    placeholder="Search by claim ID, claimant name, vehicle registration, assessor…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    style={{ flex: 1, fontSize: '13px', fontFamily: 'Inter', border: '1px solid #E7E2D6', borderRadius: '6px' }}
                  />
                  <button onClick={handleSearch} disabled={searchLoading} style={{ padding: '5px 14px', border: '1px solid #E7E2D6', borderRadius: '6px', background: 'transparent', color: '#6B7568', fontSize: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {searchLoading ? <Activity className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />} Search
                  </button>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Claim ID','Claimant','Vehicle','Status','Assessor','Value','Age'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#9AA293', borderBottom: '1px solid #E7E2D6', background: '#F7F8F6' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults?.claims?.length > 0 ? searchResults.claims.slice(0,4).map((claim: any) => (
                      <tr key={claim.id} style={{ cursor: 'pointer' }} onClick={() => setLocation(`/insurer/claims/${claim.id}`)}>
                        <td style={{ padding: '10px 12px', fontSize: '12.5px', borderBottom: '1px solid #E7E2D6', fontFamily: 'JetBrains Mono, monospace', color: '#1C5C39', fontWeight: 500 }}>KGA-{String(claim.id).padStart(7,'0')}</td>
                        <td style={{ padding: '10px 12px', fontSize: '12.5px', borderBottom: '1px solid #E7E2D6', color: '#15201A' }}>{claim.claimantName || '—'}</td>
                        <td style={{ padding: '10px 12px', fontSize: '12px', borderBottom: '1px solid #E7E2D6', color: '#6B7568' }}>{claim.vehicleReg || '—'}</td>
                        <td style={{ padding: '10px 12px', fontSize: '12.5px', borderBottom: '1px solid #E7E2D6' }}><span style={{ background: claim.status === 'fraud_flag' ? '#F8E9E4' : '#E7F1EA', color: claim.status === 'fraud_flag' ? '#B1402F' : '#1C5C39', padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{(claim.status || '').replace(/_/g,' ')}</span></td>
                        <td style={{ padding: '10px 12px', fontSize: '12px', borderBottom: '1px solid #E7E2D6', color: '#6B7568' }}>{claim.assessorName || '—'}</td>
                        <td style={{ padding: '10px 12px', fontSize: '12.5px', borderBottom: '1px solid #E7E2D6', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{claim.estimatedValue ? `${currencySymbol} ${(claim.estimatedValue/100).toLocaleString()}` : '—'}</td>
                        <td style={{ padding: '10px 12px', fontSize: '12px', borderBottom: '1px solid #E7E2D6', color: '#6B7568', fontVariantNumeric: 'tabular-nums' }}>{claim.ageDays != null ? `${claim.ageDays}d` : '—'}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={7} style={{ padding: '24px 12px', textAlign: 'center', fontSize: '13px', color: '#9AA293' }}>Use the search box above to find claims</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* ── Row 3 Col 3: Fast-Track Analytics ── */}
              <div style={{ background: '#FFFFFF', border: '1px solid #E7E2D6', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #E7E2D6', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#15201A' }}>
                  <div style={{ width: '22px', height: '22px', borderRadius: '5px', background: '#E7F1EA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1C5C39' }}>
                    <Zap className="h-3 w-3" />
                  </div>
                  Fast-Track Analytics
                </div>
                <div style={{ padding: '16px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#9AA293' }}>No throughput data yet</span>
                </div>
                <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { label: 'Fast-tracked today', value: kpis?.fastTrackCount || '—', color: '#1C5C39' },
                    { label: 'Avg fast-track time', value: '—', color: '#15201A' },
                    { label: 'Savings vs standard', value: '—', color: '#237049' },
                  ].map(item => (
                    <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: '#6B7568' }}>{item.label}</span>
                      <span style={{ fontSize: '13px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: item.color }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>{/* end 3-col grid */}

            {/* ── Alert Bar (below grid, as in prototype) ── */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E7E2D6', borderRadius: '10px', overflow: 'hidden', marginTop: '0' }}>
              <ExecutiveAlertsCenter />
            </div>

            {/* SECTION DIVIDER — legacy sections hidden, kept for reference */}
            <div style={{ display: 'none' }}>
            {/* ── Section B: Period Comparison ── */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-base font-semibold" style={{ color: 'var(--foreground)', fontFamily: 'Inter, sans-serif' }}>Period Comparison</h2>
                <span className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Month-on-month movement</span>
              </div>
            <div
              className="rounded-xl p-4"
              style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold" style={{ color: 'var(--muted-foreground)' }}>
                  {monthComparisonLabel}
                </p>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: 'var(--fp-info-bg)', color: 'var(--info)' }}
                >
                  Month-on-Month
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {monthComparisonItems.map((item) => {
                  const delta = item.current - item.prior;
                  const pct = item.prior > 0 ? ((delta / item.prior) * 100).toFixed(1) : "0.0";
                  const isPositive = item.higherIsBetter ? delta >= 0 : delta <= 0;
                  const arrowUp = delta > 0;
                  const displayCurrent = item.isCurrency
                    ? `${currencySymbol}${(item.current / 1000).toFixed(0)}k`
                    : `${item.current}${item.unit ? item.unit : ''}`;
                  const displayPrior = item.isCurrency
                    ? `${currencySymbol}${(item.prior / 1000).toFixed(0)}k`
                    : `${item.prior}${item.unit ? item.unit : ''}`;
                  return (
                    <div
                      key={item.label}
                      className="rounded-lg px-3 py-3 flex flex-col gap-1"
                      style={{ background: '#F7F8F6', border: '1px solid #E5E7EB' }}
                    >
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--muted-foreground)' }}>{item.label}</p>
                      <p className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>{displayCurrent}</p>
                      <div className="flex items-center gap-1">
                        {arrowUp
                          ? <TrendingUp className="h-3 w-3" style={{ color: isPositive ? 'var(--success)' : 'var(--chart-4)' }} />
                          : <TrendingDown className="h-3 w-3" style={{ color: isPositive ? 'var(--success)' : 'var(--chart-4)' }} />
                        }
                        <span
                          className="text-xs font-semibold"
                          style={{ color: isPositive ? 'var(--success)' : 'var(--chart-4)' }}
                        >
                          {arrowUp ? '+' : ''}{pct}%
                        </span>
                        <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>vs {displayPrior}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            </section>

            {/* ── Section C: Performance Trends ── */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-base font-semibold" style={{ color: 'var(--foreground)', fontFamily: 'Inter, sans-serif' }}>Performance Trends</h2>
                <span className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Savings · Risk distribution</span>
              </div>
            {/* Chart row: Savings Trend + Fast-Track Analytics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card style={{ border: '1px solid #E5E7EB', boxShadow: 'none', background: '#FFFFFF' }}>
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
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="savings" stroke="#B8860B" strokeWidth={3} dot={{ fill: '#B8860B', r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center py-12" style={{ color: 'var(--muted-foreground)' }}>No savings data available yet</p>
                  )}
                </CardContent>
              </Card>

              <Card style={{ border: '1px solid #E5E7EB', boxShadow: 'none', background: '#FFFFFF' }}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gauge className="h-5 w-5" style={{ color: 'var(--info)' }} />
                    KINGA Confidence Distribution
                  </CardTitle>
                  <CardDescription>Risk classification across all assessed claims</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-center mb-4">
                    <div className="rounded-xl p-4" style={{ background: '#F0FAF4', border: '1px solid #BBE8C8' }}>
                      <p className="text-3xl font-bold" style={{ color: 'var(--success)' }}>{kpis?.lowRiskCount || 0}</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>Low Risk</p>
                    </div>
                    <div className="rounded-xl p-4" style={{ background: '#FEF9EC', border: '1px solid #F5D97A' }}>
                      <p className="text-3xl font-bold" style={{ color: 'var(--warning)' }}>{kpis?.mediumRiskCount || 0}</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>Medium Risk</p>
                    </div>
                    <div className="rounded-xl p-4" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
                      <p className="text-3xl font-bold" style={{ color: 'var(--chart-4)' }}>{kpis?.highRiskCount || 0}</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>High Risk</p>
                    </div>
                  </div>
                  <ConfidenceGauge score={kpis?.avgConfidenceScore || 35} />
                </CardContent>
              </Card>
            </div>
            </section>

            {/* ── Section D: Search & Deep Analytics ── */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-base font-semibold" style={{ color: 'var(--foreground)', fontFamily: 'Inter, sans-serif' }}>Search & Deep Analytics</h2>
                <span className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Global search · Fast-track analytics</span>
              </div>
            {/* Global Search */}
            <Card style={{ border: '1px solid #E5E7EB', boxShadow: 'none', background: '#FFFFFF' }}>
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
                              <div className="p-3 rounded-lg hover:opacity-80 transition-opacity cursor-pointer" style={{ background: '#F7F8F6' }}>
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
                <h2 className="text-base font-semibold" style={{ color: 'var(--foreground)', fontFamily: 'Inter, sans-serif' }}>Fast-Track Analytics</h2>
                <AnalyticsExportButton tenantId="default-tenant" variant="outline" size="sm" />
              </div>
              <ExecutiveAnalyticsCharts />
            </div>
            </section>
            </div>{/* end hidden legacy sections */}
          </TabsContent>

          {/* ── Tab 2: Operational Health ── */}
          <TabsContent value="operational-health" className="space-y-8">

            {/* ── Section A: Governance ── */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-base font-semibold" style={{ color: 'var(--foreground)', fontFamily: 'Inter, sans-serif' }}>Governance</h2>
                <span className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Compliance indicators</span>
              </div>
            {/* Governance Summary — executive-level KPI snapshot */}
            <Card style={{ border: '1px solid #E5E7EB', boxShadow: 'none', background: '#FFFFFF' }}>
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
                    <p className="text-sm font-medium mt-1" style={{ color: 'var(--foreground)' }}>KINGA Override Rate</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>KINGA decisions overridden by staff</p>
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

            </section>

            {/* ── Section B: Workflow & Team Performance ── */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-base font-semibold" style={{ color: 'var(--foreground)', fontFamily: 'Inter, sans-serif' }}>Workflow & Team Performance</h2>
                <span className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Bottlenecks · Assessors · Panel beaters</span>
              </div>
            {/* Workflow Bottleneck */}
            <Card style={{ border: '1px solid #E5E7EB', boxShadow: 'none', background: '#FFFFFF' }}>
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
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
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
              <Card style={{ border: '1px solid #E5E7EB', boxShadow: 'none', background: '#FFFFFF' }}>
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
                        <div key={assessor.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: '#F7F8F6' }}>
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

              <Card style={{ border: '1px solid #E5E7EB', boxShadow: 'none', background: '#FFFFFF' }}>
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
                        <div key={beater.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: '#F7F8F6' }}>
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
            </section>
          </TabsContent>

          {/* ── Tab 3: ROI Breakdown ── */}
          <TabsContent value="roi-breakdown" className="space-y-6">
            {/* Financial Overview: 4 big numbers */}
            <Card style={{ border: '1px solid #E5E7EB', boxShadow: 'none', background: '#FFFFFF' }}>
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
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-5">
                    {[
                      { label: 'Total Payouts', value: `$${(financials.totalPayouts || 0).toLocaleString()}`, sub: 'Approved claims paid', color: 'var(--info)' },
                      { label: 'Total Reserves', value: `$${(financials.totalReserves || 0).toLocaleString()}`, sub: 'Pending claims estimated', color: 'var(--warning)' },
                      { label: 'Fraud Prevented', value: `$${(financials.fraudPrevented || 0).toLocaleString()}`, sub: 'High-risk claims rejected', color: 'var(--success)' },
                      { label: 'Net Exposure', value: `$${(financials.netExposure || 0).toLocaleString()}`, sub: 'Reserves minus recovered', color: 'var(--chart-5)' },
                      { label: 'Leakage', value: `$${(financials.leakage || 0).toLocaleString()}`, sub: 'Paid above KINGA estimate', color: 'var(--destructive)' },
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
            <Card style={{ border: '1px solid #E5E7EB', boxShadow: 'none', background: '#FFFFFF' }}>
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

          {/* ── Tab 6: Executive Report ── */}
          <TabsContent value="reports" className="mt-6">
            <ExecutiveReportTab />
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
