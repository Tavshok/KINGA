/**
 * VehiclePassportPanel
 * ─────────────────────
 * Epic 4 — Vehicle Passport intelligence panel.
 * Renders the full passport for a vehicle identified by vehicleRegistryId.
 * Used in: VehicleRegistry detail view (Passport tab), EngineerInspectionDetail (Vehicle Passport tab).
 */

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  BookOpen,
  Car,
  Clock,
  Shield,
  ShieldAlert,
  TrendingUp,
  Zap,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(cents: number | null | undefined): string {
  if (!cents) return "—";
  return `$${(Number(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

function riskLevelColor(level: string | null | undefined): string {
  switch (level) {
    case "critical": return "bg-red-700 text-white";
    case "high": return "bg-red-500 text-white";
    case "elevated": return "bg-orange-500 text-white";
    case "moderate": return "bg-amber-500 text-white";
    case "low": return "bg-green-600 text-white";
    default: return "bg-gray-600 text-white";
  }
}

function renewalRiskColor(score: number | null | undefined): string {
  if (!score) return "text-gray-400";
  if (score >= 65) return "text-red-400";
  if (score >= 50) return "text-orange-400";
  if (score >= 35) return "text-amber-400";
  return "text-green-400";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-gray-800 last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs font-medium text-gray-100">{value}</span>
    </div>
  );
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-xs font-semibold text-gray-400 flex items-center gap-2 uppercase tracking-wide">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {children}
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface VehiclePassportPanelProps {
  /** Preferred: direct registry ID lookup */
  vehicleRegistryId?: number;
  /** Fallback: look up by registration plate (uses getPassportByRegistration) */
  vehicleRegistration?: string;
}

export function VehiclePassportPanel({ vehicleRegistryId, vehicleRegistration }: VehiclePassportPanelProps) {
  // ID-based queries (enabled only when vehicleRegistryId is provided)
  const byId = trpc.vehiclePassport.getPassport.useQuery(
    { vehicleRegistryId: vehicleRegistryId! },
    { staleTime: 5 * 60 * 1000, enabled: !!vehicleRegistryId }
  );
  // Registration-based query (enabled only when no ID is available)
  const byReg = trpc.vehiclePassport.getPassportByRegistration.useQuery(
    { registrationNumber: vehicleRegistration! },
    { staleTime: 5 * 60 * 1000, enabled: !vehicleRegistryId && !!vehicleRegistration }
  );
  const { data: passport, isLoading, error } = vehicleRegistryId ? byId : byReg;

  // Resolved registry ID (for fraud/timeline sub-queries)
  const resolvedId: number | undefined =
    vehicleRegistryId ??
    (byReg.data as any)?.vehicle?.id ??
    undefined;

  const { data: fraudData } = trpc.vehiclePassport.getFraudSignals.useQuery(
    { vehicleRegistryId: resolvedId! },
    { staleTime: 5 * 60 * 1000, enabled: !!resolvedId }
  );
  const { data: timeline } = trpc.vehiclePassport.getTimeline.useQuery(
    { vehicleRegistryId: resolvedId!, limit: 10 },
    { staleTime: 5 * 60 * 1000, enabled: !!resolvedId }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        <span className="ml-3 text-sm text-gray-400">Loading passport…</span>
      </div>
    );
  }

  if (error || !passport) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Car className="mx-auto h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm">Vehicle passport unavailable.</p>
        {error && <p className="text-xs mt-1 text-red-400">{error.message}</p>}
      </div>
    );
  }

  const { intelligence, renewalRisk } = passport;
  // renewalRisk shape: { scoreValue, scoreLabel, confidenceLevel, factors }
  const rrScore = renewalRisk?.scoreValue ?? null;
  const rrLabel = renewalRisk?.scoreLabel ?? null;

  return (
    <div className="space-y-4">
      {/* Header band */}
      <div className="flex items-center gap-3 flex-wrap">
        <Badge className={riskLevelColor(intelligence?.riskLevel)}>
          {(intelligence?.riskLevel ?? "unknown").toUpperCase()} RISK
        </Badge>
        <span className="text-xs text-gray-400">
          Passport v{passport.dataVersion} · Generated {fmtDate(passport.generatedAt)}
        </span>
        {fraudData && fraudData.totalAlerts > 0 && (
          <Badge className="bg-red-900 border border-red-700 text-red-300 text-xs">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {fraudData.totalAlerts} fraud alert{fraudData.totalAlerts !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* 3-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Column 1: Intelligence Summary */}
        <SectionCard title="Intelligence Summary" icon={<Shield className="h-3.5 w-3.5" />}>
          <div className="space-y-0">
            <StatRow label="Total Claims" value={intelligence?.totalClaims ?? "—"} />
            <StatRow label="Repeat Zone Claims" value={intelligence?.repeatZoneCount ?? 0} />
            <StatRow label="Fraud Alerts" value={intelligence?.fraudAlertCount ?? 0} />
            <StatRow label="Avg Confidence" value={
              intelligence?.avgConfidenceScore != null
                ? `${Math.round(Number(intelligence.avgConfidenceScore))}%`
                : "—"
            } />
            <StatRow label="Total Settlement" value={fmt(intelligence?.totalSettlementCents)} />
            <StatRow label="Last Claim" value={fmtDate(intelligence?.lastClaimDate)} />
          </div>
        </SectionCard>

        {/* Column 2: Renewal Risk */}
        <SectionCard title="Predictive Renewal Risk" icon={<TrendingUp className="h-3.5 w-3.5" />}>
          {renewalRisk ? (
            <div className="space-y-3">
              <div className="text-center py-2">
                <div className={`text-4xl font-bold ${renewalRiskColor(rrScore)}`}>
                  {rrScore ?? "—"}
                </div>
                <div className="text-xs text-gray-400 mt-1">Renewal Risk Score</div>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${(rrScore ?? 0) >= 65 ? "bg-red-500" : (rrScore ?? 0) >= 50 ? "bg-orange-500" : (rrScore ?? 0) >= 35 ? "bg-amber-500" : "bg-green-500"}`}
                  style={{ width: `${rrScore ?? 0}%` }}
                />
              </div>
              <div className="space-y-0">
                <StatRow label="Risk Label" value={
                  <Badge className={riskLevelColor(rrLabel)} style={{ fontSize: 10 }}>
                    {(rrLabel ?? "unknown").toUpperCase().replace(/_/g, ' ')}
                  </Badge>
                } />
                <StatRow label="Confidence" value={renewalRisk.confidenceLevel != null ? `${renewalRisk.confidenceLevel}%` : "—"} />
              </div>
              {renewalRisk.factors && (
                <div className="mt-2">
                  <div className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Risk Factors</div>
                  <div className="space-y-1">
                    {Object.entries(renewalRisk.factors).slice(0, 5).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs">
                        <span className="text-gray-300 capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                        <span className="text-gray-400">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-500 text-center py-4">No renewal risk data</p>
          )}
        </SectionCard>

        {/* Column 3: Fraud Signals */}
        <SectionCard title="Fraud Signals" icon={<ShieldAlert className="h-3.5 w-3.5" />}>
          {fraudData && (fraudData.totalSignals > 0 || fraudData.totalAlerts > 0) ? (
            <div className="space-y-2">
              <div className="flex gap-3 mb-2">
                <div className="text-center flex-1">
                  <div className="text-2xl font-bold text-orange-400">{fraudData.totalSignals}</div>
                  <div className="text-xs text-gray-400">Signals</div>
                </div>
                <div className="text-center flex-1">
                  <div className="text-2xl font-bold text-red-400">{fraudData.totalAlerts}</div>
                  <div className="text-xs text-gray-400">Alerts</div>
                </div>
              </div>
              {fraudData.alerts.slice(0, 3).map((a: any) => (
                <div key={a.id} className="bg-red-900/20 border border-red-800/50 rounded p-2">
                  <div className="flex items-center gap-1 mb-0.5">
                    <AlertTriangle className="h-3 w-3 text-red-400 flex-shrink-0" />
                    <span className="text-xs font-medium text-red-300 capitalize">
                      {a.alertType?.replace(/_/g, " ") ?? "Alert"}
                    </span>
                    <Badge className="ml-auto text-[10px] bg-red-800 text-red-200 capitalize">
                      {a.alertSeverity}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-400 leading-snug">{a.alertDescription}</p>
                </div>
              ))}
              {fraudData.signals.slice(0, 3).map((s: any) => (
                <div key={s.id} className="bg-orange-900/20 border border-orange-800/50 rounded p-2">
                  <div className="flex items-center gap-1">
                    <Zap className="h-3 w-3 text-orange-400 flex-shrink-0" />
                    <span className="text-xs text-orange-300 capitalize">
                      {s.signalLabel ?? s.signalType?.replace(/_/g, " ")}
                    </span>
                    <span className="ml-auto text-xs text-gray-400">conf {s.confidence ?? "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <Shield className="mx-auto h-8 w-8 text-green-600 mb-2" />
              <p className="text-xs text-green-400">No fraud signals detected</p>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Timeline */}
      {timeline && timeline.events && timeline.events.length > 0 && (
        <SectionCard title="Vehicle Timeline" icon={<Clock className="h-3.5 w-3.5" />}>
          <div className="relative pl-4">
            <div className="absolute left-1.5 top-0 bottom-0 w-px bg-gray-700" />
            <div className="space-y-3">
              {timeline.events.map((event: any, i: number) => (
                <div key={i} className="relative">
                  <div className="absolute -left-3 top-1.5 w-2 h-2 rounded-full bg-blue-500 border border-gray-900" />
                  <div className="text-xs">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-gray-200 font-medium capitalize">
                        {event.eventType?.replace(/_/g, " ") ?? "Event"}
                      </span>
                      <span className="text-gray-500 ml-auto">{fmtDate(event.eventDate)}</span>
                    </div>
                    {event.description && (
                      <p className="text-gray-400 leading-snug">{event.description}</p>
                    )}
                    <span className="text-gray-600 text-[10px] capitalize">
                      Source: {event.sourceTable?.replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      )}

      {/* Data Sources footnote */}
      <div className="flex items-center gap-1.5 text-[10px] text-gray-600 pt-1">
        <BookOpen className="h-3 w-3" />
        <span>
          Sources: vehicle_registry · claims · vehicle_damage_history · cross_claim_signals · fraud_alerts · inspections · claim_confidence_scores
        </span>
      </div>
    </div>
  );
}
