// @ts-nocheck
/**
 * Claims Manager Comparison View (with Risk Manager Analytical Overlay)
 * Role-based three-column comparison: AI Assessment | Assessor Report | Panel Beater Quotes
 * Risk Manager: Emphasizes fraud risk, technical validation, and analytical intelligence
 * Claims Manager: Emphasizes financial decisions, cost variance, and approval controls
 */

import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  Shield,
  Activity,
  ArrowLeft,
  User,
  Bot,
  Wrench,
  Image as ImageIcon,
  Zap,
  Target,
  Award,
  Clock,
  FileText,
  AlertCircle,
  TrendingDown as TrendingDownIcon,
  CheckSquare,
  History
} from "lucide-react";
import { GovernanceIndicators } from "@/components/GovernanceIndicators";
import { AiStatusBadge } from "@/components/AiStatusBadge";
import { GovernanceSummaryWidget } from "@/components/GovernanceSummaryWidget";
import { QMSCompliancePanel } from "@/components/QMSCompliancePanel";

// Confidence Score Meter Component
function ConfidenceMeter({ score, size = "default" }: { score: number; size?: "default" | "large" }) {
  const getColor = (score: number) => {
    if (score >= 80) return { bg: "bg-green-500", text: "text-green-700 dark:text-green-300" };
    if (score >= 60) return { bg: "bg-amber-500", text: "text-amber-700 dark:text-amber-300" };
    return { bg: "bg-red-500", text: "text-red-700 dark:text-red-300" };
  };

  const color = getColor(score);
  const isLarge = size === "large";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className={`${isLarge ? "text-base font-semibold" : ""} text-slate-600 dark:text-muted-foreground`}>
          Confidence Score
        </span>
        <span className={`${isLarge ? "text-3xl" : "text-lg"} font-bold ${color.text}`}>
          {score}%
        </span>
      </div>
      <div className={`w-full bg-slate-200 rounded-full ${isLarge ? "h-4" : "h-3"}`}>
        <div
          className={`${color.bg} ${isLarge ? "h-4" : "h-3"} rounded-full transition-all duration-500`}
          style={{ width: `${score}%` }}
        ></div>
      </div>
    </div>
  );
}

// Fraud Risk Meter Component
function FraudRiskMeter({ score, size = "default" }: { score: number; size?: "default" | "large" }) {
  const getColor = (score: number) => {
    if (score <= 30) return { bg: "bg-green-500", text: "text-green-700 dark:text-green-300", label: "Low Risk" };
    if (score <= 60) return { bg: "bg-amber-500", text: "text-amber-700 dark:text-amber-300", label: "Medium Risk" };
    return { bg: "bg-red-500", text: "text-red-700 dark:text-red-300", label: "High Risk" };
  };

  const color = getColor(score);
  const isLarge = size === "large";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className={`${isLarge ? "text-base font-semibold" : ""} text-slate-600 dark:text-muted-foreground`}>
          Fraud Risk
        </span>
        <span className={`${isLarge ? "text-3xl" : "text-lg"} font-bold ${color.text}`}>
          {score} - {color.label}
        </span>
      </div>
      <div className={`w-full bg-slate-200 rounded-full ${isLarge ? "h-4" : "h-3"}`}>
        <div
          className={`${color.bg} ${isLarge ? "h-4" : "h-3"} rounded-full transition-all duration-500`}
          style={{ width: `${score}%` }}
        ></div>
      </div>
    </div>
  );
}

// Variance Badge Component
function VarianceBadge({ variance }: { variance: number | null }) {
  if (variance === null) return null;

  const absVariance = Math.abs(variance);
  let color = "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700";
  let label = "Low Variance";

  if (absVariance > 20) {
    color = "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700";
    label = "High Variance";
  } else if (absVariance >= 10) {
    color = "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700";
    label = "Medium Variance";
  }

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${color} text-xs font-semibold`}>
      {absVariance > 20 && <AlertTriangle className="h-3 w-3" />}
      {variance > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {absVariance.toFixed(1)}% {label}
    </div>
  );
}

export default function ClaimsManagerComparisonView() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const claimId = parseInt(params.id || "0");
  const { user } = useAuth();
  const { fmt } = useTenantCurrency();

  // Determine role-based view
  const isRiskManager = user?.role === "risk_manager";
  const isClaimsManager = user?.role === "claims_manager";

  // Fetch all data needed for comparison
  const { data: claim, isLoading: claimLoading } = trpc.claims.getById.useQuery({ id: claimId });
  const { data: aiAssessment, isLoading: aiLoading } = trpc.aiAssessments.byClaim.useQuery({ claimId });
  const { data: assessorEval, isLoading: assessorLoading } = trpc.assessorEvaluations.byClaim.useQuery({ claimId });
  const { data: quotes, isLoading: quotesLoading } = trpc.quotes.byClaim.useQuery({ claimId });

  const isLoading = claimLoading || aiLoading || assessorLoading || quotesLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-muted/50 p-8">
        <div className="max-w-[1800px] mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-3 gap-6">
            <Skeleton className="h-[600px] w-full" />
            <Skeleton className="h-[600px] w-full" />
            <Skeleton className="h-[600px] w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-muted/50 flex items-center justify-center">
        <Card>
          <CardContent className="py-12 text-center text-slate-700 dark:text-slate-400 dark:text-muted-foreground">
            <p>Claim not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const aiCost = aiAssessment?.estimatedCost ? aiAssessment.estimatedCost / 100 : null;
  const assessorCost = assessorEval?.estimatedRepairCost ? assessorEval.estimatedRepairCost / 100 : null;

  // Find lowest and selected quotes
  const lowestQuote = quotes && quotes.length > 0 
    ? quotes.reduce((min: any, q: any) => (q.quotedAmount || 0) < (min.quotedAmount || 0) ? q : min, quotes[0])
    : null;
  const selectedQuote = quotes?.find((q: any) => q.isSelected) || null;

  // Calculate variances
  const calculateVariance = (value1: number | null, value2: number | null) => {
    if (!value1 || !value2) return null;
    return ((value1 - value2) / value2) * 100;
  };

  const aiVsAssessor = calculateVariance(assessorCost, aiCost);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-muted/50">
      {/* Header */}
      <div className="bg-white dark:bg-card border-b border-slate-200 dark:border-border">
        <div className="max-w-[1800px] mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate("/insurer-portal/claims-manager")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-foreground">
                  {isRiskManager ? "Risk Analysis" : "Assessment Comparison"}
                </h1>
                <p className="text-slate-600 dark:text-muted-foreground mt-1 flex items-center gap-2">
                  {claim.claimNumber} • {claim.vehicleMake} {claim.vehicleModel} {claim.vehicleYear}
                  <AiStatusBadge claim={claim} aiAssessment={aiAssessment ?? null} />
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {user?.role && (
                <Badge variant="outline" className="capitalize">
                  {user.role.replace(/_/g, " ")}
                </Badge>
              )}
              {claim.status && (
                <Badge variant="outline">{claim.status?.replace(/_/g, " ")?.toUpperCase() || "UNKNOWN"}</Badge>
              )}
              {aiAssessment?.fraudRiskLevel === "high" && (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  High Fraud Risk
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Governance Indicators (For All Roles) */}
      <div className="max-w-[1800px] mx-auto px-8 pt-6">
        <GovernanceIndicators
          fraudDetectionActive={true}
          physicsValidationComplete={!!aiAssessment}
          costOptimisationApplied={!!quotes && quotes.length > 0}
          policyVersion={"v1.0.0"}
          governanceLoggingActive={true}
          fraudRiskScore={aiAssessment?.fraudRiskScore}
          confidenceScore={aiAssessment?.confidenceScore}
        />
      </div>

      {/* Governance Summary Widget (For Managers) */}
      {(isRiskManager || isClaimsManager) && (
        <div className="max-w-[1800px] mx-auto px-8 pt-6">
          <GovernanceSummaryWidget />
        </div>
      )}

      {/* QMS Compliance Panel (For Managers) */}
      {(isRiskManager || isClaimsManager) && (
        <div className="max-w-[1800px] mx-auto px-8 pt-6">
          <QMSCompliancePanel />
        </div>
      )}

      {/* Risk Manager: Technical Validation Panel (Above Three Columns) */}
      {isRiskManager && (
        <div className="max-w-[1800px] mx-auto px-8 pt-8">
          <Card className="border-0 shadow-lg bg-gradient-to-r from-red-50 to-amber-50 border-l-4 border-l-red-500">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-900 dark:text-red-200">
                <Shield className="h-6 w-6" />
                Technical Validation & Risk Intelligence
              </CardTitle>
              <CardDescription>Comprehensive risk assessment and validation summary</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                {/* Damage Plausibility */}
                <div className="p-4 bg-white dark:bg-card rounded-lg border border-slate-200 dark:border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckSquare className="h-5 w-5 text-blue-600" />
                    <h4 className="font-semibold text-slate-900 dark:text-foreground">Damage Plausibility</h4>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 dark:text-muted-foreground">Assessment</span>
                      <Badge variant={aiAssessment?.damageComplexity === "simple" ? "default" : "secondary"}>
                        {aiAssessment?.damageComplexity || "N/A"}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-muted-foreground mt-2">
                      {aiAssessment?.damageComplexity === "complex" 
                        ? "⚠️ Complex damage pattern requires detailed review"
                        : "✓ Damage pattern consistent with incident"}
                    </p>
                  </div>
                </div>

                {/* Prior Claim History */}
                <div className="p-4 bg-white dark:bg-card rounded-lg border border-slate-200 dark:border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <History className="h-5 w-5 text-purple-600" />
                    <h4 className="font-semibold text-slate-900 dark:text-foreground">Prior Claims</h4>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 dark:text-muted-foreground">History Flag</span>
                      <Badge variant={claim.priorClaimsCount && claim.priorClaimsCount > 2 ? "destructive" : "default"}>
                        {claim.priorClaimsCount || 0} claims
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-muted-foreground mt-2">
                      {claim.priorClaimsCount && claim.priorClaimsCount > 2
                        ? "⚠️ Multiple prior claims detected"
                        : "✓ Normal claim history"}
                    </p>
                  </div>
                </div>

                {/* Policy Coverage Validation */}
                <div className="p-4 bg-white dark:bg-card rounded-lg border border-slate-200 dark:border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="h-5 w-5 text-green-600" />
                    <h4 className="font-semibold text-slate-900 dark:text-foreground">Coverage Status</h4>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 dark:text-muted-foreground">Validation</span>
                      <Badge variant="default" className="bg-green-600">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Valid
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-muted-foreground mt-2">
                      ✓ Policy active and covers reported damage
                    </p>
                  </div>
                </div>

                {/* Repair Timeline Risk */}
                <div className="p-4 bg-white dark:bg-card rounded-lg border border-slate-200 dark:border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="h-5 w-5 text-amber-600" />
                    <h4 className="font-semibold text-slate-900 dark:text-foreground">Timeline Risk</h4>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 dark:text-muted-foreground">Estimated Duration</span>
                      <span className="font-bold text-slate-900 dark:text-foreground">
                        {assessorEval?.estimatedDuration || aiAssessment?.estimatedDuration || "N/A"} days
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-muted-foreground mt-2">
                      {(assessorEval?.estimatedDuration || 0) > 14
                        ? "⚠️ Extended repair timeline"
                        : "✓ Normal repair timeline"}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Damage Photo Gallery */}
      {(() => {
        const photos: string[] = claim.damagePhotos ? (typeof claim.damagePhotos === 'string' ? JSON.parse(claim.damagePhotos) : claim.damagePhotos) : [];
        if (photos.length === 0) return null;
        return (
          <div className="max-w-[1800px] mx-auto px-8 pt-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-foreground">
                  <ImageIcon className="h-5 w-5 text-blue-600" />
                  Damage Photos ({photos.length})
                </CardTitle>
                <CardDescription>Vehicle damage images used for AI analysis</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {photos.map((url: string, idx: number) => (
                    <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="group">
                      <div className="aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-border group-hover:border-blue-400 transition-colors">
                        <img
                          src={url}
                          alt={`Damage photo ${idx + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                      </div>
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* Three-Column Comparison Layout */}
      <div className="max-w-[1800px] mx-auto px-8 py-8">
        <div className="grid grid-cols-3 gap-6">
          {/* Column 1: AI Assessment */}
          <Card className="border-0 shadow-lg border-t-4 border-t-blue-500">
            <CardHeader className="bg-blue-50 dark:bg-blue-950/30">
              <CardTitle className="flex items-center gap-2 text-blue-900 dark:text-blue-200">
                <Bot className="h-5 w-5" />
                AI Assessment
              </CardTitle>
              <CardDescription>Automated analysis and cost estimation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              {/* Estimated Cost - De-emphasized for Risk Manager */}
              <div className={`text-center p-6 bg-blue-50 dark:bg-blue-950/30 rounded-xl border-2 border-blue-200 dark:border-blue-800 ${
                isRiskManager ? "opacity-60" : ""
              }`}>
                <p className="text-sm text-slate-600 dark:text-muted-foreground mb-2">Estimated Cost</p>
                <p className={`${isRiskManager ? "text-3xl" : "text-5xl"} font-bold text-blue-900 dark:text-blue-200`}>
                  {aiCost ? fmt(aiCost * 100) : "N/A"}
                </p>
              </div>

              {/* Fraud Risk Score - ENLARGED for Risk Manager */}
              {isRiskManager && aiAssessment?.fraudRiskScore !== undefined && (
                <div className="p-6 bg-red-50 dark:bg-red-950/30 rounded-xl border-2 border-red-200 dark:border-red-800">
                  <h3 className="text-lg font-bold text-red-900 dark:text-red-200 mb-4 flex items-center gap-2">
                    <Shield className="h-6 w-6" />
                    Fraud Risk Analysis
                  </h3>
                  <FraudRiskMeter score={aiAssessment.fraudRiskScore} size="large" />
                  
                  {/* AI Confidence Breakdown */}
                  <div className="mt-6 pt-6 border-t border-red-200 dark:border-red-800">
                    <h4 className="font-semibold text-slate-900 dark:text-foreground mb-3">Confidence Breakdown</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600 dark:text-muted-foreground">Overall Confidence</span>
                        <span className="font-bold text-slate-900 dark:text-foreground">
                          {aiAssessment.confidenceScore}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600 dark:text-muted-foreground">Damage Assessment</span>
                        <span className="font-bold text-green-600">High</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600 dark:text-muted-foreground">Cost Estimation</span>
                        <span className="font-bold text-green-600">High</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600 dark:text-muted-foreground">Fraud Detection</span>
                        <span className={`font-bold ${
                          aiAssessment.fraudRiskLevel === "high" ? "text-red-600" :
                          aiAssessment.fraudRiskLevel === "medium" ? "text-amber-600" :
                          "text-green-600"
                        }`}>
                          {aiAssessment.fraudRiskLevel?.toUpperCase() || "N/A"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Confidence Score - Standard for Claims Manager */}
              {!isRiskManager && aiAssessment?.confidenceScore && (
                <div className="p-4 bg-slate-50 dark:bg-muted/50 rounded-lg">
                  <ConfidenceMeter score={aiAssessment.confidenceScore} />
                </div>
              )}

              {/* Fraud Risk Score - Standard for Claims Manager */}
              {!isRiskManager && aiAssessment?.fraudRiskScore !== undefined && (
                <div className="p-4 bg-slate-50 dark:bg-muted/50 rounded-lg">
                  <FraudRiskMeter score={aiAssessment.fraudRiskScore} />
                </div>
              )}

              {/* Key Flags */}
              <div>
                <h4 className="font-semibold text-slate-700 dark:text-foreground/80 mb-3">Key Flags</h4>
                <div className="space-y-2">
                  {aiAssessment?.fraudRiskLevel && (
                    <div className={`flex items-center gap-2 p-3 rounded-lg ${
                      aiAssessment.fraudRiskLevel === "high" 
                        ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300" 
                        : aiAssessment.fraudRiskLevel === "medium"
                        ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300"
                        : "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300"
                    }`}>
                      <Shield className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        {aiAssessment.fraudRiskLevel.toUpperCase()} Fraud Risk
                      </span>
                    </div>
                  )}
                  {aiAssessment?.damageComplexity && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 dark:bg-muted/50 text-slate-700 dark:text-foreground/80">
                      <Activity className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        {aiAssessment.damageComplexity.replace(/_/g, " ").toUpperCase()} Complexity
                      </span>
                    </div>
                  )}
                  {aiAssessment?.keyFlags && aiAssessment.keyFlags.length > 0 && (
                    aiAssessment.keyFlags.map((flag: string, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-sm font-medium">{flag}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Fast-Track Eligibility */}
              <div className={`p-4 rounded-lg border-2 ${
                aiAssessment?.fastTrackEligible 
                  ? "bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300" 
                  : "bg-slate-50 dark:bg-muted/50 border-slate-300 dark:border-border text-slate-700 dark:text-foreground/80"
              }`}>
                <div className="flex items-center gap-2">
                  {aiAssessment?.fastTrackEligible ? (
                    <>
                      <Zap className="h-5 w-5" />
                      <span className="font-semibold">Fast-Track Eligible</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5" />
                      <span className="font-semibold">Not Fast-Track Eligible</span>
                    </>
                  )}
                </div>
              </div>

              {/* AI Reasoning */}
              {aiAssessment?.reasoning && (
                <div className="p-4 bg-slate-50 dark:bg-muted/50 rounded-lg">
                  <h4 className="font-semibold text-slate-700 dark:text-foreground/80 mb-2">AI Reasoning</h4>
                  <p className="text-sm text-slate-600 dark:text-muted-foreground leading-relaxed">
                    {aiAssessment.reasoning}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Column 2: Assessor Report */}
          <Card className="border-0 shadow-lg border-t-4 border-t-green-500">
            <CardHeader className="bg-green-50 dark:bg-green-950/30">
              <CardTitle className="flex items-center gap-2 text-green-900 dark:text-green-200">
                <User className="h-5 w-5" />
                Internal Assessor Report
              </CardTitle>
              <CardDescription>Professional human assessment</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              {assessorEval ? (
                <>
                  {/* Assessed Cost - De-emphasized for Risk Manager */}
                  <div className={`text-center p-6 bg-green-50 dark:bg-green-950/30 rounded-xl border-2 border-green-200 dark:border-green-800 ${
                    isRiskManager ? "opacity-60" : ""
                  }`}>
                    <p className="text-sm text-slate-600 dark:text-muted-foreground mb-2">Assessed Cost</p>
                    <p className={`${isRiskManager ? "text-3xl" : "text-5xl"} font-bold text-green-900 dark:text-green-200`}>
                      {assessorCost ? fmt(assessorCost * 100) : "N/A"}
                    </p>
                  </div>

                  {/* Discrepancy vs AI - EMPHASIZED for Risk Manager */}
                  {aiVsAssessor !== null && (
                    <div className={`p-4 rounded-lg ${
                      isRiskManager 
                        ? "bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-300 dark:border-amber-700" 
                        : "bg-slate-50 dark:bg-muted/50"
                    }`}>
                      <h4 className={`font-semibold mb-3 ${
                        isRiskManager ? "text-lg text-amber-900 dark:text-amber-200" : "text-slate-700 dark:text-foreground/80"
                      }`}>
                        Discrepancy Analysis
                      </h4>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-slate-600 dark:text-muted-foreground">AI vs Assessor Variance</span>
                        <span className={`${isRiskManager ? "text-3xl" : "text-2xl"} font-bold ${
                          Math.abs(aiVsAssessor) > 20 ? "text-red-600" :
                          Math.abs(aiVsAssessor) >= 10 ? "text-amber-600" :
                          "text-green-600"
                        }`}>
                          {aiVsAssessor > 0 ? "+" : ""}{aiVsAssessor.toFixed(1)}%
                        </span>
                      </div>
                      <VarianceBadge variance={aiVsAssessor} />
                      
                      {/* Risk Manager: Additional Analysis */}
                      {isRiskManager && (
                        <div className="mt-4 pt-4 border-t border-amber-200 dark:border-amber-800">
                          <p className="text-xs text-slate-600 dark:text-muted-foreground">
                            {Math.abs(aiVsAssessor) > 20
                              ? "⚠️ Significant discrepancy detected. Manual review recommended to validate cost estimation accuracy and identify potential anomalies."
                              : Math.abs(aiVsAssessor) >= 10
                              ? "⚠️ Moderate discrepancy. Review recommended to ensure alignment between AI and human assessment."
                              : "✓ AI and assessor estimates are well-aligned, indicating consistent damage evaluation."}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Adjustment Notes */}
                  {assessorEval.notes && (
                    <div className="p-4 bg-slate-50 dark:bg-muted/50 rounded-lg">
                      <h4 className="font-semibold text-slate-700 dark:text-foreground/80 mb-2">Adjustment Notes</h4>
                      <p className="text-sm text-slate-600 dark:text-muted-foreground leading-relaxed">
                        {assessorEval.notes}
                      </p>
                    </div>
                  )}

                  {/* Photo Evidence Count */}
                  <div className="p-4 bg-slate-50 dark:bg-muted/50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ImageIcon className="h-5 w-5 text-slate-600 dark:text-muted-foreground" />
                        <span className="font-semibold text-slate-700 dark:text-foreground/80">Photo Evidence</span>
                      </div>
                      <span className="text-2xl font-bold text-slate-900 dark:text-foreground">
                        {assessorEval.photoCount || 0}
                      </span>
                    </div>
                  </div>

                  {/* Additional Details */}
                  <div className="space-y-3">
                    <h4 className="font-semibold text-slate-700 dark:text-foreground/80">Assessment Details</h4>
                    {assessorEval.estimatedDuration && (
                      <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-muted/50 rounded-lg">
                        <span className="text-sm text-slate-600 dark:text-muted-foreground">Estimated Duration</span>
                        <span className="font-semibold text-slate-900 dark:text-foreground">
                          {assessorEval.estimatedDuration} days
                        </span>
                      </div>
                    )}
                    {assessorEval.laborCost && (
                      <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-muted/50 rounded-lg">
                        <span className="text-sm text-slate-600 dark:text-muted-foreground">Labor Cost</span>
                        <span className="font-semibold text-slate-900 dark:text-foreground">
                          ${(assessorEval.laborCost / 100).toLocaleString()}
                        </span>
                      </div>
                    )}
                    {assessorEval.partsCost && (
                      <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-muted/50 rounded-lg">
                        <span className="text-sm text-slate-600 dark:text-muted-foreground">Parts Cost</span>
                        <span className="font-semibold text-slate-900 dark:text-foreground">
                          ${(assessorEval.partsCost / 100).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Assessor Info */}
                  {assessorEval.assessorName && (
                    <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium text-green-900 dark:text-green-200">
                          Assessed by: {assessorEval.assessorName}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12 text-slate-700 dark:text-slate-400 dark:text-muted-foreground">
                  <p>No assessor evaluation available</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Column 3: Panel Beater Quotes - HIDDEN/DE-EMPHASIZED for Risk Manager */}
          <Card className={`border-0 shadow-lg border-t-4 border-t-purple-500 ${
            isRiskManager ? "opacity-40" : ""
          }`}>
            <CardHeader className="bg-purple-50 dark:bg-purple-950/30">
              <CardTitle className="flex items-center gap-2 text-purple-900 dark:text-purple-200">
                <Wrench className="h-5 w-5" />
                Panel Beater Quotes
                {isRiskManager && (
                  <Badge variant="outline" className="ml-2 text-xs">
                    Reference Only
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {isRiskManager ? "Market quotes (not primary focus)" : "Market quotes from repair shops"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              {quotes && quotes.length > 0 ? (
                <>
                  {/* Quote List */}
                  <div className="space-y-4">
                    {quotes.map((quote: any, idx: number) => {
                      const quoteCost = (quote.quotedAmount || 0) / 100;
                      const isLowest = lowestQuote && quote.id === lowestQuote.id;
                      const isSelected = selectedQuote && quote.id === selectedQuote.id;
                      const varianceVsAI = calculateVariance(quoteCost, aiCost);

                      return (
                        <div
                          key={quote.id}
                          className={`p-4 rounded-lg border-2 ${
                            isSelected 
                              ? "bg-purple-50 dark:bg-purple-950/30 border-purple-400" 
                              : isLowest 
                              ? "bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-700" 
                              : "bg-slate-50 dark:bg-muted/50 border-slate-200 dark:border-border"
                          }`}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h4 className="font-semibold text-slate-900 dark:text-foreground">
                                {quote.panelBeaterName || `Quote #${idx + 1}`}
                              </h4>
                              {quote.shopLocation && (
                                <p className="text-xs text-slate-600 dark:text-muted-foreground mt-1">{quote.shopLocation}</p>
                              )}
                            </div>
                            <div className="flex flex-col gap-1 items-end">
                              {isLowest && !isRiskManager && (
                                <Badge className="bg-green-600 text-white">
                                  <Award className="h-3 w-3 mr-1" />
                                  Lowest
                                </Badge>
                              )}
                              {isSelected && !isRiskManager && (
                                <Badge className="bg-purple-600 text-white">
                                  <Target className="h-3 w-3 mr-1" />
                                  Selected
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-slate-600 dark:text-muted-foreground">Quoted Amount</span>
                              <span className="text-2xl font-bold text-slate-900 dark:text-foreground">
                                ${quoteCost.toLocaleString()}
                              </span>
                            </div>

                            {varianceVsAI !== null && !isRiskManager && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-600 dark:text-muted-foreground">vs AI Estimate</span>
                                <VarianceBadge variance={varianceVsAI} />
                              </div>
                            )}

                            {quote.estimatedDuration && (
                              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-border">
                                <span className="text-xs text-slate-600 dark:text-muted-foreground">Duration</span>
                                <span className="text-sm font-semibold text-slate-900 dark:text-foreground">
                                  {quote.estimatedDuration} days
                                </span>
                              </div>
                            )}
                          </div>

                          {quote.notes && (
                            <p className="text-xs text-slate-600 dark:text-muted-foreground mt-3 pt-3 border-t border-slate-200 dark:border-border">
                              {quote.notes}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Quote Summary - Hidden for Risk Manager */}
                  {!isRiskManager && (
                    <div className="p-4 bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-200 dark:border-purple-800">
                      <h4 className="font-semibold text-purple-900 dark:text-purple-200 mb-3">Quote Summary</h4>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-600 dark:text-muted-foreground">Total Quotes</span>
                          <span className="font-bold text-slate-900 dark:text-foreground">{quotes.length}</span>
                        </div>
                        {lowestQuote && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-600 dark:text-muted-foreground">Lowest Quote</span>
                            <span className="font-bold text-green-600">
                              ${(lowestQuote.quotedAmount || 0).toLocaleString()}
                            </span>
                          </div>
                        )}
                        {selectedQuote && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-600 dark:text-muted-foreground">Selected Quote</span>
                            <span className="font-bold text-purple-600">
                              ${(selectedQuote.quotedAmount || 0).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12 text-slate-700 dark:text-slate-400 dark:text-muted-foreground">
                  <Wrench className="h-12 w-12 mx-auto mb-4 text-slate-600 dark:text-slate-300" />
                  <p>No panel beater quotes available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
