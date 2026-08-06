import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Shield, RefreshCw, AlertTriangle, UserCog } from "lucide-react";

function timeAgo(ts: string | null): string {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

export default function SecurityEvents() {
  const [activeTab, setActiveTab] = useState<'role_changes' | 'access_denials'>('role_changes');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const { data, isLoading, refetch } = trpc.admin.getSecurityEvents.useQuery(
    { limit: 100 },
    { refetchInterval: autoRefresh ? 15_000 : false }
  );

  const roleChanges: any[] = (data as any)?.roleChanges ?? [];
  const accessDenials: any[] = (data as any)?.accessDenials ?? [];

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#F7F8F6', minHeight: '100vh', padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111', margin: 0 }}>Security Events</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>Role changes, access denials, overrides, and segregation events</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setAutoRefresh(v => !v)} style={{ fontSize: 12, padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 6, background: autoRefresh ? '#f0fdf4' : '#fff', color: autoRefresh ? '#16a34a' : '#374151', cursor: 'pointer' }}>
            <RefreshCw style={{ width: 12, height: 12, display: 'inline', marginRight: 4 }} />
            {autoRefresh ? 'Live' : 'Manual'}
          </button>
          <button onClick={() => refetch()} style={{ fontSize: 12, padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>Refresh</button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <UserCog style={{ width: 24, height: 24, color: '#7c3aed' }} />
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#111' }}>{roleChanges.length}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Role changes recorded</div>
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <AlertTriangle style={{ width: 24, height: 24, color: '#d97706' }} />
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#111' }}>{accessDenials.length}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Access denials & overrides</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 4, width: 'fit-content' }}>
        {[
          { key: 'role_changes', label: `Role Changes (${roleChanges.length})` },
          { key: 'access_denials', label: `Access Denials & Overrides (${accessDenials.length})` },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key as any)} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: activeTab === tab.key ? '#111' : 'none', color: activeTab === tab.key ? '#fff' : '#6b7280', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Role Changes */}
      {activeTab === 'role_changes' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          {isLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading…</div>
          ) : roleChanges.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No role changes recorded</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Time','User ID','Previous Role','New Role','Changed By','Tenant','Justification'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roleChanges.map((rc: any, i: number) => (
                  <tr key={rc.id ?? i} style={{ borderBottom: '1px solid #f9fafb' }}>
                    <td style={{ padding: '9px 14px', fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>{timeAgo(rc.timestamp)}</td>
                    <td style={{ padding: '9px 14px', fontSize: 12, color: '#374151' }}>#{rc.userId}</td>
                    <td style={{ padding: '9px 14px', fontSize: 11 }}>
                      <span style={{ background: '#fef2f2', color: '#dc2626', padding: '2px 6px', borderRadius: 4 }}>{rc.previousRole ?? '—'}</span>
                    </td>
                    <td style={{ padding: '9px 14px', fontSize: 11 }}>
                      <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '2px 6px', borderRadius: 4 }}>{rc.newRole}</span>
                    </td>
                    <td style={{ padding: '9px 14px', fontSize: 12, color: '#6b7280' }}>#{rc.changedByUserId}</td>
                    <td style={{ padding: '9px 14px', fontSize: 11, color: '#6b7280' }}>{rc.tenantId}</td>
                    <td style={{ padding: '9px 14px', fontSize: 11, color: '#6b7280', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rc.justification ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Access Denials */}
      {activeTab === 'access_denials' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          {isLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading…</div>
          ) : accessDenials.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No access denial events recorded</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Time','Action','Entity','Role','Tenant','IP'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accessDenials.map((ev: any, i: number) => (
                  <tr key={ev.id ?? i} style={{ borderBottom: '1px solid #f9fafb' }}>
                    <td style={{ padding: '9px 14px', fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>{timeAgo(ev.timestamp)}</td>
                    <td style={{ padding: '9px 14px', fontSize: 12, fontWeight: 500, color: '#dc2626' }}>{ev.action.replace(/_/g,' ')}</td>
                    <td style={{ padding: '9px 14px', fontSize: 11, color: '#374151' }}>{ev.entityType} #{ev.entityId}</td>
                    <td style={{ padding: '9px 14px', fontSize: 11, color: '#6b7280' }}>{ev.userRole ?? '—'}</td>
                    <td style={{ padding: '9px 14px', fontSize: 11, color: '#6b7280' }}>{ev.tenantId ?? '—'}</td>
                    <td style={{ padding: '9px 14px', fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>{ev.ipAddress ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

