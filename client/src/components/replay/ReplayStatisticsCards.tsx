/**
 * Replay Statistics Cards
 * 
 * Aggregate metrics across all replay results.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, PlayCircle, CheckCircle2, TrendingDown, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc";

export function ReplayStatisticsCards() {
  const { data: stats, isLoading } = trpc.claimReplay.getReplayStatistics.useQuery();
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  if (!stats) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No replay statistics available</p>
      </div>
    );
  }
  
  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {/* Total Replays */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Replays</CardTitle>
          <PlayCircle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalReplays}</div>
          <p className="text-xs text-muted-foreground">
            Historical claims processed
          </p>
        </CardContent>
      </Card>
      
      {/* Decision Match Rate */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Decision Match Rate</CardTitle>
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.decisionMatchRate.toFixed(1)}%</div>
          <p className="text-xs text-muted-foreground">
            {Math.round((stats.decisionMatchRate / 100) * stats.totalReplays)} of {stats.totalReplays} matched
          </p>
        </CardContent>
      </Card>
      
      {/* Average Payout Variance */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg Payout Variance</CardTitle>
          <TrendingDown className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatCurrency(Math.abs(stats.averagePayoutVariancePercentage))}
          </div>
          <p className="text-xs text-muted-foreground">
            {stats.averagePayoutVariancePercentage < 0 ? 'Savings' : 'Cost increase'} ({stats.averagePayoutVariancePercentage.toFixed(1)}%)
          </p>
        </CardContent>
      </Card>
      
      {/* Average Time Delta */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg Time Delta</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats.averageProcessingTimeDeltaPercentage !== null 
              ? `${stats.averageProcessingTimeDeltaPercentage.toFixed(1)}%`
              : 'N/A'
            }
          </div>
          <p className="text-xs text-muted-foreground">
            {stats.averageProcessingTimeDeltaPercentage !== null && stats.averageProcessingTimeDeltaPercentage < 0
              ? 'Faster processing'
              : stats.averageProcessingTimeDeltaPercentage !== null && stats.averageProcessingTimeDeltaPercentage > 0
              ? 'Slower processing'
              : 'No data'
            }
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
