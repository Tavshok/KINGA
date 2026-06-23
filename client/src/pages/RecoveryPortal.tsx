import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Scale, ClipboardList, Search, Activity, Send, Gavel, CheckSquare, Archive, TrendingUp, Clock, DollarSign, AlertTriangle, ChevronRight, RefreshCw, Building2, Download } from "lucide-react";
import { useLocation } from "wouter";
import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { SLADeadlineChip } from "@/components/portal/SLADeadlineChip";
import { KingaPortalShell, PortalKPI, type PortalAlert } from "@/components/KingaPortalShell";
import { PortalHeroBand, ProtoAlertBar } from "@/components/PortalHeroBand";

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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCase, setSelectedCase] = useState<any>(null);
  const displayedCases = searchQuery
    ? cases.filter((c: any) =>
        (c.claimNumber ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.thirdPartyName ?? '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : cases;

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
    <div className="min-h-screen" style={{ background: '#F7F8F6', fontFamily: 'Inter, sans-serif' }}>
      <PortalHeroBand
        portalName="Recovery Portal"
        title="Recovery Dashboard"
        subtitle="Subrogation & third-party recovery case management"
        actions={[
          { label: 'Refresh', icon: <RefreshCw className="h-3 w-3" />, onClick: () => refetchKPIs() },
          { label: 'Export Report', icon: <Download className="h-3 w-3" />, primary: true },
        ]}
        kpis={[
          { label: 'Total Quantum', value: kpisLoading ? '—' : fmtCurrency(kpis?.totalSettlementAmount ?? 0), delta: 'Settlement value', up: null, headline: true },
          { label: 'Recovery Rate', value: kpisLoading ? '—' : `${kpis?.recoveryRate ?? 0}%`, delta: 'Of total quantum', up: (kpis?.recoveryRate ?? 0) >= 50 },
          { label: 'Total Recovered', value: kpisLoading ? '—' : fmtCurrency(kpis?.totalRecovered ?? 0), delta: 'Collected', up: true },
          { label: 'Approaching Deadline', value: kpisLoading ? '—' : (kpis?.approachingDeadlines ?? 0), delta: 'Within 90 days', up: false },
        ]}
      />
      <ProtoAlertBar
        alerts={[
          { count: kpis?.approachingDeadlines ?? 0, label: 'recovery case(s) approaching 90-day deadline', severity: 'red', onClick: () => setActiveTab('approaching') },
          { count: kpis?.pendingReview ?? kpis?.open ?? 0, label: 'recovery case(s) pending action', severity: 'amber', onClick: () => setActiveTab(null) },
        ]}
        ctaLabel="View all alerts"
      />
      {/* ── BODY ── */}
      <div className="p11-body">
        <div className="p11-body-2col">
          {/* ── MAIN COLUMN ── */}
          <div>
            {/* Recovery Cases Table */}
            <div className="p11-card">
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <Scale style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                  Recovery Cases
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="Search cases…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ fontSize: 12, padding: '4px 10px', border: '1px solid var(--line)', borderRadius: 4, outline: 'none', width: 160 }}
                  />
                  <button
                    onClick={() => setActiveTab(null)}
                    style={{ fontSize: 11, color: 'var(--g-600)', background: 'none', border: '1px solid var(--g-300)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setActiveTab('approaching')}
                    style={{ fontSize: 11, color: 'var(--red)', background: 'none', border: '1px solid var(--red)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}
                  >
                    Approaching Deadline
                  </button>
                </div>
              </div>
              <div className="p11-card-body" style={{ padding: 0 }}>
                {casesLoading ? (
                  <div style={{ padding: '16px 20px' }}>
                    {[1,2,3].map(i => <div key={i} style={{ height: 48, background: '#F3F4F6', borderRadius: 6, marginBottom: 8 }} />)}
                  </div>
                ) : displayedCases.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 20px', color: 'var(--muted)', fontSize: 13 }}>No recovery cases found</div>
                ) : (
                  <table className="p11-table">
                    <thead>
                      <tr>
                        <th>Claim #</th>
                        <th>Third Party</th>
                        <th>Quantum</th>
                        <th>RPS</th>
                        <th>Deadline</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedCases.map((rc: any) => {
                        const rps = rc.recoveryPotentialScore ?? 0;
                        const rpsColor = rps >= 70 ? 'var(--green)' : rps >= 40 ? 'var(--amber)' : 'var(--red)';
                        return (
                          <tr key={rc.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedCase(rc)}>
                            <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--ink)', fontSize: 12 }}>
                              {rc.claimNumber ?? `CLM-${String(rc.id).slice(0, 8).toUpperCase()}`}
                            </td>
                            <td style={{ color: 'var(--muted)', fontSize: 12 }}>{rc.thirdPartyName ?? '—'}</td>
                            <td style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 12 }}>
                              {rc.approvedSettlementAmount ? fmtCurrency(rc.approvedSettlementAmount) : '—'}
                            </td>
                            <td>
                              <span style={{ fontSize: 12, fontWeight: 700, color: rpsColor }}>{rps}</span>
                            </td>
                            <td>
                              <SLADeadlineChip deadline={rc.recoveryDeadline} warnOnly={false} showOk={true} />
                            </td>
                            <td>
                              <span className={`p11-badge ${rc.status === 'settled' ? 'green' : rc.status === 'disputed' ? 'red' : 'amber'}`}>
                                {rc.status?.replace(/_/g, ' ') ?? 'Open'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* ── SIDEBAR ── */}
          <div className="p11-sidebar">
            {/* Attention Required */}
            <div className="p11-card">
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <AlertTriangle style={{ width: 14, height: 14, color: 'var(--amber)' }} />
                  Attention Required
                </div>
              </div>
              <div className="p11-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'Approaching Deadline', value: kpis?.approachingDeadlines ?? 0, severity: 'red' as const },
                  { label: 'Pending Action', value: kpis?.pendingReview ?? kpis?.open ?? 0, severity: 'amber' as const },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: item.severity === 'red' ? '#FDF0F0' : '#FFF8E6', border: `1px solid ${item.severity === 'red' ? '#E8B8B8' : '#E8C97A'}`, borderRadius: 6 }}>
                    <span className={`p11-badge ${item.severity}`}>{item.value}</span>
                    <span style={{ fontSize: 12, color: 'var(--ink)' }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recovery Performance */}
            <div className="p11-card">
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <TrendingUp style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                  Recovery Performance
                </div>
              </div>
              <div className="p11-card-body">
                {[
                  { label: 'Total Quantum', value: kpisLoading ? '—' : fmtCurrency(kpis?.totalSettlementAmount ?? 0) },
                  { label: 'Total Recovered', value: kpisLoading ? '—' : fmtCurrency(kpis?.totalRecovered ?? 0) },
                  { label: 'Recovery Rate', value: kpisLoading ? '—' : `${kpis?.recoveryRate ?? 0}%` },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{item.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Insurer Intelligence */}
            <div className="p11-card">
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <Building2 style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                  Insurer Intelligence
                </div>
              </div>
              <div className="p11-card-body" style={{ padding: 0 }}>
                <InsurerIntelligencePanel />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
function InsurerIntelligencePanel() {
  const { data, isLoading } = trpc.recovery.getInsurerIntelligence.useQuery();
  if (isLoading || !data || data.length === 0) return null;
  return (
    <div className="rounded-lg p-5" style={{ border: '1px solid #E5E7EB', background: '#FFFFFF' }}>
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
