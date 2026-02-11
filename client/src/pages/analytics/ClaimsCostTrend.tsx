import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { subMonths } from 'date-fns';

// Mock data - replace with tRPC query when backend is ready
const mockTrendData = [
  { period: '2025-08', claim_count: 145, total_cost: 2850000, avg_cost: 19655, approved_cost: 2565000 },
  { period: '2025-09', claim_count: 162, total_cost: 3120000, avg_cost: 19259, approved_cost: 2808000 },
  { period: '2025-10', claim_count: 178, total_cost: 3560000, avg_cost: 20000, approved_cost: 3204000 },
  { period: '2025-11', claim_count: 156, total_cost: 3080000, avg_cost: 19744, approved_cost: 2772000 },
  { period: '2025-12', claim_count: 189, total_cost: 3780000, avg_cost: 20000, approved_cost: 3402000 },
  { period: '2026-01', claim_count: 201, total_cost: 4020000, avg_cost: 20000, approved_cost: 3618000 },
];

const mockBreakdownData = [
  { category: 'Collision', claim_count: 420, total_cost: 8400000, avg_cost: 20000 },
  { category: 'Hail Damage', claim_count: 280, total_cost: 4200000, avg_cost: 15000 },
  { category: 'Theft', claim_count: 156, total_cost: 4680000, avg_cost: 30000 },
  { category: 'Vandalism', claim_count: 98, total_cost: 1470000, avg_cost: 15000 },
  { category: 'Fire', claim_count: 77, total_cost: 2310000, avg_cost: 30000 },
];

export default function ClaimsCostTrend() {
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month' | 'quarter' | 'year'>('month');

  const handleExportCSV = () => {
    const csv = [
      ['Period', 'Claim Count', 'Total Cost', 'Average Cost', 'Approved Cost'].join(','),
      ...mockTrendData.map(row => [
        row.period,
        row.claim_count,
        row.total_cost,
        row.avg_cost,
        row.approved_cost,
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `claims-cost-trend-${Date.now()}.csv`;
    a.click();
  };

  const totalClaims = mockTrendData.reduce((sum, row) => sum + row.claim_count, 0);
  const totalCost = mockTrendData.reduce((sum, row) => sum + row.total_cost, 0);
  const avgCost = totalCost / totalClaims;
  const approvalRate = (mockTrendData.reduce((sum, row) => sum + row.approved_cost, 0) / totalCost) * 100;

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
            <LineChart data={mockTrendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="total_cost" stroke="#8884d8" name="Total Cost" />
              <Line yAxisId="right" type="monotone" dataKey="avg_cost" stroke="#82ca9d" name="Average Cost" />
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
            <BarChart data={mockBreakdownData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" />
              <YAxis />
              <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
              <Legend />
              <Bar dataKey="total_cost" fill="#8884d8" name="Total Cost" />
              <Bar dataKey="claim_count" fill="#82ca9d" name="Claim Count" />
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
            <div className="text-2xl font-bold">{totalClaims.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalCost.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${avgCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Approval Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{approvalRate.toFixed(1)}%</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
