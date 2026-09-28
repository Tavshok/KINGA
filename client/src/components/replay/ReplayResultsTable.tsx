/**
 * Replay Results Table
 * 
 * Paginated table of replay results with expandable comparison view.
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { 
  CheckCircle2, XCircle, ChevronDown, ChevronUp, Loader2 
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ReplayComparisonView } from "./ReplayComparisonView";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { getP0B1FraudDecisionHold } from "@shared/p0FraudDecisionHoldPresentation";

export function ReplayResultsTable() {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const limit = 10;
  const { fmt: formatCurrency } = useTenantCurrency();
  
  const { data: results, isLoading } = trpc.claimReplay.getAllReplayResults.useQuery({
    limit,
    offset: page * limit,
  });
  
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }
  
  const fraudDecisionHold = getP0B1FraudDecisionHold(results);
  if (fraudDecisionHold) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Replay Results Withheld</CardTitle>
          <CardDescription>{fraudDecisionHold.explanation}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{fraudDecisionHold.resolver.unresolvedAction}</p>
        </CardContent>
      </Card>
    );
  }
  
  return (
      <Card>
        <CardHeader>
        <CardTitle>Replay Results Unavailable</CardTitle>
        <CardDescription>Historical replay results are not available without qualified governing fraud authority.</CardDescription>
        </CardHeader>
      </Card>
  );
}
