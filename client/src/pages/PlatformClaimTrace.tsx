/**
 * Platform Claim Trace Panel
 * 
 * Platform super admin only - comprehensive claim observability
 * Shows AI extraction, confidence breakdown, routing metadata, workflow timeline, segregation tracking
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useRoute } from "wouter";
import { ArrowLeft, FileText, Brain, Route, Clock, Shield, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";

export default function PlatformClaimTrace() {
  const [, params] = useRoute("/platform/claim-trace/:claimId");
  const claimId = params?.claimId || "";
  
  const { data: trace, isLoading, error } = trpc.platformObservability.getClaimTrace.useQuery(
    { claimId },
    { enabled: !!claimId }
  );
  
  const { data: aiBreakdown } = trpc.platformObservability.getAIConfidenceBreakdown.useQuery(
    { claimId },
    { enabled: !!claimId }
  );
  
  const { data: routingMetadata } = trpc.platformObservability.getRoutingMetadata.useQuery(
    { claimId },
    { enabled: !!claimId }
  );
  
  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Loading claim trace...</p>
          </div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="container py-8">
        <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
          <CardHeader>
            <CardTitle className="text-red-700 dark:text-red-300">Error Loading Claim Trace</CardTitle>
            <CardDescription className="text-red-600">
              {error.message || "Failed to load claim trace data"}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
  
  if (!trace || !trace.claim) {
    return (
      <div className="container py-8">
        <Card>
          <CardHeader>
            <CardTitle>Claim Not Found</CardTitle>
            <CardDescription>No claim found with ID: {claimId}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="container py-8 space-y-8">
      {/* Header */}
      <div>
        <Link href="/platform/overview">
          <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="h-4 w-4" />
            Back to Platform Overview
          </button>
        </Link>
        
        <div className="flex items-center gap-3 mb-2">
          <Badge variant="secondary" className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
            Platform Super Admin
          </Badge>
          <Badge variant="outline">Read-Only Access</Badge>
        </div>
        
        <h1 className="text-3xl font-bold tracking-tight">Claim Trace</h1>
        <p className="text-muted-foreground mt-2">
          Comprehensive observability for claim {trace.claim.claim.claimNumber}
        </p>
        
        <div className="flex items-center gap-4 mt-4">
          <div className="flex flex-col">
            <span className="text-sm text-muted-foreground">Tenant</span>
            <span className="font-medium">{trace.claim.tenant?.name || "Unknown"}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm text-muted-foreground">Claimant</span>
            <span className="font-medium">{trace.claim.claimant?.name || "Unknown"}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge>{trace.claim.claim.status}</Badge>
          </div>
        </div>
      </div>
      
      {/* AI Extraction Data */}
      {aiBreakdown && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-blue-500" />
              <CardTitle>AI Extraction & Confidence Breakdown</CardTitle>
            </div>
            <CardDescription>AI assessment and confidence components</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Overall Confidence */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Overall Confidence</span>
                <span className="text-2xl font-bold">{aiBreakdown.overallConfidence}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-3">
                <div
                  className={`h-3 rounded-full ${
                    aiBreakdown.overallConfidence >= 80 ? "bg-green-500" :
                    aiBreakdown.overallConfidence >= 50 ? "bg-amber-500" :
                    "bg-red-500"
                  }`}
                  style={{ width: `${aiBreakdown.overallConfidence}%` }}
                />
              </div>
            </div>
            
            {/* Confidence Components */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 bg-muted rounded-lg">
                <span className="text-sm font-medium">Fraud Risk Contribution</span>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 bg-background rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-red-500"
                      style={{ width: `${aiBreakdown.components.fraudRiskContribution}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold">{aiBreakdown.components.fraudRiskContribution}%</span>
                </div>
              </div>
              
              <div className="p-4 bg-muted rounded-lg">
                <span className="text-sm font-medium">Quote Variance Contribution</span>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 bg-background rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-amber-500"
                      style={{ width: `${aiBreakdown.components.quoteVarianceContribution}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold">{aiBreakdown.components.quoteVarianceContribution}%</span>
                </div>
              </div>
              
              <div className="p-4 bg-muted rounded-lg">
                <span className="text-sm font-medium">Claim Completeness Score</span>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 bg-background rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-green-500"
                      style={{ width: `${aiBreakdown.components.claimCompletenessScore}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold">{aiBreakdown.components.claimCompletenessScore}%</span>
                </div>
              </div>
              
              <div className="p-4 bg-muted rounded-lg">
                <span className="text-sm font-medium">Historical Pattern Impact</span>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 bg-background rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-blue-500"
                      style={{ width: `${aiBreakdown.components.historicalPatternImpact}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold">{aiBreakdown.components.historicalPatternImpact}%</span>
                </div>
              </div>
            </div>
            
            {/* Extracted Data */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 bg-muted rounded-lg">
                <span className="text-sm font-medium text-muted-foreground">Estimated Cost</span>
                <p className="text-lg font-bold mt-1">
                  ${aiBreakdown.extractedData.estimatedCost?.toLocaleString() || "N/A"}
                </p>
              </div>
              
              <div className="p-4 bg-muted rounded-lg">
                <span className="text-sm font-medium text-muted-foreground">Fraud Risk Score</span>
                <p className="text-lg font-bold mt-1">
                  {aiBreakdown.extractedData.fraudRiskScore || "N/A"}
                </p>
              </div>
              
              <div className="p-4 bg-muted rounded-lg col-span-2">
                <span className="text-sm font-medium text-muted-foreground">Damage Description</span>
                <p className="mt-1">{aiBreakdown.extractedData.damageDescription || "N/A"}</p>
              </div>
              
              <div className="p-4 bg-muted rounded-lg col-span-2">
                <span className="text-sm font-medium text-muted-foreground">Recommended Action</span>
                <p className="mt-1">{aiBreakdown.extractedData.recommendedAction || "N/A"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Routing Decision Metadata */}
      {routingMetadata && routingMetadata.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Route className="h-5 w-5 text-purple-500" />
              <CardTitle>Routing Decision Metadata</CardTitle>
            </div>
            <CardDescription>AI routing decisions and reasoning</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {routingMetadata.map((decision) => (
                <div key={decision.id} className="p-4 bg-muted rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant={
                      decision.decision === "fast_track" ? "default" :
                      decision.decision === "manual_review" ? "secondary" :
                      "destructive"
                    }>
                      {decision.decision?.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {new Date(decision.timestamp).toLocaleString()}
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    <div>
                      <span className="text-sm font-medium">Reason:</span>
                      <p className="text-sm text-muted-foreground">{decision.reason || "N/A"}</p>
                    </div>
                    
                    <div>
                      <span className="text-sm font-medium">Confidence:</span>
                      <span className="text-sm text-muted-foreground ml-2">{decision.confidence}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Workflow Timeline */}
      {trace.workflowTimeline && trace.workflowTimeline.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-green-500" />
              <CardTitle>Workflow Timeline</CardTitle>
            </div>
            <CardDescription>Audit trail of all workflow actions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {trace.workflowTimeline.map((entry) => (
                <div key={entry.audit.id} className="flex gap-4 p-4 bg-muted rounded-lg">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <div className="w-px h-full bg-border mt-2" />
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{entry.audit.action}</span>
                      <span className="text-sm text-muted-foreground">
                        {new Date(entry.audit.createdAt).toLocaleString()}
                      </span>
                    </div>
                    
                    <div className="text-sm text-muted-foreground">
                      By: {entry.user?.name || "System"} ({entry.user?.role || "N/A"})
                    </div>
                    
                    {entry.audit.changeDescription && (
                      <div className="mt-2 text-sm">
                        <pre className="bg-background p-2 rounded text-xs overflow-x-auto">
                          {JSON.stringify(JSON.parse(entry.audit.changeDescription as string), null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Segregation Involvement Tracking */}
      {trace.segregationTracking && trace.segregationTracking.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-orange-500" />
              <CardTitle>Segregation Involvement Tracking</CardTitle>
            </div>
            <CardDescription>User involvement across critical workflow stages</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {trace.segregationTracking.map((entry) => (
                <div key={entry.log.id} className="p-4 bg-muted rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{entry.user?.name || "Unknown"}</span>
                      <Badge variant="outline">{entry.user?.insurerRole || entry.user?.role}</Badge>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {new Date(entry.log.createdAt).toLocaleString()}
                    </span>
                  </div>
                  
                  <div className="grid gap-2 md:grid-cols-2">
                    <div>
                      <span className="text-sm font-medium">Workflow Stage:</span>
                      <p className="text-sm text-muted-foreground">{entry.log.workflowStage}</p>
                    </div>
                    
                    <div>
                      <span className="text-sm font-medium">Action Type:</span>
                      <p className="text-sm text-muted-foreground">{entry.log.actionType}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
