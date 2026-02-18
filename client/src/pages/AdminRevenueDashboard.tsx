/**
 * Admin Revenue Dashboard
 * 
 * Super-admin only dashboard for monetisation analytics:
 * - Tenant usage ranking
 * - Monthly revenue simulation
 * - High-growth tenant detection
 * - Cost vs compute load ratio
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, TrendingUp, DollarSign, Users, Activity } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";

export function AdminRevenueDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // Date range for analytics
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Current month for revenue simulation
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });

  // Access control
  if (!user || user.role !== "platform_super_admin") {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>Super-admin role required to view this dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/")}>Return to Home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Queries
  const tenantRanking = trpc.monetisation.getTenantUsageRanking.useQuery({
    startDate,
    endDate,
    limit: 50,
  });

  const revenueSimulation = trpc.monetisation.getMonthlyRevenueSimulation.useQuery({
    month: selectedMonth,
  });

  const highGrowthTenants = trpc.monetisation.getHighGrowthTenants.useQuery({
    lookbackMonths: 3,
    growthThreshold: 50,
  });

  const costComputeRatio = trpc.monetisation.getCostComputeRatio.useQuery({
    startDate,
    endDate,
  });

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Revenue Dashboard</h1>
        <p className="text-gray-600 mt-2">
          Platform monetisation analytics and business intelligence
        </p>
      </div>

      {/* Date Range Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Analytics Period</CardTitle>
          <CardDescription>Select date range for usage analytics</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-4">
          <div className="flex-1">
            <Label htmlFor="startDate">Start Date</Label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="endDate">End Date</Label>
            <Input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="month">Revenue Simulation Month</Label>
            <Input
              id="month"
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Revenue Simulation Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
            <Users className="h-4 w-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            {revenueSimulation.isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <div className="text-2xl font-bold">
                {revenueSimulation.data?.data.totalTenants || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Est. Monthly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            {revenueSimulation.isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <div className="text-2xl font-bold text-green-600">
                ${((revenueSimulation.data?.data.totalEstimatedRevenue || 0) / 100).toLocaleString()}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Revenue/Tenant</CardTitle>
            <Activity className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            {revenueSimulation.isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <div className="text-2xl font-bold text-blue-600">
                $
                {(
                  (revenueSimulation.data?.data.averageRevenuePerTenant || 0) / 100
                ).toLocaleString()}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High-Growth Tenants</CardTitle>
            <TrendingUp className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            {highGrowthTenants.isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <div className="text-2xl font-bold text-orange-600">
                {highGrowthTenants.data?.data.totalHighGrowth || 0}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tenant Usage Ranking */}
      <Card>
        <CardHeader>
          <CardTitle>Tenant Usage Ranking</CardTitle>
          <CardDescription>Top tenants by estimated cost (compute usage)</CardDescription>
        </CardHeader>
        <CardContent>
          {tenantRanking.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-green-600" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>Tenant ID</TableHead>
                  <TableHead className="text-right">Total Events</TableHead>
                  <TableHead className="text-right">Compute Units</TableHead>
                  <TableHead className="text-right">Est. Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenantRanking.data?.data.map((tenant, index) => (
                  <TableRow key={tenant.tenantId}>
                    <TableCell className="font-medium">{index + 1}</TableCell>
                    <TableCell className="font-mono text-sm">{tenant.tenantId}</TableCell>
                    <TableCell className="text-right">{tenant.totalEvents}</TableCell>
                    <TableCell className="text-right">
                      {parseFloat(tenant.totalComputeUnits || "0").toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-green-600">
                      ${(parseFloat(tenant.totalEstimatedCost || "0") / 100).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Monthly Revenue Simulation */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Revenue Simulation - {selectedMonth}</CardTitle>
          <CardDescription>Estimated revenue by tier classification</CardDescription>
        </CardHeader>
        <CardContent>
          {revenueSimulation.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-green-600" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant ID</TableHead>
                  <TableHead>Claims</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Pricing Band</TableHead>
                  <TableHead className="text-right">Est. Revenue</TableHead>
                  <TableHead className="text-right">Profitability</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revenueSimulation.data?.data.tenantClassifications.map((tenant) => (
                  <TableRow key={tenant.tenantId}>
                    <TableCell className="font-mono text-sm">{tenant.tenantId}</TableCell>
                    <TableCell>{tenant.claimsProcessed}</TableCell>
                    <TableCell>{tenant.userCount}</TableCell>
                    <TableCell>
                      <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                        {tenant.tierName}
                      </span>
                    </TableCell>
                    <TableCell>{tenant.pricingBand}</TableCell>
                    <TableCell className="text-right font-semibold text-green-600">
                      ${(tenant.estimatedRevenue / 100).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          tenant.profitabilityScore > 70
                            ? "bg-green-100 text-green-800"
                            : tenant.profitabilityScore > 40
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {tenant.profitabilityScore}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* High-Growth Tenants */}
      <Card>
        <CardHeader>
          <CardTitle>High-Growth Tenants</CardTitle>
          <CardDescription>Tenants with &gt;50% growth in last 3 months</CardDescription>
        </CardHeader>
        <CardContent>
          {highGrowthTenants.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-green-600" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant ID</TableHead>
                  <TableHead className="text-right">Current Events</TableHead>
                  <TableHead className="text-right">Previous Events</TableHead>
                  <TableHead className="text-right">Growth Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {highGrowthTenants.data?.data.highGrowthTenants.map((tenant) => (
                  <TableRow key={tenant.tenantId}>
                    <TableCell className="font-mono text-sm">{tenant.tenantId}</TableCell>
                    <TableCell className="text-right">{tenant.currentEvents}</TableCell>
                    <TableCell className="text-right">{tenant.previousEvents}</TableCell>
                    <TableCell className="text-right">
                      <span className="px-2 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">
                        +{tenant.growthRate}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Cost vs Compute Ratio */}
      <Card>
        <CardHeader>
          <CardTitle>Cost vs Compute Load Ratio</CardTitle>
          <CardDescription>Infrastructure efficiency metrics</CardDescription>
        </CardHeader>
        <CardContent>
          {costComputeRatio.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-green-600" />
            </div>
          ) : (
            <>
              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">Platform Average Cost per Compute Unit</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${costComputeRatio.data?.data.platformAverageCostPerUnit}
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant ID</TableHead>
                    <TableHead className="text-right">Total Events</TableHead>
                    <TableHead className="text-right">Compute Units</TableHead>
                    <TableHead className="text-right">Total Cost</TableHead>
                    <TableHead className="text-right">Cost/Unit</TableHead>
                    <TableHead className="text-right">Avg Processing (ms)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costComputeRatio.data?.data.tenantMetrics.map((tenant) => (
                    <TableRow key={tenant.tenantId}>
                      <TableCell className="font-mono text-sm">{tenant.tenantId}</TableCell>
                      <TableCell className="text-right">{tenant.totalEvents}</TableCell>
                      <TableCell className="text-right">
                        {tenant.totalComputeUnits.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        ${(tenant.totalEstimatedCost / 100).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        ${tenant.costPerComputeUnit}
                      </TableCell>
                      <TableCell className="text-right">
                        {tenant.avgProcessingTime.toFixed(0)}ms
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
