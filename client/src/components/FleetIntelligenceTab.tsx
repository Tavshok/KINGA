/**
 * FleetIntelligenceTab
 * ─────────────────────
 * Epic 4 — Fleet Intelligence panel.
 * Renders fleet-level risk intelligence from the fleetIntelligenceRouter.
 * Used in: FleetManagerDashboard (Intelligence tab), KingaAgency (Fleet Intelligence tab).
 *
 * Note: fleetAccounts and fleets are separate tables. This component uses
 * trpc.fleetIntelligence.listFleets() to discover fleet IDs, then fetches
 * per-fleet intelligence. When a fleetId is passed directly (e.g. from an
 * insurer portal), it skips the discovery step.
 *
 * Data sources (all canonical):
 *   fleetIntelligence.listFleets
 *   fleetIntelligence.getFleetSummary
 *   fleetIntelligence.getVehicleRiskLeaderboard
 *   fleetIntelligence.getDriverRiskLeaderboard
 *   fleetIntelligence.getIncidentHistory
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  BookOpen,
  Car,
  Shield,
  TrendingUp,
  Users,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(cents: number | null | undefined): string {
  if (!cents) return "—";
  return `$${(Number(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function riskColor(score: number | null | undefined): string {
  const n = Number(score ?? 0);
  if (n >= 75) return "text-red-400";
  if (n >= 50) return "text-orange-400";
  if (n >= 25) return "text-amber-400";
  return "text-green-400";
}

function riskBadge(score: number | null | undefined): React.ReactNode {
  const n = Number(score ?? 0);
  const cls = n >= 75 ? "bg-red-900 text-red-300" : n >= 50 ? "bg-orange-900 text-orange-300" : n >= 25 ? "bg-amber-900 text-amber-300" : "bg-green-900 text-green-300";
  return <Badge className={`${cls} text-[10px]`}>{n}</Badge>;
}

// ─── Fleet Selector ───────────────────────────────────────────────────────────

function FleetSelector({ fleets, selectedId, onSelect }: {
  fleets: Array<{ id: number; fleetName: string; totalVehicles: number | null }>;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap mb-4">
      {fleets.map(f => (
        <button
          key={f.id}
          onClick={() => onSelect(f.id)}
          className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${
            selectedId === f.id
              ? "bg-blue-800 text-blue-200"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          }`}
        >
          {f.fleetName}
          <span className="ml-1.5 text-gray-500">{f.totalVehicles ?? 0}v</span>
        </button>
      ))}
    </div>
  );
}

// ─── Fleet Detail ─────────────────────────────────────────────────────────────

function FleetDetail({ fleetId }: { fleetId: number }) {
  const { data: summary, isLoading: loadingSum } = trpc.fleetIntelligence.getFleetSummary.useQuery(
    { fleetId },
    { staleTime: 3 * 60 * 1000 }
  );
  const { data: vehicleLeaderboard } = trpc.fleetIntelligence.getVehicleRiskLeaderboard.useQuery(
    { fleetId, limit: 10 },
    { staleTime: 3 * 60 * 1000 }
  );
  const { data: driverLeaderboard } = trpc.fleetIntelligence.getDriverRiskLeaderboard.useQuery(
    { fleetId, limit: 10 },
    { staleTime: 3 * 60 * 1000 }
  );
  const { data: incidents } = trpc.fleetIntelligence.getIncidentHistory.useQuery(
    { fleetId, limit: 10 },
    { staleTime: 3 * 60 * 1000 }
  );

  if (loadingSum) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
        <span className="ml-2 text-sm text-gray-400">Loading fleet intelligence…</span>
      </div>
    );
  }

  if (!summary) {
    return <div className="text-center py-10 text-gray-500 text-sm">Fleet data unavailable.</div>;
  }

  const f = summary.fleet;
  const vr = summary.vehicleRisk;
  const inc = summary.incidents;

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-3 pb-3 px-4">
            <div className="text-xs text-gray-400 mb-1">Total Vehicles</div>
            <div className="text-2xl font-bold text-gray-100">{f.totalVehicles ?? "—"}</div>
            <div className="text-xs text-gray-500">{f.activeVehicles ?? "—"} active</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-3 pb-3 px-4">
            <div className="text-xs text-gray-400 mb-1">Avg Risk Score</div>
            <div className={`text-2xl font-bold ${riskColor(vr.avgRiskScore != null ? Number(vr.avgRiskScore) : null)}`}>
              {vr.avgRiskScore != null ? Math.round(Number(vr.avgRiskScore)) : "—"}
            </div>
            <div className="text-xs text-gray-500">{vr.highRiskVehicles} high-risk</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-3 pb-3 px-4">
            <div className="text-xs text-gray-400 mb-1">Linked Claims</div>
            <div className="text-2xl font-bold text-gray-100">{summary.claimCount}</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-3 pb-3 px-4">
            <div className="text-xs text-gray-400 mb-1">Incidents</div>
            <div className={`text-2xl font-bold ${inc.criticalIncidents > 0 ? "text-red-400" : "text-gray-100"}`}>
              {inc.totalIncidents}
            </div>
            <div className="text-xs text-gray-500">{inc.openIncidents} open · {inc.criticalIncidents} critical</div>
          </CardContent>
        </Card>
      </div>

      {/* Vehicle + Driver leaderboards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Vehicle Risk Leaderboard */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-gray-400 flex items-center gap-2 uppercase tracking-wide">
              <Car className="h-3.5 w-3.5" />
              Vehicle Risk Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {!vehicleLeaderboard?.leaderboard?.length ? (
              <p className="text-xs text-gray-500 text-center py-3">No vehicle risk data</p>
            ) : (
              <div className="space-y-1.5">
                {vehicleLeaderboard.leaderboard.map((v, i) => (
                  <div key={v.vehicleId} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500 w-4 text-right flex-shrink-0">{i + 1}.</span>
                    <span className="font-mono text-gray-200 flex-1 truncate">
                      {v.registrationNumber ?? `V${v.vehicleId}`}
                    </span>
                    <span className="text-gray-400 truncate">{v.make ?? ""} {v.model ?? ""}</span>
                    {riskBadge(v.riskScore)}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Driver Leaderboard */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-gray-400 flex items-center gap-2 uppercase tracking-wide">
              <Users className="h-3.5 w-3.5" />
              Driver Register
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {!driverLeaderboard?.leaderboard?.length ? (
              <p className="text-xs text-gray-500 text-center py-3">No driver data</p>
            ) : (
              <div className="space-y-1.5">
                {driverLeaderboard.leaderboard.map((d, i) => (
                  <div key={d.driverId} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500 w-4 text-right flex-shrink-0">{i + 1}.</span>
                    <span className="font-mono text-gray-200 flex-1 truncate">
                      {d.licenseNumber ?? `D${d.driverId}`}
                    </span>
                    <Badge className="bg-gray-800 text-gray-400 text-[10px] capitalize">
                      {d.employmentStatus ?? "—"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Incident History */}
      {incidents && incidents.incidents.length > 0 && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-gray-400 flex items-center gap-2 uppercase tracking-wide">
              <AlertTriangle className="h-3.5 w-3.5" />
              Recent Incidents
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="space-y-2">
              {incidents.incidents.map((inc: any, i: number) => (
                <div key={i} className="flex items-start gap-2 text-xs border-b border-gray-800 pb-2 last:border-0">
                  <AlertTriangle className={`h-3 w-3 flex-shrink-0 mt-0.5 ${inc.severity === 'critical' ? 'text-red-400' : inc.severity === 'high' ? 'text-orange-400' : 'text-amber-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-200 capitalize">{inc.incidentType?.replace(/_/g, ' ') ?? 'Incident'}</span>
                      <Badge className={`text-[10px] capitalize ${inc.status === 'open' ? 'bg-amber-900 text-amber-300' : 'bg-gray-800 text-gray-400'}`}>
                        {inc.status}
                      </Badge>
                    </div>
                    {inc.description && <p className="text-gray-500 truncate">{inc.description}</p>}
                  </div>
                  <span className="text-gray-600 flex-shrink-0">
                    {inc.incidentDate ? new Date(inc.incidentDate).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' }) : '—'}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data sources */}
      <div className="flex items-center gap-1.5 text-[10px] text-gray-600 pt-1 border-t border-gray-800">
        <BookOpen className="h-3 w-3" />
        <span>Sources: fleets · fleet_vehicles · fleet_risk_scores · fleet_drivers · fleet_incident_reports · claims</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface FleetIntelligenceTabProps {
  /** Pass a specific fleetId to skip the fleet discovery step. */
  fleetId?: number;
}

export function FleetIntelligenceTab({ fleetId: propFleetId }: FleetIntelligenceTabProps) {
  const [selectedFleetId, setSelectedFleetId] = useState<number | null>(propFleetId ?? null);

  const { data: fleetList, isLoading: loadingList } = trpc.fleetIntelligence.listFleets.useQuery(
    undefined,
    {
      staleTime: 5 * 60 * 1000,
      enabled: !propFleetId, // skip if fleetId is provided directly
    }
  );

  // Auto-select first fleet when list loads
  const fleets = fleetList?.fleets ?? [];
  if (!selectedFleetId && fleets.length > 0 && !propFleetId) {
    setSelectedFleetId(fleets[0].id);
  }

  const activeFleetId = propFleetId ?? selectedFleetId;

  if (loadingList && !propFleetId) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        <span className="ml-3 text-sm text-gray-400">Loading fleet list…</span>
      </div>
    );
  }

  if (!propFleetId && fleets.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <TrendingUp className="mx-auto h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm">No fleets found for this tenant.</p>
        <p className="text-xs mt-1 text-gray-600">Fleets are created via the Fleet Management portal.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-100">Fleet Intelligence</h3>
          <p className="text-xs text-gray-500 mt-0.5">Epic 4 · Risk leaderboards, incidents, and driver register</p>
        </div>
        <Shield className="h-5 w-5 text-gray-600" />
      </div>

      {!propFleetId && fleets.length > 1 && (
        <FleetSelector
          fleets={fleets}
          selectedId={selectedFleetId}
          onSelect={setSelectedFleetId}
        />
      )}

      {activeFleetId ? (
        <FleetDetail fleetId={activeFleetId} />
      ) : (
        <div className="text-center py-10 text-gray-500 text-sm">Select a fleet above to view intelligence.</div>
      )}
    </div>
  );
}
