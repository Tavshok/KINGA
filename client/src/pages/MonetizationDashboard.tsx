/**
 * KINGA Monetisation Dashboard
 * 
 * Internal dashboard for super-admin to monitor per-tenant usage metrics
 * and calculate projected billing.
 * 
 * ACCESS CONTROL: Super-admin only - NO INSURER VISIBILITY
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  FileText,
  Zap,
  Shield,
  Clock,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";

export default function MonetizationDashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState<"current" | "previous" | "custom">("current");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  // Fetch current month metrics by default
  const currentMonthQuery = trpc.monetization.getCurrentMonthMetrics.useQuery(undefined, {
    enabled: selectedPeriod === "current",
  });

  const previousMonthQuery = trpc.monetization.getPreviousMonthMetrics.useQuery(undefined, {
    enabled: selectedPeriod === "previous",
  });

  const customPeriodQuery = trpc.monetization.getAllTenantsMetrics.useQuery(
    {
      startDate: customStartDate,
      endDate: customEndDate,
    },
    {
      enabled: selectedPeriod === "custom" && !!customStartDate && !!customEndDate,
    }
  );

  // Select active query based on period
  const activeQuery =
    selectedPeriod === "current"
      ? currentMonthQuery
      : selectedPeriod === "previous"
      ? previousMonthQuery
      : customPeriodQuery;

  const metrics = activeQuery.data || [];
  const isLoading = activeQuery.isLoading;

  // Calculate aggregate totals
  const totalRevenue = metrics.reduce((sum, m) => sum + m.projectedInvoice.total, 0);
  const totalClaims = metrics.reduce((sum, m) => sum + m.claimsProcessed, 0);
  const totalAiOnly = metrics.reduce((sum, m) => sum + m.aiOnlyAssessments, 0);
  const totalHybrid = metrics.reduce((sum, m) => sum + m.hybridAssessments, 0);
  const avgProcessingTimeReduction =
    metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.avgProcessingTimeReduction, 0) / metrics.length
      : 0;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(1)}%`;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">KINGA Monetisation Dashboard</h1>
            <p className="text-sm text-gray-600 mt-1">
              Internal strategic monitoring and billing projections
            </p>
          </div>

          {/* Period Selector */}
          <div className="flex items-center gap-4">
            <Select value={selectedPeriod} onValueChange={(v) => setSelectedPeriod(v as typeof selectedPeriod)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Current Month</SelectItem>
                <SelectItem value="previous">Previous Month</SelectItem>
                <SelectItem value="custom">Custom Period</SelectItem>
              </SelectContent>
            </Select>

            {selectedPeriod === "custom" && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-3 py-2 border rounded-md text-sm"
                />
                <span className="text-gray-500">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-3 py-2 border rounded-md text-sm"
                />
              </div>
            )}
          </div>
        </div>

        {/* Aggregate KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-sm font-medium text-gray-600">Total Revenue</div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{formatCurrency(totalRevenue)}</div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-sm font-medium text-gray-600">Active Tenants</div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{metrics.length}</div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-100 rounded-lg">
                <FileText className="w-5 h-5 text-purple-600" />
              </div>
              <div className="text-sm font-medium text-gray-600">Total Claims</div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{totalClaims.toLocaleString()}</div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Zap className="w-5 h-5 text-amber-600" />
              </div>
              <div className="text-sm font-medium text-gray-600">AI-Only Rate</div>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {totalClaims > 0 ? ((totalAiOnly / totalClaims) * 100).toFixed(1) : 0}%
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-red-100 rounded-lg">
                <Clock className="w-5 h-5 text-red-600" />
              </div>
              <div className="text-sm font-medium text-gray-600">Avg Time Saved</div>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {avgProcessingTimeReduction.toFixed(1)}h
            </div>
          </Card>
        </div>

        {/* Per-Tenant Metrics Table */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Per-Tenant Breakdown</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const csv = generateCSVExport(metrics);
                downloadCSV(csv, `kinga-monetization-${selectedPeriod}.csv`);
                toast.success("Exported to CSV");
              }}
            >
              Export CSV
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : metrics.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No data available for the selected period
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead className="text-right">Claims</TableHead>
                    <TableHead className="text-right">AI-Only</TableHead>
                    <TableHead className="text-right">Hybrid</TableHead>
                    <TableHead className="text-right">Fast-Track</TableHead>
                    <TableHead className="text-right">Time Saved (h)</TableHead>
                    <TableHead className="text-right">Confidence</TableHead>
                    <TableHead className="text-right">Projected Revenue</TableHead>
                    <TableHead className="text-right">MoM Change</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.map((tenant) => (
                    <TableRow key={tenant.tenantId}>
                      <TableCell className="font-medium">{tenant.tenantName}</TableCell>
                      <TableCell className="text-right">{tenant.claimsProcessed}</TableCell>
                      <TableCell className="text-right">{tenant.aiOnlyAssessments}</TableCell>
                      <TableCell className="text-right">{tenant.hybridAssessments}</TableCell>
                      <TableCell className="text-right">{tenant.fastTrackedClaims}</TableCell>
                      <TableCell className="text-right">
                        {tenant.avgProcessingTimeReduction.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1 text-xs">
                          <span className="text-green-600">H:{tenant.confidenceDistribution.high}</span>
                          <span className="text-amber-600">M:{tenant.confidenceDistribution.medium}</span>
                          <span className="text-red-600">L:{tenant.confidenceDistribution.low}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(tenant.projectedInvoice.total)}
                      </TableCell>
                      <TableCell className="text-right">
                        {tenant.momComparison ? (
                          <div className="flex items-center justify-end gap-1">
                            {tenant.momComparison.revenueChange >= 0 ? (
                              <TrendingUp className="w-4 h-4 text-green-600" />
                            ) : (
                              <TrendingDown className="w-4 h-4 text-red-600" />
                            )}
                            <span
                              className={
                                tenant.momComparison.revenueChange >= 0
                                  ? "text-green-600"
                                  : "text-red-600"
                              }
                            >
                              {formatPercentage(tenant.momComparison.revenueChange)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>

        {/* Revenue Breakdown Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Revenue Breakdown</h3>
            <div className="space-y-3">
              {metrics.slice(0, 5).map((tenant) => (
                <div key={tenant.tenantId} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{tenant.tenantName}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full"
                        style={{
                          width: `${(tenant.projectedInvoice.total / totalRevenue) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-900 w-20 text-right">
                      {formatCurrency(tenant.projectedInvoice.total)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Assessment Type Distribution</h3>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-600">AI-Only Assessments</span>
                  <span className="text-sm font-semibold text-gray-900">{totalAiOnly}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{
                      width: `${totalClaims > 0 ? (totalAiOnly / totalClaims) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-600">Hybrid Assessments</span>
                  <span className="text-sm font-semibold text-gray-900">{totalHybrid}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-600 h-2 rounded-full"
                    style={{
                      width: `${totalClaims > 0 ? (totalHybrid / totalClaims) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * Generate CSV export of metrics
 */
function generateCSVExport(metrics: any[]): string {
  const headers = [
    "Tenant",
    "Claims Processed",
    "AI-Only",
    "Hybrid",
    "Fast-Track",
    "Avg Time Saved (h)",
    "High Confidence",
    "Medium Confidence",
    "Low Confidence",
    "Projected Revenue",
    "MoM Revenue Change (%)",
  ];

  const rows = metrics.map((m) => [
    m.tenantName,
    m.claimsProcessed,
    m.aiOnlyAssessments,
    m.hybridAssessments,
    m.fastTrackedClaims,
    m.avgProcessingTimeReduction.toFixed(1),
    m.confidenceDistribution.high,
    m.confidenceDistribution.medium,
    m.confidenceDistribution.low,
    m.projectedInvoice.total.toFixed(2),
    m.momComparison?.revenueChange?.toFixed(1) || "N/A",
  ]);

  return [headers, ...rows].map((row) => row.join(",")).join("\n");
}

/**
 * Download CSV file
 */
function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
