/**
 * Vehicle Intelligence Registry
 * ─────────────────────────────
 * Two views:
 *   /insurer/vehicle-registry           — list view (all vehicles, sorted by risk)
 *   /insurer/vehicle-registry/:id       — vehicle profile (identity, damage timeline, claim history)
 */

import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  ArrowLeft,
  Car,
  CheckCircle,
  ChevronRight,
  Clock,
  DollarSign,
  FileText,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function riskBadge(score: number) {
  if (score >= 70) return <Badge className="bg-red-600 text-white">Very High Risk</Badge>;
  if (score >= 46) return <Badge className="bg-orange-500 text-white">High Risk</Badge>;
  if (score >= 26) return <Badge className="bg-amber-500 text-white">Moderate Risk</Badge>;
  if (score >= 11) return <Badge className="bg-yellow-400 text-black">Low Risk</Badge>;
  return <Badge className="bg-green-600 text-white">Minimal Risk</Badge>;
}

function riskColor(score: number): string {
  if (score >= 70) return "text-red-500";
  if (score >= 46) return "text-orange-500";
  if (score >= 26) return "text-amber-500";
  if (score >= 11) return "text-yellow-500";
  return "text-green-500";
}

function riskBarColor(score: number): string {
  if (score >= 70) return "bg-red-500";
  if (score >= 46) return "bg-orange-500";
  if (score >= 26) return "bg-amber-500";
  if (score >= 11) return "bg-yellow-400";
  return "bg-green-500";
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-ZA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function claimStatusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    submitted: { label: "Submitted", className: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200" },
    assessment_complete: { label: "Assessed", className: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200" },
    completed: { label: "Completed", className: "bg-green-600 text-white" },
    rejected: { label: "Rejected", className: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200" },
    intake_pending: { label: "Pending", className: "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200" },
  };
  const entry = map[status] ?? { label: status, className: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200" };
  return <Badge className={`text-xs ${entry.className}`}>{entry.label}</Badge>;
}

// ─── Vehicle Profile (detail view) ───────────────────────────────────────────

function VehicleProfile({ id }: { id: number }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: vehicle, isLoading, refetch } = trpc.vehicleRegistry.getById.useQuery({ id });
  const { data: claimHistory } = trpc.vehicleRegistry.getClaimHistory.useQuery({
    vehicleRegistryId: id,
  });

  const setFlagMutation = trpc.vehicleRegistry.setFlag.useMutation({
    onSuccess: (result) => {
      toast({
        title: "Flag updated",
        description: `Vehicle risk score updated to ${result.newRiskScore}`,
      });
      refetch();
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="text-center py-16 text-gray-500 dark:text-muted-foreground">
        <Car className="mx-auto h-12 w-12 mb-3 opacity-30" />
        <p>Vehicle not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation("/insurer/vehicle-registry")}>
          Back to Registry
        </Button>
      </div>
    );
  }

  const damageZoneCounts: Record<string, number> = vehicle.damageZoneCountsJson
    ? JSON.parse(vehicle.damageZoneCountsJson)
    : {};

  const claimIds: number[] = vehicle.claimIdsJson ? JSON.parse(vehicle.claimIdsJson) : [];

  const zoneColors: Record<string, string> = {
    front: "bg-red-500",
    rear: "bg-orange-500",
    left: "bg-yellow-500",
    right: "bg-blue-500",
    roof: "bg-purple-500",
    undercarriage: "bg-gray-500",
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/insurer/vehicle-registry")}
          className="text-gray-400 dark:text-muted-foreground/70 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Registry
        </Button>
        <ChevronRight className="h-4 w-4 text-gray-600 dark:text-muted-foreground" />
        <span className="text-gray-300 font-medium">
          {vehicle.make} {vehicle.model} {vehicle.year ?? ""}
        </span>
        <span className="text-gray-500 dark:text-muted-foreground">·</span>
        <span className="text-gray-400 dark:text-muted-foreground/70 font-mono text-sm">
          {vehicle.registrationNumber ?? vehicle.vin ?? `ID-${vehicle.id}`}
        </span>
        <div className="ml-auto">{riskBadge(vehicle.vehicleRiskScore)}</div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left column: Identity + Technical + Flags */}
        <div className="space-y-4">
          {/* Identity Card */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400 dark:text-muted-foreground/70 flex items-center gap-2">
                <Car className="h-4 w-4" />
                Vehicle Identity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-muted-foreground">Make / Model</span>
                <span className="font-medium">
                  {vehicle.make ?? "—"} {vehicle.model ?? ""}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-muted-foreground">Year</span>
                <span>{vehicle.year ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-muted-foreground">Registration</span>
                <span className="font-mono">{vehicle.registrationNumber ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-muted-foreground">VIN</span>
                <span className="font-mono text-xs">{vehicle.vin ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-muted-foreground">Colour</span>
                <span>{vehicle.color ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-muted-foreground">Engine No.</span>
                <span className="font-mono text-xs">{vehicle.engineNumber ?? "—"}</span>
              </div>
              <Separator className="bg-gray-800" />
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-muted-foreground">Owner</span>
                <span>{vehicle.currentOwnerName ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-muted-foreground">First Registered</span>
                <span>{vehicle.firstRegistrationDate ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-muted-foreground">Licence Expiry</span>
                <span>{vehicle.licenceExpiryDate ?? "—"}</span>
              </div>
            </CardContent>
          </Card>

          {/* Technical Attributes */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400 dark:text-muted-foreground/70 flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Technical Attributes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-muted-foreground">Vehicle Type</span>
                <span className="capitalize">{vehicle.vehicleType ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-muted-foreground">Fuel Type</span>
                <span className="capitalize">{vehicle.fuelType ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-muted-foreground">Powertrain</span>
                <span>{vehicle.powertrainType ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-muted-foreground">Engine Capacity</span>
                <span>{vehicle.engineCapacity ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-muted-foreground">Inferred Mass</span>
                <span>
                  {vehicle.vehicleMassKg ? `${vehicle.vehicleMassKg} kg` : "—"}
                  {vehicle.vehicleMassSource && vehicle.vehicleMassSource !== "not_available" && (
                    <span className="text-gray-500 dark:text-muted-foreground text-xs ml-1">
                      ({vehicle.vehicleMassSource.replace("_", " ")})
                    </span>
                  )}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Risk Flags */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400 dark:text-muted-foreground/70 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                Risk Flags
                <span className="ml-auto text-xs text-gray-500 dark:text-muted-foreground">Click to toggle</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(
                [
                  {
                    key: "isSalvageTitle" as const,
                    label: "Salvage Title",
                    value: vehicle.isSalvageTitle === 1,
                  },
                  {
                    key: "isStolen" as const,
                    label: "Stolen Vehicle",
                    value: vehicle.isStolen === 1,
                  },
                  {
                    key: "isWrittenOff" as const,
                    label: "Written Off",
                    value: vehicle.isWrittenOff === 1,
                  },
                ] as const
              ).map((flag) => (
                <div
                  key={flag.key}
                  className="flex items-center justify-between cursor-pointer hover:bg-gray-800 rounded px-2 py-1"
                  onClick={() =>
                    setFlagMutation.mutate({ id, flag: flag.key, value: !flag.value })
                  }
                >
                  <span className="text-sm text-gray-300">{flag.label}</span>
                  {flag.value ? (
                    <Badge className="bg-red-600 text-white text-xs">Active</Badge>
                  ) : (
                    <Badge className="bg-gray-700 text-gray-400 dark:text-muted-foreground/70 text-xs">Clear</Badge>
                  )}
                </div>
              ))}
              <Separator className="bg-gray-800" />
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-sm text-gray-300">Repeat Claimer (≥3)</span>
                {vehicle.isRepeatClaimer === 1 ? (
                  <Badge className="bg-orange-600 text-white text-xs">Yes</Badge>
                ) : (
                  <Badge className="bg-gray-700 text-gray-400 dark:text-muted-foreground/70 text-xs">No</Badge>
                )}
              </div>
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-sm text-gray-300">Suspicious Damage Pattern</span>
                {vehicle.hasSuspiciousDamagePattern === 1 ? (
                  <Badge className="bg-red-600 text-white text-xs">Detected</Badge>
                ) : (
                  <Badge className="bg-gray-700 text-gray-400 dark:text-muted-foreground/70 text-xs">None</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Middle column: Risk Score + Damage Zones + Lifecycle */}
        <div className="space-y-4">
          {/* Risk Score */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400 dark:text-muted-foreground/70 flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Vehicle Risk Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-3 mb-3">
                <span className={`text-5xl font-bold ${riskColor(vehicle.vehicleRiskScore)}`}>
                  {vehicle.vehicleRiskScore}
                </span>
                <span className="text-gray-500 dark:text-muted-foreground text-lg mb-1">/100</span>
                <div className="ml-auto">{riskBadge(vehicle.vehicleRiskScore)}</div>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${riskBarColor(vehicle.vehicleRiskScore)}`}
                  style={{ width: `${vehicle.vehicleRiskScore}%` }}
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-400 dark:text-muted-foreground/70">
                <div className="bg-gray-800 rounded p-2">
                  <div className="text-gray-500 dark:text-muted-foreground">Total Claims</div>
                  <div className="text-white font-bold text-lg">{vehicle.totalClaimsCount}</div>
                </div>
                <div className="bg-gray-800 rounded p-2">
                  <div className="text-gray-500 dark:text-muted-foreground">Total Repair Cost</div>
                  <div className="text-white font-bold text-sm">
                    {formatCurrency(vehicle.totalRepairCostCents)}
                  </div>
                </div>
                <div className="bg-gray-800 rounded p-2">
                  <div className="text-gray-500 dark:text-muted-foreground">First Seen</div>
                  <div className="text-white text-sm">{formatDate(vehicle.firstSeenAt)}</div>
                </div>
                <div className="bg-gray-800 rounded p-2">
                  <div className="text-gray-500 dark:text-muted-foreground">Last Claim</div>
                  <div className="text-white text-sm">{formatDate(vehicle.lastClaimDate)}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Damage Zone Distribution */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400 dark:text-muted-foreground/70 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Damage Zone Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(damageZoneCounts).length === 0 ? (
                <p className="text-gray-500 dark:text-muted-foreground text-sm text-center py-4">
                  No damage zone data yet
                </p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(damageZoneCounts)
                    .sort(([, a], [, b]) => b - a)
                    .map(([zone, count]) => {
                      const maxCount = Math.max(...Object.values(damageZoneCounts));
                      const pct = Math.round((count / maxCount) * 100);
                      const isSuspicious = count >= 2;
                      return (
                        <div key={zone}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="capitalize text-gray-300 flex items-center gap-1">
                              {isSuspicious && (
                                <AlertTriangle className="h-3 w-3 text-red-400" />
                              )}
                              {zone}
                            </span>
                            <span className={isSuspicious ? "text-red-400 font-bold" : "text-gray-400 dark:text-muted-foreground/70"}>
                              {count}×
                            </span>
                          </div>
                          <div className="w-full bg-gray-800 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                isSuspicious
                                  ? "bg-red-500"
                                  : zoneColors[zone] ?? "bg-blue-500"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  {vehicle.hasSuspiciousDamagePattern === 1 && (
                    <div className="mt-2 flex items-center gap-2 bg-red-900/30 border border-red-800 rounded p-2 text-xs text-red-300">
                      <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                      Same impact zone claimed multiple times — fraud signal
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Registry Lifecycle */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400 dark:text-muted-foreground/70 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Registry Lifecycle
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-muted-foreground">First Seen</span>
                <span>{formatDate(vehicle.firstSeenAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-muted-foreground">Last Updated</span>
                <span>{formatDate(vehicle.lastSeenAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-muted-foreground">Linked Claims</span>
                <span className="font-mono">{claimIds.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-muted-foreground">Mass Source</span>
                <span className="capitalize text-xs">
                  {vehicle.vehicleMassSource?.replace(/_/g, " ") ?? "—"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column: Claim History */}
        <div>
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400 dark:text-muted-foreground/70 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Claim History
                <Badge className="ml-auto bg-gray-700 text-gray-300 text-xs">
                  {claimHistory?.length ?? 0} claims
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!claimHistory || claimHistory.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-muted-foreground text-sm">
                  No claims linked yet
                </div>
              ) : (
                <div className="divide-y divide-gray-800">
                  {claimHistory.map((claim) => (
                    <div
                      key={claim.id}
                      className="flex items-start gap-3 p-3 hover:bg-gray-800/50 cursor-pointer transition-colors"
                      onClick={() =>
                        setLocation(`/insurer/claims/${claim.id}/comparison`)
                      }
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-blue-400">
                            {claim.claimNumber}
                          </span>
                          {claimStatusBadge(claim.status)}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-muted-foreground">
                          {formatDate(claim.incidentDate)}
                        </div>
                        {claim.fraudRiskScore != null && claim.fraudRiskScore > 25 && (
                          <div className="flex items-center gap-1 mt-1">
                            <AlertTriangle className="h-3 w-3 text-orange-400" />
                            <span className="text-xs text-orange-400">
                              Fraud score: {claim.fraudRiskScore}
                            </span>
                          </div>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-600 dark:text-muted-foreground flex-shrink-0 mt-0.5" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Registry List View ───────────────────────────────────────────────────────

function RegistryList() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [searchVin, setSearchVin] = useState("");
  const [searchReg, setSearchReg] = useState("");
  const [showHighRiskOnly, setShowHighRiskOnly] = useState(false);

  const { data: stats } = trpc.vehicleRegistry.stats.useQuery();
  const { data: vehicles, isLoading } = trpc.vehicleRegistry.list.useQuery({
    limit: 100,
    offset: 0,
  });
  const { data: highRiskVehicles } = trpc.vehicleRegistry.listHighRisk.useQuery({
    minRiskScore: 25,
  });

  const { data: searchResult } = trpc.vehicleRegistry.findByVinOrReg.useQuery(
    { vin: searchVin || undefined, registration: searchReg || undefined },
    { enabled: !!(searchVin || searchReg) }
  );

  const displayVehicles = showHighRiskOnly ? (highRiskVehicles ?? []) : (vehicles ?? []);

  const filtered = displayVehicles.filter((v) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      v.make?.toLowerCase().includes(q) ||
      v.model?.toLowerCase().includes(q) ||
      v.registrationNumber?.toLowerCase().includes(q) ||
      v.vin?.toLowerCase().includes(q) ||
      v.currentOwnerName?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Car className="h-6 w-6 text-blue-400" />
            Vehicle Intelligence Registry
          </h1>
          <p className="text-gray-400 dark:text-muted-foreground/70 text-sm mt-1">
            Persistent vehicle records linked to claims — VIN-matched, risk-scored
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLocation("/insurer-portal")}
          className="text-gray-400 dark:text-muted-foreground/70 border-gray-700 hover:bg-gray-800"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Dashboard
        </Button>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          {[
            { label: "Total Vehicles", value: stats.total, icon: Car, color: "text-blue-400" },
            {
              label: "Repeat Claimers",
              value: stats.repeatClaimers,
              icon: AlertTriangle,
              color: "text-orange-400",
            },
            {
              label: "Suspicious Pattern",
              value: stats.suspiciousPattern,
              icon: ShieldAlert,
              color: "text-red-400",
            },
            {
              label: "Salvage Titles",
              value: stats.salvageTitles,
              icon: AlertTriangle,
              color: "text-red-500",
            },
            {
              label: "Stolen Vehicles",
              value: stats.stolenVehicles,
              icon: ShieldAlert,
              color: "text-red-600",
            },
            {
              label: "Avg Risk Score",
              value: stats.avgRiskScore,
              icon: Shield,
              color: "text-amber-400",
            },
            {
              label: "Total Repair Cost",
              value: formatCurrency(stats.totalRepairCostCents),
              icon: DollarSign,
              color: "text-green-400",
            },
          ].map((stat) => (
            <Card key={stat.label} className="bg-gray-900 border-gray-800">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
                  <span className="text-xs text-gray-500 dark:text-muted-foreground">{stat.label}</span>
                </div>
                <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Search + Filter */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-muted-foreground" />
          <Input
            placeholder="Filter by make, model, registration, owner..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-gray-900 border-gray-700 text-gray-100 placeholder-gray-500"
          />
        </div>
        <Input
          placeholder="Search by VIN..."
          value={searchVin}
          onChange={(e) => setSearchVin(e.target.value)}
          className="w-48 bg-gray-900 border-gray-700 text-gray-100 placeholder-gray-500 font-mono text-xs"
        />
        <Input
          placeholder="Search by Reg No..."
          value={searchReg}
          onChange={(e) => setSearchReg(e.target.value)}
          className="w-40 bg-gray-900 border-gray-700 text-gray-100 placeholder-gray-500 font-mono text-xs"
        />
        <Button
          variant={showHighRiskOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setShowHighRiskOnly(!showHighRiskOnly)}
          className={
            showHighRiskOnly
              ? "bg-red-600 hover:bg-red-700 text-white"
              : "border-gray-700 text-gray-400 dark:text-muted-foreground/70 hover:bg-gray-800"
          }
        >
          <ShieldAlert className="h-4 w-4 mr-1" />
          High Risk Only
        </Button>
      </div>

      {/* VIN/Reg search result */}
      {searchResult && (
        <Card
          className="mb-4 bg-blue-950 border-blue-800 cursor-pointer hover:bg-blue-900 transition-colors"
          onClick={() => setLocation(`/insurer/vehicle-registry/${searchResult.id}`)}
        >
          <CardContent className="p-3 flex items-center gap-4">
            <Car className="h-5 w-5 text-blue-400" />
            <div>
              <span className="text-blue-200 font-medium">
                {searchResult.make} {searchResult.model} {searchResult.year}
              </span>
              <span className="text-blue-400 ml-2 font-mono text-sm">
                {searchResult.registrationNumber ?? searchResult.vin}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {riskBadge(searchResult.vehicleRiskScore)}
              <ChevronRight className="h-4 w-4 text-blue-400" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vehicle Table */}
      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-500 dark:text-muted-foreground">
              <Car className="mx-auto h-12 w-12 mb-3 opacity-30" />
              <p>No vehicles found.</p>
              <p className="text-xs mt-1">
                Vehicles are automatically registered when AI assessments are completed.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-gray-800 hover:bg-transparent">
                  <TableHead className="text-gray-400 dark:text-muted-foreground/70 text-xs">Vehicle</TableHead>
                  <TableHead className="text-gray-400 dark:text-muted-foreground/70 text-xs">Registration / VIN</TableHead>
                  <TableHead className="text-gray-400 dark:text-muted-foreground/70 text-xs">Type</TableHead>
                  <TableHead className="text-gray-400 dark:text-muted-foreground/70 text-xs">Claims</TableHead>
                  <TableHead className="text-gray-400 dark:text-muted-foreground/70 text-xs">Total Repair</TableHead>
                  <TableHead className="text-gray-400 dark:text-muted-foreground/70 text-xs">Last Claim</TableHead>
                  <TableHead className="text-gray-400 dark:text-muted-foreground/70 text-xs">Flags</TableHead>
                  <TableHead className="text-gray-400 dark:text-muted-foreground/70 text-xs">Risk Score</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((v) => (
                  <TableRow
                    key={v.id}
                    className="border-gray-800 hover:bg-gray-800/50 cursor-pointer"
                    onClick={() => setLocation(`/insurer/vehicle-registry/${v.id}`)}
                  >
                    <TableCell className="font-medium text-gray-200">
                      {v.make ?? "—"} {v.model ?? ""} {v.year ?? ""}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-gray-400 dark:text-muted-foreground/70">
                      <div>{v.registrationNumber ?? "—"}</div>
                      {v.vin && (
                        <div className="text-gray-600 dark:text-muted-foreground text-xs">{v.vin}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-gray-400 dark:text-muted-foreground/70 capitalize">
                      {v.vehicleType ?? "—"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`font-bold ${
                          v.totalClaimsCount >= 3 ? "text-orange-400" : "text-gray-300"
                        }`}
                      >
                        {v.totalClaimsCount}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-gray-300">
                      {formatCurrency(v.totalRepairCostCents)}
                    </TableCell>
                    <TableCell className="text-xs text-gray-400 dark:text-muted-foreground/70">
                      {formatDate(v.lastClaimDate)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {v.isRepeatClaimer === 1 && (
                          <Badge className="bg-orange-900 text-orange-300 text-xs px-1">Repeat</Badge>
                        )}
                        {v.hasSuspiciousDamagePattern === 1 && (
                          <Badge className="bg-red-900 text-red-300 text-xs px-1">Pattern</Badge>
                        )}
                        {v.isSalvageTitle === 1 && (
                          <Badge className="bg-red-900 text-red-300 text-xs px-1">Salvage</Badge>
                        )}
                        {v.isStolen === 1 && (
                          <Badge className="bg-red-900 text-red-300 text-xs px-1">Stolen</Badge>
                        )}
                        {v.isWrittenOff === 1 && (
                          <Badge className="bg-gray-700 text-gray-300 text-xs px-1">Written Off</Badge>
                        )}
                        {v.isRepeatClaimer !== 1 &&
                          v.hasSuspiciousDamagePattern !== 1 &&
                          v.isSalvageTitle !== 1 &&
                          v.isStolen !== 1 &&
                          v.isWrittenOff !== 1 && (
                            <span className="text-gray-600 dark:text-muted-foreground text-xs">—</span>
                          )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-800 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${riskBarColor(v.vehicleRiskScore)}`}
                            style={{ width: `${v.vehicleRiskScore}%` }}
                          />
                        </div>
                        <span className={`text-xs font-bold ${riskColor(v.vehicleRiskScore)}`}>
                          {v.vehicleRiskScore}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-gray-600 dark:text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Route entry point ────────────────────────────────────────────────────────

export default function VehicleRegistry() {
  const params = useParams<{ id?: string }>();
  const id = params.id ? parseInt(params.id, 10) : null;

  if (id && !isNaN(id)) {
    return <VehicleProfile id={id} />;
  }
  return <RegistryList />;
}
