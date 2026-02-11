import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { subMonths, format } from 'date-fns';
import { trpc } from '@/lib/trpc';

export default function ClaimsCostTrend() {
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month' | 'quarter' | 'year'>('month');
  const [dateRange, setDateRange] = useState({
    startDate: format(subMonths(new Date(), 6), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
  });

  // Fetch real data from tRPC
  const { data: trendData, isLoading: trendLoading } = trpc.analytics.claimsCostTrend.useQuery({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    groupBy,
  });

  const { data: breakdownData, isLoading: breakdownLoading } = trpc.analytics.costBreakdown.useQuery({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    breakdownBy: 'vehicle_make',
  });

  const handleExportCSV = () => {
    if (!trendData?.trendData) return;
    
    const csv = [
      ['Period', 'Claim Count', 'Total Cost', 'Average Cost'].join(','),
      ...trendData.trendData.map((row: any) => [
        row.period,
        row.claimCount,
        row.totalCost,
        row.avgCost,
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `claims-cost-trend-${Date.now()}.csv`;
    a.click();
  };

  if (trendLoading || breakdownLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">Loading analytics data...</div>
      </div>
    );
  }

  const summary = trendData?.summary;
  const chartData = trendData?.trendData || [];
  const breakdownChartData = breakdownData || [];

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Claims Cost Trend Analytics</h1>
        <Button onClick={handleExportCSV} variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <div className="flex gap-4">
        <Select value={groupBy} onValueChange={(v: any) => setGroupBy(v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Daily</SelectItem>
            <SelectItem value="week">Weekly</SelectItem>
            <SelectItem value="month">Monthly</SelectItem>
            <SelectItem value="quarter">Quarterly</SelectItem>
            <SelectItem value="year">Yearly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cost Trend Over Time</CardTitle>
          <CardDescription>Total and average claim costs by period</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="totalCost" stroke="#8884d8" name="Total Cost" />
              <Line yAxisId="right" type="monotone" dataKey="avgCost" stroke="#82ca9d" name="Average Cost" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cost Breakdown by Claim Type</CardTitle>
          <CardDescription>Top claim types by total cost</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={breakdownChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" />
              <YAxis />
              <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
              <Legend />
              <Bar dataKey="totalCost" fill="#8884d8" name="Total Cost" />
              <Bar dataKey="claimCount" fill="#82ca9d" name="Claim Count" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Claims</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalClaims?.toLocaleString() || '0'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${summary?.totalCost?.toLocaleString() || '0'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${summary?.avgCost?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '0'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Approval Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.approvalRate || '0'}%</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
