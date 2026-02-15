import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { DollarSign, CheckCircle, XCircle, Eye, MessageSquare, AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function ClaimsManagerDashboard() {
  const [selectedClaim, setSelectedClaim] = useState<any>(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showSendBackDialog, setShowSendBackDialog] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [sendBackComments, setSendBackComments] = useState("");
  const [comparisonData, setComparisonData] = useState<any>(null);

  // Fetch comparison data when a claim is selected for approval
  const { data: aiAssessment } = trpc.aiAssessments.byClaim.useQuery(
    { claimId: selectedClaim?.id || 0 },
    { enabled: !!selectedClaim }
  );
  const { data: assessorEval } = trpc.assessorEvaluations.byClaim.useQuery(
    { claimId: selectedClaim?.id || 0 },
    { enabled: !!selectedClaim }
  );
  const { data: quotes } = trpc.quotes.byClaim.useQuery(
    { claimId: selectedClaim?.id || 0 },
    { enabled: !!selectedClaim }
  );

  useEffect(() => {
    if (selectedClaim && aiAssessment) {
      const aiCost = aiAssessment.estimatedCost ? aiAssessment.estimatedCost / 100 : null;
      const assessorCost = assessorEval?.estimatedRepairCost ? assessorEval.estimatedRepairCost / 100 : null;
      const avgQuoteCost = quotes && quotes.length > 0
        ? quotes.reduce((sum: number, q: any) => sum + (q.quotedAmount || 0), 0) / quotes.length / 100
        : null;

      const calculateVariance = (v1: number | null, v2: number | null) => {
        if (!v1 || !v2) return null;
        return ((v1 - v2) / v2) * 100;
      };

      setComparisonData({
        aiCost,
        assessorCost,
        avgQuoteCost,
        aiVsAssessor: calculateVariance(assessorCost, aiCost),
        quotesVsAi: calculateVariance(avgQuoteCost, aiCost),
        fraudRisk: aiAssessment.fraudRiskLevel,
      });
    }
  }, [selectedClaim, aiAssessment, assessorEval, quotes]);

  // Fetch claims pending payment authorization (technical approval complete)
  const { data: paymentQueueData, isLoading: queueLoading, refetch: refetchQueue } = 
    trpc.workflow.getClaimsByState.useQuery({ state: "financial_decision", limit: 20 });
  const paymentQueue = paymentQueueData?.items;

  // Authorize payment mutation
  const authorizePayment = trpc.workflow.authorizePayment.useMutation({
    onSuccess: () => {
      toast.success("Payment Authorized", {
        description: "Payment has been authorized and claim is ready for closure.",
      });
      setShowApproveDialog(false);
      setSelectedClaim(null);
      setApprovalNotes("");
      refetchQueue();
    },
    onError: (error: any) => {
      toast.error("Error", {
        description: error.message,
      });
    },
  });

  // Send back to Claims Processor mutation
  const sendBackClaim = trpc.workflow.transitionState.useMutation({
    onSuccess: () => {
      toast.success("Claim Sent Back", {
        description: "Claim has been returned to Claims Processor for review.",
      });
      setShowSendBackDialog(false);
      setSelectedClaim(null);
      setSendBackComments("");
      refetchQueue();
    },
    onError: (error: any) => {
      toast.error("Error", {
        description: error.message,
      });
    },
  });

  // Add comment mutation
  const addComment = trpc.workflow.addComment.useMutation();

  const handleApprove = (claim: any) => {
    setSelectedClaim(claim);
    setShowApproveDialog(true);
  };

  const handleSendBack = (claim: any) => {
    setSelectedClaim(claim);
    setShowSendBackDialog(true);
  };

  const handleSubmitApproval = async () => {
    if (!selectedClaim) return;

    // Add approval notes as comment if provided
    if (approvalNotes) {
      await addComment.mutateAsync({
        claimId: selectedClaim.id,
        commentType: "general",
        content: `Payment Approval: ${approvalNotes}`,
      });
    }

    // Authorize payment
    authorizePayment.mutate({
      claimId: selectedClaim.id,
      approvedAmount: selectedClaim.estimatedCost || 0,
      approvalNotes: approvalNotes || undefined,
    });
  };

  const handleSubmitSendBack = async () => {
    if (!selectedClaim || !sendBackComments) {
      toast.error("Validation Error", {
        description: "Please provide comments explaining why the claim is being sent back.",
      });
      return;
    }

    // Add send-back comment
    await addComment.mutateAsync({
      claimId: selectedClaim.id,
      commentType: "clarification_request",
      content: `SENT BACK FOR REVIEW: ${sendBackComments}`,
    });

    // Transition back to created state (Claims Processor will see it)
    sendBackClaim.mutate({
      claimId: selectedClaim.id,
      newState: "created",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Claims Manager Dashboard</h1>
            <p className="text-slate-600 mt-1">Authorize payments and manage claim closure</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-lg px-4 py-2">
              <DollarSign className="h-5 w-5 mr-2" />
              {paymentQueue?.length || 0} Pending Authorization
            </Badge>
          </div>
        </div>

        {/* Payment Authorization Queue */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-purple-600" />
              Payment Authorization Queue
            </CardTitle>
            <CardDescription>
              Claims with completed assessments and technical approval - ready for payment authorization
            </CardDescription>
          </CardHeader>
          <CardContent>
            {queueLoading ? (
              <p className="text-center text-slate-500 py-8">Loading payment queue...</p>
            ) : paymentQueue && paymentQueue.length > 0 ? (
              <div className="space-y-3">
                {paymentQueue.map((claim: any) => (
                  <div
                    key={claim.id}
                    className="p-4 bg-slate-50 rounded-lg border border-slate-200 hover:border-purple-300 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">{claim.claimNumber}</h3>
                          <Badge variant="outline">Ready for Payment</Badge>
                          {claim.technicalApprovalStatus === "approved" && (
                            <Badge variant="default" className="bg-green-600">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Technical Approved
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-slate-600 mb-3">
                          <div>
                            <span className="font-medium">Vehicle:</span> {claim.vehicleRegistration}
                          </div>
                          <div>
                            <span className="font-medium">Make/Model:</span> {claim.vehicleMake} {claim.vehicleModel}
                          </div>
                          <div>
                            <span className="font-medium">Payment Amount:</span> $
                            {claim.estimatedCost ? (claim.estimatedCost / 100).toLocaleString() : "N/A"}
                          </div>
                          <div>
                            <span className="font-medium">Submitted:</span>{" "}
                            {new Date(claim.createdAt).toLocaleDateString()}
                          </div>
                        </div>

                        {/* Assessment Summary */}
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded mb-2">
                          <div className="flex items-center gap-2 mb-1">
                            <CheckCircle className="h-4 w-4 text-blue-600" />
                            <span className="text-sm font-medium text-blue-700">Assessment Complete</span>
                          </div>
                          <div className="text-xs text-slate-600 grid grid-cols-2 gap-2">
                            {claim.fraudRiskLevel && (
                              <div>
                                <span className="font-medium">Fraud Risk:</span>{" "}
                                <span className={claim.fraudRiskLevel === "high" ? "text-red-600 font-semibold" : ""}>
                                  {claim.fraudRiskLevel.toUpperCase()}
                                </span>
                              </div>
                            )}
                            {claim.technicalApprovalDate && (
                              <div>
                                <span className="font-medium">Approved:</span>{" "}
                                {new Date(claim.technicalApprovalDate).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        </div>

                        {claim.fraudRiskLevel === "high" && (
                          <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded">
                            <AlertCircle className="h-4 w-4 text-red-600" />
                            <span className="text-sm text-red-700">
                              <strong>High Fraud Risk</strong> - Review carefully before authorization
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="ml-4 flex flex-col gap-2">
                        <Button onClick={() => handleApprove(claim)} size="sm" className="bg-green-600 hover:bg-green-700">
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Approve Payment
                        </Button>
                        <Button onClick={() => handleSendBack(claim)} size="sm" variant="outline" className="border-orange-500 text-orange-700 hover:bg-orange-50">
                          <MessageSquare className="h-4 w-4 mr-2" />
                          Send Back
                        </Button>
                        <Link href={`/claims-manager/comparison/${claim.id}`}>
                          <Button variant="outline" size="sm" className="w-full">
                            <Eye className="h-4 w-4 mr-2" />
                            Review
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <DollarSign className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No claims pending payment authorization</p>
                <p className="text-sm text-slate-400">Claims with technical approval will appear here</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Approve Payment Dialog */}
        <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Authorize Payment</DialogTitle>
              <DialogDescription>
                {selectedClaim && (
                  <>
                    Claim: {selectedClaim.claimNumber} - {selectedClaim.vehicleRegistration}
                    <br />
                    Payment Amount: ${selectedClaim.estimatedCost ? (selectedClaim.estimatedCost / 100).toLocaleString() : "N/A"}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* AI Comparison Summary */}
              {comparisonData && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                  <h3 className="font-semibold text-blue-900 text-sm">Cost Comparison Summary</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white rounded p-2">
                      <p className="text-xs text-slate-600">AI Estimate</p>
                      <p className="text-lg font-bold text-blue-900">
                        {comparisonData.aiCost ? `$${comparisonData.aiCost.toLocaleString()}` : "N/A"}
                      </p>
                    </div>
                    <div className="bg-white rounded p-2">
                      <p className="text-xs text-slate-600">Assessor</p>
                      <p className="text-lg font-bold text-green-900">
                        {comparisonData.assessorCost ? `$${comparisonData.assessorCost.toLocaleString()}` : "N/A"}
                      </p>
                      {comparisonData.aiVsAssessor !== null && (
                        <p className={`text-xs ${
                          Math.abs(comparisonData.aiVsAssessor) > 15 ? "text-red-600 font-semibold" : "text-green-700"
                        }`}>
                          {Math.abs(comparisonData.aiVsAssessor).toFixed(1)}% vs AI
                        </p>
                      )}
                    </div>
                    <div className="bg-white rounded p-2">
                      <p className="text-xs text-slate-600">Avg Quote</p>
                      <p className="text-lg font-bold text-purple-900">
                        {comparisonData.avgQuoteCost ? `$${comparisonData.avgQuoteCost.toLocaleString()}` : "N/A"}
                      </p>
                      {comparisonData.quotesVsAi !== null && (
                        <p className={`text-xs ${
                          Math.abs(comparisonData.quotesVsAi) > 15 ? "text-red-600 font-semibold" : "text-purple-700"
                        }`}>
                          {Math.abs(comparisonData.quotesVsAi).toFixed(1)}% vs AI
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Variance Warnings */}
                  {(Math.abs(comparisonData.aiVsAssessor || 0) > 15 || Math.abs(comparisonData.quotesVsAi || 0) > 15) && (
                    <div className="bg-orange-50 border border-orange-300 rounded p-2 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-orange-600 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-orange-800">
                        <strong>High Variance Detected:</strong> Significant differences between estimates. Review carefully.
                      </p>
                    </div>
                  )}

                  {/* Fraud Risk Warning */}
                  {comparisonData.fraudRisk === "high" && (
                    <div className="bg-red-50 border border-red-300 rounded p-2 flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-red-800">
                        <strong>High Fraud Risk:</strong> AI detected suspicious patterns. Consider escalating to Risk Manager.
                      </p>
                    </div>
                  )}

                  <Link href={`/claims-manager/comparison/${selectedClaim?.id}`} target="_blank">
                    <Button variant="outline" size="sm" className="w-full text-xs">
                      <Eye className="h-3 w-3 mr-2" />
                      View Full Comparison Report
                    </Button>
                  </Link>
                </div>
              )}

              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <p className="text-sm text-green-700">
                  Authorizing this payment will close the claim and initiate payment processing
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="approvalNotes">Authorization Notes (Optional)</Label>
                <Textarea
                  id="approvalNotes"
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  placeholder="Add any notes about this payment authorization..."
                  rows={4}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowApproveDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSubmitApproval} 
                disabled={authorizePayment.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {authorizePayment.isPending ? "Processing..." : "Authorize Payment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Send Back Dialog */}
        <Dialog open={showSendBackDialog} onOpenChange={setShowSendBackDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send Claim Back for Review</DialogTitle>
              <DialogDescription>
                {selectedClaim && `Claim: ${selectedClaim.claimNumber} - ${selectedClaim.vehicleRegistration}`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded">
                <MessageSquare className="h-5 w-5 text-orange-600" />
                <p className="text-sm text-orange-700">
                  This claim will be returned to the Claims Processor for further review
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sendBackComments">Comments (Required) *</Label>
                <Textarea
                  id="sendBackComments"
                  value={sendBackComments}
                  onChange={(e) => setSendBackComments(e.target.value)}
                  placeholder="Explain what needs to be reviewed or validated (e.g., 'Please verify damage assessment with external assessor - estimated cost seems high for reported damage')"
                  rows={6}
                />
                <p className="text-xs text-slate-500">
                  These comments will be visible to the Claims Processor who can reassign the claim for re-assessment
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSendBackDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSubmitSendBack} 
                disabled={sendBackClaim.isPending || !sendBackComments}
                variant="outline"
                className="border-orange-500 text-orange-700 hover:bg-orange-50"
              >
                {sendBackClaim.isPending ? "Sending..." : "Send Back for Review"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
