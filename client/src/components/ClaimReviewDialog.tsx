import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { AlertTriangle, CheckCircle, Clock, DollarSign, FileText, TrendingUp, User, Download } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { exportClaimReportToPDF, type ClaimReportData } from "@/lib/export-pdf";
import { toast } from "sonner";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

interface ClaimReviewDialogProps {
  claimId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClaimReviewDialog({ claimId, open, onOpenChange }: ClaimReviewDialogProps) {
  const { fmt } = useTenantCurrency();
  const { data: claim, isLoading: claimLoading } = trpc.claims.getById.useQuery(
    { id: claimId! },
    { enabled: !!claimId }
  );

  const { data: aiAssessment } = trpc.aiAssessments.byClaim.useQuery(
    { claimId: claimId! },
    { enabled: !!claimId }
  );

  const { data: assessorEval } = trpc.assessorEvaluations.byClaim.useQuery(
    { claimId: claimId! },
    { enabled: !!claimId }
  );

  const { data: quotes } = trpc.quotes.byClaim.useQuery(
    { claimId: claimId! },
    { enabled: !!claimId }
  );

  const handleExportPDF = () => {
    if (!claim) {
      toast.error("Claim data not loaded");
      return;
    }

    const reportData: ClaimReportData = {
      claim: {
        claimNumber: claim.claimNumber,
        vehicleRegistration: claim.vehicleRegistration,
        vehicleMake: claim.vehicleMake,
        vehicleModel: claim.vehicleModel,
        policyNumber: claim.policyNumber,
        createdAt: claim.createdAt ? new Date(claim.createdAt) : null,
        incidentDate: claim.incidentDate ? new Date(claim.incidentDate) : null,
        incidentType: claim.incidentType,
      },
      aiAssessment: aiAssessment ? {
        fraudRiskLevel: aiAssessment.fraudRiskLevel,
        fraudIndicators: aiAssessment.fraudIndicators,
        estimatedCost: aiAssessment.estimatedCost,
        damageDescription: aiAssessment.damageDescription,
        detectedDamageTypes: aiAssessment.detectedDamageTypes,
      } : undefined,
      assessorEval: assessorEval && assessorEval.damageAssessment && assessorEval.estimatedRepairCost != null && assessorEval.estimatedDuration != null ? {
        damageAssessment: assessorEval.damageAssessment,
        estimatedRepairCost: assessorEval.estimatedRepairCost,
        laborCost: assessorEval.laborCost,
        partsCost: assessorEval.partsCost,
        estimatedDuration: assessorEval.estimatedDuration,
        fraudRiskLevel: assessorEval.fraudRiskLevel,
        recommendations: assessorEval.recommendations,
        disagreesWithAi: assessorEval.disagreesWithAi != null ? Boolean(assessorEval.disagreesWithAi) : null,
        aiDisagreementReason: assessorEval.aiDisagreementReason,
      } : undefined,
      quotes: (quotes || []).map((q: any) => ({
        id: q.id,
        panelBeaterName: q.panelBeaterName || null,
        amount: q.quotedAmount || 0,
        breakdown: q.breakdown || null,
        notes: q.notes || null,
        status: q.status || 'pending',
        createdAt: q.createdAt ? new Date(q.createdAt) : new Date(),
      })),
    };

    exportClaimReportToPDF(reportData);
    toast.success("PDF report generated successfully");
  };

  if (!claimId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-2xl font-bold text-primary">
                Claim Review: {claim?.claimNumber}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                Comprehensive assessment summary for final review
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPDF}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Export PDF Report
            </Button>
          </div>
        </DialogHeader>

        {claimLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="ai">KINGA Assessment</TabsTrigger>
              <TabsTrigger value="assessor">Assessor Evaluation</TabsTrigger>
              <TabsTrigger value="quotes">Panel Beater Quotes</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Claim Summary */}
                <Card className="p-4">
                  <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Claim Summary
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Vehicle:</span>
                      <span className="font-medium">{claim?.vehicleRegistration || "N/A"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Make/Model:</span>
                      <span className="font-medium">{claim?.vehicleMake} {claim?.vehicleModel}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Policy:</span>
                      <span className="font-medium">{claim?.policyNumber || "N/A"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Submitted:</span>
                      <span className="font-medium">
                        {claim?.createdAt ? new Date(claim.createdAt).toLocaleDateString() : "N/A"}
                      </span>
                    </div>
                  </div>
                </Card>

                {/* Risk Assessment */}
                <Card className="p-4">
                  <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-500" />
                    Risk Assessment
                  </h3>
                  <div className="space-y-3">
                    {claim?.fraudRiskScore !== undefined && claim.fraudRiskScore !== null ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Fraud Risk Score:</span>
                          <Badge
                            variant={
                              claim.fraudRiskScore >= 70
                                ? "destructive"
                                : claim.fraudRiskScore >= 40
                                ? "default"
                                : "secondary"
                            }
                            className="text-lg font-bold"
                          >
                            {claim.fraudRiskScore}/100
                          </Badge>
                        </div>
                        {claim.fraudFlags && (() => {
                          try {
                            const flags = JSON.parse(claim.fraudFlags);
                            return Array.isArray(flags) && flags.length > 0 && (
                              <div className="space-y-1">
                                <span className="text-sm font-medium">Fraud Indicators:</span>
                                <ul className="text-xs space-y-1">
                                  {flags.map((flag: string, idx: number) => (
                                    <li key={idx} className="flex items-start gap-2">
                                      <span className="text-orange-500 mt-0.5">•</span>
                                      <span>{flag}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            );
                          } catch {
                            return null;
                          }
                        })()}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">No AI risk assessment available</p>
                    )}
                  </div>
                </Card>

                {/* Cost Comparison */}
                <Card className="p-4">
                  <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-green-500" />
                    Cost Comparison
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">KINGA Estimate:</span>
                      <span className="font-medium">
                        {aiAssessment?.estimatedCost ? fmt((aiAssessment.estimatedCost || 0) * 100) : "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Lowest Quote:</span>
                      <span className="font-medium">
                        {quotes && quotes.length > 0 ? fmt(Math.min(...quotes.map((q: any) => q.amount))) : "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t">
                      <span className="font-semibold">Recommended Amount:</span>
                      <span className="font-bold text-primary">
                        {assessorEval?.estimatedRepairCost ? fmt(assessorEval.estimatedRepairCost) : "N/A"}
                      </span>
                    </div>
                  </div>
                </Card>

                {/* Assessor Recommendation */}
                <Card className="p-4">
                  <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                    <User className="h-5 w-5 text-blue-500" />
                    Assessor Recommendation
                  </h3>
                  <div className="space-y-2 text-sm">
                    {assessorEval ? (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Fraud Risk:</span>
                          <Badge
                            variant={
                              assessorEval.fraudRiskLevel === "high"
                                ? "destructive"
                                : assessorEval.fraudRiskLevel === "medium"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {assessorEval.fraudRiskLevel?.toUpperCase()}
                          </Badge>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Duration:</span>
                          <span className="ml-2 font-medium">{assessorEval.estimatedDuration} days</span>
                        </div>
                        {assessorEval.recommendations && (
                          <div className="pt-2">
                            <span className="text-muted-foreground block mb-1">Notes:</span>
                            <p className="text-xs bg-muted p-2 rounded">{assessorEval.recommendations}</p>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-muted-foreground">No assessor evaluation available</p>
                    )}
                  </div>
                </Card>
              </div>
            </TabsContent>

            {/* KINGA Assessment Tab */}
            <TabsContent value="ai" className="space-y-4">
              {aiAssessment ? (
                <div className="space-y-4">
                  <Card className="p-4">
                    <h3 className="font-semibold text-lg mb-3">Damage Description</h3>
                    <p className="text-sm whitespace-pre-wrap">{aiAssessment.damageDescription || "No description available"}</p>
                  </Card>

                  <Card className="p-4">
                    <h3 className="font-semibold text-lg mb-3">Detected Damage Types</h3>
                    {(() => {
                      try {
                        const damageTypes = aiAssessment.detectedDamageTypes ? JSON.parse(aiAssessment.detectedDamageTypes) : [];
                        return Array.isArray(damageTypes) && damageTypes.length > 0 ? (
                          <div className="grid grid-cols-2 gap-2">
                            {damageTypes.map((damageType: string, idx: number) => (
                              <div key={idx} className="flex items-center gap-2 text-sm">
                                <CheckCircle className="h-4 w-4 text-green-500" />
                                <span>{damageType}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No damage types detected</p>
                        );
                      } catch {
                        return <p className="text-sm text-muted-foreground">Invalid damage types data</p>;
                      }
                    })()}
                  </Card>

                  <Card className="p-4">
                    <h3 className="font-semibold text-lg mb-3">Fraud Indicators</h3>
                    {(() => {
                      try {
                        const indicators = aiAssessment.fraudIndicators ? JSON.parse(aiAssessment.fraudIndicators) : [];
                        return Array.isArray(indicators) && indicators.length > 0 ? (
                          <ul className="space-y-2">
                            {indicators.map((indicator: string, idx: number) => (
                              <li key={idx} className="flex items-start gap-2 text-sm">
                                <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                                <span>{indicator}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">No fraud indicators detected</p>
                        );
                      } catch {
                        return <p className="text-sm text-muted-foreground">Invalid fraud indicators data</p>;
                      }
                    })()}
                  </Card>
                </div>
              ) : (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground">No KINGA assessment available for this claim</p>
                </Card>
              )}
            </TabsContent>

            {/* Assessor Evaluation Tab */}
            <TabsContent value="assessor" className="space-y-4">
              {assessorEval ? (
                <div className="space-y-4">
                  <Card className="p-4">
                    <h3 className="font-semibold text-lg mb-3">Damage Assessment</h3>
                    <p className="text-sm whitespace-pre-wrap">{assessorEval.damageAssessment}</p>
                  </Card>

                  <div className="grid grid-cols-2 gap-4">
                    <Card className="p-4">
                      <h3 className="font-semibold text-lg mb-3">Cost Breakdown</h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Labor Cost:</span>
                          <span className="font-medium">
                            {assessorEval.laborCost ? fmt(assessorEval.laborCost) : "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Parts Cost:</span>
                          <span className="font-medium">
                            {assessorEval.partsCost ? fmt(assessorEval.partsCost) : "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between pt-2 border-t">
                          <span className="font-semibold">Total Estimate:</span>
                          <span className="font-bold text-primary">
                            {assessorEval.estimatedRepairCost != null ? fmt(assessorEval.estimatedRepairCost) : "N/A"}
                          </span>
                        </div>
                      </div>
                    </Card>

                    <Card className="p-4">
                      <h3 className="font-semibold text-lg mb-3">Timeline & Risk</h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span>Estimated Duration: {assessorEval.estimatedDuration} days</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                          <span>Fraud Risk: </span>
                          <Badge
                            variant={
                              assessorEval.fraudRiskLevel === "high"
                                ? "destructive"
                                : assessorEval.fraudRiskLevel === "medium"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {assessorEval.fraudRiskLevel?.toUpperCase()}
                          </Badge>
                        </div>
                        {assessorEval.disagreesWithAi && (
                          <div className="pt-2 border-t">
                            <p className="text-xs text-orange-600 font-medium">⚠️ Disagrees with KINGA Assessment</p>
                            {assessorEval.aiDisagreementReason && (
                              <p className="text-xs text-muted-foreground mt-1">{assessorEval.aiDisagreementReason}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </Card>
                  </div>

                  {assessorEval.recommendations && (
                    <Card className="p-4">
                      <h3 className="font-semibold text-lg mb-3">Recommendations</h3>
                      <p className="text-sm whitespace-pre-wrap">{assessorEval.recommendations}</p>
                    </Card>
                  )}
                </div>
              ) : (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground">No assessor evaluation available for this claim</p>
                </Card>
              )}
            </TabsContent>

            {/* Panel Beater Quotes Tab */}
            <TabsContent value="quotes" className="space-y-4">
              {quotes && quotes.length > 0 ? (
                <div className="space-y-4">
                  {quotes.map((quote: any) => (
                    <Card key={quote.id} className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-lg">{quote.panelBeaterName || "Panel Beater"}</h3>
                          <p className="text-sm text-muted-foreground">
                            Submitted: {new Date(quote.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-primary">{fmt(quote.amount)}</p>
                          <Badge variant={quote.status === "accepted" ? "default" : "outline"}>
                            {quote.status}
                          </Badge>
                        </div>
                      </div>
                      {quote.breakdown && (
                        <div className="space-y-1 text-sm">
                          <p className="font-medium">Cost Breakdown:</p>
                          <div className="bg-muted p-2 rounded text-xs whitespace-pre-wrap">
                            {typeof quote.breakdown === "string" ? quote.breakdown : JSON.stringify(quote.breakdown, null, 2)}
                          </div>
                        </div>
                      )}
                      {quote.notes && (
                        <div className="mt-2 text-sm">
                          <p className="font-medium">Notes:</p>
                          <p className="text-muted-foreground">{quote.notes}</p>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground">No panel beater quotes available for this claim</p>
                </Card>
              )}
            </TabsContent>

            {/* Timeline Tab */}
            <TabsContent value="timeline" className="space-y-4">
              <Card className="p-4">
                <h3 className="font-semibold text-lg mb-4">Claim Workflow Timeline</h3>
                <div className="space-y-4">
                  {[
                    { label: "Claim Submitted", date: claim?.createdAt, icon: FileText },
                    { label: "Assessment Completed", date: assessorEval?.createdAt, icon: CheckCircle },
                    { label: "Technically Approved", date: claim?.technicallyApprovedAt, icon: CheckCircle },
                    { label: "Financially Approved", date: claim?.financiallyApprovedAt, icon: DollarSign },
                    { label: "Claim Closed", date: claim?.closedAt, icon: CheckCircle },
                  ].map((event, idx) => {
                    const Icon = event.icon;
                    return (
                      <div key={idx} className="flex items-start gap-4">
                        <div
                          className={`rounded-full p-2 ${
                            event.date ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-sm">{event.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {event.date ? new Date(event.date).toLocaleString() : "Pending"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
