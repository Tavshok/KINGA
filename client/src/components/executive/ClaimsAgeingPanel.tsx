import { trpc } from "@/lib/trpc";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { Timer } from "lucide-react";

export function ClaimsAgeingPanel({ compact }: { compact?: boolean } = {}) {
  const { currencySymbol } = useTenantCurrency();
  function fmt(v: number) {
    if (v >= 1_000_000) return `${currencySymbol} ${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${currencySymbol} ${(v / 1_000).toFixed(0)}K`;
    return `${currencySymbol} ${v.toLocaleString()}`;
  }
  const { data, isLoading } = trpc.analytics.getClaimsAgeing.useQuery();
  const buckets = data?.buckets ?? [];
  const total = buckets.reduce((s, b) => s + b.count, 0);

  const bucketContent = (
    <>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-8 rounded-md animate-pulse" style={{ background: 'var(--muted)' }} />
          ))}
        </div>
      ) : buckets.length === 0 ? (
        <p className="text-sm text-center py-4" style={{ color: 'var(--muted-foreground)' }}>No open claims</p>
      ) : (
        <>
          {/* Stacked bar */}
          {total > 0 && (
            <div className="flex rounded-full overflow-hidden h-2 mb-3">
              {buckets.map(b => (
                <div
                  key={b.label}
                  style={{
                    width: `${(b.count / total) * 100}%`,
                    background: b.color,
                    minWidth: b.count > 0 ? '2px' : '0',
                  }}
                  title={`${b.label}: ${b.count}`}
                />
              ))}
            </div>
          )}

          {buckets.map(b => (
            <div
              key={b.label}
              className="flex items-center justify-between rounded-md px-3 py-2.5"
              style={{
                background: 'var(--muted)',
                borderLeft: `3px solid ${b.color}`,
              }}
            >
              {/* Left: colour dot + age label */}
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: b.color }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>{b.label}</span>
              </div>
              {/* Right: count pill + exposure value */}
              <div className="flex items-center gap-3">
                {/* Claim count — prominent */}
                <div className="flex items-center gap-1">
                  <span className="text-base font-bold tabular-nums" style={{ color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                    {b.count}
                  </span>
                  <span className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>claim{b.count !== 1 ? 's' : ''}</span>
                </div>
                {/* Exposure value — clearly styled, not muted */}
                {b.value > 0 && (
                  <div
                    className="px-2 py-0.5 rounded text-xs font-semibold tabular-nums"
                    style={{
                      background: `${b.color}22`,
                      color: b.color,
                      border: `1px solid ${b.color}44`,
                      fontVariantNumeric: 'tabular-nums',
                      minWidth: '64px',
                      textAlign: 'right',
                    }}
                  >
                    {fmt(b.value)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );

  if (compact) {
    return <div className="space-y-2">{bucketContent}</div>;
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
        className="flex items-center gap-2.5 px-5 py-4"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center"
          style={{ background: 'rgba(245,158,11,0.1)' }}
        >
          <Timer className="h-4 w-4" style={{ color: '#F59E0B' }} />
        </div>
        <div>
          <h3 className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>Claims Ageing</h3>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            {total > 0 ? `${total} open claim${total > 1 ? 's' : ''} by age` : 'Open claims by age'}
          </p>
        </div>
      </div>

      {/* Buckets */}
      <div className="p-4 space-y-3">
        {bucketContent}
      </div>
    </div>
  );
}
