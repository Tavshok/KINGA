import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

  // Fetch all panel beater performance data
  const { data: allPerformance, isLoading } = trpc.panelBeaterAnalytics.getAllPerformance.useQuery();
  const { data: topPerformers } = trpc.panelBeaterAnalytics.getTopPerformers.useQuery({ limit: 5 });

  // Fetch trends for selected panel beater
  const { data: trends } = trpc.panelBeaterAnalytics.getTrends.useQuery(
    { panelBeaterId: selectedPanelBeater!, months: 6 },
    { enabled: selectedPanelBeater !== null }
  );

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
                <div className="text-3xl font-bold">{allPerformance?.length || 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Average Acceptance Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {allPerformance && allPerformance.length > 0
                    ? Math.round(
                        allPerformance.reduce((sum, p) => sum + p.acceptanceRate, 0) /
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
                  Avg Turnaround Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {allPerformance && allPerformance.length > 0
                    ? Math.round(
                        allPerformance.reduce((sum, p) => sum + p.averageTurnaroundDays, 0) /
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
                  Total Repairs Completed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {allPerformance?.reduce((sum, p) => sum + p.totalRepairsCompleted, 0) || 0}
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
                    <TableHead className="text-right">Acceptance Rate</TableHead>
                    <TableHead className="text-right">Avg Quote</TableHead>
                    <TableHead className="text-right">Cost Index</TableHead>
                    <TableHead className="text-right">Avg Turnaround</TableHead>
                    <TableHead>Performance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allPerformance?.map((pb) => (
                    <TableRow
                      key={pb.panelBeaterId}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedPanelBeater(pb.panelBeaterId)}
                    >
                      <TableCell className="font-medium">
                        <div>
                          <div>{pb.businessName}</div>
                          <div className="text-sm text-muted-foreground">{pb.panelBeaterName}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{pb.totalQuotesSubmitted}</TableCell>
                      <TableCell className="text-right">
                        <span className="font-semibold">{pb.acceptanceRate}%</span>
                      </TableCell>
                      <TableCell className="text-right">
                        R{(pb.averageQuoteAmount / 100).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={pb.costCompetitivenessIndex >= 100 ? "default" : "secondary"}>
                          {pb.costCompetitivenessIndex}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{pb.averageTurnaroundDays} days</TableCell>
                      <TableCell>{getPerformanceBadge(pb.acceptanceRate, 70)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="detailed" className="space-y-6">
          {selectedPanelBeater && trends ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Performance Trends (Last 6 Months)</CardTitle>
                  <CardDescription>
                    Monthly performance metrics for{" "}
                    {allPerformance?.find((p) => p.panelBeaterId === selectedPanelBeater)?.businessName}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead className="text-right">Quotes Submitted</TableHead>
                        <TableHead className="text-right">Acceptance Rate</TableHead>
                        <TableHead className="text-right">Average Quote</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trends.map((trend) => (
                        <TableRow key={trend.month}>
                          <TableCell className="font-medium">{trend.month}</TableCell>
                          <TableCell className="text-right">{trend.quotesSubmitted}</TableCell>
                          <TableCell className="text-right">{trend.acceptanceRate}%</TableCell>
                          <TableCell className="text-right">
                            R{(trend.averageQuote / 100).toFixed(2)}
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
                  Select a panel beater from the Overview tab to view detailed trends
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="top-performers" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {topPerformers?.map((pb, index) => (
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
                    {pb.businessName}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-muted-foreground">Acceptance Rate</span>
                    </div>
                    <span className="font-semibold">{pb.acceptanceRate}%</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-primary/80" />
                      <span className="text-sm text-muted-foreground">Cost Index</span>
                    </div>
                    <Badge variant={pb.costCompetitivenessIndex >= 100 ? "default" : "secondary"}>
                      {pb.costCompetitivenessIndex}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-orange-500" />
                      <span className="text-sm text-muted-foreground">Avg Turnaround</span>
                    </div>
                    <span className="font-semibold">{pb.averageTurnaroundDays} days</span>
                  </div>

                  <div className="pt-4 border-t">
                    <div className="text-sm text-muted-foreground">Total Repairs</div>
                    <div className="text-2xl font-bold">{pb.totalRepairsCompleted}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
