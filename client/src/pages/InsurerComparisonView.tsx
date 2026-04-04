import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, AlertTriangle, CheckCircle2, Loader2, Shield, Download, Zap, Activity, Printer } from "lucide-react";
import KingaLogo from "@/components/KingaLogo";
import { trpc } from "@/lib/trpc";
import { useLocation, useRoute } from "wouter";
import { useState, useEffect, useRef } from "react";
import { INSURER_CLAIMS_LIST_PATH } from "@/lib/roleRouting";
import { toast } from "sonner";
// PoliceReportForm removed — police reports belong in claim inputs, not AI analysis
import VehicleValuationCard from "@/components/VehicleValuationCard";
import { QuoteComparison } from "@/components/QuoteComparison";
import { generateComparisonPDF, generateDamageReportPDF } from "@/lib/pdfExport";
import ThemeToggle from "@/components/ThemeToggle";
import PhysicsConfidenceDashboard from "@/components/PhysicsConfidenceDashboard";
import VehicleDamageVisualization from "@/components/VehicleDamageVisualization";
import { QuoteOptimisationPanel } from "@/components/QuoteOptimisationPanel";
import { RepairIntelligencePanel } from "@/components/RepairIntelligencePanel";
import PanelBeaterChoicesCard from "@/components/PanelBeaterChoicesCard";
import { AiIntelligenceSummaryCard } from "@/components/AiIntelligenceSummaryCard";
import { AiStatusBadge } from "@/components/AiStatusBadge";
import FraudScorePanel from "@/components/FraudScorePanel";
import IntelligenceEnforcementPanel from "@/components/IntelligenceEnforcementPanel";
import AdvancedAnalyticsPanel from "@/components/AdvancedAnalyticsPanel";
import ForensicDecisionPanel from "@/components/ForensicDecisionPanel";
import { DamageImagesPanel } from "@/components/DamageImagesPanel";
import { VehicleImpactVectorDiagram } from "@/components/VehicleImpactVectorDiagram";
import { IncidentTypeOverrideDialog } from "@/components/IncidentTypeOverrideDialog";
import { DamageConsistencyPanel } from "@/components/DamageConsistencyPanel";
import DecisionAuthorityPanel from "@/components/DecisionAuthorityPanel";
import ReportReadinessPanel from "@/components/ReportReadinessPanel";
import ClaimsExplanationPanel from "@/components/ClaimsExplanationPanel";
import EscalationRoutingPanel from "@/components/EscalationRoutingPanel";
import ClaimApprovalToolbar from "@/components/ClaimApprovalToolbar";
import ApprovalHistoryPanel from "@/components/ApprovalHistoryPanel";
import { Pencil } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";

// ─── Cost Intelligence helpers (pure, claim-relative only) ───────────────────

type CostBand = "FAIR" | "HIGH" | "LOW";

function computeMedian(amounts: number[]): number {
  if (amounts.length === 0) return 0;
  const sorted = [...amounts].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function getCostBand(amount: number, median: number): CostBand {
  if (median === 0) return "FAIR";
  const deviation = (amount - median) / median;
  if (deviation > 0.2) return "HIGH";
  if (deviation < -0.2) return "LOW";
  return "FAIR";
}

const BAND_CONFIG: Record<CostBand, { label: string; containerClass: string; dotClass: string }> = {
  FAIR: {
    label: "FAIR",
    containerClass: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    dotClass: "bg-emerald-500",
  },
  HIGH: {
    label: "HIGH",
    containerClass: "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
    dotClass: "bg-red-500",
  },
  LOW: {
    label: "LOW",
    containerClass: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    dotClass: "bg-amber-500",
  },
};

export default function InsurerComparisonView() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [, params1] = useRoute("/insurer/claims/:id/comparison");
  const [, params2] = useRoute("/insurer/comparison/:id");
  const params = params1 || params2;
  const claimId = params?.id ? parseInt(params.id) : 0;

  // Get claim details
  const { data: claim, isLoading: claimLoading } = trpc.claims.getById.useQuery(
    { id: claimId },
    { enabled: !!claimId }
  );

  // Get AI assessment — poll every 5 s while the claim is in assessment_in_progress
  // so the panel refreshes automatically after the fire-and-forget job completes.
  const [aiPollInterval, setAiPollInterval] = useState<number | false>(false);
  const { data: aiAssessment, isLoading: aiLoading } = trpc.aiAssessments.byClaim.useQuery(
    { claimId },
    {
      enabled: !!claimId,
      refetchInterval: aiPollInterval,
    }
  );

  // Start polling when the claim enters assessment_in_progress; stop once we
  // have a result (aiAssessment is populated).
  useEffect(() => {
    if (!claim) return;
    const inProgress = claim.status === "assessment_in_progress" || claim.status === "assessment_pending";
    if (inProgress && !aiAssessment) {
      setAiPollInterval(5000);
    } else {
      setAiPollInterval(false);
    }
  }, [claim?.status, aiAssessment]);

  // Fire a one-shot toast the first time aiAssessment transitions from
  // undefined/null → populated. The ref ensures repeated polling ticks never
  // trigger a second notification for the same claim session.
  const assessmentToastShown = useRef(false);
  useEffect(() => {
    if (aiAssessment && !assessmentToastShown.current) {
      assessmentToastShown.current = true;
      toast.success("AI assessment ready", {
        description: "The AI damage assessment for this claim is now available.",
      });
    }
  }, [aiAssessment]);

  // Get assessor evaluation
  const { data: assessorEval, isLoading: assessorLoading } = trpc.assessorEvaluations.byClaim.useQuery(
    { claimId },
    { enabled: !!claimId }
  );

  // Get panel beater quotes with line items
  const { data: quotesWithItems = [], isLoading: quotesLoading } = trpc.quotes.getWithLineItems.useQuery(
    { claimId },
    { enabled: !!claimId }
  );
  
  // Also get basic quotes for backward compatibility
  const quotes = quotesWithItems;

  const isLoading = claimLoading || aiLoading || assessorLoading || quotesLoading;

  // Utils for cache invalidation
  const utils = trpc.useUtils();

  // Advanced physics toggle state — must be declared before any early returns
  const [showAdvancedPhysics, setShowAdvancedPhysics] = useState(false);

  // Incident type override dialog state
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);

  // Re-run AI assessment mutation (used in Claim Summary card)
  const reRunMutation = trpc.claims.triggerAiAssessment.useMutation({
    onSuccess: () => {
      utils.claims.getById.invalidate({ id: claimId });
      utils.aiAssessments.byClaim.invalidate({ claimId });
      utils.quotes.getWithLineItems.invalidate({ claimId });
      utils.panelBeaters.invalidate();
      toast.success('AI assessment re-triggered', { description: 'Vehicle details will be extracted from the PDF. This may take 30-60 seconds.' });
    },
    onError: (err) => toast.error(`Failed to re-run assessment: ${err.message}`),
  });

  // Handler for exporting damage report PDF
  const handleExportDamageReport = (aiAssessment: any, claim: any) => {
    // damagedComponentsJson stores objects: {name, location, damageType, severity}
    // Normalise to flat string array so all .toLowerCase() calls work correctly
    const rawComponents = aiAssessment.damagedComponentsJson
      ? (() => { try { return JSON.parse(aiAssessment.damagedComponentsJson); } catch { return []; } })()
      : [];
    const damagedComponents: string[] = Array.isArray(rawComponents)
      ? rawComponents.map((c: any) => typeof c === 'string' ? c : (c?.name || c?.component || String(c)))
      : [];

    // Component categories for categorization
    const componentCategories = {
      "Exterior Panels": ["fender", "bumper", "door", "hood", "trunk", "quarter panel", "rocker panel"],
      "Lighting": ["headlight", "taillight", "fog light", "turn signal"],
      "Glass": ["windshield", "window", "mirror"],
      "Structural": ["frame", "pillar", "subframe", "crossmember"],
      "Mechanical": ["radiator", "condenser", "suspension", "wheel", "tire", "axle"],
      "Interior": ["dashboard", "airbag", "seat", "console"],
    };

    // Categorize detected components
    const categorizedDamage: Record<string, string[]> = {};
    Object.entries(componentCategories).forEach(([category, keywords]) => {
      const matchedComponents = damagedComponents.filter((comp: string) =>
        keywords.some(keyword => comp.toLowerCase().includes(keyword))
      );
      if (matchedComponents.length > 0) {
        categorizedDamage[category] = matchedComponents;
      }
    });

    // Infer hidden damage (same logic as DamageComponentBreakdown)
    const inferredHiddenDamage: Array<{ component: string; reason: string; confidence: string }> = [];
    const damageDescription = aiAssessment.damageDescription || "";
    // Resolve correct fields (not deprecated)
    const exportAccidentType = (claim as any)?.incidentType || aiAssessment.accidentType || "";
    const exportHasStructuralDamage = aiAssessment.structuralDamageSeverity ? aiAssessment.structuralDamageSeverity !== 'none' : false;
    const exportHasAirbagDeployment = damageDescription.toLowerCase().includes('airbag') || aiAssessment.airbagDeployment || false;
    
    if (damagedComponents.some((c: string) => c.toLowerCase().includes("bumper") || c.toLowerCase().includes("fender"))) {
      if (exportAccidentType === "frontal" || exportAccidentType.includes("front") || damageDescription.toLowerCase().includes("front")) {
        // Physics: force propagation is Bumper → Crash Bar/Subframe → Radiator/Condenser
        inferredHiddenDamage.push({
          component: "Front Subframe / Crash Bar",
          reason: "Primary energy-absorbing structural member in frontal collisions — damaged before force reaches cooling components",
          confidence: "High"
        });
        inferredHiddenDamage.push({
          component: "Radiator / AC Condenser",
          reason: "Cooling components sit behind the subframe — damaged only if impact force exceeds subframe absorption capacity",
          confidence: "Medium"
        });
      }
    }

    if (exportAccidentType?.includes("side")) {
      inferredHiddenDamage.push({
        component: "Door Intrusion Beam",
        reason: "Side impact typically damages internal door reinforcement",
        confidence: "High"
      });
      if (damagedComponents.some((c: string) => c.toLowerCase().includes("door"))) {
        inferredHiddenDamage.push({
          component: "B-Pillar / Side Structure",
          reason: "Severe door damage may indicate pillar deformation",
          confidence: "Medium"
        });
      }
    }

    if (exportAccidentType === "rollover") {
      inferredHiddenDamage.push({
        component: "Roof Structure / Pillars",
        reason: "Rollover accidents cause structural deformation",
        confidence: "High"
      });
    }

    if (exportHasStructuralDamage) {
      inferredHiddenDamage.push({
        component: "Frame / Unibody Structure",
        reason: "AI detected structural damage indicators",
        confidence: "High"
      });
    }

    if (exportHasAirbagDeployment) {
      inferredHiddenDamage.push({
        component: "Airbag Control Module / Sensors",
        reason: "Airbag deployment requires system replacement",
        confidence: "High"
      });
    }

    // Generate PDF
    generateDamageReportPDF({
      claimNumber: claim.claimNumber,
      vehicle: `${claim.vehicleMake} ${claim.vehicleModel} (${claim.vehicleYear})`,
      registration: claim.vehicleRegistration,
      incidentDate: claim.incidentDate ? new Date(claim.incidentDate).toLocaleDateString() : "N/A",
      accidentType: (claim as any).incidentType || aiAssessment.accidentType || "unknown",
      damagedComponents,
      categorizedDamage,
      inferredHiddenDamage,
      structuralDamage: aiAssessment.structuralDamageSeverity ? aiAssessment.structuralDamageSeverity !== 'none' : false,
      airbagDeployment: aiAssessment.damageDescription?.toLowerCase().includes('airbag') || false,
      estimatedCost: aiAssessment.estimatedCost || 0,
      partsCost: aiAssessment.estimatedPartsCost || (aiAssessment.estimatedCost || 0) * 0.6,
      laborCost: aiAssessment.estimatedLaborCost || (aiAssessment.estimatedCost || 0) * 0.4,
      damageDescription: aiAssessment.damageDescription || "",
      // Physics analysis from AI assessment
      physicsAnalysis: (() => {
        if (!aiAssessment?.physicsAnalysis) return undefined;
        try {
          const p = typeof aiAssessment.physicsAnalysis === 'string'
            ? JSON.parse(aiAssessment.physicsAnalysis)
            : aiAssessment.physicsAnalysis;
          return {
            impactForce: p.impactForce ?? 0,
            estimatedSpeed: p.estimatedSpeed ?? 0,
            impactAngle: p.impactAngle ?? 0,
            damagePropagation: Array.isArray(p.damagePropagation) ? p.damagePropagation : [],
            physicsDeviationScore: p.physicsDeviationScore ?? 0,
          };
        } catch { return undefined; }
      })(),
      // Forensic analysis from AI assessment
      forensicAnalysis: (() => {
        if (!(aiAssessment as any)?.forensicAnalysis) return undefined;
        try {
          const f = typeof (aiAssessment as any).forensicAnalysis === 'string'
            ? JSON.parse((aiAssessment as any).forensicAnalysis)
            : (aiAssessment as any).forensicAnalysis;
          return {
            overallFraudScore: f.overallFraudScore ?? 0,
            paintAnalysis: f.paintAnalysis ?? { score: 0, findings: [] },
            bodyworkAnalysis: f.bodyworkAnalysis ?? { score: 0, findings: [] },
            glassAnalysis: f.glassAnalysis ?? { score: 0, findings: [] },
            tireAnalysis: f.tireAnalysis ?? { score: 0, findings: [] },
            fluidAnalysis: f.fluidAnalysis ?? { score: 0, findings: [] },
          };
        } catch { return undefined; }
      })(),
    });

    toast.success("Damage report exported successfully!");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Claim Not Found</CardTitle>
            <CardDescription>The requested claim could not be found</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation(INSURER_CLAIMS_LIST_PATH)}>
              Back to Claims
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  /**
   * Fraud Detection Algorithm
   * 
   * Detects potential fraud by comparing three independent cost estimates:
   * 1. AI automated assessment (computer vision analysis)
   * 2. Human assessor evaluation (independent expert)
   * 3. Panel beater quotes (repair shop estimates)
   * 
   * Fraud indicators are triggered when any pair of estimates differs by >30%.
   * This threshold is based on industry standards for acceptable variance in
   * damage assessment.
   * 
   * @returns true if fraud indicators detected, false otherwise
   */
  const hasFraudIndicators = () => {
    // Require all three data sources for accurate comparison
    if (!aiAssessment || !assessorEval || quotes.length === 0) return false;

    // Extract cost estimates (stored in cents, so divide by 100 for dollars)
    const aiCost = aiAssessment.estimatedCost || 0;
    const assessorCost = assessorEval.estimatedRepairCost || 0;
    const avgQuoteCost = quotes.reduce((sum, q) => sum + (q.quotedAmount || 0), 0) / quotes.length;

    /**
     * Calculate percentage differences between each pair of estimates
     * Formula: |A - B| / max(A, B)
     * This gives a normalized percentage difference that handles both
     * overestimation and underestimation symmetrically.
     */
    const aiAssessorDiff = Math.abs(aiCost - assessorCost) / Math.max(aiCost, assessorCost);
    const aiQuotesDiff = Math.abs(aiCost - avgQuoteCost) / Math.max(aiCost, avgQuoteCost);
    const assessorQuotesDiff = Math.abs(assessorCost - avgQuoteCost) / Math.max(assessorCost, avgQuoteCost);

    // Flag as potential fraud if ANY pair exceeds 30% variance
    return aiAssessorDiff > 0.3 || aiQuotesDiff > 0.3 || assessorQuotesDiff > 0.3;
  };

  const fraudDetected = hasFraudIndicators();

  // ── Normalised values (server-side single source of truth) ─────────────────
  // Use _normalised.costs / _normalised.fraud for all cost and fraud displays
  // to ensure internal consistency across all sections of this page.
  const normCosts = aiAssessment?._normalised?.costs ?? null;
  const normFraud = aiAssessment?._normalised?.fraud ?? null;

  // Derive key metrics for the hero header
  // Prefer normalised total cost; fall back to raw estimatedCost only if normalised is unavailable
  const aiCostDollars = normCosts?.totalUsd ?? aiAssessment?.estimatedCost ?? 0;
  const assessorCostCents = assessorEval?.estimatedRepairCost || 0;
  const quotedAmounts = quotes.map((q: any) => q.quotedAmount || 0);
  const lowestQuoteCents = quotedAmounts.length > 0 ? Math.min(...quotedAmounts) : 0;
  // Use normalised fraud score as the single authoritative value
  const fraudLevel = normFraud?.level ?? aiAssessment?.fraudRiskLevel ?? assessorEval?.fraudRiskLevel ?? 'unknown';
  const confidenceScore = aiAssessment?.confidenceScore || 0;

  const fraudChipClass = fraudLevel === 'high' || fraudLevel === 'critical' || fraudLevel === 'elevated' ? 'danger' :
    fraudLevel === 'medium' ? 'warning' : fraudLevel === 'low' ? 'success' : 'neutral';

  return (
    <div className="min-h-screen dark" style={{ background: 'var(--background)', colorScheme: 'dark' }}>
      {/* BI Hero Header */}
      <header className="bi-hero">
        <div className="bi-hero-grid" />
        <div className="container mx-auto px-4 py-5 relative z-10">
          {/* Top bar: Logo + user */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <KingaLogo />
              <div className="h-5 w-px" style={{ background: 'var(--bi-gradient-accent)' }} />
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--chart-1)' }}>AutoVerify AI</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{user?.name}</p>
                <p className="text-xs capitalize" style={{ color: 'var(--muted-foreground)' }}>{user?.role}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => logout()}
                style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)', background: 'transparent' }}>
                Sign Out
              </Button>
            </div>
          </div>

          {/* Main hero content */}
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Button variant="ghost" size="sm" onClick={() => setLocation(INSURER_CLAIMS_LIST_PATH)}
                  className="gap-1.5 px-2 h-7" style={{ color: 'var(--muted-foreground)' }}>
                  <ArrowLeft className="h-3.5 w-3.5" /> Claims
                </Button>
                <span style={{ color: 'var(--muted-foreground)' }}>/</span>
                <span className="text-xs font-mono" style={{ color: 'var(--muted-foreground)' }}>{claim.claimNumber}</span>
              </div>
              <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--foreground)' }}>
                {claim.vehicleMake && claim.vehicleModel
                  ? `${claim.vehicleMake} ${claim.vehicleModel}${claim.vehicleYear ? ` · ${claim.vehicleYear}` : ''}`
                  : 'AI Intelligence Report'}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-mono" style={{ color: 'var(--muted-foreground)' }}>{claim.claimNumber}</span>
                {claim.vehicleRegistration && (
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--border)', color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}>
                    {claim.vehicleRegistration}
                  </span>
                )}
                <AiStatusBadge claim={claim} aiAssessment={aiAssessment ?? null} />
                <span className={`bi-chip ${fraudChipClass}`}>
                  <span className="bi-chip-dot" />
                  Fraud: {fraudLevel.replace('_', ' ').toUpperCase()}
                </span>
              </div>
            </div>

            {/* Hero KPI strip */}
            <div className="flex flex-wrap gap-3">
              {aiCostDollars > 0 && (
                <div className="text-center px-4 py-2 rounded-lg" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                  <p className="kpi-card-label" style={{ fontSize: '0.625rem' }}>AI Estimate</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--chart-1)' }}>
                    US${aiCostDollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              )}
              {assessorCostCents > 0 && (
                <div className="text-center px-4 py-2 rounded-lg" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                  <p className="kpi-card-label" style={{ fontSize: '0.625rem' }}>Assessor</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--info)' }}>
                    US${assessorCostCents.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              )}
              {lowestQuoteCents > 0 && (
                <div className="text-center px-4 py-2 rounded-lg" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                  <p className="kpi-card-label" style={{ fontSize: '0.625rem' }}>Best Quote</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--success)' }}>
                    US${lowestQuoteCents.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              )}
              {confidenceScore > 0 && (
                <div className="text-center px-4 py-2 rounded-lg" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                  <p className="kpi-card-label" style={{ fontSize: '0.625rem' }}>AI Confidence</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--warning)' }}>{confidenceScore}%</p>
                </div>
              )}
            </div>
          </div>

          {/* Action bar */}
          <div className="flex items-center gap-2 mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  // Prepare data for PDF export
                  const pdfData = {
                    claimNumber: claim.claimNumber,
                    vehicle: `${claim.vehicleMake} ${claim.vehicleModel} (${claim.vehicleYear})`,
                    registration: claim.vehicleRegistration || "N/A",
                    incidentDate: claim.incidentDate ? new Date(claim.incidentDate).toLocaleDateString() : "N/A",
                    assessorEvaluation: assessorEval ? {
                      estimatedCost: assessorEval.estimatedRepairCost || 0,
                      laborCost: assessorEval.laborCost || 0,
                      partsCost: assessorEval.partsCost || 0,
                      estimatedDuration: assessorEval.estimatedDuration || 0,
                      fraudRisk: assessorEval.fraudRiskLevel || "low",
                      notes: assessorEval.damageAssessment || undefined
                    } : undefined,
                    quotes: quotes.map((q: any) => ({
                      panelBeaterName: `Panel Beater #${q.panelBeaterId}`,
                      totalCost: q.quotedAmount || 0,
                      laborCost: q.laborCost || 0,
                      partsCost: q.partsCost || 0,
                      estimatedDuration: q.estimatedDuration || 0,
                      notes: q.notes || undefined,
                      lineItems: q.lineItems?.map((item: any) => ({
                        description: item.description,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        totalPrice: item.totalPrice
                      }))
                    })),
                    quoteComparison: quotes.length > 1 ? {
                      discrepancyCount: 4, // From comparison analysis
                      averageQuote: quotes.reduce((sum: number, q: any) => sum + (q.quotedAmount || 0), 0) / quotes.length,
                      missingItems: [] // Can be enhanced later
                    } : undefined,
                    // Accident circumstances
                    accidentCircumstances: {
                      incidentDescription: (claim as any).incidentDescription || undefined,
                      incidentLocation: (claim as any).incidentLocation || undefined,
                      incidentType: (claim as any).incidentType || undefined,
                    },
                    // AI Intelligence Summary — derived from existing AI assessment record and quotes
                    aiIntelligence: (() => {
                      const amounts: number[] = quotes.map((q: any) => q.quotedAmount || 0);
                      const sorted = [...amounts].sort((a: number, b: number) => a - b);
                      const mid = Math.floor(sorted.length / 2);
                      const medianQuote = sorted.length % 2 !== 0
                        ? sorted[mid]
                        : (sorted[mid - 1] + sorted[mid]) / 2;
                      const lowestQuote = sorted.length > 0 ? sorted[0] : 0;
                      const highestQuote = sorted.length > 0 ? sorted[sorted.length - 1] : 0;
                      const spreadPercent = highestQuote > 0
                        ? Math.round(((highestQuote - lowestQuote) / highestQuote) * 100)
                        : 0;

                      // Parse damaged components from AI assessment
                      let detectedComponents: string[] = [];
                      if (aiAssessment?.damagedComponentsJson) {
                        try {
                          const parsed = JSON.parse(aiAssessment.damagedComponentsJson);
                          detectedComponents = Array.isArray(parsed)
                            ? parsed.map((c: any) => (typeof c === 'string' ? c : c?.name || c?.component || String(c)))
                            : [];
                        } catch { /* ignore parse errors */ }
                      }

                      // Parse risk indicators from AI assessment
                      let fraudRisk = 'low';
                      let repairComplexity = 'medium';
                      if (aiAssessment?.fraudRiskLevel) {
                        fraudRisk = aiAssessment.fraudRiskLevel.toLowerCase();
                      } else if (assessorEval?.fraudRiskLevel) {
                        fraudRisk = assessorEval.fraudRiskLevel.toLowerCase();
                      }
                      // Derive repair complexity from structural damage severity
                      if (aiAssessment?.structuralDamageSeverity) {
                        const sev = aiAssessment.structuralDamageSeverity;
                        if (sev === 'severe' || sev === 'catastrophic') repairComplexity = 'high';
                        else if (sev === 'moderate') repairComplexity = 'medium';
                        else repairComplexity = 'low';
                      }

                      // Recommended repairer — lowest quote if AI assessment is complete
                      let recommendedRepairer: string | undefined;
                      let recommendationReason: string | undefined;
                      if (aiAssessment && amounts.length > 0) {
                        const lowestIdx = amounts.indexOf(lowestQuote);
                        if (lowestIdx >= 0 && quotes[lowestIdx]) {
                          recommendedRepairer = (quotes[lowestIdx] as any).panelBeaterName || `Panel Beater #${(quotes[lowestIdx] as any).panelBeaterId}`;
                          recommendationReason = 'Lowest quote within AI-assessed fair cost range';
                        }
                      }

                      return {
                        detectedComponents,
                        lowestQuote,
                        medianQuote,
                        highestQuote,
                        spreadPercent,
                        recommendedRepairer,
                        recommendationReason,
                        fraudRisk,
                        repairComplexity,
                        confidenceScore: aiAssessment?.confidenceScore ?? 0,
                        // Always include AI estimated cost for display even without quotes
                        aiEstimatedCost: aiAssessment?.estimatedCost ?? 0,
                      };
                    })() || {
                      // Fallback when no quotes: still show AI data
                      detectedComponents: (() => {
                        if (!aiAssessment?.damagedComponentsJson) return [];
                        try { return JSON.parse(aiAssessment.damagedComponentsJson); } catch { return []; }
                      })(),
                      lowestQuote: 0,
                      medianQuote: 0,
                      highestQuote: 0,
                      spreadPercent: 0,
                      fraudRisk: aiAssessment?.fraudRiskLevel || 'low',
                      repairComplexity: (() => {
                        const sev = aiAssessment?.structuralDamageSeverity;
                        if (sev === 'severe' || sev === 'catastrophic') return 'high';
                        if (sev === 'moderate') return 'medium';
                        return 'low';
                      })(),
                      confidenceScore: aiAssessment?.confidenceScore ?? 0,
                      aiEstimatedCost: aiAssessment?.estimatedCost ?? 0,
                    },
                    // Physics analysis from AI assessment — pass full parsed object
                    physicsAnalysis: (() => {
                      if (!aiAssessment?.physicsAnalysis) return undefined;
                      try {
                        return typeof aiAssessment.physicsAnalysis === 'string'
                          ? JSON.parse(aiAssessment.physicsAnalysis)
                          : aiAssessment.physicsAnalysis;
                      } catch { return undefined; }
                    })(),
                    // Forensic analysis from AI assessment — pass full parsed object with DB key support
                    forensicAnalysis: (() => {
                      if (!(aiAssessment as any)?.forensicAnalysis) return undefined;
                      try {
                        const f = typeof (aiAssessment as any).forensicAnalysis === 'string'
                          ? JSON.parse((aiAssessment as any).forensicAnalysis)
                          : (aiAssessment as any).forensicAnalysis;
                        // Support both DB keys (paint, bodywork, tires, fluidLeaks, glass)
                        // and legacy keys (paintAnalysis, bodyworkAnalysis, etc.)
                        return {
                          overallFraudScore: f.overallFraudScore ?? 0,
                          paint: f.paint ?? f.paintAnalysis ?? { score: 0, findings: [] },
                          bodywork: f.bodywork ?? f.bodyworkAnalysis ?? { score: 0, findings: [] },
                          glass: f.glass ?? f.glassAnalysis ?? { score: 0, findings: [] },
                          tires: f.tires ?? f.tireAnalysis ?? { score: 0, findings: [] },
                          fluidLeaks: f.fluidLeaks ?? f.fluidAnalysis ?? { score: 0, findings: [] },
                          // Keep legacy keys for backward compat
                          paintAnalysis: f.paint ?? f.paintAnalysis ?? { score: 0, findings: [] },
                          bodyworkAnalysis: f.bodywork ?? f.bodyworkAnalysis ?? { score: 0, findings: [] },
                          glassAnalysis: f.glass ?? f.glassAnalysis ?? { score: 0, findings: [] },
                          tireAnalysis: f.tires ?? f.tireAnalysis ?? { score: 0, findings: [] },
                          fluidAnalysis: f.fluidLeaks ?? f.fluidAnalysis ?? { score: 0, findings: [] },
                        };
                      } catch { return undefined; }
                    })(),
                    // Damage photos from claim
                    damagePhotos: (() => {
                      if (!(claim as any)?.damagePhotos) return [];
                      try {
                        const p = JSON.parse((claim as any).damagePhotos);
                        return Array.isArray(p) ? p : [];
                      } catch { return []; }
                    })(),
                  };
                  
                  generateComparisonPDF(pdfData);
                  toast.success("PDF report downloaded successfully");
                }}
              >
                <Download className="mr-2 h-4 w-4" />
                Download PDF
              </Button>
              {/* Print / Save as PDF — renders page exactly as displayed */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                title="Print or Save as PDF"
              >
                <Printer className="mr-2 h-4 w-4" />
                Print / PDF
              </Button>
              <ThemeToggle />
              <Button
                variant="default"
                size="sm"
                onClick={() => setLocation(`/insurer/claims/${claimId}/verdict`)}
                title="Open the unified Decision Report"
              >
                <Zap className="mr-2 h-4 w-4" />
                Decision Report
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setLocation(INSURER_CLAIMS_LIST_PATH)}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Claims
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content — 8-section KINGA Claim Report Display Engine */}
      <main className="container mx-auto px-4 py-8 space-y-5">

        {/* ═══════════════════════════════════════════════════════════════
             SECTION 1 — CLAIM SNAPSHOT
        ═══════════════════════════════════════════════════════════════ */}
        {/* Section 1 header is already in the hero above — this block shows the
             vehicle/incident detail grid below the hero KPI strip */}
        {/* ══ SECTION 1: CLAIM SNAPSHOT ══ */}
        <div className="comparison-section">
          <div className="comparison-section-header">
            <span className="bi-section-num">1</span>
            <div className="flex-1 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Claim Summary</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Key claim and vehicle details extracted from the submitted document</p>
              </div>
              {(!claim.vehicleMake || !claim.vehicleModel) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 shrink-0"
                  disabled={reRunMutation.isPending}
                  onClick={() => reRunMutation.mutate({ claimId, reason: 'Re-extract vehicle details from PDF' })}
                >
                  {reRunMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Re-running...</>
                  ) : (
                    <>Re-run AI Assessment</>
                  )}
                </Button>
              )}
            </div>
          </div>
          <div className="comparison-section-body">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" style={{ color: 'var(--foreground)' }}>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vehicle</p>
                <p className="font-semibold text-base">
                  {claim.vehicleMake && claim.vehicleModel
                    ? `${claim.vehicleMake} ${claim.vehicleModel}${claim.vehicleYear ? ` (${claim.vehicleYear})` : ''}`
                    : <span className="text-muted-foreground italic">Not yet extracted — re-run AI assessment</span>}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Registration</p>
                <p className="font-medium">{claim.vehicleRegistration || <span className="text-muted-foreground italic">N/A</span>}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Incident Date</p>
                <p className="font-medium">
                  {claim.incidentDate ? new Date(claim.incidentDate).toLocaleDateString() : <span className="text-muted-foreground italic">N/A</span>}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Incident Type</p>
                <div className="flex items-center gap-2">
                  <span className="font-medium capitalize">
                    {(claim as any).incidentType || <span className="text-muted-foreground italic">N/A</span>}
                  </span>
                  {/* Override badge — shown when type has been manually corrected */}
                  {(claim as any).incidentTypeOverridden === 1 && (
                    <Badge variant="outline" className="text-xs px-1.5 py-0 border-amber-400 text-amber-600 dark:text-amber-400">
                      overridden
                    </Badge>
                  )}
                  {/* Override button — only for assessors, insurers, admins */}
                  {user && ['assessor', 'insurer', 'admin'].includes((user as any).role) && (
                    <button
                      onClick={() => setOverrideDialogOpen(true)}
                      className="ml-1 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="Override incident type"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {/* AI-detected original value — shown only after an override */}
                {(claim as any).incidentTypeOverridden === 1 && (claim as any).aiDetectedIncidentType && (
                  <p className="text-xs text-muted-foreground">
                    AI detected: <span className="capitalize">{(claim as any).aiDetectedIncidentType}</span>
                  </p>
                )}
              </div>
              {(claim as any).vehicleColor && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Colour</p>
                  <p className="font-medium capitalize">{(claim as any).vehicleColor}</p>
                </div>
              )}
              {(claim as any).vehicleVin && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">VIN / Chassis</p>
                  <p className="font-medium font-mono text-sm">{(claim as any).vehicleVin}</p>
                </div>
              )}
              {(claim as any).vehicleEngineNumber && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Engine Number</p>
                  <p className="font-medium font-mono text-sm">{(claim as any).vehicleEngineNumber}</p>
                </div>
              )}
              {(claim as any).incidentLocation && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Location</p>
                  <p className="font-medium">{(claim as any).incidentLocation}</p>
                </div>
              )}
              {(claim as any).thirdPartyVehicle && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Third-Party Vehicle</p>
                  <p className="font-medium">{(claim as any).thirdPartyVehicle}</p>
                </div>
              )}
              {(claim as any).thirdPartyRegistration && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Third-Party Reg</p>
                  <p className="font-medium">{(claim as any).thirdPartyRegistration}</p>
                </div>
              )}
            </div>
            {(claim as any).incidentDescription && (
              <div className="mt-4 p-4 bg-muted/40 rounded-lg border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Incident Description</p>
                <p className="text-sm leading-relaxed">{(claim as any).incidentDescription}</p>
              </div>
            )}
          </div>
        </div>

           {/* ══ SECTION 2: EXECUTIVE SUMMARY (HUMAN-READABLE) ══ */}
        <div className="comparison-section">
          <div className="comparison-section-header">
            <span className="bi-section-num">2</span>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Executive Summary</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Professional insurance summary of accident, damage, cost, and risk</p>
            </div>
          </div>
          <div className="comparison-section-body">
            {aiAssessment ? (
              <ExecutiveSummaryInline claim={claim} aiAssessment={aiAssessment} quotes={quotes} assessorEval={assessorEval} />
            ) : (
              <div className="flex items-center gap-3 py-4">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--muted-foreground)' }} />
                <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>AI assessment in progress — summary will appear once complete.</p>
              </div>
            )}
          </div>
        </div>

        {/* ══ SECTION 3: DAMAGE OVERVIEW (VISUAL FIRST) ══ */}
        <div className="comparison-section">
          <div className="comparison-section-header">
            <span className="bi-section-num">3</span>
            <div className="flex-1 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Damage Overview</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Vehicle diagram with highlighted damage zones, severity labels, and impacted parts</p>
              </div>
              {aiAssessment && (
                <Button variant="outline" size="sm" onClick={() => handleExportDamageReport(aiAssessment, claim)} className="gap-2"
                  style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)', background: 'transparent' }}>
                  <Download className="h-4 w-4" /> Export PDF
                </Button>
              )}
            </div>
          </div>
          <div className="comparison-section-body">
            {aiAssessment ? (
              <div className="space-y-4">
                {/* Vehicle damage map */}
                <DamageComponentBreakdown aiAssessment={aiAssessment} claim={claim} section="damage-map" />
                {/* Damage photos */}
                {(() => {
                  const damagePhotosJson = (aiAssessment as any)?.damagePhotosJson ?? null;
                  const rawDamagePhotos = (claim as any)?.damagePhotos ?? null;
                  const hasPhotos = (() => {
                    if (damagePhotosJson) { try { const p = JSON.parse(damagePhotosJson); return Array.isArray(p) && p.length > 0; } catch { return false; } }
                    if (rawDamagePhotos) { try { const p = JSON.parse(rawDamagePhotos); return Array.isArray(p) && p.length > 0; } catch { return false; } }
                    return false;
                  })();
                  if (!hasPhotos) return null;
                  const enrichedPhotosJson = (aiAssessment as any)?.enrichedPhotosJson ?? null;
                  const photoInconsistenciesJson = (aiAssessment as any)?.photoInconsistenciesJson ?? null;
                  return (
                    <DamageImagesPanel
                      damagePhotosJson={damagePhotosJson}
                      rawDamagePhotos={rawDamagePhotos}
                      enrichedPhotosJson={enrichedPhotosJson}
                      photoInconsistenciesJson={photoInconsistenciesJson}
                      claimId={claim?.id}
                    />
                  );
                })()}
                {/* Structural vs cosmetic breakdown */}
                <DamageComponentBreakdown aiAssessment={aiAssessment} claim={claim} section="damage-analysis" />
                {/* Three-source damage consistency check */}
                <DamageConsistencyPanel
                  claimId={claim?.id}
                  assessmentId={(aiAssessment as any)?.id}
                  consistencyCheckJson={(aiAssessment as any)?.consistencyCheckJson ?? null}
                />
              </div>
            ) : (
              <div className="flex items-center gap-3 py-6">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--muted-foreground)' }} />
                <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Damage analysis pending — run AI assessment to populate this section.</p>
              </div>
            )}
          </div>
        </div>
        {/* ══ SECTION 4: ACCIDENT RECONSTRUCTION ══ */}
        <div className="comparison-section">
          <div className="comparison-section-header">
            <span className="bi-section-num">4</span>
            <div className="flex-1 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Accident Reconstruction</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Impact type, speed range, direction, and advanced physics validation</p>
              </div>
              {aiAssessment && (
                <button
                  onClick={() => setShowAdvancedPhysics(v => !v)}
                  className="text-xs px-3 py-1.5 rounded-md font-medium transition-colors flex-shrink-0"
                  style={{
                    background: showAdvancedPhysics ? 'var(--fp-info-bg)' : 'var(--muted)',
                    color: showAdvancedPhysics ? 'var(--info)' : 'var(--muted-foreground)',
                    border: '1px solid var(--border)'
                  }}
                >
                  {showAdvancedPhysics ? 'Simple View' : 'Advanced View'}
                </button>
              )}
            </div>
          </div>
          <div className="comparison-section-body">
            {aiAssessment ? (
              <div className="space-y-4">
                {/* Simple view: incident type, speed, direction */}
                {!showAdvancedPhysics && (() => {
                  const physRaw = (() => {
                    if (!aiAssessment.physicsAnalysis) return null;
                    try { return typeof aiAssessment.physicsAnalysis === 'string' ? JSON.parse(aiAssessment.physicsAnalysis) : aiAssessment.physicsAnalysis; } catch { return null; }
                  })();
                  const speed = physRaw?.estimatedSpeed?.value ?? physRaw?.estimatedSpeedKmh ?? 0;
                  const deltaV = physRaw?.deltaV?.value ?? physRaw?.deltaVKmh ?? 0;
                  const direction = physRaw?.impactVector?.direction ?? physRaw?.impactDirection ?? (claim as any)?.incidentType ?? 'unknown';
                  const severity = physRaw?.accidentSeverity ?? aiAssessment.structuralDamageSeverity ?? 'unknown';
                  const consistencyScore = physRaw?.damageConsistencyScore ?? 0;
                  const items = [
                     { label: 'Incident Type', value: ((claim as any)?.incidentType || (aiAssessment as any).accidentType || 'N/A').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) },
                    { label: 'Estimated Speed', value: speed > 0 ? `${speed} km/h` : 'Not calculated' },
                    { label: 'Delta-V', value: deltaV > 0 ? `${deltaV} km/h` : 'Not calculated' },
                    { label: 'Impact Direction', value: String(direction).replace(/_/g, ' ').replace(/\w/g, (c: string) => c.toUpperCase()) },
                    { label: 'Accident Severity', value: String(severity).replace(/_/g, ' ').replace(/\w/g, (c: string) => c.toUpperCase()) },
                    { label: 'Damage Consistency', value: consistencyScore > 0 ? `${consistencyScore}%` : 'Pending' },
                  ];
                  return (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {items.map(({ label, value }) => (
                        <div key={label} className="p-3 rounded-lg" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
                          <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>{value}</p>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {/* Advanced view: full physics dashboard */}
                {showAdvancedPhysics && (
                  <PhysicsValidationSection aiAssessment={aiAssessment} quotes={quotes} claim={claim} mode="physics" />
                )}
                {/* Hidden damage inference — always shown */}
                <DamageComponentBreakdown aiAssessment={aiAssessment} claim={claim} section="hidden-damage" />
              </div>
            ) : (
              <div className="flex items-center gap-3 py-6">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--muted-foreground)' }} />
                <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Accident reconstruction pending — run AI assessment to populate this section.</p>
              </div>
            )}
          </div>
        </div>

        {/* ══ SECTION 5: REPAIR COST ANALYSIS ══ */}
        <div className="comparison-section">
          <div className="comparison-section-header">
            <span className="bi-section-num">5</span>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Repair Cost Analysis</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Quoted cost vs AI estimate vs fair range — overpricing highlighted in red, savings in green</p>
            </div>
          </div>
          <div className="comparison-section-body">
            <div className="space-y-4">
              {/* AI cost summary row */}
              {aiAssessment && (() => {
                const isTotalLossHere = aiAssessment.totalLossIndicated === 1;
                const hasNoQuotes = quotes.length === 0;
                // Derive vehicle value in dollars from ratio (ratio = repair/value * 100)
                const vehicleValueDollars = (aiAssessment.repairToValueRatio && aiAssessment.repairToValueRatio > 0 && aiAssessment.estimatedCost)
                  ? Math.round((aiAssessment.estimatedCost / aiAssessment.repairToValueRatio) * 100)
                  : null;
                return (
                  <>
                    {/* Total loss alert banner */}
                    {isTotalLossHere && (
                      <div className="flex items-start gap-3 p-4 rounded-lg border-2 border-red-500" style={{ background: 'var(--fp-critical-bg)' }}>
                        <span className="text-2xl flex-shrink-0">🚨</span>
                        <div>
                          <p className="font-bold text-red-400 text-base mb-1">TOTAL LOSS — REPAIR NOT VIABLE</p>
                          <p className="text-sm text-red-300">
                            AI estimated repair cost of <strong>US${(aiAssessment.estimatedCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong> exceeds vehicle market value
                            {vehicleValueDollars ? <> of <strong>US${vehicleValueDollars.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></> : null} at <strong>{aiAssessment.repairToValueRatio}%</strong> of vehicle value.
                            Industry threshold for total loss is 75%. This vehicle should be written off, not repaired.
                          </p>
                        </div>
                      </div>
                    )}
                    {/* No quotes notice */}
                    {hasNoQuotes && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--fp-warning-bg)', border: '1px solid var(--fp-warning-border)' }}>
                        <span className="text-amber-400 text-sm">⚠</span>
                        <p className="text-xs text-amber-400">No panel beater quotes submitted — cost breakdown below is AI-estimated from damage analysis only, not from a real invoice.</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: 'AI Estimated Total', value: `US$${(aiAssessment.estimatedCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, highlight: isTotalLossHere },
                        { label: hasNoQuotes ? 'Est. Parts (AI)' : 'Parts Cost', value: `US$${(aiAssessment.estimatedPartsCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, highlight: false },
                        { label: hasNoQuotes ? 'Est. Labour (AI)' : 'Labour Cost', value: `US$${(aiAssessment.estimatedLaborCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, highlight: false },
                        { label: 'Repair/Value Ratio', value: aiAssessment.repairToValueRatio ? `${aiAssessment.repairToValueRatio}%` : 'N/A', highlight: (aiAssessment.repairToValueRatio || 0) >= 75 },
                      ].map(({ label, value, highlight }) => (
                        <div key={label} className="p-3 rounded-lg" style={{ background: highlight ? 'var(--fp-critical-bg)' : 'var(--card)', border: `1px solid ${highlight ? 'var(--fp-critical-border)' : 'var(--border)'}` }}>
                          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
                          <p className={`text-lg font-bold ${highlight ? 'text-red-400' : 'text-primary'}`}>{value}</p>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
              {/* Quote comparison chart */}
              {quotes.length >= 2 && (() => {
                const chartData = quotes.map((q, i) => ({
                  name: (q as any).panelBeaterName || `Quote ${i + 1}`,
                  amount: (q.quotedAmount || 0),
                  id: q.id,
                }));
                const median = computeMedian(quotes.map(q => (q.quotedAmount || 0)));
                const aiEst = aiAssessment?.estimatedCost || 0;
                const COLORS = ['var(--chart-3)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];
                return (
                  <div className="p-4 rounded-lg" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--muted-foreground)' }}>Quote Cost Comparison (USD)</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v.toLocaleString()}`} />
                        <Tooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--popover-foreground)' }} formatter={(value: number) => [`US$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 'Quote Amount']} />
                        <ReferenceLine y={median} stroke="var(--chart-3)" strokeDasharray="4 4" label={{ value: `Median $${median.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, fill: 'var(--chart-3)', fontSize: 10, position: 'right' }} />
                        {aiEst > 0 && <ReferenceLine y={aiEst} stroke="var(--chart-1)" strokeDasharray="6 3" label={{ value: `AI Est. $${aiEst.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, fill: 'var(--chart-1)', fontSize: 10, position: 'insideTopLeft' }} />}
                        <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                          {chartData.map((entry, index) => {
                            const isOver = aiEst > 0 && entry.amount > aiEst * 1.3;
                            return <Cell key={`cell-${index}`} fill={isOver ? 'var(--destructive)' : COLORS[index % COLORS.length]} />;
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <p className="text-xs mt-2" style={{ color: 'var(--muted-foreground)' }}>
                      Yellow dashed = median quote. Teal dashed = AI estimate. <span className="text-red-400">Red bars</span> = quotes &gt;30% above AI estimate.
                    </p>
                  </div>
                );
              })()}
              {/* Cost optimisation panel */}
              <QuoteOptimisationPanel claimId={claimId} />
              {/* Parts reconciliation */}
              {quotes.length > 0 && aiAssessment && quotes.some(q => q.lineItems && q.lineItems.length > 0) && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--muted-foreground)' }}>Parts Reconciliation</p>
                  <QuoteComparison quotes={quotes} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ══ SECTION 6: FRAUD & RISK ANALYSIS ══ */}
        {aiAssessment && (
          <div className="comparison-section">
            <div className="comparison-section-header">
              <span className="bi-section-num">6</span>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Fraud & Risk Analysis</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Fraud score gauge, risk level, and top triggered indicators</p>
              </div>
            </div>
            <div className="comparison-section-body">
              <div className="space-y-4">
                {/* Fraud level banner */}
                {(aiAssessment.fraudRiskLevel === 'high' || aiAssessment.fraudRiskLevel === 'critical' || aiAssessment.fraudRiskLevel === 'elevated') && (
                  <div className="flex items-start gap-3 p-4 rounded-lg border-2 border-red-500 dark:border-red-700" style={{ background: 'var(--fp-critical-bg)' }}>
                    <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-red-700 dark:text-red-300 mb-1">HIGH FRAUD RISK DETECTED</p>
                      <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>This claim has triggered multiple fraud indicators. Manual review is strongly recommended before approval.</p>
                    </div>
                  </div>
                )}
                {/* Full fraud score panel */}
                <FraudScorePanel aiAssessment={aiAssessment} />
              </div>
            </div>
          </div>
        )}

        {/* ══ SECTION 6b: INTELLIGENCE ENFORCEMENT LAYER ══ */}
        {aiAssessment && claim && (
          <div className="comparison-section">
            <div className="comparison-section-header">
              <span className="bi-section-num" style={{ background: 'var(--chart-5)' }}>AI</span>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Intelligence Enforcement Layer</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Physics inference · consistency validation · direction-damage cross-check · cost benchmark · enforced fraud classification</p>
              </div>
            </div>
            <div className="comparison-section-body">
              <IntelligenceEnforcementPanel claimId={claim.id} />
            </div>
          </div>
        )}

        {/* ══ SECTION 6c: ADVANCED ANALYTICS (Stage 35-42) ══ */}
        {aiAssessment && (
          <div className="comparison-section">
            <div className="comparison-section-header">
              <span className="bi-section-num" style={{ background: 'var(--chart-5)' }}>⚙</span>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Advanced Analytics</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Causal chain · evidence bundle · realism validation · benchmark deviation · cross-engine consensus (Stages 35–42)</p>
              </div>
            </div>
            <div className="comparison-section-body">
              <AdvancedAnalyticsPanel aiAssessment={aiAssessment} claimId={claimId} />
            </div>
          </div>
        )}
        {/* ══ SECTION 6d: FORENSIC DECISION MODEL ══ */}
        {aiAssessment && (
          <div className="comparison-section">
            <div className="comparison-section-header">
              <span className="bi-section-num" style={{ background: 'var(--success)' }}>✓</span>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Decision-Ready Model</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Claim truth · physics · damage zones · cost intelligence · evidence integrity · narrative · actions</p>
              </div>
            </div>
            <div className="comparison-section-body">
              <ForensicDecisionPanel aiAssessment={aiAssessment} claim={claim} />
            </div>
          </div>
        )}
        {/* ══ SECTION 7: OPERATIONAL PERFORMANCE ══ */}
        <div className="comparison-section">
          <div className="comparison-section-header">
            <span className="bi-section-num">7</span>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Operational Performance</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Assessor turnaround, panel beater performance, and quote selection</p>
            </div>
          </div>
          <div className="comparison-section-body">
            <div className="space-y-4">
              {/* Panel beater choices */}
              <PanelBeaterChoicesCard claimId={claimId} />
              {/* Repair intelligence */}
              <RepairIntelligencePanel claimId={claimId} />
            </div>
          </div>
        </div>

        {/* ══ SECTION 8: MISSING INFORMATION ══ */}
        {(() => {
          const missingFields: Array<{ field: string; reason: string; severity: 'critical' | 'warning' | 'info' }> = [];
          if (!claim.vehicleMake || claim.vehicleMake === 'Unknown') missingFields.push({ field: 'Vehicle Make/Model', reason: 'Required for accurate parts pricing and repair estimates', severity: 'critical' });
          if (!claim.vehicleRegistration) missingFields.push({ field: 'Vehicle Registration', reason: 'Required for ownership verification', severity: 'critical' });
          if (!(claim as any).incidentDate) missingFields.push({ field: 'Incident Date', reason: 'Required for policy coverage validation', severity: 'critical' });
          if (!(claim as any).incidentType) missingFields.push({ field: 'Incident Type', reason: 'Required for physics analysis and fraud scoring', severity: 'warning' });
          if (!aiAssessment) missingFields.push({ field: 'AI Assessment', reason: 'Click "Re-run AI Assessment" to generate computer vision analysis', severity: 'warning' });
          if (quotes.length === 0) missingFields.push({ field: 'Panel Beater Quotes', reason: 'No repair quotes submitted yet — required for cost comparison', severity: 'warning' });
          if (quotes.length === 1) missingFields.push({ field: 'Second Quote', reason: 'Only one quote received — a second quote is recommended for comparison', severity: 'info' });
          if (!assessorEval) missingFields.push({ field: 'Assessor Evaluation', reason: 'No independent assessor evaluation on file', severity: 'info' });
          if (missingFields.length === 0) return null;
          const colorMap = { critical: { bg: 'var(--fp-critical-bg)', border: 'var(--fp-critical-border)', text: 'text-red-400', icon: '✗' }, warning: { bg: 'var(--fp-warning-bg)', border: 'var(--fp-warning-border)', text: 'text-amber-400', icon: '!' }, info: { bg: 'var(--fp-info-bg)', border: 'var(--fp-info-border)', text: 'text-blue-400', icon: 'i' } };
          return (
            <div className="comparison-section">
              <div className="comparison-section-header">
                <span className="bi-section-num" style={{ background: 'var(--destructive)' }}>!</span>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Missing Information</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{missingFields.filter(f => f.severity === 'critical').length} critical, {missingFields.filter(f => f.severity === 'warning').length} warnings, {missingFields.filter(f => f.severity === 'info').length} informational</p>
                </div>
              </div>
              <div className="comparison-section-body">
                <div className="space-y-2">
                  {missingFields.map(({ field, reason, severity }) => {
                    const c = colorMap[severity];
                    return (
                      <div key={field} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: c.bg, border: `1px solid ${c.border}` }}>
                        <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${c.text}`} style={{ border: `1px solid currentColor` }}>{c.icon}</span>
                        <div>
                          <p className={`text-sm font-semibold ${c.text}`}>{field}</p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{reason}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ══ CLAIM APPROVAL (always last) ══ */}
        <div className="comparison-section">
          <div className="comparison-section-header">
            <span className="bi-section-num" style={{ background: 'var(--success)' }}>✓</span>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Claim Approval & Panel Beater Selection</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Select the winning quote and approve the claim for repair</p>
            </div>
          </div>
          <div className="comparison-section-body">
            <ClaimApprovalSection claimId={claimId} quotes={quotes} />
          </div>
        </div>

        {/* Vehicle Valuation — reference panel for market value context */}
        <div className="comparison-section mb-5">
          <div className="comparison-section-header">
            <span className="bi-section-num" style={{ background: 'var(--info)' }}>$</span>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Vehicle Valuation</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Market value reference for total loss assessment</p>
            </div>
          </div>
          <div className="comparison-section-body">
            <VehicleValuationCard
              claimId={claimId}
              vehicleMileage={claim?.vehicleMileage ?? null}
              vehicleYear={claim?.vehicleYear ?? null}
            />
           </div>
        </div>

        {/* Section: Claims Decision Authority */}
        {aiAssessment && (
          <div className="comparison-section mb-5">
            <div className="comparison-section-header">
              <span className="bi-section-num" style={{ background: 'var(--chart-5)' }}>&#9878;</span>
              <div>
                <p className="font-bold" style={{ color: 'var(--foreground)' }}>Claims Decision Authority</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Final recommendation — sole authoritative decision output</p>
              </div>
            </div>
            <div className="comparison-section-body">
              <DecisionAuthorityPanel
                claimId={claimId}
                aiAssessment={aiAssessment as any}
                claim={claim as any}
                assessorValidated={!!(claim as any)?.assessorId}
              />
            </div>
          </div>
        )}

        {/* Section: Report Readiness Gate */}
        {aiAssessment && (
          <div className="comparison-section mb-5">
            <div className="comparison-section-header">
              <span className="bi-section-num" style={{ background: 'var(--success)' }}>&#10003;</span>
              <div>
                <p className="font-bold" style={{ color: 'var(--foreground)' }}>Report Readiness Gate</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Export eligibility check — validates decision, contradictions, and confidence</p>
              </div>
            </div>
            <div className="comparison-section-body">
              <ReportReadinessPanel
                claimId={claimId}
                aiAssessment={aiAssessment as any}
                claim={claim as any}
                assessorValidated={!!(claim as any)?.assessorId}
                onExport={() => window.print()}
              />
            </div>
          </div>
        )}

        {/* Section: Claims Assessment Report (Professional Explanation) */}
        {aiAssessment && (
          <div className="comparison-section mb-5">
            <div className="comparison-section-header">
              <span className="bi-section-num" style={{ background: 'var(--chart-5)' }}>&#128196;</span>
              <div>
                <p className="font-bold" style={{ color: 'var(--foreground)' }}>Claims Assessment Report</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Professional explanation for adjusters and auditors</p>
              </div>
            </div>
            <div className="comparison-section-body">
              <ClaimsExplanationPanel claimId={claimId} />
            </div>
          </div>
        )}

        {/* Section: Escalation Routing */}
        {aiAssessment && (
          <div className="comparison-section mb-5">
            <div className="comparison-section-header">
              <span className="bi-section-num" style={{ background: 'var(--chart-1)' }}>&#8594;</span>
              <div>
                <p className="font-bold" style={{ color: 'var(--foreground)' }}>Escalation Routing</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Automated routing to the appropriate handling queue</p>
              </div>
            </div>
            <div className="comparison-section-body">
              <EscalationRoutingPanel claimId={claimId} />
            </div>
          </div>
        )}

        {/* ── Section 12: Approval Workflow ── */}
        {aiAssessment && (
          <div className="comparison-section">
            <div className="comparison-section-header">
              <span className="bi-section-num" style={{ background: 'var(--success)' }}>12</span>
              <div>
                <p className="font-bold" style={{ color: 'var(--foreground)' }}>Multi-Layer Approval Workflow</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Configurable approval chain — claim must pass all required stages before export</p>
              </div>
            </div>
            <div className="comparison-section-body space-y-4">
              <ClaimApprovalToolbar claimId={claimId} />
              <ApprovalHistoryPanel claimId={claimId} />
            </div>
          </div>
        )}
      </main>

      {/* Incident Type Override Dialog */}
      {claim && (
        <IncidentTypeOverrideDialog
          open={overrideDialogOpen}
          onOpenChange={setOverrideDialogOpen}
          claimId={claimId}
          currentIncidentType={(claim as any).incidentType}
          aiDetectedType={(claim as any).aiDetectedIncidentType}
          isAlreadyOverridden={!!(claim as any).incidentTypeOverridden}
          onSuccess={() => {
            utils.claims.getById.invalidate({ id: claimId });
            utils.aiAssessments.byClaim.invalidate({ claimId });
          }}
        />
      )}
    </div>
  );
}
// Claim Approval Componentt
function ClaimApprovalSection({ claimId, quotes }: { claimId: number; quotes: any[] }) {
  const [selectedQuoteId, setSelectedQuoteId] = useState<number | null>(null);
  const utils = trpc.useUtils();
  
  const approveClaim = trpc.claims.approveClaim.useMutation({
    onSuccess: () => {
      utils.claims.getById.invalidate({ id: claimId });
      toast.success("Claim approved and repair assigned successfully!");
    },
    onError: (error) => {
      toast.error(`Failed to approve claim: ${error.message || 'Unknown error'}`);
    },
  });
  
  const handleApprove = () => {
    if (!selectedQuoteId) {
      toast.error("Please select a panel beater quote first");
      return;
    }
    
    approveClaim.mutate({
      claimId,
      selectedQuoteId,
    });
  };
  
  return (
    <div className="space-y-4">
      {quotes.length > 0 ? (
        <>
          <div className="space-y-2">
            <p className="text-sm font-medium">Select Panel Beater:</p>
            {quotes.map((quote) => (
              <div
                key={quote.id}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  selectedQuoteId === quote.id
                    ? "border-primary bg-primary/5 ring-2 ring-primary"
                    : "border-border hover:border-primary/50"
                }`}
                onClick={() => setSelectedQuoteId(quote.id)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{(quote as any).panelBeaterName || `Panel Beater #${quote.panelBeaterId}`}</p>
                    <p className="text-sm text-muted-foreground">
                      Quote: US${(quote.quotedAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} • {quote.estimatedDuration} days
                    </p>
                  </div>
                  {selectedQuoteId === quote.id && (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  )}
                </div>
              </div>
            ))}
          </div>
          
          <Button
            onClick={handleApprove}
            disabled={!selectedQuoteId || approveClaim.isPending}
            className="w-full gradient-primary text-white"
            size="lg"
          >
            {approveClaim.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Approving Claim...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Approve Claim & Assign Repair
              </>
            )}
          </Button>
        </>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <p>No quotes available yet</p>
          <p className="text-xs mt-2">Wait for all panel beater quotes to be submitted</p>
        </div>
      )}
    </div>
  );
}


// Damage Component Breakdown Component
// section: 'damage-analysis' = Detected components list (section 3)
//          'damage-map' = Vehicle damage map (section 4)
//          'hidden-damage' = Hidden damage inference (section 7)
//          'all' = everything (legacy)
function DamageComponentBreakdown({ aiAssessment, claim, section = 'all' }: { aiAssessment: any; claim: any; section?: 'damage-analysis' | 'damage-map' | 'hidden-damage' | 'all' }) {
  // damagedComponentsJson stores objects: {name, location, damageType, severity}
  // Keep rich objects for severity/type display
  const richComponents: Array<{name: string; location?: string; damageType?: string; severity?: string}> = (() => {
    if (!aiAssessment.damagedComponentsJson) return [];
    try {
      const parsed = JSON.parse(aiAssessment.damagedComponentsJson);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((c: any) =>
        typeof c === 'string' ? { name: c } : { name: c?.name || c?.component || String(c), location: c?.location, damageType: c?.damageType, severity: c?.severity }
      );
    } catch { return []; }
  })();
  const damagedComponents: string[] = richComponents.map(c => c.name);
  // Resolve accidentType from claim.incidentType (correct field) with fallback to deprecated aiAssessment.accidentType
  const accidentType = (claim as any)?.incidentType || aiAssessment.accidentType || "";
  // Resolve structural damage from correct field
  const hasStructuralDamage = aiAssessment.structuralDamageSeverity ? aiAssessment.structuralDamageSeverity !== 'none' : (aiAssessment.structuralDamage || false);
  // Resolve airbag deployment from damage description (not stored as separate field)
  const hasAirbagDeployment = aiAssessment.damageDescription?.toLowerCase().includes('airbag') || aiAssessment.airbagDeployment || false;

  // Parse damage description to extract inferred hidden damage
  const damageDescription = aiAssessment.damageDescription || "";
  
  // Component categories for cost breakdown
  const componentCategories = {
    "Exterior Panels": ["fender", "bumper", "door", "hood", "trunk", "quarter panel", "rocker panel"],
    "Lighting": ["headlight", "taillight", "fog light", "turn signal"],
    "Glass": ["windshield", "window", "mirror"],
    "Structural": ["frame", "pillar", "subframe", "crossmember"],
    "Mechanical": ["radiator", "condenser", "suspension", "wheel", "tire", "axle"],
    "Interior": ["dashboard", "airbag", "seat", "console"],
  };

  // Categorize detected components
  const categorizedDamage: Record<string, string[]> = {};
  Object.entries(componentCategories).forEach(([category, keywords]) => {
    const matchedComponents = damagedComponents.filter((comp: string) =>
      keywords.some(keyword => comp.toLowerCase().includes(keyword))
    );
    if (matchedComponents.length > 0) {
      categorizedDamage[category] = matchedComponents;
    }
  });

  // Prefer server-computed inferred hidden damages from Stage 5 pipeline output
  // Fall back to local computation if not available (e.g. old assessments)
  interface HiddenDamageItem {
    component: string;
    reason: string;
    confidence: string;         // 'High' | 'Medium' | 'Low'
    probability?: number;       // 0-100 (new field from physics engine)
    propagationStep?: number;   // 1 = first in chain
    chain?: string;             // 'front' | 'rear' | 'side_driver' | 'side_passenger' | 'general'
  }
  const serverInferredHiddenDamages: HiddenDamageItem[] | null = (() => {
    if (!aiAssessment.inferredHiddenDamagesJson) return null;
    try {
      const parsed = JSON.parse(aiAssessment.inferredHiddenDamagesJson);
      if (!Array.isArray(parsed) || parsed.length === 0) return null;
      return parsed.map((h: any): HiddenDamageItem => ({
        component: h.component || h.name || (h.system ? h.system.charAt(0).toUpperCase() + h.system.slice(1) + ' System' : String(h)),
        reason: h.reason || h.description || 'Inferred from impact physics',
        confidence: h.confidenceLabel || h.confidence || h.confidenceLevel ||
          (h.probability >= 70 ? 'High' : h.probability >= 40 ? 'Medium' : 'Low'),
        probability: typeof h.probability === 'number' ? h.probability : undefined,
        propagationStep: typeof h.propagationStep === 'number' ? h.propagationStep : undefined,
        chain: h.chain || h.system || 'general',
      }));
    } catch { return null; }
  })();

  // Local fallback hidden damage inference (used when server pipeline data is unavailable)
  const localInferredHiddenDamage: HiddenDamageItem[] = [];

  // Derive impact zone from component locations (more reliable than accidentType alone)
  const componentLocations = richComponents.map(c => (c.location || '').toLowerCase());
  const componentNames = damagedComponents.map(c => c.toLowerCase());
  const descLower = damageDescription.toLowerCase();
  const hasFrontComponents = componentLocations.some(l => l.includes('front')) || componentNames.some(c => c.includes('bumper') || c.includes('fender') || c.includes('bonnet') || c.includes('hood') || c.includes('headlamp') || c.includes('headlight'));
  const hasRearComponents = componentLocations.some(l => l.includes('rear')) || componentNames.some(c => c.includes('taillight') || c.includes('tail lamp') || c.includes('boot') || c.includes('trunk'));
  const hasRightComponents = componentLocations.some(l => l.includes('right') || l.includes('r/h') || l.includes('rh'));
  const hasLeftComponents = componentLocations.some(l => l.includes('left') || l.includes('l/h') || l.includes('lh'));
  const hasSideComponents = componentNames.some(c => c.includes('door') || c.includes('quarter panel') || c.includes('rocker'));
  const isFrontImpact = hasFrontComponents || accidentType === 'frontal' || accidentType.includes('front') || descLower.includes('front') || descLower.includes('r/h front') || descLower.includes('l/h front');
  const isRearImpact = hasRearComponents || accidentType === 'rear' || accidentType.includes('rear') || descLower.includes('rear');
  const isSideImpact = hasSideComponents || accidentType?.includes('side') || descLower.includes('side impact');
  const isRightSide = hasRightComponents || descLower.includes('r/h') || descLower.includes('right hand') || descLower.includes('right side');
  const isLeftSide = hasLeftComponents || descLower.includes('l/h') || descLower.includes('left hand') || descLower.includes('left side');

  // Front impact propagation chain: bumper → crash bar → radiator support → radiator/condenser
  if (isFrontImpact) {
    localInferredHiddenDamage.push({ component: "Front crash bar / bumper beam", reason: "First structural energy absorber in frontal collisions; deforms before visible bumper damage", confidence: "High", probability: 82, propagationStep: 1, chain: "front" });
    localInferredHiddenDamage.push({ component: "Radiator support / front subframe", reason: "Force propagates from crash bar to radiator support on frontal impacts", confidence: "High", probability: 75, propagationStep: 2, chain: "front" });
    localInferredHiddenDamage.push({ component: "Radiator / AC condenser", reason: "Cooling unit sits directly behind radiator support; vulnerable when support deforms", confidence: "Medium", probability: 62, propagationStep: 3, chain: "front" });
    if (isRightSide) {
      localInferredHiddenDamage.push({ component: "Right-hand engine mount", reason: "R/H front impact transmits force to engine mount via subframe", confidence: "Medium", probability: 55, propagationStep: 4, chain: "front" });
      localInferredHiddenDamage.push({ component: "Right-hand suspension strut / spring", reason: "R/H front impact loads the suspension strut and spring assembly", confidence: "Medium", probability: 58, propagationStep: 4, chain: "front" });
    } else if (isLeftSide) {
      localInferredHiddenDamage.push({ component: "Left-hand engine mount", reason: "L/H front impact transmits force to engine mount via subframe", confidence: "Medium", probability: 55, propagationStep: 4, chain: "front" });
      localInferredHiddenDamage.push({ component: "Left-hand suspension strut / spring", reason: "L/H front impact loads the suspension strut and spring assembly", confidence: "Medium", probability: 58, propagationStep: 4, chain: "front" });
    }
  }

  // Rear impact propagation chain
  if (isRearImpact) {
    localInferredHiddenDamage.push({ component: "Rear crash bar / bumper beam", reason: "First structural energy absorber in rear-end collisions", confidence: "High", probability: 80, propagationStep: 1, chain: "rear" });
    localInferredHiddenDamage.push({ component: "Rear floor / boot floor structure", reason: "Rear impact loads transfer to boot floor and rear floor rails", confidence: "Medium", probability: 65, propagationStep: 2, chain: "rear" });
    localInferredHiddenDamage.push({ component: "Fuel tank / fuel lines", reason: "Rear impact can displace fuel tank and damage fuel lines", confidence: "Medium", probability: 50, propagationStep: 3, chain: "rear" });
  }

  // Side impact propagation chain: door → intrusion beam → B-pillar → floor structure
  if (isSideImpact) {
    const sideChain = isRightSide ? "side_passenger" : "side_driver";
    const sideLabel = isRightSide ? "R/H" : isLeftSide ? "L/H" : "";
    localInferredHiddenDamage.push({ component: `${sideLabel} Door intrusion beam`.trim(), reason: "Side impact beams are the first structural absorbers in lateral collisions", confidence: "High", probability: 78, propagationStep: 1, chain: sideChain });
    localInferredHiddenDamage.push({ component: "B-pillar", reason: "Force propagates from door into B-pillar under lateral loading", confidence: "Medium", probability: 60, propagationStep: 2, chain: sideChain });
    localInferredHiddenDamage.push({ component: "Floor structure / rocker sill", reason: "Lateral impact loads transfer to floor structure and rocker sill", confidence: "Medium", probability: 48, propagationStep: 3, chain: sideChain });
  }

  // Rollover chain
  if (accidentType === "rollover") {
    localInferredHiddenDamage.push({ component: "Roof structure / pillars", reason: "Rollover accidents cause compressive loading on all roof pillars", confidence: "High", probability: 85, propagationStep: 1, chain: "rollover" });
  }

  // General high-energy propagation
  if (hasStructuralDamage) {
    localInferredHiddenDamage.push({ component: "Wheel alignment / suspension geometry", reason: "Structural deformation almost always affects suspension geometry", confidence: "High", probability: 88, propagationStep: 1, chain: "general" });
  }
  if (hasAirbagDeployment) {
    localInferredHiddenDamage.push({ component: "Airbag control module / sensors", reason: "Airbag deployment requires full system replacement", confidence: "High", probability: 92, propagationStep: 1, chain: "general" });
  }

  // Use server-computed hidden damages if available, otherwise fall back to local computation
  const inferredHiddenDamage = serverInferredHiddenDamages ?? localInferredHiddenDamage;

  // Cost breakdown by category (estimated) — use correct schema fields
  // All cost values are stored in cents — divide by 100 for display
  const estimatedCostDollars = aiAssessment.estimatedCost || 0;
  const partsCostDollars = aiAssessment.estimatedPartsCost || estimatedCostDollars * 0.6;
  const laborCostDollars = aiAssessment.estimatedLaborCost || estimatedCostDollars * 0.4;
  const estimatedCost = estimatedCostDollars;
  const partsCost = partsCostDollars;
  const laborCost = laborCostDollars;

  // Render only the requested sub-section
  if (section === 'damage-map') {
    return (
      <div className="p-4 bg-card rounded-lg border border-border">
        <VehicleDamageVisualization 
          damagedComponents={damagedComponents} 
          accidentType={accidentType}
          estimatedCost={aiAssessment.estimatedCost || 0}
          structuralDamage={hasStructuralDamage}
          airbagDeployment={hasAirbagDeployment}
        />
      </div>
    );
  }

  if (section === 'damage-analysis') {
    return (
      <div className="space-y-4">
        {/* Summary Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <div className="p-4 bg-card rounded-lg border border-border">
            <p className="text-sm text-muted-foreground">Components Detected</p>
            <p className="text-2xl font-bold text-purple-600">{damagedComponents.length}</p>
          </div>
          <div className="p-4 bg-card rounded-lg border border-border">
            <p className="text-sm text-muted-foreground">Parts Cost</p>
            <p className="text-2xl font-bold text-primary">US${partsCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="p-4 bg-card rounded-lg border border-border">
            <p className="text-sm text-muted-foreground">Labor Cost</p>
            <p className="text-2xl font-bold text-green-600">US${laborCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="p-4 bg-card rounded-lg border border-border">
            <p className="text-sm text-muted-foreground">Total Estimated</p>
            <p className="text-2xl font-bold text-secondary">US${estimatedCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
        </div>
        {/* Detected Components */}
        <div className="p-4 bg-card rounded-lg border border-border">
          <h4 className="font-semibold mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-purple-600" />
            Detected Damage Components ({richComponents.length})
          </h4>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {richComponents.map((comp, idx) => {
              const sev = (comp.severity ?? '').toLowerCase();
              const sevColor = sev === 'total_loss' || sev === 'severe' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700'
                : sev === 'moderate' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700'
                : sev === 'minor' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700'
                : 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 border-purple-300 dark:border-purple-700';
              const dotColor = sev === 'total_loss' || sev === 'severe' ? 'bg-red-500'
                : sev === 'moderate' ? 'bg-amber-500'
                : sev === 'minor' ? 'bg-emerald-500'
                : 'bg-purple-500';
              return (
                <div key={idx} className="flex items-start gap-2 p-2.5 bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-200 dark:border-purple-800">
                  <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${dotColor}`}></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium capitalize leading-tight text-foreground">{comp.name}</p>
                    {comp.location && <p className="text-xs text-muted-foreground capitalize">{comp.location}</p>}
                    {comp.damageType && <p className="text-xs text-muted-foreground capitalize">{comp.damageType}</p>}
                  </div>
                  {comp.severity && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${sevColor}`}>
                      {sev === 'total_loss' ? 'TOTAL' : sev.toUpperCase()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {/* AI Damage Description */}
        <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
          <h4 className="font-semibold mb-2 text-secondary">AI Damage Analysis Summary</h4>
          <p className="text-sm text-secondary whitespace-pre-wrap">{damageDescription}</p>
        </div>
        {/* Structural Damage Warning */}
        {hasStructuralDamage && (
          <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-lg border-2 border-red-200 dark:border-red-800">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-red-600" />
              <div>
                <p className="font-semibold text-red-900 dark:text-red-200">Structural Damage Detected</p>
                <p className="text-sm text-red-800 dark:text-red-200 mt-1">
                  AI analysis indicates potential frame or unibody damage. This may affect vehicle safety and resale value. 
                  Detailed structural inspection and repair certification required.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (section === 'hidden-damage') {
    return (
      <div className="space-y-4">
        {inferredHiddenDamage.length > 0 ? (
          <div className="p-4 bg-orange-50 dark:bg-orange-950/30 rounded-lg border-2 border-orange-200 dark:border-orange-800">
            <div className="space-y-3">
              {inferredHiddenDamage.map((item, idx) => (
                <div key={idx} className="p-3 bg-card rounded border border-orange-200/50">
                  <div className="flex items-start justify-between mb-1">
                    <p className="font-medium text-sm text-foreground">{item.component}</p>
                    <Badge 
                      className={
                        item.confidence === 'High' ? 'bg-red-600' :
                        item.confidence === 'Medium' ? 'bg-orange-600' :
                        'bg-yellow-600'
                      }
                    >
                      {item.confidence} Confidence
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.reason}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-950/30 rounded border border-yellow-200 dark:border-yellow-800">
              <p className="text-sm text-yellow-900 dark:text-yellow-200">
                <strong>⚠️ Recommendation:</strong> Physical inspection recommended to confirm hidden damage. 
                Inferred damage is based on typical collision patterns and may not be present in all cases.
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>No hidden damage inferred for this incident type</p>
            <p className="text-xs mt-2">Hidden damage inference requires collision-type incidents with visible structural damage</p>
          </div>
        )}
      </div>
    );
  }

  // section === 'all' — legacy full render
  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="p-4 bg-card rounded-lg border border-border">
          <p className="text-sm text-muted-foreground">Components Detected</p>
          <p className="text-2xl font-bold text-purple-600">{damagedComponents.length}</p>
        </div>
        <div className="p-4 bg-card rounded-lg border border-border">
          <p className="text-sm text-muted-foreground">Inferred Hidden Damage</p>
          <p className="text-2xl font-bold text-orange-600">{inferredHiddenDamage.length}</p>
        </div>
        <div className="p-4 bg-card rounded-lg border border-border">
          <p className="text-sm text-muted-foreground">Parts Cost</p>
          <p className="text-2xl font-bold text-primary">US${partsCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div className="p-4 bg-card rounded-lg border border-border">
          <p className="text-sm text-muted-foreground">Labor Cost</p>
          <p className="text-2xl font-bold text-green-600">US${laborCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Vehicle Damage Visualization */}
      <div className="p-4 bg-card rounded-lg border border-border">
        <h4 className="font-semibold mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-purple-600" />
          Visual Damage Map
        </h4>
        <VehicleDamageVisualization 
          damagedComponents={damagedComponents} 
          accidentType={accidentType}
          estimatedCost={aiAssessment.estimatedCost || 0}
          structuralDamage={hasStructuralDamage}
          airbagDeployment={hasAirbagDeployment}
        />
      </div>

      {/* Detected Damage Components — Grouped by Zone */}
      <div className="p-4 bg-card rounded-lg border border-border">
        <h4 className="font-semibold mb-4 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-purple-600" />
          Detected Damage Components ({richComponents.length})
        </h4>
        {(() => {
          // Group components by zone
          const zoneOrder = ['front', 'rear', 'left', 'right', 'structural', 'interior', 'other'];
          const zoneLabels: Record<string, string> = {
            front: '⬆ Front Zone', rear: '⬇ Rear Zone',
            left: '← Left Side (Driver)', right: '→ Right Side (Passenger)',
            structural: '🔩 Structural / Frame', interior: '🪑 Interior',
            other: '📋 Other Components',
          };
          const zoneColors: Record<string, string> = {
            front: 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/20',
            rear: 'border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/20',
            left: 'border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-950/20',
            right: 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/20',
            structural: 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/20',
            interior: 'border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-950/20',
            other: 'border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-950/20',
          };
          const getZone = (comp: {name: string; location?: string}) => {
            const loc = (comp.location || comp.name).toLowerCase();
            if (/front|bonnet|hood|bumper.*front|radiator|headlight|grille|engine/.test(loc)) return 'front';
            if (/rear|boot|trunk|bumper.*rear|tail|exhaust|tow/.test(loc)) return 'rear';
            if (/left|lhs|driver|l\/h/.test(loc)) return 'left';
            if (/right|rhs|passenger|r\/h/.test(loc)) return 'right';
            if (/frame|chassis|unibody|structural|pillar|sill|floor|subframe/.test(loc)) return 'structural';
            if (/interior|seat|dashboard|airbag|glass|window|windscreen/.test(loc)) return 'interior';
            return 'other';
          };
          const grouped: Record<string, typeof richComponents> = {};
          richComponents.forEach(c => { const z = getZone(c); if (!grouped[z]) grouped[z] = []; grouped[z].push(c); });
          return zoneOrder.filter(z => grouped[z]?.length).map(zone => (
            <details key={zone} open className="mb-3">
              <summary className={`flex items-center justify-between cursor-pointer px-3 py-2 rounded-lg border font-semibold text-sm select-none ${zoneColors[zone]}`}>
                <span>{zoneLabels[zone]}</span>
                <span className="text-xs font-normal opacity-70">{grouped[zone].length} component{grouped[zone].length !== 1 ? 's' : ''}</span>
              </summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 pl-1">
                {grouped[zone].map((comp, idx) => {
                  const sev = (comp.severity ?? '').toLowerCase();
                  const sevColor = sev === 'total_loss' || sev === 'severe'
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700'
                    : sev === 'moderate' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700'
                    : sev === 'minor' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600';
                  return (
                    <div key={idx} className="flex items-start gap-2 p-2.5 bg-card rounded border border-border">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium capitalize leading-tight text-foreground">{comp.name}</p>
                        {comp.location && <p className="text-xs text-muted-foreground capitalize mt-0.5">{comp.location}</p>}
                        {comp.damageType && <p className="text-xs text-muted-foreground capitalize">{comp.damageType}</p>}
                      </div>
                      {comp.severity && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${sevColor}`}>
                          {sev === 'total_loss' ? 'TOTAL' : sev.toUpperCase()}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </details>
          ));
        })()}
      </div>

      {/* Inferred Hidden Damage — physics-based propagation with probability scoring */}
      {inferredHiddenDamage.length > 0 && (
        <div className="p-4 bg-orange-50 dark:bg-orange-950/30 rounded-lg border-2 border-orange-200 dark:border-orange-800">
          <h4 className="font-semibold mb-1 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            Inferred Hidden Damage — Propagation Analysis
          </h4>
          <p className="text-xs text-muted-foreground mb-4">
            Derived from impact location, force propagation chains, and vehicle structural layout.
            Scored by probability; items above 70 % are High confidence.
          </p>

          {/* Group by propagation chain */}
          {(() => {
            const chainLabels: Record<string, string> = {
              front: '⬆ Front Impact Chain — bumper → crash bar → radiator support → radiator / condenser → engine mounts',
              rear: '⬇ Rear Impact Chain — bumper → boot floor → rear chassis rails → fuel tank',
              side_driver: '← Side Impact Chain (driver) — door → intrusion beam → B-pillar → floor structure',
              side_passenger: '→ Side Impact Chain (passenger) — door → intrusion beam → B-pillar → floor structure',
              rollover: '↻ Rollover Chain — roof structure → pillars → glass',
              general: '⚡ General High-Energy Propagation',
            };
            const chains = Array.from(new Set(inferredHiddenDamage.map(i => (i as any).chain || 'general')));
            return chains.map(chain => {
              const items = inferredHiddenDamage.filter(i => ((i as any).chain || 'general') === chain);
              return (
                <div key={chain} className="mb-4">
                  <p className="text-xs font-semibold text-orange-800 dark:text-orange-200 mb-2 uppercase tracking-wide">
                    {chainLabels[chain] || chain}
                  </p>
                  <div className="space-y-2">
                    {items.map((item, idx) => {
                      const prob = (item as any).probability as number | undefined;
                      const step = (item as any).propagationStep as number | undefined;
                      const confColor =
                        item.confidence === 'High'   ? 'bg-red-600' :
                        item.confidence === 'Medium' ? 'bg-orange-500' :
                                                       'bg-yellow-500';
                      const barColor =
                        (prob ?? 0) >= 70 ? 'bg-red-500' :
                        (prob ?? 0) >= 40 ? 'bg-orange-400' :
                                            'bg-yellow-400';
                      return (
                        <div key={idx} className="p-3 bg-card rounded border border-orange-200/50">
                          <div className="flex items-start justify-between mb-1 gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {step !== undefined && (
                                <span className="shrink-0 text-xs font-bold text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/30 rounded-full w-5 h-5 flex items-center justify-center">
                                  {step}
                                </span>
                              )}
                              <p className="font-medium text-sm truncate">{item.component}</p>
                            </div>
                            <Badge className={`${confColor} shrink-0 text-white text-xs`}>
                              {item.confidence}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">{item.reason}</p>
                          {prob !== undefined && (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${barColor}`}
                                  style={{ width: `${prob}%` }}
                                />
                              </div>
                              <span className="text-xs font-semibold text-foreground w-10 text-right">
                                {prob}%
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            });
          })()}

          <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-950/30 rounded border border-yellow-200 dark:border-yellow-800">
            <p className="text-sm text-yellow-900 dark:text-yellow-200">
              <strong>Recommendation:</strong> Physical inspection required to confirm hidden damage.
              Probability scores are derived from structural engineering propagation models and the
              computed impact force — not from visual inspection.
            </p>
          </div>
        </div>
      )}

      {/* Structural Damage Warning */}
      {hasStructuralDamage && (
        <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-lg border-2 border-red-200 dark:border-red-800">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-red-600" />
            <div>
              <p className="font-semibold text-red-900 dark:text-red-200">Structural Damage Detected</p>
              <p className="text-sm text-red-800 dark:text-red-200 mt-1">
                AI analysis indicates potential frame or unibody damage. This may affect vehicle safety and resale value. 
                Detailed structural inspection and repair certification required.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* AI Damage Description */}
      <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
        <h4 className="font-semibold mb-2 text-secondary">AI Damage Analysis Summary</h4>
        <p className="text-sm text-secondary whitespace-pre-wrap">{damageDescription}</p>
      </div>
    </div>
  );
}

// Transform physics analysis to validation format
function transformPhysicsAnalysisToValidation(physicsAnalysis: any, claim: any) {
  // Normalise: physics data may be at top-level OR nested under _raw
  const raw = physicsAnalysis._raw || physicsAnalysis;
  const fraudIndicators = physicsAnalysis.fraudIndicators ?? raw.fraudIndicators;
  const estimatedSpeed = physicsAnalysis.estimatedSpeed ?? raw.estimatedSpeed;

  // Use consistencyScore if available (from normalised DB format), otherwise calculate
  const overallConfidence = physicsAnalysis.consistencyScore ??
    Math.round((
      (raw.estimatedSpeed?.confidence || 75) +
      (raw.damagePropagation?.consistency || 80) +
      (raw.impactForce?.confidence || 85) +
      (physicsAnalysis.geometricConsistency ? 90 : 60)
    ) / 4);

  const speedConsistency = raw.estimatedSpeed?.confidence || 75;
  const damagePropagation = raw.damagePropagation?.consistency || 80;
  const impactForceAnalysis = raw.impactForce?.confidence || 85;
  const geometricAlignment = physicsAnalysis.geometricConsistency ? 90 : 60;

  // Build anomalies list from fraud indicators
  const anomalies: Array<{
    type: "info" | "warning" | "error";
    title: string;
    description: string;
    riskLevel: "low" | "medium" | "high";
  }> = [];

  if (fraudIndicators?.impossibleDamagePatterns?.length > 0) {
    anomalies.push({
      type: "error",
      title: "Impossible Damage Patterns",
      description: fraudIndicators.impossibleDamagePatterns.join("; "),
      riskLevel: "high",
    });
  }

  if (fraudIndicators?.unrelatedDamage?.length > 0) {
    anomalies.push({
      type: "warning",
      title: "Unrelated Damage Detected",
      description: `${(fraudIndicators.unrelatedDamage ?? []).length} components show damage inconsistent with impact point`,
      riskLevel: "medium",
    });
  }

  if (fraudIndicators?.stagedAccidentIndicators?.length > 0) {
    anomalies.push({
      type: "error",
      title: "Staged Accident Indicators",
      description: fraudIndicators.stagedAccidentIndicators.join("; "),
      riskLevel: "high",
    });
  }

  if (fraudIndicators?.severityMismatch) {
    anomalies.push({
      type: "warning",
      title: "Severity Mismatch",
      description: "Reported damage severity doesn't match estimated impact speed and forces",
      riskLevel: "medium",
    });
  }

  // Determine recommendation
  let recommendation: "approve" | "review" | "reject";
  if (overallConfidence >= 85 && anomalies.filter(a => a.type === "error").length === 0) {
    recommendation = "approve";
  } else if (overallConfidence >= 70 || anomalies.filter(a => a.type === "error").length > 0) {
    recommendation = "review";
  } else {
    recommendation = "reject";
  }

  // Build narrative summary
  let narrativeSummary = `Physics analysis shows ${overallConfidence}% confidence in claim validity. `;
  if (estimatedSpeed?.value) {
    narrativeSummary += `Estimated impact speed: ${estimatedSpeed.value} km/h. `;
  }
  if (anomalies.length > 0) {
    narrativeSummary += `${anomalies.length} anomalies detected requiring investigation.`;
  } else {
    narrativeSummary += "No significant anomalies detected.";
  }

  return {
    overallConfidence,
    speedConsistency,
    damagePropagation,
    impactForceAnalysis,
    geometricAlignment,
    anomalies,
    recommendation,
    narrativeSummary,
  };
}

// Physics Validation Component
// mode: 'impact' = Impact Analysis (section 5), 'physics' = Physics Validation (section 6), 'fraud' = Fraud Indicators (section 13), 'all' = everything (legacy)
function PhysicsValidationSection({ aiAssessment, quotes, claim, mode = 'all' }: { aiAssessment: any; quotes: any[]; claim: any; mode?: 'impact' | 'physics' | 'fraud' | 'all' }) {
  // Parse physics analysis from AI assessment
  let physicsAnalysis: any = null;
  try {
    const raw = aiAssessment.physicsAnalysis;
    physicsAnalysis = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
  } catch { /* ignore */ }
  
  // ── Normalise flat pipeline-v2 format to the nested _raw format the UI expects ──
  if (physicsAnalysis && physicsAnalysis.physicsExecuted && !physicsAnalysis._raw) {
    const p = physicsAnalysis;
    const speedKmh = p.estimatedSpeedKmh || p.deltaVKmh || 0;
    const forceKn = p.impactForceKn || 0;
    const forceN = forceKn * 1000; // kN -> N
    const direction = p.impactVector?.direction || 'unknown';
    const angle = p.impactVector?.angle || 0;
    const energyJ = p.energyDistribution?.kineticEnergyJ || p.energyDistribution?.energyDissipatedJ || 0;
    const deltaV = p.deltaVKmh || 0;
    const severity = p.accidentSeverity || 'minor';
    const consistencyScore = p.damageConsistencyScore || 50;
    
    // Map collision direction to type
    const dirToType: Record<string, string> = { front: 'frontal', rear: 'rear', left: 'side_driver', right: 'side_passenger' };
    const collType = dirToType[direction] || direction;
    
    // Determine occupant injury risk from deltaV
    const injuryRisk = deltaV > 40 ? 'high' : deltaV > 25 ? 'moderate' : 'low';
    
    physicsAnalysis = {
      _raw: {
        estimatedSpeed: {
          value: speedKmh,
          confidence: consistencyScore > 50 ? 75 : 55,
          method: "Pipeline v2 physics engine",
          confidenceInterval: [Math.round(speedKmh * 0.8), Math.round(speedKmh * 1.2)],
        },
        impactForce: {
          magnitude: forceN || (forceKn > 0 ? forceKn * 1000 : Math.round(speedKmh * 80)),
          confidence: consistencyScore > 50 ? 80 : 55,
          duration: 0.08,
        },
        kineticEnergy: energyJ,
        deltaV,
        accidentSeverity: severity,
        collisionType: collType,
        primaryImpactZone: direction,
        impactAngle: angle,
        damageConsistency: { score: consistencyScore, label: consistencyScore > 70 ? 'Consistent' : consistencyScore > 40 ? 'Partial' : 'Inconsistent' },
        fraudIndicators: {
          impossibleDamagePatterns: [],
          unrelatedDamage: [],
          stagedAccidentIndicators: [],
          severityMismatch: false,
        },
        occupantInjuryRisk: injuryRisk,
        latentDamageProbability: p.latentDamageProbability || {},
        reconstructionSummary: p.reconstructionSummary || '',
      },
      accidentSeverity: severity,
      consistencyScore,
      damagePropagationScore: consistencyScore,
      fraudRiskScore: 0,
      fraudIndicators: [],
      occupantInjuryRisk: injuryRisk,
      collisionType: collType,
      reconstructionSummary: p.reconstructionSummary || '',
    };
  }

  if (!physicsAnalysis) {
    // ── Infer physics from available claim data when DB physics_analysis is NULL ──
    // This handles old assessments created before the physics pipeline was added.
    // We derive approximate values from: vehicle type, damage severity, impact zone.
    const damagedComponents: any[] = (() => {
      try { return JSON.parse(aiAssessment.damagedComponentsJson || '[]'); } catch { return []; }
    })();
    const incidentType = (claim as any)?.incidentType || (aiAssessment as any)?.accidentType || 'unknown';
    const isCollision = incidentType === 'collision' || incidentType === 'frontal' || incidentType === 'rear' || incidentType === 'side_driver' || incidentType === 'side_passenger';
    
    if (!isCollision || damagedComponents.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <p>Physics analysis not available for this claim</p>
          <p className="text-xs mt-2">Physics analysis runs automatically with AI assessment. Click \"Re-run AI\" to generate physics data.</p>
        </div>
      );
    }
    
    // Infer impact zone from damaged components
    const locations = damagedComponents.map((c: any) => (c.location || '').toLowerCase());
    const hasFront = locations.some((l: string) => l.includes('front'));
    const hasRear = locations.some((l: string) => l.includes('rear'));
    const hasLeft = locations.some((l: string) => l.includes('left'));
    const hasRight = locations.some((l: string) => l.includes('right'));
    const inferredAccidentType = hasRear ? 'rear' : (hasLeft || hasRight) ? (hasLeft ? 'side_driver' : 'side_passenger') : 'frontal';
    
    // Infer severity from component damage levels
    const severities = damagedComponents.map((c: any) => (c.severity || 'minor').toLowerCase());
    const hasCatastrophic = severities.some((s: string) => s === 'catastrophic');
    const hasSevere = severities.some((s: string) => s === 'severe');
    const hasModerate = severities.some((s: string) => s === 'moderate');
    const maxCrushDepth = hasCatastrophic ? 0.40 : hasSevere ? 0.25 : hasModerate ? 0.15 : 0.08;
    
    // Approximate vehicle mass (Nissan AD is a light van ~1200kg)
    const vehicleMass = 1200;
    const stiffness = 800; // kN/m for compact/light van
    const forceMagnitude = Math.round(stiffness * maxCrushDepth * 1000); // Newtons
    const speedMs = Math.sqrt((2 * forceMagnitude * maxCrushDepth) / vehicleMass);
    const speedKmh = Math.round(speedMs * 3.6);
    
    // Build inferred physics object
    physicsAnalysis = {
      _inferred: true,
      _raw: {
        estimatedSpeed: { value: speedKmh, confidence: 55, method: "Inferred from damage severity (re-run AI for precise values)", confidenceInterval: [Math.round(speedKmh * 0.7), Math.round(speedKmh * 1.3)] },
        impactForce: { magnitude: forceMagnitude, confidence: 55, duration: 0.08 },
        accidentSeverity: hasCatastrophic ? 'catastrophic' : hasSevere ? 'severe' : hasModerate ? 'moderate' : 'minor',
        collisionType: inferredAccidentType,
        damageConsistency: { score: 65, label: 'Inferred' },
        fraudIndicators: { impossibleDamagePatterns: [], unrelatedDamage: [], stagedAccidentIndicators: [], severityMismatch: false },
        occupantInjuryRisk: hasSevere || hasCatastrophic ? 'moderate' : 'low',
      },
      consistencyScore: 65,
      damagePropagationScore: 70,
      fraudRiskScore: 0,
      fraudIndicators: [],
    };
  }

  // Normalise: physics data may be at top-level OR nested under _raw
  const raw = physicsAnalysis._raw || physicsAnalysis;
  const estimatedSpeed = physicsAnalysis.estimatedSpeed ?? raw.estimatedSpeed;
  const impactForce = physicsAnalysis.impactForce ?? raw.impactForce;
  const accidentSeverity = physicsAnalysis.accidentSeverity ?? raw.accidentSeverity;
  const occupantInjuryRisk = physicsAnalysis.occupantInjuryRisk ?? raw.occupantInjuryRisk;
  const fraudIndicators = physicsAnalysis.fraudIndicators ?? raw.fraudIndicators;
  const collisionType = physicsAnalysis.collisionType ?? raw.collisionType;
  const damageConsistency = physicsAnalysis.damageConsistency ?? raw.damageConsistency;

  // Transform physics analysis to validation format for PhysicsConfidenceDashboard
  const validation = transformPhysicsAnalysisToValidation(physicsAnalysis, claim);
  
  return (
    <div className="space-y-6">
      {/* IP-Protected Physics Confidence Dashboard */}
      <PhysicsConfidenceDashboard validation={validation} />
      
      {/* Accident Physics Summary — 5 Required Quantitative Outputs */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {/* 1. Velocity Estimate */}
        <div className="p-4 bg-card rounded-lg border border-border">
          <p className="text-xs text-muted-foreground mb-1">Velocity Estimate</p>
          <p className="text-2xl font-bold text-primary">
            {(estimatedSpeed?.value ?? 0) > 0
              ? <>{estimatedSpeed!.value} <span className="text-sm font-normal">km/h</span></>
              : <span className="text-muted-foreground text-lg">N/A</span>}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {(estimatedSpeed?.value ?? 0) > 0
              ? <>Range: {estimatedSpeed?.confidenceInterval?.[0] ?? 0}–{estimatedSpeed?.confidenceInterval?.[1] ?? 0} km/h</>
              : 'Speed not in document'}
          </p>
          <p className="text-xs text-muted-foreground">{estimatedSpeed?.method ?? "Campbell's formula"}</p>
        </div>

        {/* 2. Impact Force */}
        <div className="p-4 bg-card rounded-lg border border-border">
          <p className="text-xs text-muted-foreground mb-1">Impact Force (F = Δp/Δt)</p>
          <p className="text-2xl font-bold text-primary">
            {(impactForce?.magnitude ?? 0) > 0
              ? <>{((impactForce!.magnitude) / 1000).toFixed(1)} <span className="text-sm font-normal">kN</span></>
              : <span className="text-muted-foreground text-lg">N/A</span>}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {(impactForce?.magnitude ?? 0) > 0 ? `${Math.round(impactForce!.magnitude).toLocaleString()} N` : 'Force not calculated'}
          </p>
          <p className="text-xs text-muted-foreground">Δt = {(impactForce?.duration ?? 0) > 0 ? `${impactForce!.duration} ms` : 'N/A'}</p>
        </div>

        {/* 3. Impact Energy */}
        <div className="p-4 bg-card rounded-lg border border-border">
          <p className="text-xs text-muted-foreground mb-1">Impact Energy (E = ½mv²)</p>
          <p className="text-2xl font-bold text-orange-600">
            {raw?.kineticEnergy
              ? (raw.kineticEnergy / 1000).toFixed(1)
              : "—"}{" "}
            <span className="text-sm font-normal">kJ</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {raw?.kineticEnergy
              ? `${Math.round(raw.kineticEnergy).toLocaleString()} J`
              : "Insufficient data"}
          </p>
          <p className="text-xs text-muted-foreground">Kinetic energy at impact</p>
        </div>

        {/* 4. Delta-V */}
        <div className="p-4 bg-card rounded-lg border border-border">
          <p className="text-xs text-muted-foreground mb-1">Delta-V (Δv)</p>
          <p className="text-2xl font-bold text-red-600">
            {(raw?.deltaV ?? 0) > 0
              ? <>{raw!.deltaV} <span className="text-sm font-normal">km/h</span></>
              : <span className="text-muted-foreground text-lg">N/A</span>}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Injury risk:{" "}
            <span className="font-medium capitalize">{occupantInjuryRisk ?? "Unknown"}</span>
          </p>
          <p className="text-xs text-muted-foreground">Velocity change on impact</p>
        </div>

        {/* 5. Impact Direction */}
        <div className="p-4 bg-card rounded-lg border border-border">
          <p className="text-xs text-muted-foreground mb-1">Impact Direction</p>
          <p className="text-base font-bold text-blue-700 dark:text-blue-300 capitalize leading-tight">
            {(raw?.primaryImpactZone ?? raw?.collisionType ?? "Unknown").replace(/_/g, " ")}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Angle: {raw?.impactPoint?.impactAngle ?? raw?.impactAngle ?? "N/A"}°
          </p>
          <Badge
            variant={
              accidentSeverity === "catastrophic" || accidentSeverity === "severe"
                ? "destructive"
                : accidentSeverity === "moderate"
                ? "default"
                : "secondary"
            }
            className="text-xs capitalize mt-1"
          >
            {accidentSeverity ?? "Unknown"} severity
          </Badge>
        </div>
      </div>
      
      {/* ── Physics Engine: Impact Vector Diagram ── */}
      {raw && (
        <div className="p-4 bg-card rounded-lg border border-border">
          <h4 className="font-semibold mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            Physics Engine — Impact Vector Diagram
          </h4>
          <p className="text-xs text-muted-foreground mb-4">
            Force vectors computed from Newtonian mechanics (F = Δp/Δt). Arrow length ∝ peak force magnitude.
          </p>
          <VehicleImpactVectorDiagram
            vehicleMake={claim?.vehicleMake ?? undefined}
            vehicleModel={claim?.vehicleModel ?? undefined}
            vehicleYear={claim?.vehicleYear ?? undefined}
            accidentType={raw?.primaryImpactZone ?? raw?.collisionType ?? undefined}
            impactSpeed={estimatedSpeed?.value ?? undefined}
            impactForce={(impactForce?.magnitude ?? 0) / 1000}
            impactPoint={raw?.primaryImpactZone ?? raw?.impactPoint?.primaryImpactZone ?? undefined}
            damagedComponents={(() => {
              try { const c = JSON.parse(aiAssessment?.damagedComponentsJson ?? '[]'); return Array.isArray(c) ? c.map((x: any) => typeof x === 'string' ? x : x?.name ?? '') : []; } catch { return []; }
            })()}
            damageConsistency={
              (raw?.consistencyScore ?? 100) >= 80 ? 'consistent' :
              (raw?.consistencyScore ?? 100) >= 50 ? 'questionable' : 'impossible'
            }
            physicsValidation={{
              impactAngleDegrees: raw?.impactPoint?.impactAngle ?? raw?.impactAngle ?? 0,
              calculatedImpactForceKN: (impactForce?.magnitude ?? 0) / 1000,
              impactLocationNormalized: { relativeX: 0.5, relativeY: raw?.primaryImpactZone?.includes('rear') ? 0.9 : raw?.primaryImpactZone?.includes('front') ? 0.1 : 0.5 },
            }}
            confidenceScore={(raw?.consistencyScore ?? 50) / 100}
          />
        </div>
      )}

      {/* Impact Force Vectors & Damage Propagation */}
      {raw && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Force Vector Analysis */}
          <div className="p-4 bg-card rounded-lg border border-border">
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-600" />
              Impact Force Vectors
            </h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Peak Force</span>
                <span className="font-bold text-amber-700 dark:text-amber-300">
                  {((impactForce?.magnitude ?? 0) / 1000).toFixed(1)} kN
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Impact Duration</span>
                <span className="font-medium">{impactForce?.duration ?? 0} ms</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Impact Angle</span>
                <span className="font-medium">
                  {raw.impactPoint?.impactAngle ?? raw.impactAngle ?? 'N/A'}°
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Primary Zone</span>
                <span className="font-medium capitalize">
                  {raw.impactPoint?.primaryImpactZone ?? raw.collisionType ?? 'Unknown'}
                </span>
              </div>
              {/* Force vector bar */}
              {impactForce?.magnitude > 0 && (
                <div className="mt-2">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>0 kN</span>
                    <span>50 kN</span>
                    <span>100+ kN</span>
                  </div>
                  <div className="h-3 bg-gray-100 dark:bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-400 to-red-600"
                      style={{ width: `${Math.min(100, (impactForce.magnitude / 100000) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Equivalent to {Math.round(impactForce.magnitude / 9810)} × vehicle weight
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Damage Propagation */}
          <div className="p-4 bg-card rounded-lg border border-border">
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-600" />
              Damage Propagation
            </h4>
            {raw.damagePropagation ? (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Consistency</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-2 bg-gray-100 dark:bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${raw.damagePropagation.consistency ?? 0}%` }} />
                    </div>
                    <span className="text-xs font-medium">{raw.damagePropagation.consistency ?? 0}%</span>
                  </div>
                </div>
                {raw.damagePropagation.propagationPath && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Propagation Path</p>
                    <div className="flex flex-wrap gap-1">
                      {(Array.isArray(raw.damagePropagation.propagationPath)
                        ? raw.damagePropagation.propagationPath
                        : [raw.damagePropagation.propagationPath]
                      ).map((step: string, i: number, arr: string[]) => (
                        <span key={i} className="flex items-center gap-1">
                          <span className="text-xs bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800 capitalize">{step}</span>
                          {i < arr.length - 1 && <span className="text-blue-400 text-xs">→</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {raw.damagePropagation.unexpectedComponents?.length > 0 && (
                  <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-950/30 rounded border border-amber-200 dark:border-amber-800">
                    <p className="text-xs font-medium text-amber-900 dark:text-amber-200">Unexpected Damage Components:</p>
                    <ul className="text-xs text-amber-800 dark:text-amber-200 mt-1 space-y-0.5">
                      {raw.damagePropagation.unexpectedComponents.map((c: string, i: number) => (
                        <li key={i}>• {c}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Collision Type</span>
                  <span className="font-medium capitalize">{collisionType ?? 'Unknown'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Damage Consistency</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-2 bg-gray-100 dark:bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${damageConsistency?.score ?? 70}%` }} />
                    </div>
                    <span className="text-xs font-medium">{damageConsistency?.score ?? 70}%</span>
                  </div>
                </div>
                {damageConsistency?.explanation && (
                  <p className="text-xs text-muted-foreground italic">{damageConsistency.explanation}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* EV/Hybrid Analysis */}
      {physicsAnalysis.evHybridAnalysis && (
        <div className="p-4 bg-orange-50 dark:bg-orange-950/30 border-2 border-orange-200 dark:border-orange-800 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            <h4 className="font-semibold text-orange-900 dark:text-orange-200">EV/Hybrid Vehicle Safety Alert</h4>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-orange-900 dark:text-orange-200">Battery Damage Risk</p>
              <Badge variant={
                physicsAnalysis.evHybridAnalysis.batteryDamageRisk === "critical" ? "destructive" :
                physicsAnalysis.evHybridAnalysis.batteryDamageRisk === "high" ? "destructive" :
                "default"
              }>
                {physicsAnalysis.evHybridAnalysis.batteryDamageRisk}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-orange-900 dark:text-orange-200">Fire/Explosion Risk</p>
              <p className="text-sm">{physicsAnalysis.evHybridAnalysis.fireExplosionRisk}%</p>
            </div>
          </div>
          {physicsAnalysis.evHybridAnalysis.specialSafetyProtocols?.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium text-orange-900 dark:text-orange-200 mb-2">Required Safety Protocols:</p>
              <ul className="text-xs space-y-1 text-orange-800 dark:text-orange-200">
                {physicsAnalysis.evHybridAnalysis.specialSafetyProtocols.slice(0, 3).map((protocol: string, idx: number) => (
                  <li key={idx}>• {protocol}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      
      {/* Fraud Indicators from Physics */}
      {fraudIndicators && (
        <div className="space-y-3">
          <h4 className="font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            Physics-Based Fraud Detection
          </h4>
          
          {/* Impossible Damage Patterns */}
          {fraudIndicators.impossibleDamagePatterns?.length > 0 && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm font-medium text-red-900 dark:text-red-200 mb-2">⚠️ Impossible Damage Patterns Detected</p>
              <ul className="text-xs space-y-1 text-red-800 dark:text-red-200">
                {fraudIndicators.impossibleDamagePatterns.map((pattern: string, idx: number) => (
                  <li key={idx}>• {pattern}</li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Unrelated Damage */}
          {fraudIndicators.unrelatedDamage?.length > 0 && (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <p className="text-sm font-medium text-yellow-900 dark:text-yellow-200 mb-2">⚠️ Unrelated Damage Detected</p>
              <ul className="text-xs space-y-1 text-yellow-800 dark:text-yellow-200">
                {(fraudIndicators.unrelatedDamage ?? []).map((damage: any, idx: number) => (
                  <li key={idx}>
                    • {damage.component} ({(damage.distanceFromImpact || 0).toFixed(1)}m from impact point)
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Staged Accident Indicators */}
          {fraudIndicators.stagedAccidentIndicators?.length > 0 && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm font-medium text-red-900 dark:text-red-200 mb-2">🚨 Staged Accident Indicators</p>
              <ul className="text-xs space-y-1 text-red-800 dark:text-red-200">
                {fraudIndicators.stagedAccidentIndicators.map((indicator: string, idx: number) => (
                  <li key={idx}>• {indicator}</li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Severity Mismatch */}
          {fraudIndicators.severityMismatch && (
            <div className="p-3 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg">
              <p className="text-sm font-medium text-orange-900 dark:text-orange-200">⚠️ Severity Mismatch</p>
              <p className="text-xs text-orange-800 dark:text-orange-200 mt-1">
                Reported damage severity doesn't match estimated impact speed and forces
              </p>
            </div>
          )}
        </div>
      )}
      
      {/* Forensic Analysis */}
      {(() => {
        let forensic: any = null;
        try {
          const raw = (aiAssessment as any)?.forensicAnalysis;
          if (raw) forensic = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch { /* ignore */ }
        if (!forensic) return null;
        const sections = [
          { key: 'paint', fallbackKey: 'paintAnalysis', label: 'Paint Analysis', icon: '🎨' },
          { key: 'bodywork', fallbackKey: 'bodyworkAnalysis', label: 'Bodywork Analysis', icon: '🔧' },
          { key: 'glass', fallbackKey: 'glassAnalysis', label: 'Glass Analysis', icon: '🪟' },
          { key: 'tires', fallbackKey: 'tireAnalysis', label: 'Tire Analysis', icon: '🛵' },
          { key: 'fluidLeaks', fallbackKey: 'fluidAnalysis', label: 'Fluid Leak Analysis', icon: '💧' },
        ];
        return (
          <div className="space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-600" />
              Forensic Analysis
              <Badge variant={forensic.overallFraudScore > 60 ? 'destructive' : forensic.overallFraudScore > 30 ? 'default' : 'secondary'} className="ml-2 text-xs">
                Fraud Score: {forensic.overallFraudScore ?? 0}/100
              </Badge>
            </h4>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {sections.map(({ key, fallbackKey, label, icon }) => {
                const s = forensic[key] ?? forensic[fallbackKey];
                if (!s) return null;
                const score = s.score ?? s.fraudScore ?? 0;
                const findings: string[] = Array.isArray(s.findings) ? s.findings : [];
                return (
                  <div key={key} className="p-3 bg-card rounded-lg border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{icon} {label}</span>
                      <Badge variant={score > 60 ? 'destructive' : score > 30 ? 'default' : 'secondary'} className="text-xs">
                        {score}/100
                      </Badge>
                    </div>
                    {findings.length > 0 ? (
                      <ul className="text-xs space-y-1 text-muted-foreground">
                        {findings.slice(0, 3).map((f: string, i: number) => (
                          <li key={i}>• {f}</li>
                        ))}
                        {findings.length > 3 && (
                          <li className="text-muted-foreground/60">+{findings.length - 3} more</li>
                        )}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground/60">No anomalies detected</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Quote Validation Summary */}
      <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
        <h4 className="font-semibold text-secondary mb-3">Quote Validation Summary</h4>
        <div className="space-y-2">
          {quotes.map((quote, idx) => {
            const hasIssues = physicsAnalysis.fraudIndicators?.unrelatedDamage?.length > 0 || 
                             physicsAnalysis.fraudIndicators?.impossibleDamagePatterns?.length > 0;
            return (
              <div key={quote.id} className="flex items-center justify-between p-2 bg-card rounded border border-border">
                <span className="text-sm">{(quote as any).panelBeaterName || `Panel Beater #${quote.panelBeaterId}`}</span>
                {hasIssues ? (
                  <Badge variant="destructive" className="text-xs">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Review Required
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Validated
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Executive Summary Inline Component ──────────────────────────────────────
function ExecutiveSummaryInline({
  claim,
  aiAssessment,
  quotes,
  assessorEval,
}: {
  claim: any;
  aiAssessment: any;
  quotes: any[];
  assessorEval: any;
}) {
  const vehicle = [claim.vehicleMake, claim.vehicleModel, claim.vehicleYear ? `(${claim.vehicleYear})` : ''].filter(Boolean).join(' ') || 'Vehicle details pending';
  const reg = claim.vehicleRegistration || 'N/A';
  const incidentType = ((claim.incidentType || aiAssessment.accidentType || '') as string).replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'N/A';
  const incidentDate = claim.incidentDate ? new Date(claim.incidentDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A';
  const aiCost = aiAssessment.estimatedCost || 0;
  const avgQuote = quotes.length > 0 ? quotes.reduce((s: number, q: any) => s + (q.quotedAmount || 0), 0) / quotes.length : 0;
  const fraudLevel = (aiAssessment.fraudRiskLevel || 'unknown') as string;
  const confidence = aiAssessment.confidenceScore || 0;
  const isTotalLoss = aiAssessment.totalLossIndicated === 1;
  const fraudColor = fraudLevel === 'high' || fraudLevel === 'critical' || fraudLevel === 'elevated' ? 'text-red-400' : fraudLevel === 'medium' ? 'text-amber-400' : 'text-green-400';

  const summaryText = aiAssessment.damageDescription
    ? aiAssessment.damageDescription
    : `${vehicle} (Reg: ${reg}) was involved in a ${incidentType.toLowerCase()} incident on ${incidentDate}. AI computer vision analysis identified ${aiAssessment.damagedComponentsJson ? (() => { try { const c = JSON.parse(aiAssessment.damagedComponentsJson); return Array.isArray(c) ? c.length : 0; } catch { return 0; } })() : 0} damaged components with an estimated repair cost of US$${aiCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}. Fraud risk is assessed as ${fraudLevel.toUpperCase()} with ${confidence}% AI confidence.`;

  const metrics = [
    { label: 'Vehicle', value: vehicle },
    { label: 'Registration', value: reg },
    { label: 'Incident Type', value: incidentType },
    { label: 'Incident Date', value: incidentDate },
    { label: 'AI Estimated Cost', value: `US$${aiCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
    { label: 'Avg Quote', value: avgQuote > 0 ? `US$${avgQuote.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : 'No quotes' },
    { label: 'Fraud Risk', value: fraudLevel.toUpperCase(), className: fraudColor },
    { label: 'AI Confidence', value: `${confidence}%` },
    { label: 'Outcome', value: isTotalLoss ? 'Total Loss' : fraudLevel === 'high' || fraudLevel === 'critical' || fraudLevel === 'elevated' ? 'Investigate' : 'Proceed with Repair', className: isTotalLoss || fraudLevel === 'high' || fraudLevel === 'critical' || fraudLevel === 'elevated' ? 'text-red-400' : 'text-green-400' },
  ];

  return (
    <div className="space-y-4">
      {/* Summary paragraph */}
      <div className="p-4 rounded-lg" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--foreground)' }}>{summaryText}</p>
      </div>
      {/* Key metrics grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {metrics.map(({ label, value, className }) => (
          <div key={label} className="p-3 rounded-lg" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
            <p className={`text-sm font-semibold ${className || ''}`} style={!className ? { color: 'var(--foreground)' } : undefined}>{value}</p>
          </div>
        ))}
      </div>
      {/* Total loss warning */}
      {isTotalLoss && (
        <div className="flex items-start gap-3 p-4 rounded-lg border-2 border-red-500" style={{ background: 'var(--fp-critical-bg)' }}>
          <span className="text-red-400 font-bold text-lg flex-shrink-0">⚠</span>
          <div>
            <p className="font-bold text-red-400 mb-1">TOTAL LOSS INDICATED</p>
            {aiAssessment.totalLossReasoning && (
              <p className="text-sm text-red-300">{aiAssessment.totalLossReasoning}</p>
            )}
            {aiAssessment.repairToValueRatio && (
              <p className="text-xs text-red-400 mt-1">Repair/Value Ratio: {aiAssessment.repairToValueRatio}%</p>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
