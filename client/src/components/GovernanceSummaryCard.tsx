/**
 * Governance Summary Card Component
 * 
 * Displays governance metrics with 30-day trend indicators and "View Details" action.
 * Used in Executive Dashboard governance section.
 */

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Minus, Eye } from "lucide-react";
import { LucideIcon } from "lucide-react";

interface GovernanceSummaryCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: LucideIcon;
  trend: "up" | "down" | "stable";
  previousValue?: number;
  color: "blue" | "green" | "purple" | "red" | "amber" | "slate" | "orange";
  onViewDetails?: () => void;
}

export function GovernanceSummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  previousValue,
  color,
  onViewDetails,
}: GovernanceSummaryCardProps) {
  const colorClasses = {
    blue: {
      gradient: "from-blue-500 to-blue-600",
      icon: "text-blue-600",
      bg: "bg-blue-50",
    },
    green: {
      gradient: "from-green-500 to-green-600",
      icon: "text-green-600",
      bg: "bg-green-50",
    },
    purple: {
      gradient: "from-purple-500 to-purple-600",
      icon: "text-purple-600",
      bg: "bg-purple-50",
    },
    red: {
      gradient: "from-red-500 to-red-600",
      icon: "text-red-600",
      bg: "bg-red-50",
    },
    amber: {
      gradient: "from-amber-500 to-amber-600",
      icon: "text-amber-600",
      bg: "bg-amber-50",
    },
    slate: {
      gradient: "from-slate-500 to-slate-600",
      icon: "text-slate-600",
      bg: "bg-slate-50",
    },
    orange: {
      gradient: "from-orange-500 to-orange-600",
      icon: "text-orange-600",
      bg: "bg-orange-50",
    },
  };

  const getTrendIcon = () => {
    switch (trend) {
      case "up":
        return <TrendingUp className="h-4 w-4" />;
      case "down":
        return <TrendingDown className="h-4 w-4" />;
      case "stable":
        return <Minus className="h-4 w-4" />;
    }
  };

  const getTrendColor = () => {
    // For governance metrics, "down" is usually good (fewer violations/overrides)
    // "up" is usually concerning
    switch (trend) {
      case "down":
        return "text-green-600 bg-green-50";
      case "up":
        return "text-red-600 bg-red-50";
      case "stable":
        return "text-slate-600 bg-slate-50";
    }
  };

  const getTrendLabel = () => {
    if (trend === "stable") return "No change";
    if (!previousValue) return trend === "up" ? "Increasing" : "Decreasing";
    
    const current = typeof value === "string" ? parseFloat(value) : value;
    const change = Math.abs(current - previousValue);
    const changePercent = previousValue > 0 ? ((change / previousValue) * 100).toFixed(0) : "0";
    
    return `${trend === "up" ? "+" : "-"}${changePercent}% vs last 30 days`;
  };

  return (
    <Card className="relative overflow-hidden hover:shadow-lg transition-all duration-300 border-0">
      <div className={`absolute inset-0 bg-gradient-to-br ${colorClasses[color].gradient} opacity-5`}></div>
      <CardContent className="p-6 relative">
        <div className="flex items-start justify-between mb-4">
          <div className={`p-3 rounded-xl ${colorClasses[color].bg}`}>
            <Icon className={`h-6 w-6 ${colorClasses[color].icon}`} />
          </div>
          <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getTrendColor()}`}>
            {getTrendIcon()}
            <span className="ml-1">{getTrendLabel()}</span>
          </div>
        </div>
        
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-600">{title}</p>
          <p className="text-4xl font-bold text-slate-900">{value}</p>
          {subtitle && (
            <p className="text-sm text-slate-500">{subtitle}</p>
          )}
        </div>

        {onViewDetails && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              onClick={onViewDetails}
            >
              <Eye className="h-4 w-4 mr-2" />
              View Details
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
