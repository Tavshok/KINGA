/**
 * Active Policy Card Component
 * 
 * Displays the currently active automation policy with key metrics and controls.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Calendar, User, TrendingUp, DollarSign, Shield, AlertTriangle } from "lucide-react";

interface ActivePolicyCardProps {
  policy: any; // AutomationPolicy type
  onPolicyUpdated: () => void;
}

export function ActivePolicyCard({ policy, onPolicyUpdated }: ActivePolicyCardProps) {
  return (
    <Card className="border-2 border-primary">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <CardTitle>{policy.policyName}</CardTitle>
              <Badge variant="default">Active</Badge>
              <Badge variant="outline">v{policy.version}</Badge>
            </div>
            <CardDescription>
              Currently active automation policy for claim routing
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Policy Metadata */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Effective From:</span>
            <span className="font-medium">
              {new Date(policy.effectiveFrom).toLocaleDateString()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Created By:</span>
            <span className="font-medium">User #{policy.createdByUserId}</span>
          </div>
        </div>

        {/* Confidence Thresholds */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4" />
            <h4 className="font-semibold">Confidence Thresholds</h4>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Automation Threshold</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-secondary rounded-full h-2">
                  <div 
                    className="bg-primary h-2 rounded-full" 
                    style={{ width: `${policy.minAutomationConfidence}%` }}
                  />
                </div>
                <span className="text-sm font-medium">{policy.minAutomationConfidence}%</span>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Hybrid Threshold</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-secondary rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full" 
                    style={{ width: `${policy.minHybridConfidence}%` }}
                  />
                </div>
                <span className="text-sm font-medium">{policy.minHybridConfidence}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Financial Limits */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="h-4 w-4" />
            <h4 className="font-semibold">Financial Limits</h4>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">AI-Only Approval Limit</p>
              <p className="text-lg font-bold">
                ${Number(policy.maxAiOnlyApprovalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Hybrid Approval Limit</p>
              <p className="text-lg font-bold">
                ${Number(policy.maxHybridApprovalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        {/* Fraud Controls */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-4 w-4" />
            <h4 className="font-semibold">Fraud Controls</h4>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Max Fraud Score</p>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{policy.maxFraudScoreForAutomation}</Badge>
                <span className="text-xs text-muted-foreground">
                  (0-{policy.maxFraudScoreForAutomation} allowed)
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Fraud Sensitivity</p>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{policy.fraudSensitivityMultiplier}x</Badge>
                <span className="text-xs text-muted-foreground">
                  {Number(policy.fraudSensitivityMultiplier) > 1.0 ? "Stricter" : 
                   Number(policy.fraudSensitivityMultiplier) < 1.0 ? "Lenient" : "Standard"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Claim Type Eligibility */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4" />
            <h4 className="font-semibold">Claim Type Eligibility</h4>
          </div>
          <div className="space-y-2">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Eligible Types:</p>
              <div className="flex flex-wrap gap-1">
                {(policy.eligibleClaimTypes as string[]).map((type) => (
                  <Badge key={type} variant="secondary">{type}</Badge>
                ))}
              </div>
            </div>
            {(policy.excludedClaimTypes as string[]).length > 0 && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Excluded Types:</p>
                <div className="flex flex-wrap gap-1">
                  {(policy.excludedClaimTypes as string[]).map((type) => (
                    <Badge key={type} variant="destructive">{type}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Vehicle Rules */}
        <div>
          <h4 className="font-semibold mb-3">Vehicle Rules</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Min Vehicle Year</p>
              <p className="font-medium">{policy.minVehicleYear}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Max Vehicle Age</p>
              <p className="font-medium">{policy.maxVehicleAge} years</p>
            </div>
          </div>
        </div>

        {/* Override Controls */}
        <div>
          <h4 className="font-semibold mb-3">Override Controls</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Manager Approval Above</p>
              <p className="font-medium">
                ${Number(policy.requireManagerApprovalAbove).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Policy Override</p>
              <Badge variant={policy.allowPolicyOverride ? "default" : "secondary"}>
                {policy.allowPolicyOverride ? "Allowed" : "Disabled"}
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
