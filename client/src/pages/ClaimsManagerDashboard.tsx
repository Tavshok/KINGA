// @ts-nocheck
import { useState, useEffect, useMemo } from "react";
import { SLADeadlineChip } from "@/components/portal/SLADeadlineChip";
import { trpc } from "@/lib/trpc";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  FileCheck, CheckCircle, Eye, MessageSquare, AlertCircle,
  ClipboardList, ArrowRight, Clock, Shield, ChevronLeft, ChevronRight, Filter, FileSpreadsheet,
  RefreshCw, AlertTriangle, Activity, Download, Search, TrendingUp, TrendingDown
} from "lucide-react";
import { RiskBadge, AiAssessButton } from "@/components/ClaimRiskIndicators";
import { ClaimReviewDialog } from "@/components/ClaimReviewDialog";
import { exportClaimsToExcel } from "@/lib/export-excel";
import { KingaReportButton } from "@/components/KingaReportButton";
import { Link, useSearch } from "wouter";
import { IntakeQueueTab } from "@/components/IntakeQueueTab";
import { ClaimCurrencySelector } from "@/components/ClaimCurrencySelector";
import { NotificationsInbox } from "@/components/NotificationsInbox";
import { FleetManagerApprovalsTab } from "@/components/FleetManagerApprovalsTab";
import { WorkloadDistributionPanel } from "@/components/WorkloadDistributionPanel";
import { ReportReadinessBadge } from "@/components/ReportReadinessBadge";

// ── Design tokens (mirrors prototype CSS variables) ──────────────────────────
const G = {
  g950: '#0B2E1C', g900: '#103A23', g800: '#154A2E', g700: '#1C5C39',
  g600: '#237049', g500: '#2E8557', g100: '#E7F1EA',
  gold600: '#B8923A', gold300: '#E3CD8F',
  ink: '#15201A', muted: '#6B7568', muted2: '#9AA293',
  line: '#E7E2D6', card: '#FFFFFF', bodyBg: '#F7F8F6',
  red: '#B1402F', redSoft: '#F8E9E4', amber: '#A6730B', amberSoft: '#F8EFDD',
};

// ── C-04: Claims Ageing Intelligence Panel ──────────────────────────────────
function ClaimsAgeingPanel() {
  const { data, isLoading } = trpc.analytics.getClaimsAgeing.useQuery();
  const buckets = data?.buckets ?? [];
  const totalOpen = buckets.reduce((sum, b) => sum + b.count, 0);
  const oldest = buckets[3]; // 30+ days bucket
  if (isLoading || totalOpen === 0) return null;
  return (
    <div style={{
      marginTop: '8px', padding: '12px 16px',
      background: 'rgba(255,255,255,0.06)', borderRadius: '6px',
      border: '1px solid rgba(255,255,255,0.1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Clock style={{ width: '13px', height: '13px', color: G.gold300 }} />
          <span style={{ fontSize: '11px', fontWeight: 600, color: G.gold300, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Claims Ageing</span>
        </div>
        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>{totalOpen} open claims</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
        {buckets.map((bucket, i) => {
          const pct = totalOpen > 0 ? Math.round((bucket.count / totalOpen) * 100) : 0;
          const isAlert = i >= 2 && bucket.count > 0; // 15-30 and 30+ are warning
          const isCritical = i === 3 && bucket.count > 0; // 30+ is critical
          return (
            <div key={i} style={{
              background: isCritical ? 'rgba(177,64,47,0.2)' : isAlert ? 'rgba(166,115,11,0.15)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${isCritical ? 'rgba(177,64,47,0.4)' : isAlert ? 'rgba(166,115,11,0.3)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: '4px', padding: '8px 10px',
            }}>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', marginBottom: '4px' }}>{bucket.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '22px', fontWeight: 700, color: isCritical ? '#FCA5A5' : isAlert ? '#FCD34D' : '#FFFFFF', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                  {bucket.count}
                </span>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>{pct}%</span>
              </div>
              <div style={{ marginTop: '4px', height: '3px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: isCritical ? '#EF4444' : isAlert ? '#F59E0B' : '#10B981', borderRadius: '2px', transition: 'width 0.3s ease' }} />
              </div>
            </div>
          );
        })}
      </div>
      {oldest && oldest.count > 0 && (
        <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', background: 'rgba(177,64,47,0.15)', borderRadius: '4px' }}>
          <AlertTriangle style={{ width: '12px', height: '12px', color: '#FCA5A5', flexShrink: 0 }} />
          <span style={{ fontSize: '11px', color: '#FCA5A5' }}>
            {oldest.count} claim{oldest.count !== 1 ? 's' : ''} open for 30+ days — requires immediate management attention
          </span>
        </div>
      )}
    </div>
  );
}

// ── Status chip helper ────────────────────────────────────────────────────────
function StatusChip({ status }: { status: string }) {
  const s = (status ?? '').toLowerCase().replace(/_/g, ' ');
  let bg = '#F3F4F6', color = '#6B7280';
  if (s.includes('flagged') || s.includes('fraud')) { bg = G.redSoft; color = G.red; }
  else if (s.includes('review')) { bg = '#EFF6FF'; color = '#1D4ED8'; }
  else if (s.includes('pending') || s.includes('intake')) { bg = G.amberSoft; color = G.amber; }
  else if (s.includes('approved') || s.includes('completed') || s.includes('closed')) { bg = G.g100; color = G.g600; }
  return (
    <span style={{ background: bg, color, padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap' }}>
      {s}
    </span>
  );
}

// ── Risk bar helper ───────────────────────────────────────────────────────────
function RiskBar({ score }: { score: number | null }) {
  const s = score ?? 0;
  const fill = s >= 70 ? G.red : s >= 40 ? G.amber : G.g500;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ flex: 1, height: '4px', background: '#E5E7EB', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ width: `${s}%`, height: '100%', background: fill, borderRadius: '2px' }} />
      </div>
      <span style={{ fontSize: '11px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: fill, width: '24px', textAlign: 'right' }}>{s}</span>
    </div>
  );
}

export default function ClaimsManagerDashboard() {
  const { fmt } = useTenantCurrency();
  const [selectedClaim, setSelectedClaim] = useState<any>(null);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showSendBackDialog, setShowSendBackDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showEscalateDialog, setShowEscalateDialog] = useState(false);
  const [showReopenDialog, setShowReopenDialog] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenDisputeType, setReopenDisputeType] = useState<"new_evidence" | "claimant_dispute" | "insurer_error" | "legal_requirement" | "other">("claimant_dispute");
  const [closureNotes, setClosureNotes] = useState("");
  const [closureAction, setClosureAction] = useState("approve_for_payment");
  const [sendBackComments, setSendBackComments] = useState("");
  const [sendBackTarget, setSendBackTarget] = useState("risk_manager");
  const [sendBackReason, setSendBackReason] = useState("");
  const [escalationReason, setEscalationReason] = useState<"fraud_concern" | "high_value_dispute" | "policy_interpretation" | "third_party_dispute" | "legal_threat" | "other">("fraud_concern");
  const [escalationNotes, setEscalationNotes] = useState("");
  const [escalationTargetState, setEscalationTargetState] = useState<"disputed" | "manual_review">("manual_review");
  const [comparisonData, setComparisonData] = useState<any>(null);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Tab state — synced with ?tab= query param
  const searchStr = useSearch();
  const [activeTab, setActiveTab] = useState(() => new URLSearchParams(searchStr).get("tab") ?? "all");
  useEffect(() => {
    const tab = new URLSearchParams(searchStr).get("tab") ?? "all";
    setActiveTab(tab);
  }, [searchStr]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);

  // Analytics date range
  const [analyticsFrom] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0];
  });
  const [analyticsTo] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: aiAssessment } = trpc.aiAssessments.byClaim.useQuery(
    { claimId: selectedClaim?.id || 0 },
    { enabled: !!selectedClaim }
  );
  const { data: assessorEval } = trpc.assessorEvaluations.byClaim.useQuery(
    { claimId: selectedClaim?.id || 0 },
    { enabled: !!selectedClaim }
  );
  const { data: quotes } = trpc.quotes.byClaim.useQuery(
    { claimId: selectedClaim?.id || 0 },
    { enabled: !!selectedClaim }
  );

  useEffect(() => {
    if (selectedClaim && aiAssessment) {
      const ci = typeof aiAssessment.costIntelligenceJson === 'string'
        ? (() => { try { return JSON.parse(aiAssessment.costIntelligenceJson); } catch { return null; } })()
        : aiAssessment.costIntelligenceJson ?? null;
      const l2 = ci?.compositeOptimisation?.l2CompositeOptimisedCostUsd ?? null;
      const aiCost = l2 ?? (aiAssessment.estimatedCost ? aiAssessment.estimatedCost : null);
      const assessorCost = assessorEval?.estimatedRepairCost ? assessorEval.estimatedRepairCost : null;
      const avgQuoteCost = quotes && quotes.length > 0
        ? quotes.reduce((sum: number, q: any) => sum + (q.quotedAmount || 0), 0) / quotes.length
        : null;
      const calculateVariance = (v1: number | null, v2: number | null) => {
        if (!v1 || !v2) return null;
        return ((v1 - v2) / v2) * 100;
      };
      setComparisonData({
        aiCost, assessorCost, avgQuoteCost,
        aiVsAssessor: calculateVariance(assessorCost, aiCost),
        quotesVsAi: calculateVariance(avgQuoteCost, aiCost),
        fraudRisk: aiAssessment.fraudRiskLevel,
        quoteCount: quotes?.length || 0,
      });
    }
  }, [selectedClaim, aiAssessment, assessorEval, quotes]);

  const { data: reviewQueueData, isLoading: queueLoading, error: reviewQueueError, refetch: refetchQueue } =
    trpc.claims.byStatus.useQuery({ status: "financial_decision" });
  const reviewQueue = reviewQueueData || [];

  const { data: assessedClaims, isLoading: assessedLoading, error: assessedClaimsError, refetch: refetchAssessed } =
    trpc.claims.byStatus.useQuery({ status: "comparison" });

  const { data: managerOverview, isLoading: overviewLoading, error: overviewError } =
    trpc.claims.getManagerOverview.useQuery({ from: analyticsFrom, to: analyticsTo });

  const { data: activeClaimsData, isLoading: activeClaimsLoading, error: activeClaimsError } =
    trpc.claims.getActiveClaims.useQuery({ from: analyticsFrom, to: analyticsTo });
  const activeClaims = activeClaimsData ?? [];

  const { data: fraudAlertsData, isLoading: fraudAlertsLoading, error: fraudAlertsError } =
    trpc.claims.getFraudAlerts.useQuery({ from: analyticsFrom, to: analyticsTo });
  const fraudAlerts = fraudAlertsData ?? [];

  const { data: dashboardStatsRaw, isLoading: dashboardStatsLoading, error: dashboardStatsError } =
    trpc.claims.getDashboardStats.useQuery({ from: analyticsFrom, to: analyticsTo });
  const dashboardStats: any = dashboardStatsRaw ?? null;

  const { data: completedClaims, isLoading: completedLoading, error: completedClaimsError, refetch: refetchCompleted } =
    trpc.claims.byStatus.useQuery({ status: "completed" });
  const { data: closedClaims, error: closedClaimsError } = trpc.claims.byStatus.useQuery({ status: "closed" });
  const { data: rejectedClaims, error: rejectedClaimsError } = trpc.claims.byStatus.useQuery({ status: "rejected" });

  const processedClaims = useMemo(() => {
    const raw = [
      ...(completedClaims || []),
      ...(closedClaims || []),
      ...(rejectedClaims || []),
    ].sort((a: any, b: any) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime());
    return raw;
  }, [completedClaims, closedClaims, rejectedClaims]);

  const allReviewableClaims = useMemo(() => {
    const raw = [...(reviewQueue || []), ...(assessedClaims || [])];
    const unique = raw.filter((c, i, s) => i === s.findIndex(x => x.id === c.id));
    return unique;
  }, [reviewQueue, assessedClaims]);

  // ── All claims for the "All Claims" tab ───────────────────────────────────
  const allClaims = useMemo(() => {
    const combined = [
      ...(activeClaims || []),
      ...(allReviewableClaims || []),
      ...(processedClaims || []),
    ];
    const unique = combined.filter((c, i, s) => i === s.findIndex(x => x.id === c.id));
    return unique;
  }, [activeClaims, allReviewableClaims, processedClaims]);

  const claimsDataLoading = queueLoading || assessedLoading || activeClaimsLoading || completedLoading;
  const claimsDataUnavailable = Boolean(
    reviewQueueError || assessedClaimsError || activeClaimsError || completedClaimsError || closedClaimsError || rejectedClaimsError
  );
  const summaryLoading = overviewLoading || dashboardStatsLoading;
  const summaryUnavailable = Boolean(overviewError || dashboardStatsError);
  const noClaimsYet = !claimsDataLoading && !claimsDataUnavailable && allClaims.length === 0;

  // ── Tab-filtered claims ───────────────────────────────────────────────────
  const tabClaims = useMemo(() => {
    switch (activeTab) {
      case 'all': return allClaims;
      case 'intake': return activeClaims.filter((c: any) => ['intake', 'pending', 'new'].some(s => (c.workflowState ?? c.status ?? '').toLowerCase().includes(s)));
      case 'review': return allReviewableClaims;
      case 'fraud': return fraudAlerts;
      case 'sla': return allClaims.filter((c: any) => {
        if (!c.createdAt) return false;
        const ageHours = (Date.now() - new Date(c.createdAt).getTime()) / 3600000;
        return ageHours > 48;
      });
      case 'completed': return processedClaims;
      default: return allClaims;
    }
  }, [activeTab, allClaims, activeClaims, allReviewableClaims, fraudAlerts, processedClaims]);

  // ── Search filter ─────────────────────────────────────────────────────────
  const filteredClaims = useMemo(() => {
    let list = tabClaims;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((c: any) =>
        (c.claimNumber ?? '').toLowerCase().includes(q) ||
        (c.claimantName ?? '').toLowerCase().includes(q) ||
        (c.vehicleRegistration ?? '').toLowerCase().includes(q) ||
        (c.vehicleMake ?? '').toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      list = list.filter((c: any) => (c.status ?? '').toLowerCase() === statusFilter);
    }
    return list;
  }, [tabClaims, searchQuery, statusFilter]);

  const totalPages = Math.ceil(filteredClaims.length / pageSize);
  const paginatedClaims = filteredClaims.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => { setCurrentPage(1); }, [activeTab, searchQuery, statusFilter]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const closeForProcessing = trpc.claims.closeForProcessing.useMutation({
    onSuccess: () => {
      toast.success("Claim Closed for Processing");
      setShowCloseDialog(false); setSelectedClaim(null); setClosureNotes("");
      refetchQueue(); refetchAssessed();
    },
    onError: (e: any) => toast.error("Error", { description: e.message }),
  });

  const escalateClaimMutation = trpc.claims.escalateClaim.useMutation({
    onSuccess: () => {
      toast.success("Claim Escalated");
      setShowEscalateDialog(false); setSelectedClaim(null); setEscalationNotes("");
      refetchQueue(); refetchAssessed();
    },
    onError: (e: any) => toast.error("Escalation Failed", { description: e.message }),
  });

  const sendBackClaim = trpc.claims.sendBackClaim.useMutation({
    onSuccess: () => {
      toast.success("Claim Sent Back");
      setShowSendBackDialog(false); setSelectedClaim(null); setSendBackComments("");
      refetchQueue(); refetchAssessed();
    },
    onError: (e: any) => toast.error("Error", { description: e.message }),
  });

  const reopenClaimMutation = trpc.claims.reopenClaim.useMutation({
    onSuccess: () => {
      toast.success("Claim Reopened");
      setShowReopenDialog(false); setSelectedClaim(null); setReopenReason("");
      refetchQueue(); refetchAssessed();
    },
    onError: (e: any) => toast.error("Reopen Failed", { description: e.message }),
  });

  const addComment = trpc.comments.addComment.useMutation({
    onError: (err: any) => console.error('[ClaimsManager] Failed to add comment:', err?.message),
  });

  const handleClose = (claim: any) => { setSelectedClaim(claim); setShowCloseDialog(true); };
  const handleSendBack = (claim: any) => { setSelectedClaim(claim); setShowSendBackDialog(true); };
  const handleViewDetails = (claim: any) => { setSelectedClaim(claim); setShowDetailsDialog(true); };
  const handleReopen = (claim: any) => { setSelectedClaim(claim); setShowReopenDialog(true); };

  const handleSubmitClosure = async () => {
    if (!selectedClaim) return;
    if (closureNotes) {
      await addComment.mutateAsync({ claimId: selectedClaim.id, content: `Claims Manager Review: ${closureAction} | Notes: ${closureNotes}` });
    }
    closeForProcessing.mutate({ claimId: selectedClaim.id, closureReason: closureNotes || `Claim closed for processing — action: ${closureAction}` });
  };

  const handleSubmitSendBack = async () => {
    if (!selectedClaim || !sendBackComments) {
      toast.error("Please provide comments explaining why the claim is being sent back.");
      return;
    }
    await addComment.mutateAsync({ claimId: selectedClaim.id, content: `SENT BACK BY CLAIMS MANAGER: ${sendBackComments}` });
    sendBackClaim.mutate({ claimId: selectedClaim.id, comments: sendBackComments, targetRole: sendBackTarget as "risk_manager" | "claims_processor" });
  };

  const handleExportToExcel = () => {
    if (filteredClaims.length === 0) { toast.error("No claims to export"); return; }
    const exportData = filteredClaims.map((claim: any) => ({
      claimNumber: claim.claimNumber, vehicleRegistration: claim.vehicleRegistration,
      vehicleMake: claim.vehicleMake, vehicleModel: claim.vehicleModel,
      policyNumber: claim.policyNumber, status: claim.status,
      workflowState: claim.workflowState, fraudRiskScore: claim.fraudRiskScore,
      estimatedCost: claim.estimatedCost, approvedAmount: claim.approvedAmount ?? null,
      createdAt: claim.createdAt ? new Date(claim.createdAt) : null,
      incidentDate: claim.incidentDate ? new Date(claim.incidentDate) : null,
      incidentType: claim.incidentType, technicalApprovalStatus: claim.technicalApprovalStatus,
    }));
    exportClaimsToExcel(exportData, 'claims-manager-review-queue');
    toast.success(`Exported ${exportData.length} claims to Excel`);
  };

  // ── KPI values ────────────────────────────────────────────────────────────
  const kpiUnavailable = summaryUnavailable ? 'Unavailable' : undefined;
  const kpiActive = summaryLoading ? '…' : (kpiUnavailable ?? managerOverview?.kpis?.activeClaims?.value ?? dashboardStats?.activeClaims ?? 0);
  const kpiPending = summaryLoading ? '…' : (kpiUnavailable ?? dashboardStats?.pendingIntake ?? 0);
  const kpiAvgDays = summaryLoading ? '…' : (kpiUnavailable ?? `${Number(dashboardStats?.avgProcessingDays ?? 0).toFixed(1)}d`);
  const kpiFraud = summaryLoading ? '…' : (kpiUnavailable ?? `${Number(dashboardStats?.fraudRate ?? 0)}%`);
  const kpiCompleted = summaryLoading ? '…' : (kpiUnavailable ?? managerOverview?.kpis?.completedClaims?.value ?? dashboardStats?.completedThisMonth ?? 0);
  const kpiSLA = summaryLoading ? '…' : (kpiUnavailable ?? `${Number(dashboardStats?.slaCompliance ?? 0)}%`);
  const summaryStateLabel = summaryUnavailable
    ? 'Data unavailable'
    : summaryLoading || claimsDataLoading
      ? 'Loading tenant data…'
      : noClaimsYet
        ? 'No claims yet'
        : 'Live tenant data';

  const fraudFlagCount = fraudAlerts.filter((c: any) => (c.fraudRiskScore ?? 0) >= 70 || c.fraudRiskLevel === 'high' || c.fraudRiskLevel === 'critical').length;
  const slaBreachCount = allClaims.filter((c: any) => {
    if (!c.createdAt) return false;
    return (Date.now() - new Date(c.createdAt).getTime()) / 3600000 > 72;
  }).length;

  // ── Tab definitions ───────────────────────────────────────────────────────
  const TABS = [
    { id: 'all', label: 'All Claims', count: allClaims.length },
    { id: 'intake', label: 'Pending Intake', count: kpiPending },
    { id: 'review', label: 'Under Review', count: allReviewableClaims.length },
    { id: 'fraud', label: 'KINGA Flagged', count: fraudFlagCount, alert: true },
    { id: 'sla', label: 'SLA Watch', count: slaBreachCount, alert: slaBreachCount > 0 },
    { id: 'fleet-approvals', label: 'Fleet Approvals', count: null },
    { id: 'completed', label: 'Completed', count: null },
  ];

  return (
    <div style={{ minHeight: '100vh', background: G.bodyBg, fontFamily: 'Inter, sans-serif' }}>

      {/* ── WHITE IDENTITY STRIP ── */}
      <header style={{ background: '#FFFFFF', borderBottom: '1px solid #E7E2D6', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100, fontFamily: 'Inter, sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png" alt="KINGA" style={{ height: '28px', width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
          <div style={{ width: '1px', height: '22px', background: '#C8C4BA' }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#15201A', letterSpacing: '-0.01em' }}>Claims Manager</span>
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
              KINGA · Claims Manager
            </div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              Claims Overview
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '3px' }}>
              {summaryStateLabel}{!summaryUnavailable && !summaryLoading && ` · ${allClaims.length} total claims`}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <button
              onClick={handleExportToExcel}
              style={{
                padding: '7px 14px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px',
                background: 'transparent', color: 'rgba(255,255,255,0.8)', fontSize: '12px', fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
            <KingaReportButton
              reportKey="portfolio.claims_summary"
              label="Export Report"
              variant="outline"
              size="sm"
              style={{
                padding: '7px 16px', border: 'none', borderRadius: '6px',
                background: G.gold600, color: '#FFFFFF', fontSize: '12px', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px',
              }}
            />
          </div>
        </div>

        {/* KPI grid — 6 columns, white-on-dark */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)',
          border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px 8px 0 0',
          overflow: 'hidden', marginTop: '4px',
        }}>
          {[
            { label: 'Active Claims', value: kpiActive, delta: summaryStateLabel, deltaUp: null, headline: true },
            { label: 'Pending Intake', value: kpiPending, delta: summaryStateLabel, deltaUp: null },
            { label: 'Under Review', value: summaryUnavailable ? 'Unavailable' : allReviewableClaims.length, delta: summaryStateLabel, deltaUp: null },
            { label: 'Avg Resolution', value: kpiAvgDays, delta: summaryStateLabel, deltaUp: null },
            { label: 'Fraud Detection', value: kpiFraud, delta: summaryStateLabel, deltaUp: null },
            { label: 'SLA Compliance', value: kpiSLA, delta: summaryStateLabel, deltaUp: null },
          ].map((kpi, i) => (
            <div key={i} style={{
              padding: '14px 16px 16px',
              borderRight: i < 5 ? '1px solid rgba(255,255,255,0.1)' : 'none',
              position: 'relative',
            }}>
              {kpi.headline && (
                <div style={{ position: 'absolute', top: 0, left: '16px', right: '16px', height: '2px', background: G.gold600, borderRadius: '0 0 2px 2px' }} />
              )}
              <div style={{ fontSize: '10px', fontWeight: 500, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '6px' }}>
                {kpi.label}
              </div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: kpi.headline ? G.gold300 : '#FFFFFF', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {kpi.value}
              </div>
              <div style={{ fontSize: '11px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '3px', color: kpi.deltaUp === true ? '#6EE7A0' : kpi.deltaUp === false ? '#FCA5A5' : 'rgba(255,255,255,0.35)' }}>
                {kpi.deltaUp === true && <TrendingUp className="h-2.5 w-2.5" />}
                {kpi.deltaUp === false && <TrendingDown className="h-2.5 w-2.5" />}
                {kpi.delta}
              </div>
            </div>
          )          )}
        </div>

        {/* C-04: Claims Ageing Intelligence Panel */}
        <ClaimsAgeingPanel />
      </section>

      {/* ═══════════════════════════════════════════════════════
          LAYER 2 — TAB BAR
      ═══════════════════════════════════════════════════════ */}
      <nav style={{ background: G.card, borderBottom: `1px solid ${G.line}`, padding: '0 24px', display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto' }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '12px 16px', fontSize: '13px', fontWeight: isActive ? 600 : 500,
                color: isActive ? G.g700 : G.muted, cursor: 'pointer',
                borderBottom: `2px solid ${isActive ? G.g700 : 'transparent'}`,
                marginBottom: '-1px', display: 'flex', alignItems: 'center', gap: '6px',
                whiteSpace: 'nowrap', background: 'none', border: 'none',
                borderBottomStyle: 'solid', borderBottomWidth: '2px',
                borderBottomColor: isActive ? G.g700 : 'transparent',
                fontFamily: 'inherit',
              }}
            >
              {tab.label}
              {tab.count !== null && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: '18px', height: '18px', padding: '0 5px', borderRadius: '9px',
                  fontSize: '10px', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                  background: tab.alert ? G.redSoft : isActive ? G.g700 : G.g100,
                  color: tab.alert ? G.red : isActive ? '#FFFFFF' : G.g700,
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ═══════════════════════════════════════════════════════
          LAYER 3 — ALERT BAR
      ═══════════════════════════════════════════════════════ */}
      {(fraudFlagCount > 0 || slaBreachCount > 0) && (
        <div style={{ background: G.card, borderBottom: `1px solid ${G.line}`, padding: '0 24px', display: 'flex', alignItems: 'stretch', gap: 0, minHeight: '40px' }}>
          {fraudFlagCount > 0 && (
            <div
              onClick={() => setActiveTab('fraud')}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px 8px 12px', borderLeft: `3px solid ${G.red}`, borderRight: `1px solid ${G.line}`, fontSize: '12px', cursor: 'pointer' }}
            >
              <AlertCircle className="h-3.5 w-3.5" style={{ color: G.red }} />
              <span style={{ fontSize: '13px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: G.red }}>{fraudFlagCount}</span>
              <span style={{ color: G.muted }}>critical fraud flags require immediate review</span>
            </div>
          )}
          {slaBreachCount > 0 && (
            <div
              onClick={() => setActiveTab('sla')}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px 8px 12px', borderLeft: `3px solid ${G.amber}`, borderRight: `1px solid ${G.line}`, fontSize: '12px', cursor: 'pointer' }}
            >
              <AlertTriangle className="h-3.5 w-3.5" style={{ color: G.amber }} />
              <span style={{ fontSize: '13px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: G.amber }}>{slaBreachCount}</span>
              <span style={{ color: G.muted }}>claims breaching SLA — escalation pending</span>
            </div>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', padding: '0 0 0 16px' }}>
            <button
              onClick={() => setActiveTab('sla')}
              style={{ fontSize: '12px', fontWeight: 500, color: G.g600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              View escalation queue
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          LAYER 4 — BODY CONTENT (2-column: main + sidebar)
      ═══════════════════════════════════════════════════════ */}
      <main style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px', alignItems: 'start' }}>

        {/* ── Main column: Claims table ── */}
        <div>
          {/* Special tab content for Intake, Fleet, Workload, Notifications */}
          {activeTab === 'intake' ? (
            <div style={{ background: G.card, border: `1px solid ${G.line}`, borderRadius: '8px', overflow: 'hidden' }}>
              <IntakeQueueTab />
            </div>
          ) : activeTab === 'fleet-approvals' ? (
            <div style={{ background: G.card, border: `1px solid ${G.line}`, borderRadius: '8px', overflow: 'hidden' }}>
              <FleetManagerApprovalsTab />
            </div>
          ) : activeTab === 'workload' ? (
            <div style={{ background: G.card, border: `1px solid ${G.line}`, borderRadius: '8px', overflow: 'hidden' }}>
              <WorkloadDistributionPanel />
            </div>
          ) : activeTab === 'notifications' ? (
            <div style={{ background: G.card, border: `1px solid ${G.line}`, borderRadius: '8px', overflow: 'hidden' }}>
              <NotificationsInbox />
            </div>
          ) : (
            <div style={{ background: G.card, border: `1px solid ${G.line}`, borderRadius: '8px', overflow: 'hidden' }}>
              {/* Filter bar */}
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${G.line}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search className="h-3 w-3" style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: G.muted2 }} />
                  <input
                    type="text"
                    placeholder="Search by claim ID, claimant, vehicle…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%', height: '32px', padding: '0 10px 0 28px',
                      border: `1px solid ${G.line}`, borderRadius: '5px',
                      fontFamily: 'inherit', fontSize: '12px', color: G.ink,
                      background: G.bodyBg, outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  style={{ height: '32px', padding: '0 8px', border: `1px solid ${G.line}`, borderRadius: '5px', fontFamily: 'inherit', fontSize: '12px', color: G.muted, background: G.bodyBg, outline: 'none', cursor: 'pointer' }}
                >
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="comparison">Under Review</option>
                  <option value="financial_decision">KINGA Flagged</option>
                  <option value="completed">Approved</option>
                </select>
                <select
                  style={{ height: '32px', padding: '0 8px', border: `1px solid ${G.line}`, borderRadius: '5px', fontFamily: 'inherit', fontSize: '12px', color: G.muted, background: G.bodyBg, outline: 'none', cursor: 'pointer' }}
                >
                  <option>All assessors</option>
                </select>
                <button
                  style={{ height: '32px', padding: '0 12px', border: `1px solid ${G.line}`, borderRadius: '5px', background: G.bodyBg, color: G.muted, fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  <Filter className="h-3 w-3" />
                  Filters
                </button>
              </div>

              {/* Claims table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: G.bodyBg }}>
                      {['Claim ID', 'Claimant', 'Vehicle', 'Submitted', 'Status', 'Risk Score', 'Assessor', ''].map((h, i) => (
                        <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: G.muted2, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${G.line}`, whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {claimsDataLoading ? (
                      <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: G.muted, fontSize: '13px' }}>Loading claims…</td></tr>
                    ) : claimsDataUnavailable ? (
                      <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: G.red, fontSize: '13px' }}>Claims data is unavailable. Please retry or contact support.</td></tr>
                    ) : paginatedClaims.length === 0 ? (
                      <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: G.muted, fontSize: '13px' }}>{noClaimsYet ? 'No claims yet' : 'No claims match the selected filters'}</td></tr>
                    ) : paginatedClaims.map((claim: any) => (
                      <tr
                        key={claim.id}
                        style={{ borderBottom: `1px solid ${G.line}`, cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = G.bodyBg)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '10px 12px', fontSize: '12.5px', fontFamily: 'JetBrains Mono, monospace', color: G.g700, fontWeight: 500 }}>
                          {claim.claimNumber ?? `#${claim.id}`}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '12.5px', color: G.ink }}>
                          {claim.claimantName ?? '—'}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '12px', color: G.muted }}>
                          {[claim.vehicleMake, claim.vehicleModel].filter(Boolean).join(' ') || '—'}
                          {claim.vehicleRegistration && <span style={{ display: 'block', fontSize: '11px', color: G.muted2 }}>{claim.vehicleRegistration}</span>}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '12px', color: G.muted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          {claim.createdAt ? new Date(claim.createdAt).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <StatusChip status={claim.workflowState ?? claim.status ?? 'pending'} />
                        </td>
                        <td style={{ padding: '10px 12px', minWidth: '100px' }}>
                          <RiskBar score={claim.fraudRiskScore ?? null} />
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '12px', color: claim.assessorName ? G.ink : G.muted2 }}>
                          {claim.assessorName ?? 'Unassigned'}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <button
                            onClick={() => { setSelectedClaim(claim); setShowReviewDialog(true); }}
                            style={{ width: '24px', height: '24px', border: `1px solid ${G.line}`, borderRadius: '4px', background: G.bodyBg, color: G.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 600 }}
                          >
                            ›
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination footer */}
              <div style={{ padding: '10px 16px', borderTop: `1px solid ${G.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: G.bodyBg }}>
                <span style={{ fontSize: '11px', color: G.muted }}>
                  {filteredClaims.length} claim{filteredClaims.length !== 1 ? 's' : ''}
                  {totalPages > 1 && ` · Page ${currentPage} of ${totalPages}`}
                </span>
                {totalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      style={{ width: '26px', height: '26px', borderRadius: '4px', border: `1px solid ${G.line}`, background: 'transparent', color: G.muted, fontSize: '11px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', opacity: currentPage === 1 ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      ‹
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const page = i + 1;
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          style={{ width: '26px', height: '26px', borderRadius: '4px', border: `1px solid ${currentPage === page ? G.g700 : G.line}`, background: currentPage === page ? G.g700 : 'transparent', color: currentPage === page ? '#FFFFFF' : G.muted, fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          {page}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      style={{ width: '26px', height: '26px', borderRadius: '4px', border: `1px solid ${G.line}`, background: 'transparent', color: G.muted, fontSize: '11px', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', opacity: currentPage === totalPages ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      ›
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Right sidebar ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Attention Required */}
          <div style={{ background: G.card, border: `1px solid ${G.line}`, borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${G.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: G.ink }}>
                <div style={{ width: '22px', height: '22px', borderRadius: '5px', background: G.redSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertCircle className="h-3 w-3" style={{ color: G.red }} />
                </div>
                Attention Required
              </div>
              <span style={{ fontSize: '11px', background: G.redSoft, color: G.red, padding: '2px 7px', borderRadius: '10px', fontWeight: 600 }}>
                {fraudFlagCount + slaBreachCount}
              </span>
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {fraudAlerts.slice(0, 5).map((claim: any, i: number) => {
                const severity = (claim.fraudRiskScore ?? 0) >= 80 ? 'critical' : (claim.fraudRiskScore ?? 0) >= 60 ? 'high' : 'medium';
                const dotColor = severity === 'critical' ? G.red : severity === 'high' ? G.amber : '#6B7280';
                return (
                  <li
                    key={claim.id ?? i}
                    onClick={() => { setSelectedClaim(claim); setShowReviewDialog(true); }}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 16px', borderBottom: `1px solid ${G.line}`, cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = G.bodyBg)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: dotColor, marginTop: '4px', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace', color: G.g700 }}>
                        {claim.claimNumber ?? `#${claim.id}`}
                      </div>
                      <div style={{ fontSize: '11.5px', color: G.ink, marginTop: '1px' }}>
                        {claim.fraudFlags?.[0] ?? `Risk score: ${claim.fraudRiskScore ?? '—'}`}
                      </div>
                      <div style={{ fontSize: '11px', color: G.muted2, marginTop: '2px' }}>
                        {claim.createdAt ? `${Math.round((Date.now() - new Date(claim.createdAt).getTime()) / 3600000)}h ago` : 'Recently'}
                      </div>
                    </div>
                    <span style={{
                      fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', flexShrink: 0,
                      background: severity === 'critical' ? G.redSoft : severity === 'high' ? G.amberSoft : '#F3F4F6',
                      color: severity === 'critical' ? G.red : severity === 'high' ? G.amber : '#6B7280',
                    }}>
                      {severity.charAt(0).toUpperCase() + severity.slice(1)}
                    </span>
                  </li>
                );
              })}
              {fraudAlertsLoading ? (
                <li style={{ padding: '16px', textAlign: 'center', color: G.muted2, fontSize: '12px' }}>Loading fraud alerts…</li>
              ) : fraudAlertsError ? (
                <li style={{ padding: '16px', textAlign: 'center', color: G.red, fontSize: '12px' }}>Fraud alert data is unavailable</li>
              ) : fraudAlerts.length === 0 && (
                <li style={{ padding: '16px', textAlign: 'center', color: G.muted2, fontSize: '12px' }}>No fraud alerts for this tenant</li>
              )}
            </ul>
          </div>

          {/* Weekly Intake chart */}
          <div style={{ background: G.card, border: `1px solid ${G.line}`, borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${G.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: G.ink }}>
                <div style={{ width: '22px', height: '22px', borderRadius: '5px', background: G.g100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Activity className="h-3 w-3" style={{ color: G.g600 }} />
                </div>
                Weekly Intake
              </div>
              <span style={{ fontSize: '11px', color: G.muted }}>Last 8 weeks</span>
            </div>
            <div style={{ padding: '12px 16px 16px', height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: G.muted, fontSize: '12px' }}>
              Weekly intake history is not available for this tenant yet.
            </div>
          </div>

          {/* SLA Performance */}
          <div style={{ background: G.card, border: `1px solid ${G.line}`, borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${G.line}`, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: G.ink }}>
              <div style={{ width: '22px', height: '22px', borderRadius: '5px', background: G.g100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Clock className="h-3 w-3" style={{ color: G.g600 }} />
              </div>
              SLA Performance
            </div>
            {dashboardStats ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                {[
                  { label: 'On Time', value: kpiSLA, sub: 'Reported SLA compliance', color: G.g600 },
                  { label: 'Breached', value: slaBreachCount, sub: `${allClaims.length > 0 ? ((slaBreachCount / allClaims.length) * 100).toFixed(1) : 0}% of active claims`, color: G.red },
                  { label: 'At Risk', value: '—', sub: 'No verified forecast available', color: G.amber },
                  { label: 'Avg. Days', value: kpiAvgDays, sub: 'Reported processing average', color: G.ink },
                ].map((tile, i) => (
                  <div key={i} style={{ padding: '12px 16px', borderRight: i % 2 === 0 ? `1px solid ${G.line}` : 'none', borderBottom: i < 2 ? `1px solid ${G.line}` : 'none' }}>
                    <div style={{ fontSize: '10px', fontWeight: 500, color: G.muted2, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '6px' }}>{tile.label}</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', color: tile.color }}>{tile.value}</div>
                    <div style={{ fontSize: '10.5px', color: G.muted, marginTop: '2px' }}>{tile.sub}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '22px 16px', textAlign: 'center', color: summaryUnavailable ? G.red : G.muted, fontSize: '12px' }}>
                {summaryUnavailable ? 'SLA data is unavailable' : summaryLoading ? 'Loading SLA data…' : 'No SLA data available'}
              </div>
            )}
            </div>
          </div>
      </main>

      {/* ═══════════════════════════════════════════════════════
          DIALOGS — preserved from original implementation
      ═══════════════════════════════════════════════════════ */}

      {/* Close for Processing Dialog */}
      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5" style={{ color: G.g500 }} />
              Close Claim for Processing
            </DialogTitle>
            <DialogDescription>
              {selectedClaim && <>Claim: <strong>{selectedClaim.claimNumber}</strong> — {selectedClaim.vehicleRegistration}</>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {comparisonData && (
              <div className="rounded-lg p-4 space-y-3" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                <h3 className="font-semibold text-sm" style={{ color: G.g700 }}>Assessment Summary</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white rounded p-2">
                    <p className="text-xs text-muted-foreground">KINGA Estimate</p>
                    <p className="text-lg font-bold" style={{ color: G.g600 }}>{comparisonData.aiCost ? fmt(comparisonData.aiCost * 100) : "N/A"}</p>
                  </div>
                  <div className="bg-white rounded p-2">
                    <p className="text-xs text-muted-foreground">Assessor</p>
                    <p className="text-lg font-bold text-green-700">{comparisonData.assessorCost ? fmt(comparisonData.assessorCost * 100) : "N/A"}</p>
                  </div>
                  <div className="bg-white rounded p-2">
                    <p className="text-xs text-muted-foreground">Avg Quote ({comparisonData.quoteCount})</p>
                    <p className="text-lg font-bold text-purple-700">{comparisonData.avgQuoteCost ? fmt(comparisonData.avgQuoteCost * 100) : "N/A"}</p>
                  </div>
                </div>
              </div>
            )}
            <ClaimCurrencySelector
              claimId={selectedClaim?.id}
              currentCurrency={selectedClaim?.currencyCode ?? "USD"}
              onSuccess={(code: string) => setSelectedClaim((prev: any) => prev ? { ...prev, currencyCode: code } : prev)}
            />
            <div className="space-y-2">
              <Label>Processing Action</Label>
              <Select value={closureAction} onValueChange={setClosureAction}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="approve_for_payment">Approve for Payment Settlement</SelectItem>
                  <SelectItem value="approve_for_repair">Approve for Repair Assignment</SelectItem>
                  <SelectItem value="close_no_action">Close — No Further Action Required</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="closureNotes">Review Notes (Optional)</Label>
              <Textarea id="closureNotes" value={closureNotes} onChange={e => setClosureNotes(e.target.value)} placeholder="Add any notes about your review and decision..." rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseDialog(false)}>Cancel</Button>
            <Button onClick={handleSubmitClosure} disabled={closeForProcessing.isPending} style={{ background: G.g700, color: '#FFFFFF' }}>
              {closeForProcessing.isPending ? "Processing..." : "Close for Processing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Back Dialog */}
      <Dialog open={showSendBackDialog} onOpenChange={setShowSendBackDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" style={{ color: G.amber }} />
              Send Claim Back for Review
            </DialogTitle>
            <DialogDescription>
              {selectedClaim && `Claim: ${selectedClaim.claimNumber} — ${selectedClaim.vehicleRegistration}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Send Back To</Label>
              <Select value={sendBackTarget} onValueChange={setSendBackTarget}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="risk_manager">Risk Manager — For re-assessment</SelectItem>
                  <SelectItem value="claims_processor">Claims Processor — For additional information</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reason for Return *</Label>
              <Select value={sendBackReason} onValueChange={setSendBackReason}>
                <SelectTrigger><SelectValue placeholder="Select a reason..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cost_variance">Cost Variance</SelectItem>
                  <SelectItem value="missing_documentation">Missing Documentation</SelectItem>
                  <SelectItem value="policy_interpretation">Policy Interpretation</SelectItem>
                  <SelectItem value="fraud_indicator">Fraud Indicator</SelectItem>
                  <SelectItem value="assessor_error">Assessor Error</SelectItem>
                  <SelectItem value="claimant_information">Claimant Information</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sendBackComments">Comments (Required) *</Label>
              <Textarea id="sendBackComments" value={sendBackComments} onChange={e => setSendBackComments(e.target.value)} placeholder="Explain what needs to be reviewed or corrected..." rows={6} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendBackDialog(false)}>Cancel</Button>
            <Button onClick={handleSubmitSendBack} disabled={sendBackClaim.isPending || !sendBackComments} variant="outline" style={{ borderColor: G.amber, color: G.amber }}>
              {sendBackClaim.isPending ? "Sending..." : "Send Back for Review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Escalate Claim Dialog */}
      <Dialog open={showEscalateDialog} onOpenChange={setShowEscalateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" style={{ color: G.red }} />
              Escalate Claim
            </DialogTitle>
            <DialogDescription>
              {selectedClaim && `Claim: ${selectedClaim.claimNumber} — ${selectedClaim.vehicleRegistration ?? ""}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Escalation Reason</Label>
              <Select value={escalationReason} onValueChange={(v: any) => setEscalationReason(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fraud_concern">Fraud Concern</SelectItem>
                  <SelectItem value="high_value_dispute">High Value Dispute</SelectItem>
                  <SelectItem value="policy_interpretation">Policy Interpretation Issue</SelectItem>
                  <SelectItem value="third_party_dispute">Third Party Dispute</SelectItem>
                  <SelectItem value="legal_threat">Legal Threat</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Target State</Label>
              <Select value={escalationTargetState} onValueChange={(v: any) => setEscalationTargetState(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual_review">Manual Review (Risk Manager)</SelectItem>
                  <SelectItem value="disputed">Disputed (Formal Dispute)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="escalationNotes">Escalation Notes <span className="text-red-500">*</span></Label>
              <Textarea id="escalationNotes" value={escalationNotes} onChange={e => setEscalationNotes(e.target.value)} placeholder="Describe the reason for escalation in detail (minimum 10 characters)..." rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEscalateDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!selectedClaim || escalationNotes.length < 10) { toast.error("Please provide escalation notes (minimum 10 characters)."); return; }
                escalateClaimMutation.mutate({ claimId: selectedClaim.id, escalationReason, escalationNotes, targetState: escalationTargetState });
              }}
              disabled={escalateClaimMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {escalateClaimMutation.isPending ? "Escalating..." : "Escalate Claim"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reopen Claim Dialog */}
      <Dialog open={showReopenDialog} onOpenChange={setShowReopenDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-orange-500" />
              Reopen Claim
            </DialogTitle>
            <DialogDescription>
              Reopen <strong>{selectedClaim?.claimNumber ?? `Claim #${selectedClaim?.id}`}</strong> and move it to Disputed status.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Dispute Type</Label>
              <Select value={reopenDisputeType} onValueChange={(v) => setReopenDisputeType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="claimant_dispute">Claimant Dispute</SelectItem>
                  <SelectItem value="new_evidence">New Evidence</SelectItem>
                  <SelectItem value="insurer_error">Insurer Error</SelectItem>
                  <SelectItem value="legal_requirement">Legal Requirement</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reason for Reopening *</Label>
              <Textarea placeholder="Describe the reason for reopening this claim (min 10 characters)..." value={reopenReason} onChange={e => setReopenReason(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReopenDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!selectedClaim || reopenReason.length < 10) { toast.error("Reason required", { description: "Please provide at least 10 characters." }); return; }
                reopenClaimMutation.mutate({ claimId: selectedClaim.id, reason: reopenReason, disputeType: reopenDisputeType });
              }}
              disabled={reopenClaimMutation.isPending || reopenReason.length < 10}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {reopenClaimMutation.isPending ? "Reopening..." : "Reopen Claim"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Comprehensive Review Dialog */}
      <ClaimReviewDialog
        claimId={selectedClaim?.id || null}
        open={showReviewDialog}
        onOpenChange={setShowReviewDialog}
      />
    </div>
  );
}
