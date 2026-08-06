import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { RefreshCw, Activity } from "lucide-react";

const ACTION_ICONS: Record<string, string> = {
  claim_submitted: "📋", claim_approved: "✅", claim_rejected: "❌",
  ai_assessment_completed: "🤖", fraud_detected: "🚨", payment_authorized: "💰",
  panel_beater_approved: "🔧", panel_beater_rejected: "🚫", panel_beater_suspended: "⏸️",
  repair_completed: "🔨", inspection_completed: "🔍", quotation_submitted: "📄",
  fleet_registered: "🚗", user_registered: "👤", tenant_created: "🏢",
};

function actionLabel(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function timeAgo(ts: string | Date | null): string {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

export default function ActivityTimeline() {
  const [autoRefresh, setAutoRefresh] = useState(false);
  const { data: events = [], isLoading, refetch } = trpc.admin.getActivityTimeline.useQuery(
    { limit: 100 },
    { refetchInterval: autoRefresh ? 10_000 : false }
  );

  const items = events as any[];

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#F7F8F6', minHeight: '100vh', padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111', margin: 0 }}>Activity Timeline</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>Real-time operational event stream — invaluable for diagnosing issues</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setAutoRefresh(v => !v)} style={{ fontSize: 12, padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 6, background: autoRefresh ? '#f0fdf4' : '#fff', color: autoRefresh ? '#16a34a' : '#374151', cursor: 'pointer' }}>
            <RefreshCw style={{ width: 12, height: 12, display: 'inline', marginRight: 4 }} />
            {autoRefresh ? 'Live (10s)' : 'Manual'}
          </button>
          <button onClick={() => refetch()} style={{ fontSize: 12, padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>Refresh</button>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 0' }}>
        {isLoading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading events…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No audit events recorded yet</div>
        ) : (
          items.map((event: any, i: number) => (
            <div key={event.id ?? i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '12px 20px', borderBottom: i < items.length - 1 ? '1px solid #f9fafb' : 'none' }}>
              {/* Time */}
              <div style={{ minWidth: 52, fontSize: 11, color: '#9ca3af', fontFamily: 'monospace', paddingTop: 2 }}>
                {event.timestamp ? new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
              </div>
              {/* Icon */}
              <div style={{ fontSize: 16, minWidth: 20 }}>{ACTION_ICONS[event.action] ?? '⚡'}</div>
              {/* Content */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{actionLabel(event.action)}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                  {event.entityType && <span style={{ marginRight: 8 }}>{event.entityType} #{event.entityId}</span>}
                  {event.userRole && <span style={{ marginRight: 8 }}>· {event.userRole}</span>}
                  {event.tenantId && <span>· {event.tenantId}</span>}
                </div>
              </div>
              {/* Time ago */}
              <div style={{ fontSize: 11, color: '#9ca3af', minWidth: 60, textAlign: 'right' }}>{timeAgo(event.timestamp)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

