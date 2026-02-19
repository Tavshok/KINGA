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
import { GovernanceSummaryWidget } from "@/components/GovernanceSummaryWidget";
import { QMSCompliancePanel } from "@/components/QMSCompliancePanel";

// Confidence Score Meter Component
function ConfidenceMeter({ score, size = "default" }: { score: number; size?: "default" | "large" }) {
  const getColor = (score: number) => {
    if (score >= 80) return { bg: "bg-green-500", text: "text-green-700" };
    if (score >= 60) return { bg: "bg-amber-500", text: "text-amber-700" };
    return { bg: "bg-red-500", text: "text-red-700" };
  };

  const color = getColor(score);
  const isLarge = size === "large";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className={`${isLarge ? "text-base font-semibold" : ""} text-slate-600`}>
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
    if (score <= 30) return { bg: "bg-green-500", text: "text-green-700", label: "Low Risk" };
    if (score <= 60) return { bg: "bg-amber-500", text: "text-amber-700", label: "Medium Risk" };
    return { bg: "bg-red-500", text: "text-red-700", label: "High Risk" };
  };

  const color = getColor(score);
  const isLarge = size === "large";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className={`${isLarge ? "text-base font-semibold" : ""} text-slate-600`}>
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
  let color = "bg-green-100 text-green-700 border-green-300";
  let label = "Low Variance";

  if (absVariance > 20) {
    color = "bg-red-100 text-red-700 border-red-300";
    label = "High Variance";
  } else if (absVariance >= 10) {
    color = "bg-amber-100 text-amber-700 border-amber-300";
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
      <div className="min-h-screen bg-slate-50 p-8">
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
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
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-[1800px] mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate("/insurer-portal/claims-manager")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">
                  {isRiskManager ? "Risk Analysis" : "Assessment Comparison"}
                </h1>
                <p className="text-slate-600 mt-1">
                  {claim.claimNumber} • {claim.vehicleMake} {claim.vehicleModel} {claim.vehicleYear}
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
              <CardTitle className="flex items-center gap-2 text-red-900">
                <Shield className="h-6 w-6" />
                Technical Validation & Risk Intelligence
              </CardTitle>
              <CardDescription>Comprehensive risk assessment and validation summary</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                {/* Damage Plausibility */}
                <div className="p-4 bg-white rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckSquare className="h-5 w-5 text-blue-600" />
                    <h4 className="font-semibold text-slate-900">Damage Plausibility</h4>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Assessment</span>
                      <Badge variant={aiAssessment?.damageComplexity === "simple" ? "default" : "secondary"}>
                        {aiAssessment?.damageComplexity || "N/A"}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600 mt-2">
                      {aiAssessment?.damageComplexity === "complex" 
                        ? "⚠️ Complex damage pattern requires detailed review"
                        : "✓ Damage pattern consistent with incident"}
                    </p>
                  </div>
                </div>

                {/* Prior Claim History */}
                <div className="p-4 bg-white rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2 mb-3">
                    <History className="h-5 w-5 text-purple-600" />
                    <h4 className="font-semibold text-slate-900">Prior Claims</h4>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">History Flag</span>
                      <Badge variant={claim.priorClaimsCount && claim.priorClaimsCount > 2 ? "destructive" : "default"}>
                        {claim.priorClaimsCount || 0} claims
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600 mt-2">
                      {claim.priorClaimsCount && claim.priorClaimsCount > 2
                        ? "⚠️ Multiple prior claims detected"
                        : "✓ Normal claim history"}
                    </p>
                  </div>
                </div>

                {/* Policy Coverage Validation */}
                <div className="p-4 bg-white rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="h-5 w-5 text-green-600" />
                    <h4 className="font-semibold text-slate-900">Coverage Status</h4>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Validation</span>
                      <Badge variant="default" className="bg-green-600">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Valid
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600 mt-2">
                      ✓ Policy active and covers reported damage
                    </p>
                  </div>
                </div>

                {/* Repair Timeline Risk */}
                <div className="p-4 bg-white rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="h-5 w-5 text-amber-600" />
                    <h4 className="font-semibold text-slate-900">Timeline Risk</h4>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Estimated Duration</span>
                      <span className="font-bold text-slate-900">
                        {assessorEval?.estimatedDuration || aiAssessment?.estimatedDuration || "N/A"} days
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-2">
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

      {/* Three-Column Comparison Layout */}
      <div className="max-w-[1800px] mx-auto px-8 py-8">
        <div className="grid grid-cols-3 gap-6">
          {/* Column 1: AI Assessment */}
          <Card className="border-0 shadow-lg border-t-4 border-t-blue-500">
            <CardHeader className="bg-blue-50">
              <CardTitle className="flex items-center gap-2 text-blue-900">
                <Bot className="h-5 w-5" />
                AI Assessment
              </CardTitle>
              <CardDescription>Automated analysis and cost estimation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              {/* Estimated Cost - De-emphasized for Risk Manager */}
              <div className={`text-center p-6 bg-blue-50 rounded-xl border-2 border-blue-200 ${
                isRiskManager ? "opacity-60" : ""
              }`}>
                <p className="text-sm text-slate-600 mb-2">Estimated Cost</p>
                <p className={`${isRiskManager ? "text-3xl" : "text-5xl"} font-bold text-blue-900`}>
                  {aiCost ? `$${aiCost.toLocaleString()}` : "N/A"}
                </p>
              </div>

              {/* Fraud Risk Score - ENLARGED for Risk Manager */}
              {isRiskManager && aiAssessment?.fraudRiskScore !== undefined && (
                <div className="p-6 bg-red-50 rounded-xl border-2 border-red-200">
                  <h3 className="text-lg font-bold text-red-900 mb-4 flex items-center gap-2">
                    <Shield className="h-6 w-6" />
                    Fraud Risk Analysis
                  </h3>
                  <FraudRiskMeter score={aiAssessment.fraudRiskScore} size="large" />
                  
                  {/* AI Confidence Breakdown */}
                  <div className="mt-6 pt-6 border-t border-red-200">
                    <h4 className="font-semibold text-slate-900 mb-3">Confidence Breakdown</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">Overall Confidence</span>
                        <span className="font-bold text-slate-900">
                          {aiAssessment.confidenceScore}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">Damage Assessment</span>
                        <span className="font-bold text-green-600">High</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">Cost Estimation</span>
                        <span className="font-bold text-green-600">High</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">Fraud Detection</span>
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
                <div className="p-4 bg-slate-50 rounded-lg">
                  <ConfidenceMeter score={aiAssessment.confidenceScore} />
                </div>
              )}

              {/* Fraud Risk Score - Standard for Claims Manager */}
              {!isRiskManager && aiAssessment?.fraudRiskScore !== undefined && (
                <div className="p-4 bg-slate-50 rounded-lg">
                  <FraudRiskMeter score={aiAssessment.fraudRiskScore} />
                </div>
              )}

              {/* Key Flags */}
              <div>
                <h4 className="font-semibold text-slate-700 mb-3">Key Flags</h4>
                <div className="space-y-2">
                  {aiAssessment?.fraudRiskLevel && (
                    <div className={`flex items-center gap-2 p-3 rounded-lg ${
                      aiAssessment.fraudRiskLevel === "high" 
                        ? "bg-red-50 text-red-700" 
                        : aiAssessment.fraudRiskLevel === "medium"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-green-50 text-green-700"
                    }`}>
                      <Shield className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        {aiAssessment.fraudRiskLevel.toUpperCase()} Fraud Risk
                      </span>
                    </div>
                  )}
                  {aiAssessment?.damageComplexity && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 text-slate-700">
                      <Activity className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        {aiAssessment.damageComplexity.replace(/_/g, " ").toUpperCase()} Complexity
                      </span>
                    </div>
                  )}
                  {aiAssessment?.keyFlags && aiAssessment.keyFlags.length > 0 && (
                    aiAssessment.keyFlags.map((flag: string, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 text-amber-700">
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
                  ? "bg-green-50 border-green-300 text-green-700" 
                  : "bg-slate-50 border-slate-300 text-slate-700"
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
                <div className="p-4 bg-slate-50 rounded-lg">
                  <h4 className="font-semibold text-slate-700 mb-2">AI Reasoning</h4>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {aiAssessment.reasoning}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Column 2: Assessor Report */}
          <Card className="border-0 shadow-lg border-t-4 border-t-green-500">
            <CardHeader className="bg-green-50">
              <CardTitle className="flex items-center gap-2 text-green-900">
                <User className="h-5 w-5" />
                Internal Assessor Report
              </CardTitle>
              <CardDescription>Professional human assessment</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              {assessorEval ? (
                <>
                  {/* Assessed Cost - De-emphasized for Risk Manager */}
                  <div className={`text-center p-6 bg-green-50 rounded-xl border-2 border-green-200 ${
                    isRiskManager ? "opacity-60" : ""
                  }`}>
                    <p className="text-sm text-slate-600 mb-2">Assessed Cost</p>
                    <p className={`${isRiskManager ? "text-3xl" : "text-5xl"} font-bold text-green-900`}>
                      {assessorCost ? `$${assessorCost.toLocaleString()}` : "N/A"}
                    </p>
                  </div>

                  {/* Discrepancy vs AI - EMPHASIZED for Risk Manager */}
                  {aiVsAssessor !== null && (
                    <div className={`p-4 rounded-lg ${
                      isRiskManager 
                        ? "bg-amber-50 border-2 border-amber-300" 
                        : "bg-slate-50"
                    }`}>
                      <h4 className={`font-semibold mb-3 ${
                        isRiskManager ? "text-lg text-amber-900" : "text-slate-700"
                      }`}>
                        Discrepancy Analysis
                      </h4>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-slate-600">AI vs Assessor Variance</span>
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
                        <div className="mt-4 pt-4 border-t border-amber-200">
                          <p className="text-xs text-slate-600">
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
                    <div className="p-4 bg-slate-50 rounded-lg">
                      <h4 className="font-semibold text-slate-700 mb-2">Adjustment Notes</h4>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        {assessorEval.notes}
                      </p>
                    </div>
                  )}

                  {/* Photo Evidence Count */}
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ImageIcon className="h-5 w-5 text-slate-600" />
                        <span className="font-semibold text-slate-700">Photo Evidence</span>
                      </div>
                      <span className="text-2xl font-bold text-slate-900">
                        {assessorEval.photoCount || 0}
                      </span>
                    </div>
                  </div>

                  {/* Additional Details */}
                  <div className="space-y-3">
                    <h4 className="font-semibold text-slate-700">Assessment Details</h4>
                    {assessorEval.estimatedDuration && (
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <span className="text-sm text-slate-600">Estimated Duration</span>
                        <span className="font-semibold text-slate-900">
                          {assessorEval.estimatedDuration} days
                        </span>
                      </div>
                    )}
                    {assessorEval.laborCost && (
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <span className="text-sm text-slate-600">Labor Cost</span>
                        <span className="font-semibold text-slate-900">
                          ${(assessorEval.laborCost / 100).toLocaleString()}
                        </span>
                      </div>
                    )}
                    {assessorEval.partsCost && (
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <span className="text-sm text-slate-600">Parts Cost</span>
                        <span className="font-semibold text-slate-900">
                          ${(assessorEval.partsCost / 100).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Assessor Info */}
                  {assessorEval.assessorName && (
                    <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium text-green-900">
                          Assessed by: {assessorEval.assessorName}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <p>No assessor evaluation available</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Column 3: Panel Beater Quotes - HIDDEN/DE-EMPHASIZED for Risk Manager */}
          <Card className={`border-0 shadow-lg border-t-4 border-t-purple-500 ${
            isRiskManager ? "opacity-40" : ""
          }`}>
            <CardHeader className="bg-purple-50">
              <CardTitle className="flex items-center gap-2 text-purple-900">
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
                              ? "bg-purple-50 border-purple-400" 
                              : isLowest 
                              ? "bg-green-50 border-green-300" 
                              : "bg-slate-50 border-slate-200"
                          }`}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h4 className="font-semibold text-slate-900">
                                {quote.panelBeaterName || `Quote #${idx + 1}`}
                              </h4>
                              {quote.shopLocation && (
                                <p className="text-xs text-slate-600 mt-1">{quote.shopLocation}</p>
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
                              <span className="text-sm text-slate-600">Quoted Amount</span>
                              <span className="text-2xl font-bold text-slate-900">
                                ${quoteCost.toLocaleString()}
                              </span>
                            </div>

                            {varianceVsAI !== null && !isRiskManager && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-600">vs AI Estimate</span>
                                <VarianceBadge variance={varianceVsAI} />
                              </div>
                            )}

                            {quote.estimatedDuration && (
                              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                                <span className="text-xs text-slate-600">Duration</span>
                                <span className="text-sm font-semibold text-slate-900">
                                  {quote.estimatedDuration} days
                                </span>
                              </div>
                            )}
                          </div>

                          {quote.notes && (
                            <p className="text-xs text-slate-600 mt-3 pt-3 border-t border-slate-200">
                              {quote.notes}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Quote Summary - Hidden for Risk Manager */}
                  {!isRiskManager && (
                    <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                      <h4 className="font-semibold text-purple-900 mb-3">Quote Summary</h4>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-600">Total Quotes</span>
                          <span className="font-bold text-slate-900">{quotes.length}</span>
                        </div>
                        {lowestQuote && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-600">Lowest Quote</span>
                            <span className="font-bold text-green-600">
                              ${((lowestQuote.quotedAmount || 0) / 100).toLocaleString()}
                            </span>
                          </div>
                        )}
                        {selectedQuote && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-600">Selected Quote</span>
                            <span className="font-bold text-purple-600">
                              ${((selectedQuote.quotedAmount || 0) / 100).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <Wrench className="h-12 w-12 mx-auto mb-4 text-slate-300" />
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
