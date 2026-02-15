/**
 * Executive Analytics Charts
 * 
 * Recharts visualizations for executive dashboard analytics
 */

import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart
} from "recharts";
import { TrendingUp, DollarSign, Clock, AlertTriangle } from "lucide-react";

const COLORS = {
  blue: "#3b82f6",
  red: "#ef4444",
  green: "#22c55e",
  orange: "#fb923c",
  purple: "#a855f7",
};

export default function ExecutiveAnalyticsCharts() {
  const [timeRange, setTimeRange] = useState<number>(30);

  // Fetch analytics data
  const { data: volumeData, isLoading: volumeLoading } = trpc.executive.getClaimsVolumeOverTime.useQuery({ days: timeRange });
  const { data: fraudTrends, isLoading: fraudLoading } = trpc.executive.getFraudDetectionTrends.useQuery({ days: timeRange });
  const { data: costBreakdown, isLoading: costLoading } = trpc.executive.getCostBreakdownByStatus.useQuery();
  const { data: processingTime, isLoading: timeLoading } = trpc.executive.getAverageProcessingTime.useQuery();
  const { data: fraudDistribution, isLoading: distLoading } = trpc.executive.getFraudRiskDistribution.useQuery();

  // Transform volume data for recharts
  const volumeChartData = useMemo(() => {
    if (!volumeData) return [];
    return volumeData.map((d) => ({
      date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      total: d.total,
      fraudDetected: d.fraudDetected,
    }));
  }, [volumeData]);

  // Transform fraud trends for recharts
  const fraudRateData = useMemo(() => {
    if (!fraudTrends) return [];
    return fraudTrends.map((d) => ({
      date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      fraudRate: d.fraudRate,
      avgScore: d.avgScore,
    }));
  }, [fraudTrends]);

  // Transform cost breakdown for recharts
  const costData = useMemo(() => {
    if (!costBreakdown) return [];
    return costBreakdown.map((d) => ({
      status: d.status.replace(/_/g, " ").toUpperCase(),
      estimatedCost: d.totalEstimatedCost / 100,
      approvedAmount: d.totalApprovedAmount / 100,
    }));
  }, [costBreakdown]);

  // Transform processing time for recharts
  const processingData = useMemo(() => {
    if (!processingTime) return [];
    return [
      { stage: "Completed", days: processingTime.completed, fill: COLORS.green },
      { stage: "Pending Triage", days: processingTime.pendingTriage, fill: COLORS.orange },
      { stage: "Under Assessment", days: processingTime.underAssessment, fill: COLORS.blue },
      { stage: "Awaiting Approval", days: processingTime.awaitingApproval, fill: COLORS.purple },
    ];
  }, [processingTime]);

  // Transform fraud distribution for recharts
  const fraudDistData = useMemo(() => {
    if (!fraudDistribution) return [];
    return [
      { name: "Low Risk (<30)", value: fraudDistribution.lowRisk, fill: COLORS.green },
      { name: "Medium Risk (30-70)", value: fraudDistribution.mediumRisk, fill: COLORS.orange },
      { name: "High Risk (>70)", value: fraudDistribution.highRisk, fill: COLORS.red },
    ];
  }, [fraudDistribution]);

  const LoadingPlaceholder = () => (
    <div className="flex h-full items-center justify-center text-muted-foreground">Loading...</div>
  );
  const EmptyPlaceholder = () => (
    <div className="flex h-full items-center justify-center text-muted-foreground">No data available</div>
  );

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Analytics Dashboard</h3>
        <Select value={timeRange.toString()} onValueChange={(v) => setTimeRange(parseInt(v))}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Claims Volume Over Time */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              <CardTitle>Claims Volume Trend</CardTitle>
            </div>
            <CardDescription>Daily claim submissions and fraud detection</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {volumeLoading ? <LoadingPlaceholder /> : volumeChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={volumeChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="total" name="Total Claims" stroke={COLORS.blue} fill={COLORS.blue} fillOpacity={0.1} />
                    <Area type="monotone" dataKey="fraudDetected" name="Fraud Detected" stroke={COLORS.red} fill={COLORS.red} fillOpacity={0.1} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <EmptyPlaceholder />}
            </div>
          </CardContent>
        </Card>

        {/* Fraud Detection Rate */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <CardTitle>Fraud Detection Trends</CardTitle>
            </div>
            <CardDescription>Fraud rate and average risk score over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {fraudLoading ? <LoadingPlaceholder /> : fraudRateData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={fraudRateData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" fontSize={12} />
                    <YAxis yAxisId="left" fontSize={12} label={{ value: "Fraud Rate (%)", angle: -90, position: "insideLeft" }} />
                    <YAxis yAxisId="right" orientation="right" fontSize={12} label={{ value: "Avg Score", angle: 90, position: "insideRight" }} />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="fraudRate" name="Fraud Rate (%)" stroke={COLORS.red} dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="avgScore" name="Avg Fraud Score" stroke={COLORS.orange} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <EmptyPlaceholder />}
            </div>
          </CardContent>
        </Card>

        {/* Cost Breakdown by Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              <CardTitle>Cost Breakdown by Status</CardTitle>
            </div>
            <CardDescription>Estimated vs approved costs by claim status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {costLoading ? <LoadingPlaceholder /> : costData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={costData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="status" fontSize={10} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="estimatedCost" name="Estimated Cost (USD)" fill={COLORS.blue} />
                    <Bar dataKey="approvedAmount" name="Approved Amount (USD)" fill={COLORS.green} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyPlaceholder />}
            </div>
          </CardContent>
        </Card>

        {/* Average Processing Time */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-purple-600" />
              <CardTitle>Average Processing Time</CardTitle>
            </div>
            <CardDescription>Average days spent in each status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {timeLoading ? <LoadingPlaceholder /> : processingData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={processingData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="stage" fontSize={10} />
                    <YAxis fontSize={12} label={{ value: "Days", angle: -90, position: "insideLeft" }} />
                    <Tooltip />
                    <Bar dataKey="days" name="Average Days">
                      {processingData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyPlaceholder />}
            </div>
          </CardContent>
        </Card>

        {/* Fraud Risk Distribution */}
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              <CardTitle>Fraud Risk Distribution</CardTitle>
            </div>
            <CardDescription>Distribution of claims by fraud risk level</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mx-auto h-[300px] max-w-md">
              {distLoading ? <LoadingPlaceholder /> : fraudDistData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={fraudDistData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    >
                      {fraudDistData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : <EmptyPlaceholder />}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
