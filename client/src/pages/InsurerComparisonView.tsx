import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {  ArrowLeft, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import KingaLogo from "@/components/KingaLogo";
import { trpc } from "@/lib/trpc";
import { useLocation, useRoute } from "wouter";

export default function InsurerComparisonView() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/insurer/claims/:id/comparison");
  const claimId = params?.id ? parseInt(params.id) : 0;

  // Get claim details
  const { data: claim, isLoading: claimLoading } = trpc.claims.getById.useQuery({ id: claimId });

  // Get AI assessment
  const { data: aiAssessment, isLoading: aiLoading } = trpc.aiAssessments.byClaim.useQuery(
    { claimId },
    { enabled: !!claimId }
  );

  // Get assessor evaluation
  const { data: assessorEval, isLoading: assessorLoading } = trpc.assessorEvaluations.byClaim.useQuery(
    { claimId },
    { enabled: !!claimId }
  );

  // Get panel beater quotes
  const { data: quotes = [], isLoading: quotesLoading } = trpc.quotes.byClaim.useQuery(
    { claimId },
    { enabled: !!claimId }
  );

  const isLoading = claimLoading || aiLoading || assessorLoading || quotesLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-green-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-green-50">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Claim Not Found</CardTitle>
            <CardDescription>The requested claim could not be found</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/insurer/dashboard")}>
              Back to Dashboard
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <KingaLogo />
              <div>
                <h1 className="text-2xl font-bold">Fraud Detection & Comparison</h1>
                <p className="text-sm text-muted-foreground font-mono">{claim.claimNumber}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setLocation("/insurer/claims/triage")}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Triage
              </Button>
              <div className="text-right">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => logout()}>
                Sign Out
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

        {/* Side-by-Side Comparison */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* AI Assessment */}
          <Card className={aiAssessment ? "" : "opacity-60"}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Badge variant="outline" className="bg-blue-100">AI</Badge>
                AI Assessment
              </CardTitle>
              <CardDescription>
                Automated damage analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              {aiAssessment ? (
                <div className="space-y-4">
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
                            <p className="text-xs text-muted-foreground">Labor</p>
                            <p className="text-sm font-medium">
                              ${((quote.laborCost || 0) / 100).toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Parts</p>
                            <p className="text-sm font-medium">
                              ${((quote.partsCost || 0) / 100).toFixed(2)}
                            </p>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Duration</p>
                          <p className="text-sm font-medium">{quote.estimatedDuration} days</p>
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
      </main>
    </div>
  );
}
