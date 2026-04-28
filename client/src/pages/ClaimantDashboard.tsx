import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  FileText, Clock, CheckCircle, Plus, ChevronRight, AlertCircle,
  Car, MapPin, Calendar, RefreshCw, Shield, FileCheck, Banknote,
  Wrench, Eye, ArrowRight
} from "lucide-react";
import { useLocation } from "wouter";
import KingaLogo from "@/components/KingaLogo";
import { NotificationBell } from "@/components/NotificationBell";
import RoleSwitcher from "@/components/RoleSwitcher";

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
  { label: "Assessment", icon: FileCheck, description: "AI & assessor review" },
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
          className="absolute top-4 left-0 h-0.5 bg-emerald-500 z-0 transition-all duration-500"
          style={{ width: `${(currentStep / (STEPS.length - 1)) * 100}%` }}
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
                    ? "bg-red-100 border-red-400 text-red-600"
                    : done
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : active
                    ? "bg-white border-emerald-500 text-emerald-600"
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
  const map: Record<string, { label: string; className: string }> = {
    submitted: { label: "Submitted", className: "bg-blue-100 text-blue-800" },
    intake_pending: { label: "Intake Pending", className: "bg-blue-100 text-blue-800" },
    triage: { label: "Under Triage", className: "bg-amber-100 text-amber-800" },
    assessment_pending: { label: "Assessment Pending", className: "bg-purple-100 text-purple-800" },
    assessment_in_progress: { label: "Being Assessed", className: "bg-purple-100 text-purple-800" },
    assessment_complete: { label: "Assessment Done", className: "bg-indigo-100 text-indigo-800" },
    quotes_pending: { label: "Awaiting Quotes", className: "bg-orange-100 text-orange-800" },
    comparison: { label: "Quote Comparison", className: "bg-orange-100 text-orange-800" },
    repair_assigned: { label: "Repair Assigned", className: "bg-teal-100 text-teal-800" },
    repair_in_progress: { label: "Repair In Progress", className: "bg-teal-100 text-teal-800" },
    financial_decision: { label: "Financial Decision", className: "bg-yellow-100 text-yellow-800" },
    completed: { label: "Completed", className: "bg-emerald-100 text-emerald-800" },
    closed: { label: "Closed", className: "bg-gray-100 text-gray-800" },
    rejected: { label: "Rejected", className: "bg-red-100 text-red-800" },
  };
  const s = map[status] || { label: status.replace(/_/g, " "), className: "bg-gray-100 text-gray-800" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
}

export default function ClaimantDashboard() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [expandedClaim, setExpandedClaim] = useState<number | null>(null);

  // Real data
  const { data: myClaims = [], isLoading, refetch } = trpc.claims.myClaims.useQuery();

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <KingaLogo showText size="sm" />
            <Separator orientation="vertical" className="h-6" />
            <div>
              <h1 className="text-sm font-semibold text-gray-900">My Claims Portal</h1>
              <p className="text-xs text-gray-500">Track and manage your insurance claims</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <RoleSwitcher />
            <NotificationBell />
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-900">{user?.name}</p>
              <p className="text-xs text-gray-500">Claimant</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => logout()}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Welcome + Quick Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Welcome back, {user?.name?.split(" ")[0] || "there"}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {activeClaims.length > 0
                ? `You have ${activeClaims.length} active claim${activeClaims.length > 1 ? "s" : ""} in progress`
                : "No active claims — submit a new claim to get started"}
            </p>
          </div>
          <Button
            onClick={() => setLocation("/claimant/submit-claim")}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Submit New Claim
          </Button>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Claims</CardTitle>
              <FileText className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{myClaims.length}</div>
              <p className="text-xs text-gray-500 mt-1">All time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Active</CardTitle>
              <Clock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{activeClaims.length}</div>
              <p className="text-xs text-gray-500 mt-1">Being processed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Completed</CardTitle>
              <CheckCircle className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{completedClaims.length}</div>
              <p className="text-xs text-gray-500 mt-1">Successfully resolved</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Avg Resolution</CardTitle>
              <Clock className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {avgResolutionDays !== null ? `${avgResolutionDays}d` : "—"}
              </div>
              <p className="text-xs text-gray-500 mt-1">Days to completion</p>
            </CardContent>
          </Card>
        </div>

        {/* Claims List */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
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
          </CardHeader>
          <CardContent>
            {isLoading ? (
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
                                  ? "text-emerald-700"
                                  : "text-amber-700"
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
                          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                            <Wrench className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                            <p className="text-amber-800">
                              Your selected repair shops are preparing quotes. You will be notified once all quotes are received.
                            </p>
                          </div>
                        )}
                        {claim.status === "completed" && (
                          <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm">
                            <CheckCircle className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                            <p className="text-emerald-800">
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
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid sm:grid-cols-2 gap-4">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation("/claimant/submit-claim")}>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <Plus className="h-5 w-5 text-blue-600" />
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
                  <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <RefreshCw className="h-5 w-5 text-emerald-600" />
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
      </main>
    </div>
  );
}
