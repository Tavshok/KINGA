/**
 * Executive Analytics Charts
 * 
 * Chart.js visualizations for executive dashboard analytics
 */

import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line, Bar, Doughnut } from "react-chartjs-2";
import { TrendingUp, DollarSign, Clock, AlertTriangle } from "lucide-react";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function ExecutiveAnalyticsCharts() {
  const [timeRange, setTimeRange] = useState<number>(30);

  // Fetch analytics data
  const { data: volumeData, isLoading: volumeLoading } = trpc.executive.getClaimsVolumeOverTime.useQuery({ days: timeRange });
  const { data: fraudTrends, isLoading: fraudLoading } = trpc.executive.getFraudDetectionTrends.useQuery({ days: timeRange });
  const { data: costBreakdown, isLoading: costLoading } = trpc.executive.getCostBreakdownByStatus.useQuery();
  const { data: processingTime, isLoading: timeLoading } = trpc.executive.getAverageProcessingTime.useQuery();
  const { data: fraudDistribution, isLoading: distLoading } = trpc.executive.getFraudRiskDistribution.useQuery();

  // Claims Volume Chart Data
  const volumeChartData = useMemo(() => {
    if (!volumeData) return null;

    return {
      labels: volumeData.map((d) => new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })),
      datasets: [
        {
          label: "Total Claims",
          data: volumeData.map((d) => d.total),
          borderColor: "rgb(59, 130, 246)",
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          fill: true,
          tension: 0.4,
        },
        {
          label: "Fraud Detected",
          data: volumeData.map((d) => d.fraudDetected),
          borderColor: "rgb(239, 68, 68)",
          backgroundColor: "rgba(239, 68, 68, 0.1)",
          fill: true,
          tension: 0.4,
        },
      ],
    };
  }, [volumeData]);

  // Fraud Detection Rate Chart Data
  const fraudRateChartData = useMemo(() => {
    if (!fraudTrends) return null;

    return {
      labels: fraudTrends.map((d) => new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })),
      datasets: [
        {
          label: "Fraud Rate (%)",
          data: fraudTrends.map((d) => d.fraudRate),
          borderColor: "rgb(239, 68, 68)",
          backgroundColor: "rgba(239, 68, 68, 0.2)",
          fill: true,
          tension: 0.4,
          yAxisID: "y",
        },
        {
          label: "Avg Fraud Score",
          data: fraudTrends.map((d) => d.avgScore),
          borderColor: "rgb(251, 146, 60)",
          backgroundColor: "rgba(251, 146, 60, 0.2)",
          fill: true,
          tension: 0.4,
          yAxisID: "y1",
        },
      ],
    };
  }, [fraudTrends]);

  // Cost Breakdown Chart Data
  const costChartData = useMemo(() => {
    if (!costBreakdown) return null;

    return {
      labels: costBreakdown.map((d) => d.status.replace(/_/g, " ").toUpperCase()),
      datasets: [
        {
          label: "Estimated Cost (ZWL)",
          data: costBreakdown.map((d) => d.totalEstimatedCost / 100),
          backgroundColor: "rgba(59, 130, 246, 0.7)",
        },
        {
          label: "Approved Amount (ZWL)",
          data: costBreakdown.map((d) => d.totalApprovedAmount / 100),
          backgroundColor: "rgba(34, 197, 94, 0.7)",
        },
      ],
    };
  }, [costBreakdown]);

  // Processing Time Chart Data
  const processingTimeChartData = useMemo(() => {
    if (!processingTime) return null;

    return {
      labels: ["Completed", "Pending Triage", "Under Assessment", "Awaiting Approval"],
      datasets: [
        {
          label: "Average Days",
          data: [
            processingTime.completed,
            processingTime.pendingTriage,
            processingTime.underAssessment,
            processingTime.awaitingApproval,
          ],
          backgroundColor: [
            "rgba(34, 197, 94, 0.7)",
            "rgba(251, 146, 60, 0.7)",
            "rgba(59, 130, 246, 0.7)",
            "rgba(168, 85, 247, 0.7)",
          ],
        },
      ],
    };
  }, [processingTime]);

  // Fraud Risk Distribution Chart Data
  const fraudDistChartData = useMemo(() => {
    if (!fraudDistribution) return null;

    return {
      labels: ["Low Risk (<30)", "Medium Risk (30-70)", "High Risk (>70)"],
      datasets: [
        {
          data: [fraudDistribution.lowRisk, fraudDistribution.mediumRisk, fraudDistribution.highRisk],
          backgroundColor: [
            "rgba(34, 197, 94, 0.7)",
            "rgba(251, 146, 60, 0.7)",
            "rgba(239, 68, 68, 0.7)",
          ],
          borderWidth: 2,
          borderColor: "#fff",
        },
      ],
    };
  }, [fraudDistribution]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
      },
    },
  };

  const fraudRateOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index" as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: "top" as const,
      },
    },
    scales: {
      y: {
        type: "linear" as const,
        display: true,
        position: "left" as const,
        title: {
          display: true,
          text: "Fraud Rate (%)",
        },
      },
      y1: {
        type: "linear" as const,
        display: true,
        position: "right" as const,
        title: {
          display: true,
          text: "Avg Fraud Score",
        },
        grid: {
          drawOnChartArea: false,
        },
      },
    },
  };

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
              {volumeLoading ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">Loading...</div>
              ) : volumeChartData ? (
                <Line data={volumeChartData} options={chartOptions} />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">No data available</div>
              )}
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
              {fraudLoading ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">Loading...</div>
              ) : fraudRateChartData ? (
                <Line data={fraudRateChartData} options={fraudRateOptions} />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">No data available</div>
              )}
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
              {costLoading ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">Loading...</div>
              ) : costChartData ? (
                <Bar data={costChartData} options={chartOptions} />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">No data available</div>
              )}
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
              {timeLoading ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">Loading...</div>
              ) : processingTimeChartData ? (
                <Bar data={processingTimeChartData} options={chartOptions} />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">No data available</div>
              )}
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
              {distLoading ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">Loading...</div>
              ) : fraudDistChartData ? (
                <Doughnut data={fraudDistChartData} options={chartOptions} />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">No data available</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
