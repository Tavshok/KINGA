/**
 * Replay Statistics Cards
 * 
 * Aggregate metrics across all replay results.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, PlayCircle, CheckCircle2, TrendingDown, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { getP0B1FraudDecisionHold } from "@shared/p0FraudDecisionHoldPresentation";

export function ReplayStatisticsCards() {
  const { fmt: formatCurrency } = useTenantCurrency();
  const { data: stats, isLoading } = trpc.claimReplay.getReplayStatistics.useQuery();
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  const fraudDecisionHold = getP0B1FraudDecisionHold(stats);
  if (fraudDecisionHold) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Replay Statistics Withheld</CardTitle>
          <CardDescription>{fraudDecisionHold.explanation}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{fraudDecisionHold.resolver.unresolvedAction}</p>
        </CardContent>
      </Card>
    );
  }
      
  if (!stats) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No replay statistics available</p>
          </div>
    );
  }
      
  return (
      <Card>
      <CardHeader>
        <CardTitle>Replay Statistics Unavailable</CardTitle>
        <CardDescription>Replay statistics are not available without qualified governing fraud authority.</CardDescription>
        </CardHeader>
      </Card>
  );
}
