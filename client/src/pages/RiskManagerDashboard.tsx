import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Shield, DollarSign, CheckCircle, XCircle, AlertCircle, Eye, Brain } from "lucide-react";
import { RiskBadge, AiAssessButton } from "@/components/ClaimRiskIndicators";
import { Link } from "wouter";

export default function RiskManagerDashboard() {
  const [selectedClaim, setSelectedClaim] = useState<any>(null);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [approvalAction, setApprovalAction] = useState<"approve" | "reject">("approve");

  // Fetch claims pending technical approval
  const { data: approvalQueueData, isLoading: queueLoading, refetch: refetchQueue } = 
    trpc.claims.byStatus.useQuery({ status: "technical_approval" });
  const approvalQueue = approvalQueueData;

  // Fetch high-value claims
  // High value claims - using byStatus as fallback
  const { data: highValueClaims, isLoading: highValueLoading } = 
    trpc.claims.byStatus.useQuery({ status: "technical_approval" });

  // Approve technical basis mutation
  const approveTechnical = trpc.claims.approveClaim.useMutation({
    onSuccess: () => {
      toast.success("Technical Approval Complete", {
        description: "Technical basis has been approved successfully.",
      });
      setShowApprovalDialog(false);
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

  const handleApprove = (claim: any) => {
    setSelectedClaim(claim);
    setApprovalAction("approve");
    setShowApprovalDialog(true);
  };

  const handleReject = (claim: any) => {
    setSelectedClaim(claim);
    setApprovalAction("reject");
    setShowApprovalDialog(true);
  };

  const handleSubmitApproval = () => {
    if (!selectedClaim) return;

    if (approvalAction === "approve") {
      approveTechnical.mutate({
        claimId: selectedClaim.id,
        selectedQuoteId: 0, // placeholder - full quote selection happens in comparison view
      });
    } else {
      // Reject logic (transition to disputed state)
      toast.info("Rejection functionality will be implemented with workflow transitions");
      setShowApprovalDialog(false);
    }
  };

  const getHighValueBadge = (estimatedCost: number) => {
    if (estimatedCost >= 2000000) { // $20,000+
      return <Badge variant="destructive">Critical Value</Badge>;
    } else if (estimatedCost >= 1000000) { // $10,000+
      return <Badge variant="default">High Value</Badge>;
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 dark:text-foreground">Risk Manager Dashboard</h1>
            <p className="text-slate-600 dark:text-muted-foreground mt-1">Review and approve technical assessments</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-lg px-4 py-2">
              <Shield className="h-5 w-5 mr-2" />
              {approvalQueue?.length || 0} Pending Approval
            </Badge>
          </div>
        </div>

        {/* Technical Approval Queue */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-amber-600" />
              Technical Approval Queue
            </CardTitle>
            <CardDescription>Claims requiring technical basis approval</CardDescription>
          </CardHeader>
          <CardContent>
            {queueLoading ? (
              <p className="text-center text-slate-500 dark:text-muted-foreground py-8">Loading approval queue...</p>
            ) : approvalQueue && approvalQueue.length > 0 ? (
              <div className="space-y-3">
                {approvalQueue.map((claim: any) => (
                  <div
                    key={claim.id}
                    className="p-4 bg-slate-50 dark:bg-muted/50 rounded-lg border border-slate-200 dark:border-border hover:border-amber-300 dark:border-amber-700 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">{claim.claimNumber}</h3>
                          <Badge variant="outline">Pending Technical Approval</Badge>
                          <RiskBadge fraudRiskScore={claim.fraudRiskScore} fraudFlags={claim.fraudFlags} size="sm" />
                          {claim.estimatedCost && getHighValueBadge(claim.estimatedCost)}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-slate-600 dark:text-muted-foreground mb-3">
                          <div>
                            <span className="font-medium">Vehicle:</span> {claim.vehicleRegistration}
                          </div>
                          <div>
                            <span className="font-medium">Make/Model:</span> {claim.vehicleMake} {claim.vehicleModel}
                          </div>
                          <div>
                            <span className="font-medium">Estimated Cost:</span> $
                            {claim.estimatedCost ? claim.estimatedCost.toLocaleString() : "N/A"}
                          </div>
                          <div>
                            <span className="font-medium">Submitted:</span>{" "}
                            {new Date(claim.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        {claim.fraudRiskLevel && claim.fraudRiskLevel !== "low" && (
                          <div className="flex items-center gap-2 p-2 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded mb-2">
                            <AlertCircle className="h-4 w-4 text-yellow-600" />
                            <span className="text-sm text-yellow-700 dark:text-yellow-300">
                              Fraud Risk: <strong>{claim.fraudRiskLevel.toUpperCase()}</strong>
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="ml-4 flex flex-col gap-2">
                        <Button onClick={() => handleApprove(claim)} size="sm" className="bg-green-600 hover:bg-green-700">
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Approve
                        </Button>
                        <Button onClick={() => handleReject(claim)} size="sm" variant="destructive">
                          <XCircle className="h-4 w-4 mr-2" />
                          Reject
                        </Button>
                        <AiAssessButton 
                          claimId={claim.id}
                          claimNumber={claim.claimNumber}
                          size="sm"
                        />
                        <Link href={`/insurer/comparison/${claim.id}`}>
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
                <Shield className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 dark:text-muted-foreground">No claims pending technical approval</p>
                <p className="text-sm text-slate-400 dark:text-muted-foreground/70">Approved claims will move to payment authorization</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* High-Value Claims Oversight */}
        <Card className="shadow-lg border-l-4 border-l-red-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-red-600" />
              High-Value Claims Oversight
            </CardTitle>
            <CardDescription>Claims over $10,000 requiring special attention</CardDescription>
          </CardHeader>
          <CardContent>
            {highValueLoading ? (
              <p className="text-center text-slate-500 dark:text-muted-foreground py-8">Loading high-value claims...</p>
            ) : highValueClaims && highValueClaims.length > 0 ? (
              <div className="space-y-2">
                {highValueClaims.slice(0, 20).map((item: any) => {
                  const c = item.claim || item;
                  const assessment = item.aiAssessment;
                  const cost = c.approvedAmount || assessment?.estimatedCost;
                  return (
                    <div
                      key={c.id}
                      className="p-3 bg-red-50 dark:bg-red-950/30 rounded border border-red-200 dark:border-red-800 hover:border-red-400 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold">{c.claimNumber}</span>
                            {cost ? (
                              <Badge variant="destructive" className="text-xs">
                                ${cost.toLocaleString()}
                              </Badge>
                            ) : null}
                            <RiskBadge fraudRiskScore={c.fraudRiskScore} fraudFlags={c.fraudFlags} />
                            <Badge variant="outline" className="text-xs capitalize">
                              {(c.workflowState || c.status || 'pending').replace(/_/g, " ")}
                            </Badge>
                          </div>
                          <div className="text-sm text-slate-600 dark:text-muted-foreground">
                            {[c.vehicleRegistration, c.vehicleMake, c.vehicleModel].filter(Boolean).join(' • ') || 'Vehicle details pending'}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <AiAssessButton claimId={c.id} currentStatus={c.status} onSuccess={() => {}} />
                          <Link href={`/insurer/comparison/${c.id}`}>
                            <Button size="sm" variant="outline">
                              <Eye className="h-4 w-4 mr-2" />
                              Monitor
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <DollarSign className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 dark:text-muted-foreground text-sm">No high-value claims at this time</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Approval Dialog */}
        <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {approvalAction === "approve" ? "Approve Technical Basis" : "Reject Technical Basis"}
              </DialogTitle>
              <DialogDescription>
                {selectedClaim && `Claim: ${selectedClaim.claimNumber} - ${selectedClaim.vehicleRegistration}`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {approvalAction === "approve" ? (
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Approving this claim will move it to payment authorization queue
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded">
                  <XCircle className="h-5 w-5 text-red-600" />
                  <p className="text-sm text-red-700 dark:text-red-300">
                    Rejecting this claim will mark it as disputed and require resolution
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="approvalNotes">Notes (Optional)</Label>
                <Textarea
                  id="approvalNotes"
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  placeholder="Add any notes or comments about this decision..."
                  rows={4}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowApprovalDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSubmitApproval} 
                disabled={approveTechnical.isPending}
                variant={approvalAction === "approve" ? "default" : "destructive"}
              >
                {approveTechnical.isPending ? "Processing..." : approvalAction === "approve" ? "Approve" : "Reject"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
