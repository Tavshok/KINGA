/**
 * Operational Readiness Dashboard
 * 
 * Internal super-admin dashboard for monitoring system health across:
 * - Governance Health
 * - Data Integrity
 * - Performance Metrics
 * - AI Stability
 * 
 * Features traffic-light system (Green/Amber/Red) and overall health index (0-100)
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Shield, Database, Zap, Brain, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

/**
 * Get traffic light color classes
 */
function getStatusColor(status: "green" | "amber" | "red"): string {
  switch (status) {
    case "green":
      return "bg-green-500";
    case "amber":
      return "bg-amber-500";
    case "red":
      return "bg-red-500";
  }
}

/**
 * Get status badge variant
 */
function getStatusBadgeVariant(status: "green" | "amber" | "red"): "default" | "secondary" | "destructive" {
  switch (status) {
    case "green":
      return "default";
    case "amber":
      return "secondary";
    case "red":
      return "destructive";
  }
}

/**
 * Get status icon
 */
function getStatusIcon(status: "green" | "amber" | "red") {
  switch (status) {
    case "green":
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case "amber":
      return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    case "red":
      return <XCircle className="h-5 w-5 text-red-500" />;
  }
}

/**
 * Health Gauge Component
 */
function HealthGauge({ score, status }: { score: number; status: "green" | "amber" | "red" }) {
  const rotation = (score / 100) * 180 - 90; // -90 to 90 degrees
  
  return (
    <div className="relative w-48 h-24 mx-auto">
      {/* Gauge background */}
      <svg className="w-full h-full" viewBox="0 0 200 100">
        {/* Red zone */}
        <path
          d="M 20 90 A 80 80 0 0 1 100 10"
          fill="none"
          stroke="#ef4444"
          strokeWidth="12"
          opacity="0.3"
        />
        {/* Amber zone */}
        <path
          d="M 100 10 A 80 80 0 0 1 140 30"
          fill="none"
          stroke="#f59e0b"
          strokeWidth="12"
          opacity="0.3"
        />
        {/* Green zone */}
        <path
          d="M 140 30 A 80 80 0 0 1 180 90"
          fill="none"
          stroke="#10b981"
          strokeWidth="12"
          opacity="0.3"
        />
        
        {/* Needle */}
        <line
          x1="100"
          y1="90"
          x2="100"
          y2="30"
          stroke={status === "green" ? "#10b981" : status === "amber" ? "#f59e0b" : "#ef4444"}
          strokeWidth="3"
          strokeLinecap="round"
          transform={`rotate(${rotation} 100 90)`}
        />
        
        {/* Center dot */}
        <circle cx="100" cy="90" r="5" fill="#1f2937" />
      </svg>
      
      {/* Score display */}
      <div className="absolute inset-0 flex items-end justify-center pb-2">
        <div className="text-center">
          <div className="text-3xl font-bold">{score.toFixed(0)}</div>
          <div className="text-xs text-muted-foreground">Health Index</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Operational Health Dashboard Component
 */
export default function OperationalHealthDashboard() {
  const { data: health, isLoading, error } = trpc.operationalHealth.getHealth.useQuery();
  
  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Loading operational health...</p>
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
            <CardTitle className="text-red-700 dark:text-red-300">Error Loading Health Data</CardTitle>
            <CardDescription className="text-red-600">
              {error.message || "Failed to load operational health metrics"}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
  
  if (!health) {
    return null;
  }
  
  return (
    <div className="container py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Operational Readiness Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Real-time system health monitoring across governance, data integrity, performance, and AI stability
        </p>
      </div>
      
      {/* Overall Health Card */}
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Overall System Health</CardTitle>
              <CardDescription>
                Last updated: {new Date(health.timestamp).toLocaleString()}
              </CardDescription>
            </div>
            <Badge variant={getStatusBadgeVariant(health.overallStatus)} className="text-lg px-4 py-2">
              {health.overallStatus.toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <HealthGauge score={health.overallScore} status={health.overallStatus} />
        </CardContent>
      </Card>
      
      {/* Health Components Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Governance Health */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Shield className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <CardTitle>Governance Health</CardTitle>
                  <CardDescription>Workflow compliance & audit coverage</CardDescription>
                </div>
              </div>
              {getStatusIcon(health.governance.status)}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Health Score</span>
              <span className="text-2xl font-bold">{health.governance.score.toFixed(0)}</span>
            </div>
            
            <div className={`h-2 rounded-full ${getStatusColor(health.governance.status)}`} 
                 style={{ width: `${health.governance.score}%` }} />
            
            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center">
                <span className="text-sm">Workflow Engine Compliance</span>
                <span className="font-semibold">{health.governance.workflowEngineComplianceRate.toFixed(1)}%</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm">Segregation Violations</span>
                <Badge variant={health.governance.segregationViolationAttempts > 5 ? "destructive" : "secondary"}>
                  {health.governance.segregationViolationAttempts}
                </Badge>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm">Audit Logging Coverage</span>
                <span className="font-semibold">{health.governance.auditLoggingCoverage.toFixed(1)}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Data Integrity Health */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <Database className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <CardTitle>Data Integrity</CardTitle>
                  <CardDescription>Completeness & consistency</CardDescription>
                </div>
              </div>
              {getStatusIcon(health.dataIntegrity.status)}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Health Score</span>
              <span className="text-2xl font-bold">{health.dataIntegrity.score.toFixed(0)}</span>
            </div>
            
            <div className={`h-2 rounded-full ${getStatusColor(health.dataIntegrity.status)}`} 
                 style={{ width: `${health.dataIntegrity.score}%` }} />
            
            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center">
                <span className="text-sm">Claims Missing Documents</span>
                <Badge variant={health.dataIntegrity.claimsMissingDocuments > 10 ? "destructive" : "secondary"}>
                  {health.dataIntegrity.claimsMissingDocuments}
                </Badge>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm">Incomplete Workflow States</span>
                <Badge variant={health.dataIntegrity.incompleteWorkflowStates > 20 ? "destructive" : "secondary"}>
                  {health.dataIntegrity.incompleteWorkflowStates}
                </Badge>
              </div>
              
              <div className="space-y-2">
                <span className="text-sm font-medium">Orphaned Records</span>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-center p-2 bg-muted rounded">
                    <div className="font-semibold">{health.dataIntegrity.orphanedRecords.claimsWithoutAssessments}</div>
                    <div className="text-muted-foreground">No Assessments</div>
                  </div>
                  <div className="text-center p-2 bg-muted rounded">
                    <div className="font-semibold">{health.dataIntegrity.orphanedRecords.quotesWithoutClaims}</div>
                    <div className="text-muted-foreground">No Claims</div>
                  </div>
                  <div className="text-center p-2 bg-muted rounded">
                    <div className="font-semibold">{health.dataIntegrity.orphanedRecords.assessmentsWithoutClaims}</div>
                    <div className="text-muted-foreground">No Claims</div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Performance Health */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <Zap className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <CardTitle>Performance</CardTitle>
                  <CardDescription>Speed & efficiency metrics</CardDescription>
                </div>
              </div>
              {getStatusIcon(health.performance.status)}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Health Score</span>
              <span className="text-2xl font-bold">{health.performance.score.toFixed(0)}</span>
            </div>
            
            <div className={`h-2 rounded-full ${getStatusColor(health.performance.status)}`} 
                 style={{ width: `${health.performance.score}%` }} />
            
            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center">
                <span className="text-sm">Avg Dashboard Load Time</span>
                <span className="font-semibold">{health.performance.avgDashboardLoadTime.toFixed(0)}ms</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm">Avg Claim Processing Time</span>
                <span className="font-semibold">{health.performance.avgClaimProcessingTime.toFixed(1)}h</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm">Avg Rows Scanned/Request</span>
                <span className="font-semibold">{health.performance.avgRowsScannedPerRequest.toFixed(0)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* AI Stability Health */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                  <Brain className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <CardTitle>AI Stability</CardTitle>
                  <CardDescription>Confidence & accuracy metrics</CardDescription>
                </div>
              </div>
              {getStatusIcon(health.aiStability.status)}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Health Score</span>
              <span className="text-2xl font-bold">{health.aiStability.score.toFixed(0)}</span>
            </div>
            
            <div className={`h-2 rounded-full ${getStatusColor(health.aiStability.status)}`} 
                 style={{ width: `${health.aiStability.score}%` }} />
            
            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center">
                <span className="text-sm">Avg Confidence Score</span>
                <span className="font-semibold">{health.aiStability.avgConfidenceScore.toFixed(1)}</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm">Escalation Rate</span>
                <span className="font-semibold">{health.aiStability.escalationRate.toFixed(1)}%</span>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm">AI vs Assessor Variance</span>
                  <span className="font-semibold">{health.aiStability.aiVsAssessorVariance.avgVariancePercent.toFixed(1)}%</span>
                </div>
                
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-center p-2 bg-green-50 dark:bg-green-950/30 rounded border border-green-200 dark:border-green-800">
                    <div className="font-semibold text-green-700 dark:text-green-300">{health.aiStability.aiVsAssessorVariance.distribution.low}</div>
                    <div className="text-green-600">&lt;10% Variance</div>
                  </div>
                  <div className="text-center p-2 bg-amber-50 dark:bg-amber-950/30 rounded border border-amber-200 dark:border-amber-800">
                    <div className="font-semibold text-amber-700 dark:text-amber-300">{health.aiStability.aiVsAssessorVariance.distribution.medium}</div>
                    <div className="text-amber-600">10-20%</div>
                  </div>
                  <div className="text-center p-2 bg-red-50 dark:bg-red-950/30 rounded border border-red-200 dark:border-red-800">
                    <div className="font-semibold text-red-700 dark:text-red-300">{health.aiStability.aiVsAssessorVariance.distribution.high}</div>
                    <div className="text-red-600">&gt;20%</div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
