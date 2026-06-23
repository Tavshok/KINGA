import { trpc } from "@/lib/trpc";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { Filter } from "lucide-react";

const STAGE_COLORS = ['#6366F1', '#8B5CF6', '#F59E0B', '#EF4444', '#10B981'];

export function FraudInvestigationFunnel({ compact }: { compact?: boolean } = {}) {
  const { currencySymbol } = useTenantCurrency();
  function fmt(v: number) {
    if (v >= 1_000_000) return `${currencySymbol} ${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${currencySymbol} ${(v / 1_000).toFixed(0)}K`;
    return `${currencySymbol} ${v.toLocaleString()}`;
  }
  const { data, isLoading } = trpc.analytics.getFraudInvestigationFunnel.useQuery();
  const stages = data?.stages ?? [];
  const preventedLoss = data?.preventedLoss ?? 0;
  const conversionRate = data?.conversionRate ?? 0;
  const maxCount = stages[0]?.count ?? 1;

  const funnelContent = (
    <div className="space-y-2">
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-10 rounded-md animate-pulse" style={{ background: 'var(--muted)' }} />
          ))}
        </div>
      ) : stages.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: 'var(--muted-foreground)' }}>No fraud data available</p>
      ) : (
        stages.map((stage, i) => {
          const barWidth = maxCount > 0 ? Math.max((stage.count / maxCount) * 100, stage.count > 0 ? 4 : 0) : 0;
          const color = STAGE_COLORS[i] ?? '#6366F1';
          const count = typeof stage.count === 'number' ? stage.count : 0;
          const pct = typeof stage.pct === 'number' ? stage.pct : 0;
          return (
            <div key={stage.label} className="space-y-1">
              <div className="flex items-center justify-between">
                {/* Stage label */}
                <span className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>{stage.label}</span>
                {/* Count + percentage */}
                <div className="flex items-center gap-2">
                  <span
                    className="px-1.5 py-0.5 rounded text-xs font-medium"
                    style={{ background: `${color}22`, color: color, border: `1px solid ${color}44` }}
                  >
                    {pct}%
                  </span>
                  <span
                    className="text-sm font-bold tabular-nums"
                    style={{ color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums', minWidth: '2.5rem', textAlign: 'right' }}
                  >
                    {count.toLocaleString()}
                  </span>
                </div>
              </div>
              {/* Progress bar */}
              <div className="h-5 rounded-sm overflow-hidden" style={{ background: 'var(--muted)' }}>
                <div
                  className="h-full rounded-sm transition-all duration-500 flex items-center justify-end pr-1.5"
                  style={{ width: `${barWidth}%`, background: color, opacity: 0.85, minWidth: count > 0 ? '2rem' : '0' }}
                />
              </div>
            </div>
          );
        })
      )}

      {/* Footer: conversion rate + prevented loss */}
      {!isLoading && (conversionRate > 0 || preventedLoss > 0) && (
        <div
          className="mt-3 pt-3 flex items-center justify-between gap-4"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          {conversionRate > 0 && (
            <div>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Flag-to-repudiation</p>
              <p className="text-sm font-bold" style={{ color: '#10B981' }}>{conversionRate}%</p>
            </div>
          )}
          {preventedLoss > 0 && (
            <div className="text-right">
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Prevented Loss</p>
              <p className="text-sm font-bold tabular-nums" style={{ color: '#10B981' }}>{fmt(preventedLoss)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Compact mode: no outer card wrapper — used when embedded inside another card
  if (compact) {
    return funnelContent;
  }

  return (
    <div
      className="rounded-lg"
      style={{
        background: 'var(--background)',
        border: '1px solid var(--border)',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center"
            style={{ background: 'rgba(99,102,241,0.1)' }}
          >
            <Filter className="h-4 w-4" style={{ color: '#6366F1' }} />
          </div>
          <div>
            <h3 className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>Fraud Investigation Funnel</h3>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              Flagged → Investigated → Prevented
            </p>
          </div>
        </div>
      </div>
      <div className="p-4">
        {funnelContent}
      </div>
    </div>
  );
}
