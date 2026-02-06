import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {  Users, TrendingUp, AlertTriangle, CheckCircle, XCircle, Settings } from "lucide-react";
import KingaLogo from "@/components/KingaLogo";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useState } from "react";

/**
 * Admin Dashboard
 * 
 * System-wide management interface for super admins to:
 * - Approve/reject panel beater applications
 * - View system analytics
 * - Configure fraud detection thresholds
 * - Manage user roles
 */
export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedTab, setSelectedTab] = useState<"panel-beaters" | "analytics" | "settings">("panel-beaters");

  // Get all panel beaters
  const { data: panelBeaters = [], refetch: refetchPanelBeaters } = trpc.panelBeaters.list.useQuery();

  // Get system statistics (using byStatus to get all claims)
  const { data: submittedClaims = [] } = trpc.claims.byStatus.useQuery({ status: "submitted" });
  const { data: triageClaims = [] } = trpc.claims.byStatus.useQuery({ status: "triage" });
  const { data: assessmentClaims = [] } = trpc.claims.byStatus.useQuery({ status: "assessment_pending" });
  const { data: completedClaimsData = [] } = trpc.claims.byStatus.useQuery({ status: "completed" });
  
  const allClaims: any[] = [...submittedClaims, ...triageClaims, ...assessmentClaims, ...completedClaimsData];
  
  // Calculate analytics
  const totalClaims = allClaims.length;
  const highRiskClaims = allClaims.filter((c: any) => (c.fraudRiskScore || 0) > 70).length;
  const completedClaims = allClaims.filter((c: any) => c.status === "completed").length;
  const avgProcessingTime = allClaims.length > 0 
    ? Math.round(allClaims.reduce((sum: number, c: any) => {
        const created = new Date(c.createdAt).getTime();
        const updated = new Date(c.updatedAt).getTime();
        return sum + (updated - created) / (1000 * 60 * 60 * 24); // days
      }, 0) / allClaims.length)
    : 0;

  // Note: Panel beater approval/rejection would require adding these procedures to routers.ts
  // For now, showing UI mockup



  const handleApprove = (id: number) => {
    toast.info("Panel beater approval feature - would update database");
    console.log("Approve panel beater:", id);
  };

  const handleReject = (id: number) => {
    toast.info("Panel beater rejection feature - would update database");
    console.log("Reject panel beater:", id);
  };

  const getStatusBadge = (approved: number | null) => {
    if (approved === null) return <Badge variant="secondary">Pending</Badge>;
    if (approved === 1) return <Badge variant="default">Approved</Badge>;
    return <Badge variant="destructive">Rejected</Badge>;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <KingaLogo />
              <div>
                <p className="text-sm text-muted-foreground">Admin Panel</p>
                <p className="text-sm text-muted-foreground">System Management & Configuration</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => logout()}>
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* System Analytics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Claims</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalClaims}</div>
              <p className="text-xs text-muted-foreground">Across all statuses</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">High Risk Claims</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{highRiskClaims}</div>
              <p className="text-xs text-muted-foreground">Fraud score &gt; 70</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed Claims</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{completedClaims}</div>
              <p className="text-xs text-muted-foreground">Successfully processed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg. Processing</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{avgProcessingTime}d</div>
              <p className="text-xs text-muted-foreground">From submission to completion</p>
            </CardContent>
          </Card>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={selectedTab === "panel-beaters" ? "default" : "outline"}
            onClick={() => setSelectedTab("panel-beaters")}
          >
            <Users className="mr-2 h-4 w-4" />
            Panel Beater Approvals
          </Button>
          <Button
            variant={selectedTab === "analytics" ? "default" : "outline"}
            onClick={() => setSelectedTab("analytics")}
          >
            <TrendingUp className="mr-2 h-4 w-4" />
            Analytics
          </Button>
          <Button
            variant={selectedTab === "settings" ? "default" : "outline"}
            onClick={() => setSelectedTab("settings")}
          >
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </div>

        {/* Panel Beater Approvals Tab */}
        {selectedTab === "panel-beaters" && (
          <Card>
            <CardHeader>
              <CardTitle>Panel Beater Approval Workflow</CardTitle>
              <CardDescription>
                Review and approve panel beater applications to join the KINGA network
              </CardDescription>
            </CardHeader>
            <CardContent>
              {panelBeaters.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p>No panel beaters registered</p>
                  <p className="text-sm mt-2">Panel beater applications will appear here</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Business Name</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {panelBeaters.map((pb) => (
                      <TableRow key={pb.id}>
                        <TableCell className="font-medium">{pb.businessName}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>{pb.name}</div>
                            <div className="text-muted-foreground">{pb.email}</div>
                            <div className="text-muted-foreground">{pb.phone}</div>
                          </div>
                        </TableCell>
                        <TableCell>{pb.city || "N/A"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span className="text-yellow-500">★</span>
                            <span>4.5</span>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(pb.approved)}</TableCell>
                        <TableCell>
                          {pb.approved === null && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-3"
                                onClick={() => handleApprove(pb.id)}

                              >
                                <CheckCircle className="h-3 w-3 mr-1 text-green-600" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-3"
                                onClick={() => handleReject(pb.id)}

                              >
                                <XCircle className="h-3 w-3 mr-1 text-red-600" />
                                Reject
                              </Button>
                            </div>
                          )}
                          {pb.approved !== null && (
                            <span className="text-sm text-muted-foreground">
                              {pb.approved === 1 ? "Active" : "Rejected"}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* Analytics Tab */}
        {selectedTab === "analytics" && (
          <Card>
            <CardHeader>
              <CardTitle>System-Wide Analytics</CardTitle>
              <CardDescription>
                Overview of claims processing and fraud detection performance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-3">Claims by Status</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {["submitted", "triage", "assessment_pending", "completed"].map(status => {
                      const count = allClaims.filter((c: any) => c.status === status).length;
                      return (
                        <div key={status} className="border rounded-lg p-4">
                          <div className="text-2xl font-bold">{count}</div>
                          <div className="text-sm text-muted-foreground capitalize">
                            {status.replace(/_/g, " ")}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-3">Fraud Detection Stats</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="border rounded-lg p-4">
                      <div className="text-2xl font-bold text-green-600">
                        {allClaims.filter((c: any) => (c.fraudRiskScore || 0) < 40).length}
                      </div>
                      <div className="text-sm text-muted-foreground">Low Risk</div>
                    </div>
                    <div className="border rounded-lg p-4">
                      <div className="text-2xl font-bold text-yellow-600">
                        {allClaims.filter((c: any) => (c.fraudRiskScore || 0) >= 40 && (c.fraudRiskScore || 0) < 70).length}
                      </div>
                      <div className="text-sm text-muted-foreground">Medium Risk</div>
                    </div>
                    <div className="border rounded-lg p-4">
                      <div className="text-2xl font-bold text-red-600">{highRiskClaims}</div>
                      <div className="text-sm text-muted-foreground">High Risk</div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Settings Tab */}
        {selectedTab === "settings" && (
          <Card>
            <CardHeader>
              <CardTitle>System Configuration</CardTitle>
              <CardDescription>
                Configure fraud detection thresholds and system parameters
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-2">Fraud Detection Thresholds</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Current thresholds for automated fraud detection
                  </p>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Cost Discrepancy Threshold</span>
                      <Badge>30%</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">High Risk Score Threshold</span>
                      <Badge>70/100</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Medium Risk Score Threshold</span>
                      <Badge>40/100</Badge>
                    </div>
                  </div>
                  <Button className="mt-4" variant="outline" size="sm">
                    <Settings className="mr-2 h-4 w-4" />
                    Configure Thresholds
                  </Button>
                </div>

                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-2">AI Assessment Settings</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Configuration for automated AI damage assessment
                  </p>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Model Version</span>
                      <Badge variant="outline">GPT-4 Vision v1</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Confidence Threshold</span>
                      <Badge variant="outline">85%</Badge>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
