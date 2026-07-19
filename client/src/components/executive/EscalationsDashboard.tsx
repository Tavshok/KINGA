/**
 * EscalationsDashboard — Executive Dashboard component
 * Displays escalation counts by category with severity indicators.
 * Uses analytics.getEscalationCounts procedure.
 */

import { trpc } from "@/lib/trpc";
import { AlertTriangle, AlertCircle, Clock, TrendingUp } from "lucide-react";

const SEVERITY_CONFIG = {
  critical: { bg: '#FDF2F8', border: '#7C3AED', text: '#7C3AED', badge: '#7C3AED', badgeText: '#FFFFFF' },
  high: { bg: '#FEF2F2', border: '#EF4444', text: '#EF4444', badge: '#EF4444', badgeText: '#FFFFFF' },
  medium: { bg: '#FFFBEB', border: '#F59E0B', text: '#F59E0B', badge: '#F59E0B', badgeText: '#FFFFFF' },
  low: { bg: '#F0FDF4', border: '#10B981', text: '#10B981', badge: '#10B981', badgeText: '#FFFFFF' },
};

export function EscalationsDashboard() {
  const { data, isLoading, isError } = trpc.analytics.getEscalationCounts.useQuery({}, { retry: 0 });

  if (isLoading) {
    return (
      <div style={{ padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280', fontSize: '13px' }}>
        Loading escalation data…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div style={{ padding: '24px', color: '#EF4444', fontSize: '13px' }}>
        Unable to load escalation data.
      </div>
    );
  }

  const { summary, categories } = data;

  const summaryCards = [
    { label: 'Disputed Claims', value: summary.disputed, icon: AlertCircle, color: '#EF4444', bg: '#FEF2F2' },
    { label: 'Fraud Escalations', value: summary.fraudEscalations, icon: AlertTriangle, color: '#7C3AED', bg: '#FDF2F8' },
    { label: 'High-Value Pending', value: summary.highValuePending, icon: TrendingUp, color: '#F59E0B', bg: '#FFFBEB' },
    { label: 'Aged Claims (30d+)', value: summary.agedClaims, icon: Clock, color: '#6B7280', bg: '#F9FAFB' },
  ];

  return (
    <div style={{ padding: '0' }}>
      {/* KPI Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              style={{
                background: card.bg,
                border: `1px solid ${card.color}30`,
                borderLeft: `4px solid ${card.color}`,
                borderRadius: '8px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: '#6B7280', fontWeight: 500 }}>{card.label}</span>
                <Icon style={{ width: '16px', height: '16px', color: card.color }} />
              </div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: card.color, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                {card.value.toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Category Breakdown */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E7E2D6', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #E7E2D6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#15201A' }}>Escalation Categories</span>
          <span style={{ fontSize: '11px', color: '#6B7280' }}>All active claims</span>
        </div>
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {categories.map((cat) => {
            const cfg = SEVERITY_CONFIG[cat.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.medium;
            const maxCount = Math.max(...categories.map(c => c.count), 1);
            const barPct = Math.round((cat.count / maxCount) * 100);
            return (
              <div key={cat.label} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '140px', fontSize: '12.5px', color: '#374151', fontWeight: 500, flexShrink: 0 }}>{cat.label}</div>
                <div style={{ flex: 1, background: '#F3F4F6', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                  <div style={{ width: `${barPct}%`, height: '100%', background: cat.color, borderRadius: '4px', transition: 'width 0.3s ease' }} />
                </div>
                <div style={{ width: '40px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: cat.color, fontVariantNumeric: 'tabular-nums' }}>
                  {cat.count}
                </div>
                <div style={{ width: '70px', textAlign: 'right' }}>
                  <span style={{ fontSize: '10px', fontWeight: 600, background: cfg.badge, color: cfg.badgeText, padding: '2px 6px', borderRadius: '10px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    {cat.severity}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
