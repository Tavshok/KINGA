import InsurerPortalLayout from "@/components/InsurerPortalLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Scale, ClipboardList, Search, Activity, Send, Gavel, CheckSquare, Archive, AlertCircle, TrendingUp, Clock, DollarSign, AlertTriangle, ChevronRight, RefreshCw } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Maps each status card tab to the DB status value(s) used in getCases
const STATUS_CARDS = [
  { label: "Pending Review",       tab: "pending",           dbStatus: "pending",           icon: ClipboardList, color: "text-blue-400",    bg: "bg-blue-500/10",    description: "New cases awaiting officer assessment" },
  { label: "Under Investigation",  tab: "investigation",     dbStatus: "under_investigation",icon: Search,        color: "text-amber-400",   bg: "bg-amber-500/10",   description: "Liability not yet determined" },
  { label: "Open Cases",           tab: "open",              dbStatus: "open",               icon: Activity,      color: "text-teal-400",    bg: "bg-teal-500/10",    description: "Ready for demand action" },
  { label: "Demand Sent",          tab: "demand-sent",       dbStatus: "demand_sent",        icon: Send,          color: "text-violet-400",  bg: "bg-violet-500/10",  description: "Awaiting third-party response" },
  { label: "Disputed / Legal",     tab: "legal",             dbStatus: "disputed_legal",     icon: Gavel,         color: "text-rose-400",    bg: "bg-rose-500/10",    description: "In dispute or referred to attorneys" },
  { label: "Settled",              tab: "settled",           dbStatus: "settled_full",       icon: CheckSquare,   color: "text-emerald-400", bg: "bg-emerald-500/10", description: "Full or partial recovery achieved" },
  { label: "Archived",             tab: "archived",          dbStatus: "archived",           icon: Archive,       color: "text-slate-400",   bg: "bg-slate-500/10",   description: "Low-RPS cases not actioned" },
];

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(amount);
}

export default function RecoveryPortal() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [repeatOffendersOnly, setRepeatOffendersOnly] = useState(false);

  // Live KPI data
  const { data: kpis, isLoading: kpisLoading, refetch: refetchKPIs } = trpc.recovery.getKPIs.useQuery(undefined, {
    refetchInterval: 60_000, // refresh every 60s
  });

  // Live case list for the selected status tab
  const { data: casesData, isLoading: casesLoading } = trpc.recovery.getCases.useQuery(
    {
      ...(activeTab ? { status: STATUS_CARDS.find(c => c.tab === activeTab)?.dbStatus } : {}),
      ...(repeatOffendersOnly ? { repeatOffendersOnly: true } : {}),
      page: 1,
      pageSize: 20,
    },
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

  return (
    <InsurerPortalLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Scale className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Recovery Dashboard</h1>
              <p className="text-sm text-muted-foreground">Subrogation &amp; third-party recovery case management</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetchKPIs()} className="gap-2 text-muted-foreground">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* Recovery deadline warning banner */}
        {kpis && kpis.approachingDeadlines > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-amber-400">
                {kpis.approachingDeadlines} case{kpis.approachingDeadlines > 1 ? "s" : ""} approaching recovery deadline
              </span>{" "}
              within 90 days. Review and action these cases to avoid losing recovery rights.
            </div>
          </div>
        )}

        {/* KPI tiles */}
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Recovery KPIs</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* Total Quantum */}
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <DollarSign className="h-3.5 w-3.5" />
                Under recovery
              </div>
              <div className="text-xl font-bold text-foreground mt-1">
                {kpisLoading ? <span className="text-muted-foreground/30">—</span> : formatCurrency(kpis?.totalSettlementAmount ?? 0)}
              </div>
              <div className="text-sm font-medium text-muted-foreground mt-1">Total Quantum</div>
            </div>

            {/* Recovery Rate */}
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <TrendingUp className="h-3.5 w-3.5" />
                Recovered vs quantum
              </div>
              <div className="text-xl font-bold text-foreground mt-1">
                {kpisLoading ? <span className="text-muted-foreground/30">—</span> : `${kpis?.recoveryRate ?? 0}%`}
              </div>
              <div className="text-sm font-medium text-muted-foreground mt-1">Recovery Rate</div>
            </div>

            {/* Total Recovered */}
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <CheckSquare className="h-3.5 w-3.5" />
                Amount recovered
              </div>
              <div className="text-xl font-bold text-emerald-400 mt-1">
                {kpisLoading ? <span className="text-muted-foreground/30">—</span> : formatCurrency(kpis?.totalRecovered ?? 0)}
              </div>
              <div className="text-sm font-medium text-muted-foreground mt-1">Total Recovered</div>
            </div>

            {/* Approaching Deadlines */}
            <div className={`rounded-lg border p-4 ${kpis && kpis.approachingDeadlines > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-border"}`}>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Clock className="h-3.5 w-3.5" />
                Within 90 days
              </div>
              <div className={`text-xl font-bold mt-1 ${kpis && kpis.approachingDeadlines > 0 ? "text-amber-400" : "text-foreground"}`}>
                {kpisLoading ? <span className="text-muted-foreground/30">—</span> : (kpis?.approachingDeadlines ?? 0)}
              </div>
              <div className="text-sm font-medium text-muted-foreground mt-1">Approaching Deadline</div>
            </div>
          </div>
        </div>

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
                      <div className="text-right">
                        <div className={`text-sm font-bold ${rpsColor}`}>{rc.recoveryPotentialScore}</div>
                        <div className="text-xs text-muted-foreground">RPS</div>
                      </div>
                      {rc.approvedSettlementAmount && (
                        <div className="text-right hidden sm:block">
                          <div className="text-sm font-medium text-foreground">{formatCurrency(rc.approvedSettlementAmount)}</div>
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
      </div>
    </InsurerPortalLayout>
  );
}
