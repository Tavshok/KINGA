/**
 * EngineerDashboard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 1 — Sprint 2: Engineer Dashboard Transformation
 *
 * Project-first workspace using KingaPortalShell with:
 *   - KPI strip: Active Projects, Inspections Due, Pending Reports, Total Inspections
 *   - Tabs: My Projects (primary), Inspections, Assets, Intelligence, Reports
 *   - Recent activity feed
 *
 * Uses existing components: InspectionProjectsTab, EngineeringIntelligencePanel,
 * AssetPassportPanel — no new engines or duplicate workflows.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  KingaPortalShell,
  type PortalKPI,
  type PortalTab,
  type PortalAlert,
} from "@/components/KingaPortalShell";
import { InspectionProjectsTab } from "@/components/InspectionProjectsTab";
import { EngineeringIntelligencePanel } from "@/components/EngineeringIntelligencePanel";
import { AssetPassportPanel } from "@/components/AssetPassportPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  HardHat,
  Plus,
  ClipboardList,
  FolderOpen,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar,
  ChevronRight,
} from "lucide-react";

// ── Status badge helper ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    scheduled:             { label: "Scheduled",   color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
    assigned:              { label: "Assigned",    color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300" },
    in_progress:           { label: "In Progress", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
    evidence_capture:      { label: "Evidence",    color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
    measurements_complete: { label: "Measured",    color: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300" },
    ai_analysis:           { label: "KINGA Analysis", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
    engineer_review:       { label: "Review",      color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
    complete:              { label: "Complete",    color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
    cancelled:             { label: "Cancelled",   color: "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400" },
  };
  const s = map[status] ?? { label: status, color: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.color}`}>
      {s.label}
    </span>
  );
}

// ── Recent Activity Feed ───────────────────────────────────────────────────────

function RecentActivityFeed({ inspections }: { inspections: any[] }) {
  const [, setLocation] = useLocation();

  if (!inspections || inspections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ClipboardList className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">No inspections yet</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Create your first inspection to get started</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {inspections.map((insp: any) => (
        <div
          key={insp.id}
          className="flex items-center justify-between py-3 px-1 hover:bg-muted/30 rounded cursor-pointer transition-colors"
          onClick={() => setLocation(`/engineer/inspections/${insp.id}`)}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <ClipboardList className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{insp.referenceNumber ?? `INS-${insp.id}`}</p>
              <p className="text-xs text-muted-foreground truncate">
                {insp.vehicleRegistration ?? "No registration"} ·{" "}
                {insp.scheduledDate
                  ? new Date(insp.scheduledDate).toLocaleDateString()
                  : "No date set"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <StatusBadge status={insp.status} />
            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Inspections List Tab ───────────────────────────────────────────────────────

function InspectionsListTab() {
  const [, setLocation] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const { data, isLoading, error } = trpc.inspections.list.useQuery({
    status: statusFilter as any,
    page: 1,
    pageSize: 50,
  });

  const statuses = ["scheduled", "in_progress", "complete", "cancelled"];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant={!statusFilter ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter(undefined)}
        >
          All
        </Button>
        {statuses.map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(s)}
          >
            {s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          </Button>
        ))}
        <div className="ml-auto">
          <Button size="sm" onClick={() => setLocation("/engineer/inspections?create=1")}>
            <Plus className="h-4 w-4 mr-1" /> New Inspection
          </Button>
        </div>
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-10 w-10 text-destructive/70 mb-3" />
          <p className="text-sm font-medium text-foreground">Inspections could not be loaded</p>
          <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data?.inspections?.length ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No inspections found</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Reference</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Vehicle / Asset</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Scheduled</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.inspections.map((insp: any) => (
                <tr
                  key={insp.id}
                  className="hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => setLocation(`/engineer/inspections/${insp.id}`)}
                >
                  <td className="px-4 py-3 font-mono text-xs">{insp.inspectionRef ?? `INS-${insp.id}`}</td>
                  <td className="px-4 py-3">{insp.vehicleRegistration ?? insp.assetRef ?? "—"}</td>
                  <td className="px-4 py-3 capitalize">{insp.inspectionType?.replace("_", " ") ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={insp.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {insp.scheduledDate ? new Date(insp.scheduledDate).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Reports Placeholder Tab ────────────────────────────────────────────────────

function ReportsTab() {
  return (
    <div className="p-6 flex flex-col items-center justify-center min-h-[300px] text-center">
      <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
      <p className="text-base font-medium text-muted-foreground">Engineering Reports</p>
      <p className="text-sm text-muted-foreground/70 mt-2 max-w-sm">
        Generated inspection reports and KINGA analysis outputs will appear here. Complete an
        inspection and run KINGA analysis to generate your first report.
      </p>
    </div>
  );
}

// ── Tab definitions ────────────────────────────────────────────────────────────

const TABS: PortalTab[] = [
  { id: "projects",     label: "My Projects" },
  { id: "inspections",  label: "Inspections" },
  { id: "assets",       label: "Assets" },
  { id: "intelligence", label: "Intelligence" },
  { id: "reports",      label: "Reports" },
];

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function EngineerDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("projects");

  const { data: dashboard, isLoading, error: dashboardError, refetch: refetchDashboard } = trpc.inspections.getProjectDashboard.useQuery();

  // KPI strip
  const kpis: PortalKPI[] = [
    {
      label: "Active Projects",
      value: isLoading ? "—" : (dashboard?.activeProjects ?? 0),
      icon: <FolderOpen className="h-5 w-5" />,
      accent: "teal",
      headline: true,
    },
    {
      label: "Due This Week",
      value: isLoading ? "—" : (dashboard?.dueThisWeek ?? 0),
      icon: <Calendar className="h-5 w-5" />,
      accent: dashboard?.dueThisWeek ? "amber" : "green",
    },
    {
      label: "Pending Reports",
      value: isLoading ? "—" : (dashboard?.pendingReports ?? 0),
      icon: <Clock className="h-5 w-5" />,
      accent: dashboard?.pendingReports ? "red" : "green",
    },
    {
      label: "Total Inspections",
      value: isLoading ? "—" : (dashboard?.totalInspections ?? 0),
      icon: <ClipboardList className="h-5 w-5" />,
      accent: "blue",
    },
  ];

  // Alert bar
  const alerts: PortalAlert[] = [];
  if (dashboardError) {
    alerts.push({
      id: "engineering-dashboard-error",
      severity: "critical",
      label: `Engineering data could not be loaded: ${dashboardError.message}`,
      onClick: () => refetchDashboard(),
    });
  }
  if (dashboard?.dueThisWeek && dashboard.dueThisWeek > 0) {
    alerts.push({
      id: "due-this-week",
      severity: "warning",
      label: `${dashboard.dueThisWeek} inspection${dashboard.dueThisWeek > 1 ? "s" : ""} scheduled this week`,
      count: dashboard.dueThisWeek,
      onClick: () => setActiveTab("inspections"),
    });
  }
  if (dashboard?.pendingReports && dashboard.pendingReports > 0) {
    alerts.push({
      id: "pending-reports",
      severity: "warning",
      label: `${dashboard.pendingReports} completed inspection${dashboard.pendingReports > 1 ? "s" : ""} awaiting report generation`,
      count: dashboard.pendingReports,
      onClick: () => setActiveTab("reports"),
    });
  }

  // Header actions
  const actions = (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => setLocation("/engineer/projects")}
        className="border-white/30 text-white hover:bg-white/10"
      >
        <FolderOpen className="h-4 w-4 mr-1" />
        Projects
      </Button>
      <Button
        size="sm"
        onClick={() => setLocation("/engineer/inspections?create=1")}
        className="bg-white text-primary hover:bg-white/90"
      >
        <Plus className="h-4 w-4 mr-1" />
        New Inspection
      </Button>
    </div>
  );

  return (
    <KingaPortalShell
      icon={<HardHat className="h-6 w-6 text-white" />}
      title="Engineering Workspace"
      description={`Welcome back, ${user?.name ?? "Engineer"} · KINGA Engineering Intelligence`}
      kpis={kpis}
      alerts={alerts}
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      actions={actions}
    >
      {/* My Projects — primary tab */}
      {activeTab === "projects" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 min-h-[600px]">
          <div className="lg:col-span-2 border-r border-border">
            <InspectionProjectsTab />
          </div>
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">Recent Inspections</h3>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => setActiveTab("inspections")}
              >
                View all
              </Button>
            </div>
            <RecentActivityFeed inspections={dashboard?.recentInspections ?? []} />

            <div className="mt-6 pt-6 border-t border-border space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Quick Stats</h3>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Total Inspections
                </span>
                <Badge variant="secondary">
                  {isLoading ? "—" : (dashboard?.totalInspections ?? 0)}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  Pending Reports
                </span>
                <Badge variant={dashboard?.pendingReports ? "destructive" : "secondary"}>
                  {isLoading ? "—" : (dashboard?.pendingReports ?? 0)}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <FolderOpen className="h-4 w-4 text-teal-500" />
                  Active Projects
                </span>
                <Badge variant="secondary">
                  {isLoading ? "—" : (dashboard?.activeProjects ?? 0)}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "inspections" && <InspectionsListTab />}

      {activeTab === "assets" && (
        <div className="p-6">
          <AssetPassportPanel />
        </div>
      )}

      {activeTab === "intelligence" && (
        <div className="p-6">
          <EngineeringIntelligencePanel />
        </div>
      )}

      {activeTab === "reports" && <ReportsTab />}
    </KingaPortalShell>
  );
}
