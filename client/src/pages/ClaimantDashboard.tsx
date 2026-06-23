import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  FileText, Clock, CheckCircle, Plus, ChevronRight, AlertCircle,
  Car, MapPin, Calendar, RefreshCw, Shield, FileCheck, Banknote,
  Wrench, Eye, ArrowRight, Search, X, Building2, ChevronDown, ThumbsUp, MessageSquareWarning
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import KingaLogo from "@/components/KingaLogo";
import { NotificationBell } from "@/components/NotificationBell";
import RoleSwitcher from "@/components/RoleSwitcher";
import { PortalHeroBand, ProtoAlertBar, ProtoTabBar, ProtoCard, P } from "@/components/PortalHeroBand";
import { PortalHeader, PortalKPIStrip, PortalAlerts, PortalTabBar, type PortalKPI, type PortalAlert, type PortalTab } from "@/components/KingaPortalShell";

// Claim status → step index (0-based, 5 steps total)
const STATUS_STEPS: Record<string, number> = {
  submitted: 0,
  intake_pending: 0,
  triage: 1,
  assessment_pending: 1,
  assessment_in_progress: 2,
  assessment_complete: 2,
  quotes_pending: 2,
  comparison: 3,
  repair_assigned: 3,
  repair_in_progress: 3,
  financial_decision: 3,
  completed: 4,
  closed: 4,
  rejected: 4,
};

const STEPS = [
  { label: "Submitted", icon: FileText, description: "Claim received" },
  { label: "Under Review", icon: Shield, description: "Triage & policy check" },
  { label: "Assessment", icon: FileCheck, description: "KINGA & assessor review" },
  { label: "Decision", icon: Banknote, description: "Approval & quotes" },
  { label: "Resolved", icon: CheckCircle, description: "Completed or closed" },
];

function ClaimStatusTracker({ status }: { status: string }) {
  const currentStep = STATUS_STEPS[status] ?? 0;
  const isRejected = status === "rejected";

  return (
    <div className="w-full">
      <div className="flex items-center justify-between relative">
        {/* Progress line */}
        <div className="absolute top-4 left-0 right-0 h-0.5 bg-gray-200 z-0" />
        <div
          className="absolute top-4 left-0 h-0.5 z-0 transition-all duration-500"
          style={{ background: "#3C7844", width: `${(currentStep / (STEPS.length - 1)) * 100}%` }}
        />

        {STEPS.map((step, idx) => {
          const Icon = step.icon;
          const done = idx < currentStep;
          const active = idx === currentStep;
          const rejected = isRejected && idx === currentStep;

          return (
            <div key={idx} className="flex flex-col items-center z-10 flex-1">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all ${
                  rejected
                    ? "border" /* rejected */
                    : done
                    ? "text-white" /* done */
                    : active
                    ? "bg-white" /* active */
                    : "bg-white border-gray-300 text-gray-400"
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <p className={`text-xs mt-1 font-medium hidden sm:block ${
                rejected ? "text-red-600" : active || done ? "text-gray-900" : "text-gray-400"
              }`}>
                {step.label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string; style?: React.CSSProperties }> = {
    submitted: { label: "Submitted", className: "border", style: { background: "#EEF4FB", color: "#4878A8", borderColor: "#B8D0E8" } },
    intake_pending: { label: "Intake Pending", className: "border", style: { background: "#EEF4FB", color: "#4878A8", borderColor: "#B8D0E8" } },
    triage: { label: "Under Triage", className: "border", style: { background: "#FFF8E6", color: "#8A5C00", borderColor: "#E8C97A" } },
    assessment_pending: { label: "Assessment Pending", className: "border", style: { background: "#F0F0FA", color: "#4878A8", borderColor: "#B8D0E8" } },
    assessment_in_progress: { label: "Being Assessed", className: "border", style: { background: "#F0F0FA", color: "#4878A8", borderColor: "#B8D0E8" } },
    assessment_complete: { label: "Assessment Done", className: "border", style: { background: "#EEF4FB", color: "#4878A8", borderColor: "#B8D0E8" } },
    quotes_pending: { label: "Awaiting Quotes", className: "border", style: { background: "#FFF8E6", color: "#8A5C00", borderColor: "#E8C97A" } },
    comparison: { label: "Quote Comparison", className: "border", style: { background: "#FFF8E6", color: "#8A5C00", borderColor: "#E8C97A" } },
    repair_assigned: { label: "Repair Assigned", className: "border", style: { background: "#F0F7F2", color: "#3C7844", borderColor: "#C8E0CE" } },
    repair_in_progress: { label: "Repair In Progress", className: "border", style: { background: "#F0F7F2", color: "#3C7844", borderColor: "#C8E0CE" } },
    financial_decision: { label: "Financial Decision", className: "border", style: { background: "#FFF8E6", color: "#8A5C00", borderColor: "#E8C97A" } },
    completed: { label: "Completed", className: "border", style: { background: "#F0F7F2", color: "#3C7844", borderColor: "#C8E0CE" } },
    closed: { label: "Closed", className: "bg-gray-100 text-gray-800" },
    rejected: { label: "Rejected", className: "border", style: { background: "#FDF0F0", color: "#A32D2D", borderColor: "#E8B8B8" } },
  };
  const s = map[status] || { label: status.replace(/_/g, " "), className: "bg-gray-100 text-gray-800" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.className}`} style={s.style}>
      {s.label}
    </span>
  );
}

export default function ClaimantDashboard() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [expandedClaim, setExpandedClaim] = useState<number | null>(null);
  const [fleetBannerOpen, setFleetBannerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("my-claims");
  const [settlementDialog, setSettlementDialog] = useState<{ claimId: number; claimNumber: string } | null>(null);
  const [disputeDialog, setDisputeDialog] = useState<{ claimId: number; claimNumber: string } | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const { toast } = useToast();

  // Check if user already has a fleet registration — hides the banner once registered
  const { data: fleetRegStatus } = trpc.fleetAccounts.getMyRegistrationStatus.useQuery(
    undefined,
    { retry: false }
  );
  const showFleetBanner = !fleetRegStatus || fleetRegStatus.status === null;

  // Real data
  const { data: myClaims = [], isLoading, refetch } = trpc.claims.myClaims.useQuery();

  // Claimant action mutations
  const acceptSettlementMutation = trpc.claims.acceptSettlement.useMutation({
    onSuccess: () => {
      toast({ title: "Settlement accepted", description: "Your claim has been closed. Thank you." });
      setSettlementDialog(null);
      refetch();
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const initiateDisputeMutation = trpc.claims.initiateDispute.useMutation({
    onSuccess: () => {
      toast({ title: "Dispute submitted", description: "Your dispute has been registered and will be reviewed." });
      setDisputeDialog(null);
      setDisputeReason("");
      refetch();
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const searchTimeout = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (searchTimeout[0]) clearTimeout(searchTimeout[0]);
    const t = setTimeout(() => setDebouncedQuery(val.trim()), 400);
    searchTimeout[1](t);
  };
  const { data: searchResults = [], isFetching: searchLoading } = trpc.claims.searchByIdentifier.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 2 }
  );
  const isSearchActive = debouncedQuery.length >= 2;

  // Stats
  const activeClaims = myClaims.filter((c: any) =>
    !["completed", "closed", "rejected"].includes(c.status)
  );
  const completedClaims = myClaims.filter((c: any) =>
    ["completed", "closed"].includes(c.status)
  );
  const rejectedClaims = myClaims.filter((c: any) => c.status === "rejected");

  const avgResolutionDays = completedClaims.length > 0
    ? Math.round(
        completedClaims.reduce((sum: number, c: any) => {
          const created = new Date(c.createdAt).getTime();
          const updated = new Date(c.updatedAt).getTime();
          return sum + (updated - created) / (1000 * 60 * 60 * 24);
        }, 0) / completedClaims.length
      )
    : null;

  // C3 — PortalAlerts: derive from existing claim data
  const settlementReadyClaims = myClaims.filter((c: any) =>
    c.workflowState === "payment_authorized" || c.workflowState === "financial_decision"
  );
  const claimantAlerts: PortalAlert[] = [
    {
      id: "settlement-ready",
      severity: "critical",
      label: "settlement offer(s) awaiting your response",
      count: settlementReadyClaims.length,
      onClick: () => setActiveTab("my-claims"),
    },
    {
      id: "rejected",
      severity: "warning",
      label: "rejected claim(s) — review outcome",
      count: rejectedClaims.length,
      onClick: () => setActiveTab("my-claims"),
    },
  ];

  // C4 — PortalTabBar tabs
  const claimantTabs: PortalTab[] = [
    { id: "my-claims", label: "My Claims", badge: activeClaims.length > 0 ? activeClaims.length : undefined },
    { id: "completed", label: "Completed", badge: completedClaims.length > 0 ? completedClaims.length : undefined },
    { id: "quick-actions", label: "Quick Actions" },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#F7F8F6', fontFamily: 'Inter, sans-serif' }}>
      <PortalHeroBand
        portalName="My Claims Portal"
        title={`Welcome back, ${user?.name?.split(' ')[0] || 'there'}`}
        subtitle={activeClaims.length > 0 ? `${activeClaims.length} active claim${activeClaims.length > 1 ? 's' : ''} in progress` : 'No active claims — submit a new claim to get started'}
        actions={[
          { label: 'Submit New Claim', icon: <Plus className="h-3 w-3" />, onClick: () => setLocation('/claimant/submit-claim'), primary: true },
        ]}
        kpis={[
          { label: 'Total Claims', value: myClaims.length, delta: 'All time', up: null, headline: true },
          { label: 'Active', value: activeClaims.length, delta: 'In progress', up: null },
          { label: 'Completed', value: completedClaims.length, delta: 'Resolved', up: true },
          { label: 'Avg Resolution', value: avgResolutionDays !== null ? `${avgResolutionDays}d` : '—', delta: 'Days to resolve', up: avgResolutionDays !== null && avgResolutionDays <= 14 },
        ]}
      />
      <ProtoAlertBar alerts={claimantAlerts.map((a: any) => ({ count: a.count, label: a.label, severity: a.severity === 'critical' ? 'red' : 'amber' }))} ctaLabel="View alerts" />
      <ProtoTabBar tabs={claimantTabs.map((t: any) => ({ id: t.id, label: t.label, badge: t.badge }))} activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="container mx-auto px-4 py-6 space-y-6">
                {/* Tab-gated content */}
        {activeTab === "quick-actions" ? (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation("/claimant/submit-claim")}>
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ background: "#EEF4FB" }}>
                        <Plus className="h-5 w-5" style={{ color: "#4878A8" }} />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">Submit New Claim</p>
                        <p className="text-xs text-gray-500">Start a new insurance claim</p>
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-gray-400" />
                  </div>
                </CardContent>
              </Card>
              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => refetch()}>
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ background: "#F0F7F2" }}>
                        <RefreshCw className="h-5 w-5" style={{ color: "#3C7844" }} />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">Refresh Status</p>
                        <p className="text-xs text-gray-500">Check for the latest updates</p>
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-gray-400" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : activeTab === "completed" ? (
          <Card>
            <CardHeader>
              <CardTitle>Completed Claims</CardTitle>
              <CardDescription>Claims that have been resolved or closed</CardDescription>
            </CardHeader>
            <CardContent>
              {completedClaims.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No completed claims yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {completedClaims.map((claim: any) => (
                    <div key={claim.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer" onClick={() => setLocation(`/claims/${claim.id}`)}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "#F0F7F2" }}>
                          <Car className="h-4 w-4" style={{ color: "#3C7844" }} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-bold text-gray-900">{claim.claimNumber}</span>
                            <StatusBadge status={claim.status} />
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{[claim.vehicleMake, claim.vehicleModel, claim.vehicleYear].filter(Boolean).join(" ") || "Vehicle details pending"}</p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <>{/* Claims List */}
          <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>My Claims</CardTitle>
                <CardDescription>
                  Track the status of each claim in real time
                </CardDescription>
              </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() => setLocation("/claimant/submit-claim")}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                New Claim
              </Button>
            </div>
            </div>
            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                className="pl-9 pr-9 h-9 text-sm"
                placeholder="Search by claim number, policy number, or vehicle registration…"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
              {searchQuery && (
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => { setSearchQuery(""); setDebouncedQuery(""); }}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isSearchActive ? (
              /* Search results */
              <div className="space-y-3">
                {searchLoading ? (
                  <div className="space-y-3">
                    {[1, 2].map(i => (
                      <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="text-center py-10">
                    <Search className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">No claims found matching <span className="font-mono font-medium">{debouncedQuery}</span></p>
                    <p className="text-xs text-gray-400 mt-1">Try a claim number, policy number, or vehicle registration plate</p>
                  </div>
                ) : (
                  searchResults.map((claim: any) => (
                    <div
                      key={claim.id}
                      className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => setLocation(`/claims/${claim.id}`)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "#EEF4FB" }}>
                          <Car className="h-4 w-4" style={{ color: "#4878A8" }} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-bold text-gray-900">{claim.claimNumber}</span>
                            {claim.policyNumber && (
                              <span className="text-xs text-gray-500 font-mono">Policy: {claim.policyNumber}</span>
                            )}
                            {claim.vehicleRegistration && (
                              <span className="text-xs text-gray-500 font-mono">Reg: {claim.vehicleRegistration}</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {[claim.vehicleMake, claim.vehicleModel, claim.vehicleYear].filter(Boolean).join(" ") || "Vehicle details pending"}
                            {claim.incidentDate && ` · ${new Date(claim.incidentDate).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={claim.status} />
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : myClaims.length === 0 ? (
              <div className="text-center py-16">
                <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <FileText className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-gray-700 font-semibold mb-1">No claims yet</h3>
                <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
                  Submit your first insurance claim to get started. The process takes about 5 minutes.
                </p>
                <Button onClick={() => setLocation("/claimant/submit-claim")}>
                  <Plus className="h-4 w-4 mr-2" />
                  Submit Your First Claim
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {myClaims.map((claim: any) => (
                  <div
                    key={claim.id}
                    className="border border-gray-200 rounded-lg overflow-hidden"
                  >
                    {/* Claim Header */}
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() =>
                        setExpandedClaim(expandedClaim === claim.id ? null : claim.id)
                      }
                    >
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                          <Car className="h-5 w-5 text-gray-500" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-bold text-gray-900">
                              {claim.claimNumber}
                            </span>
                            <StatusBadge status={claim.status} />
                          </div>
                          <p className="text-sm text-gray-600 mt-0.5">
                            {[claim.vehicleMake, claim.vehicleModel, claim.vehicleYear]
                              .filter(Boolean).join(" ") || "Vehicle details pending"}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                            {claim.incidentDate && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Incident: {new Date(claim.incidentDate).toLocaleDateString()}
                              </span>
                            )}
                            {claim.incidentLocation && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {claim.incidentLocation}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <ChevronRight
                        className={`h-5 w-5 text-gray-400 shrink-0 transition-transform ${
                          expandedClaim === claim.id ? "rotate-90" : ""
                        }`}
                      />
                    </div>

                    {/* Expanded Detail */}
                    {expandedClaim === claim.id && (
                      <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-4">
                        {/* Status Tracker */}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                            Claim Progress
                          </p>
                          <ClaimStatusTracker status={claim.status} />
                        </div>

                        <Separator />

                        {/* Details Grid */}
                        <div className="grid sm:grid-cols-2 gap-3 text-sm">
                          {claim.incidentDescription && (
                            <div className="sm:col-span-2">
                              <p className="text-xs font-medium text-gray-500 mb-1">Incident Description</p>
                              <p className="text-gray-700 text-sm leading-relaxed">
                                {claim.incidentDescription}
                              </p>
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-medium text-gray-500 mb-1">Submitted</p>
                            <p className="text-gray-700">
                              {claim.createdAt
                                ? new Date(claim.createdAt).toLocaleDateString("en-ZA", {
                                    day: "numeric", month: "short", year: "numeric"
                                  })
                                : "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-500 mb-1">Last Updated</p>
                            <p className="text-gray-700">
                              {claim.updatedAt
                                ? new Date(claim.updatedAt).toLocaleDateString("en-ZA", {
                                    day: "numeric", month: "short", year: "numeric"
                                  })
                                : "—"}
                            </p>
                          </div>
                          {claim.policyVerified !== null && (
                            <div>
                              <p className="text-xs font-medium text-gray-500 mb-1">Policy Status</p>
                              <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                                claim.policyVerified
                                  ? "font-medium" /* style via inline below */
                                  : "font-medium" /* style via inline below */
                              }`}>
                                {claim.policyVerified ? (
                                  <><CheckCircle className="h-3 w-3" /> Verified</>
                                ) : (
                                  <><AlertCircle className="h-3 w-3" /> Pending Verification</>
                                )}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Status-specific guidance */}
                        {claim.status === "quotes_pending" && (
                          <div className="flex items-start gap-2 p-3 rounded-lg text-sm border" style={{ background: "#FFF8E6", borderColor: "#E8C97A" }}>
                            <Wrench className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#8A5C00" }} />
                            <p style={{ color: "#8A5C00" }}>
                              Your selected repair shops are preparing quotes. You will be notified once all quotes are received.
                            </p>
                          </div>
                        )}
                        {claim.status === "completed" && (
                          <div className="flex items-start gap-2 p-3 rounded-lg text-sm border" style={{ background: "#F0F7F2", borderColor: "#C8E0CE" }}>
                            <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#3C7844" }} />
                            <p style={{ color: "#3C7844" }}>
                              Your claim has been resolved. If you have any questions, please contact your insurer.
                            </p>
                          </div>
                        )}
                        {claim.status === "rejected" && (
                          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
                            <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                            <p className="text-red-800">
                              This claim was not approved. Contact your insurer for more information or to appeal the decision.
                            </p>
                          </div>
                        )}

                        {/* Claimant actions: accept settlement or initiate dispute */}
                        {(claim.workflowState === "payment_authorized" || claim.workflowState === "financial_decision") && (
                          <div className="flex flex-col gap-2 pt-1">
                            <p className="text-xs font-medium text-gray-600">Your settlement offer is ready for review:</p>
                            <div className="flex gap-2 flex-wrap">
                              <Button
                                size="sm"
                                className="gap-1.5 text-white"
                                style={{ background: "#3C7844" }}
                                onClick={() => setSettlementDialog({ claimId: claim.id, claimNumber: claim.claimNumber })}
                              >
                                <ThumbsUp className="h-3.5 w-3.5" />
                                Accept Settlement
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5"
                                style={{ borderColor: "#E8C97A", color: "#8A5C00" }}
                                onClick={() => setDisputeDialog({ claimId: claim.id, claimNumber: claim.claimNumber })}
                              >
                                <MessageSquareWarning className="h-3.5 w-3.5" />
                                Dispute Outcome
                              </Button>
                            </div>
                          </div>
                        )}
                        {claim.workflowState === "closed" && claim.status === "completed" && (
                          <div className="flex gap-2 flex-wrap pt-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              style={{ borderColor: "#E8C97A", color: "#8A5C00" }}
                              onClick={() => setDisputeDialog({ claimId: claim.id, claimNumber: claim.claimNumber })}
                            >
                              <MessageSquareWarning className="h-3.5 w-3.5" />
                              Raise a Dispute
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions moved to Quick Actions tab */}
        {/* Fleet Manager CTA — collapsible, hidden once user is already registered */}
        {showFleetBanner && (
          <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => setFleetBannerOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="text-sm text-gray-500 truncate">
                  Managing vehicles for a company?{" "}
                  <span className="font-medium" style={{ color: "#3C7844" }}>Register as a Fleet Manager</span>
                  {" "}to view all company claims in one place.
                </span>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-gray-400 shrink-0 ml-2 transition-transform duration-200 ${
                  fleetBannerOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {fleetBannerOpen && (
              <div className="px-4 pb-4 pt-3 border-t border-gray-100 bg-gray-50">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">Fleet Manager Access</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Once approved by a claims manager, you can track all vehicles under your company,
                      view risk analytics, and manage claims across your entire fleet — without chasing
                      individual employees for updates.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="shrink-0 text-white"
                    style={{ background: "#3C7844" }}
                    onClick={() => setLocation("/claimant/fleet-register")}
                  >
                    <Building2 className="h-3.5 w-3.5 mr-1.5" />
                    Apply Now
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
          </> /* end activeTab === 'my-claims' */
        )}
      </main>

      {/* Settlement acceptance confirmation dialog */}
      <Dialog open={!!settlementDialog} onOpenChange={(open) => !open && setSettlementDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Accept Settlement</DialogTitle>
            <DialogDescription>
              You are about to accept the settlement offer for claim <strong>{settlementDialog?.claimNumber}</strong>. This action is final and will close the claim.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSettlementDialog(null)}>Cancel</Button>
            <Button
              className="text-white"
              style={{ background: "#3C7844" }}
              disabled={acceptSettlementMutation.isPending}
              onClick={() => settlementDialog && acceptSettlementMutation.mutate({ claimId: settlementDialog.claimId })}
            >
              {acceptSettlementMutation.isPending ? "Processing..." : "Confirm Acceptance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispute initiation dialog */}
      <Dialog open={!!disputeDialog} onOpenChange={(open) => { if (!open) { setDisputeDialog(null); setDisputeReason(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Raise a Dispute</DialogTitle>
            <DialogDescription>
              Describe why you are disputing the outcome of claim <strong>{disputeDialog?.claimNumber}</strong>. A claims manager will review your dispute.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              placeholder="Please explain your reason for disputing this claim outcome (minimum 10 characters)..."
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              rows={4}
              className="resize-none"
            />
            {disputeReason.length > 0 && disputeReason.length < 10 && (
              <p className="text-xs text-red-500 mt-1">Please provide at least 10 characters.</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setDisputeDialog(null); setDisputeReason(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={disputeReason.length < 10 || initiateDisputeMutation.isPending}
              onClick={() => disputeDialog && initiateDisputeMutation.mutate({ claimId: disputeDialog.claimId, reason: disputeReason })}
            >
              {initiateDisputeMutation.isPending ? "Submitting..." : "Submit Dispute"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
