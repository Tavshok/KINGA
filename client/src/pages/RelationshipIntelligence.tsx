import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Shield,
  Users,
  MapPin,
  TrendingUp,
  Activity,
  Eye,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Network,
  Car,
  UserCheck,
  Building2,
  Siren,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

function RiskBadge({ level }: { level?: string }) {
  const map: Record<string, { label: string; className: string }> = {
    critical: { label: "CRITICAL", className: "bg-red-600 text-white" },
    high: { label: "HIGH", className: "bg-orange-500 text-white" },
    elevated: { label: "ELEVATED", className: "bg-yellow-500 text-black" },
    advisory: { label: "ADVISORY", className: "bg-blue-500 text-white" },
    minimal: { label: "MINIMAL", className: "bg-green-600 text-white" },
    medium: { label: "MEDIUM", className: "bg-yellow-500 text-black" },
    low: { label: "LOW", className: "bg-green-600 text-white" },
  };
  const entry = map[level?.toLowerCase() ?? "minimal"] ?? { label: level ?? "—", className: "bg-gray-400 text-white" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${entry.className}`}>{entry.label}</span>;
}

function StatCard({
  icon: Icon,
  title,
  total,
  flagged,
  flagLabel = "Flagged",
  color = "text-blue-400",
}: {
  icon: any;
  title: string;
  total: number;
  flagged: number;
  flagLabel?: string;
  color?: string;
}) {
  return (
    <Card className="bg-[#0f1623] border-[#1e2d45]">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{title}</p>
            <p className="text-3xl font-bold text-white">{total}</p>
            <p className="text-xs mt-1">
              <span className={flagged > 0 ? "text-orange-400 font-semibold" : "text-gray-500"}>
                {flagged} {flagLabel}
              </span>
            </p>
          </div>
          <Icon className={`w-8 h-8 ${color} opacity-70`} />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function RelationshipIntelligence() {
  const [activeTab, setActiveTab] = useState("overview");

  const stats = trpc.intelligence.getSummaryStats.useQuery({});
  const officers = trpc.intelligence.getOfficerRegistry.useQuery({ limit: 50 });
  const assessors = trpc.intelligence.getAssessorRegistry.useQuery({ limit: 50 });
  const panelBeaters = trpc.intelligence.getPanelBeaterRegistry.useQuery({ limit: 50 });
  const drivers = trpc.intelligence.getDriverRegistry.useQuery({ limit: 50 });
  const clusters = trpc.intelligence.getAccidentClusters.useQuery({});
  const anomalies = trpc.intelligence.getAnomalyScores.useQuery({ anomalyOnly: false });

  const s = stats.data;
  const isLoading = stats.isLoading;

  const refetchAll = () => {
    stats.refetch();
    officers.refetch();
    assessors.refetch();
    panelBeaters.refetch();
    drivers.refetch();
    clusters.refetch();
    anomalies.refetch();
  };

  return (
    <div className="min-h-screen bg-[#080e1a] text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Network className="w-7 h-7 text-blue-400" />
            <h1 className="text-2xl font-bold text-white">Relationship Intelligence</h1>
          </div>
          <p className="text-gray-400 text-sm">
            Entity registries, fraud webs, accident hotspots, and ML anomaly detection
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refetchAll}
          className="border-[#1e2d45] text-gray-300 hover:bg-[#1e2d45]"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Stats */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 bg-[#0f1623] rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <StatCard icon={Siren} title="Police Officers" total={Number(s?.officers?.total ?? 0)} flagged={Number(s?.officers?.flagged ?? 0)} flagLabel="High Risk" color="text-red-400" />
          <StatCard icon={UserCheck} title="Assessors" total={Number(s?.assessors?.total ?? 0)} flagged={Number(s?.assessors?.flagged ?? 0)} flagLabel="Collusion Suspected" color="text-orange-400" />
          <StatCard icon={Building2} title="Panel Beaters" total={Number(s?.panelBeaters?.total ?? 0)} flagged={Number(s?.panelBeaters?.flagged ?? 0)} flagLabel="Cost Suppression" color="text-yellow-400" />
          <StatCard icon={Car} title="Drivers" total={Number(s?.drivers?.total ?? 0)} flagged={Number(s?.drivers?.flagged ?? 0)} flagLabel="Repeat Claimants" color="text-blue-400" />
          <StatCard icon={MapPin} title="Hotspot Clusters" total={Number(s?.clusters?.total ?? 0)} flagged={Number(s?.clusters?.high_risk ?? 0)} flagLabel="High Risk" color="text-purple-400" />
          <StatCard icon={Activity} title="ML Anomalies" total={Number(s?.mlAnomalies?.total ?? 0)} flagged={Number(s?.mlAnomalies?.total ?? 0)} flagLabel="Detected" color="text-pink-400" />
        </div>
      )}

      {/* No data notice */}
      {!isLoading && Number(s?.officers?.total ?? 0) === 0 && Number(s?.assessors?.total ?? 0) === 0 && (
        <div className="bg-[#0f1623] border border-[#1e2d45] rounded-lg p-6 mb-6 flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-white mb-1">Entity registries are building</p>
            <p className="text-gray-400 text-sm">
              Entity records are created automatically after each AI assessment completes. Run more assessments to populate the registries. Once 5+ entities exist per type, the ML anomaly detection will also activate.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-[#0f1623] border border-[#1e2d45] mb-4">
          <TabsTrigger value="overview" className="data-[state=active]:bg-[#1e2d45]">Overview</TabsTrigger>
          <TabsTrigger value="officers" className="data-[state=active]:bg-[#1e2d45]">Police Officers</TabsTrigger>
          <TabsTrigger value="assessors" className="data-[state=active]:bg-[#1e2d45]">Assessors</TabsTrigger>
          <TabsTrigger value="panelbeaters" className="data-[state=active]:bg-[#1e2d45]">Panel Beaters</TabsTrigger>
          <TabsTrigger value="drivers" className="data-[state=active]:bg-[#1e2d45]">Drivers</TabsTrigger>
          <TabsTrigger value="hotspots" className="data-[state=active]:bg-[#1e2d45]">Hotspots</TabsTrigger>
          <TabsTrigger value="ml" className="data-[state=active]:bg-[#1e2d45]">ML Anomalies</TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW ── */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* High-risk officers */}
            <Card className="bg-[#0f1623] border-[#1e2d45]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                  <Siren className="w-4 h-4 text-red-400" /> Officer Concentration Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                {officers.isLoading ? <div className="h-32 animate-pulse bg-[#1e2d45] rounded" /> : (
                  <div className="space-y-2">
                    {(officers.data ?? []).filter((o: any) => ['high', 'critical', 'elevated'].includes(o.concentration_risk_level)).slice(0, 5).map((o: any) => (
                      <div key={o.id} className="flex items-center justify-between py-2 border-b border-[#1e2d45] last:border-0">
                        <div>
                          <p className="text-sm font-medium text-white">{o.entity_name}</p>
                          <p className="text-xs text-gray-400">{o.police_station ?? '—'} · Badge: {o.badge_number ?? '—'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">{o.total_claims_attended} claims</span>
                          <RiskBadge level={o.concentration_risk_level} />
                        </div>
                      </div>
                    ))}
                    {(officers.data ?? []).filter((o: any) => ['high', 'critical', 'elevated'].includes(o.concentration_risk_level)).length === 0 && (
                      <div className="flex items-center gap-2 text-gray-500 text-sm py-4">
                        <CheckCircle2 className="w-4 h-4 text-green-500" /> No concentration alerts
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Assessor collusion */}
            <Card className="bg-[#0f1623] border-[#1e2d45]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-400" /> Assessor Collusion Flags
                </CardTitle>
              </CardHeader>
              <CardContent>
                {assessors.isLoading ? <div className="h-32 animate-pulse bg-[#1e2d45] rounded" /> : (
                  <div className="space-y-2">
                    {(assessors.data ?? []).filter((a: any) => a.collusion_suspected).slice(0, 5).map((a: any) => (
                      <div key={a.id} className="flex items-center justify-between py-2 border-b border-[#1e2d45] last:border-0">
                        <div>
                          <p className="text-sm font-medium text-white">{a.entity_name}</p>
                          <p className="text-xs text-gray-400">Routing concentration: {a.routing_concentration_score ?? '—'}%</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">{a.total_claims_assessed} claims</span>
                          <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">Collusion</Badge>
                        </div>
                      </div>
                    ))}
                    {(assessors.data ?? []).filter((a: any) => a.collusion_suspected).length === 0 && (
                      <div className="flex items-center gap-2 text-gray-500 text-sm py-4">
                        <CheckCircle2 className="w-4 h-4 text-green-500" /> No collusion flags
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top hotspots */}
            <Card className="bg-[#0f1623] border-[#1e2d45]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-purple-400" /> Top Accident Hotspots
                </CardTitle>
              </CardHeader>
              <CardContent>
                {clusters.isLoading ? <div className="h-32 animate-pulse bg-[#1e2d45] rounded" /> : (
                  <div className="space-y-2">
                    {(clusters.data ?? []).slice(0, 5).map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between py-2 border-b border-[#1e2d45] last:border-0">
                        <div className="flex-1 min-w-0 mr-3">
                          <p className="text-sm font-medium text-white truncate">{c.location_description}</p>
                          <p className="text-xs text-gray-400">{c.hotspot_type?.replace(/_/g, ' ')} · {c.claim_count} claims</p>
                        </div>
                        <RiskBadge level={c.risk_level} />
                      </div>
                    ))}
                    {(clusters.data ?? []).length === 0 && (
                      <div className="flex items-center gap-2 text-gray-500 text-sm py-4">
                        <CheckCircle2 className="w-4 h-4 text-green-500" /> No hotspot clusters yet
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ML anomalies */}
            <Card className="bg-[#0f1623] border-[#1e2d45]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-pink-400" /> ML Anomaly Detections
                </CardTitle>
              </CardHeader>
              <CardContent>
                {anomalies.isLoading ? <div className="h-32 animate-pulse bg-[#1e2d45] rounded" /> : (
                  <div className="space-y-2">
                    {(anomalies.data ?? []).filter((a: any) => a.is_anomaly).slice(0, 5).map((a: any) => (
                      <div key={a.id} className="flex items-center justify-between py-2 border-b border-[#1e2d45] last:border-0">
                        <div>
                          <p className="text-sm font-medium text-white">{a.entity_name}</p>
                          <p className="text-xs text-gray-400 capitalize">{a.entity_type?.replace(/_/g, ' ')}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">Score: {(Number(a.anomaly_score) * 100).toFixed(0)}%</span>
                          <Badge className="bg-pink-500/20 text-pink-400 border-pink-500/30">Anomaly</Badge>
                        </div>
                      </div>
                    ))}
                    {(anomalies.data ?? []).filter((a: any) => a.is_anomaly).length === 0 && (
                      <div className="flex items-center gap-2 text-gray-500 text-sm py-4">
                        <CheckCircle2 className="w-4 h-4 text-green-500" /> No ML anomalies detected yet
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── POLICE OFFICERS ── */}
        <TabsContent value="officers">
          <Card className="bg-[#0f1623] border-[#1e2d45]">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-300">Police Officer Registry</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e2d45]">
                    <TableHead className="text-gray-400">Officer Name</TableHead>
                    <TableHead className="text-gray-400">Badge / Station</TableHead>
                    <TableHead className="text-gray-400">Claims Attended</TableHead>
                    <TableHead className="text-gray-400">Avg Fraud Score</TableHead>
                    <TableHead className="text-gray-400">Concentration Risk</TableHead>
                    <TableHead className="text-gray-400">Last Seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {officers.isLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-gray-500 py-8">Loading...</TableCell></TableRow>
                  ) : (officers.data ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-gray-500 py-8">No officers recorded yet. Officers are added automatically when police reports are processed.</TableCell></TableRow>
                  ) : (officers.data ?? []).map((o: any) => (
                    <TableRow key={o.id} className="border-[#1e2d45] hover:bg-[#1e2d45]/30">
                      <TableCell className="text-white font-medium">{o.entity_name}</TableCell>
                      <TableCell className="text-gray-300">{o.badge_number ?? '—'} · {o.police_station ?? '—'}</TableCell>
                      <TableCell className="text-white">{o.total_claims_attended}</TableCell>
                      <TableCell className="text-white">{o.avg_fraud_score_on_claims ? `${Number(o.avg_fraud_score_on_claims).toFixed(1)}%` : '—'}</TableCell>
                      <TableCell><RiskBadge level={o.concentration_risk_level} /></TableCell>
                      <TableCell className="text-gray-400 text-xs">{o.last_seen_date ? new Date(o.last_seen_date).toLocaleDateString() : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ASSESSORS ── */}
        <TabsContent value="assessors">
          <Card className="bg-[#0f1623] border-[#1e2d45]">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-300">Assessor Registry</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e2d45]">
                    <TableHead className="text-gray-400">Assessor Name</TableHead>
                    <TableHead className="text-gray-400">Company</TableHead>
                    <TableHead className="text-gray-400">Claims Assessed</TableHead>
                    <TableHead className="text-gray-400">Routing Concentration</TableHead>
                    <TableHead className="text-gray-400">Cost Suppression</TableHead>
                    <TableHead className="text-gray-400">Collusion Flag</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assessors.isLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-gray-500 py-8">Loading...</TableCell></TableRow>
                  ) : (assessors.data ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-gray-500 py-8">No assessors recorded yet. Assessors are added automatically when assessments are processed.</TableCell></TableRow>
                  ) : (assessors.data ?? []).map((a: any) => (
                    <TableRow key={a.id} className="border-[#1e2d45] hover:bg-[#1e2d45]/30">
                      <TableCell className="text-white font-medium">{a.entity_name}</TableCell>
                      <TableCell className="text-gray-300">{a.company_name ?? '—'}</TableCell>
                      <TableCell className="text-white">{a.total_claims_assessed}</TableCell>
                      <TableCell className="text-white">{a.routing_concentration_score != null ? `${Number(a.routing_concentration_score).toFixed(1)}%` : '—'}</TableCell>
                      <TableCell className="text-white">{a.cost_suppression_claim_count ?? 0} claims</TableCell>
                      <TableCell>
                        {a.collusion_suspected ? (
                          <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">Suspected</Badge>
                        ) : (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Clear</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── PANEL BEATERS ── */}
        <TabsContent value="panelbeaters">
          <Card className="bg-[#0f1623] border-[#1e2d45]">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-300">Panel Beater Registry</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e2d45]">
                    <TableHead className="text-gray-400">Company Name</TableHead>
                    <TableHead className="text-gray-400">Region</TableHead>
                    <TableHead className="text-gray-400">Claims Repaired</TableHead>
                    <TableHead className="text-gray-400">Avg Quote vs True Cost</TableHead>
                    <TableHead className="text-gray-400">Structural Gaps</TableHead>
                    <TableHead className="text-gray-400">Avg Fraud Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {panelBeaters.isLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-gray-500 py-8">Loading...</TableCell></TableRow>
                  ) : (panelBeaters.data ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-gray-500 py-8">No panel beaters recorded yet. Panel beaters are added automatically when quotes are processed.</TableCell></TableRow>
                  ) : (panelBeaters.data ?? []).map((p: any) => (
                    <TableRow key={p.id} className="border-[#1e2d45] hover:bg-[#1e2d45]/30">
                      <TableCell className="text-white font-medium">{p.entity_name}</TableCell>
                      <TableCell className="text-gray-300">{p.region ?? '—'}</TableCell>
                      <TableCell className="text-white">{p.total_claims_repaired}</TableCell>
                      <TableCell>
                        <span className={Number(p.avg_quote_vs_true_cost_pct) < 80 ? "text-red-400 font-semibold" : "text-white"}>
                          {p.avg_quote_vs_true_cost_pct != null ? `${Number(p.avg_quote_vs_true_cost_pct).toFixed(1)}%` : '—'}
                        </span>
                      </TableCell>
                      <TableCell className={Number(p.structural_gap_count) >= 3 ? "text-orange-400 font-semibold" : "text-white"}>
                        {p.structural_gap_count ?? 0}
                      </TableCell>
                      <TableCell className="text-white">{p.avg_fraud_score_on_claims ? `${Number(p.avg_fraud_score_on_claims).toFixed(1)}%` : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── DRIVERS ── */}
        <TabsContent value="drivers">
          <Card className="bg-[#0f1623] border-[#1e2d45]">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-300">Driver Registry</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e2d45]">
                    <TableHead className="text-gray-400">Driver Name</TableHead>
                    <TableHead className="text-gray-400">Licence Number</TableHead>
                    <TableHead className="text-gray-400">ID Number</TableHead>
                    <TableHead className="text-gray-400">Claims as Driver</TableHead>
                    <TableHead className="text-gray-400">Claims as Claimant</TableHead>
                    <TableHead className="text-gray-400">Address Changes</TableHead>
                    <TableHead className="text-gray-400">Licence Expiry</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drivers.isLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-gray-500 py-8">Loading...</TableCell></TableRow>
                  ) : (drivers.data ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-gray-500 py-8">No drivers recorded yet. Drivers are added automatically when licence photos are processed.</TableCell></TableRow>
                  ) : (drivers.data ?? []).map((d: any) => (
                    <TableRow key={d.id} className="border-[#1e2d45] hover:bg-[#1e2d45]/30">
                      <TableCell className="text-white font-medium">{d.entity_name}</TableCell>
                      <TableCell className="text-gray-300 font-mono text-xs">{d.licence_number ?? '—'}</TableCell>
                      <TableCell className="text-gray-300 font-mono text-xs">{d.id_number ?? '—'}</TableCell>
                      <TableCell className={Number(d.total_claims_as_driver) >= 3 ? "text-orange-400 font-semibold" : "text-white"}>
                        {d.total_claims_as_driver ?? 0}
                      </TableCell>
                      <TableCell className={Number(d.total_claims_as_claimant) >= 2 ? "text-yellow-400 font-semibold" : "text-white"}>
                        {d.total_claims_as_claimant ?? 0}
                      </TableCell>
                      <TableCell className={Number(d.address_change_count) >= 2 ? "text-red-400 font-semibold" : "text-white"}>
                        {d.address_change_count ?? 0}
                      </TableCell>
                      <TableCell>
                        {d.licence_expiry_date ? (
                          <span className={new Date(d.licence_expiry_date) < new Date() ? "text-red-400 font-semibold" : "text-gray-300"}>
                            {new Date(d.licence_expiry_date).toLocaleDateString()}
                          </span>
                        ) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── HOTSPOTS ── */}
        <TabsContent value="hotspots">
          <Card className="bg-[#0f1623] border-[#1e2d45]">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-300">Accident Hotspot Clusters</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e2d45]">
                    <TableHead className="text-gray-400">Location</TableHead>
                    <TableHead className="text-gray-400">Cluster Type</TableHead>
                    <TableHead className="text-gray-400">Claims</TableHead>
                    <TableHead className="text-gray-400">Avg Fraud Score</TableHead>
                    <TableHead className="text-gray-400">Max Fraud Score</TableHead>
                    <TableHead className="text-gray-400">Time Span</TableHead>
                    <TableHead className="text-gray-400">Risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clusters.isLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-gray-500 py-8">Loading...</TableCell></TableRow>
                  ) : (clusters.data ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-gray-500 py-8">No hotspot clusters yet. Clusters are generated nightly once 3+ claims share the same location.</TableCell></TableRow>
                  ) : (clusters.data ?? []).map((c: any) => (
                    <TableRow key={c.id} className="border-[#1e2d45] hover:bg-[#1e2d45]/30">
                      <TableCell className="text-white font-medium max-w-xs truncate">{c.location_description}</TableCell>
                      <TableCell className="text-gray-300 capitalize">{c.hotspot_type?.replace(/_/g, ' ') ?? '—'}</TableCell>
                      <TableCell className="text-white font-semibold">{c.claim_count}</TableCell>
                      <TableCell className="text-white">{c.avg_fraud_score ? `${Number(c.avg_fraud_score).toFixed(1)}%` : '—'}</TableCell>
                      <TableCell className={Number(c.max_fraud_score) >= 60 ? "text-red-400 font-semibold" : "text-white"}>
                        {c.max_fraud_score ? `${Number(c.max_fraud_score).toFixed(1)}%` : '—'}
                      </TableCell>
                      <TableCell className="text-gray-400 text-xs">{c.time_span_days != null ? `${c.time_span_days} days` : '—'}</TableCell>
                      <TableCell><RiskBadge level={c.risk_level} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ML ANOMALIES ── */}
        <TabsContent value="ml">
          <Card className="bg-[#0f1623] border-[#1e2d45]">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-300">ML Anomaly Detection — Isolation Forest</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e2d45]">
                    <TableHead className="text-gray-400">Entity Name</TableHead>
                    <TableHead className="text-gray-400">Type</TableHead>
                    <TableHead className="text-gray-400">Anomaly Score</TableHead>
                    <TableHead className="text-gray-400">Status</TableHead>
                    <TableHead className="text-gray-400">Key Features</TableHead>
                    <TableHead className="text-gray-400">Model Version</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {anomalies.isLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-gray-500 py-8">Loading...</TableCell></TableRow>
                  ) : (anomalies.data ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-gray-500 py-8">No ML anomaly scores yet. Run the Phase 1 ML batch job once 5+ entities exist per type.</TableCell></TableRow>
                  ) : (anomalies.data ?? []).map((a: any) => {
                    let features: Record<string, any> = {};
                    try { features = JSON.parse(a.feature_vector_json ?? '{}'); } catch {}
                    return (
                      <TableRow key={a.id} className="border-[#1e2d45] hover:bg-[#1e2d45]/30">
                        <TableCell className="text-white font-medium">{a.entity_name}</TableCell>
                        <TableCell className="text-gray-300 capitalize">{a.entity_type?.replace(/_/g, ' ')}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-[#1e2d45] rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${Number(a.anomaly_score) > 0.7 ? 'bg-red-500' : Number(a.anomaly_score) > 0.5 ? 'bg-orange-500' : 'bg-green-500'}`}
                                style={{ width: `${Math.min(100, Number(a.anomaly_score) * 100)}%` }}
                              />
                            </div>
                            <span className="text-white text-xs">{(Number(a.anomaly_score) * 100).toFixed(0)}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {a.is_anomaly ? (
                            <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Anomaly</Badge>
                          ) : (
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Normal</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-gray-400">
                          {Object.entries(features).slice(0, 2).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ')}
                        </TableCell>
                        <TableCell className="text-gray-400 text-xs">{a.model_version ?? '1.0'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
