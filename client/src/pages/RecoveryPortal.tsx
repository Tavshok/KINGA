import InsurerPortalLayout from "@/components/InsurerPortalLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { Scale, ClipboardList, Search, Activity, Send, Gavel, CheckSquare, Archive, AlertCircle } from "lucide-react";
import { useLocation } from "wouter";

const STATUS_CARDS = [
  { label: "Pending Review",       tab: "pending",       icon: ClipboardList, color: "text-blue-400",    bg: "bg-blue-500/10",    description: "New cases awaiting officer assessment" },
  { label: "Under Investigation",  tab: "investigation", icon: Search,        color: "text-amber-400",   bg: "bg-amber-500/10",   description: "Liability not yet determined" },
  { label: "Open Cases",           tab: "open",          icon: Activity,      color: "text-teal-400",    bg: "bg-teal-500/10",    description: "Ready for demand action" },
  { label: "Demand Sent",          tab: "demand-sent",   icon: Send,          color: "text-violet-400",  bg: "bg-violet-500/10",  description: "Awaiting third-party response" },
  { label: "Disputed / Legal",     tab: "legal",         icon: Gavel,         color: "text-rose-400",    bg: "bg-rose-500/10",    description: "In dispute or referred to attorneys" },
  { label: "Settled",              tab: "settled",       icon: CheckSquare,   color: "text-emerald-400", bg: "bg-emerald-500/10", description: "Full or partial recovery achieved" },
  { label: "Archived",             tab: "archived",      icon: Archive,       color: "text-slate-400",   bg: "bg-slate-500/10",   description: "Low-RPS cases not actioned" },
];

export default function RecoveryPortal() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  return (
    <InsurerPortalLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <Scale className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Recovery Dashboard</h1>
            <p className="text-sm text-muted-foreground">Subrogation &amp; third-party recovery case management</p>
          </div>
        </div>

        {/* Info banner */}
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 flex gap-3">
          <AlertCircle className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-emerald-400">Recovery module — Phase 2 coming soon.</span>{" "}
            The recovery case management system is currently being built. Once deployed, this dashboard will display
            your full recovery queue, case statuses, prescription countdowns, and AI-generated demand letters.
            All settled claims with recoverable third-party liability will automatically appear here.
          </div>
        </div>

        {/* Status grid */}
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Case Queues</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {STATUS_CARDS.map((card) => (
              <button
                key={card.tab}
                onClick={() => navigate(`/insurer-portal/recovery?tab=${card.tab}`)}
                className="rounded-lg border border-border p-4 text-left hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-colors"
              >
                <div className={`inline-flex p-2 rounded-lg ${card.bg} mb-3`}>
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                </div>
                <div className="font-medium text-sm text-foreground">{card.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{card.description}</div>
                <div className="text-lg font-bold text-muted-foreground/40 mt-2">—</div>
              </button>
            ))}
          </div>
        </div>

        {/* KPI placeholders */}
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Recovery KPIs</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total Quantum", sub: "Under recovery" },
              { label: "Recovery Rate", sub: "Last 12 months" },
              { label: "Avg. Days to Settle", sub: "Closed cases" },
              { label: "Approaching Prescription", sub: "Within 6 months" },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-lg border border-border p-4">
                <div className="text-xs text-muted-foreground">{kpi.sub}</div>
                <div className="text-2xl font-bold text-muted-foreground/30 mt-1">—</div>
                <div className="text-sm font-medium text-foreground mt-1">{kpi.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </InsurerPortalLayout>
  );
}
