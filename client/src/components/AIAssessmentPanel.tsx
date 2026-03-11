/**
 * AI Assessment Panel Component
 * Shared component for displaying AI assessment results across all roles
 * Used by: Claims Processor, Assessors, Panel Beaters, Claims Managers, Risk Managers
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, DollarSign, Shield, Activity } from "lucide-react";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

interface AIAssessmentPanelProps {
  claimId: number;
  aiAssessment?: {
    id: number;
    estimatedCost: number | null;
    damageDescription: string | null;
    detectedDamageTypes: string | null;
    confidenceScore: number | null;
    fraudRiskLevel: "low" | "medium" | "high" | null;
    fraudIndicators: string | null;
    physicsAnalysis: string | null;
    totalLossIndicated: number | null;
    structuralDamageSeverity: string | null;
    createdAt: Date;
  } | null;
  isLoading?: boolean;
  onTriggerAssessment?: (reason?: string) => void;
  showTriggerButton?: boolean;
  variant?: "compact" | "full";
  userRole?: string; // For audit trail context
}

export default function AIAssessmentPanel({
  claimId,
  aiAssessment,
  isLoading = false,
  onTriggerAssessment,
  showTriggerButton = true,
  variant = "full",
}: AIAssessmentPanelProps) {
  const { fmt } = useTenantCurrency();
  
  if (isLoading) {
    return (
      <Card className="border-l-4 border-l-primary">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-sm text-slate-600 dark:text-muted-foreground">Loading AI assessment...</span>
        </CardContent>
      </Card>
    );
  }

  if (!aiAssessment) {
    return (
      <Card className="border-l-4 border-l-slate-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-slate-500 dark:text-muted-foreground" />
            AI Assessment
          </CardTitle>
          <CardDescription>No AI assessment available for this claim</CardDescription>
        </CardHeader>
        {showTriggerButton && onTriggerAssessment && (
          <CardContent>
            <Button onClick={() => onTriggerAssessment && onTriggerAssessment()} variant="outline" className="w-full">
              <Activity className="mr-2 h-4 w-4" />
              Trigger AI Assessment
            </Button>
            <p className="text-xs text-slate-500 dark:text-muted-foreground mt-2">
              Generate AI-powered damage analysis, cost estimation, and fraud detection
            </p>
          </CardContent>
        )}
      </Card>
    );
  }

  return (
    <Card className="border-l-4 border-l-primary bg-primary/5/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <svg className="h-5 w-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              AI Assessment Results
            </CardTitle>
            <CardDescription className="text-primary/90">
              AI-powered analysis • Generated {new Date(aiAssessment.createdAt).toLocaleDateString()}
            </CardDescription>
          </div>
          <Badge variant="secondary" className="bg-primary/10 text-primary/90">
            Confidence: {aiAssessment.confidenceScore || 0}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cost Estimation */}
        <div className="bg-white dark:bg-card rounded-lg p-4 space-y-3">
          <h3 className="font-semibold text-sm text-slate-700 dark:text-foreground/80 flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Cost Estimation
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 dark:bg-muted/50 rounded p-3">
              <p className="text-xs text-slate-600 dark:text-muted-foreground">AI Estimated Cost</p>
              <p className="text-lg font-bold text-slate-900 dark:text-foreground">
                {fmt(aiAssessment.estimatedCost || 0)}
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-muted/50 rounded p-3">
              <p className="text-xs text-slate-600 dark:text-muted-foreground">Market Range</p>
              <p className="text-lg font-bold text-slate-900 dark:text-foreground">
                {fmt(Math.round((aiAssessment.estimatedCost || 0) * 0.9))} - {fmt(Math.round((aiAssessment.estimatedCost || 0) * 1.1))}
              </p>
              <p className="text-xs text-slate-500 dark:text-muted-foreground">±10% variance</p>
            </div>
          </div>
        </div>

        {/* Fraud Detection */}
        {aiAssessment.fraudRiskLevel && aiAssessment.fraudRiskLevel !== "low" && (
          <div className={`rounded-lg p-4 ${
            aiAssessment.fraudRiskLevel === "high" 
              ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800" 
              : "bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800"
          }`}>
            <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
              <Shield className="h-4 w-4" />
              <span className={aiAssessment.fraudRiskLevel === "high" ? "text-red-700 dark:text-red-300" : "text-orange-700 dark:text-orange-300"}>
                {aiAssessment.fraudRiskLevel === "high" ? "High" : "Medium"} Fraud Risk Detected
              </span>
            </h3>
            {aiAssessment.fraudIndicators && (
              <ul className="text-sm space-y-1 ml-6">
                {JSON.parse(aiAssessment.fraudIndicators).map((indicator: string, idx: number) => (
                  <li key={idx} className={aiAssessment.fraudRiskLevel === "high" ? "text-red-700 dark:text-red-300" : "text-orange-700 dark:text-orange-300"}>
                    • {indicator}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {variant === "full" && (
          <>
            {/* Damage Analysis */}
            <div className="bg-white dark:bg-card rounded-lg p-4">
              <h3 className="font-semibold text-sm text-slate-700 dark:text-foreground/80 mb-2">Damage Analysis</h3>
              <p className="text-sm text-slate-600 dark:text-muted-foreground whitespace-pre-wrap">
                {aiAssessment.damageDescription || "No detailed analysis available"}
              </p>
              {aiAssessment.detectedDamageTypes && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {JSON.parse(aiAssessment.detectedDamageTypes).map((type: string, idx: number) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {type}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Physics Analysis */}
            {aiAssessment.physicsAnalysis && (() => {
              let phys: any = null;
              try {
                phys = typeof aiAssessment.physicsAnalysis === 'string'
                  ? JSON.parse(aiAssessment.physicsAnalysis)
                  : aiAssessment.physicsAnalysis;
              } catch { /* ignore */ }
              if (!phys) return null;
              const propagation: any[] = Array.isArray(phys.damagePropagation) ? phys.damagePropagation : [];
              const fi = phys.fraudIndicators || {};
              const hasFlags = (fi.impossibleDamagePatterns?.length > 0) || (fi.unrelatedDamage?.length > 0) || (fi.stagedAccidentIndicators?.length > 0) || fi.severityMismatch;
              return (
                <div className="bg-white dark:bg-card rounded-lg p-4 space-y-3">
                  <h3 className="font-semibold text-sm text-slate-700 dark:text-foreground/80 flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Physics-Based Validation
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div>
                      <span className="text-slate-500 dark:text-muted-foreground block text-xs">Impact Force</span>
                      <span className="font-semibold">{(phys.impactForce ?? 0).toFixed(1)} kN</span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-muted-foreground block text-xs">Est. Speed</span>
                      <span className="font-semibold">{(phys.estimatedSpeed ?? 0).toFixed(0)} km/h</span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-muted-foreground block text-xs">Impact Angle</span>
                      <span className="font-semibold">{(phys.impactAngle ?? 0).toFixed(0)}&deg;</span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-muted-foreground block text-xs">Deviation Score</span>
                      <span className="font-semibold">{phys.physicsDeviationScore ?? 'N/A'}</span>
                    </div>
                  </div>
                  {propagation.length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">Damage Propagation Path</span>
                      <div className="mt-1 space-y-1">
                        {propagation.slice(0, 5).map((dp: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-slate-600 dark:text-muted-foreground">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                            <span className="font-medium">{dp.component}</span>
                            <span className="text-slate-400 dark:text-muted-foreground/70">&mdash;</span>
                            <span>{(dp.force ?? 0).toFixed(1)} kN at {(dp.distance ?? 0).toFixed(2)}m</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {hasFlags && (
                    <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded p-2 space-y-1">
                      <span className="text-xs font-semibold text-red-700 dark:text-red-300">Physics Fraud Indicators</span>
                      {fi.impossibleDamagePatterns?.map((p: string, i: number) => (
                        <p key={`imp-${i}`} className="text-xs text-red-600">&bull; Impossible: {p}</p>
                      ))}
                      {fi.unrelatedDamage?.map((d: any, i: number) => (
                        <p key={`unr-${i}`} className="text-xs text-red-600">&bull; Unrelated: {d.component} ({(d.distanceFromImpact ?? 0).toFixed(1)}m from impact)</p>
                      ))}
                      {fi.stagedAccidentIndicators?.map((s: string, i: number) => (
                        <p key={`stg-${i}`} className="text-xs text-red-600">&bull; Staged: {s}</p>
                      ))}
                      {fi.severityMismatch && (
                        <p className="text-xs text-red-600">&bull; Severity mismatch between reported and physics-estimated damage</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Total Loss Indicator */}
            {aiAssessment.totalLossIndicated === 1 && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <h3 className="font-semibold text-sm text-red-700 dark:text-red-300 mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Total Loss Indicated
                </h3>
                <p className="text-sm text-red-600">
                  Structural Damage Severity: <strong>{aiAssessment.structuralDamageSeverity}</strong>
                </p>
              </div>
            )}
          </>
        )}

        {/* Disclaimer */}
        <div className="bg-primary/10 rounded-lg p-3 text-sm text-secondary">
          <strong>Note:</strong> This AI assessment is provided as guidance. Professional judgment should be used for final decisions.
        </div>

        {/* Re-trigger button */}
        {showTriggerButton && onTriggerAssessment && (
          <Button onClick={() => onTriggerAssessment && onTriggerAssessment()} variant="outline" size="sm" className="w-full">
            <Activity className="mr-2 h-4 w-4" />
            Re-run AI Assessment
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
