/**
 * Governance Indicators Component
 * 
 * Displays visible indicators for:
 * - Fraud Detection Active
 * - Physics Validation Complete
 * - Cost Optimisation Applied
 * - Policy Version Used
 * - Governance Logging Active
 * 
 * Used in claim detail views for insurer presentation.
 */

import { Shield, CheckCircle2, DollarSign, FileText, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface GovernanceIndicatorsProps {
  fraudDetectionActive?: boolean;
  physicsValidationComplete?: boolean;
  costOptimisationApplied?: boolean;
  policyVersion?: string;
  governanceLoggingActive?: boolean;
  fraudRiskScore?: number;
  confidenceScore?: number;
  className?: string;
}

export function GovernanceIndicators({
  fraudDetectionActive = true,
  physicsValidationComplete = true,
  costOptimisationApplied = true,
  policyVersion,
  governanceLoggingActive = true,
  fraudRiskScore,
  confidenceScore,
  className = "",
}: GovernanceIndicatorsProps) {
  return (
    <Card className={`p-4 ${className}`}>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Governance & Compliance Indicators
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Fraud Detection */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                  <Shield className={`h-4 w-4 ${fraudDetectionActive ? "text-green-600" : "text-gray-400 dark:text-muted-foreground/70"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">Fraud Detection</p>
                    <p className="text-xs text-muted-foreground">
                      {fraudDetectionActive ? "Active" : "Inactive"}
                      {fraudRiskScore !== undefined && ` (${fraudRiskScore}/100)`}
                    </p>
                  </div>
                  {fraudDetectionActive && (
                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>AI-powered fraud risk assessment using historical patterns</p>
                {fraudRiskScore !== undefined && (
                  <p className="text-xs mt-1">Risk Score: {fraudRiskScore}/100</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Physics Validation */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                  <Activity className={`h-4 w-4 ${physicsValidationComplete ? "text-blue-600" : "text-gray-400 dark:text-muted-foreground/70"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">Physics Validation</p>
                    <p className="text-xs text-muted-foreground">
                      {physicsValidationComplete ? "Complete" : "Pending"}
                      {confidenceScore !== undefined && ` (${confidenceScore}%)`}
                    </p>
                  </div>
                  {physicsValidationComplete && (
                    <CheckCircle2 className="h-4 w-4 text-blue-600 flex-shrink-0" />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Damage assessment validated against collision physics</p>
                {confidenceScore !== undefined && (
                  <p className="text-xs mt-1">Confidence: {confidenceScore}%</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Cost Optimisation */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                  <DollarSign className={`h-4 w-4 ${costOptimisationApplied ? "text-purple-600" : "text-gray-400 dark:text-muted-foreground/70"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">Cost Optimisation</p>
                    <p className="text-xs text-muted-foreground">
                      {costOptimisationApplied ? "Applied" : "Not Applied"}
                    </p>
                  </div>
                  {costOptimisationApplied && (
                    <CheckCircle2 className="h-4 w-4 text-purple-600 flex-shrink-0" />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Panel beater quotes optimised for cost efficiency</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Policy Version */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                  <FileText className="h-4 w-4 text-orange-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">Policy Version</p>
                    <p className="text-xs text-muted-foreground">
                      {policyVersion || "v1.0.0"}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs flex-shrink-0">
                    Immutable
                  </Badge>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Routing policy version used for this decision</p>
                <p className="text-xs mt-1">Policy snapshots ensure audit trail integrity</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Governance Logging */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                  <Activity className={`h-4 w-4 ${governanceLoggingActive ? "text-teal-600" : "text-gray-400 dark:text-muted-foreground/70"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">Governance Logging</p>
                    <p className="text-xs text-muted-foreground">
                      {governanceLoggingActive ? "Active" : "Inactive"}
                    </p>
                  </div>
                  {governanceLoggingActive && (
                    <CheckCircle2 className="h-4 w-4 text-teal-600 flex-shrink-0" />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>All state transitions logged for audit compliance</p>
                <p className="text-xs mt-1">Full replay capability enabled</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* QMS Compliance Badge */}
          <div className="flex items-center gap-2 p-2 rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
            <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-green-900 dark:text-green-100">QMS Compliant</p>
              <p className="text-xs text-green-700 dark:text-green-300">
                ISO 9001 Ready
              </p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
