import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, TrendingUp, AlertTriangle, CheckCircle2, Clock, Users, BarChart3 } from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8", "#82CA9D"];

export default function WorkflowAnalyticsDashboard() {
  const [dateRange, setDateRange] = useState("30"); // days
  const [slaThreshold, setSlaThreshold] = useState(48); // hours

  // Calculate date range
  const endDate = new Date().toISOString();
  const startDate = new Date(Date.now() - parseInt(dateRange) * 24 * 60 * 60 * 1000).toISOString();

  // Fetch analytics data
  const processingTimes = trpc.workflowAnalytics.getProcessingTimesByStage.useQuery({
    startDate,
    endDate,
  });

  const bottlenecks = trpc.workflowAnalytics.getBottlenecks.useQuery({
    threshold: slaThreshold,
    startDate,
    endDate,
  });

  const slaCompliance = trpc.workflowAnalytics.getSLACompliance.useQuery({
    startDate,
    endDate,
  });

  const userProductivity = trpc.workflowAnalytics.getUserProductivity.useQuery({
    startDate,
    endDate,
  });

  const transitionTrends = trpc.workflowAnalytics.getTransitionTrends.useQuery({
    groupBy: "day",
    startDate,
    endDate,
  });

  const isLoading =
    processingTimes.isLoading ||
    bottlenecks.isLoading ||
    slaCompliance.isLoading ||
    userProductivity.isLoading ||
    transitionTrends.isLoading;

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Workflow Analytics</h1>
          <p className="text-muted-foreground">
            Comprehensive workflow performance metrics and bottleneck analysis
          </p>
        </div>

        <div className="flex gap-4">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="180">Last 6 months</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            onClick={() => {
              processingTimes.refetch();
              bottlenecks.refetch();
              slaCompliance.refetch();
              userProductivity.refetch();
              transitionTrends.refetch();
            }}
          >
            Refresh Data
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {!isLoading && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Overall SLA Compliance</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {slaCompliance.data?.meta?.overallCompliance || 0}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {slaCompliance.data?.meta?.overallCompliance >= 90
                    ? "Excellent performance"
                    : slaCompliance.data?.meta?.overallCompliance >= 75
                    ? "Good performance"
                    : "Needs improvement"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Bottlenecks</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {bottlenecks.data?.data?.length || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Stages exceeding {slaThreshold}h threshold
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Processing Time</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {processingTimes.data?.data
                    ? (
                        processingTimes.data.data.reduce((sum, d) => sum + d.avgHours, 0) /
                        processingTimes.data.data.length
                      ).toFixed(1)
                    : 0}
                  h
                </div>
                <p className="text-xs text-muted-foreground">Per workflow stage</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {userProductivity.data?.data?.length || 0}
                </div>
                <p className="text-xs text-muted-foreground">Processing claims</p>
              </CardContent>
            </Card>
          </div>

          {/* Bottleneck Alerts */}
          {bottlenecks.data?.data && bottlenecks.data.data.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>{bottlenecks.data.data.length} workflow bottleneck(s) detected:</strong>
                <ul className="mt-2 list-disc list-inside">
                  {bottlenecks.data.data.slice(0, 3).map((b) => (
                    <li key={b.state}>
                      <strong>{b.state}</strong>: {b.avgHours.toFixed(1)}h average ({b.affectedClaims} claims)
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Processing Time by Stage */}
          <Card>
            <CardHeader>
              <CardTitle>Processing Time by Workflow Stage</CardTitle>
              <CardDescription>Average hours claims spend in each workflow state</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={processingTimes.data?.data || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="state" angle={-45} textAnchor="end" height={100} />
                  <YAxis label={{ value: "Hours", angle: -90, position: "insideLeft" }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="avgHours" fill="#8884d8" name="Avg Hours" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* SLA Compliance */}
          <Card>
            <CardHeader>
              <CardTitle>SLA Compliance by Stage</CardTitle>
              <CardDescription>Percentage of claims meeting SLA targets per workflow state</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={slaCompliance.data?.data || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="state" angle={-45} textAnchor="end" height={100} />
                  <YAxis label={{ value: "Compliance %", angle: -90, position: "insideLeft" }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="complianceRate" fill="#00C49F" name="Compliance Rate %" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Transition Trends */}
          <Card>
            <CardHeader>
              <CardTitle>Workflow Transition Trends</CardTitle>
              <CardDescription>Daily workflow transitions and unique claims processed</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={transitionTrends.data?.data || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="transitionCount" stroke="#8884d8" name="Transitions" />
                  <Line type="monotone" dataKey="uniqueClaims" stroke="#82ca9d" name="Unique Claims" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* User Productivity */}
          <Card>
            <CardHeader>
              <CardTitle>User Productivity</CardTitle>
              <CardDescription>Workflow transitions performed by each user</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {userProductivity.data?.data?.slice(0, 10).map((user, index) => (
                  <div key={user.userId} className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-semibold">
                        #{index + 1}
                      </div>
                      <div>
                        <p className="font-medium">User #{user.userId}</p>
                        <p className="text-sm text-muted-foreground">{user.userRole}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{user.transitionCount} transitions</p>
                      <p className="text-sm text-muted-foreground">{user.claimsHandled} claims</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
