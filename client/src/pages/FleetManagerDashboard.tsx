/**
 * FleetManagerDashboard
 *
 * Visible to fleet_manager and fleet_admin roles.
 * Shows all claims linked to the user's fleet account, with:
 *  - Time at garage (submitted → quotes received)
 *  - Time awaiting authorisation (quotes received → approved)
 *  - Total elapsed time
 *  - Current status
 *  - CSV download for in-progress and completed claims
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Building2,
  Download,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  Filter,
  Car,
  Calendar,
  MapPin,
  FileText,
  Users,
  ShieldCheck,
  XCircle,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FleetVehicleTrackingTab } from "@/components/FleetVehicleTrackingTab";
import { FleetRiskAnalyticsTab } from "@/components/FleetRiskAnalyticsTab";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
  return `${Math.floor(ms / 60_000)}m`;
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    submitted: { label: "Submitted", className: "bg-blue-100 text-blue-700 border-blue-200" },
    in_review: { label: "In Review", className: "bg-amber-100 text-amber-700 border-amber-200" },
    ai_complete: { label: "KINGA Complete", className: "bg-purple-100 text-purple-700 border-purple-200" },
    approved: { label: "Approved", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    rejected: { label: "Rejected", className: "bg-red-100 text-red-700 border-red-200" },
    completed: { label: "Completed", className: "bg-slate-100 text-slate-700 border-slate-200" },
    pending: { label: "Pending", className: "bg-gray-100 text-gray-600 border-gray-200" },
  };
  const s = map[status] ?? { label: status, className: "bg-gray-100 text-gray-600 border-gray-200" };
  return (
    <Badge variant="outline" className={`text-xs ${s.className}`}>
      {s.label}
    </Badge>
  );
}

function downloadCSV(rows: FleetClaim[], filename: string) {
  const headers = [
    "Claim Number",
    "Vehicle",
    "Registration",
    "Incident Date",
    "Location",
    "Status",
    "Submitted By",
    "Submitted At",
    "Time at Garage (hrs)",
    "Time Awaiting Auth (hrs)",
    "Total Elapsed (hrs)",
    "Branch / Department",
  ];
  const now = Date.now();
  const lines = rows.map((c) => {
    const submittedAt = c.createdAt ? new Date(c.createdAt).getTime() : 0;
    const totalMs = submittedAt ? now - submittedAt : 0;
    return [
      c.claimNumber,
      `${c.vehicleMake} ${c.vehicleModel} ${c.vehicleYear}`,
      c.vehicleRegistration,
      c.incidentDate ? new Date(c.incidentDate).toLocaleDateString() : "",
      c.incidentLocation ?? "",
      c.status,
      c.submittedByName ?? "",
      c.createdAt ? new Date(c.createdAt).toLocaleString() : "",
      (totalMs / 3_600_000).toFixed(1),
      "—",
      (totalMs / 3_600_000).toFixed(1),
      c.claimantDepartment ?? "",
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });
  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface FleetClaim {
  id: number;
  claimNumber: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehicleRegistration: string;
  incidentDate: string | null;
  incidentLocation: string | null;
  status: string;
  createdAt: string | null;
  submittedByName: string | null;
  claimantDepartment: string | null;
  fleetVehicleRef: string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FleetManagerDashboard() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tab, setTab] = useState("active");
  const [mainTab, setMainTab] = useState("claims");

  // Check registration status first (for pending-approval gate)
  const { data: regStatus, isLoading: regLoading } =
    trpc.fleetAccounts.getMyRegistrationStatus.useQuery(undefined);

  // Fetch fleet account info
  const { data: fleetAccounts, isLoading: accountsLoading } =
    trpc.fleetAccounts.listMyAccounts.useQuery({});

  const primaryAccount = (fleetAccounts as any)?.[0];

  // Fetch all claims for the fleet account
  const { data: claimsData, isLoading: claimsLoading } =
    trpc.fleetAccounts.getClaimsForAccount.useQuery(
      { accountId: primaryAccount?.id ?? 0 },
      { enabled: !!primaryAccount?.id }
    );

  const allClaims: FleetClaim[] = (claimsData?.claims ?? []) as unknown as FleetClaim[];

  const activeClaims = useMemo(
    () =>
      allClaims.filter((c) =>
        ["submitted", "in_review", "ai_complete"].includes(c.status)
      ),
    [allClaims]
  );

  const completedClaims = useMemo(
    () =>
      allClaims.filter((c) =>
        ["approved", "rejected", "completed"].includes(c.status)
      ),
    [allClaims]
  );

  const displayClaims = (tab === "active" ? activeClaims : completedClaims).filter((c) => {
    const matchesSearch =
      !search ||
      c.claimNumber.toLowerCase().includes(search.toLowerCase()) ||
      c.vehicleRegistration.toLowerCase().includes(search.toLowerCase()) ||
      `${c.vehicleMake} ${c.vehicleModel}`.toLowerCase().includes(search.toLowerCase()) ||
      (c.submittedByName ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const now = Date.now();

  if (accountsLoading || regLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Pending approval gate
  if (regStatus?.status === "pending") {
    return (
      <div className="p-8 max-w-lg mx-auto">
        <div className="text-center py-12 space-y-5">
          <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto">
            <Clock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Awaiting Approval</h2>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              Your fleet manager registration for <strong>{regStatus.request?.companyName}</strong> is pending review by a claims manager.
            </p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-left space-y-2">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Request submitted {regStatus.request?.createdAt ? new Date(regStatus.request.createdAt).toLocaleDateString() : ""}
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400">Once approved, you will have full access to the fleet dashboard, vehicle tracking, and risk analytics.</p>
          </div>
        </div>
      </div>
    );
  }

  // Rejected gate
  if (regStatus?.status === "rejected") {
    return (
      <div className="p-8 max-w-lg mx-auto">
        <div className="text-center py-12 space-y-5">
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
            <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Registration Rejected</h2>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              Your fleet manager registration was not approved.
            </p>
          </div>
          {regStatus.request?.reviewNotes && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-left">
              <p className="text-xs text-red-700 dark:text-red-400"><span className="font-medium">Reason: </span>{regStatus.request.reviewNotes}</p>
            </div>
          )}
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() => (window.location.href = "/claimant/fleet-register")}
          >
            <Building2 className="mr-2 h-4 w-4" />
            Re-apply
          </Button>
        </div>
      </div>
    );
  }

  // No fleet account yet — show registration prompt
  if (!primaryAccount) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="text-center py-16 space-y-4">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <h2 className="text-xl font-semibold">No Fleet Account Found</h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            You don't have a fleet account yet. To manage your company's vehicle claims, register as a fleet manager.
          </p>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() => (window.location.href = "/claimant/fleet-register")}
          >
            <Building2 className="mr-2 h-4 w-4" />
            Register Fleet Account
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="h-5 w-5 text-emerald-600" />
            <h1 className="text-xl font-bold text-foreground">{primaryAccount.accountName}</h1>
            <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300">
              Fleet Account
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Fleet Manager Dashboard — {user?.name}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCSV(
                activeClaims,
                `${primaryAccount.accountName}-active-claims-${new Date().toISOString().slice(0, 10)}.csv`
              )
            }
          >
            <Download className="mr-2 h-4 w-4" />
            Export Active
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCSV(
                completedClaims,
                `${primaryAccount.accountName}-completed-claims-${new Date().toISOString().slice(0, 10)}.csv`
              )
            }
          >
            <Download className="mr-2 h-4 w-4" />
            Export Completed
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Car className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Total Claims</span>
            </div>
            <p className="text-2xl font-bold">{allClaims.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">Active / In Progress</span>
            </div>
            <p className="text-2xl font-bold text-amber-600">{activeClaims.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">Completed</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{completedClaims.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">Unique Vehicles</span>
            </div>
            <p className="text-2xl font-bold">
              {new Set(allClaims.map((c) => c.vehicleRegistration)).size}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main navigation tabs */}
      <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="claims">Claims</TabsTrigger>
          <TabsTrigger value="vehicles">Vehicle Tracking</TabsTrigger>
          <TabsTrigger value="risk">Risk Analytics</TabsTrigger>
        </TabsList>

        {/* Claims Tab */}
        <TabsContent value="claims">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-base">Company Claims</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search claims, vehicles, staff..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm w-64"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-sm w-36">
                  <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="in_review">In Review</SelectItem>
                  <SelectItem value="ai_complete">KINGA Complete</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Tabs value={tab} onValueChange={setTab}>
            <div className="px-6 border-b">
              <TabsList className="h-9 bg-transparent p-0 gap-4">
                <TabsTrigger
                  value="active"
                  className="h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:text-emerald-700 data-[state=active]:bg-transparent px-0 text-sm"
                >
                  Active ({activeClaims.length})
                </TabsTrigger>
                <TabsTrigger
                  value="completed"
                  className="h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:text-emerald-700 data-[state=active]:bg-transparent px-0 text-sm"
                >
                  Completed ({completedClaims.length})
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value={tab} className="mt-0">
              {claimsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : displayClaims.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No {tab} claims found</p>
                  {search && (
                    <p className="text-xs mt-1">Try clearing the search filter</p>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead>Claim #</TableHead>
                        <TableHead>Vehicle</TableHead>
                        <TableHead>Registration</TableHead>
                        <TableHead>Incident Date</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Submitted By</TableHead>
                        <TableHead>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Elapsed
                          </div>
                        </TableHead>
                        <TableHead>Branch / Dept</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayClaims.map((c) => {
                        const submittedAt = c.createdAt
                          ? new Date(c.createdAt).getTime()
                          : 0;
                        const elapsedMs = submittedAt ? now - submittedAt : 0;
                        const isLong = elapsedMs > 72 * 3_600_000; // >72h

                        return (
                          <TableRow key={c.id} className="text-sm">
                            <TableCell className="font-mono text-xs font-medium text-blue-700">
                              {c.claimNumber}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <Car className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                <span>
                                  {c.vehicleMake} {c.vehicleModel}{" "}
                                  <span className="text-muted-foreground">
                                    ({c.vehicleYear})
                                  </span>
                                </span>
                              </div>
                              {c.fleetVehicleRef && (
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  Fleet ref: {c.fleetVehicleRef}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {c.vehicleRegistration}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 text-xs">
                                <Calendar className="h-3 w-3 text-muted-foreground" />
                                {c.incidentDate
                                  ? new Date(c.incidentDate).toLocaleDateString()
                                  : "—"}
                              </div>
                            </TableCell>
                            <TableCell>
                              {c.incidentLocation ? (
                                <div className="flex items-center gap-1 text-xs">
                                  <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                  <span className="truncate max-w-[120px]">
                                    {c.incidentLocation}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell>{statusBadge(c.status)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {c.submittedByName ?? "—"}
                            </TableCell>
                            <TableCell>
                              <div
                                className={`flex items-center gap-1 text-xs font-medium ${
                                  isLong
                                    ? "text-red-600"
                                    : elapsedMs > 24 * 3_600_000
                                    ? "text-amber-600"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {isLong && (
                                  <AlertCircle className="h-3 w-3 flex-shrink-0" />
                                )}
                                {formatDuration(elapsedMs)}
                              </div>
                              {submittedAt > 0 && (
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                  since{" "}
                                  {new Date(submittedAt).toLocaleDateString()}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {c.claimantDepartment ?? "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-amber-400" />
          Elapsed &gt;24h — monitor
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-400" />
          Elapsed &gt;72h — escalate
        </div>
      </div>
        </TabsContent>

        {/* Vehicle Tracking Tab */}
        <TabsContent value="vehicles">
          <FleetVehicleTrackingTab claims={allClaims} />
        </TabsContent>

        {/* Risk Analytics Tab */}
        <TabsContent value="risk">
          <FleetRiskAnalyticsTab claims={allClaims} accountName={primaryAccount.accountName} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
