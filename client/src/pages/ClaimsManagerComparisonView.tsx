/**
 * Claims Manager Comparison View
 * Detailed comparison of AI assessment vs Human evaluations
 */

import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Bot
} from "lucide-react";
import AIAssessmentPanel from "@/components/AIAssessmentPanel";

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
      <div className="container mx-auto py-8 space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="container mx-auto py-8">
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
  const avgQuoteCost = quotes && quotes.length > 0 
    ? quotes.reduce((sum: number, q: any) => sum + (q.quotedAmount || 0), 0) / quotes.length / 100 
    : null;

  // Calculate variances
  const calculateVariance = (value1: number | null, value2: number | null) => {
    if (!value1 || !value2) return null;
    return ((value1 - value2) / value2) * 100;
  };

  const aiVsAssessor = calculateVariance(assessorCost, aiCost);
  const quotesVsAi = calculateVariance(avgQuoteCost, aiCost);
  const quotesVsAssessor = calculateVariance(avgQuoteCost, assessorCost);

  const hasHighVariance = (variance: number | null) => {
    return variance !== null && Math.abs(variance) > 15;
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
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
            <Badge variant="outline">{claim.status.replace(/_/g, " ").toUpperCase()}</Badge>
          )}
          {aiAssessment?.fraudRiskLevel === "high" && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <Shield className="h-3 w-3" />
              High Fraud Risk
            </Badge>
          )}
        </div>
      </div>

      {/* Cost Comparison Overview */}
      <Card className="border-l-4 border-l-purple-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-purple-600" />
            Cost Comparison Overview
          </CardTitle>
          <CardDescription>Compare AI, Assessor, and Panel Beater estimates</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-6 mb-6">
            {/* AI Estimate */}
            <div className="bg-blue-50 rounded-lg p-4 border-2 border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <Bot className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold text-blue-900">AI Estimate</h3>
              </div>
              <p className="text-3xl font-bold text-blue-900 mb-1">
                {aiCost ? `$${aiCost.toLocaleString()}` : "N/A"}
              </p>
              {aiAssessment?.confidenceScore && (
                <p className="text-sm text-blue-700">
                  Confidence: {aiAssessment.confidenceScore}%
                </p>
              )}
            </div>

            {/* Assessor Estimate */}
            <div className="bg-green-50 rounded-lg p-4 border-2 border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <User className="h-5 w-5 text-green-600" />
                <h3 className="font-semibold text-green-900">Assessor Estimate</h3>
              </div>
              <p className="text-3xl font-bold text-green-900 mb-1">
                {assessorCost ? `$${assessorCost.toLocaleString()}` : "N/A"}
              </p>
              {aiVsAssessor !== null && (
                <div className={`flex items-center gap-1 text-sm ${
                  hasHighVariance(aiVsAssessor) ? "text-red-600 font-semibold" : "text-green-700"
                }`}>
                  {aiVsAssessor > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {Math.abs(aiVsAssessor).toFixed(1)}% vs AI
                </div>
              )}
            </div>

            {/* Panel Beater Average */}
            <div className="bg-purple-50 rounded-lg p-4 border-2 border-purple-200">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-5 w-5 text-purple-600" />
                <h3 className="font-semibold text-purple-900">Avg Quote</h3>
              </div>
              <p className="text-3xl font-bold text-purple-900 mb-1">
                {avgQuoteCost ? `$${avgQuoteCost.toLocaleString()}` : "N/A"}
              </p>
              {quotesVsAi !== null && (
                <div className={`flex items-center gap-1 text-sm ${
                  hasHighVariance(quotesVsAi) ? "text-red-600 font-semibold" : "text-purple-700"
                }`}>
                  {quotesVsAi > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {Math.abs(quotesVsAi).toFixed(1)}% vs AI
                </div>
              )}
            </div>
          </div>

          {/* Variance Analysis */}
          <div className="space-y-3">
            <h4 className="font-semibold text-slate-700">Variance Analysis</h4>
            
            {aiVsAssessor !== null && (
              <div className={`p-3 rounded-lg border ${
                hasHighVariance(aiVsAssessor) 
                  ? "bg-red-50 border-red-200" 
                  : "bg-green-50 border-green-200"
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Assessor vs AI</span>
                  <div className={`flex items-center gap-2 ${
                    hasHighVariance(aiVsAssessor) ? "text-red-700" : "text-green-700"
                  }`}>
                    {hasHighVariance(aiVsAssessor) && <AlertTriangle className="h-4 w-4" />}
                    <span className="font-bold">{Math.abs(aiVsAssessor).toFixed(1)}%</span>
                    {aiVsAssessor > 0 ? "higher" : "lower"}
                  </div>
                </div>
                {hasHighVariance(aiVsAssessor) && (
                  <p className="text-xs text-red-600 mt-1">
                    ⚠️ High variance detected - requires review
                  </p>
                )}
              </div>
            )}

            {quotesVsAi !== null && (
              <div className={`p-3 rounded-lg border ${
                hasHighVariance(quotesVsAi) 
                  ? "bg-red-50 border-red-200" 
                  : "bg-purple-50 border-purple-200"
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Panel Beater Quotes vs AI</span>
                  <div className={`flex items-center gap-2 ${
                    hasHighVariance(quotesVsAi) ? "text-red-700" : "text-purple-700"
                  }`}>
                    {hasHighVariance(quotesVsAi) && <AlertTriangle className="h-4 w-4" />}
                    <span className="font-bold">{Math.abs(quotesVsAi).toFixed(1)}%</span>
                    {quotesVsAi > 0 ? "higher" : "lower"}
                  </div>
                </div>
                {hasHighVariance(quotesVsAi) && (
                  <p className="text-xs text-red-600 mt-1">
                    ⚠️ High variance detected - requires review
                  </p>
                )}
              </div>
            )}

            {quotesVsAssessor !== null && (
              <div className={`p-3 rounded-lg border ${
                hasHighVariance(quotesVsAssessor) 
                  ? "bg-orange-50 border-orange-200" 
                  : "bg-slate-50 border-slate-200"
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Panel Beater Quotes vs Assessor</span>
                  <div className={`flex items-center gap-2 ${
                    hasHighVariance(quotesVsAssessor) ? "text-orange-700" : "text-slate-700"
                  }`}>
                    {hasHighVariance(quotesVsAssessor) && <AlertTriangle className="h-4 w-4" />}
                    <span className="font-bold">{Math.abs(quotesVsAssessor).toFixed(1)}%</span>
                    {quotesVsAssessor > 0 ? "higher" : "lower"}
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Detailed Comparison Tabs */}
      <Tabs defaultValue="ai" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="ai">AI Assessment</TabsTrigger>
          <TabsTrigger value="assessor">Assessor Evaluation</TabsTrigger>
          <TabsTrigger value="quotes">Panel Beater Quotes</TabsTrigger>
        </TabsList>

        <TabsContent value="ai" className="space-y-4">
          <AIAssessmentPanel
            claimId={claimId}
            aiAssessment={aiAssessment}
            variant="full"
            showTriggerButton={false}
          />
        </TabsContent>

        <TabsContent value="assessor" className="space-y-4">
          {assessorEval ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5 text-green-600" />
                  Assessor Evaluation
                </CardTitle>
                <CardDescription>Professional assessment by human assessor</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 rounded-lg p-4">
                        <p className="text-sm text-slate-600 mb-1">Estimated Repair Cost</p>
                        <p className="text-2xl font-bold text-slate-900">
                          ${((assessorEval.estimatedRepairCost || 0) / 100).toLocaleString()}
                        </p>
                      </div>
                  <div className="bg-slate-50 rounded-lg p-4">
                    <p className="text-sm text-slate-600 mb-1">Estimated Duration</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {assessorEval.estimatedDuration} days
                    </p>
                  </div>
                  {assessorEval.laborCost && (
                    <div className="bg-slate-50 rounded-lg p-4">
                      <p className="text-sm text-slate-600 mb-1">Labor Cost</p>
                      <p className="text-2xl font-bold text-slate-900">
                        ${(assessorEval.laborCost / 100).toLocaleString()}
                      </p>
                    </div>
                  )}
                  {assessorEval.partsCost && (
                    <div className="bg-slate-50 rounded-lg p-4">
                      <p className="text-sm text-slate-600 mb-1">Parts Cost</p>
                      <p className="text-2xl font-bold text-slate-900">
                        ${(assessorEval.partsCost / 100).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-lg p-4 border">
                  <h3 className="font-semibold text-sm text-slate-700 mb-2">Damage Assessment</h3>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">
                    {assessorEval.damageAssessment}
                  </p>
                </div>

                {assessorEval.recommendations && (
                  <div className="bg-white rounded-lg p-4 border">
                    <h3 className="font-semibold text-sm text-slate-700 mb-2">Recommendations</h3>
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">
                      {assessorEval.recommendations}
                    </p>
                  </div>
                )}

                <div className="bg-slate-50 rounded-lg p-4">
                  <h3 className="font-semibold text-sm text-slate-700 mb-2">Fraud Risk Assessment</h3>
                  <Badge variant={
                    assessorEval.fraudRiskLevel === "high" ? "destructive" :
                    assessorEval.fraudRiskLevel === "medium" ? "outline" :
                    "default"
                  }>
                    {assessorEval.fraudRiskLevel?.toUpperCase() || "N/A"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-slate-500">
                <p>No assessor evaluation available</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="quotes" className="space-y-4">
          {quotes && quotes.length > 0 ? (
            <div className="grid gap-4">
              {quotes.map((quote: any, index: number) => (
                <Card key={quote.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5 text-purple-600" />
                      Panel Beater Quote #{index + 1}
                    </CardTitle>
                    <CardDescription>
                      Status: {quote.status?.toUpperCase() || "N/A"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 rounded-lg p-4">
                        <p className="text-sm text-slate-600 mb-1">Quoted Amount</p>
                        <p className="text-2xl font-bold text-slate-900">
                          ${((quote.quotedAmount || 0) / 100).toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-4">
                        <p className="text-sm text-slate-600 mb-1">Estimated Duration</p>
                        <p className="text-2xl font-bold text-slate-900">
                          {quote.estimatedDuration} days
                        </p>
                      </div>
                      {quote.laborCost && (
                        <div className="bg-slate-50 rounded-lg p-4">
                          <p className="text-sm text-slate-600 mb-1">Labor Cost</p>
                          <p className="text-2xl font-bold text-slate-900">
                            ${(quote.laborCost / 100).toLocaleString()}
                          </p>
                        </div>
                      )}
                      {quote.partsCost && (
                        <div className="bg-slate-50 rounded-lg p-4">
                          <p className="text-sm text-slate-600 mb-1">Parts Cost</p>
                          <p className="text-2xl font-bold text-slate-900">
                            ${(quote.partsCost / 100).toLocaleString()}
                          </p>
                        </div>
                      )}
                    </div>

                    {quote.itemizedBreakdown && (
                      <div className="bg-white rounded-lg p-4 border">
                        <h3 className="font-semibold text-sm text-slate-700 mb-2">Itemized Breakdown</h3>
                        <div className="space-y-2">
                          {JSON.parse(quote.itemizedBreakdown).map((item: any, idx: number) => (
                            <div key={idx} className="flex justify-between text-sm">
                              <span className="text-slate-600">{item.item}</span>
                              <span className="font-medium">${(item.cost / 100).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {quote.notes && (
                      <div className="bg-slate-50 rounded-lg p-4">
                        <h3 className="font-semibold text-sm text-slate-700 mb-2">Notes</h3>
                        <p className="text-sm text-slate-600">{quote.notes}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-slate-500">
                <p>No panel beater quotes available</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* AI Recommendation Summary */}
      <Card className="border-l-4 border-l-blue-500 bg-blue-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-blue-600" />
            AI Recommendation for Claims Manager
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {aiAssessment?.fraudRiskLevel === "high" ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="h-5 w-5 text-red-600" />
                  <span className="font-semibold text-red-900">Recommend: Detailed Review Required</span>
                </div>
                <p className="text-sm text-red-700">
                  High fraud risk detected. Recommend thorough investigation before approval.
                </p>
              </div>
            ) : hasHighVariance(aiVsAssessor) || hasHighVariance(quotesVsAi) ? (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                  <span className="font-semibold text-orange-900">Recommend: Investigate Variance</span>
                </div>
                <p className="text-sm text-orange-700">
                  Significant cost variance detected between estimates. Recommend clarification before approval.
                </p>
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="font-semibold text-green-900">Recommend: Approve</span>
                </div>
                <p className="text-sm text-green-700">
                  AI and human assessments are aligned. No significant fraud risk detected. Safe to proceed with approval.
                </p>
              </div>
            )}

            <div className="bg-blue-100 rounded-lg p-3 text-sm text-blue-800">
              <strong>Note:</strong> This AI recommendation is provided as guidance. Final approval decision rests with the Claims Manager's professional judgment.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
