import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TrendingUp, TrendingDown, Award, DollarSign, Clock, CheckCircle } from "lucide-react";

export default function PanelBeaterPerformance() {
  const [selectedPanelBeater, setSelectedPanelBeater] = useState<number | null>(null);

  // getAllPerformance returns { success, data: PanelBeaterPerformance[], pagination }
  const { data: allPerformanceResponse, isLoading } = trpc.panelBeaterAnalytics.getAllPerformance.useQuery({ page: 1, limit: 100 });
  const allPerformance = allPerformanceResponse?.data ?? [];

  // getTopPanelBeaters returns { success, data: ComparisonResult[], rankBy }
  const { data: topPerformersResponse } = trpc.panelBeaterAnalytics.getTopPanelBeaters.useQuery({ limit: 5 });
  const topPerformers = topPerformersResponse?.data ?? [];

  // getTrends returns { success, data: TrendDataPoint[], timeRange, groupBy, panelBeaterId }
  const { data: trendsResponse } = trpc.panelBeaterAnalytics.getTrends.useQuery(
    { panelBeaterId: selectedPanelBeater ?? undefined, timeRange: "90d", groupBy: "month" },
    { enabled: selectedPanelBeater !== null }
  );
  const trends = trendsResponse?.data ?? null;

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading performance data...</p>
        </div>
      </div>
    );
  }

  const getPerformanceBadge = (value: number, threshold: number, reverse: boolean = false) => {
    const isGood = reverse ? value < threshold : value > threshold;
    return isGood ? (
      <Badge variant="default" className="bg-green-500">
        <TrendingUp className="w-3 h-3 mr-1" />
        Excellent
      </Badge>
    ) : (
      <Badge variant="secondary">
        <TrendingDown className="w-3 h-3 mr-1" />
        Needs Improvement
      </Badge>
    );
  };

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Panel Beater Performance Dashboard</h1>
        <p className="text-muted-foreground">
          Comprehensive analytics for panel beater performance, cost competitiveness, and quality metrics
        </p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="detailed">Detailed Metrics</TabsTrigger>
          <TabsTrigger value="top-performers">Top Performers</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Panel Beaters
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{allPerformance.length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Average Completion Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {allPerformance.length > 0
                    ? Math.round(
                        allPerformance.reduce((sum: number, p: any) => sum + (p.completionRate ?? 0), 0) /
                          allPerformance.length
                      )
                    : 0}
                  %
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Avg Repair Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {allPerformance.length > 0
                    ? Math.round(
                        allPerformance.reduce((sum: number, p: any) => sum + (p.avgRepairTimeDays ?? 0), 0) /
                          allPerformance.length
                      )
                    : 0}{" "}
                  days
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Claims Completed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {allPerformance.reduce((sum: number, p: any) => sum + (p.totalClaimsCompleted ?? 0), 0)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Performance Table */}
          <Card>
            <CardHeader>
              <CardTitle>Panel Beater Performance Overview</CardTitle>
              <CardDescription>
                Click on a panel beater to view detailed performance trends
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Panel Beater</TableHead>
                    <TableHead className="text-right">Quotes Submitted</TableHead>
                    <TableHead className="text-right">Completion Rate</TableHead>
                    <TableHead className="text-right">Avg Quote</TableHead>
                    <TableHead className="text-right">Avg Repair Time</TableHead>
                    <TableHead>Performance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allPerformance.map((pb: any) => (
                    <TableRow
                      key={pb.panelBeaterId}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedPanelBeater(pb.panelBeaterId)}
                    >
                      <TableCell className="font-medium">
                        <div>
                          <div>{pb.businessName || pb.panelBeaterName}</div>
                          <div className="text-sm text-muted-foreground">{pb.panelBeaterName}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{pb.totalQuotesSubmitted ?? 0}</TableCell>
                      <TableCell className="text-right">
                        <span className="font-semibold">{pb.completionRate ?? 0}%</span>
                      </TableCell>
                      <TableCell className="text-right">
                        US${(pb.avgQuoteAmount ?? pb.avgCostPerClaim ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">{pb.avgRepairTimeDays ?? 0} days</TableCell>
                      <TableCell>{getPerformanceBadge(pb.completionRate ?? 0, 70)}</TableCell>
                    </TableRow>
                  ))}
                  {allPerformance.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No panel beater data available yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="detailed" className="space-y-6">
          {selectedPanelBeater && trends && trends.length > 0 ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Performance Trends (Last 3 Months)</CardTitle>
                  <CardDescription>
                    Monthly performance metrics for{" "}
                    {allPerformance.find((p: any) => p.panelBeaterId === selectedPanelBeater)?.businessName}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period</TableHead>
                        <TableHead className="text-right">Claims Completed</TableHead>
                        <TableHead className="text-right">Completion Rate</TableHead>
                        <TableHead className="text-right">Avg Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trends.map((trend: any, idx: number) => (
                        <TableRow key={trend.period ?? idx}>
                          <TableCell className="font-medium">{trend.period}</TableCell>
                          <TableCell className="text-right">{trend.claimsCompleted ?? 0}</TableCell>
                          <TableCell className="text-right">{trend.completionRate ?? 0}%</TableCell>
                          <TableCell className="text-right">
                            US${(trend.avgCost ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  {selectedPanelBeater
                    ? "No trend data available for this panel beater yet"
                    : "Select a panel beater from the Overview tab to view detailed trends"}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="top-performers" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {topPerformers.map((pb: any, index: number) => (
              <Card key={pb.panelBeaterId} className="relative overflow-hidden">
                {index === 0 && (
                  <div className="absolute top-0 right-0 p-2">
                    <Award className="w-8 h-8 text-yellow-500" />
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>#{index + 1}</span>
                    <Badge variant="outline">Rank {index + 1}</Badge>
                  </CardTitle>
                  <CardDescription className="text-lg font-semibold text-foreground">
                    {pb.businessName || pb.panelBeaterName}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-muted-foreground">Completion Rate</span>
                    </div>
                    <span className="font-semibold">{pb.completionRate ?? 0}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-primary/80" />
                      <span className="text-sm text-muted-foreground">Avg Cost/Claim</span>
                    </div>
                    <span className="font-semibold">
                      US${(pb.avgCostPerClaim ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-orange-500" />
                      <span className="text-sm text-muted-foreground">Avg Repair Time</span>
                    </div>
                    <span className="font-semibold">{pb.avgRepairTimeDays ?? 0} days</span>
                  </div>
                  <div className="pt-4 border-t">
                    <div className="text-sm text-muted-foreground">Claims Completed</div>
                    <div className="text-2xl font-bold">{pb.totalClaimsCompleted ?? 0}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {topPerformers.length === 0 && (
              <Card className="col-span-3">
                <CardContent className="py-12 text-center text-muted-foreground">
                  No top performer data available yet
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
