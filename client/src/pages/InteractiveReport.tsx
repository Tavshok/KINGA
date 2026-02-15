/**
 * Interactive Report Page
 * 
 * Living intelligence report with drill-down analytics, AI vs assessor comparison,
 * fraud risk exploration, and benchmark analytics.
 */

import { useParams, useLocation } from "wouter";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, ExternalLink, Shield, TrendingUp, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function InteractiveReport() {
  const params = useParams();
  const snapshotId = params.snapshotId as string;
  
  const [activeTab, setActiveTab] = useState("overview");
  
  // Fetch snapshot data
  const { data: snapshot, isLoading } = trpc.reports.getInteractiveReport.useQuery({
    snapshotId,
  });
  
  // Download PDF mutation
  const downloadPdf = trpc.reports.generatePdfFromSnapshot.useMutation({
    onSuccess: (data) => {
      window.open(data.s3Url, "_blank");
      toast.success("PDF report opened in new tab");
    },
    onError: (error) => {
      toast.error(`Failed to download PDF: ${error.message}`);
    },
  });
  
  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading interactive report...</div>
        </div>
      </div>
    );
  }
  
  if (!snapshot) {
    return (
      <div className="container mx-auto py-8">
        <Card className="p-8 text-center">
          <h2 className="text-2xl font-bold mb-2">Report Not Found</h2>
          <p className="text-muted-foreground">
            The requested report snapshot does not exist or you don't have access to it.
          </p>
        </Card>
      </div>
    );
  }
  
  const intelligence = snapshot.intelligenceData as any;
  
  return (
    <div className="container mx-auto py-8">
      {/* Report Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">
              Interactive Intelligence Report
            </h1>
            <p className="text-muted-foreground">
              Claim {intelligence.claimSummary?.claimNumber} • Version {snapshot.version}
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => downloadPdf.mutate({ snapshotId })}
              disabled={downloadPdf.isPending}
            >
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </div>
        </div>
        
        {/* Report Metadata */}
        <div className="flex gap-4 text-sm text-muted-foreground">
          <div>
            <span className="font-medium">Report Type:</span>{" "}
            <Badge variant="outline">{snapshot.reportType}</Badge>
          </div>
          <div>
            <span className="font-medium">Generated:</span>{" "}
            {new Date(snapshot.generatedAt).toLocaleString()}
          </div>
          <div>
            <span className="font-medium">Audit Hash:</span>{" "}
            <code className="text-xs">{snapshot.auditHash.substring(0, 16)}...</code>
          </div>
        </div>
      </div>
      
      {/* Interactive Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="damage">Damage Analysis</TabsTrigger>
          <TabsTrigger value="cost">Cost Comparison</TabsTrigger>
          <TabsTrigger value="fraud">Fraud Risk</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
        </TabsList>
        
        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid gap-6">
            {/* Executive Summary */}
            <Card className="p-6">
              <h2 className="text-xl font-bold mb-4">Executive Summary</h2>
              <div className="prose max-w-none">
                <p className="text-muted-foreground">
                  {intelligence.claimSummary?.incidentDescription || "No summary available"}
                </p>
              </div>
            </Card>
            
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-6">
                <div className="flex items-center gap-3 mb-2">
                  <Shield className="h-5 w-5 text-primary/80" />
                  <h3 className="font-semibold">Fraud Risk</h3>
                </div>
                <div className="text-3xl font-bold">
                  {intelligence.fraudRisk?.overallRiskLevel || "Unknown"}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Risk Score: {intelligence.fraudRisk?.riskScore || "N/A"}
                </p>
              </Card>
              
              <Card className="p-6">
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp className="h-5 w-5 text-green-500" />
                  <h3 className="font-semibold">Estimated Cost</h3>
                </div>
                <div className="text-3xl font-bold">
                  R{intelligence.costComparison?.aiEstimate?.toLocaleString() || "0"}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  AI Assessment
                </p>
              </Card>
              
              <Card className="p-6">
                <div className="flex items-center gap-3 mb-2">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                  <h3 className="font-semibold">Damage Severity</h3>
                </div>
                <div className="text-3xl font-bold">
                  {intelligence.damageAssessment?.severity || "Unknown"}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {intelligence.damageAssessment?.components?.length || 0} components affected
                </p>
              </Card>
            </div>
          </div>
        </TabsContent>
        
        {/* Damage Analysis Tab */}
        <TabsContent value="damage">
          <Card className="p-6">
            <h2 className="text-xl font-bold mb-4">Damage Assessment</h2>
            
            {intelligence.damageAssessment?.components && intelligence.damageAssessment.components.length > 0 ? (
              <div className="space-y-4">
                {intelligence.damageAssessment.components.map((component: any, index: number) => (
                  <div key={index} className="border-l-4 border-primary/80 pl-4 py-2">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold">{component.name}</h3>
                      <Badge variant={component.severity === "severe" ? "destructive" : "secondary"}>
                        {component.severity}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {component.description}
                    </p>
                    <div className="text-sm">
                      <span className="font-medium">Estimated Cost:</span> R{component.estimatedCost?.toLocaleString() || "N/A"}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No damage assessment data available</p>
            )}
          </Card>
        </TabsContent>
        
        {/* Cost Comparison Tab */}
        <TabsContent value="cost">
          <Card className="p-6">
            <h2 className="text-xl font-bold mb-4">Cost Comparison Analysis</h2>
            
            <div className="space-y-6">
              {/* AI vs Assessor Comparison */}
              <div>
                <h3 className="font-semibold mb-3">AI vs Assessor Estimate</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="border rounded-lg p-4">
                    <div className="text-sm text-muted-foreground mb-1">AI Estimate</div>
                    <div className="text-2xl font-bold">
                      R{intelligence.costComparison?.aiEstimate?.toLocaleString() || "0"}
                    </div>
                  </div>
                  <div className="border rounded-lg p-4">
                    <div className="text-sm text-muted-foreground mb-1">Assessor Estimate</div>
                    <div className="text-2xl font-bold">
                      R{intelligence.costComparison?.assessorEstimate?.toLocaleString() || "N/A"}
                    </div>
                  </div>
                </div>
                
                {intelligence.costComparison?.variance && (
                  <div className="mt-3 p-3 bg-muted rounded-lg">
                    <span className="font-medium">Variance:</span>{" "}
                    <span className={intelligence.costComparison.variance > 0 ? "text-red-600" : "text-green-600"}>
                      {intelligence.costComparison.variance > 0 ? "+" : ""}
                      {intelligence.costComparison.variance.toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
              
              {/* Panel Beater Quotes */}
              {intelligence.costComparison?.panelBeaterQuotes && intelligence.costComparison.panelBeaterQuotes.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3">Panel Beater Quotes</h3>
                  <div className="space-y-2">
                    {intelligence.costComparison.panelBeaterQuotes.map((quote: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <div className="font-medium">{quote.panelBeaterName}</div>
                          <div className="text-sm text-muted-foreground">
                            Submitted {new Date(quote.submittedAt).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="text-lg font-bold">
                          R{quote.totalCost?.toLocaleString() || "0"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </TabsContent>
        
        {/* Fraud Risk Tab */}
        <TabsContent value="fraud">
          <Card className="p-6">
            <h2 className="text-xl font-bold mb-4">Fraud Risk Analysis</h2>
            
            <div className="space-y-6">
              {/* Overall Risk */}
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">Overall Risk Level</h3>
                  <Badge variant={intelligence.fraudRisk?.overallRiskLevel === "high" ? "destructive" : "secondary"}>
                    {intelligence.fraudRisk?.overallRiskLevel || "Unknown"}
                  </Badge>
                </div>
                <div className="text-3xl font-bold mb-2">
                  {intelligence.fraudRisk?.riskScore || "N/A"}
                </div>
                <p className="text-sm text-muted-foreground">
                  {intelligence.fraudRisk?.explanation || "No explanation available"}
                </p>
              </div>
              
              {/* Risk Indicators */}
              {intelligence.fraudRisk?.indicators && intelligence.fraudRisk.indicators.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3">Risk Indicators</h3>
                  <div className="space-y-2">
                    {intelligence.fraudRisk.indicators.map((indicator: any, index: number) => (
                      <div key={index} className="flex items-start gap-3 p-3 border rounded-lg">
                        <AlertTriangle className="h-5 w-5 text-orange-500 mt-0.5" />
                        <div className="flex-1">
                          <div className="font-medium">{indicator.name}</div>
                          <div className="text-sm text-muted-foreground">{indicator.description}</div>
                        </div>
                        <Badge variant="outline">{indicator.severity}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </TabsContent>
        
        {/* Timeline Tab */}
        <TabsContent value="timeline">
          <Card className="p-6">
            <h2 className="text-xl font-bold mb-4">Claim Workflow Timeline</h2>
            
            {intelligence.workflowAuditTrail && intelligence.workflowAuditTrail.length > 0 ? (
              <div className="space-y-4">
                {intelligence.workflowAuditTrail.map((event: any, index: number) => (
                  <div key={index} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full bg-primary/80" />
                      {index < intelligence.workflowAuditTrail.length - 1 && (
                        <div className="w-0.5 h-full bg-border mt-2" />
                      )}
                    </div>
                    <div className="flex-1 pb-8">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-semibold">{event.status}</h3>
                        <span className="text-sm text-muted-foreground">
                          {new Date(event.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {event.changedByName || "System"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No timeline data available</p>
            )}
          </Card>
        </TabsContent>
        
        {/* Evidence Tab */}
        <TabsContent value="evidence">
          <Card className="p-6">
            <h2 className="text-xl font-bold mb-4">Supporting Evidence</h2>
            
            {intelligence.claimSummary?.photos && intelligence.claimSummary.photos.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {intelligence.claimSummary.photos.map((photo: string, index: number) => (
                  <div key={index} className="border rounded-lg overflow-hidden">
                    <img
                      src={photo}
                      alt={`Evidence ${index + 1}`}
                      className="w-full h-48 object-cover"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No evidence photos available</p>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
