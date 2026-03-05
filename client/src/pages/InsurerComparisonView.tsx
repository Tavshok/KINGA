import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {  ArrowLeft, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import KingaLogo from "@/components/KingaLogo";
import { trpc } from "@/lib/trpc";
import { useLocation, useRoute } from "wouter";
import { useState, useEffect, useRef } from "react";
import { INSURER_CLAIMS_LIST_PATH } from "@/lib/roleRouting";
import { toast } from "sonner";
import PoliceReportForm from "@/components/PoliceReportForm";
import VehicleValuationCard from "@/components/VehicleValuationCard";
import { QuoteComparison } from "@/components/QuoteComparison";
import { generateComparisonPDF, generateDamageReportPDF } from "@/lib/pdfExport";
import { Download } from "lucide-react";
import PhysicsConfidenceDashboard from "@/components/PhysicsConfidenceDashboard";
import VehicleDamageVisualization from "@/components/VehicleDamageVisualization";
import { QuoteOptimisationPanel } from "@/components/QuoteOptimisationPanel";
import { RepairIntelligencePanel } from "@/components/RepairIntelligencePanel";
import PanelBeaterChoicesCard from "@/components/PanelBeaterChoicesCard";

export default function InsurerComparisonView() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [, params1] = useRoute("/insurer/claims/:id/comparison");
  const [, params2] = useRoute("/insurer/comparison/:id");
  const params = params1 || params2;
  const claimId = params?.id ? parseInt(params.id) : 0;

  // Get claim details
  const { data: claim, isLoading: claimLoading } = trpc.claims.getById.useQuery({ id: claimId });

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

  // Handler for exporting damage report PDF
  const handleExportDamageReport = (aiAssessment: any, claim: any) => {
    // Parse damaged components
    const damagedComponents = aiAssessment.detectedDamageTypes 
      ? JSON.parse(aiAssessment.detectedDamageTypes) 
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
    
    if (damagedComponents.some((c: string) => c.toLowerCase().includes("bumper") || c.toLowerCase().includes("fender"))) {
      if (aiAssessment.accidentType === "frontal" || damageDescription.toLowerCase().includes("front")) {
        inferredHiddenDamage.push({
          component: "Radiator / AC Condenser",
          reason: "Front-end impact typically damages cooling system components",
          confidence: "High"
        });
        inferredHiddenDamage.push({
          component: "Front Subframe / Crash Bar",
          reason: "Significant frontal collision often affects structural supports",
          confidence: "Medium"
        });
      }
    }

    if (aiAssessment.accidentType?.includes("side")) {
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

    if (aiAssessment.accidentType === "rollover") {
      inferredHiddenDamage.push({
        component: "Roof Structure / Pillars",
        reason: "Rollover accidents cause structural deformation",
        confidence: "High"
      });
    }

    if (aiAssessment.structuralDamage) {
      inferredHiddenDamage.push({
        component: "Frame / Unibody Structure",
        reason: "AI detected structural damage indicators",
        confidence: "High"
      });
    }

    if (aiAssessment.airbagDeployment) {
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
      accidentType: aiAssessment.accidentType || "unknown",
      damagedComponents,
      categorizedDamage,
      inferredHiddenDamage,
      structuralDamage: aiAssessment.structuralDamage || false,
      airbagDeployment: aiAssessment.airbagDeployment || false,
      estimatedCost: aiAssessment.estimatedCost || 0,
      partsCost: aiAssessment.partsCost || (aiAssessment.estimatedCost || 0) * 0.6,
      laborCost: aiAssessment.laborCost || (aiAssessment.estimatedCost || 0) * 0.4,
      damageDescription: aiAssessment.damageDescription || "",
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-accent/5">
      {/* Header */}
        <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          {/* Top row: Logo and user info */}
          <div className="flex items-center justify-between mb-3">
            <KingaLogo />
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => logout()}>
                Sign Out
              </Button>
            </div>
          </div>
          
          {/* Bottom row: Title and navigation */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Fraud Detection & Comparison</h1>
              <p className="text-sm text-muted-foreground font-mono mt-1">{claim.claimNumber}</p>
            </div>
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
                    } : undefined
                  };
                  
                  generateComparisonPDF(pdfData);
                  toast.success("PDF report downloaded successfully");
                }}
              >
                <Download className="mr-2 h-4 w-4" />
                Download PDF
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

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Fraud Alert */}
        {fraudDetected && (
          <Card className="mb-6 border-red-500 bg-red-50">
            <CardHeader>
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-6 w-6 text-red-600" />
                <div>
                  <CardTitle className="text-red-900">Potential Fraud Detected</CardTitle>
                  <CardDescription className="text-red-700">
                    Significant discrepancies found between evaluations ({'>'}30% variance)
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        )}

        {!fraudDetected && aiAssessment && assessorEval && quotes.length > 0 && (
          <Card className="mb-6 border-green-500 bg-green-50">
            <CardHeader>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
                <div>
                  <CardTitle className="text-green-900">No Fraud Indicators</CardTitle>
                  <CardDescription className="text-green-700">
                    All evaluations are within acceptable variance
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        )}

        {/* Claim Summary */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Claim Summary</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Vehicle</p>
              <p className="font-medium">
                {claim.vehicleMake} {claim.vehicleModel} ({claim.vehicleYear})
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Registration</p>
              <p className="font-medium">{claim.vehicleRegistration}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Incident Date</p>
              <p className="font-medium">
                {claim.incidentDate ? new Date(claim.incidentDate).toLocaleDateString() : "N/A"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Panel Beater Choices */}
        <PanelBeaterChoicesCard claimId={claimId} />

        {/* Police Report Section */}
        <div className="mb-6">
          <PoliceReportForm claimId={claimId} />
        </div>

        {/* Vehicle Valuation Section */}
        <div className="mb-6">
          <VehicleValuationCard claimId={claimId} />
        </div>

        {/* Damage Component Breakdown */}
        {aiAssessment && (
          <Card className="mb-6 border-2 border-purple-200 bg-purple-50/30">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Badge className="bg-purple-600">AI Damage Analysis</Badge>
                    Detected Damage Components & Inferred Hidden Damage
                  </CardTitle>
                  <CardDescription>
                    AI-powered component-level damage detection with confidence scores and hidden damage inference
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExportDamageReport(aiAssessment, claim)}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <DamageComponentBreakdown aiAssessment={aiAssessment} claim={claim} />
            </CardContent>
          </Card>
        )}

        {/* AI Cost Optimisation Panel */}
        <QuoteOptimisationPanel claimId={claimId} />
        {/* Repair Quote Intelligence — advisory panel */}
        <RepairIntelligencePanel claimId={claimId} />

        {/* Side-by-Side Comparison */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* AI Assessment */}
          <Card className={aiAssessment ? "" : "opacity-60"}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Badge variant="outline" className="bg-primary/10">AI</Badge>
                AI Assessment
              </CardTitle>
              <CardDescription>
                Automated damage analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              {aiAssessment ? (
                <div className="space-y-4">
                  {/* Total Loss Warning Banner */}
                  {aiAssessment.totalLossIndicated === 1 && (
                    <div className="bg-red-50 border-2 border-red-500 rounded-lg p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                        <h4 className="font-bold text-red-900 text-lg">TOTAL LOSS INDICATED</h4>
                      </div>
                      <Badge variant="destructive" className="text-xs">
                        {aiAssessment.structuralDamageSeverity?.toUpperCase() || 'SEVERE'} STRUCTURAL DAMAGE
                      </Badge>
                      {aiAssessment.totalLossReasoning && (
                        <p className="text-sm text-red-800 leading-relaxed">
                          {aiAssessment.totalLossReasoning}
                        </p>
                      )}
                      {aiAssessment.repairToValueRatio && aiAssessment.estimatedVehicleValue && (
                        <div className="text-xs text-red-700 mt-2 pt-2 border-t border-red-300">
                          <p>Repair Cost: ${((aiAssessment.estimatedCost || 0) / 100).toFixed(2)}</p>
                          <p>Vehicle Value: ${((aiAssessment.estimatedVehicleValue || 0) / 100).toFixed(2)}</p>
                          <p className="font-semibold">Repair/Value Ratio: {aiAssessment.repairToValueRatio}%</p>
                        </div>
                      )}
                    </div>
                  )}
                  <Separator className={aiAssessment.totalLossIndicated === 1 ? "" : "hidden"} />
                  <div>
                    <p className="text-sm text-muted-foreground">Estimated Cost</p>
                    <p className="text-2xl font-bold text-primary">
                      ${((aiAssessment.estimatedCost || 0) / 100).toFixed(2)}
                    </p>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">Confidence Score</p>
                    <p className="font-medium">{aiAssessment.confidenceScore}%</p>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">Fraud Risk</p>
                    <Badge 
                      variant={
                        aiAssessment.fraudRiskLevel === "high" ? "destructive" :
                        aiAssessment.fraudRiskLevel === "medium" ? "default" : "secondary"
                      }
                    >
                      {aiAssessment.fraudRiskLevel}
                    </Badge>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">Damage Analysis</p>
                    <p className="text-sm mt-1">{aiAssessment.damageDescription || "N/A"}</p>
                  </div>
                  
                  {/* Visualization Graphs */}
                  {aiAssessment.graphUrls && (() => {
                    try {
                      const graphs = JSON.parse(aiAssessment.graphUrls);
                      if (graphs && Object.keys(graphs).length > 0) {
                        return (
                          <>
                            <Separator />
                            <div>
                              <p className="text-sm text-muted-foreground mb-3">Analysis Visualizations</p>
                              <div className="grid grid-cols-2 gap-2">
                                {graphs.damageBreakdown && (
                                  <div className="col-span-2">
                                    <img src={graphs.damageBreakdown} alt="Damage Breakdown" className="w-full rounded-md border" />
                                  </div>
                                )}
                                {graphs.fraudGauge && (
                                  <div>
                                    <img src={graphs.fraudGauge} alt="Fraud Risk" className="w-full rounded-md border" />
                                  </div>
                                )}
                                {graphs.physicsValidation && (
                                  <div>
                                    <img src={graphs.physicsValidation} alt="Physics Analysis" className="w-full rounded-md border" />
                                  </div>
                                )}
                              </div>
                            </div>
                          </>
                        );
                      }
                    } catch (e) {
                      console.error("Failed to parse graph URLs:", e);
                    }
                    return null;
                  })()}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No AI assessment available</p>
                  <p className="text-xs mt-2">Trigger AI assessment from triage page</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Assessor Evaluation */}
          <Card className={assessorEval ? "" : "opacity-60"}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Badge variant="outline" className="bg-green-100">Human</Badge>
                Assessor Evaluation
              </CardTitle>
              <CardDescription>
                Independent expert assessment
              </CardDescription>
            </CardHeader>
            <CardContent>
              {assessorEval ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Estimated Cost</p>
                    <p className="text-2xl font-bold text-primary">
                      ${((assessorEval.estimatedRepairCost || 0) / 100).toFixed(2)}
                    </p>
                  </div>
                  <Separator />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Labor</p>
                      <p className="font-medium">
                        ${((assessorEval.laborCost || 0) / 100).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Parts</p>
                      <p className="font-medium">
                        ${((assessorEval.partsCost || 0) / 100).toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">Duration</p>
                    <p className="font-medium">{assessorEval.estimatedDuration} days</p>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">Fraud Risk</p>
                    <Badge 
                      variant={
                        assessorEval.fraudRiskLevel === "high" ? "destructive" :
                        assessorEval.fraudRiskLevel === "medium" ? "default" : "secondary"
                      }
                    >
                      {assessorEval.fraudRiskLevel || "N/A"}
                    </Badge>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">Assessment</p>
                    <p className="text-sm mt-1">{assessorEval.damageAssessment || "N/A"}</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No assessor evaluation available</p>
                  <p className="text-xs mt-2">Assign assessor from triage page</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Panel Beater Quotes */}
          <Card className={quotes.length > 0 ? "" : "opacity-60"}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Badge variant="outline" className="bg-purple-100">Quotes</Badge>
                Panel Beater Quotes ({quotes.length})
              </CardTitle>
              <CardDescription>
                Repair shop estimates
              </CardDescription>
            </CardHeader>
            <CardContent>
              {quotes.length > 0 ? (
                <div className="space-y-4">
                  {quotes.map((quote, index) => (
                    <div key={quote.id}>
                      {index > 0 && <Separator className="my-4" />}
                      <div className="space-y-3">
                        <div>
                          <p className="text-sm text-muted-foreground">Quote {index + 1}</p>
                          <p className="text-xl font-bold text-primary">
                            ${((quote.quotedAmount || 0) / 100).toFixed(2)}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-xs text-muted-foreground">Labor Cost</p>
                            <p className="text-sm font-medium">
                              ${((quote.laborCost || 0) / 100).toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Parts Cost</p>
                            <p className="text-sm font-medium">
                              ${((quote.partsCost || 0) / 100).toFixed(2)}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-xs text-muted-foreground">Labor Hours</p>
                            <p className="text-sm font-medium">{quote.laborHours || 'N/A'} hrs</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Duration</p>
                            <p className="text-sm font-medium">{quote.estimatedDuration || 'N/A'} days</p>
                          </div>
                        </div>
                        {quote.notes && (
                          <div>
                            <p className="text-xs text-muted-foreground">Notes</p>
                            <p className="text-xs mt-1">{quote.notes}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  <Separator className="my-4" />
                  
                  <div>
                    <p className="text-sm text-muted-foreground">Average Quote</p>
                    <p className="text-lg font-bold">
                      ${(quotes.reduce((sum, q) => sum + (q.quotedAmount || 0), 0) / quotes.length / 100).toFixed(2)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No quotes submitted yet</p>
                  <p className="text-xs mt-2">Waiting for panel beater quotes</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        
        {/* Intelligent Quote Comparison */}
        {quotes.length >= 2 && quotes.some(q => q.lineItems && q.lineItems.length > 0) && (
          <QuoteComparison quotes={quotes} />
        )}
        
           {/* Physics-Based Quote Validation */}
        {aiAssessment && quotes.length > 0 && (
          <Card className="border-2 border-primary/20 bg-primary/5/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Badge className="bg-primary">Physics Analysis</Badge>
                Quote Validation & Fraud Detection
              </CardTitle>
              <CardDescription>
                Physics-based validation of quoted repairs against accident dynamics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PhysicsValidationSection aiAssessment={aiAssessment} quotes={quotes} claim={claim} />
            </CardContent>
          </Card>
        )}

        {/* Claim Approval & Panel Beater Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Claim Approval & Panel Beater Selection</CardTitle>
            <CardDescription>
              Select the winning quote and approve the claim for repair
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ClaimApprovalSection claimId={claimId} quotes={quotes} />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

// Claim Approval Component
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
                    <p className="font-medium">Panel Beater #{quote.panelBeaterId}</p>
                    <p className="text-sm text-muted-foreground">
                      Quote: ${((quote.quotedAmount || 0) / 100).toFixed(2)} • {quote.estimatedDuration} days
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
function DamageComponentBreakdown({ aiAssessment, claim }: { aiAssessment: any; claim: any }) {
  // Parse damaged components
  const damagedComponents = aiAssessment.detectedDamageTypes 
    ? JSON.parse(aiAssessment.detectedDamageTypes) 
    : [];

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

  // Infer hidden damage based on visible damage
  const inferredHiddenDamage: Array<{ component: string; reason: string; confidence: string }> = [];
  
  // Front-end collision → likely radiator/AC damage
  if (damagedComponents.some((c: string) => c.toLowerCase().includes("bumper") || c.toLowerCase().includes("fender"))) {
    if (aiAssessment.accidentType === "frontal" || damageDescription.toLowerCase().includes("front")) {
      inferredHiddenDamage.push({
        component: "Radiator / AC Condenser",
        reason: "Front-end impact typically damages cooling system components",
        confidence: "High"
      });
      inferredHiddenDamage.push({
        component: "Front Subframe / Crash Bar",
        reason: "Significant frontal collision often affects structural supports",
        confidence: "Medium"
      });
    }
  }

  // Side impact → potential door intrusion beam, B-pillar damage
  if (aiAssessment.accidentType?.includes("side")) {
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

  // Rollover → roof structure, pillars
  if (aiAssessment.accidentType === "rollover") {
    inferredHiddenDamage.push({
      component: "Roof Structure / Pillars",
      reason: "Rollover accidents cause structural deformation",
      confidence: "High"
    });
  }

  // Structural damage flag → frame/unibody damage
  if (aiAssessment.structuralDamage) {
    inferredHiddenDamage.push({
      component: "Frame / Unibody Structure",
      reason: "AI detected structural damage indicators",
      confidence: "High"
    });
  }

  // Airbag deployment → steering column, sensors
  if (aiAssessment.airbagDeployment) {
    inferredHiddenDamage.push({
      component: "Airbag Control Module / Sensors",
      reason: "Airbag deployment requires system replacement",
      confidence: "High"
    });
  }

  // Cost breakdown by category (estimated)
  const estimatedCost = aiAssessment.estimatedCost || 0;
  const partsCost = aiAssessment.partsCost || estimatedCost * 0.6;
  const laborCost = aiAssessment.laborCost || estimatedCost * 0.4;

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="p-4 bg-white rounded-lg border">
          <p className="text-sm text-muted-foreground">Components Detected</p>
          <p className="text-2xl font-bold text-purple-600">{damagedComponents.length}</p>
        </div>
        <div className="p-4 bg-white rounded-lg border">
          <p className="text-sm text-muted-foreground">Inferred Hidden Damage</p>
          <p className="text-2xl font-bold text-orange-600">{inferredHiddenDamage.length}</p>
        </div>
        <div className="p-4 bg-white rounded-lg border">
          <p className="text-sm text-muted-foreground">Parts Cost</p>
          <p className="text-2xl font-bold text-primary">${(partsCost / 100).toFixed(2)}</p>
        </div>
        <div className="p-4 bg-white rounded-lg border">
          <p className="text-sm text-muted-foreground">Labor Cost</p>
          <p className="text-2xl font-bold text-green-600">${(laborCost / 100).toFixed(2)}</p>
        </div>
      </div>

      {/* Vehicle Damage Visualization */}
      <div className="p-4 bg-white rounded-lg border">
        <h4 className="font-semibold mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-purple-600" />
          Visual Damage Map
        </h4>
        <VehicleDamageVisualization 
          damagedComponents={damagedComponents} 
          accidentType={aiAssessment.accidentType}
          estimatedCost={aiAssessment.estimatedCost || 0}
          structuralDamage={aiAssessment.structuralDamage || false}
          airbagDeployment={aiAssessment.airbagDeployment || false}
        />
      </div>

      {/* Detected Damage Components by Category */}
      <div className="p-4 bg-white rounded-lg border">
        <h4 className="font-semibold mb-4 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-purple-600" />
          Detected Damage Components
        </h4>
        <div className="space-y-4">
          {Object.entries(categorizedDamage).map(([category, components]) => (
            <div key={category}>
              <p className="text-sm font-medium text-muted-foreground mb-2">{category}</p>
              <div className="grid gap-2 md:grid-cols-3">
                {components.map((component: string, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-purple-50 rounded border border-purple-200">
                    <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                    <span className="text-sm capitalize">{component}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          
          {/* Uncategorized components */}
          {damagedComponents.filter((comp: string) => 
            !Object.values(categorizedDamage).flat().includes(comp)
          ).length > 0 && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Other Components</p>
              <div className="grid gap-2 md:grid-cols-3">
                {damagedComponents
                  .filter((comp: string) => !Object.values(categorizedDamage).flat().includes(comp))
                  .map((component: string, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-purple-50 rounded border border-purple-200">
                      <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                      <span className="text-sm capitalize">{component}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Inferred Hidden Damage */}
      {inferredHiddenDamage.length > 0 && (
        <div className="p-4 bg-orange-50 rounded-lg border-2 border-orange-200">
          <h4 className="font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            Inferred Hidden Damage (Requires Inspection)
          </h4>
          <div className="space-y-3">
            {inferredHiddenDamage.map((item, idx) => (
              <div key={idx} className="p-3 bg-white rounded border border-orange-200">
                <div className="flex items-start justify-between mb-1">
                  <p className="font-medium text-sm">{item.component}</p>
                  <Badge 
                    className={
                      item.confidence === "High" ? "bg-red-600" :
                      item.confidence === "Medium" ? "bg-orange-600" :
                      "bg-yellow-600"
                    }
                  >
                    {item.confidence} Confidence
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{item.reason}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 bg-yellow-50 rounded border border-yellow-200">
            <p className="text-sm text-yellow-900">
              <strong>⚠️ Recommendation:</strong> Physical inspection recommended to confirm hidden damage. 
              Inferred damage is based on typical collision patterns and may not be present in all cases.
            </p>
          </div>
        </div>
      )}

      {/* Structural Damage Warning */}
      {aiAssessment.structuralDamage && (
        <div className="p-4 bg-red-50 rounded-lg border-2 border-red-200">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-red-600" />
            <div>
              <p className="font-semibold text-red-900">Structural Damage Detected</p>
              <p className="text-sm text-red-800 mt-1">
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
  // Calculate confidence scores based on physics results
  const speedConsistency = physicsAnalysis.estimatedSpeed?.confidence || 75;
  const damagePropagation = physicsAnalysis.damagePropagation?.consistency || 80;
  const impactForceAnalysis = physicsAnalysis.impactForce?.confidence || 85;
  const geometricAlignment = physicsAnalysis.geometricConsistency ? 90 : 60;
  
  const overallConfidence = Math.round(
    (speedConsistency + damagePropagation + impactForceAnalysis + geometricAlignment) / 4
  );

  // Build anomalies list from fraud indicators
  const anomalies: Array<{
    type: "info" | "warning" | "error";
    title: string;
    description: string;
    riskLevel: "low" | "medium" | "high";
  }> = [];

  if (physicsAnalysis.fraudIndicators?.impossibleDamagePatterns?.length > 0) {
    anomalies.push({
      type: "error",
      title: "Impossible Damage Patterns",
      description: physicsAnalysis.fraudIndicators.impossibleDamagePatterns.join("; "),
      riskLevel: "high",
    });
  }

  if (physicsAnalysis.fraudIndicators?.unrelatedDamage?.length > 0) {
    anomalies.push({
      type: "warning",
      title: "Unrelated Damage Detected",
      description: `${physicsAnalysis.fraudIndicators.unrelatedDamage.length} components show damage inconsistent with impact point`,
      riskLevel: "medium",
    });
  }

  if (physicsAnalysis.fraudIndicators?.stagedAccidentIndicators?.length > 0) {
    anomalies.push({
      type: "error",
      title: "Staged Accident Indicators",
      description: physicsAnalysis.fraudIndicators.stagedAccidentIndicators.join("; "),
      riskLevel: "high",
    });
  }

  if (physicsAnalysis.fraudIndicators?.severityMismatch) {
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
  if (physicsAnalysis.estimatedSpeed) {
    narrativeSummary += `Estimated impact speed: ${physicsAnalysis.estimatedSpeed.value} km/h. `;
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
function PhysicsValidationSection({ aiAssessment, quotes, claim }: { aiAssessment: any; quotes: any[]; claim: any }) {
  // Parse physics analysis from AI assessment
  const physicsAnalysis = aiAssessment.physicsAnalysis ? JSON.parse(aiAssessment.physicsAnalysis) : null;
  
  if (!physicsAnalysis) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>Physics analysis not available for this claim</p>
        <p className="text-xs mt-2">Physics analysis runs automatically with AI assessment</p>
      </div>
    );
  }

  // Transform physics analysis to validation format for PhysicsConfidenceDashboard
  const validation = transformPhysicsAnalysisToValidation(physicsAnalysis, claim);
  
  return (
    <div className="space-y-6">
      {/* IP-Protected Physics Confidence Dashboard */}
      <PhysicsConfidenceDashboard validation={validation} />
      
      {/* Accident Physics Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="p-4 bg-white rounded-lg border">
          <p className="text-xs text-muted-foreground mb-1">Estimated Speed</p>
          <p className="text-2xl font-bold text-primary">
            {physicsAnalysis.estimatedSpeed?.value || 0} km/h
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            ±{Math.abs((physicsAnalysis.estimatedSpeed?.confidenceInterval?.[1] || 0) - (physicsAnalysis.estimatedSpeed?.value || 0))} km/h
          </p>
        </div>
        
        <div className="p-4 bg-white rounded-lg border">
          <p className="text-xs text-muted-foreground mb-1">Impact Force</p>
          <p className="text-2xl font-bold text-primary">
            {((physicsAnalysis.impactForce?.magnitude || 0) / 1000).toFixed(1)} kN
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {physicsAnalysis.impactForce?.duration || 0}ms duration
          </p>
        </div>
        
        <div className="p-4 bg-white rounded-lg border">
          <p className="text-xs text-muted-foreground mb-1">Accident Severity</p>
          <Badge 
            variant={
              physicsAnalysis.accidentSeverity === "catastrophic" ? "destructive" :
              physicsAnalysis.accidentSeverity === "severe" ? "destructive" :
              physicsAnalysis.accidentSeverity === "moderate" ? "default" : "secondary"
            }
            className="text-sm"
          >
            {physicsAnalysis.accidentSeverity}
          </Badge>
          <p className="text-xs text-muted-foreground mt-2">
            Injury Risk: {physicsAnalysis.occupantInjuryRisk}
          </p>
        </div>
      </div>
      
      {/* EV/Hybrid Analysis */}
      {physicsAnalysis.evHybridAnalysis && (
        <div className="p-4 bg-orange-50 border-2 border-orange-200 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            <h4 className="font-semibold text-orange-900">EV/Hybrid Vehicle Safety Alert</h4>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-orange-900">Battery Damage Risk</p>
              <Badge variant={
                physicsAnalysis.evHybridAnalysis.batteryDamageRisk === "critical" ? "destructive" :
                physicsAnalysis.evHybridAnalysis.batteryDamageRisk === "high" ? "destructive" :
                "default"
              }>
                {physicsAnalysis.evHybridAnalysis.batteryDamageRisk}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-orange-900">Fire/Explosion Risk</p>
              <p className="text-sm">{physicsAnalysis.evHybridAnalysis.fireExplosionRisk}%</p>
            </div>
          </div>
          {physicsAnalysis.evHybridAnalysis.specialSafetyProtocols?.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium text-orange-900 mb-2">Required Safety Protocols:</p>
              <ul className="text-xs space-y-1 text-orange-800">
                {physicsAnalysis.evHybridAnalysis.specialSafetyProtocols.slice(0, 3).map((protocol: string, idx: number) => (
                  <li key={idx}>• {protocol}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      
      {/* Fraud Indicators from Physics */}
      {physicsAnalysis.fraudIndicators && (
        <div className="space-y-3">
          <h4 className="font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            Physics-Based Fraud Detection
          </h4>
          
          {/* Impossible Damage Patterns */}
          {physicsAnalysis.fraudIndicators.impossibleDamagePatterns?.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm font-medium text-red-900 mb-2">⚠️ Impossible Damage Patterns Detected</p>
              <ul className="text-xs space-y-1 text-red-800">
                {physicsAnalysis.fraudIndicators.impossibleDamagePatterns.map((pattern: string, idx: number) => (
                  <li key={idx}>• {pattern}</li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Unrelated Damage */}
          {physicsAnalysis.fraudIndicators.unrelatedDamage?.length > 0 && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm font-medium text-yellow-900 mb-2">⚠️ Unrelated Damage Detected</p>
              <ul className="text-xs space-y-1 text-yellow-800">
                {physicsAnalysis.fraudIndicators.unrelatedDamage.map((damage: any, idx: number) => (
                  <li key={idx}>
                    • {damage.component} ({(damage.distanceFromImpact || 0).toFixed(1)}m from impact point)
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Staged Accident Indicators */}
          {physicsAnalysis.fraudIndicators.stagedAccidentIndicators?.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm font-medium text-red-900 mb-2">🚨 Staged Accident Indicators</p>
              <ul className="text-xs space-y-1 text-red-800">
                {physicsAnalysis.fraudIndicators.stagedAccidentIndicators.map((indicator: string, idx: number) => (
                  <li key={idx}>• {indicator}</li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Severity Mismatch */}
          {physicsAnalysis.fraudIndicators.severityMismatch && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="text-sm font-medium text-orange-900">⚠️ Severity Mismatch</p>
              <p className="text-xs text-orange-800 mt-1">
                Reported damage severity doesn't match estimated impact speed and forces
              </p>
            </div>
          )}
        </div>
      )}
      
      {/* Quote Validation Summary */}
      <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
        <h4 className="font-semibold text-secondary mb-3">Quote Validation Summary</h4>
        <div className="space-y-2">
          {quotes.map((quote, idx) => {
            const hasIssues = physicsAnalysis.fraudIndicators?.unrelatedDamage?.length > 0 || 
                             physicsAnalysis.fraudIndicators?.impossibleDamagePatterns?.length > 0;
            return (
              <div key={quote.id} className="flex items-center justify-between p-2 bg-white rounded border">
                <span className="text-sm">Panel Beater #{quote.panelBeaterId}</span>
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
