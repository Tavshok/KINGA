/**
 * Review Queue Dashboard - Training Data Approval Workflow
 * 
 * Allows Data Quality Reviewers to inspect MEDIUM/LOW confidence claims,
 * view documents, and approve/reject for training dataset inclusion.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { CheckCircle2, XCircle, AlertTriangle, FileText, Image, Clock, TrendingUp } from "lucide-react";

export default function ReviewQueue() {
  const [selectedClaim, setSelectedClaim] = useState<number | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  // Fetch review queue
  const { data: queueData, isLoading, refetch } = trpc.ml.getReviewQueue.useQuery({
    status: "pending_review",
    limit: 50,
  });

  // Fetch queue statistics
  const { data: stats } = trpc.ml.getReviewQueueStats.useQuery();

  // Approve mutation
  const approveMutation = trpc.ml.approveForTraining.useMutation({
    onSuccess: () => {
      alert("Claim approved for training dataset");
      setShowApproveDialog(false);
      setReviewNotes("");
      setSelectedClaim(null);
      refetch();
    },
    onError: (error) => {
      alert(`Approval failed: ${error.message}`);
    },
  });

  // Reject mutation
  const rejectMutation = trpc.ml.rejectForTraining.useMutation({
    onSuccess: () => {
      alert("Claim rejected from training dataset");
      setShowRejectDialog(false);
      setReviewNotes("");
      setRejectionReason("");
      setSelectedClaim(null);
      refetch();
    },
    onError: (error) => {
      alert(`Rejection failed: ${error.message}`);
    },
  });

  const handleApprove = (claimId: number) => {
    setSelectedClaim(claimId);
    setShowApproveDialog(true);
  };

  const handleReject = (claimId: number) => {
    setSelectedClaim(claimId);
    setShowRejectDialog(true);
  };

  const confirmApprove = () => {
    if (selectedClaim) {
      approveMutation.mutate({
        claimId: selectedClaim,
        reviewNotes,
      });
    }
  };

  const confirmReject = () => {
    if (selectedClaim && rejectionReason) {
      rejectMutation.mutate({
        claimId: selectedClaim,
        reviewNotes,
        rejectionReason,
      });
    }
  };

  const getConfidenceBadge = (category: string) => {
    switch (category) {
      case "HIGH":
        return <Badge className="bg-green-500">HIGH</Badge>;
      case "MEDIUM":
        return <Badge className="bg-yellow-500">MEDIUM</Badge>;
      case "LOW":
        return <Badge className="bg-red-500">LOW</Badge>;
      default:
        return <Badge>{category}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "high":
        return <Badge variant="destructive">High Priority</Badge>;
      case "medium":
        return <Badge variant="secondary">Medium Priority</Badge>;
      case "low":
        return <Badge variant="outline">Low Priority</Badge>;
      default:
        return <Badge>{priority}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading review queue...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Training Data Review Queue</h1>
        <p className="text-muted-foreground mt-2">
          Review and approve historical claims for AI training dataset inclusion
        </p>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Queue</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">claims awaiting review</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
              <p className="text-xs text-muted-foreground">require immediate attention</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Approved</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.approved}</div>
              <p className="text-xs text-muted-foreground">ready for training</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">High Priority</CardTitle>
              <TrendingUp className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.highPriority}</div>
              <p className="text-xs text-muted-foreground">urgent reviews needed</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Review Queue List */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Claims</CardTitle>
          <CardDescription>
            Claims requiring manual review before training dataset inclusion
          </CardDescription>
        </CardHeader>
        <CardContent>
          {queueData && queueData.items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <p>No claims pending review</p>
              <p className="text-sm">All claims have been processed</p>
            </div>
          ) : (
            <div className="space-y-4">
              {queueData?.items.map((item) => (
                <Card key={item.queueItem.id} className="border-l-4 border-l-yellow-500">
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">
                            Claim #{item.claim?.claimReference || item.queueItem.historicalClaimId}
                          </h3>
                          {item.score && getConfidenceBadge(item.score.trainingConfidenceCategory)}
                          {getPriorityBadge(item.queueItem.reviewPriority || "medium")}
                        </div>

                        {/* Vehicle Details */}
                        {item.claim && (
                          <div className="text-sm text-muted-foreground">
                            <p>
                              <strong>Vehicle:</strong> {item.claim.vehicleMake} {item.claim.vehicleModel} ({item.claim.vehicleYear})
                            </p>
                            <p>
                              <strong>Registration:</strong> {item.claim.vehicleRegistration || "N/A"}
                            </p>
                            <p>
                              <strong>Incident Date:</strong> {item.claim.incidentDate ? new Date(item.claim.incidentDate).toLocaleDateString() : "N/A"}
                            </p>
                          </div>
                        )}

                        {/* Confidence Score Breakdown */}
                        {item.score && (
                          <div className="mt-4 p-4 bg-muted rounded-lg">
                            <h4 className="font-medium mb-2">Confidence Score Breakdown</h4>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <span className="text-muted-foreground">Overall Score:</span>{" "}
                                <span className="font-medium">{item.score.trainingConfidenceScore}/100</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Assessor Report:</span>{" "}
                                <span className="font-medium">{item.score.assessorReportScore}/100</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Photos:</span>{" "}
                                <span className="font-medium">{item.score.supportingPhotosScore}/100</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Quotes:</span>{" "}
                                <span className="font-medium">{item.score.panelBeaterQuotesScore}/100</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Completeness:</span>{" "}
                                <span className="font-medium">{item.score.evidenceCompletenessScore}/100</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Fraud Risk:</span>{" "}
                                <span className="font-medium">{item.score.fraudMarkersScore}/100</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Routing Reason */}
                        {item.queueItem.routedReason && (
                          <div className="mt-2 text-sm">
                            <strong>Review Reason:</strong> {item.queueItem.routedReason}
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleApprove(item.queueItem.historicalClaimId)}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Approve
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleReject(item.queueItem.historicalClaimId)}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Claim for Training Dataset</DialogTitle>
            <DialogDescription>
              This claim will be included in the AI training dataset. Add any review notes below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Review notes (optional)"
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={confirmApprove} disabled={approveMutation.isPending}>
              {approveMutation.isPending ? "Approving..." : "Confirm Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Claim from Training Dataset</DialogTitle>
            <DialogDescription>
              This claim will be excluded from the AI training dataset. Please provide a rejection reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Rejection Reason *</label>
              <Textarea
                placeholder="Why is this claim being rejected? (required)"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Additional Notes</label>
              <Textarea
                placeholder="Additional review notes (optional)"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={3}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmReject}
              disabled={!rejectionReason || rejectMutation.isPending}
            >
              {rejectMutation.isPending ? "Rejecting..." : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
