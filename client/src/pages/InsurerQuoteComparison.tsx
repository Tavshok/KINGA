import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  DollarSign,
  Clock,
  Shield,
  FileText,
} from "lucide-react";
import { ReportGenerationDialog } from "@/components/ReportGenerationDialog";

export default function InsurerQuoteComparison() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const claimId = params.id ? parseInt(params.id) : 0;

  const { data: optimization, isLoading } = trpc.insurers.getCostOptimization.useQuery(
    { claimId },
    { enabled: claimId > 0 }
  );

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!optimization) {
    return (
      <div className="container mx-auto py-8">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            No optimization data available for this claim. Ensure quotes have been submitted.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const {
    quotes,
    lowestQuote,
    highestQuote,
    medianCost,
    averageCost,
    costSpread,
    componentComparisons,
    negotiationTargets,
    fraudFlags,
    suspiciousPatterns,
    recommendedQuote,
    potentialSavings,
    riskLevel,
  } = optimization;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount / 100);
  };

  const getVarianceBadge = (variance: number) => {
    if (variance <= 15) return <Badge className="bg-green-600">Low Variance</Badge>;
    if (variance <= 30) return <Badge className="bg-yellow-600">Moderate Variance</Badge>;
    return <Badge className="bg-red-600">High Variance</Badge>;
  };

  const getRiskBadge = (level: string) => {
    if (level === "low") return <Badge className="bg-green-600">Low Risk</Badge>;
    if (level === "medium") return <Badge className="bg-yellow-600">Medium Risk</Badge>;
    return <Badge className="bg-red-600">High Risk</Badge>;
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation(`/insurer/comparison/${claimId}`)}
            className="mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Comparison View
          </Button>
          <h1 className="text-3xl font-bold">Quote Optimization Analysis</h1>
          <p className="text-muted-foreground">
            Claim #{claimId} • {quotes.length} quotes received
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-green-600" />
              Lowest Quote
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(lowestQuote.totalCost)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {lowestQuote.panelBeaterName}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Median Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(medianCost)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Average: {formatCurrency(averageCost)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-red-600" />
              Cost Spread
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(costSpread)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {((costSpread / medianCost) * 100).toFixed(1)}% variance
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Fraud Risk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {fraudFlags.length > 0 ? (
                <span className="text-red-600">{fraudFlags.length}</span>
              ) : (
                <span className="text-green-600">0</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {fraudFlags.length > 0 ? "Flags detected" : "No flags"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Fraud Alerts */}
      {fraudFlags.length > 0 && (
        <Alert className="border-red-600 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription>
            <strong className="text-red-600">Fraud Risk Detected:</strong>
            <ul className="list-disc list-inside mt-2 space-y-1">
              {fraudFlags.map((flag: any, idx: number) => (
                <li key={idx} className="text-sm">
                  {flag.panelBeaterName}: {flag.reason} ({flag.severity} risk)
                </li>
              ))}
            </ul>
            {suspiciousPatterns.length > 0 && (
              <p className="text-sm mt-2">
                <strong>Patterns:</strong> {suspiciousPatterns.join(", ")}
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="quotes" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="quotes">All Quotes</TabsTrigger>
          <TabsTrigger value="components">Component Analysis</TabsTrigger>
          <TabsTrigger value="negotiation">Negotiation Strategy</TabsTrigger>
          <TabsTrigger value="recommendation">Recommendation</TabsTrigger>
        </TabsList>

        {/* All Quotes Tab */}
        <TabsContent value="quotes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quote Comparison</CardTitle>
              <CardDescription>
                Side-by-side comparison of all received quotes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Panel Beater</TableHead>
                    <TableHead>Total Cost</TableHead>
                    <TableHead>Parts Quality</TableHead>
                    <TableHead>Warranty</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Variance</TableHead>
                    <TableHead>Risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotes.map((quote: any) => {
                    const variance = ((Math.abs(quote.totalCost - medianCost) / medianCost) * 100);
                    const isLowest = quote.quoteId === lowestQuote.quoteId;
                    const isHighest = quote.quoteId === highestQuote.quoteId;

                    return (
                      <TableRow
                        key={quote.quoteId}
                        className={isLowest ? "bg-green-50" : isHighest ? "bg-red-50" : ""}
                      >
                        <TableCell className="font-medium">
                          {quote.panelBeaterName}
                          {isLowest && (
                            <Badge className="ml-2 bg-green-600">Lowest</Badge>
                          )}
                          {isHighest && (
                            <Badge className="ml-2 bg-red-600">Highest</Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-semibold">
                          {formatCurrency(quote.totalCost)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{quote.partsQuality}</Badge>
                        </TableCell>
                        <TableCell>{quote.warrantyMonths} months</TableCell>
                        <TableCell>{quote.estimatedDuration} days</TableCell>
                        <TableCell>{getVarianceBadge(variance)}</TableCell>
                        <TableCell>
                          {getRiskBadge(quote.riskLevel || "low")}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Component Analysis Tab */}
        <TabsContent value="components" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Component-Level Breakdown</CardTitle>
              <CardDescription>
                Detailed comparison of individual components across quotes
              </CardDescription>
            </CardHeader>
            <CardContent>
              {componentComparisons.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No component-level data available. Quotes may not include detailed breakdowns.
                </p>
              ) : (
                <div className="space-y-6">
                  {componentComparisons.map((comp: any, idx: number) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-lg border ${
                        comp.flagged ? "border-red-300 bg-red-50" : "border-gray-200"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-lg">{comp.componentName}</h3>
                        <div className="flex items-center gap-2">
                          {getVarianceBadge(comp.variance)}
                          {comp.flagged && (
                            <Badge className="bg-red-600">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Flagged
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Lowest</p>
                          <p className="font-semibold text-green-600">
                            {formatCurrency(comp.lowestCost)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Median</p>
                          <p className="font-semibold">{formatCurrency(comp.medianCost)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Highest</p>
                          <p className="font-semibold text-red-600">
                            {formatCurrency(comp.highestCost)}
                          </p>
                        </div>
                      </div>

                      {comp.flagged && comp.notes && (
                        <Alert className="mt-3 border-yellow-600 bg-yellow-50">
                          <AlertDescription className="text-sm">
                            {comp.notes}
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Negotiation Strategy Tab */}
        <TabsContent value="negotiation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Negotiation Targets</CardTitle>
              <CardDescription>
                Strategic talking points for cost reduction discussions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {negotiationTargets.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-3" />
                  <p className="font-semibold">No negotiation needed</p>
                  <p className="text-sm text-muted-foreground">
                    All quotes are within acceptable variance range
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {negotiationTargets.map((target: any, idx: number) => (
                    <div key={idx} className="p-4 rounded-lg border border-primary/20 bg-primary/5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-lg">{target.panelBeaterName}</h3>
                        <Badge className="bg-primary">
                          Save {formatCurrency(target.potentialSavings)}
                        </Badge>
                      </div>

                      <div className="mb-3">
                        <p className="text-sm text-muted-foreground">Target Price</p>
                        <p className="text-2xl font-bold text-primary">
                          {formatCurrency(target.targetPrice)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Current: {formatCurrency(target.currentPrice)} (
                          {target.variancePercentage.toFixed(1)}% above median)
                        </p>
                      </div>

                      <div>
                        <p className="font-medium mb-2">Talking Points:</p>
                        <ul className="list-disc list-inside space-y-1 text-sm">
                          {target.talkingPoints.map((point: string, pidx: number) => (
                            <li key={pidx}>{point}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recommendation Tab */}
        <TabsContent value="recommendation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Recommendation</CardTitle>
              <CardDescription>
                AI-powered decision support based on cost, quality, and risk analysis
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-6 rounded-lg border-2 border-green-600 bg-green-50">
                <div className="flex items-start gap-4">
                  <CheckCircle2 className="h-8 w-8 text-green-600 flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-green-900 mb-2">
                      Recommended: {recommendedQuote.panelBeaterName}
                    </h3>
                    <p className="text-green-800 mb-4">
                      Based on optimal balance of cost, quality ({recommendedQuote.partsQuality}), 
                      warranty ({recommendedQuote.warrantyMonths} months), and completion time ({recommendedQuote.estimatedDuration} days).
                    </p>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-green-700 font-medium">Total Cost</p>
                        <p className="text-2xl font-bold text-green-900">
                          {formatCurrency(recommendedQuote.totalCost)}
                        </p>
                      </div>
                      <div>
                        <p className="text-green-700 font-medium">Potential Savings</p>
                        <p className="text-2xl font-bold text-green-900">
                          {formatCurrency(potentialSavings)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {riskLevel !== 'low' && (
                <Alert className="border-yellow-600 bg-yellow-50">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription>
                    <strong className="text-yellow-900">Risk Assessment:</strong>
                    <p className="text-yellow-800 mt-1">
                      This claim has {riskLevel} risk level. Consider additional verification before approval.
                    </p>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-3">
                <Button className="flex-1 bg-green-600 hover:bg-green-700">
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Approve Recommendation
                </Button>
                <Button variant="outline" className="flex-1">
                  <FileText className="h-4 w-4 mr-2" />
                  Request Revision
                </Button>
                <ReportGenerationDialog
                  claimId={claimId.toString()}
                  claimNumber={`CLM-${claimId}`}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
