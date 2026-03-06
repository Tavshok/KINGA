/**
 * Governance Summary Card Component — World-class dark BI design
 */

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

const GOV_COLORS: Record<string, { icon: string; accent: string; glow: string }> = {
  blue:   { icon: 'oklch(0.60 0.20 250)', accent: 'oklch(0.60 0.20 250 / 0.15)', glow: 'oklch(0.60 0.20 250 / 0.06)' },
  green:  { icon: 'oklch(0.65 0.18 145)', accent: 'oklch(0.65 0.18 145 / 0.15)', glow: 'oklch(0.65 0.18 145 / 0.06)' },
  purple: { icon: 'oklch(0.65 0.20 295)', accent: 'oklch(0.65 0.20 295 / 0.15)', glow: 'oklch(0.65 0.20 295 / 0.06)' },
  red:    { icon: 'oklch(0.62 0.22 25)',  accent: 'oklch(0.62 0.22 25 / 0.15)',  glow: 'oklch(0.62 0.22 25 / 0.06)'  },
  amber:  { icon: 'oklch(0.75 0.18 70)',  accent: 'oklch(0.75 0.18 70 / 0.15)',  glow: 'oklch(0.75 0.18 70 / 0.06)'  },
  slate:  { icon: 'oklch(0.62 0.015 250)', accent: 'oklch(0.62 0.015 250 / 0.15)', glow: 'oklch(0.62 0.015 250 / 0.06)' },
  orange: { icon: 'oklch(0.70 0.20 50)',  accent: 'oklch(0.70 0.20 50 / 0.15)',  glow: 'oklch(0.70 0.20 50 / 0.06)'  },
};

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
  const c = GOV_COLORS[color] || GOV_COLORS.slate;

  const getTrendIcon = () => {
    switch (trend) {
      case "up": return <TrendingUp className="h-3 w-3" />;
      case "down": return <TrendingDown className="h-3 w-3" />;
      case "stable": return <Minus className="h-3 w-3" />;
    }
  };

  const getTrendStyle = () => {
    switch (trend) {
      case "down": return { background: 'oklch(0.65 0.18 145 / 0.12)', color: 'oklch(0.65 0.18 145)' };
      case "up":   return { background: 'oklch(0.62 0.22 25 / 0.12)',  color: 'oklch(0.62 0.22 25)'  };
      case "stable": return { background: 'oklch(0.45 0.015 250 / 0.12)', color: 'var(--muted-foreground)' };
    }
  };

  const getTrendLabel = () => {
    if (trend === "stable") return "Stable";
    if (!previousValue) return trend === "up" ? "Increasing" : "Decreasing";
    const current = typeof value === "string" ? parseFloat(value) : value;
    const change = Math.abs(current - previousValue);
    const changePercent = previousValue > 0 ? ((change / previousValue) * 100).toFixed(0) : "0";
    return `${trend === "up" ? "+" : "-"}${changePercent}% vs 30d`;
  };

  return (
    <div
      className="relative overflow-hidden rounded-xl p-5"
      style={{
        background: 'linear-gradient(135deg, oklch(0.14 0.018 250) 0%, oklch(0.12 0.015 250) 100%)',
        border: '1px solid oklch(0.22 0.02 250)',
        boxShadow: `0 0 16px ${c.glow}`,
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className="p-2.5 rounded-lg"
          style={{ background: c.accent, border: `1px solid ${c.icon}40` }}
        >
          <Icon className="h-4 w-4" style={{ color: c.icon }} />
        </div>
        <div
          className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
          style={getTrendStyle()}
        >
          {getTrendIcon()}
          <span className="ml-0.5">{getTrendLabel()}</span>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'oklch(0.48 0.015 250)' }}>{title}</p>
        <p className="text-3xl font-bold" style={{ color: 'oklch(0.92 0.008 250)' }}>{value}</p>
        {subtitle && (
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{subtitle}</p>
        )}
      </div>

      {onViewDetails && (
        <div className="mt-4 pt-3" style={{ borderTop: '1px solid oklch(0.22 0.02 250)' }}>
          <button
            className="w-full flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded"
            style={{ color: 'var(--muted-foreground)', background: 'var(--card)' }}
            onClick={onViewDetails}
          >
            <Eye className="h-3 w-3" />
            View Details
          </button>
        </div>
      )}
    </div>
  );
}
