/**
 * Policy Comparison View Component
 * 
 * Side-by-side comparison of two policy versions to highlight changes.
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

interface PolicyComparisonViewProps {
  policies: any[]; // AutomationPolicy[]
}

export function PolicyComparisonView({ policies }: PolicyComparisonViewProps) {
  const { currencySymbol } = useTenantCurrency();
  const [policy1Id, setPolicy1Id] = useState<string>("");
  const [policy2Id, setPolicy2Id] = useState<string>("");

  const policy1 = policies.find(p => p.id.toString() === policy1Id);
  const policy2 = policies.find(p => p.id.toString() === policy2Id);

  const renderComparison = (label: string, value1: any, value2: any, formatter?: (v: any) => string) => {
    const v1 = formatter ? formatter(value1) : value1;
    const v2 = formatter ? formatter(value2) : value2;
    const isDifferent = v1 !== v2;

    let changeIcon = <Minus className="h-4 w-4 text-muted-foreground" />;
    if (isDifferent) {
      if (typeof value1 === "number" && typeof value2 === "number") {
        changeIcon = value2 > value1 ? 
          <TrendingUp className="h-4 w-4 text-green-500" /> : 
          <TrendingDown className="h-4 w-4 text-red-500" />;
      } else {
        changeIcon = <ArrowRight className="h-4 w-4 text-blue-500" />;
      }
    }

    return (
      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center py-2 border-b">
        <div className="text-right">
          <span className={isDifferent ? "font-semibold" : ""}>{v1}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          {changeIcon}
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <div className="text-left">
          <span className={isDifferent ? "font-semibold" : ""}>{v2}</span>
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compare Policy Versions</CardTitle>
        <CardDescription>
          Select two policies to compare side-by-side
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Policy Selection */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Policy 1</label>
            <Select value={policy1Id} onValueChange={setPolicy1Id}>
              <SelectTrigger>
                <SelectValue placeholder="Select first policy" />
              </SelectTrigger>
              <SelectContent>
                {policies.map((policy) => (
                  <SelectItem key={policy.id} value={policy.id.toString()}>
                    {policy.policyName} (v{policy.version})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Policy 2</label>
            <Select value={policy2Id} onValueChange={setPolicy2Id}>
              <SelectTrigger>
                <SelectValue placeholder="Select second policy" />
              </SelectTrigger>
              <SelectContent>
                {policies.map((policy) => (
                  <SelectItem key={policy.id} value={policy.id.toString()}>
                    {policy.policyName} (v{policy.version})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Comparison View */}
        {policy1 && policy2 ? (
          <div className="space-y-6">
            {/* Policy Headers */}
            <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
              <div className="text-right">
                <h3 className="font-semibold">{policy1.policyName}</h3>
                <div className="flex items-center justify-end gap-2 mt-1">
                  <Badge variant="outline">v{policy1.version}</Badge>
                  {policy1.isActive && <Badge variant="default">Active</Badge>}
                </div>
              </div>
              <div className="w-12" />
              <div className="text-left">
                <h3 className="font-semibold">{policy2.policyName}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline">v{policy2.version}</Badge>
                  {policy2.isActive && <Badge variant="default">Active</Badge>}
                </div>
              </div>
            </div>

            {/* Confidence Thresholds */}
            <div>
              <h4 className="font-semibold mb-3">Confidence Thresholds</h4>
              {renderComparison(
                "Automation",
                policy1.minAutomationConfidence,
                policy2.minAutomationConfidence,
                (v) => `${v}%`
              )}
              {renderComparison(
                "Hybrid",
                policy1.minHybridConfidence,
                policy2.minHybridConfidence,
                (v) => `${v}%`
              )}
            </div>

            {/* Financial Limits */}
            <div>
              <h4 className="font-semibold mb-3">Financial Limits</h4>
              {renderComparison(
                "AI-Only Limit",
                policy1.maxAiOnlyApprovalAmount,
                policy2.maxAiOnlyApprovalAmount,
                (v) => `${currencySymbol}${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              )}
              {renderComparison(
                "Hybrid Limit",
                policy1.maxHybridApprovalAmount,
                policy2.maxHybridApprovalAmount,
                (v) => `${currencySymbol}${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              )}
              {renderComparison(
                "Manager Approval",
                policy1.requireManagerApprovalAbove,
                policy2.requireManagerApprovalAbove,
                (v) => `${currencySymbol}${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              )}
            </div>

            {/* Fraud Controls */}
            <div>
              <h4 className="font-semibold mb-3">Fraud Controls</h4>
              {renderComparison(
                "Max Fraud Score",
                policy1.maxFraudScoreForAutomation,
                policy2.maxFraudScoreForAutomation
              )}
              {renderComparison(
                "Fraud Sensitivity",
                policy1.fraudSensitivityMultiplier,
                policy2.fraudSensitivityMultiplier,
                (v) => `${v}x`
              )}
            </div>

            {/* Vehicle Rules */}
            <div>
              <h4 className="font-semibold mb-3">Vehicle Rules</h4>
              {renderComparison(
                "Min Vehicle Year",
                policy1.minVehicleYear,
                policy2.minVehicleYear
              )}
              {renderComparison(
                "Max Vehicle Age",
                policy1.maxVehicleAge,
                policy2.maxVehicleAge,
                (v) => `${v} years`
              )}
            </div>

            {/* Override Controls */}
            <div>
              <h4 className="font-semibold mb-3">Override Controls</h4>
              {renderComparison(
                "Policy Override",
                policy1.allowPolicyOverride,
                policy2.allowPolicyOverride,
                (v) => v ? "Allowed" : "Disabled"
              )}
            </div>

            {/* Claim Type Eligibility */}
            <div>
              <h4 className="font-semibold mb-3">Claim Type Eligibility</h4>
              <div className="grid grid-cols-[1fr_auto_1fr] gap-4">
                <div className="text-right space-y-1">
                  {(policy1.eligibleClaimTypes as string[]).map((type) => (
                    <Badge key={type} variant="secondary">{type}</Badge>
                  ))}
                </div>
                <div className="w-12 flex items-center justify-center">
                  <span className="text-xs text-muted-foreground">Eligible</span>
                </div>
                <div className="text-left space-y-1">
                  {(policy2.eligibleClaimTypes as string[]).map((type) => (
                    <Badge key={type} variant="secondary">{type}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8">
            Select two policies to compare
          </p>
        )}
      </CardContent>
    </Card>
  );
}
