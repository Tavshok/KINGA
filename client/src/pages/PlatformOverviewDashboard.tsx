/**
 * Platform Overview Dashboard
 * 
 * Platform super admin only - cross-tenant observability
 * Provides system-wide metrics and insights across all tenants
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Building2, Users, FileText, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";

export default function PlatformOverviewDashboard() {
  const { data: overview, isLoading, error } = trpc.platformObservability.getOverview.useQuery();
  
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
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-700">Error Loading Platform Data</CardTitle>
            <CardDescription className="text-red-600">
              {error.message || "Failed to load platform overview"}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
  
  if (!overview) {
    return null;
  }
  
  return (
    <div className="container py-8 space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Badge variant="secondary" className="bg-purple-100 text-purple-700">
            Platform Super Admin
          </Badge>
          <Badge variant="outline">Read-Only Access</Badge>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Platform Overview</h1>
        <p className="text-muted-foreground mt-2">
          Cross-tenant system-wide metrics and observability
        </p>
      </div>
      
      {/* Key Metrics Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Claims */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Claims</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.totalClaims.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Across all tenants</p>
          </CardContent>
        </Card>
        
        {/* Total Tenants */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Tenants</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.totalTenants}</div>
            <p className="text-xs text-muted-foreground mt-1">Insurance companies</p>
          </CardContent>
        </Card>
        
        {/* Total Users */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Object.values(overview.usersByRole).reduce((sum, count) => sum + count, 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">All roles</p>
          </CardContent>
        </Card>
        
        {/* System Health */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Health</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold">Operational</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">All systems running</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Claims by Status */}
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
                <span className="text-2xl font-bold">{count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      {/* AI Confidence Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>AI Confidence Distribution</CardTitle>
          <CardDescription>Confidence levels across all AI assessments</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-2 p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium text-green-700">High Confidence</span>
              </div>
              <span className="text-2xl font-bold text-green-700">
                {overview.confidenceDistribution.high || 0}
              </span>
              <span className="text-xs text-green-600">≥80% confidence</span>
            </div>
            
            <div className="flex flex-col gap-2 p-4 bg-amber-50 rounded-lg border border-amber-200">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <span className="text-sm font-medium text-amber-700">Medium Confidence</span>
              </div>
              <span className="text-2xl font-bold text-amber-700">
                {overview.confidenceDistribution.medium || 0}
              </span>
              <span className="text-xs text-amber-600">50-79% confidence</span>
            </div>
            
            <div className="flex flex-col gap-2 p-4 bg-red-50 rounded-lg border border-red-200">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <span className="text-sm font-medium text-red-700">Low Confidence</span>
              </div>
              <span className="text-2xl font-bold text-red-700">
                {overview.confidenceDistribution.low || 0}
              </span>
              <span className="text-xs text-red-600">&lt;50% confidence</span>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Recent Routing Decisions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Routing Decisions</CardTitle>
          <CardDescription>Latest 10 routing decisions across all tenants</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {overview.recentRoutingDecisions.slice(0, 10).map((item) => (
              <div key={item.routing.id} className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex flex-col gap-1">
                  <Link href={`/platform/claim-trace/${item.claim?.id}`}>
                    <span className="font-medium hover:underline cursor-pointer">
                      {item.claim?.claimNumber || "Unknown"}
                    </span>
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {item.tenant?.name || "Unknown Tenant"}
                  </span>
                </div>
                
                <div className="flex items-center gap-4">
                  <Badge variant={
                    item.routing.decision === "fast_track" ? "default" :
                    item.routing.decision === "manual_review" ? "secondary" :
                    "destructive"
                  }>
                    {item.routing.decision?.replace(/_/g, " ")}
                  </Badge>
                  
                  <span className="text-sm text-muted-foreground">
                    {new Date(item.routing.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      {/* Users by Role */}
      <Card>
        <CardHeader>
          <CardTitle>Users by Role</CardTitle>
          <CardDescription>User distribution across all roles</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Object.entries(overview.usersByRole).map(([role, count]) => (
              <div key={role} className="flex flex-col gap-2 p-4 bg-muted rounded-lg">
                <span className="text-sm font-medium capitalize">{role.replace(/_/g, " ")}</span>
                <span className="text-2xl font-bold">{count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
