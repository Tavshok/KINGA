/**
 * Claims Manager Comparison View
 * Three-column side-by-side comparison: AI Assessment | Assessor Report | Panel Beater Quotes
 */

import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
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
  Award
} from "lucide-react";

// Confidence Score Meter Component
function ConfidenceMeter({ score }: { score: number }) {
  const getColor = (score: number) => {
    if (score >= 80) return { bg: "bg-green-500", text: "text-green-700" };
    if (score >= 60) return { bg: "bg-amber-500", text: "text-amber-700" };
    return { bg: "bg-red-500", text: "text-red-700" };
  };

  const color = getColor(score);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600">Confidence Score</span>
        <span className={`font-bold ${color.text}`}>{score}%</span>
      </div>
      <div className="w-full bg-slate-200 rounded-full h-3">
        <div
          className={`${color.bg} h-3 rounded-full transition-all duration-500`}
          style={{ width: `${score}%` }}
        ></div>
      </div>
    </div>
  );
}

// Fraud Risk Meter Component
function FraudRiskMeter({ score }: { score: number }) {
  const getColor = (score: number) => {
    if (score <= 30) return { bg: "bg-green-500", text: "text-green-700", label: "Low Risk" };
    if (score <= 60) return { bg: "bg-amber-500", text: "text-amber-700", label: "Medium Risk" };
    return { bg: "bg-red-500", text: "text-red-700", label: "High Risk" };
  };

  const color = getColor(score);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600">Fraud Risk</span>
        <span className={`font-bold ${color.text}`}>{score} - {color.label}</span>
      </div>
      <div className="w-full bg-slate-200 rounded-full h-3">
        <div
          className={`${color.bg} h-3 rounded-full transition-all duration-500`}
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
                <h1 className="text-3xl font-bold text-slate-900">Assessment Comparison</h1>
                <p className="text-slate-600 mt-1">
                  {claim.claimNumber} • {claim.vehicleMake} {claim.vehicleModel} {claim.vehicleYear}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
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
              {/* Estimated Cost */}
              <div className="text-center p-6 bg-blue-50 rounded-xl border-2 border-blue-200">
                <p className="text-sm text-slate-600 mb-2">Estimated Cost</p>
                <p className="text-5xl font-bold text-blue-900">
                  {aiCost ? `$${aiCost.toLocaleString()}` : "N/A"}
                </p>
              </div>

              {/* Confidence Score */}
              {aiAssessment?.confidenceScore && (
                <div className="p-4 bg-slate-50 rounded-lg">
                  <ConfidenceMeter score={aiAssessment.confidenceScore} />
                </div>
              )}

              {/* Fraud Risk Score */}
              {aiAssessment?.fraudRiskScore !== undefined && (
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
                  {/* Assessed Cost */}
                  <div className="text-center p-6 bg-green-50 rounded-xl border-2 border-green-200">
                    <p className="text-sm text-slate-600 mb-2">Assessed Cost</p>
                    <p className="text-5xl font-bold text-green-900">
                      {assessorCost ? `$${assessorCost.toLocaleString()}` : "N/A"}
                    </p>
                  </div>

                  {/* Discrepancy vs AI */}
                  {aiVsAssessor !== null && (
                    <div className="p-4 bg-slate-50 rounded-lg">
                      <h4 className="font-semibold text-slate-700 mb-3">Discrepancy vs AI</h4>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-slate-600">Variance</span>
                        <span className={`text-2xl font-bold ${
                          Math.abs(aiVsAssessor) > 20 ? "text-red-600" :
                          Math.abs(aiVsAssessor) >= 10 ? "text-amber-600" :
                          "text-green-600"
                        }`}>
                          {aiVsAssessor > 0 ? "+" : ""}{aiVsAssessor.toFixed(1)}%
                        </span>
                      </div>
                      <VarianceBadge variance={aiVsAssessor} />
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

          {/* Column 3: Panel Beater Quotes */}
          <Card className="border-0 shadow-lg border-t-4 border-t-purple-500">
            <CardHeader className="bg-purple-50">
              <CardTitle className="flex items-center gap-2 text-purple-900">
                <Wrench className="h-5 w-5" />
                Panel Beater Quotes
              </CardTitle>
              <CardDescription>Market quotes from repair shops</CardDescription>
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
                              {isLowest && (
                                <Badge className="bg-green-600 text-white">
                                  <Award className="h-3 w-3 mr-1" />
                                  Lowest
                                </Badge>
                              )}
                              {isSelected && (
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

                            {varianceVsAI !== null && (
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

                  {/* Quote Summary */}
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
