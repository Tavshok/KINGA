#!/usr/bin/env python3
"""T10: Migrate RecoveryPortal from InsurerPortalLayout+PortalHeader to KingaPortalShell+PortalKPIStrip"""

with open("client/src/pages/RecoveryPortal.tsx", "r") as f:
    lines = f.readlines()

content = "".join(lines)

# ── Step 1: Replace line 1 (InsurerPortalLayout import) ──────────────────────
# Line 1: import InsurerPortalLayout from "@/components/InsurerPortalLayout";
# Line 11: import { PortalHeader } from "@/components/KingaPortalShell";
# Replace both with a single KingaPortalShell default import

content = content.replace(
    'import InsurerPortalLayout from "@/components/InsurerPortalLayout";\n',
    '',
    1
)

content = content.replace(
    'import { PortalHeader } from "@/components/KingaPortalShell";',
    'import KingaPortalShell, { PortalKPI } from "@/components/KingaPortalShell";',
    1
)

# Remove AlertCircle and Building2 from lucide imports (no longer needed after migration)
content = content.replace(
    'import { Scale, ClipboardList, Search, Activity, Send, Gavel, CheckSquare, Archive, AlertCircle, TrendingUp, Clock, DollarSign, AlertTriangle, ChevronRight, RefreshCw, Building2 } from "lucide-react";',
    'import { Scale, ClipboardList, Search, Activity, Send, Gavel, CheckSquare, Archive, TrendingUp, Clock, DollarSign, AlertTriangle, ChevronRight, RefreshCw } from "lucide-react";',
    1
)

# ── Step 2: Replace the return opening + PortalHeader ────────────────────────
old_return_header = '''  return (
    <InsurerPortalLayout>
      <div className="p-6 space-y-6">
        {/* Header — KingaPortalShell Standard Header */}
        <PortalHeader
          icon={<Scale size={22} />}
          title="Recovery Dashboard"
          description="Subrogation & third-party recovery case management"
          live
          actions={
            <Button variant="ghost" size="sm" onClick={() => refetchKPIs()} className="gap-2 text-muted-foreground">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          }
        />'''

new_return_header = '''  // PortalKPI strip — maps the 4 recovery KPIs to the shared PortalKPIStrip format
  const portalKPIs: PortalKPI[] = [
    {
      label: "Total Quantum",
      value: kpisLoading ? "\\u2014" : fmtCurrency(kpis?.totalSettlementAmount ?? 0),
      icon: <DollarSign className="h-4 w-4" />,
      accent: "blue",
    },
    {
      label: "Recovery Rate",
      value: kpisLoading ? "\\u2014" : `${kpis?.recoveryRate ?? 0}%`,
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
      value: kpisLoading ? "\\u2014" : fmtCurrency(kpis?.totalRecovered ?? 0),
      icon: <CheckSquare className="h-4 w-4" />,
      accent: "teal",
    },
    {
      label: "Approaching Deadline",
      value: kpisLoading ? "\\u2014" : (kpis?.approachingDeadlines ?? 0),
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
      <div className="space-y-6">'''

if old_return_header in content:
    content = content.replace(old_return_header, new_return_header, 1)
    print("✅ Step 2: return header replaced")
else:
    print("❌ Step 2: return header NOT found — check whitespace")

# ── Step 3: Remove the KPI tiles block (lines 101–153) ───────────────────────
old_kpi_tiles = '''        {/* KPI tiles */}
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
                {kpisLoading ? <span className="text-muted-foreground/30">—</span> : fmtCurrency(kpis?.totalSettlementAmount ?? 0)}
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
              <div className="text-xl font-bold mt-1" style={{ color: "#3C7844" }}>
                {kpisLoading ? <span className="text-muted-foreground/30">—</span> : fmtCurrency(kpis?.totalRecovered ?? 0)}
              </div>
              <div className="text-sm font-medium text-muted-foreground mt-1">Total Recovered</div>
            </div>

            {/* Approaching Deadlines */}
            <div className={`rounded-lg border p-4 ${kpis && kpis.approachingDeadlines > 0 ? "border" : "border-border"}`}>
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
        </div>'''

if old_kpi_tiles in content:
    content = content.replace(old_kpi_tiles, '', 1)
    print("✅ Step 3: KPI tiles block removed")
else:
    print("❌ Step 3: KPI tiles block NOT found — check exact whitespace/quotes")
    # Debug: show a snippet around line 101
    for i, line in enumerate(content.split('\n')[98:108], start=99):
        print(f"  L{i}: {repr(line)}")

# ── Step 4: Replace closing InsurerPortalLayout with KingaPortalShell ────────
old_close = "      </div>\n    </InsurerPortalLayout>\n  );\n}"
new_close = "      </div>\n    </KingaPortalShell>\n  );\n}"

if old_close in content:
    content = content.replace(old_close, new_close, 1)
    print("✅ Step 4: closing tag replaced")
else:
    print("❌ Step 4: closing tag NOT found")

# ── Write back ────────────────────────────────────────────────────────────────
with open("client/src/pages/RecoveryPortal.tsx", "w") as f:
    f.write(content)

print("\nFinal checks:")
print("  InsurerPortalLayout:", "InsurerPortalLayout" in content)
print("  PortalHeader import:", "import { PortalHeader }" in content)
print("  KingaPortalShell:", "KingaPortalShell" in content)
print("  PortalKPI:", "PortalKPI" in content)
print("  portalKPIs:", "portalKPIs" in content)
print("  KPI tiles block:", "KPI tiles" in content)
print("  Line count:", content.count('\n'))
