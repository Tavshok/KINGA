/**
 * AI Re-Analysis Panel Component
 * 
 * Displays AI version history and allows all insurer roles to trigger re-analysis
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Brain, 
  RefreshCw, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Clock,
  User,
  AlertCircle,
  CheckCircle,
  ArrowRight
} from "lucide-react";
import { format } from "date-fns";
import { useTenantCurrency } from '@/hooks/useTenantCurrency';

interface AiReanalysisPanelProps {
  claimId: number;
}

export function AiReanalysisPanel({ claimId }: AiReanalysisPanelProps) {
  const [reanalysisDialogOpen, setReanalysisDialogOpen] = useState(false);
  const { fmt } = useTenantCurrency();
  const [comparisonDialogOpen, setComparisonDialogOpen] = useState(false);
  const [reanalysisReason, setReanalysisReason] = useState("");
  const [selectedVersions, setSelectedVersions] = useState<[number, number] | null>(null);

  // Fetch AI version history
  const { data: versionHistory, isLoading, refetch } = trpc.aiReanalysis.getVersionHistory.useQuery({ claimId });

  // Re-run AI analysis mutation
  const reRunAiAnalysis = trpc.aiReanalysis.reRunAiAnalysis.useMutation({
    onSuccess: (result) => {
      toast.success("AI Re-Analysis Complete", {
        description: result.message,
      });
      setReanalysisDialogOpen(false);
      setReanalysisReason("");
      refetch();
    },
    onError: (error: any) => {
      toast.error("AI Re-Analysis Failed", {
        description: error.message,
      });
    },
  });

  // Compare versions query
  const { data: comparison, isLoading: comparisonLoading } = trpc.aiReanalysis.compareVersions.useQuery(
    {
      assessmentId1: selectedVersions?.[0] || 0,
      assessmentId2: selectedVersions?.[1] || 0,
    },
    {
      enabled: !!selectedVersions && comparisonDialogOpen,
    }
  );

  const handleReanalyze = () => {
    reRunAiAnalysis.mutate({
      claimId,
      reason: reanalysisReason || undefined,
    });
  };

  const handleCompare = (version1Id: number, version2Id: number) => {
    setSelectedVersions([version1Id, version2Id]);
    setComparisonDialogOpen(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            KINGA Assessment History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading version history...</p>
        </CardContent>
      </Card>
    );
  }

  const versions = versionHistory?.versions || [];
  const originalVersion = versions.find((v: any) => !v.isReanalysis);
  const reanalyses = versions.filter((v: any) => v.isReanalysis);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                KINGA Assessment History
              </CardTitle>
              <CardDescription>
                {versions.length} version{versions.length !== 1 ? "s" : ""} available
              </CardDescription>
            </div>
            <Dialog open={reanalysisDialogOpen} onOpenChange={setReanalysisDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Run AI Re-Analysis
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Run AI Re-Analysis</DialogTitle>
                  <DialogDescription>
                    Trigger a new AI assessment for this claim. This will not affect the workflow state or overwrite the original assessment.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="reason">Reason for Re-Analysis (Optional)</Label>
                    <Textarea
                      id="reason"
                      placeholder="e.g., New evidence submitted, discrepancy in initial assessment, quality review"
                      value={reanalysisReason}
                      onChange={(e) => setReanalysisReason(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                    <div className="text-sm text-amber-800 dark:text-amber-200">
                      <p className="font-medium">Safeguards in Place</p>
                      <ul className="mt-1 space-y-1 text-xs">
                        <li>• Maximum 5 re-analyses per claim per day</li>
                        <li>• Cannot re-analyze cancelled claims</li>
                        <li>• Prevents simultaneous execution</li>
                      </ul>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setReanalysisDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleReanalyze} disabled={reRunAiAnalysis.isPending}>
                    {reRunAiAnalysis.isPending ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Brain className="h-4 w-4 mr-2" />
                        Run Analysis
                      </>
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Original Assessment */}
            {originalVersion && (
              <div className="border-l-4 border-l-blue-500 pl-4 py-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="default">Original</Badge>
                    <span className="text-sm font-medium">Version #{originalVersion.versionNumber}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(originalVersion.createdAt), "MMM d, yyyy 'at' h:mm a")}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Confidence Score</p>
                    <p className="font-medium">{originalVersion.confidenceScore}%</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Estimated Cost</p>
                    <p className="font-medium">{fmt((originalVersion.estimatedCost || 0) * 100)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Fraud Risk</p>
                    <Badge variant={originalVersion.fraudRiskLevel === "high" ? "destructive" : "secondary"}>
                      {originalVersion.fraudRiskLevel}
                    </Badge>
                  </div>
                </div>
              </div>
            )}

            {/* Re-analyses */}
            {reanalyses.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">Re-Analysis History</h4>
                {reanalyses.map((version: any, index: number) => (
                  <div key={version.id} className="border-l-4 border-l-green-500 pl-4 py-2 bg-slate-50 dark:bg-muted/50 rounded-r-md">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Re-analysis #{index + 1}</Badge>
                        <span className="text-sm font-medium">Version #{version.versionNumber}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(version.createdAt), "MMM d, yyyy 'at' h:mm a")}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm mb-2">
                      <div>
                        <p className="text-muted-foreground">Confidence Score</p>
                        <p className="font-medium flex items-center gap-1">
                          {version.confidenceScore}%
                          {originalVersion && version.confidenceScore !== null && originalVersion.confidenceScore !== null && (
                            <>
                              {version.confidenceScore > originalVersion.confidenceScore && (
                                <TrendingUp className="h-3 w-3 text-green-600" />
                              )}
                              {version.confidenceScore < originalVersion.confidenceScore && (
                                <TrendingDown className="h-3 w-3 text-red-600" />
                              )}
                              {version.confidenceScore === originalVersion.confidenceScore && (
                                <Minus className="h-3 w-3 text-gray-600 dark:text-muted-foreground" />
                              )}
                            </>
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Estimated Cost</p>
                        <p className="font-medium">{fmt((version.estimatedCost || 0) * 100)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Fraud Risk</p>
                        <Badge variant={version.fraudRiskLevel === "high" ? "destructive" : "secondary"}>
                          {version.fraudRiskLevel}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span>{version.triggeredRole?.replace(/_/g, " ").toUpperCase()}</span>
                      </div>
                      {version.reanalysisReason && (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span className="italic">{version.reanalysisReason}</span>
                        </div>
                      )}
                    </div>
                    {originalVersion && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                        onClick={() => handleCompare(originalVersion.id, version.id)}
                      >
                        <ArrowRight className="h-3 w-3 mr-1" />
                        Compare with Original
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {reanalyses.length === 0 && originalVersion && (
              <div className="text-center py-6 text-sm text-muted-foreground">
                <p>No re-analyses yet. Click "Run AI Re-Analysis" to create a new version.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Comparison Dialog */}
      <Dialog open={comparisonDialogOpen} onOpenChange={setComparisonDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>KINGA Assessment Comparison</DialogTitle>
            <DialogDescription>
              Comparing Version #{comparison?.assessment1.versionNumber} (Original) with Version #{comparison?.assessment2.versionNumber} (Re-analysis)
            </DialogDescription>
          </DialogHeader>
          {comparisonLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading comparison...</div>
          ) : comparison ? (
            <div className="space-y-6">
              {/* Key Differences */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Key Differences</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium mb-2">Cost Difference</p>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold">
                        ${Math.abs(comparison.differences.costDiff).toFixed(2)}
                      </span>
                      {comparison.differences.costDiff > 0 ? (
                        <Badge variant="destructive">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          +{comparison.differences.costDiffPercent}%
                        </Badge>
                      ) : comparison.differences.costDiff < 0 ? (
                        <Badge variant="default" className="bg-green-600">
                          <TrendingDown className="h-3 w-3 mr-1" />
                          {comparison.differences.costDiffPercent}%
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <Minus className="h-3 w-3 mr-1" />
                          No Change
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Confidence Difference</p>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold">
                        {Math.abs(comparison.differences.confidenceDiff)}%
                      </span>
                      {comparison.differences.confidenceDiff > 0 ? (
                        <Badge variant="default" className="bg-green-600">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          Improved
                        </Badge>
                      ) : comparison.differences.confidenceDiff < 0 ? (
                        <Badge variant="destructive">
                          <TrendingDown className="h-3 w-3 mr-1" />
                          Decreased
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <Minus className="h-3 w-3 mr-1" />
                          No Change
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Side-by-Side Comparison */}
              <div className="grid grid-cols-2 gap-4">
                {/* Original */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Badge variant="default">Original</Badge>
                      Version #{comparison.assessment1.versionNumber}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Estimated Cost</p>
                      <p className="font-medium">{fmt((comparison.assessment1.estimatedCost || 0) * 100)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Confidence Score</p>
                      <p className="font-medium">{comparison.assessment1.confidenceScore}%</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Fraud Risk Level</p>
                      <Badge variant={comparison.assessment1.fraudRiskLevel === "high" ? "destructive" : "secondary"}>
                        {comparison.assessment1.fraudRiskLevel}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Damage Description</p>
                      <p className="text-xs">{comparison.assessment1.damageDescription || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Created At</p>
                      <p className="text-xs">{format(new Date(comparison.assessment1.createdAt), "MMM d, yyyy 'at' h:mm a")}</p>
                    </div>
                  </CardContent>
                </Card>

                {/* Re-analysis */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Badge variant="outline">Re-analysis</Badge>
                      Version #{comparison.assessment2.versionNumber}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Estimated Cost</p>
                      <p className="font-medium">{fmt((comparison.assessment2.estimatedCost || 0) * 100)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Confidence Score</p>
                      <p className="font-medium">{comparison.assessment2.confidenceScore}%</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Fraud Risk Level</p>
                      <Badge variant={comparison.assessment2.fraudRiskLevel === "high" ? "destructive" : "secondary"}>
                        {comparison.assessment2.fraudRiskLevel}
                      </Badge>
                      {comparison.differences.fraudRiskLevelChanged && (
                        <Badge variant="outline" className="ml-2">Changed</Badge>
                      )}
                    </div>
                    <div>
                      <p className="text-muted-foreground">Damage Description</p>
                      <p className="text-xs">{comparison.assessment2.damageDescription || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Created At</p>
                      <p className="text-xs">{format(new Date(comparison.assessment2.createdAt), "MMM d, yyyy 'at' h:mm a")}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
