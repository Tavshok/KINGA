/**
 * ClaimantClaimDetail — Sprint 4
 * Claimant-facing claim detail page at /claims/:id
 */
import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { ClaimIntelligenceHeader } from "@/components/ClaimIntelligenceHeader";
import { ArrowLeft, CheckCircle2, AlertTriangle, Clock, FileText, Car, Calendar, MapPin, DollarSign, MessageSquare, Shield, Wrench, User } from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  submitted: { label: "Submitted", color: "blue" },
  under_review: { label: "Under Review", color: "amber" },
  processing: { label: "Processing", color: "purple" },
  pending: { label: "Pending", color: "amber" },
  payment_authorized: { label: "Settlement Ready", color: "green" },
  completed: { label: "Completed", color: "green" },
  closed: { label: "Closed", color: "gray" },
  disputed: { label: "Disputed", color: "red" },
  rejected: { label: "Rejected", color: "red" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] ?? { label: status, color: "gray" };
  const colorMap: Record<string, string> = {
    blue: "bg-blue-100 text-blue-700 border-blue-200",
    amber: "bg-amber-100 text-amber-700 border-amber-200",
    purple: "bg-purple-100 text-purple-700 border-purple-200",
    green: "bg-green-100 text-green-700 border-green-200",
    gray: "bg-gray-100 text-gray-700 border-gray-200",
    red: "bg-red-100 text-red-700 border-red-200",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colorMap[s.color] ?? colorMap.gray}`}>
      {s.label}
    </span>
  );
}

export default function ClaimantClaimDetail() {
  const { user } = useAuth();
  const { fmt } = useTenantCurrency();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/claims/:id");
  const claimId = Number(params?.id ?? 0);
  const [showSettlementDialog, setShowSettlementDialog] = useState(false);
  const [showDisputeDialog, setShowDisputeDialog] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");

  const { data: claim, isLoading: claimLoading } = trpc.claims.getById.useQuery(
    { id: claimId }, { enabled: !!claimId }
  );
  const { data: aiAssessment } = trpc.aiAssessments.byClaim.useQuery(
    { claimId }, { enabled: !!claimId }
  );

  // SR-M07: Fetch repair history for repair tracking
  const repairStates = ['repair_assigned', 'repair_in_progress', 'repair_complete', 'completed', 'closed'];
  const { data: repairHistories = [] } = trpc.repairHistory.getByClaim.useQuery(
    { claimId },
    { enabled: !!claimId }
  );
  const utils = trpc.useUtils();

  const acceptSettlement = trpc.claims.acceptSettlement.useMutation({
    onSuccess: () => {
      toast.success("Settlement accepted. Your claim has been closed.");
      setShowSettlementDialog(false);
      utils.claims.getById.invalidate({ id: claimId });
    },
    onError: (err) => toast.error(`Failed to accept settlement: ${err.message}`),
  });

  const initiateDispute = trpc.claims.initiateDispute.useMutation({
    onSuccess: () => {
      toast.success("Dispute submitted. A claims manager will review your case.");
      setShowDisputeDialog(false);
      setDisputeReason("");
      utils.claims.getById.invalidate({ id: claimId });
    },
    onError: (err) => toast.error(`Failed to submit dispute: ${err.message}`),
  });

  if (claimLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading claim details...</p>
        </div>
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader><CardTitle>Claim Not Found</CardTitle></CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/client")}>
              <ArrowLeft className="mr-2 h-4 w-4" />Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canAcceptSettlement = claim.workflowState === "payment_authorized";
  // A claimant may dispute once a decision has been made (payment authorised, financial decision, completed, or closed)
  // Guard against re-disputing an already-disputed claim by checking workflowState
  const canDispute = ["payment_authorized", "financial_decision", "closed", "completed"].includes(claim.workflowState ?? "") &&
    claim.workflowState !== "disputed";
  const settlementAmount = (claim as any).finalApprovedAmount ?? (claim as any).estimatedRepairCost ?? null;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setLocation("/client")}>
                <ArrowLeft className="h-4 w-4 mr-1" />Back
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold font-mono">{claim.claimNumber}</h1>
                  <StatusBadge status={claim.status ?? "submitted"} />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {claim.vehicleMake} {claim.vehicleModel} {claim.vehicleYear} · {claim.vehicleRegistration}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canAcceptSettlement && (
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => setShowSettlementDialog(true)}>
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />Accept Settlement
                </Button>
              )}
              {canDispute && (
                <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50" onClick={() => setShowDisputeDialog(true)}>
                  <AlertTriangle className="h-4 w-4 mr-1.5" />Dispute Outcome
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {(aiAssessment as any)?._interpretation && (
        <ClaimIntelligenceHeader
          interpretation={(aiAssessment as any)._interpretation}
          cgi={(aiAssessment as any)?._cgi}
          variant="full"
        />
      )}

      {canAcceptSettlement && settlementAmount && (
        <div className="bg-green-50 dark:bg-green-950/30 border-b border-green-200 dark:border-green-800">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-800 dark:text-green-200">
                  Settlement offer ready — {fmt(settlementAmount)}
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">Review the details below and accept to close your claim.</p>
              </div>
            </div>
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => setShowSettlementDialog(true)}>
              Accept Settlement
            </Button>
          </div>
        </div>
      )}

      <main className="container mx-auto px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4 text-primary" />Claim Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <Car className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Vehicle</p>
                      <p className="text-sm font-medium">{claim.vehicleMake} {claim.vehicleModel} ({claim.vehicleYear})</p>
                      <p className="text-xs font-mono text-muted-foreground">{claim.vehicleRegistration}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Incident Date</p>
                      <p className="text-sm font-medium">{claim.incidentDate ? new Date(claim.incidentDate).toLocaleDateString() : "N/A"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Location</p>
                      <p className="text-sm font-medium">{claim.incidentLocation || "N/A"}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Policy Number</p>
                      <p className="text-sm font-medium font-mono">{claim.policyNumber || "N/A"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Submitted</p>
                      <p className="text-sm font-medium">{claim.createdAt ? new Date(claim.createdAt).toLocaleDateString() : "N/A"}</p>
                    </div>
                  </div>
                  {settlementAmount && (
                    <div className="flex items-start gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Settlement Amount</p>
                        <p className="text-sm font-bold text-green-700 dark:text-green-400">{fmt(settlementAmount)}</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            {claim.incidentDescription && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MessageSquare className="h-4 w-4 text-primary" />Incident Description
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed">{claim.incidentDescription}</p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Claim Status</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { state: "submitted", label: "Submitted", icon: FileText },
                    { state: "under_review", label: "Under Review", icon: Clock },
                    { state: "processing", label: "Processing", icon: Shield },
                    { state: "payment_authorized", label: "Settlement Ready", icon: DollarSign },
                    { state: "closed", label: "Closed", icon: CheckCircle2 },
                  ].map(({ state, label, icon: Icon }) => {
                    const workflowStates = ["submitted", "under_review", "processing", "payment_authorized", "closed"];
                    const currentIdx = workflowStates.indexOf(claim.workflowState ?? "submitted");
                    const stateIdx = workflowStates.indexOf(state);
                    const isDone = stateIdx < currentIdx;
                    const isCurrent = stateIdx === currentIdx;
                    return (
                      <div key={state} className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${isDone ? "bg-green-100 text-green-600" : isCurrent ? "bg-primary/10 text-primary ring-2 ring-primary/30" : "bg-muted text-muted-foreground"}`}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <span className={`text-sm ${isCurrent ? "font-semibold text-primary" : isDone ? "text-muted-foreground line-through" : "text-muted-foreground"}`}>{label}</span>
                        {isCurrent && <span className="ml-auto text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Current</span>}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 space-y-2">
                  {canAcceptSettlement && (
                    <Button className="w-full bg-green-600 hover:bg-green-700 text-white" onClick={() => setShowSettlementDialog(true)}>
                      <CheckCircle2 className="h-4 w-4 mr-2" />Accept Settlement
                    </Button>
                  )}
                  {canDispute && (
                    <Button variant="outline" className="w-full border-red-300 text-red-600 hover:bg-red-50" onClick={() => setShowDisputeDialog(true)}>
                      <AlertTriangle className="h-4 w-4 mr-2" />Dispute Outcome
                    </Button>
                  )}
                  <Button variant="outline" className="w-full" onClick={() => setLocation(`/claims/${claimId}/documents`)}>
                    <FileText className="h-4 w-4 mr-2" />View Documents
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* SR-M07: Repair Tracking Card — shown when claim is in a repair state */}
            {claim && repairStates.includes(claim.workflowState ?? '') && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Wrench className="h-4 w-4 text-primary" />Repair Tracking
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {repairHistories.length === 0 ? (
                    <div className="text-center py-4">
                      <Wrench className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm font-medium">Repair In Progress</p>
                      <p className="text-xs text-muted-foreground mt-1">Your vehicle is being assessed for repair assignment.</p>
                    </div>
                  ) : (
                    (repairHistories as any[]).map((repair: any) => (
                      <div key={repair.id} className="space-y-2">
                        <div className="flex items-start gap-2">
                          <User className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-muted-foreground">Repair Shop</p>
                            <p className="text-sm font-medium">Panel Beater #{repair.repairerId}</p>
                          </div>
                        </div>
                        {repair.approvalDate && (
                          <div className="flex items-start gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-xs text-muted-foreground">Approved</p>
                              <p className="text-sm font-medium">{new Date(repair.approvalDate).toLocaleDateString()}</p>
                            </div>
                          </div>
                        )}
                        {repair.repairDate ? (
                          <div className="flex items-start gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-xs text-muted-foreground">Completed</p>
                              <p className="text-sm font-medium text-green-700">{new Date(repair.repairDate).toLocaleDateString()}</p>
                              {repair.repairDurationDays && <p className="text-xs text-muted-foreground">{repair.repairDurationDays} day(s)</p>}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md">
                            <Clock className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                            <p className="text-xs text-amber-700 font-medium">Repair in progress</p>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      <Dialog open={showSettlementDialog} onOpenChange={setShowSettlementDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accept Settlement</DialogTitle>
            <DialogDescription>
              You are about to accept the settlement offer for claim <strong>{claim.claimNumber}</strong>.
              {settlementAmount && <> The settlement amount is <strong>{fmt(settlementAmount)}</strong>.</>}
              {" "}This action is final and will close your claim.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettlementDialog(false)}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700 text-white" disabled={acceptSettlement.isPending} onClick={() => acceptSettlement.mutate({ claimId })}>
              {acceptSettlement.isPending ? "Processing..." : "Confirm Acceptance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDisputeDialog} onOpenChange={setShowDisputeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dispute Outcome</DialogTitle>
            <DialogDescription>
              Describe why you are disputing the outcome of claim <strong>{claim.claimNumber}</strong>. A claims manager will review your dispute.
            </DialogDescription>
          </DialogHeader>
          <Textarea placeholder="Please explain the reason for your dispute..." value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} rows={4} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDisputeDialog(false)}>Cancel</Button>
            <Button variant="destructive" disabled={!disputeReason.trim() || initiateDispute.isPending} onClick={() => initiateDispute.mutate({ claimId, reason: disputeReason })}>
              {initiateDispute.isPending ? "Submitting..." : "Submit Dispute"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
