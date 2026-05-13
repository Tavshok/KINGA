/**
 * FleetVehicleTrackingTab
 *
 * Shown inside the Fleet Manager Dashboard under the "Vehicle Tracking" tab.
 * Groups all claims by vehicle registration, showing per-vehicle claim history,
 * status, department, and incident timeline.
 */
import { useMemo, useState } from "react";
import {
  Car,
  ChevronDown,
  ChevronRight,
  Calendar,
  MapPin,
  AlertCircle,
  CheckCircle2,
  Clock,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

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

interface VehicleGroup {
  registration: string;
  make: string;
  model: string;
  year: number;
  claims: FleetClaim[];
  departments: string[];
  lastIncident: string | null;
  activeClaims: number;
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    submitted: { label: "Submitted", className: "bg-blue-100 text-blue-700 border-blue-200" },
    in_review: { label: "In Review", className: "bg-amber-100 text-amber-700 border-amber-200" },
    ai_complete: { label: "KINGA Complete", className: "bg-purple-100 text-purple-700 border-purple-200" },
    approved: { label: "Approved", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    rejected: { label: "Rejected", className: "bg-red-100 text-red-700 border-red-200" },
    completed: { label: "Completed", className: "bg-slate-100 text-slate-700 border-slate-200" },
  };
  const s = map[status] ?? { label: status, className: "bg-gray-100 text-gray-600 border-gray-200" };
  return (
    <Badge variant="outline" className={`text-xs ${s.className}`}>
      {s.label}
    </Badge>
  );
}

function riskLevel(claimCount: number, activeClaims: number): { label: string; color: string } {
  if (activeClaims > 0 || claimCount >= 3) return { label: "High Activity", color: "text-red-600" };
  if (claimCount === 2) return { label: "Moderate", color: "text-amber-600" };
  return { label: "Low", color: "text-emerald-600" };
}

interface Props {
  claims: FleetClaim[];
}

export function FleetVehicleTrackingTab({ claims }: Props) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const vehicleGroups = useMemo<VehicleGroup[]>(() => {
    const map = new Map<string, VehicleGroup>();
    for (const c of claims) {
      const reg = c.vehicleRegistration || "UNKNOWN";
      if (!map.has(reg)) {
        map.set(reg, {
          registration: reg,
          make: c.vehicleMake,
          model: c.vehicleModel,
          year: c.vehicleYear,
          claims: [],
          departments: [],
          lastIncident: null,
          activeClaims: 0,
        });
      }
      const group = map.get(reg)!;
      group.claims.push(c);
      if (c.claimantDepartment && !group.departments.includes(c.claimantDepartment)) {
        group.departments.push(c.claimantDepartment);
      }
      if (["submitted", "in_review", "ai_complete"].includes(c.status)) {
        group.activeClaims++;
      }
      if (c.incidentDate) {
        if (!group.lastIncident || c.incidentDate > group.lastIncident) {
          group.lastIncident = c.incidentDate;
        }
      }
    }
    // Sort by most active/most claims first
    return Array.from(map.values()).sort((a, b) => {
      if (b.activeClaims !== a.activeClaims) return b.activeClaims - a.activeClaims;
      return b.claims.length - a.claims.length;
    });
  }, [claims]);

  const filtered = useMemo(() => {
    if (!search.trim()) return vehicleGroups;
    const q = search.toLowerCase();
    return vehicleGroups.filter(
      (g) =>
        g.registration.toLowerCase().includes(q) ||
        `${g.make} ${g.model}`.toLowerCase().includes(q) ||
        g.departments.some((d) => d.toLowerCase().includes(q))
    );
  }, [vehicleGroups, search]);

  const toggleExpand = (reg: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(reg)) next.delete(reg);
      else next.add(reg);
      return next;
    });
  };

  if (claims.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Car className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No company vehicle claims found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="py-3">
          <CardContent className="pt-0 pb-0 px-4">
            <p className="text-xs text-muted-foreground">Unique Vehicles</p>
            <p className="text-2xl font-bold text-blue-600">{vehicleGroups.length}</p>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="pt-0 pb-0 px-4">
            <p className="text-xs text-muted-foreground">Vehicles with Active Claims</p>
            <p className="text-2xl font-bold text-amber-600">
              {vehicleGroups.filter((g) => g.activeClaims > 0).length}
            </p>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="pt-0 pb-0 px-4">
            <p className="text-xs text-muted-foreground">High Activity Vehicles</p>
            <p className="text-2xl font-bold text-red-600">
              {vehicleGroups.filter((g) => g.claims.length >= 3 || g.activeClaims > 0).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search by reg, make, department..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>

      {/* Vehicle list */}
      <div className="space-y-2">
        {filtered.map((group) => {
          const isOpen = expanded.has(group.registration);
          const risk = riskLevel(group.claims.length, group.activeClaims);
          return (
            <Card key={group.registration} className="overflow-hidden">
              {/* Vehicle header row */}
              <button
                type="button"
                className="w-full text-left"
                onClick={() => toggleExpand(group.registration)}
              >
                <div className="flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Car className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-sm">{group.registration}</span>
                      <span className="text-sm text-muted-foreground">
                        {group.make} {group.model} ({group.year})
                      </span>
                      {group.activeClaims > 0 && (
                        <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          {group.activeClaims} active
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                      <span>{group.claims.length} total claim{group.claims.length !== 1 ? "s" : ""}</span>
                      {group.departments.length > 0 && (
                        <span>{group.departments.join(", ")}</span>
                      )}
                      {group.lastIncident && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Last: {new Date(group.lastIncident).toLocaleDateString()}
                        </span>
                      )}
                      <span className={`font-medium ${risk.color}`}>{risk.label}</span>
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-muted-foreground">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </div>
                </div>
              </button>

              {/* Expanded claims list */}
              {isOpen && (
                <div className="border-t">
                  <div className="divide-y">
                    {group.claims
                      .sort((a, b) => (b.incidentDate ?? "").localeCompare(a.incidentDate ?? ""))
                      .map((c) => (
                        <div key={c.id} className="px-4 py-3 flex items-start gap-3 bg-muted/10">
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-medium text-blue-700">{c.claimNumber}</span>
                              {statusBadge(c.status)}
                              {c.claimantDepartment && (
                                <Badge variant="secondary" className="text-xs">{c.claimantDepartment}</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                              {c.incidentDate && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(c.incidentDate).toLocaleDateString()}
                                </span>
                              )}
                              {c.incidentLocation && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  <span className="truncate max-w-[150px]">{c.incidentLocation}</span>
                                </span>
                              )}
                              {c.submittedByName && (
                                <span>By: {c.submittedByName}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
