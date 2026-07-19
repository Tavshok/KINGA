/**
 * SettlementTrendChart — Executive Dashboard component
 * Displays monthly settlement amounts and counts as a combined bar + line chart.
 * Uses analytics.getSettlementTrend procedure.
 */

import { trpc } from "@/lib/trpc";
import { useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const MONTHS_OPTIONS = [
  { label: '6 months', value: 6 },
  { label: '12 months', value: 12 },
  { label: '24 months', value: 24 },
];

function formatCurrency(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

export function SettlementTrendChart() {
  const [months, setMonths] = useState(12);
  const { data, isLoading, isError } = trpc.analytics.getSettlementTrend.useQuery({ months }, { retry: 0 });

  if (isLoading) {
    return (
      <div style={{ padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280', fontSize: '13px', minHeight: '200px' }}>
        Loading settlement trend…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div style={{ padding: '24px', color: '#EF4444', fontSize: '13px' }}>
        Unable to load settlement trend data.
      </div>
    );
  }

  const { trend } = data;

  if (trend.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#6B7280', fontSize: '13px' }}>
        No completed claims in the selected period.
      </div>
    );
  }

  // Format month labels: "2026-01" → "Jan '26"
  const chartData = trend.map(row => ({
    ...row,
    monthLabel: (() => {
      const [y, m] = row.month.split('-');
      const d = new Date(Number(y), Number(m) - 1, 1);
      return d.toLocaleString('default', { month: 'short' }) + " '" + y.slice(2);
    })(),
  }));

  const totalSettled = trend.reduce((s, r) => s + r.settledAmount, 0);
  const totalCount = trend.reduce((s, r) => s + r.settledCount, 0);
  const avgRatio = trend.filter(r => r.avgSettlementRatio != null).length > 0
    ? Math.round(trend.filter(r => r.avgSettlementRatio != null).reduce((s, r) => s + (r.avgSettlementRatio ?? 0), 0) / trend.filter(r => r.avgSettlementRatio != null).length * 10) / 10
    : null;

  return (
    <div>
      {/* Header with period selector */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '2px' }}>Total Settled</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#15201A', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(totalSettled)}</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '2px' }}>Claims Settled</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#15201A', fontVariantNumeric: 'tabular-nums' }}>{totalCount.toLocaleString()}</div>
          </div>
          {avgRatio != null && (
            <div>
              <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '2px' }}>Avg Settlement Ratio</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: avgRatio > 100 ? '#EF4444' : '#10B981', fontVariantNumeric: 'tabular-nums' }}>{avgRatio}%</div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {MONTHS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setMonths(opt.value)}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: months === opt.value ? 600 : 400,
                background: months === opt.value ? '#1C5C39' : '#F3F4F6',
                color: months === opt.value ? '#FFFFFF' : '#6B7280',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div style={{ height: '260px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="amount" tickFormatter={formatCurrency} tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} width={60} />
            <YAxis yAxisId="count" orientation="right" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} width={36} />
            <Tooltip
              formatter={(value: number, name: string) => {
                if (name === 'Settled Amount') return [formatCurrency(value), name];
                if (name === 'Claims') return [value.toLocaleString(), name];
                if (name === 'Settlement Ratio') return [`${value}%`, name];
                return [value, name];
              }}
              contentStyle={{ fontSize: '12px', border: '1px solid #E7E2D6', borderRadius: '6px' }}
            />
            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
            <Bar yAxisId="amount" dataKey="settledAmount" name="Settled Amount" fill="#1C5C39" opacity={0.85} radius={[3, 3, 0, 0]} />
            <Line yAxisId="count" type="monotone" dataKey="settledCount" name="Claims" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} />
            {avgRatio != null && (
              <Line yAxisId="count" type="monotone" dataKey="avgSettlementRatio" name="Settlement Ratio" stroke="#7C3AED" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
