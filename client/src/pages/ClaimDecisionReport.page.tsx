/**
 * ClaimDecisionReport.tsx
 *
 * KINGA Unified Decision Engine — replaces the section-based report.
 *
 * Layout:
 *   [Verdict Banner]
 *   [Critical Alerts]
 *   [What Happened — narrative]
 *   [Damage & Impact] | [Cost Decision]
 *   [Fraud & Risk Decision]
 *   [Collapsible Technical Data]
 *   [Action Bar]
 */

import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation, useSearch } from "wouter";
import { ReportChooser, type ReportView } from "@/components/ReportChooser";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle, CheckCircle, ChevronDown, ChevronUp,
  ArrowLeft, Shield, Zap, DollarSign, Car, FileText,
  TrendingUp, TrendingDown, Minus, RefreshCw, Printer, Code, GitCompareArrows,
  Lock, Unlock, Eye, Gavel, Download, AlertCircle, XCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { sanitiseField } from "@/lib/sanitise";
import { currencySymbol } from "@/lib/currency";
import { getKingaClaimsReportAudience } from "@/lib/reportAudience";
import {
  Phase3DecisionBox,
  DataCompletenessDashboard,
  ComponentHeatmap,
  CostComparisonChart,
  PhysicsConsistencyGauge,
  PhotoGallery,
  KINGAAuditTrail,
  runR7SanityChecks,
} from "@/components/Phase3ReportComponents";
import { ForensicAuditReport } from "@/components/ForensicAuditReport";
import { KingaClaimsReport } from "@/components/KingaClaimsReport";
import { ClaimDecisionReportStandardView } from "@/components/ClaimDecisionReportStandardView";
import {
  ReportPageHeader,
  ReportSectionDivider,
  ReportIntegritySeal,
  AdjusterSignOffPanel,
} from "@/components/Batch3ReportComponents";
// Removed: DecisionNarrativeView, ForensicAuditValidationPanel (pre-report panels removed)
import { MultiQuoteComparisonPanel } from "@/components/MultiQuoteComparisonPanel";
import ClaimsExplanationPanel from "@/components/ClaimsExplanationPanel";
import DecisionAuthorityPanel from "@/components/DecisionAuthorityPanel";
import EscalationRoutingPanel from "@/components/EscalationRoutingPanel";
import { PhysicsAnalysisChart } from "@/components/PhysicsAnalysisChart";
import { RepairIntelligencePanel } from "@/components/RepairIntelligencePanel";
import { RepairReplacePanel } from "@/components/RepairReplacePanel";
import { ClaimCommentThread } from "@/components/ClaimCommentThread";

import type { EnforcementResult } from './ClaimDecisionReport.sections';
import {
  CollapsibleTechnicalData,
  ConfidenceBreakdownPanel,
  CostDecision,
  CriticalAlerts,
  DamageImpact,
  FinalDecisionBanner,
  FraudRiskDecision,
  RuleTracePanel,
  VerdictBanner,
  WhatHappened,
} from './ClaimDecisionReport.sections';

export default function ClaimDecisionReport() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/insurer/claims/:id/verdict");
  const claimId = params?.id ? parseInt(params.id) : 0;

  // ── Pipeline polling: auto-refresh while re-assessment is running ──────────
  // Set to true when a re-assessment is triggered; cleared when pipeline completes.
  const [isPollingForPipeline, setIsPollingForPipeline] = useState(false);
  const pipelineTriggeredAtRef = useRef<number | null>(null);

  const { data: claim, isLoading: claimLoading } = trpc.claims.getById.useQuery(
    { id: claimId },
    {
      enabled: !!claimId,
      refetchInterval: isPollingForPipeline ? 5000 : false,
    }
  );
  const { data: aiAssessment, isLoading: aiLoading } = trpc.aiAssessments.byClaim.useQuery(
    { claimId },
    {
      enabled: !!claimId,
      refetchInterval: isPollingForPipeline ? 5000 : false,
    }
  );
  const { data: enforcement, isLoading: enforcementLoading } = trpc.aiAssessments.getEnforcement.useQuery(
    { claimId },
    {
      enabled: !!claimId,
      refetchInterval: isPollingForPipeline ? 5000 : false,
    }
  );

  // Stop polling when pipeline completes or times out (5 min max)
  useEffect(() => {
    if (!isPollingForPipeline) return;
    const processingStatus = (claim as any)?.documentProcessingStatus;
    const assessmentCompleted = (claim as any)?.aiAssessmentCompleted;
    const elapsed = pipelineTriggeredAtRef.current ? Date.now() - pipelineTriggeredAtRef.current : 0;
    const isDone =
      assessmentCompleted === 1 ||
      (processingStatus && processingStatus !== 'parsing') ||
      elapsed > 5 * 60 * 1000;
    if (isDone) {
      setIsPollingForPipeline(false);
      const succeeded = assessmentCompleted === 1 || (processingStatus && processingStatus !== 'parsing' && processingStatus !== 'failed');
      if (succeeded) {
        toast.success('Assessment complete', { description: 'The report has been updated with the latest results.' });
      } else if (processingStatus === 'failed') {
        toast.error('Assessment failed', { description: 'The pipeline did not complete. Check the Pipeline Confidence panel for details.' });
      }
    }
  }, [claim, isPollingForPipeline]);
  const { data: quotesWithItems = [], isLoading: quotesLoading } = trpc.quotes.getWithLineItems.useQuery(
    { claimId },
    { enabled: !!claimId, staleTime: 0, refetchOnMount: 'always' }
  );

  const { data: existingSignOff, refetch: refetchSignOff } = trpc.claims.getAdjusterSignOff.useQuery(
    { claimId },
    { enabled: !!claimId }
  );

  const utils = trpc.useUtils();
  // ── Snapshot auto-save: fires once when enforcement data first loads ───────
  const snapshotSaved = useRef(false);
  const saveSnapshotMutation = trpc.aiAssessments.saveSnapshot.useMutation();
  const { data: snapshotHistory = [] } = trpc.aiAssessments.getSnapshots.useQuery(
    { claimId: String(claimId) },
    { enabled: !!claimId }
  );
  const { data: latestSnapshot } = trpc.aiAssessments.getLatestSnapshot.useQuery(
    { claimId: String(claimId) },
    { enabled: !!claimId }
  );
  const [showSnapshotHistory, setShowSnapshotHistory] = useState(false);
  const [showSpecJson, setShowSpecJson] = useState(false);
  const [showReplay, setShowReplay] = useState(false);
  const [replayResult, setReplayResult] = useState<null | {
    original_verdict: string;
    new_verdict: string;
    changed: boolean;
    differences: Array<{ field: string; original: unknown; new: unknown }>;
    impact_analysis: string;
    replayed_at: string;
    original_snapshot_version: number;
    lifecycle_state?: string;
    is_final?: boolean;
    is_locked?: boolean;
  }>(null);

  // Lifecycle state
  const { data: lifecycle, refetch: refetchLifecycle } = trpc.aiAssessments.getLifecycle.useQuery(
    { claimId: String(claimId) },
    { enabled: !!claimId }
  );
  const isLocked = lifecycle?.is_locked ?? false;
  const isFinal = lifecycle?.is_final ?? false;
  const lifecycleState = (lifecycle?.lifecycle_state ?? 'DRAFT') as string;

  // Governance: reason dialog state
  const [reasonDialog, setReasonDialog] = useState<{
    open: boolean;
    action: 'REVIEWED' | 'FINALISED' | 'LOCKED' | null;
    finalDecisionChoice?: 'FINALISE_CLAIM' | 'REVIEW_REQUIRED' | 'ESCALATE_INVESTIGATION';
    reason: string;
    error: string;
  }>({
    open: false,
    action: null,
    reason: '',
    error: '',
  });
  const [showAuditLog, setShowAuditLog] = useState(false);
  // URL-driven report selection: ?report=standard|forensic
  const searchString = useSearch();
  const _searchParams = new URLSearchParams(searchString);
  const _initialReport = (_searchParams.get('report') === 'forensic' ? 'forensic' : 'standard') as ReportView;
  const [reportView, setReportView] = useState<ReportView>(_initialReport);
  const { data: auditLog = [], refetch: refetchAuditLog } = trpc.aiAssessments.getAuditLog.useQuery(
    { claimId: String(claimId) },
    { enabled: !!claimId && showAuditLog }
  );
  const [isExporting, setIsExporting] = useState(false);
  const [exportValidationErrors, setExportValidationErrors] = useState<Array<{check: string; passed: boolean; detail: string}> | null>(null);
  const [showExportValidation, setShowExportValidation] = useState(false);

  const downloadAuditExport = async () => {
    if (!claimId) return;
    setIsExporting(true);
    setExportValidationErrors(null);
    setShowExportValidation(false);
    try {
      const res = await fetch(`/api/claims/${encodeURIComponent(String(claimId))}/audit-export.json`);
      if (res.status === 422) {
        // Pre-export validation gate blocked the export
        const body = await res.json() as { export_allowed: boolean; reason: string; checks: Array<{check: string; passed: boolean; detail: string}> };
        setExportValidationErrors(body.checks);
        setShowExportValidation(true);
        toast.error('Export blocked — missing or inconsistent audit data', {
          description: 'See the validation details below the action bar.',
          duration: 6000,
        });
        return;
      }
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const payloadHash = res.headers.get('X-Payload-Hash');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-export-${claimId}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Audit export downloaded${payloadHash ? ` · SHA-256: ${payloadHash.slice(0, 12)}…` : ''}`);
    } catch (err) {
      console.error('[AuditExport] Download failed:', err);
      toast.error('Failed to download audit export');
    } finally {
      setIsExporting(false);
    }
  };

  // Helper: open reason dialog
  const openReasonDialog = (
    action: 'REVIEWED' | 'FINALISED' | 'LOCKED',
    finalDecisionChoice?: 'FINALISE_CLAIM' | 'REVIEW_REQUIRED' | 'ESCALATE_INVESTIGATION'
  ) => {
    setReasonDialog({ open: true, action, finalDecisionChoice, reason: '', error: '' });
  };

  const markReviewedMutation = trpc.aiAssessments.markReviewed.useMutation({
    onSuccess: (data) => {
      refetchLifecycle();
      refetchAuditLog();
      if (!data.action_allowed) {
        toast.error(`Governance blocked: ${data.validation_errors.join('; ')}`);
      } else {
        toast.success("Decision marked as Reviewed");
      }
    },
    onError: (err) => toast.error(`Failed to mark reviewed: ${err.message}`),
  });

  const finaliseDecisionMutation = trpc.aiAssessments.finaliseDecision.useMutation({
    onSuccess: (data) => {
      refetchLifecycle();
      refetchAuditLog();
      if (!data.action_allowed) {
        toast.error(`Governance blocked: ${data.validation_errors.join('; ')}`);
      } else {
        const overrideMsg = data.override_flag ? ' ⚠️ Override recorded.' : '';
        toast.success(`Decision FINALISED — Snapshot #${data.authoritative_snapshot_id} created.${overrideMsg}`);
      }
    },
    onError: (err) => toast.error(`Finalise failed: ${err.message}`),
  });

  const lockDecisionMutation = trpc.aiAssessments.lockDecision.useMutation({
    onSuccess: (data) => {
      refetchLifecycle();
      refetchAuditLog();
      if (!data.action_allowed) {
        toast.error(`Governance blocked: ${data.validation_errors.join('; ')}`);
      } else {
        toast.success("Claim LOCKED — This is now an immutable legal record");
      }
    },
    onError: (err) => toast.error(`Lock failed: ${err.message}`),
  });

  // Submit reason dialog
  const submitReasonDialog = () => {
    const { action, finalDecisionChoice, reason } = reasonDialog;
    if (!reason || reason.trim().length < 10) {
      setReasonDialog(d => ({ ...d, error: 'Reason must be at least 10 characters.' }));
      return;
    }
    const aiVerdictDecision = (enforcement as any)?.finalDecision?.decision as string | undefined;
    if (action === 'REVIEWED') {
      markReviewedMutation.mutate({ claimId: String(claimId), reason });
    } else if (action === 'FINALISED' && finalDecisionChoice) {
      finaliseDecisionMutation.mutate({
        claimId: String(claimId),
        finalDecisionChoice,
        reason,
        aiDecision: aiVerdictDecision,
      });
    } else if (action === 'LOCKED') {
      lockDecisionMutation.mutate({ claimId: String(claimId), reason });
    }
    setReasonDialog({ open: false, action: null, reason: '', error: '' });
  };

  const replayMutation = trpc.aiAssessments.replayDecision.useMutation({
    onSuccess: (data) => {
      setReplayResult(data);
      setShowReplay(true);
      refetchLifecycle();
      if (data.changed) {
        toast.warning(`Logic drift detected — ${data.differences.length} field(s) changed`);
      } else {
        toast.success("No drift detected — decision is consistent with current logic");
      }
    },
    onError: (err) => toast.error(`Replay failed: ${err.message}`),
  });

  useEffect(() => {
    if (!enforcement || !aiAssessment || snapshotSaved.current) return;
    snapshotSaved.current = true;
    const e = enforcement as EnforcementResult;
    const pe = e.physicsEstimate;
    const ce = (enforcement as any).costExtraction;
    const wf = (enforcement as any).weightedFraud;
    const fd = e.finalDecision;
    const cb = e.confidenceBreakdown;
    // estimatedCost is in dollars; quotedAmount is in cents (divide by 100)
    // Prefer _normalised.costs.totalUsd as the single source of truth
    const aiEstimateDollars = (aiAssessment as any)._normalised?.costs?.totalUsd ?? aiAssessment.estimatedCost ?? 0;
    const quotedDollars = (quotesWithItems as any[]).length > 0
      ? Math.max(...(quotesWithItems as any[]).map((q: any) => (q.quotedAmount ?? 0) / 100))
      : 0;
    const deviationPct = aiEstimateDollars > 0 && quotedDollars > 0
      ? ((quotedDollars - aiEstimateDollars) / aiEstimateDollars) * 100
      : 0;
    saveSnapshotMutation.mutate({
      claimId: String(claimId),
      verdict: {
        decision: fd?.decision ?? 'REVIEW_REQUIRED',
        primaryReason: fd?.primaryReason ?? 'Insufficient data for automatic decision',
        confidence: cb?.score ?? aiAssessment.confidenceScore ?? 0,
      },
      cost: {
        aiEstimate: Math.round(aiEstimateDollars * 100), // snapshot stores in cents for historical compat
        quoted: Math.round(quotedDollars * 100),
        deviationPercent: Math.round(deviationPct),
        fairRangeMin: ce?.fair_range?.min ?? Math.round(aiEstimateDollars * 0.85),
        fairRangeMax: ce?.fair_range?.max ?? Math.round(aiEstimateDollars * 1.15),
        verdict: ce?.verdict ?? 'FAIR',
      },
      fraud: {
        score: wf?.score ?? (aiAssessment as any).fraudRiskScore ?? 0,
        level: wf?.level ?? e.fraudLevelEnforced ?? 'minimal',
        contributions: wf?.contributions ?? [],
      },
      physics: {
        deltaV: pe?.deltaVKmh ?? 0,
        velocityRange: pe ? `${pe.velocityRangeKmh.min}–${pe.velocityRangeKmh.max} km/h` : 'Not calculated',
        energyKj: pe?.estimatedEnergyKj ?? 0,
        forceKn: pe?.estimatedForceKn ?? 0,
        estimated: pe?.estimated ?? false,
      },
      damage: {
        zones: e.directionFlag?.damageZones ?? [],
        severity: aiAssessment.structuralDamageSeverity ?? 'unknown',
        consistencyScore: e.consistencyFlag?.score ?? 0,
      },
      enforcementTrace: fd?.ruleTrace?.map((r: any) => ({
        rule: r.rule,
        value: r.value,
        threshold: r.threshold,
        triggered: r.triggered,
      })) ?? [],
      confidenceBreakdown: cb?.penalties?.map((p: any) => ({
        factor: p.reason,
        penalty: p.deduction,
      })) ?? [],
      dataQuality: {
        missingFields: (e.costBenchmark as any)?.missingFields ?? [],
        estimatedFields: pe ? ['velocity', 'force', 'energy'] : [],
        extractionConfidence: aiAssessment.confidenceScore ?? 0,
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enforcement, aiAssessment]);

  const reRunMutation = trpc.claims.triggerAiAssessment.useMutation({
    onSuccess: () => {
      // Start polling so the report auto-refreshes when the pipeline completes.
      // The pipeline deletes the old aiAssessments record first, so byClaim returns
      // null until the new record is written. The polling useEffect stops when
      // aiAssessmentCompleted flips to 1 or documentProcessingStatus changes.
      pipelineTriggeredAtRef.current = Date.now();
      setIsPollingForPipeline(true);
      // Invalidate cache so stale data is cleared immediately
      utils.claims.getById.invalidate({ id: claimId });
      utils.aiAssessments.byClaim.invalidate({ claimId });
      utils.aiAssessments.getEnforcement.invalidate({ claimId });
      toast.info("KINGA analysis running", {
        description: "The report will update automatically when the pipeline completes. This typically takes 2–4 minutes.",
        duration: 10000,
      });
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  // Auto-print when navigated from Comparison View with ?print=1
  useEffect(() => {
    if (!claim || !aiAssessment || !enforcement) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('print') === '1') {
      // Dismiss all active toasts immediately, then wait for the report to
      // fully render before triggering print. Programmatic dismissal is more
      // reliable than CSS display:none because Sonner uses position:fixed which
      // some print renderers handle outside the normal CSS cascade.
      toast.dismiss();
      const timer = setTimeout(() => {
        // Dismiss again in case any toasts were queued after the first dismiss
        toast.dismiss();
        window.print();
        // Clean the URL so refreshing doesn't re-trigger print
        const url = new URL(window.location.href);
        url.searchParams.delete('print');
        window.history.replaceState({}, '', url.pathname);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [claim, aiAssessment, enforcement]);

  // Print header data attributes — MUST be before any early returns (Rules of Hooks)
  // Priority chain: enforcement.kingaRef (KNG-TENANT...) > claim.claimNumber > claim.id
  useEffect(() => {
    if (!claim) return;
    const kingaRef = (enforcement as any)?.kingaRef ?? null;
    const claimNum = kingaRef ?? claim.claimNumber ?? String(claim.id) ?? "";
    const reportDate = new Date().toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
    document.documentElement.setAttribute("data-claim-number", claimNum);
    document.documentElement.setAttribute("data-report-date", reportDate);
    document.body.setAttribute("data-claim-number", claimNum);
    document.body.setAttribute("data-report-date", reportDate);
    return () => {
      document.documentElement.removeAttribute("data-claim-number");
      document.documentElement.removeAttribute("data-report-date");
      document.body.removeAttribute("data-claim-number");
      document.body.removeAttribute("data-report-date");
    };
  }, [claim, enforcement]);

  // Sync active report view to a data attribute so @media print CSS can hide the inactive report
  useEffect(() => {
    document.documentElement.setAttribute("data-report-type", reportView);
    document.body.setAttribute("data-report-type", reportView);
    return () => {
      document.documentElement.removeAttribute("data-report-type");
      document.body.removeAttribute("data-report-type");
    };
  }, [reportView]);

  const isLoading = claimLoading || aiLoading || enforcementLoading || quotesLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Loading decision report…</p>
        </div>
      </div>
    );
  }

  if (!claim || !aiAssessment || !enforcement) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)" }}>
        <div className="text-center max-w-sm">
          <p className="text-lg font-bold mb-2" style={{ color: "var(--foreground)" }}>
            {!aiAssessment ? "KINGA Assessment Pending" : "Claim Not Found"}
          </p>
          <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
            {!aiAssessment
              ? "The KINGA pipeline has not yet processed this claim. Trigger the assessment to generate the decision report."
              : "This claim could not be found or you do not have access."}
          </p>
          {claim && !aiAssessment && (
            <Button
              onClick={() => reRunMutation.mutate({ claimId })}
              disabled={reRunMutation.isPending}
            >
              {reRunMutation.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Running…</> : "Run KINGA Analysis"}
            </Button>
          )}
          <Button variant="ghost" className="mt-2" onClick={() => setLocation(`/insurer/claims/${claimId}/comparison`)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Full Report
          </Button>
        </div>
      </div>
    );
  }

  const vehicleTitle = [claim.vehicleMake, claim.vehicleModel, claim.vehicleYear].filter(Boolean).join(" ") || `Claim #${claim.claimNumber}`;

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      {/* v4.2 B3: Unified Report Page Header (replaces old top bar) — hidden in print */}
      <div className="no-print">
      <ReportPageHeader
        claim={claim}
        aiAssessment={aiAssessment}
        enforcement={enforcement}
        onBack={() => setLocation(`/insurer/claims/${claimId}/comparison`)}
        onReRun={() => reRunMutation.mutate({ claimId })}
        reRunPending={reRunMutation.isPending}
        isPolling={isPollingForPipeline}
      />
      </div>

      {/* Print-only header — visible only in @media print */}
      <div className="print-report-header" style={{ display: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #0D7377', paddingBottom: '8px', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '14pt', fontWeight: 700, color: '#0D7377' }}>KINGA</div>
            <div style={{ fontSize: '9pt', color: '#475569' }}>Forensic Claim Decision Report v4.2</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '9pt', color: '#475569' }}>
            <div>Claim: <strong>{claim.claimNumber ?? claim.id}</strong></div>
            <div>Report Date: {new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            <div>Vehicle: {vehicleTitle}</div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-3xl mx-auto px-4 py-6">

        {/* ── PIPELINE RUNNING banner — hidden in print ── */}
        {isPollingForPipeline && (
          <div className="no-print">
          <div className="mb-4 rounded-xl border-2 p-4 flex gap-3" style={{ borderColor: "var(--primary)", background: "var(--fp-info-bg)" }}>
            <div style={{ color: "var(--primary)", fontSize: "20px", marginTop: "2px" }}>⟳</div>
            <div>
              <div className="font-bold text-sm mb-1" style={{ color: "var(--primary)" }}>KINGA Analysis Running</div>
              <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                The pipeline is processing this claim. All 42 stages are running — extraction, physics analysis, fraud scoring, damage intelligence, and cost validation. The report will update automatically when complete (typically 2–4 minutes).
              </div>
              <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
                <div className="h-full rounded-full" style={{ background: "var(--primary)", width: "100%", animation: "progress-indeterminate 1.8s ease-in-out infinite" }} />
              </div>
            </div>
          </div>
          </div>
        )}

        {/* ── PIPELINE_INCOMPLETE banner — hidden in print ── */}
        {(() => {
          const summaryJson = (aiAssessment as any)?.pipelineExecutionSummaryJson;
          let summary: any = null;
          try { summary = summaryJson ? JSON.parse(summaryJson) : null; } catch {}
          if (summary?.status === 'PIPELINE_INCOMPLETE') {
            return (
              <div className="mb-4 rounded-xl border-2 border-red-500 bg-red-50 dark:bg-red-950/30 p-4 flex gap-3 no-print">
                <div className="text-red-600 text-xl mt-0.5">⛔</div>
                <div>
                  <div className="font-bold text-red-700 dark:text-red-400 text-sm mb-1">KINGA Assessment Incomplete — Manual Review Required</div>
                  <div className="text-red-600 dark:text-red-300 text-xs">{summary.reason ?? 'The KINGA pipeline did not complete successfully. This claim cannot be adjudicated using KINGA-generated data. An assessor must review the claim manually before any decision is recorded.'}</div>
                  {summary.missingComponents?.length > 0 && (
                    <div className="text-red-500 dark:text-red-400 text-xs mt-1">Missing: {summary.missingComponents.join(', ')}</div>
                  )}
                </div>
              </div>
            );
          }
          return null;
        })()}

        {/* ── IMPOSSIBILITY FLAGS banner — shown when engine detects logical/temporal/physical impossibilities ── */}
        {(() => {
          const flags: any[] = (enforcement as any)?._impossibilityFlags ?? [];
          if (!flags.length) return null;
          const criticalFlags = flags.filter((f: any) => f.severity === 'CRITICAL');
          const highFlags = flags.filter((f: any) => f.severity === 'HIGH');
          const borderColor = criticalFlags.length > 0 ? 'border-red-600' : 'border-amber-500';
          const bgColor = criticalFlags.length > 0 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-amber-50 dark:bg-amber-950/30';
          const icon = criticalFlags.length > 0 ? '🚫' : '⚠️';
          const titleColor = criticalFlags.length > 0 ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400';
          const bodyColor = criticalFlags.length > 0 ? 'text-red-600 dark:text-red-300' : 'text-amber-600 dark:text-amber-300';
          return (
            <div className={`mb-4 rounded-xl border-2 ${borderColor} ${bgColor} p-4 no-print`}>
              <div className="flex gap-3 mb-2">
                <div className="text-xl mt-0.5">{icon}</div>
                <div>
                  <div className={`font-bold text-sm mb-1 ${titleColor}`}>
                    Data Integrity Alert — {flags.length} Logical Impossibilit{flags.length === 1 ? 'y' : 'ies'} Detected
                  </div>
                  <div className={`text-xs ${bodyColor}`}>
                    KINGA has detected {criticalFlags.length > 0 ? `${criticalFlags.length} critical` : ''}{criticalFlags.length > 0 && highFlags.length > 0 ? ' and ' : ''}{highFlags.length > 0 ? `${highFlags.length} high-severity` : ''} data impossibilit{flags.length === 1 ? 'y' : 'ies'} that a senior adjuster would flag on first review. This claim must not be processed until these issues are resolved.
                  </div>
                </div>
              </div>
              <div className="ml-8 space-y-2">
                {flags.map((f: any, i: number) => (
                  <div key={i} className="border-l-2 border-current pl-3">
                    <div className={`text-xs font-semibold ${f.severity === 'CRITICAL' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
                      [{f.code}] {f.title} <span className="font-normal opacity-70">({f.severity})</span>
                    </div>
                    <div className={`text-xs mt-0.5 ${f.severity === 'CRITICAL' ? 'text-red-600 dark:text-red-300' : 'text-amber-600 dark:text-amber-300'}`}>
                      {f.detail}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ── Report chooser — two prominent cards ── */}
        <div className="no-print">
          <ReportChooser
            active={reportView}
            onSelect={setReportView}
            tierLocked={false}
            claimNumber={(claim as any)?.claimNumber}
          />
        </div>
        <div style={reportView !== 'standard' ? { display: 'none' } : undefined}>
          <ClaimDecisionReportStandardView
            claim={claim}
            aiAssessment={aiAssessment}
            enforcement={enforcement}
            quotes={quotesWithItems}
            audience={getKingaClaimsReportAudience(user?.role)}
          />
        </div>
        <div data-report-view="forensic" style={reportView !== 'forensic' ? { display: 'none' } : undefined}>
          <ForensicAuditReport
            claim={claim}
            aiAssessment={aiAssessment}
            enforcement={enforcement}
            quotes={quotesWithItems}
          />
        </div>
        {/* Print CSS: show only the active report view */}
        <style>{`
          @media print {
            [data-report-view="standard"] { display: block !important; }
            [data-report-view="forensic"] { display: block !important; }
            [data-report-type="standard"] [data-report-view="forensic"] { display: none !important; }
            [data-report-type="forensic"] [data-report-view="standard"] { display: none !important; }
          }
        `}</style>

        {/* ── Post-report interactive panels — hidden in print/PDF ── */}
        <div className="no-print">

        {/* ── Intelligence Panels (wired from orphan audit) ── */}
        {claimId > 0 && (() => {
          const pe = (enforcement as any)?.physicsEstimate;
          const physicsRaw = (() => {
            try {
              const raw = (aiAssessment as any)?.physicsAnalysis;
              return raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : null;
            } catch { return null; }
          })();
          const consistencyFlag = (enforcement as any)?.consistencyFlag;
          const physicsScore = physicsRaw?.damageConsistencyScore ?? consistencyFlag?.score ?? 0;
          const impactSpeed = pe?.estimatedVelocityKmh ?? physicsRaw?.deltaVKmh ?? physicsRaw?.deltaV;
          return (
            <>
              <ReportSectionDivider label="Decision Intelligence" icon="🧠" />

              {/* Multi-Quote Cost Comparison */}
              <div className="mb-4">
                <MultiQuoteComparisonPanel
                  costIntelligenceJson={(aiAssessment as any)?.costIntelligenceJson ?? null}
                />
              </div>

              {/* Physics Analysis Chart — only when physics data is available */}
              {(physicsScore > 0 || impactSpeed) && (
                <div className="mb-4">
                  <PhysicsAnalysisChart data={{
                    impactSpeed: impactSpeed ?? undefined,
                    impactForce: pe?.impactForceKn?.min ?? physicsRaw?.impactForceKn ?? undefined,
                    energyDissipated: pe?.energyKj?.min ?? physicsRaw?.energyKj ?? undefined,
                    deceleration: physicsRaw?.deceleration ?? undefined,
                    damageConsistency: (physicsRaw?.damageConsistency ?? consistencyFlag?.label ?? "questionable") as "consistent" | "questionable" | "impossible",
                    physicsScore,
                  }} />
                </div>
              )}

              {/* Claims Explanation Panel */}
              <div className="mb-4">
                <ClaimsExplanationPanel
                  claimId={claimId}
                  precomputed={aiAssessment ? {
                    recommendation: (aiAssessment as any)?.recommendation ?? "REVIEW",
                    key_drivers: (aiAssessment as any)?.keyDrivers ?? [],
                    reasoning: (aiAssessment as any)?.reasoning ?? "",
                    confidence: (aiAssessment as any)?.confidenceScore ?? null,
                    incident_type: (claim as any)?.incidentType ?? null,
                    fraud_risk_level: (aiAssessment as any)?.fraudRiskLevel ?? null,
                    physics_plausible: (aiAssessment as any)?.physicsPlausible ?? null,
                    damage_consistent: (aiAssessment as any)?.damageConsistent ?? null,
                    estimated_cost: (aiAssessment as any)?.estimatedCost ?? null,
                  } : undefined}
                />
              </div>

              {/* Decision Authority Panel */}
              <div className="mb-4">
                <DecisionAuthorityPanel
                  claimId={claimId}
                  aiAssessment={aiAssessment ? {
                    fraudRiskLevel: (aiAssessment as any)?.fraudRiskLevel,
                    fraudRiskScore: (aiAssessment as any)?.fraudRiskScore,
                    confidenceScore: (aiAssessment as any)?.confidenceScore,
                    structuralDamageSeverity: (aiAssessment as any)?.structuralDamageSeverity,
                    estimatedCost: (aiAssessment as any)?.estimatedCost,
                    physicsAnalysis: (aiAssessment as any)?.physicsAnalysis,
                    consistencyCheckJson: (aiAssessment as any)?.consistencyCheckJson,
                    costRealismJson: (aiAssessment as any)?.costRealismJson,
                  } : null}
                  claim={claim ? {
                    incidentType: (claim as any)?.incidentType,
                    finalApprovedAmount: (claim as any)?.finalApprovedAmount,
                    claimAmount: (claim as any)?.claimAmount,
                    isHighValue: (claim as any)?.isHighValue,
                  } : null}
                  assessorValidated={(aiAssessment as any)?.assessorValidated ?? false}
                />
              </div>

              {/* Escalation Routing Panel */}
              <div className="mb-4">
                <EscalationRoutingPanel claimId={claimId} />
              </div>

              {/* Repair Intelligence Panel */}
              <div className="mb-4">
                <RepairIntelligencePanel
                  claimId={claimId}
                  countryCode={(claim as any)?.countryCode ?? "ZA"}
                />
              </div>

              {/* Repair vs Replace Panel */}
              <div className="mb-4">
                <RepairReplacePanel
                  claimId={claimId}
                  vehicleMake={(claim as any)?.vehicleMake ?? undefined}
                  vehicleModel={(claim as any)?.vehicleModel ?? undefined}
                  vehicleYear={(claim as any)?.vehicleYear ?? undefined}
                />
              </div>

              {/* Claim Comment Thread */}
              <ReportSectionDivider label="Claim Communications" icon="💬" />
              <div className="mb-4">
                <ClaimCommentThread
                  claimId={claimId}
                  showClaimantOption={user?.role === "claims_processor"}
                />
              </div>
            </>
          );
        })()}

        <ReportSectionDivider label="Audit Trail & Decision History" icon="📜" />
        {/* 7. Snapshot History */}
        {(snapshotHistory as any[]).length > 0 && (
          <div className="mb-4 rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
              style={{ background: "var(--card)", color: "var(--foreground)" }}
              onClick={() => setShowSnapshotHistory(v => !v)}
            >
              <span style={{ color: "var(--muted-foreground)" }}>
                <FileText className="inline h-3.5 w-3.5 mr-1.5" />
                Decision Snapshot History ({(snapshotHistory as any[]).length} version{(snapshotHistory as any[]).length !== 1 ? 's' : ''})
              </span>
              {showSnapshotHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showSnapshotHistory && (
              <div className="divide-y" style={{ borderTop: "1px solid var(--border)", background: "var(--background)" }}>
                {(snapshotHistory as any[]).map((snap: any) => (
                  <div key={snap.id} className="px-4 py-3 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold mb-0.5" style={{ color: "var(--foreground)" }}>
                        v{snap.version} — {snap.verdict.decision.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>
                        {snap.verdict.primaryReason}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs tabular-nums" style={{ color: "var(--muted-foreground)" }}>
                        {new Date(snap.createdAt).toLocaleString()}
                      </p>
                      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                        Fraud {snap.fraud.score}/100 · {currencySymbol(claim?.currencyCode)}{((snap.cost.aiEstimate ?? 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 7b. Spec JSON Viewer */}
        {latestSnapshot && (
          <div className="mb-4 rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
              style={{ background: "var(--card)", color: "var(--foreground)" }}
              onClick={() => setShowSpecJson(v => !v)}
            >
              <span className="flex items-center gap-2" style={{ color: "var(--muted-foreground)" }}>
                <Code className="inline h-3.5 w-3.5" />
                Audit Snapshot — Spec JSON (v{latestSnapshot.snapshot_version})
              </span>
              {showSpecJson ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showSpecJson && (
              <div className="p-4" style={{ background: "var(--background)", borderTop: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>
                    Immutable snapshot · snake_case · no null fields
                  </p>
                  <button
                    className="text-xs px-2 py-1 rounded"
                    style={{ background: "var(--muted)", color: "var(--foreground)" }}
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(latestSnapshot, null, 2));
                      toast.success("Snapshot JSON copied to clipboard");
                    }}
                  >
                    Copy JSON
                  </button>
                </div>
                <pre
                  className="text-xs overflow-auto rounded p-3"
                  style={{
                    background: "var(--fp-subtle-bg)",
                    color: "var(--primary)",
                    maxHeight: "400px",
                    fontFamily: "'Fira Code', 'Cascadia Code', monospace",
                    lineHeight: "1.5",
                  }}
                >
                  {JSON.stringify(latestSnapshot, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* 7c. Decision Replay Panel */}
        {latestSnapshot && (
          <div className="mb-4 rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ background: "var(--card)" }}
            >
              <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--muted-foreground)" }}>
                <GitCompareArrows className="h-3.5 w-3.5" />
                Decision Replay — Logic Drift Detection
              </span>
              <div className="flex items-center gap-2">
                {replayResult && (
                  <button
                    className="text-xs px-2 py-1 rounded"
                    style={{ background: "var(--muted)", color: "var(--foreground)" }}
                    onClick={() => setShowReplay(v => !v)}
                  >
                    {showReplay ? "Hide Results" : "Show Results"}
                  </button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={replayMutation.isPending}
                  onClick={() => replayMutation.mutate({ claimId: String(claimId) })}
                >
                  {replayMutation.isPending ? (
                    <><RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> Replaying...</>
                  ) : (
                    <><GitCompareArrows className="h-3.5 w-3.5 mr-1" /> Run Replay</>
                  )}
                </Button>
              </div>
            </div>

            {showReplay && replayResult && (
              <div className="p-4" style={{ background: "var(--background)", borderTop: "1px solid var(--border)" }}>
                {/* Header row */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{
                      background: replayResult.changed ? "var(--fp-locked-bg)" : "var(--status-approve-bg)",
                      color: replayResult.changed ? "var(--fp-critical-text)" : "var(--fp-success-text)",
                    }}
                  >
                    {replayResult.changed ? (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    ) : (
                      <CheckCircle className="h-3.5 w-3.5" />
                    )}
                    {replayResult.changed
                      ? `Logic Drift Detected — ${replayResult.differences.length} field(s) changed`
                      : "No Drift — Decision Consistent"}
                  </div>
                  <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    Replayed at {new Date(replayResult.replayed_at).toLocaleString()} · Original v{replayResult.original_snapshot_version}
                  </span>
                </div>

                {/* Verdict comparison */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="rounded-lg p-3" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--muted-foreground)" }}>Original Verdict</p>
                    <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>
                      {replayResult.original_verdict.replace(/_/g, " ")}
                    </p>
                  </div>
                  <div className="rounded-lg p-3" style={{ background: "var(--card)", border: `1px solid ${replayResult.changed && replayResult.original_verdict !== replayResult.new_verdict ? "var(--fp-locked-border)" : "var(--border)"}` }}>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--muted-foreground)" }}>Replayed Verdict</p>
                    <p className="text-sm font-bold" style={{ color: replayResult.original_verdict !== replayResult.new_verdict ? "var(--fp-critical-text)" : "var(--foreground)" }}>
                      {replayResult.new_verdict.replace(/_/g, " ")}
                    </p>
                  </div>
                </div>

                {/* Differences table */}
                {replayResult.differences.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>Field Differences</p>
                    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ background: "var(--muted)" }}>
                            <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>Field</th>
                            <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>Original</th>
                            <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>Replayed</th>
                          </tr>
                        </thead>
                        <tbody>
                          {replayResult.differences.map((diff, i) => (
                            <tr key={diff.field} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, background: "var(--background)" }}>
                              <td className="px-3 py-2 tabular-nums font-semibold" style={{ color: "var(--primary)" }}>{diff.field}</td>
                              <td className="px-3 py-2" style={{ color: "var(--fp-critical-text)" }}>{JSON.stringify(diff.original)}</td>
                              <td className="px-3 py-2" style={{ color: "var(--fp-success-text)" }}>{JSON.stringify(diff.new)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Impact analysis */}
                <div className="rounded-lg p-3" style={{ background: "var(--fp-subtle-bg)", border: "1px solid var(--border)" }}>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>Impact Analysis</p>
                  <pre
                    className="text-xs whitespace-pre-wrap"
                    style={{ color: "var(--foreground)", fontFamily: "inherit", lineHeight: "1.6" }}
                  >
                    {replayResult.impact_analysis}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* v4.2 P3: Adjuster Sign-Off Panel — Section 6 bottom */}
        {claimId > 0 && (
          <AdjusterSignOffPanel
            claimId={claimId}
            aiDecision={
              (enforcement as any)?._phase2?.finalDecision ??
              (enforcement as any)?.finalDecision?.decision ??
              "REVIEW"
            }
            existingSignOff={existingSignOff ? { adjusterName: existingSignOff.adjusterName, decision: existingSignOff.decision, notes: existingSignOff.notes ?? "", signedAt: existingSignOff.signedAt } : null}
            onSaved={() => refetchSignOff()}
          />
        )}

        {/* v4.2 B3: Report Integrity Seal */}
        <ReportIntegritySeal claim={claim} aiAssessment={aiAssessment} enforcement={enforcement} />

        {/* 8. Lifecycle Status Bar */}
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${isLocked ? "var(--fp-locked-border)" : isFinal ? "var(--status-approve-text)" : "var(--border)"}` }}>
          {/* State progress track */}
          <div className="flex items-stretch" style={{ background: "var(--muted)", minHeight: "44px" }}>
            {(["DRAFT", "REVIEWED", "FINALISED", "LOCKED"] as const).map((state, i) => {
              const stateOrder = ["DRAFT", "REVIEWED", "FINALISED", "LOCKED"];
              const currentIdx = stateOrder.indexOf(lifecycleState);
              const isActive = lifecycleState === state;
              const isPast = stateOrder.indexOf(state) < currentIdx;
              const stateIcons = { DRAFT: FileText, REVIEWED: Eye, FINALISED: Gavel, LOCKED: Lock };
              const Icon = stateIcons[state];
              return (
                <div
                  key={state}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-2"
                  style={{
                    background: isActive
                      ? state === "LOCKED" ? "var(--fp-locked-bg)" : state === "FINALISED" ? "var(--status-approve-bg)" : "var(--fp-badge-bg)"
                      : "transparent",
                    color: isActive
                      ? state === "LOCKED" ? "var(--status-reject-border)" : state === "FINALISED" ? "var(--status-approve-border)" : "var(--fp-info-text)"
                      : isPast ? "var(--foreground)" : "var(--muted-foreground)",
                    borderRight: i < 3 ? "1px solid var(--border)" : undefined,
                    opacity: isPast ? 0.7 : 1,
                  }}
                >
                  <Icon className="h-3 w-3" />
                  {state}
                  {isPast && <CheckCircle className="h-3 w-3" style={{ color: "var(--fp-success-text)" }} />}
                </div>
              );
            })}
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between gap-3 p-4" style={{ background: "var(--card)" }}>
            <div>
              {isLocked ? (
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4" style={{ color: "var(--fp-critical-text)" }} />
                  <span className="text-sm font-semibold" style={{ color: "var(--fp-critical-text)" }}>LOCKED — Immutable Legal Record</span>
                </div>
              ) : isFinal ? (
                <div className="flex items-center gap-2">
                  <Gavel className="h-4 w-4" style={{ color: "var(--fp-success-text)" }} />
                  <span className="text-sm font-semibold" style={{ color: "var(--fp-success-text)" }}>FINALISED — {lifecycle?.final_decision_choice?.replace(/_/g, " ") ?? "Decision recorded"}</span>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>Decision Lifecycle</p>
                  <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Advance the state to create an auditable decision trail.</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* REVIEWED button — only when DRAFT */}
              {lifecycleState === "DRAFT" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={markReviewedMutation.isPending}
                  onClick={() => openReasonDialog('REVIEWED')}
                >
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  Mark Reviewed
                </Button>
              )}

              {/* FINALISE buttons — when DRAFT or REVIEWED */}
              {(lifecycleState === "DRAFT" || lifecycleState === "REVIEWED") && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={finaliseDecisionMutation.isPending}
                    onClick={() => openReasonDialog('FINALISED', 'REVIEW_REQUIRED')}
                  >
                    <Gavel className="h-3.5 w-3.5 mr-1" />
                    Review Required
                  </Button>
                  <Button
                    size="sm"
                    disabled={finaliseDecisionMutation.isPending}
                    onClick={() => openReasonDialog('FINALISED', 'FINALISE_CLAIM')}
                  >
                    <CheckCircle className="h-3.5 w-3.5 mr-1" />
                    Finalise Claim
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={finaliseDecisionMutation.isPending}
                    style={{ borderColor: "var(--fp-locked-border)", color: "var(--fp-critical-text)" }}
                    onClick={() => openReasonDialog('FINALISED', 'ESCALATE_INVESTIGATION')}
                  >
                    <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                    Escalate
                  </Button>
                </>
              )}

              {/* LOCK button — only when FINALISED */}
              {lifecycleState === "FINALISED" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={lockDecisionMutation.isPending}
                  style={{ borderColor: "var(--fp-locked-border)", color: "var(--fp-critical-text)" }}
                  onClick={() => openReasonDialog('LOCKED')}
                >
                  <Lock className="h-3.5 w-3.5 mr-1" />
                  Lock Decision
                </Button>
              )}

              {/* Download Audit Export */}
              <Button
                size="sm"
                variant="outline"
                onClick={downloadAuditExport}
                disabled={isExporting}
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                {isExporting ? 'Exporting…' : 'Export Audit'}
              </Button>

              {/* Audit Log toggle */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setShowAuditLog(v => !v); refetchAuditLog(); }}
              >
                <FileText className="h-3.5 w-3.5 mr-1" />
                Audit Log
              </Button>

              {/* Full Report link */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLocation(`/insurer/claims/${claimId}/comparison`)}
              >
                Full Report →
              </Button>
            </div>
          </div>
        </div>

        {/* Export Validation Gate Panel — shown when export is blocked */}
        {showExportValidation && exportValidationErrors && (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--fp-critical-border)", background: "var(--fp-critical-bg)" }}>
            <div className="flex items-center justify-between px-5 py-3" style={{ background: "var(--fp-critical-bg)" }}>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" style={{ color: "var(--fp-critical-text)" }} />
                <span className="text-sm font-semibold" style={{ color: "var(--fp-critical-text)" }}>Export Blocked — Validation Failed</span>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--fp-critical-bg)", color: "var(--fp-critical-text)" }}>
                  {exportValidationErrors.filter(c => !c.passed).length} check{exportValidationErrors.filter(c => !c.passed).length !== 1 ? 's' : ''} failed
                </span>
              </div>
              <Button size="sm" variant="outline" onClick={() => setShowExportValidation(false)}>Dismiss</Button>
            </div>
            <div className="p-4 space-y-2">
              {exportValidationErrors.map((check, i) => (
                <div key={i} className="flex items-start gap-3 rounded-lg px-3 py-2.5" style={{ background: check.passed ? "var(--fp-success-bg)" : "var(--fp-critical-bg)", border: `1px solid ${check.passed ? "var(--fp-success-border)" : "var(--fp-critical-border)"}` }}>
                  {check.passed
                    ? <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--fp-success-text)" }} />
                    : <XCircle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--fp-critical-text)" }} />
                  }
                  <div>
                    <p className="text-xs tabular-nums font-semibold" style={{ color: check.passed ? "var(--fp-success-text)" : "var(--fp-critical-text)" }}>{check.check}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{check.detail}</p>
                  </div>
                </div>
              ))}
              <p className="text-xs pt-1" style={{ color: "var(--muted-foreground)" }}>
                Resolve the failed checks above, then click <strong>Export Audit</strong> again.
              </p>
            </div>
          </div>
        )}

        {/* 9. Governance Audit Log */}
        {showAuditLog && (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between px-5 py-3" style={{ background: "var(--muted)" }}>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" style={{ color: "var(--fp-info-text)" }} />
                <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Governance Audit Log</span>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--fp-badge-bg)", color: "var(--fp-info-text)" }}>
                  {auditLog.length} {auditLog.length === 1 ? 'entry' : 'entries'}
                </span>
              </div>
              <Button size="sm" variant="outline" onClick={() => setShowAuditLog(false)}>Close</Button>
            </div>
            <div className="p-4" style={{ background: "var(--card)" }}>
              {auditLog.length === 0 ? (
                <p className="text-sm text-center py-4" style={{ color: "var(--muted-foreground)" }}>No governance actions recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {auditLog.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-lg p-3"
                      style={{
                        background: "var(--background)",
                        border: `1px solid ${entry.overrideFlag ? "var(--fp-locked-border)" : "var(--border)"}`,
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-xs font-bold px-2 py-0.5 rounded-full"
                            style={{
                              background: entry.action === 'LOCKED' ? "var(--fp-locked-bg)"
                                : entry.action === 'FINALISED' ? "var(--fp-finalised-bg)"
                                : entry.action === 'REVIEWED' ? "var(--fp-info-bg)"
                                : "var(--fp-subtle-bg)",
                              color: entry.action === 'LOCKED' ? "var(--fp-critical-text)"
                                : entry.action === 'FINALISED' ? "var(--status-approve-border)"
                                : entry.action === 'REVIEWED' ? "var(--fp-info-text)"
                                : "var(--status-fraud-border)",
                            }}
                          >
                            {entry.action}
                          </span>
                          {entry.overrideFlag && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--fp-warning-bg)", color: "var(--fp-warning-text)" }}>
                              ⚠️ OVERRIDE
                            </span>
                          )}
                          {!entry.actionAllowed && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--fp-critical-bg)", color: "var(--fp-critical-text)" }}>
                              BLOCKED
                            </span>
                          )}
                        </div>
                        <span className="text-xs" style={{ color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
                          {new Date(entry.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1">
                        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                          <span className="font-semibold" style={{ color: "var(--foreground)" }}>By:</span> {entry.performedByName ?? entry.performedBy}
                        </p>
                        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                          <span className="font-semibold" style={{ color: "var(--foreground)" }}>Reason:</span> {entry.reason}
                        </p>
                        {entry.overrideFlag && entry.aiDecision && entry.humanDecision && (
                          <p className="text-xs" style={{ color: "var(--fp-warning-text)" }}>
                            <span className="font-semibold">Override:</span> KINGA recommended “{entry.aiDecision.replace(/_/g, ' ')}” → Human chose “{entry.humanDecision.replace(/_/g, ' ')}”
                          </p>
                        )}
                        {entry.validationErrors.length > 0 && (
                          <p className="text-xs" style={{ color: "var(--fp-critical-text)" }}>
                            <span className="font-semibold">Blocked:</span> {entry.validationErrors.join('; ')}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        </div>{/* end no-print wrapper for post-report panels */}
      </div>

      {/* Reason Dialog (Governance Rule 1 — mandatory justification) */}
      {reasonDialog.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setReasonDialog(d => ({ ...d, open: false })); }}
        >
          <div
            className="rounded-xl p-6 w-full max-w-md mx-4"
            style={{ background: "var(--card)", border: "1px solid var(--border)", boxShadow: "0 25px 50px rgba(0,0,0,0.5)" }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center"
                style={{
                  background: reasonDialog.action === 'LOCKED' ? "var(--fp-locked-bg)"
                    : reasonDialog.action === 'FINALISED' ? "var(--fp-finalised-bg)"
                    : "var(--fp-info-bg)",
                }}
              >
                {reasonDialog.action === 'LOCKED' ? <Lock className="h-4 w-4" style={{ color: "var(--fp-critical-text)" }} />
                  : reasonDialog.action === 'FINALISED' ? <Gavel className="h-4 w-4" style={{ color: "var(--fp-success-text)" }} />
                  : <Eye className="h-4 w-4" style={{ color: "var(--fp-info-text)" }} />}
              </div>
              <div>
                <h3 className="text-sm font-bold" style={{ color: "var(--foreground)" }}>
                  {reasonDialog.action === 'REVIEWED' ? 'Mark Decision as Reviewed'
                    : reasonDialog.action === 'LOCKED' ? 'Lock Claim — Immutable Record'
                    : `Finalise: ${(reasonDialog.finalDecisionChoice ?? '').replace(/_/g, ' ')}`}
                </h3>
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>A written justification is required (min. 10 characters)</p>
              </div>
            </div>

            <textarea
              className="w-full rounded-lg p-3 text-sm resize-none"
              rows={4}
              placeholder="Enter your reason for this action..."
              value={reasonDialog.reason}
              onChange={(e) => setReasonDialog(d => ({ ...d, reason: e.target.value, error: '' }))}
              style={{
                background: "var(--background)",
                border: `1px solid ${reasonDialog.error ? "var(--fp-locked-border)" : "var(--border)"}`,
                color: "var(--foreground)",
                outline: "none",
              }}
              autoFocus
            />

            <div className="flex items-center justify-between mt-1 mb-4">
              <span className="text-xs" style={{ color: reasonDialog.error ? "var(--fp-critical-text)" : "var(--muted-foreground)" }}>
                {reasonDialog.error || `${reasonDialog.reason.trim().length} / 10 characters minimum`}
              </span>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setReasonDialog(d => ({ ...d, open: false }))}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={reasonDialog.reason.trim().length < 10}
                onClick={submitReasonDialog}
                style={{
                  background: reasonDialog.action === 'LOCKED' ? "var(--fp-locked-border)"
                    : reasonDialog.action === 'FINALISED' ? "var(--fp-finalised-border)"
                    : undefined,
                }}
              >
                Confirm {reasonDialog.action}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ClaimQualityPanel removed — pre-report panels no longer rendered

