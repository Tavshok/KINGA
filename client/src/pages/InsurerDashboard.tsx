import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, AlertTriangle, TrendingUp, Settings, BarChart3, Upload } from "lucide-react";
import KingaLogo from "@/components/KingaLogo";
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { NotificationBell } from "@/components/NotificationBell";
import RoleSwitcher from "@/components/RoleSwitcher";

export default function InsurerDashboard() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [showHistorical, setShowHistorical] = useState(false);
  
  // Fetch real claims data for metrics
  // Get claims from all statuses
  const { data: submittedClaims = [] } = trpc.claims.byStatus.useQuery({ status: 'submitted' });
  const { data: triageClaims = [] } = trpc.claims.byStatus.useQuery({ status: 'triage' });
  const { data: assessmentClaims = [] } = trpc.claims.byStatus.useQuery({ status: 'assessment_in_progress' });
  const { data: comparisonClaims = [] } = trpc.claims.byStatus.useQuery({ status: 'comparison' });
  const { data: completedClaims = [] } = trpc.claims.byStatus.useQuery({ status: 'completed' });
  
  // Combine all claims
  const allClaims = [
    ...submittedClaims,
    ...triageClaims,
    ...assessmentClaims,
    ...comparisonClaims,
    ...completedClaims
  ];
  
  // Calculate metrics from real data
  const totalClaims = allClaims.length;
  const pendingTriage = allClaims.filter((c: any) => c.status === 'submitted').length;
  const highFraudRisk = allClaims.filter((c: any) => c.fraudRiskLevel === 'high').length;
  
  // Calculate average processing time (in days) using completed claims
  const avgProcessingTime = completedClaims.length > 0
    ? Math.round(
        completedClaims.reduce((sum: number, claim: any) => {
          const created = new Date(claim.createdAt).getTime();
          const updated = new Date(claim.updatedAt).getTime();
          return sum + (updated - created) / (1000 * 60 * 60 * 24);
        }, 0) / completedClaims.length
      )
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-accent/5">
      {/* Header */}
      <header className="bg-gradient-to-r from-teal-600 via-teal-700 to-teal-800 text-white shadow-lg">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <KingaLogo />
            <div>
              <p className="text-sm text-teal-100">Insurer Portal - Claims Management & Triage</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <RoleSwitcher />
            <NotificationBell />
            <div className="text-right">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-teal-100 capitalize">{user?.role}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => logout()}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          {/* Total Claims Card */}
          <Card className="bg-gradient-to-br from-primary to-primary/80 text-white border-none shadow-md hover:shadow-lg transition-all hover:scale-105">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-primary-foreground/80">Total Claims</CardTitle>
              <FileText className="h-6 w-6 text-primary-foreground/80" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalClaims}</div>
              <p className="text-xs text-primary-foreground/80 mt-1">Across all statuses</p>
            </CardContent>
          </Card>

          {/* Pending Triage Card */}
          <Card className="bg-gradient-to-br from-amber-300 to-orange-400 text-white border-none shadow-md hover:shadow-lg transition-all hover:scale-105">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-amber-50">Pending Triage</CardTitle>
              <AlertTriangle className="h-6 w-6 text-amber-100" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{pendingTriage}</div>
              <p className="text-xs text-amber-100 mt-1">Awaiting review</p>
            </CardContent>
          </Card>

          {/* High Fraud Risk Card */}
          <Card className="bg-gradient-to-br from-rose-400 to-red-500 text-white border-none shadow-md hover:shadow-lg transition-all hover:scale-105">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-red-50">High Fraud Risk</CardTitle>
              <AlertTriangle className="h-6 w-6 text-red-100" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{highFraudRisk}</div>
              <p className="text-xs text-red-100 mt-1">Requires attention</p>
            </CardContent>
          </Card>

          {/* Avg Processing Time Card */}
          <Card className="bg-gradient-to-br from-emerald-400 to-green-500 text-white border-none shadow-md hover:shadow-lg transition-all hover:scale-105">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-50">Avg. Processing Time</CardTitle>
              <TrendingUp className="h-6 w-6 text-green-100" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{avgProcessingTime}d</div>
              <p className="text-xs text-green-100 mt-1">Last 30 days</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Claims Overview</CardTitle>
            <CardDescription>
              Manage and triage insurance claims with AI-powered fraud detection
            </CardDescription>
          </CardHeader>
          <CardContent>
            {allClaims.length > 0 ? (
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 px-3">Claim #</th>
                        <th className="py-2 px-3">Vehicle</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allClaims.slice(0, 10).map((claim: any) => (
                        <tr key={claim.id} className="border-b hover:bg-muted/50">
                          <td className="py-2 px-3 font-medium">{claim.claimNumber}</td>
                          <td className="py-2 px-3">{claim.vehicleMake} {claim.vehicleModel}</td>
                          <td className="py-2 px-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              claim.status === 'submitted' ? 'bg-primary/10 text-secondary' :
                              claim.status === 'triage' ? 'bg-yellow-100 text-yellow-800' :
                              claim.status === 'comparison' ? 'bg-purple-100 text-purple-800' :
                              claim.status === 'completed' ? 'bg-green-100 text-green-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {claim.status?.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-muted-foreground">{new Date(claim.createdAt).toLocaleDateString()}</td>
                          <td className="py-2 px-3">
                            <Button size="sm" variant="outline" onClick={() => setLocation(`/insurer/claims/${claim.id}`)}>
                              View
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-3 justify-center flex-wrap pt-2">
                  <Button onClick={() => setLocation("/insurer/claims/triage")}>
                    View Claims Triage
                  </Button>
                  <Button 
                    variant="secondary"
                    onClick={() => setLocation("/insurer/external-assessment")}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload External Assessment
                  </Button>
                  <Button 
                    variant="secondary"
                    onClick={() => setLocation("/insurer/fraud-analytics")}
                  >
                    <BarChart3 className="mr-2 h-4 w-4" />
                    Fraud Analytics
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => setLocation("/insurer/batch-export")}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Batch Export
                  </Button>
                  {user?.role === "admin" && (
                    <Button 
                      variant="outline"
                      onClick={() => setLocation("/admin/dashboard")}
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      Admin Panel
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground space-y-4">
                <div>
                  <p>No claims to display</p>
                  <p className="text-sm mt-2">Claims submitted by claimants will appear here</p>
                </div>
                <div className="flex gap-3 justify-center flex-wrap">
                  <Button onClick={() => setLocation("/insurer/claims/triage")}>
                    View Claims Triage
                  </Button>
                  <Button 
                    variant="secondary"
                    onClick={() => setLocation("/insurer/external-assessment")}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload External Assessment
                  </Button>
                  {user?.role === "admin" && (
                    <Button 
                      variant="outline"
                      onClick={() => setLocation("/admin/dashboard")}
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      Admin Panel
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        {/* Historical Intelligence moved to Admin Panel only */}
      </main>
    </div>
  );
}
