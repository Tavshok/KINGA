/**
 * Replay Comparison View
 * 
 * Side-by-side comparison of original decision vs KINGA routing decision.
 * Displays decision match, payout variance, processing time delta, and performance summary.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  CheckCircle2, XCircle, TrendingUp, TrendingDown, Clock, 
  DollarSign, AlertTriangle, ThumbsUp, ThumbsDown 
} from "lucide-react";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

interface ReplayResult {
  id: number;
  historicalClaimId: number;
  replayedAt: Date;
  
  // Original decision
  originalDecision: string;
  originalPayout: number;
  originalProcessingTime: number | null;
  originalAssessor: string | null;
  
  // KINGA AI results
  kingaDamageScore: number;
  kingaCostEstimate: number;
  kingaFraudScore: number;
  kingaConfidence: number;
  
  // KINGA routing
  kingaRoutingDecision: string;
  kingaPredictedPayout: number;
  kingaEstimatedProcessingTime: number | null;
  
  // Comparison metrics
  decisionMatch: boolean;
  payoutVarianceAmount: number;
  payoutVariancePercent: number;
  processingTimeDelta: number | null;
  
  // Analysis
  confidenceLevel: string;
  fraudRiskLevel: string;
  performanceSummary: string;
  recommendedAction: string;
}

interface ReplayComparisonViewProps {
  result: ReplayResult;
}

export function ReplayComparisonView({ result }: ReplayComparisonViewProps) {
  const { fmt: formatCurrency } = useTenantCurrency();
  const formatTime = (hours: number | null) => hours ? `${hours.toFixed(1)}h` : "N/A";
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold">Replay Result #{result.id}</h3>
          <p className="text-sm text-muted-foreground">
            Historical Claim ID: {result.historicalClaimId} | 
            Replayed: {new Date(result.replayedAt).toLocaleString()}
          </p>
        </div>
        <Badge variant={result.decisionMatch ? "default" : "destructive"} className="text-sm">
          {result.decisionMatch ? (
            <><CheckCircle2 className="h-4 w-4 mr-1" /> Decision Match</>
          ) : (
            <><XCircle className="h-4 w-4 mr-1" /> Decision Mismatch</>
          )}
        </Badge>
      </div>
      
      {/* Side-by-Side Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Original Decision Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Original Decision
            </CardTitle>
            <CardDescription>Historical decision from legacy system</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground">Decision</div>
              <div className="text-lg font-semibold">{result.originalDecision}</div>
            </div>
            
            <div>
              <div className="text-sm text-muted-foreground">Payout</div>
              <div className="text-lg font-semibold">{formatCurrency(result.originalPayout)}</div>
            </div>
            
            <div>
              <div className="text-sm text-muted-foreground">Processing Time</div>
              <div className="text-lg font-semibold">{formatTime(result.originalProcessingTime)}</div>
            </div>
            
            {result.originalAssessor && (
              <div>
                <div className="text-sm text-muted-foreground">Assessor</div>
                <div className="text-lg font-semibold">{result.originalAssessor}</div>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* KINGA Decision Card */}
        <Card className="border-emerald-200 dark:border-emerald-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <ThumbsUp className="h-5 w-5" />
              KINGA AI Routing
            </CardTitle>
            <CardDescription>AI-powered routing decision</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground">Decision</div>
              <div className="text-lg font-semibold">{result.kingaRoutingDecision}</div>
            </div>
            
            <div>
              <div className="text-sm text-muted-foreground">Predicted Payout</div>
              <div className="text-lg font-semibold">{formatCurrency(result.kingaPredictedPayout)}</div>
            </div>
            
            <div>
              <div className="text-sm text-muted-foreground">Estimated Processing Time</div>
              <div className="text-lg font-semibold">{formatTime(result.kingaEstimatedProcessingTime)}</div>
            </div>
            
            <div className="grid grid-cols-2 gap-2 pt-2 border-t">
              <div>
                <div className="text-xs text-muted-foreground">Confidence</div>
                <div className="text-sm font-medium">{(result.kingaConfidence * 100).toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Fraud Score</div>
                <div className="text-sm font-medium">{(result.kingaFraudScore * 100).toFixed(1)}%</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Comparison Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Comparison Metrics</CardTitle>
          <CardDescription>Delta analysis between original and KINGA decisions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Payout Variance */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Payout Variance</span>
              </div>
              <div className="flex items-center gap-2">
                {result.payoutVarianceAmount < 0 ? (
                  <TrendingDown className="h-5 w-5 text-green-600" />
                ) : result.payoutVarianceAmount > 0 ? (
                  <TrendingUp className="h-5 w-5 text-red-600" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-gray-600 dark:text-muted-foreground" />
                )}
                <div>
                  <div className="text-2xl font-bold">
                    {result.payoutVarianceAmount < 0 ? '-' : '+'}{formatCurrency(Math.abs(result.payoutVarianceAmount))}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {result.payoutVariancePercent.toFixed(1)}% variance
                  </div>
                </div>
              </div>
            </div>
            
            {/* Processing Time Delta */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Processing Time Delta</span>
              </div>
              <div className="flex items-center gap-2">
                {result.processingTimeDelta !== null && result.processingTimeDelta < 0 ? (
                  <TrendingDown className="h-5 w-5 text-green-600" />
                ) : result.processingTimeDelta !== null && result.processingTimeDelta > 0 ? (
                  <TrendingUp className="h-5 w-5 text-red-600" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-gray-600 dark:text-muted-foreground" />
                )}
                <div>
                  <div className="text-2xl font-bold">
                    {result.processingTimeDelta !== null ? (
                      `${result.processingTimeDelta < 0 ? '-' : '+'}${Math.abs(result.processingTimeDelta).toFixed(1)}h`
                    ) : 'N/A'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {result.processingTimeDelta !== null && result.processingTimeDelta < 0 ? 'Faster' : 
                     result.processingTimeDelta !== null && result.processingTimeDelta > 0 ? 'Slower' : 'No data'}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Confidence & Risk */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Risk Assessment</span>
              </div>
              <div className="space-y-2">
                <div>
                  <div className="text-sm text-muted-foreground">Confidence Level</div>
                  <Badge variant={result.confidenceLevel === 'HIGH' ? 'default' : result.confidenceLevel === 'MEDIUM' ? 'secondary' : 'outline'}>
                    {result.confidenceLevel}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Fraud Risk</div>
                  <Badge variant={result.fraudRiskLevel === 'HIGH' ? 'destructive' : result.fraudRiskLevel === 'MEDIUM' ? 'secondary' : 'outline'}>
                    {result.fraudRiskLevel}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Performance Summary */}
      <Alert>
        <AlertDescription>
          <div className="space-y-2">
            <div className="font-medium">Performance Summary</div>
            <p className="text-sm">{result.performanceSummary}</p>
            <div className="flex items-center gap-2 pt-2">
              <Badge variant="outline">{result.recommendedAction}</Badge>
            </div>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}
