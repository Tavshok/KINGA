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

export function ReplayResultsTable() {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const limit = 10;
  
  const { data: results, isLoading } = trpc.claimReplay.getAllReplayResults.useQuery({
    limit,
    offset: page * limit,
  });
  
  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }
  
  if (!results || results.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Replay Results</CardTitle>
          <CardDescription>No replay results found</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            Trigger a replay to see results here
          </p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Replay Results</CardTitle>
          <CardDescription>
            Click any row to view detailed comparison
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Claim ID</TableHead>
                <TableHead>Replayed At</TableHead>
                <TableHead>Decision Match</TableHead>
                <TableHead>Payout Variance</TableHead>
                <TableHead>Recommended Action</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((result) => (
                <>
                  <TableRow
                    key={result.id}
                    className="cursor-pointer hover:bg-accent"
                    onClick={() => setExpandedId(expandedId === result.id ? null : result.id)}
                  >
                    <TableCell className="font-medium">
                      {result.historicalClaimId}
                    </TableCell>
                    <TableCell>
                      {new Date(result.replayedAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {result.decisionMatch ? (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Match
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <XCircle className="h-3 w-3" />
                          Mismatch
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={result.payoutVarianceAmount < 0 ? "text-green-600" : result.payoutVarianceAmount > 0 ? "text-red-600" : ""}>
                        {result.payoutVarianceAmount < 0 ? '-' : '+'}{formatCurrency(Math.abs(result.payoutVarianceAmount))}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">
                        ({result.payoutVariancePercent.toFixed(1)}%)
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{result.recommendedAction}</Badge>
                    </TableCell>
                    <TableCell>
                      {expandedId === result.id ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </TableCell>
                  </TableRow>
                  
                  {expandedId === result.id && (
                    <TableRow>
                      <TableCell colSpan={6} className="bg-accent/50">
                        <div className="py-4">
                          <ReplayComparisonView result={result} />
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {/* Pagination */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0}
        >
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {page + 1}
        </span>
        <Button
          variant="outline"
          onClick={() => setPage(page + 1)}
          disabled={results.length < limit}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
