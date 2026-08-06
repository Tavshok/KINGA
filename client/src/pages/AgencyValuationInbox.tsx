import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Car, Search, AlertTriangle, CheckCircle2, Clock, Users,
  Truck, FileText, Eye, UserCheck, Loader2, Shield, Phone, Mail, Tag
} from "lucide-react";

export default function AgencyValuationInbox() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<any>(null);
  const [inspectorId, setInspectorId] = useState("");
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [quoteTarget, setQuoteTarget] = useState<any>(null);
  const [quotePremium, setQuotePremium] = useState("");
  const [quoteExcess, setQuoteExcess] = useState("");
  const [quoteNotes, setQuoteNotes] = useState("");

  const { data: requests, isLoading, refetch } = trpc.insuranceV2.getValuationRequests.useQuery({
    limit: 100,
  });

  const unlockMutation = trpc.insuranceV2.unlockReportOnPolicyIssuance.useMutation({
    onSuccess: () => {
      toast.success("Full report unlocked for client");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const assignMutation = trpc.insuranceV2.assignInspector.useMutation({
    onSuccess: () => {
      toast.success("Inspector assigned successfully");
      setAssignDialogOpen(false);
      setInspectorId("");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const sendQuoteMutation = trpc.insuranceV2.sendQuoteToClient.useMutation({
    onSuccess: () => {
      toast.success("Quote sent to client successfully");
      setQuoteDialogOpen(false);
      setQuoteTarget(null);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const filtered = (requests ?? []).filter((r: any) => {
    const matchesSearch = !search || [r.fullName, r.email, r.vehicleMake, r.vehicleModel, r.vehicleRegistration, r.requestNumber]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const inspectionRequired = filtered.filter((r: any) => r.inspectionRequired === 1);
  const standalone = filtered.filter((r: any) => r.isStandaloneValuation === 1);
  const pending = filtered.filter((r: any) => r.status === "pending");

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { label: "Pending", variant: "secondary" },
      under_review: { label: "In Review", variant: "default" },
      quoted: { label: "Quoted", variant: "default" },
      accepted: { label: "Accepted", variant: "default" },
      rejected: { label: "Rejected", variant: "destructive" },
      expired: { label: "Expired", variant: "outline" },
    };
    const s = map[status] ?? { label: status, variant: "outline" };
    return <Badge variant={s.variant}>{s.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Requests", value: (requests ?? []).length, icon: FileText, color: "text-primary" },
          { label: "Pending Action", value: pending.length, icon: Clock, color: "text-amber-600" },
          { label: "Fleet Inspections", value: inspectionRequired.length, icon: Truck, color: "text-blue-600" },
          { label: "Standalone Paid", value: standalone.length, icon: Shield, color: "text-emerald-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <Icon className={`h-5 w-5 ${color}`} />
                <div>
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Inspection Alert Banner */}
      {inspectionRequired.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800 dark:text-amber-200">{inspectionRequired.length} fleet request(s) require physical inspection</p>
            <p className="text-sm text-amber-700 dark:text-amber-300">These fleets have more than 10 vehicles. Assign an inspector before issuing a policy.</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by name, email, vehicle, or request number..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="under_review">In Review</SelectItem>
            <SelectItem value="quoted">Quoted</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Request List */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="font-medium">No valuation requests found</p>
            <p className="text-sm text-muted-foreground mt-1">New requests from the public valuation page will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((req: any) => (
            <Card key={req.id} className={`hover:shadow-md transition-shadow ${req.inspectionRequired === 1 ? "border-amber-200 dark:border-amber-800" : ""}`}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-4">
                  <div className={`p-2.5 rounded-lg flex-shrink-0 ${req.isStandaloneValuation ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-primary/10"}`}>
                    {req.isStandaloneValuation ? <Shield className="h-5 w-5 text-emerald-600" /> : <Car className="h-5 w-5 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{req.vehicleYear} {req.vehicleMake} {req.vehicleModel}</p>
                      {req.vehicleRegistration && <span className="font-mono text-xs text-muted-foreground">{req.vehicleRegistration}</span>}
                      {getStatusBadge(req.status)}
                      {req.inspectionRequired === 1 && <Badge variant="outline" className="border-amber-400 text-amber-700"><Truck className="h-3 w-3 mr-1" />Inspection Required</Badge>}
                      {req.isStandaloneValuation === 1 && <Badge variant="outline" className="border-emerald-400 text-emerald-700">Paid Report</Badge>}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" />{req.fullName}</span>
                      <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{req.email}</span>
                      {req.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{req.phone}</span>}
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(req.createdAt).toLocaleDateString()}</span>
                    </div>
                    {/* KINGA Report Summary */}
                    {req.vehicleValue && (
                      <div className="mt-2 flex items-center gap-4 text-sm">
                        <span className="font-semibold text-primary">${req.vehicleValue.toLocaleString()} market value</span>
                        {req.vehicleRiskScore !== null && req.vehicleRiskScore !== undefined && (
                          <Badge variant={req.vehicleRiskScore > 70 ? "destructive" : req.vehicleRiskScore > 40 ? "secondary" : "default"} className="text-xs">
                            Risk: {req.vehicleRiskScore}/100
                          </Badge>
                        )}
                        <span className="capitalize text-muted-foreground">{req.condition} condition</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <Button size="sm" variant="outline" onClick={() => setSelectedRequest(req)}>
                      <Eye className="h-3 w-3 mr-1" /> View
                    </Button>
                    {req.inspectionRequired === 1 && !req.inspectionAssignedTo && (
                      <Button size="sm" variant="outline" className="border-amber-400 text-amber-700 hover:bg-amber-50" onClick={() => { setAssignTarget(req); setAssignDialogOpen(true); }}>
                        <UserCheck className="h-3 w-3 mr-1" /> Assign
                      </Button>
                    )}
                    {req.reportGatingStatus === "teaser" && req.vehicleValue && (
                      <Button size="sm" onClick={() => unlockMutation.mutate({ quotationRequestId: req.id })} disabled={unlockMutation.isPending}>
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Unlock Report
                      </Button>
                    )}
                    {req.status !== "quoted" && req.status !== "accepted" && req.vehicleValue && (
                      <Button size="sm" variant="outline" className="border-green-400 text-green-700 hover:bg-green-50" onClick={() => { setQuoteTarget(req); setQuoteDialogOpen(true); }}>
                        <Tag className="h-3 w-3 mr-1" /> Send Quote
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Request Detail Dialog */}
      {selectedRequest && (
        <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedRequest.vehicleYear} {selectedRequest.vehicleMake} {selectedRequest.vehicleModel}
                <span className="ml-2 font-mono text-sm text-muted-foreground">{selectedRequest.requestNumber}</span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">Client</p>
                  <p className="font-medium">{selectedRequest.fullName}</p>
                  <p className="text-muted-foreground">{selectedRequest.email}</p>
                  <p className="text-muted-foreground">{selectedRequest.phone}</p>
                </div>
                <div>
                  <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">Vehicle</p>
                  <p>{selectedRequest.vehicleYear} {selectedRequest.vehicleMake} {selectedRequest.vehicleModel}</p>
                  {selectedRequest.vehicleRegistration && <p className="font-mono text-muted-foreground">{selectedRequest.vehicleRegistration}</p>}
                  <p className="capitalize text-muted-foreground">{selectedRequest.condition} · {selectedRequest.mileage ? `${selectedRequest.mileage.toLocaleString()} km` : "Mileage not provided"}</p>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-3">KINGA Report</p>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Market Value</p>
                    <p className="text-lg font-bold text-primary">{selectedRequest.vehicleValue ? `$${selectedRequest.vehicleValue.toLocaleString()}` : "Pending"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Risk Score</p>
                    <p className="text-lg font-bold">{selectedRequest.vehicleRiskScore ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Forensics</p>
                    <p className="text-lg font-bold capitalize">{selectedRequest.vehicleForensicsStatus ?? "Pending"}</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1">Coverage</p>
                  <p className="capitalize">{selectedRequest.insuranceType?.replace(/_/g, " ") ?? "Not specified"}</p>
                </div>
                <div>
                  <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1">Report Status</p>
                  <Badge variant={selectedRequest.reportGatingStatus === "full" ? "default" : "secondary"} className="capitalize">
                    {selectedRequest.reportGatingStatus === "full" ? "Full Report Unlocked" : selectedRequest.reportGatingStatus === "paid" ? "Paid Report" : "Teaser Only"}
                  </Badge>
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2">
              {selectedRequest.reportGatingStatus === "teaser" && selectedRequest.vehicleValue && (
                <Button onClick={() => { unlockMutation.mutate({ quotationRequestId: selectedRequest.id }); setSelectedRequest(null); }} disabled={unlockMutation.isPending}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Unlock Full Report for Client
                </Button>
              )}
              <Button variant="outline" onClick={() => setSelectedRequest(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Assign Inspector Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Inspector</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Fleet: {assignTarget?.fleetVehicleCount} vehicles · {assignTarget?.fullName}
            </p>
            <div>
              <Label htmlFor="inspectorId">Inspector User ID</Label>
              <Input id="inspectorId" type="number" className="mt-1" placeholder="Enter engineer user ID" value={inspectorId} onChange={e => setInspectorId(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">Find engineer user IDs in the Platform Admin → Network Oversight → Engineers tab.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => assignMutation.mutate({ quotationRequestId: assignTarget?.id, inspectorUserId: parseInt(inspectorId) })}
              disabled={!inspectorId || assignMutation.isPending}
            >
              {assignMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <UserCheck className="h-4 w-4 mr-1" />}
              Assign Inspector
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
