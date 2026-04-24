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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Users, TrendingUp, AlertTriangle, CheckCircle, XCircle, Settings,
  Brain, Database, BarChart3, Target, Loader2, FileText, ArrowUpDown,
  Activity, Zap, Shield, GitBranch
} from "lucide-react";
import KingaLogo from "@/components/KingaLogo";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useState, useMemo } from "react";

/**
 * Admin Dashboard
 * 
 * System-wide management interface for super admins to:
 * - Approve/reject panel beater applications
 * - View system analytics
 * - Configure fraud detection thresholds
 * - Manage AI Intelligence Training (ground truth, variance, benchmarks)
 * - Manage continuous learning loop
 */
export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedTab, setSelectedTab] = useState<"panel-beaters" | "analytics" | "intelligence" | "settings">("panel-beaters");

  // Ground truth form state
  const [gtClaimId, setGtClaimId] = useState("");
  const [gtDecision, setGtDecision] = useState("");
  const [gtFinalCost, setGtFinalCost] = useState("");
  const [gtPartsCost, setGtPartsCost] = useState("");
  const [gtLabourCost, setGtLabourCost] = useState("");
  const [gtPaintCost, setGtPaintCost] = useState("");
  const [gtAssessorName, setGtAssessorName] = useState("");
  const [gtRepairShop, setGtRepairShop] = useState("");
  const [gtNotes, setGtNotes] = useState("");
  const [submittingGt, setSubmittingGt] = useState(false);

  // Get all panel beaters
  const { data: panelBeaters = [] } = trpc.panelBeaters.list.useQuery();

  // Get system statistics using workflow states
  const { data: submittedClaimsData } = trpc.workflowQueries.getClaimsByState.useQuery({ state: "created", limit: 100, offset: 0 });
  const submittedClaims = submittedClaimsData?.claims || [];
  
  const { data: intakeClaimsData } = trpc.workflowQueries.getClaimsByState.useQuery({ state: "intake_verified", limit: 100, offset: 0 });
  const triageClaims = intakeClaimsData?.claims || [];
  
  const { data: assessmentClaimsData } = trpc.workflowQueries.getClaimsByState.useQuery({ state: "under_assessment", limit: 100, offset: 0 });
  const assessmentClaims = assessmentClaimsData?.claims || [];
  
  const { data: completedClaimsDataResponse } = trpc.workflowQueries.getClaimsByState.useQuery({ state: "completed", limit: 100, offset: 0 });
  const completedClaimsData = completedClaimsDataResponse?.claims || [];

  // Historical claims analytics (admin only)
  const { data: analyticsData } = trpc.historicalClaims.getAnalyticsSummary.useQuery(
    undefined,
    { retry: false }
  );
  const { data: varianceData } = trpc.historicalClaims.getVarianceDistribution.useQuery(
    { comparisonType: "quote_vs_final" },
    { retry: false }
  );
  const { data: assessorBenchmarks } = trpc.historicalClaims.getAssessorBenchmarks.useQuery(
    undefined,
    { retry: false }
  );
  const { data: vehiclePatterns } = trpc.historicalClaims.getVehicleCostPatterns.useQuery(
    undefined,
    { retry: false }
  );

  // Ground truth capture mutation
  const captureGt = trpc.historicalClaims.captureGroundTruth.useMutation({
    onSuccess: () => {
      toast.success("Ground truth captured successfully — AI model will learn from this data");
      setGtClaimId("");
      setGtDecision("");
      setGtFinalCost("");
      setGtPartsCost("");
      setGtLabourCost("");
      setGtPaintCost("");
      setGtAssessorName("");
      setGtRepairShop("");
      setGtNotes("");
    },
    onError: (err) => {
      toast.error(`Failed to capture ground truth: ${err.message}`);
    },
  });

  const allClaims = useMemo(
    () => [...submittedClaims, ...triageClaims, ...assessmentClaims, ...completedClaimsData] as any[],
    [submittedClaims, triageClaims, assessmentClaims, completedClaimsData]
  );

  const totalClaims = allClaims.length;
  const highRiskClaims = allClaims.filter((c: any) => (c.fraudRiskScore || 0) > 70).length;
  const completedClaims = allClaims.filter((c: any) => c.status === "completed").length;
  const avgProcessingTime = allClaims.length > 0
    ? Math.round(allClaims.reduce((sum: number, c: any) => {
        const created = new Date(c.createdAt).getTime();
        const updated = new Date(c.updatedAt).getTime();
        return sum + (updated - created) / (1000 * 60 * 60 * 24);
      }, 0) / allClaims.length)
    : 0;

  const handleApprove = (id: number) => {
    toast.info("Panel beater approval feature — would update database");
    console.log("Approve panel beater:", id);
  };

  const handleReject = (id: number) => {
    toast.info("Panel beater rejection feature — would update database");
    console.log("Reject panel beater:", id);
  };

  const handleSubmitGroundTruth = async () => {
    if (!gtClaimId || !gtDecision || !gtFinalCost) {
      toast.error("Please fill in claim ID, decision, and final cost");
      return;
    }
    setSubmittingGt(true);
    try {
      await captureGt.mutateAsync({
        historicalClaimId: parseInt(gtClaimId),
        finalDecision: gtDecision as "approved_repair" | "approved_total_loss" | "cash_settlement" | "rejected" | "withdrawn",
        finalApprovedAmount: parseFloat(gtFinalCost),
        finalPartsCost: gtPartsCost ? parseFloat(gtPartsCost) : undefined,
        finalLaborCost: gtLabourCost ? parseFloat(gtLabourCost) : undefined,
        finalPaintCost: gtPaintCost ? parseFloat(gtPaintCost) : undefined,
        assessorName: gtAssessorName || undefined,
        repairShopName: gtRepairShop || undefined,
        approvalNotes: gtNotes || undefined,
      });
    } finally {
      setSubmittingGt(false);
    }
  };

  const getStatusBadge = (approved: number | null) => {
    if (approved === null) return <Badge variant="secondary">Pending</Badge>;
    if (approved === 1) return <Badge variant="default">Approved</Badge>;
    return <Badge variant="destructive">Rejected</Badge>;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-emerald-50">
      {/* Header */}
      <header className="bg-white dark:bg-card border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Admin Panel</p>
                <p className="text-xs text-muted-foreground">System Management, AI Training &amp; Configuration</p>
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
              <div className="h-5 w-px bg-border" />
              <KingaLogo showText={false} size="sm" />
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* System Analytics Cards */}
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
              <div className="text-2xl font-bold text-red-600">{highRiskClaims}</div>
              <p className="text-xs text-muted-foreground">Fraud score &gt; 70</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed Claims</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{completedClaims}</div>
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
              <p className="text-xs text-muted-foreground">Submission to completion</p>
            </CardContent>
          </Card>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Button
            variant={selectedTab === "panel-beaters" ? "default" : "outline"}
            onClick={() => setSelectedTab("panel-beaters")}
          >
            <Users className="mr-2 h-4 w-4" />
            Panel Beaters
          </Button>
          <Button
            variant={selectedTab === "analytics" ? "default" : "outline"}
            onClick={() => setSelectedTab("analytics")}
          >
            <TrendingUp className="mr-2 h-4 w-4" />
            Analytics
          </Button>
          <Button
            variant={selectedTab === "intelligence" ? "default" : "outline"}
            onClick={() => setSelectedTab("intelligence")}
            className={selectedTab === "intelligence" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
          >
            <Brain className="mr-2 h-4 w-4" />
            AI Intelligence Training
          </Button>
          <Button
            variant={selectedTab === "settings" ? "default" : "outline"}
            onClick={() => setSelectedTab("settings")}
          >
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
          <Button
            variant="outline"
            onClick={() => setLocation("/admin/market-quotes")}
          >
            <Database className="mr-2 h-4 w-4" />
            KINGA Agency
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
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
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
                            <span className="text-yellow-500">&#9733;</span>
                            <span>4.5</span>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(pb.approved)}</TableCell>
                        <TableCell>
                          {pb.approved === null && (
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" className="h-8 px-3" onClick={() => handleApprove(pb.id)}>
                                <CheckCircle className="h-3 w-3 mr-1 text-green-600" />
                                Approve
                              </Button>
                              <Button size="sm" variant="outline" className="h-8 px-3" onClick={() => handleReject(pb.id)}>
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
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Claims by Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { status: "submitted", label: "Submitted", color: "text-primary" },
                    { status: "triage", label: "In Triage", color: "text-yellow-600" },
                    { status: "assessment_pending", label: "Assessment Pending", color: "text-orange-600" },
                    { status: "completed", label: "Completed", color: "text-green-600" },
                  ].map(({ status, label, color }) => {
                    const count = allClaims.filter((c: any) => c.status === status).length;
                    return (
                      <div key={status} className="border rounded-lg p-4">
                        <div className={`text-2xl font-bold ${color}`}>{count}</div>
                        <div className="text-sm text-muted-foreground">{label}</div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Fraud Detection Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="border rounded-lg p-4">
                    <div className="text-2xl font-bold text-green-600">
                      {allClaims.filter((c: any) => (c.fraudRiskScore || 0) < 40).length}
                    </div>
                    <div className="text-sm text-muted-foreground">Low Risk (&lt;40)</div>
                  </div>
                  <div className="border rounded-lg p-4">
                    <div className="text-2xl font-bold text-yellow-600">
                      {allClaims.filter((c: any) => (c.fraudRiskScore || 0) >= 40 && (c.fraudRiskScore || 0) < 70).length}
                    </div>
                    <div className="text-sm text-muted-foreground">Medium Risk (40-70)</div>
                  </div>
                  <div className="border rounded-lg p-4">
                    <div className="text-2xl font-bold text-red-600">{highRiskClaims}</div>
                    <div className="text-sm text-muted-foreground">High Risk (&gt;70)</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* AI Intelligence Training Tab */}
        {selectedTab === "intelligence" && (
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="flex gap-3">
              <Button
                onClick={() => setLocation("/historical-claims")}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <Database className="mr-2 h-4 w-4" />
                Historical Claims Pipeline
              </Button>
              <Button
                variant="outline"
                onClick={() => setLocation("/ml/review/queue")}
              >
                <Brain className="mr-2 h-4 w-4" />
                ML Review Queue
              </Button>
              <Button
                variant="outline"
                onClick={() => setLocation("/admin/workflows")}
              >
                <GitBranch className="mr-2 h-4 w-4" />
                Workflow Templates
              </Button>
              <Button
                variant="outline"
                onClick={() => setLocation("/admin/escalation")}
              >
                <AlertTriangle className="mr-2 h-4 w-4" />
                Escalation Queue
              </Button>
            </div>
            {/* Training Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="border-emerald-200 dark:border-emerald-800">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Historical Claims</CardTitle>
                  <Database className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-emerald-600">
                    {analyticsData?.qualityStats?.totalClaims || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">In training database</p>
                </CardContent>
              </Card>

              <Card className="border-emerald-200 dark:border-emerald-800">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Ground Truth Records</CardTitle>
                  <Target className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-emerald-600">
                    {analyticsData?.statusCounts?.find((s: any) => s.status === "ground_truth_captured")?.count || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">Validated outcomes</p>
                </CardContent>
              </Card>

              <Card className="border-emerald-200 dark:border-emerald-800">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Variance</CardTitle>
                  <ArrowUpDown className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-emerald-600">
                    {analyticsData?.varianceStats?.[0]?.avgAbsVariancePercent
                      ? `${Number(analyticsData.varianceStats[0].avgAbsVariancePercent).toFixed(1)}%`
                      : "N/A"}
                  </div>
                  <p className="text-xs text-muted-foreground">Quote vs actual cost</p>
                </CardContent>
              </Card>

              <Card className="border-emerald-200 dark:border-emerald-800">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Data Quality</CardTitle>
                  <Activity className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-emerald-600">
                    {analyticsData?.qualityStats?.avgQuality
                      ? `${Number(analyticsData.qualityStats.avgQuality).toFixed(0)}%`
                      : "N/A"}
                  </div>
                  <p className="text-xs text-muted-foreground">Average extraction quality</p>
                </CardContent>
              </Card>
            </div>

            {/* Ground Truth Capture */}
            <Card className="border-emerald-200 dark:border-emerald-800">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-emerald-600" />
                  <CardTitle>Capture Ground Truth</CardTitle>
                </div>
                <CardDescription>
                  Record the final approved cost and decision for a claim. This data trains the AI to improve
                  cost predictions, fraud detection accuracy, and assessor benchmarking over time.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Claim ID *</Label>
                    <Input
                      type="number"
                      value={gtClaimId}
                      onChange={(e) => setGtClaimId(e.target.value)}
                      placeholder="e.g., 42"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Decision *</Label>
                    <Select value={gtDecision || "none"} onValueChange={(v) => setGtDecision(v === "none" ? "" : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select decision" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select...</SelectItem>
                        <SelectItem value="approved_repair">Approved Repair</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                        <SelectItem value="cash_settlement">Cash Settlement</SelectItem>
                        <SelectItem value="approved_total_loss">Total Loss / Write-Off</SelectItem>
                        <SelectItem value="withdrawn">Withdrawn</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Final Approved Cost *</Label>
                    <Input
                      type="number"
                      value={gtFinalCost}
                      onChange={(e) => setGtFinalCost(e.target.value)}
                      placeholder="e.g., 45000"
                    />
                  </div>
                </div>

                <Separator />
                <p className="text-sm font-medium text-muted-foreground">Cost Breakdown (optional — improves model accuracy)</p>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Parts Cost</Label>
                    <Input
                      type="number"
                      value={gtPartsCost}
                      onChange={(e) => setGtPartsCost(e.target.value)}
                      placeholder="e.g., 25000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Labour Cost</Label>
                    <Input
                      type="number"
                      value={gtLabourCost}
                      onChange={(e) => setGtLabourCost(e.target.value)}
                      placeholder="e.g., 12000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Paint Cost</Label>
                    <Input
                      type="number"
                      value={gtPaintCost}
                      onChange={(e) => setGtPaintCost(e.target.value)}
                      placeholder="e.g., 8000"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Assessor Name</Label>
                    <Input
                      value={gtAssessorName}
                      onChange={(e) => setGtAssessorName(e.target.value)}
                      placeholder="Name of assessor who reviewed"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Repair Shop</Label>
                    <Input
                      value={gtRepairShop}
                      onChange={(e) => setGtRepairShop(e.target.value)}
                      placeholder="Panel beater / repair shop name"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Input
                    value={gtNotes}
                    onChange={(e) => setGtNotes(e.target.value)}
                    placeholder="Any additional notes about this outcome..."
                  />
                </div>

                <Button
                  onClick={handleSubmitGroundTruth}
                  disabled={submittingGt || !gtClaimId || !gtDecision || !gtFinalCost}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {submittingGt ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Target className="mr-2 h-4 w-4" />
                      Capture Ground Truth
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Variance Analytics */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-emerald-600" />
                  <CardTitle>Cost Variance Analysis</CardTitle>
                </div>
                <CardDescription>
                  How AI-predicted costs compare to final approved costs. Lower variance means better AI accuracy.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {varianceData?.distribution && varianceData.distribution.length > 0 ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      {varianceData.distribution.map((bucket: any) => (
                        <div key={bucket.category} className="border rounded-lg p-3 text-center">
                          <div className="text-lg font-bold">{bucket.count}</div>
                          <div className="text-xs text-muted-foreground capitalize">{bucket.category?.replace(/_/g, " ")}</div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Distribution of variance between AI-predicted and actual approved costs across all ground truth records.
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p>No variance data available yet</p>
                    <p className="text-sm mt-1">Capture ground truth records to see cost variance analysis</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Assessor Benchmarks */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-emerald-600" />
                  <CardTitle>Assessor Performance Benchmarks</CardTitle>
                </div>
                <CardDescription>
                  Track assessor accuracy over time. The AI learns which assessors are most reliable.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {assessorBenchmarks && assessorBenchmarks.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Assessor</TableHead>
                        <TableHead>Claims Assessed</TableHead>
                        <TableHead>Avg Variance</TableHead>
                        <TableHead>Fraud Suspected</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assessorBenchmarks.map((assessor: any, i: number) => {
                        const avgVar = Number(assessor.avgAbsVariancePercent || 0);
                        return (
                          <TableRow key={i}>
                            <TableCell className="font-medium">
                              {assessor.assessorName || "Unknown"}
                              {assessor.assessorLicenseNumber && (
                                <span className="text-xs text-muted-foreground ml-1">({assessor.assessorLicenseNumber})</span>
                              )}
                            </TableCell>
                            <TableCell>{assessor.claimsAssessed}</TableCell>
                            <TableCell>
                              <span className={avgVar < 15 ? "text-green-600" : avgVar < 30 ? "text-yellow-600" : "text-red-600"}>
                                {avgVar.toFixed(1)}%
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge variant={assessor.fraudSuspected > 0 ? "destructive" : "secondary"}>
                                {assessor.fraudSuspected || 0}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p>No assessor benchmark data yet</p>
                    <p className="text-sm mt-1">Data populates as ground truth records are captured</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Vehicle Cost Patterns */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-emerald-600" />
                  <CardTitle>Vehicle Cost Patterns</CardTitle>
                </div>
                <CardDescription>
                  Average repair costs by vehicle make/model. Used to benchmark new claims automatically.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {vehiclePatterns && vehiclePatterns.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Make / Model</TableHead>
                        <TableHead>Claims</TableHead>
                        <TableHead>Avg Quote</TableHead>
                        <TableHead>Avg Final</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vehiclePatterns.map((pattern: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">
                            {pattern.vehicleMake || "Unknown"} {pattern.vehicleModel || ""}
                          </TableCell>
                          <TableCell>{pattern.claimCount}</TableCell>
                          <TableCell>R {Number(pattern.avgQuoteCost || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                          <TableCell>R {Number(pattern.avgFinalCost || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Zap className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p>No vehicle cost pattern data yet</p>
                    <p className="text-sm mt-1">Patterns emerge as historical claims are ingested and processed</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Continuous Learning Status */}
            <Card className="border-emerald-200 dark:border-emerald-800 bg-gradient-to-r from-emerald-50 to-teal-50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-emerald-600" />
                  <CardTitle className="text-emerald-800 dark:text-emerald-200">Continuous Learning Status</CardTitle>
                </div>
                <CardDescription>
                  The AI continuously learns from every claim processed through the system
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white dark:bg-card rounded-lg p-4 border border-emerald-200 dark:border-emerald-800">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-sm font-medium">Auto-Feed Active</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Every approved/completed claim automatically feeds into the historical database for model improvement
                    </p>
                  </div>
                  <div className="bg-white dark:bg-card rounded-lg p-4 border border-emerald-200 dark:border-emerald-800">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-sm font-medium">Cost Benchmarks</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      New claims are automatically compared against historical cost data for the same vehicle make/model
                    </p>
                  </div>
                  <div className="bg-white dark:bg-card rounded-lg p-4 border border-emerald-200 dark:border-emerald-800">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-sm font-medium">Fraud Pattern Learning</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Fraud indicators are refined as more ground truth data confirms or refutes AI predictions
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
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
                  <Button className="mt-4" variant="outline" size="sm" onClick={() => toast.info("Threshold configuration coming soon")}>
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
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Cross-Validation</span>
                      <Badge variant="outline" className="text-emerald-600 border-emerald-300 dark:border-emerald-700">Enabled</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Physics Engine</span>
                      <Badge variant="outline" className="text-emerald-600 border-emerald-300 dark:border-emerald-700">Enabled</Badge>
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
