import { trpc } from "@/lib/trpc";
import { AlertTriangle, Clock, Scale, TrendingUp, RefreshCw, CheckCircle } from "lucide-react";

const SEVERITY_CONFIG = {
  critical: {
    border: '#EF4444',
    bg: 'rgba(239,68,68,0.06)',
    icon: AlertTriangle,
    iconColor: '#EF4444',
    badge: { bg: '#FEE2E2', color: '#B91C1C', label: 'CRITICAL' },
  },
  warning: {
    border: '#F59E0B',
    bg: 'rgba(245,158,11,0.06)',
    icon: Clock,
    iconColor: '#F59E0B',
    badge: { bg: '#FEF3C7', color: '#92400E', label: 'ACTION REQUIRED' },
  },
  info: {
    border: '#6366F1',
    bg: 'rgba(99,102,241,0.06)',
    icon: TrendingUp,
    iconColor: '#6366F1',
    badge: { bg: '#EEF2FF', color: '#3730A3', label: 'OPPORTUNITY' },
  },
};

export function ExecutiveAlertsCenter() {
  const { data, isLoading, refetch, isFetching } = trpc.analytics.getExecutiveAlerts.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000, // refresh every 5 min
  });

  const alerts = data?.alerts ?? [];

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
            style={{ background: 'rgba(239,68,68,0.1)' }}
          >
            <AlertTriangle className="h-4 w-4" style={{ color: '#EF4444' }} />
          </div>
          <div>
            <h3 className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>
              Executive Alerts
            </h3>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              {alerts.length === 0 ? 'No active alerts' : `${alerts.length} item${alerts.length > 1 ? 's' : ''} requiring attention`}
            </p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-1.5 rounded-md"
          style={{ color: 'var(--muted-foreground)', background: 'transparent', border: 'none', cursor: 'pointer' }}
          title="Refresh alerts"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Alert list */}
      <div className="p-4 space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded-md animate-pulse" style={{ background: 'var(--muted)' }} />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <CheckCircle className="h-8 w-8" style={{ color: '#10B981' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>All clear</p>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>No alerts at this time</p>
          </div>
        ) : (
          alerts.map(alert => {
            const cfg = SEVERITY_CONFIG[alert.severity];
            const Icon = cfg.icon;
            return (
              <div
                key={alert.id}
                className="rounded-md px-4 py-3 flex items-start gap-3"
                style={{
                  background: cfg.bg,
                  borderLeft: `3px solid ${cfg.border}`,
                  border: `1px solid ${cfg.border}30`,
                  borderLeftWidth: '3px',
                }}
              >
                <Icon className="h-4 w-4 shrink-0 mt-0.5" style={{ color: cfg.iconColor }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-xs font-bold px-1.5 py-0.5 rounded"
                      style={{ background: cfg.badge.bg, color: cfg.badge.color, fontSize: '9px', letterSpacing: '0.06em' }}
                    >
                      {cfg.badge.label}
                    </span>
                    {alert.value && (
                      <span className="text-xs font-bold tabular-nums" style={{ color: cfg.iconColor }}>
                        {alert.value}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium mt-1" style={{ color: 'var(--foreground)' }}>{alert.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{alert.description}</p>
                  {alert.action && (
                    <p className="text-xs mt-1 font-medium" style={{ color: cfg.iconColor }}>{alert.action} →</p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
