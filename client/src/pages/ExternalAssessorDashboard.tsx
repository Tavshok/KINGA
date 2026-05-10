import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { NotificationsInbox } from "@/components/NotificationsInbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ClipboardList,
  Star,
  Clock,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Bell,
  ChevronDown,
  ChevronUp,
  FileText,
  Building2,
  Award,
  Timer,
  Activity,
} from "lucide-react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import ReportsBadgeWidget from "@/components/ReportsBadgeWidget";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

function SlaTimer({ submittedAt }: { submittedAt: string | Date | null }) {
  const deadline = useMemo(() => {
    if (!submittedAt) return null;
    const d = new Date(submittedAt);
    d.setHours(d.getHours() + 48);
    return d;
  }, [submittedAt]);

  if (!deadline) return <span className="text-muted-foreground text-xs">—</span>;

  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  const diffM = Math.floor((diffMs % 3600000) / 60000);

  if (diffMs < 0)
    return (
      <span className="text-red-500 text-xs font-semibold flex items-center gap-1">
        <AlertTriangle className="w-3 h-3" /> Overdue
      </span>
    );
  if (diffH < 4)
    return (
      <span className="text-orange-500 text-xs font-semibold flex items-center gap-1">
        <Timer className="w-3 h-3" /> {diffH}h {diffM}m
      </span>
    );
  return (
    <span className="text-green-600 text-xs flex items-center gap-1">
      <Clock className="w-3 h-3" /> {diffH}h {diffM}m
    </span>
  );
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    submitted: "bg-blue-100 text-blue-700",
    under_review: "bg-yellow-100 text-yellow-700",
    ai_assessment_complete: "bg-purple-100 text-purple-700",
    assessment_complete: "bg-green-100 text-green-700",
    approved: "bg-emerald-100 text-emerald-700",
    rejected: "bg-red-100 text-red-700",
    closed: "bg-gray-100 text-gray-700",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] ?? "bg-gray-100 text-gray-600"}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function ExpandableClaimRow({ claim }: { claim: any }) {
  const [expanded, setExpanded] = useState(false);
  const { data: aiData } = trpc.aiAssessments.byClaim.useQuery(
    { claimId: claim.id },
    { enabled: expanded }
  );

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <TableCell className="font-mono text-xs font-semibold text-primary">
          {claim.claimNumber}
        </TableCell>
        <TableCell className="text-sm">
          {claim.vehicleMake} {claim.vehicleModel} ({claim.vehicleYear})
        </TableCell>
        <TableCell>{statusBadge(claim.status)}</TableCell>
        <TableCell>
          <SlaTimer submittedAt={claim.createdAt} />
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {claim.incidentDate
            ? new Date(claim.incidentDate).toLocaleDateString()
            : "—"}
        </TableCell>
        <TableCell>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/30 p-0">
            <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* AI Summary */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  KINGA Assessment
                </p>
                {aiData ? (
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fraud Score</span>
                      <span
                        className={`font-semibold ${
                          (aiData.fraudScore ?? 0) > 70
                            ? "text-red-600"
                            : (aiData.fraudScore ?? 0) > 40
                            ? "text-orange-500"
                            : "text-green-600"
                        }`}
                      >
                        {aiData.fraudScore ?? "—"}/100
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Estimated Cost
                      </span>
                      <span className="font-semibold">
                        {(aiData as any).estimatedPartsCost ?? (aiData as any).estimatedRepairCost
                          ? `R ${Number((aiData as any).estimatedPartsCost ?? (aiData as any).estimatedRepairCost).toLocaleString()}`
                          : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Recommendation
                      </span>
                      <span className="font-semibold capitalize">
                        {aiData.recommendation ?? "—"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Loading…</p>
                )}
              </div>

              {/* Incident Details */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Incident
                </p>
                <p className="text-sm text-foreground line-clamp-4">
                  {claim.incidentDescription ?? "No description provided."}
                </p>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Actions
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.location.href = `/insurer/claims/${claim.id}`;
                    }}
                  >
                    <FileText className="w-3 h-3 mr-1" /> Open Claim
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Submit Evaluation
                  </Button>
                </div>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export default function ExternalAssessorDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("queue");
  const [perfPeriod, setPerfPeriod] = useState<"weekly" | "monthly">("monthly");

  // Data queries
  const { data: assignments = [], isLoading: assignmentsLoading } =
    trpc.claims.myAssignments.useQuery();

  const { data: insurerData } = trpc.assessors.getMyInsurerRelationships.useQuery();

  const { data: perfTrend } = trpc.assessors.getMyPerformanceTrend.useQuery({
    period: perfPeriod,
  });

  const { data: unreadData } = trpc.claimComms.unreadCount.useQuery();
  const unreadCount = unreadData?.count ?? 0;

  // Derived KPIs
  const activeAssignments = assignments.filter((c: any) =>
    ["submitted", "under_review", "ai_assessment_complete"].includes(c.status)
  );
  const completedAssignments = assignments.filter((c: any) =>
    ["assessment_complete", "approved", "closed"].includes(c.status)
  );
  const overdueAssignments = activeAssignments.filter((c: any) => {
    if (!c.createdAt) return false;
    const deadline = new Date(c.createdAt);
    deadline.setHours(deadline.getHours() + 48);
    return deadline < new Date();
  });

  const assessor = insurerData?.assessor;
  const relationships = insurerData?.relationships ?? [];

  // Performance trend chart data
  const trendLabels = perfTrend?.trend?.map((t: any) => t.label) ?? [];
  const trendVolume = perfTrend?.trend?.map((t: any) => t.totalAssessments) ?? [];
  const trendVariance = perfTrend?.trend?.map((t: any) => t.avgVariancePct) ?? [];

  const volumeChartData = {
    labels: trendLabels,
    datasets: [
      {
        label: "Assessments",
        data: trendVolume,
        backgroundColor: "rgba(99, 102, 241, 0.7)",
        borderRadius: 4,
      },
    ],
  };

  const varianceChartData = {
    labels: trendLabels,
    datasets: [
      {
        label: "Avg Variance from Final (%)",
        data: trendVariance,
        borderColor: "rgb(239, 68, 68)",
        backgroundColor: "rgba(239, 68, 68, 0.1)",
        tension: 0.4,
        fill: true,
        pointRadius: 3,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true } },
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              External Assessor Dashboard
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Welcome back, {user?.name ?? "Assessor"} ·{" "}
              <span className="capitalize">
                {assessor?.assessorType?.replace(/_/g, " ") ?? "Marketplace"}
              </span>{" "}
              · {assessor?.certificationLevel ?? "—"} level
            </p>
          </div>
          <div className="flex items-center gap-2">
            {assessor?.pendingPayout && Number(assessor.pendingPayout) > 0 && (
              <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
                Pending payout: R{" "}
                {Number(assessor.pendingPayout).toLocaleString()}
              </Badge>
            )}
          </div>
        </div>

          <div className="flex justify-end mb-3"><ReportsBadgeWidget compact /></div>
        {/* KPI Stat Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-0 shadow-sm bg-card">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <ClipboardList className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Active Queue</p>
                  <p className="text-2xl font-bold text-foreground">
                    {activeAssignments.length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-card">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Overdue</p>
                  <p className="text-2xl font-bold text-red-600">
                    {overdueAssignments.length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-card">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Completed</p>
                  <p className="text-2xl font-bold text-foreground">
                    {assessor?.totalAssessmentsCompleted ?? completedAssignments.length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-card">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                  <Star className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Performance Score</p>
                  <p className="text-2xl font-bold text-foreground">
                    {assessor?.performanceScore
                      ? `${Number(assessor.performanceScore).toFixed(0)}%`
                      : "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="queue" className="flex items-center gap-1.5">
              <ClipboardList className="w-3.5 h-3.5" />
              Assignment Queue
              {activeAssignments.length > 0 && (
                <Badge className="ml-1 text-xs px-1.5 py-0 bg-primary text-primary-foreground">
                  {activeAssignments.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="reports" className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              My Reports
            </TabsTrigger>
            <TabsTrigger value="performance" className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              Performance by Insurer
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5" />
              Notifications
              {unreadCount > 0 && (
                <Badge className="ml-1 text-xs px-1.5 py-0 bg-red-500 text-white">
                  {unreadCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Assignment Queue ── */}
          <TabsContent value="queue" className="mt-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" />
                  Active Assignments
                  <span className="text-muted-foreground font-normal text-sm">
                    — SLA: 48 hours from submission
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {assignmentsLoading ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    Loading assignments…
                  </div>
                ) : activeAssignments.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    No active assignments — your queue is clear.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-xs">Claim #</TableHead>
                        <TableHead className="text-xs">Vehicle</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs">SLA Remaining</TableHead>
                        <TableHead className="text-xs">Incident Date</TableHead>
                        <TableHead className="w-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeAssignments.map((claim: any) => (
                        <ExpandableClaimRow key={claim.id} claim={claim} />
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── My Reports ── */}
          <TabsContent value="reports" className="mt-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Submitted Assessment Reports
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {completedAssignments.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    No completed assessments yet.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-xs">Claim #</TableHead>
                        <TableHead className="text-xs">Vehicle</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs">Completed</TableHead>
                        <TableHead className="text-xs">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {completedAssignments.map((claim: any) => (
                        <TableRow key={claim.id}>
                          <TableCell className="font-mono text-xs font-semibold text-primary">
                            {claim.claimNumber}
                          </TableCell>
                          <TableCell className="text-sm">
                            {claim.vehicleMake} {claim.vehicleModel} (
                            {claim.vehicleYear})
                          </TableCell>
                          <TableCell>{statusBadge(claim.status)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {claim.updatedAt
                              ? new Date(claim.updatedAt).toLocaleDateString()
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                (window.location.href = `/insurer/claims/${claim.id}`)
                              }
                            >
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Performance by Insurer ── */}
          <TabsContent value="performance" className="mt-4 space-y-4">
            {/* Period selector */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Performance Trends
              </h3>
              <Select
                value={perfPeriod}
                onValueChange={(v) => setPerfPeriod(v as "weekly" | "monthly")}
              >
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Trend charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Assessment Volume</CardTitle>
                </CardHeader>
                <CardContent>
                  <div style={{ height: 200 }}>
                    <Bar data={volumeChartData} options={chartOptions} />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    Avg Variance from Final Approved (%)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div style={{ height: 200 }}>
                    <Line data={varianceChartData} options={chartOptions} />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Per-insurer breakdown table */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary" />
                  Performance by Insurer
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {relationships.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    No active insurer relationships found.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-xs">Insurer</TableHead>
                        <TableHead className="text-xs">Relationship</TableHead>
                        <TableHead className="text-xs text-right">
                          Completed
                        </TableHead>
                        <TableHead className="text-xs text-right">
                          Rejected
                        </TableHead>
                        <TableHead className="text-xs text-right">
                          Avg Turnaround
                        </TableHead>
                        <TableHead className="text-xs text-right">
                          Rating
                        </TableHead>
                        <TableHead className="text-xs text-right">
                          Rate / Assessment
                        </TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {relationships.map((rel: any) => (
                        <TableRow key={rel.id}>
                          <TableCell className="font-semibold text-sm">
                            <div className="flex items-center gap-1.5">
                              {rel.isPreferredVendor ? (
                                <Award className="w-3.5 h-3.5 text-yellow-500" />
                              ) : null}
                              {rel.insurerName ?? rel.tenantId}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs capitalize text-muted-foreground">
                              {rel.relationshipType?.replace(/_/g, " ")}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold">
                            {rel.totalAssignmentsCompleted ?? 0}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            <span
                              className={
                                (rel.totalAssignmentsRejected ?? 0) > 0
                                  ? "text-red-600 font-semibold"
                                  : "text-muted-foreground"
                              }
                            >
                              {rel.totalAssignmentsRejected ?? 0}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {rel.averageCompletionTimeHours
                              ? `${Number(rel.averageCompletionTimeHours).toFixed(1)}h`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {rel.performanceRating ? (
                              <span className="flex items-center justify-end gap-0.5 text-sm font-semibold text-yellow-600">
                                <Star className="w-3 h-3" />
                                {Number(rel.performanceRating).toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">
                                —
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {rel.contractedRatePerAssessment
                              ? `R ${Number(rel.contractedRatePerAssessment).toLocaleString()}`
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                rel.relationshipStatus === "active"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {rel.relationshipStatus}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Overall summary KPIs */}
            {assessor && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border-0 shadow-sm">
                  <CardContent className="pt-4 pb-3 text-center">
                    <p className="text-xs text-muted-foreground">Avg Accuracy</p>
                    <p className="text-xl font-bold text-foreground mt-1">
                      {assessor.averageAccuracyScore
                        ? `${Number(assessor.averageAccuracyScore).toFixed(1)}%`
                        : "—"}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-sm">
                  <CardContent className="pt-4 pb-3 text-center">
                    <p className="text-xs text-muted-foreground">Avg Turnaround</p>
                    <p className="text-xl font-bold text-foreground mt-1">
                      {assessor.averageTurnaroundHours
                        ? `${Number(assessor.averageTurnaroundHours).toFixed(1)}h`
                        : "—"}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-sm">
                  <CardContent className="pt-4 pb-3 text-center">
                    <p className="text-xs text-muted-foreground">Avg Rating</p>
                    <p className="text-xl font-bold text-yellow-600 mt-1 flex items-center justify-center gap-1">
                      <Star className="w-4 h-4" />
                      {assessor.averageRating
                        ? Number(assessor.averageRating).toFixed(1)
                        : "—"}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-sm">
                  <CardContent className="pt-4 pb-3 text-center">
                    <p className="text-xs text-muted-foreground">Total Earnings</p>
                    <p className="text-xl font-bold text-green-600 mt-1">
                      {assessor.totalMarketplaceEarnings
                        ? `R ${Number(assessor.totalMarketplaceEarnings).toLocaleString()}`
                        : "—"}
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* ── Notifications ── */}
          <TabsContent value="notifications" className="mt-4">
            <NotificationsInbox />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
