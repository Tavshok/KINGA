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
  blue:   { icon: 'var(--info)', accent: 'var(--fp-info-bg)', glow: 'var(--fp-info-bg)' },
  green:  { icon: 'var(--success)', accent: 'var(--fp-success-bg)', glow: 'var(--fp-success-bg)' },
  purple: { icon: 'var(--chart-5)', accent: 'var(--fp-info-bg)', glow: 'var(--fp-info-bg)' },
  red:    { icon: 'var(--chart-4)',  accent: 'var(--fp-critical-bg)',  glow: 'var(--fp-critical-bg)'  },
  amber:  { icon: 'var(--warning)',  accent: 'var(--fp-warning-bg)',  glow: 'var(--fp-warning-bg)'  },
  slate:  { icon: 'var(--muted-foreground)', accent: 'var(--muted)', glow: 'var(--muted)' },
  orange: { icon: 'var(--warning)',  accent: 'var(--fp-warning-bg)',  glow: 'var(--fp-warning-bg)'  },
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
      case "down": return { background: 'var(--fp-success-bg)', color: 'var(--success)' };
      case "up":   return { background: 'var(--fp-critical-bg)',  color: 'var(--chart-4)'  };
      case "stable": return { background: 'var(--muted)', color: 'var(--muted-foreground)' };
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
        background: 'var(--background)',
        border: '1px solid var(--border)',
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
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>{title}</p>
        <p className="text-3xl font-bold" style={{ color: 'var(--foreground)' }}>{value}</p>
        {subtitle && (
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{subtitle}</p>
        )}
      </div>

      {onViewDetails && (
        <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
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
