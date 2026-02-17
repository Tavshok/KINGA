/**
 * Routing Badge Component
 * Displays AI routing decision with confidence explanation popover
 */

import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Zap, AlertTriangle, Shield, Info } from "lucide-react";

export type RoutingDecision = "fast_track" | "manual_review" | "high_risk_escalated";

interface RoutingBadgeProps {
  decision: RoutingDecision;
  confidenceComponents?: {
    fraudRiskContribution: number;
    quoteVarianceContribution: number;
    claimCompletenessScore: number;
    historicalPatternImpact: number;
  };
  showPopover?: boolean;
}

export function RoutingBadge({ 
  decision, 
  confidenceComponents,
  showPopover = true 
}: RoutingBadgeProps) {
  const getBadgeConfig = (decision: RoutingDecision) => {
    switch (decision) {
      case "fast_track":
        return {
          label: "AI Fast-Track Recommended",
          icon: Zap,
          className: "bg-green-600 text-white hover:bg-green-700",
        };
      case "manual_review":
        return {
          label: "Manual Review Required",
          icon: AlertTriangle,
          className: "bg-amber-600 text-white hover:bg-amber-700",
        };
      case "high_risk_escalated":
        return {
          label: "High Risk – Escalated",
          icon: Shield,
          className: "bg-red-600 text-white hover:bg-red-700",
        };
    }
  };

  const config = getBadgeConfig(decision);
  const Icon = config.icon;

  const badgeContent = (
    <Badge className={`${config.className} flex items-center gap-1.5 px-3 py-1`}>
      <Icon className="h-3.5 w-3.5" />
      {config.label}
      {showPopover && confidenceComponents && (
        <Info className="h-3 w-3 ml-1 opacity-80" />
      )}
    </Badge>
  );

  if (!showPopover || !confidenceComponents) {
    return badgeContent;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="cursor-pointer inline-block">
          {badgeContent}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-slate-900 mb-1">Routing Decision Breakdown</h4>
            <p className="text-xs text-slate-600">
              AI confidence components that contributed to this routing decision
            </p>
          </div>

          <div className="space-y-3">
            {/* Fraud Risk Contribution */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-700 font-medium">Fraud Risk Impact</span>
                <span className="font-bold text-slate-900">
                  {confidenceComponents.fraudRiskContribution}%
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    confidenceComponents.fraudRiskContribution > 70
                      ? "bg-red-500"
                      : confidenceComponents.fraudRiskContribution > 40
                      ? "bg-amber-500"
                      : "bg-green-500"
                  }`}
                  style={{ width: `${confidenceComponents.fraudRiskContribution}%` }}
                ></div>
              </div>
              <p className="text-xs text-slate-600">
                {confidenceComponents.fraudRiskContribution > 70
                  ? "High fraud risk detected, escalation recommended"
                  : confidenceComponents.fraudRiskContribution > 40
                  ? "Moderate fraud risk, manual review suggested"
                  : "Low fraud risk, suitable for fast-track"}
              </p>
            </div>

            {/* Quote Variance Contribution */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-700 font-medium">Quote Variance Impact</span>
                <span className="font-bold text-slate-900">
                  {confidenceComponents.quoteVarianceContribution}%
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    confidenceComponents.quoteVarianceContribution > 70
                      ? "bg-red-500"
                      : confidenceComponents.quoteVarianceContribution > 40
                      ? "bg-amber-500"
                      : "bg-green-500"
                  }`}
                  style={{ width: `${confidenceComponents.quoteVarianceContribution}%` }}
                ></div>
              </div>
              <p className="text-xs text-slate-600">
                {confidenceComponents.quoteVarianceContribution > 70
                  ? "Significant variance between quotes and AI estimate"
                  : confidenceComponents.quoteVarianceContribution > 40
                  ? "Moderate variance detected"
                  : "Quotes align well with AI estimate"}
              </p>
            </div>

            {/* Claim Completeness Score */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-700 font-medium">Claim Completeness</span>
                <span className="font-bold text-slate-900">
                  {confidenceComponents.claimCompletenessScore}%
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    confidenceComponents.claimCompletenessScore >= 80
                      ? "bg-green-500"
                      : confidenceComponents.claimCompletenessScore >= 60
                      ? "bg-amber-500"
                      : "bg-red-500"
                  }`}
                  style={{ width: `${confidenceComponents.claimCompletenessScore}%` }}
                ></div>
              </div>
              <p className="text-xs text-slate-600">
                {confidenceComponents.claimCompletenessScore >= 80
                  ? "All required documentation and information provided"
                  : confidenceComponents.claimCompletenessScore >= 60
                  ? "Some documentation missing or incomplete"
                  : "Significant documentation gaps detected"}
              </p>
            </div>

            {/* Historical Pattern Impact */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-700 font-medium">Historical Pattern</span>
                <span className="font-bold text-slate-900">
                  {confidenceComponents.historicalPatternImpact}%
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    confidenceComponents.historicalPatternImpact > 70
                      ? "bg-red-500"
                      : confidenceComponents.historicalPatternImpact > 40
                      ? "bg-amber-500"
                      : "bg-green-500"
                  }`}
                  style={{ width: `${confidenceComponents.historicalPatternImpact}%` }}
                ></div>
              </div>
              <p className="text-xs text-slate-600">
                {confidenceComponents.historicalPatternImpact > 70
                  ? "Claimant history shows concerning patterns"
                  : confidenceComponents.historicalPatternImpact > 40
                  ? "Some historical concerns noted"
                  : "Clean claimant history"}
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200">
            <p className="text-xs text-slate-500 italic">
              These components are calculated by the AI governance engine and do not reflect manual overrides.
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
