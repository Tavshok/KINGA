/**
 * FleetManagerApprovalsTab
 *
 * Displayed inside the Claims Manager Dashboard under the "Fleet Approvals" tab.
 * Allows claims managers to review, approve, or reject fleet manager registration requests.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Building2,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Phone,
  Briefcase,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type RequestStatus = "pending" | "approved" | "rejected" | "all";

export function FleetManagerApprovalsTab() {
  const [statusFilter, setStatusFilter] = useState<RequestStatus>("pending");
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [approveNotes, setApproveNotes] = useState("");
  const [rejectNotes, setRejectNotes] = useState("");

  const { data, isLoading, refetch } = trpc.fleetAccounts.listPendingRequests.useQuery({
    status: statusFilter,
    limit: 100,
  });

  const approveMutation = trpc.fleetAccounts.approveFleetManagerRequest.useMutation({
    onSuccess: (res) => {
      toast.success(res.message);
      setShowApproveDialog(false);
      setSelectedRequest(null);
      setApproveNotes("");
      refetch();
    },
    onError: (err) => toast.error(err.message ?? "Approval failed"),
  });

  const rejectMutation = trpc.fleetAccounts.rejectFleetManagerRequest.useMutation({
    onSuccess: (res) => {
      toast.success(res.message);
      setShowRejectDialog(false);
      setSelectedRequest(null);
      setRejectNotes("");
      refetch();
    },
    onError: (err) => toast.error(err.message ?? "Rejection failed"),
  });

  const requests = data?.requests ?? [];

  const statusBadge = (status: string) => {
    if (status === "pending") return <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/20"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    if (status === "approved") return <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
    if (status === "rejected") return <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50 dark:bg-red-950/20"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
    return <Badge variant="secondary">{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-emerald-600" />
            Fleet Manager Approvals
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Review and approve fleet manager registration requests from claimants.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as RequestStatus)}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="h-8 gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Pending Review", value: requests.filter(r => r.status === "pending").length, color: "text-amber-600" },
          { label: "Approved", value: requests.filter(r => r.status === "approved").length, color: "text-emerald-600" },
          { label: "Rejected", value: requests.filter(r => r.status === "rejected").length, color: "text-red-600" },
        ].map(stat => (
          <Card key={stat.label} className="py-3">
            <CardContent className="pt-0 pb-0 px-4">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Request list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
          Loading requests...
        </div>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {statusFilter === "pending" ? "No pending fleet manager requests." : `No ${statusFilter} requests found.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <Card key={req.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Company name + status */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Building2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                      <span className="font-semibold text-sm">{req.companyName}</span>
                      {req.companyReg && (
                        <span className="text-xs text-muted-foreground">({req.companyReg})</span>
                      )}
                      {statusBadge(req.status)}
                    </div>
                    {/* Applicant info */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {req.userName ?? "Unknown user"} {req.userEmail ? `(${req.userEmail})` : ""}
                      </span>
                      {req.jobTitle && (
                        <span className="flex items-center gap-1">
                          <Briefcase className="h-3 w-3" />
                          {req.jobTitle}
                        </span>
                      )}
                      {req.contactPhone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {req.contactPhone}
                        </span>
                      )}
                    </div>
                    {/* Dates */}
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>Submitted: {req.createdAt ? new Date(req.createdAt).toLocaleDateString() : "—"}</span>
                      {req.reviewedAt && (
                        <span>Reviewed: {new Date(req.reviewedAt).toLocaleDateString()}</span>
                      )}
                    </div>
                    {/* Review notes */}
                    {req.reviewNotes && (
                      <div className="text-xs bg-muted/50 rounded px-2 py-1 text-muted-foreground">
                        <span className="font-medium">Review notes: </span>{req.reviewNotes}
                      </div>
                    )}
                  </div>
                  {/* Action buttons — only for pending */}
                  {req.status === "pending" && (
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 h-8 text-xs gap-1"
                        onClick={() => { setSelectedRequest(req); setShowApproveDialog(true); }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50 h-8 text-xs gap-1"
                        onClick={() => { setSelectedRequest(req); setShowRejectDialog(true); }}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Approve Fleet Manager Request
            </DialogTitle>
            <DialogDescription>
              Approving this request will upgrade <strong>{selectedRequest?.userName}</strong> to fleet manager for <strong>{selectedRequest?.companyName}</strong>. They will immediately gain access to the fleet dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Approval Notes (optional)</Label>
              <Textarea
                value={approveNotes}
                onChange={(e) => setApproveNotes(e.target.value)}
                placeholder="Any notes for the record..."
                rows={3}
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={approveMutation.isPending}
              onClick={() => {
                if (!selectedRequest) return;
                approveMutation.mutate({ requestId: selectedRequest.id, notes: approveNotes || undefined });
              }}
            >
              {approveMutation.isPending ? "Approving..." : "Confirm Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-600" />
              Reject Fleet Manager Request
            </DialogTitle>
            <DialogDescription>
              This will reject the fleet manager registration request from <strong>{selectedRequest?.userName}</strong> for <strong>{selectedRequest?.companyName}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Reason for Rejection <span className="text-destructive">*</span></Label>
              <Textarea
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                placeholder="Please provide a reason for rejection..."
                rows={3}
                className="text-sm"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={rejectMutation.isPending || !rejectNotes.trim()}
              onClick={() => {
                if (!selectedRequest || !rejectNotes.trim()) return;
                rejectMutation.mutate({ requestId: selectedRequest.id, notes: rejectNotes });
              }}
            >
              {rejectMutation.isPending ? "Rejecting..." : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
