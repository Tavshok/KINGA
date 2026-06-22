import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Scale, ClipboardList, Search, Activity, Send, Gavel, CheckSquare, Archive, TrendingUp, Clock, DollarSign, AlertTriangle, ChevronRight, RefreshCw, Building2 } from "lucide-react";
import { useLocation } from "wouter";
import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { SLADeadlineChip } from "@/components/portal/SLADeadlineChip";
import KingaPortalShell, { PortalKPI } from "@/components/KingaPortalShell";

// Maps each status card tab to the DB status value(s) used in getCases
const STATUS_CARDS = [
  { label: "Pending Review",       tab: "pending",           dbStatus: "pending_review",    icon: ClipboardList, color: "text-[#4878A8]",  bg: "bg-[#EEF4FB]",    description: "New cases awaiting officer assessment" },
  { label: "Under Investigation",  tab: "investigation",     dbStatus: "under_investigation",icon: Search,        color: "text-[#8A5C00]",  bg: "bg-[#FFF8E6]",   description: "Liability not yet determined" },
  { label: "Open Cases",           tab: "open",              dbStatus: "open",               icon: Activity,      color: "text-[#3C7844]",  bg: "bg-[#F0F7F2]",    description: "Ready for demand action" },
  { label: "Demand Sent",          tab: "demand-sent",       dbStatus: "demand_sent",        icon: Send,          color: "text-violet-400",  bg: "bg-violet-500/10",  description: "Awaiting third-party response" },
  { label: "Disputed / Legal",     tab: "legal",             dbStatus: "disputed_legal",     icon: Gavel,         color: "text-rose-400",    bg: "bg-rose-500/10",    description: "In dispute or referred to attorneys" },
  { label: "Settled",              tab: "settled",           dbStatus: "settled_full",       icon: CheckSquare,   color: "text-[#3C7844]",  bg: "bg-[#F0F7F2]", description: "Full or partial recovery achieved" },
  { label: "Archived",             tab: "archived",          dbStatus: "archived",           icon: Archive,       color: "text-slate-400",   bg: "bg-slate-500/10",   description: "Low-RPS cases not actioned" },
];

// formatCurrency is provided by useTenantCurrency hook — no local stub needed
// SLA deadline chip is provided by the shared SLADeadlineChip component (portal/SLADeadlineChip.tsx)

export default function RecoveryPortal() {
  const { user } = useAuth();
  const { fmt: fmtCurrency } = useTenantCurrency();
  const [, navigate] = useLocation();
  // Read ?tab= from URL so sidebar nav links pre-select the correct queue
  const initialTab = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('tab')
    : null;
  const [activeTab, setActiveTab] = useState<string | null>(initialTab);
  const [repeatOffendersOnly, setRepeatOffendersOnly] = useState(false);

  // Live KPI data
  const { data: kpis, isLoading: kpisLoading, refetch: refetchKPIs } = trpc.recovery.getKPIs.useQuery(undefined, {
    refetchInterval: 60_000, // refresh every 60s
  });

  // Stabilise query input with useMemo — spread operators in render create new
  // object references every render, causing tRPC to re-fetch infinitely.
  const casesQueryInput = useMemo(() => ({
    ...(activeTab ? { status: STATUS_CARDS.find(c => c.tab === activeTab)?.dbStatus } : {}),
    ...(repeatOffendersOnly ? { repeatOffendersOnly: true } : {}),
    page: 1 as const,
    pageSize: 20 as const,
  }), [activeTab, repeatOffendersOnly]);

  // Live case list for the selected status tab
  const { data: casesData, isLoading: casesLoading } = trpc.recovery.getCases.useQuery(
    casesQueryInput,
    { enabled: true, refetchInterval: 60_000 }
  );

  // Per-status counts derived from KPIs
  const statusCounts: Record<string, number> = {
    pending:       kpis?.pendingReview ?? 0,
    investigation: kpis?.underInvestigation ?? 0,
    open:          kpis?.open ?? 0,
    "demand-sent": kpis?.demandSent ?? 0,
    legal:         kpis?.disputedLegal ?? 0,
    settled:       kpis?.settled ?? 0,
    archived:      kpis?.archived ?? 0,
  };

  const cases = casesData ?? [];

  // PortalKPI strip — maps the 4 recovery KPIs to the shared PortalKPIStrip format
  const portalKPIs: PortalKPI[] = [
    {
      label: "Total Quantum",
      value: kpisLoading ? "\u2014" : fmtCurrency(kpis?.totalSettlementAmount ?? 0),
      icon: <DollarSign className="h-4 w-4" />,
      accent: "blue",
    },
    {
      label: "Recovery Rate",
      value: kpisLoading ? "\u2014" : `${kpis?.recoveryRate ?? 0}%`,
      icon: <TrendingUp className="h-4 w-4" />,
      accent: "green",
      trend: kpis ? {
        value: `${kpis.recoveryRate ?? 0}%`,
        direction: (kpis.recoveryRate ?? 0) >= 50 ? "up" : "down",
        positive: (kpis.recoveryRate ?? 0) >= 50,
      } : undefined,
    },
    {
      label: "Total Recovered",
      value: kpisLoading ? "\u2014" : fmtCurrency(kpis?.totalRecovered ?? 0),
      icon: <CheckSquare className="h-4 w-4" />,
      accent: "teal",
    },
    {
      label: "Approaching Deadline",
      value: kpisLoading ? "\u2014" : (kpis?.approachingDeadlines ?? 0),
      icon: <Clock className="h-4 w-4" />,
      accent: (kpis?.approachingDeadlines ?? 0) > 0 ? "amber" : "charcoal",
    },
  ];

  return (
    <KingaPortalShell
      icon={<Scale size={22} />}
      title="Recovery Dashboard"
      description="Subrogation & third-party recovery case management"
      live
      kpis={portalKPIs}
      actions={
        <Button variant="ghost" size="sm" onClick={() => refetchKPIs()} className="gap-2 text-muted-foreground">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      }
    >
      <div className="space-y-6">

        {/* Recovery deadline warning banner */}
        {kpis && kpis.approachingDeadlines > 0 && (
          <div className="rounded-lg border p-4 flex gap-3" style={{ borderColor: "#E8C97A", background: "#FFF8E6" }}>
            <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: "#8A5C00" }} />
            <div className="text-sm text-muted-foreground">
              <span className="font-medium" style={{ color: "#8A5C00" }}>
                {kpis.approachingDeadlines} case{kpis.approachingDeadlines > 1 ? "s" : ""} approaching recovery deadline
              </span>{" "}
              within 90 days. Review and action these cases to avoid losing recovery rights.
            </div>
          </div>
        )}



        {/* Status queue cards */}
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Case Queues</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {STATUS_CARDS.map((card) => {
              const count = statusCounts[card.tab];
              const isActive = activeTab === card.tab;
              return (
                <button
                  key={card.tab}
                  onClick={() => setActiveTab(isActive ? null : card.tab)}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    isActive
                      ? "border-emerald-500/50 bg-emerald-500/10"
                      : "border-border hover:border-emerald-500/30 hover:bg-emerald-500/5"
                  }`}
                >
                  <div className={`inline-flex p-2 rounded-lg ${card.bg} mb-3`}>
                    <card.icon className={`h-4 w-4 ${card.color}`} />
                  </div>
                  <div className="font-medium text-sm text-foreground">{card.label}</div>
                  <div className="text-xs text-muted-foreground mt-1">{card.description}</div>
                  <div className={`text-lg font-bold mt-2 ${kpisLoading ? "text-muted-foreground/30" : card.color}`}>
                    {kpisLoading ? "—" : count}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Case list — shown when a queue card is selected or by default */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {activeTab ? `${STATUS_CARDS.find(c => c.tab === activeTab)?.label} Cases` : "Recent Cases"}
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Repeat Offenders filter chip */}
              <button
                onClick={() => setRepeatOffendersOnly(v => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  repeatOffendersOnly
                    ? "bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30"
                    : "bg-transparent text-muted-foreground border-border hover:border-rose-500/40 hover:text-rose-300"
                }`}
              >
                <AlertTriangle className="h-3 w-3" />
                Repeat Offenders
                {repeatOffendersOnly && <span className="ml-0.5">×</span>}
              </button>
              {activeTab && (
                <button onClick={() => setActiveTab(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Clear queue filter
                </button>
              )}
            </div>
          </div>

          {casesLoading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => (
                <div key={i} className="rounded-lg border border-border p-4 animate-pulse">
                  <div className="h-4 bg-muted rounded w-1/3 mb-2" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : cases.length === 0 ? (
            <div className="rounded-lg border border-border p-8 text-center">
              <Scale className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {activeTab ? "No cases in this queue." : "No recovery cases yet. Cases are created automatically when claims are settled with third-party liability."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {cases.map((rc: any) => {
                const rpsColor = rc.recoveryPotentialScore >= 70 ? "text-emerald-400" : rc.recoveryPotentialScore >= 40 ? "text-amber-400" : "text-rose-400";
                const statusLabel = rc.status?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) ?? "—";
                return (
                  <button
                    key={rc.id}
                    onClick={() => navigate(`/insurer-portal/recovery/${rc.id}`)}
                    className="w-full rounded-lg border border-border p-4 text-left hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-colors flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-foreground">
                          {rc.claimNumber ?? `RC-${rc.id}`}
                        </span>
                        <Badge variant="outline" className="text-xs capitalize">
                          {statusLabel}
                        </Badge>
                        {rc.wrongedParty === "insured" && (
                          <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30">
                            Insured wronged
                          </Badge>
                        )}
                        {rc.isRepeatOffender && (
                          <Badge variant="outline" className="text-xs text-rose-400 border-rose-500/30 gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Repeat offender
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                        {rc.vehicleRegistration && <span>{rc.vehicleRegistration}</span>}
                        {rc.incidentDate && <span>{new Date(rc.incidentDate).toLocaleDateString("en-ZA")}</span>}
                        {rc.thirdPartyName && <span>3rd party: {rc.thirdPartyName}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <SLADeadlineChip deadline={rc.recoveryDeadline} warnOnly={false} showOk={true} />
                      <div className="text-right">
                        <div className={`text-sm font-bold ${rpsColor}`}>{rc.recoveryPotentialScore}</div>
                        <div className="text-xs text-muted-foreground">RPS</div>
                      </div>
                      {rc.approvedSettlementAmount && (
                        <div className="text-right hidden sm:block">
                          <div className="text-sm font-medium text-foreground">{fmtCurrency(rc.approvedSettlementAmount)}</div>
                          <div className="text-xs text-muted-foreground">Quantum</div>
                        </div>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Inter-Insurer Intelligence Panel */}
        <InsurerIntelligencePanel />
      </div>
    </KingaPortalShell>
  );
}

function InsurerIntelligencePanel() {
  const { data, isLoading } = trpc.recovery.getInsurerIntelligence.useQuery();
  if (isLoading || !data || data.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Building2 className="h-4 w-4 text-violet-400" />
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Third-Party Insurer Intelligence</h3>
        <span className="text-xs text-muted-foreground ml-1">— settlement &amp; dispute patterns across all cases</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left py-2 pr-4 text-xs text-muted-foreground font-medium">Insurer</th>
              <th className="text-center py-2 px-3 text-xs text-muted-foreground font-medium">Cases</th>
              <th className="text-center py-2 px-3 text-xs text-muted-foreground font-medium">Settlement Rate</th>
              <th className="text-center py-2 px-3 text-xs text-muted-foreground font-medium">Dispute Rate</th>
              <th className="text-center py-2 px-3 text-xs text-muted-foreground font-medium">Avg Days to Settle</th>
              <th className="text-center py-2 px-3 text-xs text-muted-foreground font-medium">Recovery Efficiency</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.insurer} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                <td className="py-2.5 pr-4 font-medium text-foreground">{row.insurer}</td>
                <td className="py-2.5 px-3 text-center text-muted-foreground">{row.totalCases}</td>
                <td className="py-2.5 px-3 text-center">
                  <span className={`font-semibold ${
                    row.settlementRate >= 70 ? 'text-emerald-400' :
                    row.settlementRate >= 40 ? 'text-amber-400' : 'text-rose-400'
                  }`}>{row.settlementRate}%</span>
                </td>
                <td className="py-2.5 px-3 text-center">
                  <span className={`font-semibold ${
                    row.disputeRate >= 40 ? 'text-rose-400' :
                    row.disputeRate >= 20 ? 'text-amber-400' : 'text-emerald-400'
                  }`}>{row.disputeRate}%</span>
                </td>
                <td className="py-2.5 px-3 text-center text-muted-foreground">
                  {row.avgSettlementDays != null ? `${row.avgSettlementDays}d` : '—'}
                </td>
                <td className="py-2.5 px-3 text-center">
                  <span className={`font-semibold ${
                    row.recoveryEfficiency >= 80 ? 'text-emerald-400' :
                    row.recoveryEfficiency >= 50 ? 'text-amber-400' : 'text-rose-400'
                  }`}>{row.recoveryEfficiency}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground mt-3">Based on all closed recovery cases. Settlement rate = settled ÷ total. Recovery efficiency = recovered amount ÷ approved settlement amount.</p>
    </div>
  );
}
