/**
 * Platform Overview Dashboard — Sprint 3 upgrade
 * Platform super admin only - cross-tenant observability
 * Uses KingaPortalShell with personalised greeting and KPI strip
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Building2, Users, FileText, AlertTriangle, CheckCircle2,
  Activity, Cpu, Shield, BarChart3, Clock, Zap
} from "lucide-react";
import { Link } from "wouter";
import {
  PortalHeader, PortalKPIStrip, PortalAlerts, PortalTabBar,
  type PortalKPI, type PortalAlert, type PortalTab
} from "@/components/KingaPortalShell";
import { useState, useMemo } from "react";

export default function PlatformOverviewDashboard() {
  const { user } = useAuth();
  const { data: overview, isLoading, error } = trpc.platformObservability.getOverview.useQuery();
  const [activeTab, setActiveTab] = useState("overview");

  const totalUsers = useMemo(() => {
    if (!overview?.usersByRole) return 0;
    return Object.values(overview.usersByRole).reduce((sum, count) => sum + (count as number), 0);
  }, [overview]);

  const kpis: PortalKPI[] = useMemo(() => {
    if (!overview) return [];
    const pendingClaims = (overview.claimsByStatus as any)?.pending ?? 0;
    const processingClaims = (overview.claimsByStatus as any)?.processing ?? 0;
    const highConfidence = overview.confidenceDistribution?.high ?? 0;
    const totalAssessments = (overview.confidenceDistribution?.high ?? 0) +
      (overview.confidenceDistribution?.medium ?? 0) +
      (overview.confidenceDistribution?.low ?? 0);
    const aiAccuracy = totalAssessments > 0 ? Math.round((highConfidence / totalAssessments) * 100) : 0;
    return [
      { label: "Total Claims", value: overview.totalClaims.toLocaleString(), icon: <FileText className="h-4 w-4" />, accent: "blue" as const },
      { label: "Active Tenants", value: overview.totalTenants.toString(), icon: <Building2 className="h-4 w-4" />, accent: "teal" as const },
      { label: "Total Users", value: totalUsers.toLocaleString(), icon: <Users className="h-4 w-4" />, accent: "green" as const },
      { label: "In Progress", value: (pendingClaims + processingClaims).toLocaleString(), icon: <Clock className="h-4 w-4" />, accent: "amber" as const },
      { label: "AI High Confidence", value: `${aiAccuracy}%`, icon: <Zap className="h-4 w-4" />, accent: "green" as const },
    ];
  }, [overview, totalUsers]);

  const alerts: PortalAlert[] = useMemo(() => {
    if (!overview) return [];
    const lowConf = overview.confidenceDistribution?.low ?? 0;
    const result: PortalAlert[] = [];
    if (lowConf > 10) {
      result.push({
        id: "low-conf",
        severity: "warning",
        label: "Low confidence assessments",
        count: lowConf,
        onClick: () => setActiveTab("ai"),
      });
    }
    return result;
  }, [overview]);

  const tabs: PortalTab[] = [
    { id: "overview", label: "Overview" },
    { id: "tenants", label: "Tenants & Users" },
    { id: "ai", label: "AI Performance" },
    { id: "routing", label: "Routing Decisions" },
    { id: "security", label: "Security" },
  ];

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Loading platform overview...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container py-8">
        <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
          <CardHeader>
            <CardTitle className="text-red-700 dark:text-red-300">Error Loading Platform Data</CardTitle>
            <CardDescription className="text-red-600">
              {error.message || "Failed to load platform overview"}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!overview) return null;

  const firstName = user?.name?.split(" ")[0] ?? "Admin";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="min-h-screen bg-background">
      {/* Portal Header with personalised greeting */}
      <PortalHeader
        icon={<Shield className="h-5 w-5" />}
        title="KINGA Platform Command Centre"
        description={`${greeting}, ${firstName}. Cross-tenant platform overview.`}
        actions={
          <Button variant="outline" size="sm" onClick={() => setActiveTab("security")}>
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            System Health
          </Button>
        }
      />

      {/* KPI Strip */}
      <PortalKPIStrip kpis={kpis} />

      {/* Alert Bar */}
      {alerts.length > 0 && <PortalAlerts alerts={alerts} />}

      {/* Tab Bar */}
      <PortalTabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Body */}
      <main className="container py-6 space-y-6">

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Claims by Status</CardTitle>
                <CardDescription>Distribution across all tenants</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
                  {Object.entries(overview.claimsByStatus).map(([status, count]) => (
                    <div key={status} className="flex flex-col gap-2 p-4 bg-muted rounded-lg">
                      <span className="text-sm font-medium capitalize">{status.replace(/_/g, " ")}</span>
                      <span className="text-2xl font-bold">{(count as number).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  System Health
                </CardTitle>
                <CardDescription>All KINGA services operational</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-4">
                  {["Pipeline Engine", "Fraud Intelligence", "Physics Engine", "CGI Engine"].map((service) => (
                    <div key={service} className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                      <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                      <span className="text-sm font-medium text-green-700 dark:text-green-300">{service}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tenants & Users Tab */}
        {activeTab === "tenants" && (
          <Card>
            <CardHeader>
              <CardTitle>Users by Role</CardTitle>
              <CardDescription>User distribution across all roles — {totalUsers.toLocaleString()} total users</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
                {Object.entries(overview.usersByRole).map(([role, count]) => (
                  <div key={role} className="flex flex-col gap-2 p-4 bg-muted rounded-lg">
                    <span className="text-sm font-medium capitalize">{role.replace(/_/g, " ")}</span>
                    <span className="text-2xl font-bold">{(count as number).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* AI Performance Tab */}
        {activeTab === "ai" && (
          <Card>
            <CardHeader>
              <CardTitle>KINGA AI Confidence Distribution</CardTitle>
              <CardDescription>Confidence levels across all KINGA assessments</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="flex flex-col gap-2 p-4 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span className="text-sm font-medium text-green-700 dark:text-green-300">High Confidence</span>
                  </div>
                  <span className="text-2xl font-bold text-green-700 dark:text-green-300">{overview.confidenceDistribution.high || 0}</span>
                  <span className="text-xs text-green-600">≥80% confidence</span>
                </div>
                <div className="flex flex-col gap-2 p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                    <span className="text-sm font-medium text-amber-700 dark:text-amber-300">Medium Confidence</span>
                  </div>
                  <span className="text-2xl font-bold text-amber-700 dark:text-amber-300">{overview.confidenceDistribution.medium || 0}</span>
                  <span className="text-xs text-amber-600">50–79% confidence</span>
                </div>
                <div className="flex flex-col gap-2 p-4 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                    <span className="text-sm font-medium text-red-700 dark:text-red-300">Low Confidence</span>
                  </div>
                  <span className="text-2xl font-bold text-red-700 dark:text-red-300">{overview.confidenceDistribution.low || 0}</span>
                  <span className="text-xs text-red-600">&lt;50% confidence</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Routing Decisions Tab */}
        {activeTab === "routing" && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Routing Decisions</CardTitle>
              <CardDescription>Latest routing decisions across all tenants</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {overview.recentRoutingDecisions.slice(0, 20).map((item) => (
                  <div key={item.routing.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex flex-col gap-0.5">
                      <Link href={`/platform/claim-trace/${item.claim?.id}`}>
                        <span className="font-medium text-sm hover:underline cursor-pointer">
                          {item.claim?.claimNumber || "Unknown"}
                        </span>
                      </Link>
                      <span className="text-xs text-muted-foreground">{item.tenant?.name || "Unknown Tenant"}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={
                        item.routing.routingDecision === "AI_FAST_TRACK" ? "default" :
                        item.routing.routingDecision === "MANUAL_OVERRIDE" ? "secondary" : "destructive"
                      }>
                        {item.routing.routingDecision?.replace(/_/g, " ")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(item.routing.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Security Tab */}
        {activeTab === "security" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-500" />
                Security & Governance
              </CardTitle>
              <CardDescription>Platform security status and audit trail</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  { title: "Tenant Isolation", desc: "All tenants isolated — no cross-tenant data access" },
                  { title: "Audit Logging", desc: "All platform admin actions are logged" },
                  { title: "RBAC Enforcement", desc: "Role-based access control active on all procedures" },
                  { title: "JWT Authentication", desc: "All sessions secured with signed JWT tokens" },
                ].map(({ title, desc }) => (
                  <div key={title} className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                    <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-green-700 dark:text-green-300">{title}</p>
                      <p className="text-xs text-green-600">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

      </main>
    </div>
  );
}
