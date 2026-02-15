import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { AlertTriangle, CheckCircle, Clock, DollarSign, FileText, TrendingUp, User } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface ClaimReviewDialogProps {
  claimId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClaimReviewDialog({ claimId, open, onOpenChange }: ClaimReviewDialogProps) {
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

  if (!claimId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-primary">
            Claim Review: {claim?.claimNumber}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Comprehensive assessment summary for final review
          </p>
        </DialogHeader>

        {claimLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="ai">AI Assessment</TabsTrigger>
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
                    {aiAssessment?.fraudRiskScore !== undefined && aiAssessment.fraudRiskScore !== null ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Fraud Risk Score:</span>
                          <Badge
                            variant={
                              aiAssessment.fraudRiskScore >= 70
                                ? "destructive"
                                : aiAssessment.fraudRiskScore >= 40
                                ? "default"
                                : "secondary"
                            }
                            className="text-lg font-bold"
                          >
                            {aiAssessment.fraudRiskScore}/100
                          </Badge>
                        </div>
                        {aiAssessment.fraudFlags && aiAssessment.fraudFlags.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-sm font-medium">Fraud Indicators:</span>
                            <ul className="text-xs space-y-1">
                              {aiAssessment.fraudFlags.map((flag: string, idx: number) => (
                                <li key={idx} className="flex items-start gap-2">
                                  <span className="text-orange-500 mt-0.5">•</span>
                                  <span>{flag}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
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
                      <span className="text-muted-foreground">AI Estimate:</span>
                      <span className="font-medium">
                        ${aiAssessment?.estimatedCost ? (aiAssessment.estimatedCost / 100).toFixed(2) : "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Assessor Estimate:</span>
                      <span className="font-medium">
                        ${assessorEval?.estimatedRepairCost ? (assessorEval.estimatedRepairCost / 100).toFixed(2) : "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Lowest Quote:</span>
                      <span className="font-medium">
                        ${quotes && quotes.length > 0 ? Math.min(...quotes.map((q: any) => q.amount / 100)).toFixed(2) : "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t">
                      <span className="font-semibold">Recommended Amount:</span>
                      <span className="font-bold text-primary">
                        ${assessorEval?.estimatedRepairCost ? (assessorEval.estimatedRepairCost / 100).toFixed(2) : "N/A"}
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

            {/* AI Assessment Tab */}
            <TabsContent value="ai" className="space-y-4">
              {aiAssessment ? (
                <div className="space-y-4">
                  <Card className="p-4">
                    <h3 className="font-semibold text-lg mb-3">Damage Analysis</h3>
                    <p className="text-sm whitespace-pre-wrap">{aiAssessment.damageAnalysis || "No analysis available"}</p>
                  </Card>

                  <Card className="p-4">
                    <h3 className="font-semibold text-lg mb-3">Detected Components</h3>
                    {aiAssessment.detectedComponents && aiAssessment.detectedComponents.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {aiAssessment.detectedComponents.map((component: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-2 text-sm">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span>{component.name || component}</span>
                            {component.confidence && (
                              <Badge variant="outline" className="ml-auto">
                                {(component.confidence * 100).toFixed(0)}%
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No components detected</p>
                    )}
                  </Card>

                  <Card className="p-4">
                    <h3 className="font-semibold text-lg mb-3">Physics-Based Fraud Detection</h3>
                    {aiAssessment.fraudFlags && aiAssessment.fraudFlags.length > 0 ? (
                      <ul className="space-y-2">
                        {aiAssessment.fraudFlags.map((flag: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-2 text-sm">
                            <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                            <span>{flag}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No fraud indicators detected</p>
                    )}
                  </Card>
                </div>
              ) : (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground">No AI assessment available for this claim</p>
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
                            ${assessorEval.laborCost ? (assessorEval.laborCost / 100).toFixed(2) : "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Parts Cost:</span>
                          <span className="font-medium">
                            ${assessorEval.partsCost ? (assessorEval.partsCost / 100).toFixed(2) : "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between pt-2 border-t">
                          <span className="font-semibold">Total Estimate:</span>
                          <span className="font-bold text-primary">
                            ${(assessorEval.estimatedRepairCost / 100).toFixed(2)}
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
                            <p className="text-xs text-orange-600 font-medium">⚠️ Disagrees with AI Assessment</p>
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
                          <p className="text-2xl font-bold text-primary">${(quote.amount / 100).toFixed(2)}</p>
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
                    { label: "Assessor Assigned", date: claim?.assignedAt, icon: User },
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
