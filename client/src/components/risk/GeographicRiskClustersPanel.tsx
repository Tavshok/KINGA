import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MapPin, AlertTriangle, TrendingUp, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { currencySymbol } from "@/lib/currency";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  analyticsFrom: string;
  analyticsTo: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const incidentTypeLabel = (t: string) =>
  t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function RiskBadge({ fraudRate }: { fraudRate: number }) {
  if (fraudRate >= 50) return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Critical</Badge>;
  if (fraudRate >= 30) return <Badge className="text-[10px] px-1.5 py-0 bg-orange-600 text-white">High</Badge>;
  if (fraudRate >= 15) return <Badge className="text-[10px] px-1.5 py-0 bg-amber-500 text-white">Medium</Badge>;
  return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-700 border-green-400">Low</Badge>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GeographicRiskClustersPanel({ analyticsFrom, analyticsTo }: Props) {
  const { data, isLoading, refetch } = trpc.claims.getGeographicRiskClusters.useQuery(
    { from: analyticsFrom, to: analyticsTo },
    { refetchOnWindowFocus: false }
  );

  const clusters = data?.clusters ?? [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <MapPin className="h-4 w-4 text-orange-500" />
            Geographic Risk Clustering
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            High-risk claim concentration by incident location — top {clusters.length} hotspots
            {data?.period && ` · ${data.period.from} to ${data.period.to}`}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary KPIs */}
      {data && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="border shadow-sm">
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground">Distinct Locations</p>
              <p className="text-2xl font-bold mt-0.5">{data.totalLocations}</p>
            </CardContent>
          </Card>
          <Card className="border shadow-sm">
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground">Critical Hotspots</p>
              <p className="text-2xl font-bold mt-0.5 text-red-600">
                {clusters.filter((c) => c.fraudRate >= 50).length}
              </p>
            </CardContent>
          </Card>
          <Card className="border shadow-sm">
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground">Avg Fraud Rate (top 20)</p>
              <p className="text-2xl font-bold mt-0.5 text-amber-600">
                {clusters.length > 0
                  ? `${Math.round(clusters.reduce((s, c) => s + c.fraudRate, 0) / clusters.length)}%`
                  : "—"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Clusters Table */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Hotspot Table
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              Loading geographic data…
            </div>
          ) : !data?.hasData || clusters.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground gap-2">
              <MapPin className="h-8 w-8 opacity-30" />
              <p>No incident location data in this period.</p>
              <p className="text-xs">Claims with a populated <code>incidentLocation</code> field will appear here.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="pl-4">Location</TableHead>
                  <TableHead className="text-right">Total Claims</TableHead>
                  <TableHead className="text-right">High-Risk</TableHead>
                  <TableHead className="text-right">Fraud Rate</TableHead>
                  <TableHead className="text-right">Avg Risk Score</TableHead>
                  <TableHead>Dominant Type</TableHead>
                  <TableHead className="text-right pr-4">Exposure</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clusters.map((c, i) => (
                  <TableRow key={c.location} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                    <TableCell className="pl-4 font-medium text-sm">
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                        {c.location}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm">{c.totalClaims}</TableCell>
                    <TableCell className="text-right text-sm font-medium text-red-600">{c.highRiskClaims}</TableCell>
                    <TableCell className="text-right">
                      <RiskBadge fraudRate={c.fraudRate} />
                      <span className="ml-1.5 text-xs text-muted-foreground">{c.fraudRate}%</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`text-sm font-medium ${c.avgFraudScore >= 70 ? "text-red-600" : c.avgFraudScore >= 40 ? "text-amber-600" : "text-green-600"}`}>
                        {c.avgFraudScore}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {incidentTypeLabel(c.dominantIncidentType)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right pr-4 text-sm text-muted-foreground">
                      {c.totalExposure > 0 ? `${currencySymbol(null)} ${c.totalExposure.toLocaleString()}` : "—"}
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
