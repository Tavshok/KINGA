/**
 * Manager Review Dashboard
 * 
 * Displays pending incident reports for fleet manager review with approve/reject actions.
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, XCircle, Eye, Loader2, AlertCircle, MapPin, Calendar, Car } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ManagerReviewDashboardProps {
  fleetId?: number;
}

export function ManagerReviewDashboard({ fleetId }: ManagerReviewDashboardProps) {
  const [selectedIncident, setSelectedIncident] = useState<any | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const { data: pendingIncidents, isLoading, refetch } = trpc.fleet.getPendingServiceRequests.useQuery(
    fleetId ? { fleetId } : undefined
  );

  const approveIncident = trpc.fleet.approveServiceRequest.useMutation({
    onSuccess: () => {
      toast.success("Incident approved", {
        description: "The incident report has been approved and will proceed to claims processing.",
      });
      refetch();
      setIsDetailsModalOpen(false);
    },
    onError: (error) => {
      toast.error("Failed to approve incident", {
        description: error.message,
      });
    },
  });

  const rejectIncident = trpc.fleet.approveServiceRequest.useMutation({
    onSuccess: () => {
      toast.success("Incident rejected", {
        description: "The incident report has been rejected with the provided reason.",
      });
      refetch();
      setIsRejectModalOpen(false);
      setIsDetailsModalOpen(false);
      setRejectionReason("");
    },
    onError: (error) => {
      toast.error("Failed to reject incident", {
        description: error.message,
      });
    },
  });

  const handleApprove = (incident: any) => {
    approveIncident.mutate({
      requestId: incident.id,
      decision: "approved",
    });
  };

  const handleReject = () => {
    if (!selectedIncident) return;
    
    if (!rejectionReason.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }

    rejectIncident.mutate({
      requestId: selectedIncident.id,
      decision: "rejected",
      rejectionReason,
    });
  };

  const openDetailsModal = (incident: any) => {
    setSelectedIncident(incident);
    setIsDetailsModalOpen(true);
  };

  const openRejectModal = (incident: any) => {
    setSelectedIncident(incident);
    setIsRejectModalOpen(true);
  };

  const getSeverityBadge = (urgency: string) => {
    const severityMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      critical: { label: "Critical", variant: "destructive" },
      high: { label: "Major", variant: "destructive" },
      medium: { label: "Moderate", variant: "secondary" },
      low: { label: "Minor", variant: "outline" },
    };

    const severity = severityMap[urgency] || severityMap.medium;
    return <Badge variant={severity.variant}>{severity.label}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!pendingIncidents || pendingIncidents.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pending Incident Reports</CardTitle>
          <CardDescription>Review and approve incident reports from fleet drivers</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Pending Incidents</h3>
            <p className="text-muted-foreground">
              All incident reports have been reviewed. Check back later for new submissions.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Pending Incident Reports ({pendingIncidents.length})</CardTitle>
          <CardDescription>Review and approve incident reports from fleet drivers</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {pendingIncidents.map((incident) => (
              <Card key={incident.id} className="border-l-4 border-l-orange-500">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg">{incident.title}</h3>
                        {getSeverityBadge(incident.urgency)}
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Car className="w-4 h-4" />
                          <span>Vehicle ID: {incident.vehicleId}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDistanceToNow(new Date(incident.createdAt), { addSuffix: true })}</span>
                        </div>
                      </div>

                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {incident.description}
                      </p>

                      {incident.problemImages && incident.problemImages.length > 0 && (
                        <div className="flex items-center gap-2 text-sm text-emerald-600">
                          <span>📷 {incident.problemImages.length} photo(s) attached</span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDetailsModal(incident)}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View Details
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleApprove(incident)}
                        disabled={approveIncident.isPending}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Approve
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => openRejectModal(incident)}
                        disabled={rejectIncident.isPending}
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Details Modal */}
      <Dialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Incident Report Details</DialogTitle>
            <DialogDescription>
              Review the full incident report before making a decision.
            </DialogDescription>
          </DialogHeader>
          {selectedIncident && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-lg">{selectedIncident.title}</h3>
                {getSeverityBadge(selectedIncident.urgency)}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Vehicle ID:</span>
                  <p className="font-medium">{selectedIncident.vehicleId}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Submitted:</span>
                  <p className="font-medium">
                    {formatDistanceToNow(new Date(selectedIncident.createdAt), { addSuffix: true })}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Service Category:</span>
                  <p className="font-medium capitalize">{selectedIncident.serviceCategory}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Request Type:</span>
                  <p className="font-medium capitalize">{selectedIncident.requestType}</p>
                </div>
              </div>

              <div>
                <span className="text-muted-foreground text-sm">Description:</span>
                <p className="mt-1 whitespace-pre-wrap">{selectedIncident.description}</p>
              </div>

              {selectedIncident.problemImages && selectedIncident.problemImages.length > 0 && (
                <div>
                  <span className="text-muted-foreground text-sm">Attached Photos:</span>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {selectedIncident.problemImages.map((image: string, index: number) => (
                      <div
                        key={index}
                        className="aspect-square bg-muted rounded-lg flex items-center justify-center text-sm text-muted-foreground"
                      >
                        📷 {image}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedIncident.urgency === "critical" && (
                <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                  <div className="text-sm text-red-800">
                    <p className="font-semibold">Critical Incident</p>
                    <p>
                      This incident requires immediate attention. Ensure appropriate actions are taken.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailsModalOpen(false)}>
              Close
            </Button>
            <Button
              variant="default"
              onClick={() => selectedIncident && handleApprove(selectedIncident)}
              disabled={approveIncident.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Approve
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setIsDetailsModalOpen(false);
                selectedIncident && openRejectModal(selectedIncident);
              }}
            >
              <XCircle className="w-4 h-4 mr-2" />
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejection Modal */}
      <Dialog open={isRejectModalOpen} onOpenChange={setIsRejectModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Incident Report</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this incident report.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rejectionReason">Rejection Reason *</Label>
              <Textarea
                id="rejectionReason"
                placeholder="Explain why this incident report is being rejected..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejectIncident.isPending || !rejectionReason.trim()}
            >
              {rejectIncident.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Rejecting...
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 mr-2" />
                  Reject Incident
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
