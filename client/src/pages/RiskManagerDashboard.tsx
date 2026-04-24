import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Shield, CheckCircle, XCircle, AlertCircle, Eye } from "lucide-react";
import { RiskBadge, AiAssessButton } from "@/components/ClaimRiskIndicators";
import { Link } from "wouter";
import { currencySymbol } from "@/lib/currency";

export default function RiskManagerDashboard() {
  const [selectedClaim, setSelectedClaim] = useState<any>(null);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [approvalAction, setApprovalAction] = useState<"approve" | "reject">("approve");

  // Fetch claims pending technical approval
  const { data: approvalQueue = [], isLoading: queueLoading, refetch: refetchQueue } =
    trpc.claims.byStatus.useQuery({ status: "technical_approval" });

  // Fetch all claims for the insurer tenant — risk manager sees everything
  const { data: allClaims = [], isLoading: allClaimsLoading } =
    trpc.claims.allForTenant.useQuery();

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
      toast.error("Error", { description: error.message });
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
        selectedQuoteId: 0,
      });
    } else {
      toast.info("Rejection functionality will be implemented with workflow transitions");
      setShowApprovalDialog(false);
    }
  };

  const fmtCost = (claim: any) => {
    const sym = currencySymbol(claim.currencyCode);
    const cost = claim.approvedAmount || claim.estimatedCost;
    if (!cost) return "—";
    return `${sym} ${Number(cost).toLocaleString()}`;
  };

  const statusLabel = (status: string) =>
    (status || "pending").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Risk Manager Dashboard</h1>
            <p className="text-muted-foreground mt-1">Review and approve technical assessments</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-lg px-4 py-2">
              <Shield className="h-5 w-5 mr-2" />
              {approvalQueue.length} pending approval
            </Badge>
          </div>
        </div>

        {/* Technical Approval Queue */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Technical Approval Queue
            </CardTitle>
            <CardDescription>Claims requiring technical basis approval before financial processing</CardDescription>
          </CardHeader>
          <CardContent>
            {queueLoading ? (
              <p className="text-center text-muted-foreground py-8">Loading approval queue...</p>
            ) : approvalQueue.length > 0 ? (
              <div className="space-y-3">
                {approvalQueue.map((claim: any) => (
                  <div
                    key={claim.id}
                    className="p-4 bg-muted/30 rounded-lg border border-border hover:border-foreground/30 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">{claim.claimNumber}</h3>
                          <Badge variant="outline">Pending technical approval</Badge>
                          <RiskBadge fraudRiskScore={claim.fraudRiskScore} fraudFlags={claim.fraudFlags} size="sm" />
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-muted-foreground mb-3">
                          <div><span className="font-medium text-foreground">Vehicle:</span> {claim.vehicleRegistration || "—"}</div>
                          <div><span className="font-medium text-foreground">Make/Model:</span> {[claim.vehicleMake, claim.vehicleModel].filter(Boolean).join(" ") || "—"}</div>
                          <div><span className="font-medium text-foreground">Estimated cost:</span> {fmtCost(claim)}</div>
                          <div><span className="font-medium text-foreground">Submitted:</span> {new Date(claim.createdAt).toLocaleDateString()}</div>
                        </div>
                        {claim.fraudRiskLevel && claim.fraudRiskLevel !== "low" && (
                          <div className="flex items-center gap-2 p-2 border border-border rounded mb-2">
                            <AlertCircle className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">
                              Fraud risk: <strong className="text-foreground">{statusLabel(claim.fraudRiskLevel)}</strong>
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="ml-4 flex flex-col gap-2">
                        <Button onClick={() => handleApprove(claim)} size="sm">
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Approve
                        </Button>
                        <Button onClick={() => handleReject(claim)} size="sm" variant="outline">
                          <XCircle className="h-4 w-4 mr-2" />
                          Reject
                        </Button>
                        <AiAssessButton claimId={claim.id} claimNumber={claim.claimNumber} size="sm" />
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
                <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No claims pending technical approval</p>
                <p className="text-sm text-muted-foreground/70">Approved claims will move to payment authorisation</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* All Claims Oversight */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Claims Oversight
            </CardTitle>
            <CardDescription>All claims across the portfolio — {allClaims.length} total</CardDescription>
          </CardHeader>
          <CardContent>
            {allClaimsLoading ? (
              <p className="text-center text-muted-foreground py-8">Loading claims...</p>
            ) : allClaims.length > 0 ? (
              <div className="space-y-2">
                {allClaims.map((claim: any) => (
                  <div
                    key={claim.id}
                    className="p-3 rounded border border-border hover:border-foreground/30 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold">{claim.claimNumber}</span>
                          <Badge variant="outline" className="text-xs">
                            {statusLabel(claim.workflowState || claim.status || "pending")}
                          </Badge>
                          <RiskBadge fraudRiskScore={claim.fraudRiskScore} fraudFlags={claim.fraudFlags} />
                          {(claim.approvedAmount || claim.estimatedCost) && (
                            <span className="text-xs text-muted-foreground">{fmtCost(claim)}</span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {[claim.vehicleRegistration, claim.vehicleMake, claim.vehicleModel].filter(Boolean).join(" · ") || "Vehicle details pending"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <AiAssessButton claimId={claim.id} currentStatus={claim.status} onSuccess={() => {}} />
                        <Link href={`/insurer/comparison/${claim.id}`}>
                          <Button size="sm" variant="outline">
                            <Eye className="h-4 w-4 mr-2" />
                            View
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Eye className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">No claims on record</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Approval Dialog */}
        <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {approvalAction === "approve" ? "Approve technical basis" : "Reject technical basis"}
              </DialogTitle>
              <DialogDescription>
                {selectedClaim && `Claim: ${selectedClaim.claimNumber} — ${selectedClaim.vehicleRegistration}`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                {approvalAction === "approve"
                  ? "Approving this claim will move it to the payment authorisation queue."
                  : "Rejecting this claim will mark it as disputed and require resolution."}
              </p>
              <div className="space-y-2">
                <Label htmlFor="approvalNotes">Notes (optional)</Label>
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
