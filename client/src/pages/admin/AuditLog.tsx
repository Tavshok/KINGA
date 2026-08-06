import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Search, Download, RefreshCw, Filter } from "lucide-react";

const ENTITY_TYPES = ['claim','user','tenant','panel_beater','assessment','payment','repair','inspection','fleet','policy'];
const USER_ROLES = ['platform_super_admin','admin','insurer','claims_processor','claims_manager','assessor','panel_beater','claimant','agency','fleet_admin'];

const ACTION_ICONS: Record<string, string> = {
  claim_submitted: "📋", claim_approved: "✅", claim_rejected: "❌",
  ai_assessment_completed: "🤖", fraud_detected: "🚨", payment_authorized: "💰",
  panel_beater_approved: "🔧", panel_beater_rejected: "🚫", panel_beater_suspended: "⏸️",
  repair_completed: "🔨", inspection_completed: "🔍", quotation_submitted: "📄",
};

function actionLabel(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function AuditLog() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('');
  const [userRole, setUserRole] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const { data, isLoading, refetch } = trpc.admin.getAuditLog.useQuery({
    page,
    pageSize: 50,
    action: search || undefined,
    entityType: entityType || undefined,
    userRole: userRole || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  }, { keepPreviousData: true });

  const rows = (data as any)?.rows ?? [];
  const total = (data as any)?.total ?? 0;
  const totalPages = (data as any)?.totalPages ?? 1;

  function exportCsv() {
    const headers = ['ID','Timestamp','User ID','Role','Action','Entity Type','Entity ID','Tenant','IP Address'];
    const csvRows = rows.map((r: any) => [
      r.id, r.timestamp, r.userId, r.userRole ?? '', r.action, r.entityType, r.entityId, r.tenantId ?? '', r.ipAddress ?? ''
    ].join(','));
    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `kinga-audit-log-${new Date().toISOString().slice(0,10)}.csv`; a.click();
  }

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#F7F8F6', minHeight: '100vh', padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111', margin: 0 }}>Audit Log</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
            Complete tamper-evident record of all platform actions — {total.toLocaleString()} events
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => refetch()} style={{ fontSize: 12, padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <RefreshCw style={{ width: 12, height: 12 }} /> Refresh
          </button>
          <button onClick={exportCsv} style={{ fontSize: 12, padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Download style={{ width: 12, height: 12 }} /> Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 20px', marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 160px 160px 140px 140px auto', gap: 10, alignItems: 'end' }}>
        <div>
          <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Search action</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={searchInput} onChange={e => setSearchInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput); setPage(1); }}} placeholder="e.g. claim_approved…" style={{ flex: 1, padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }} />
            <button onClick={() => { setSearch(searchInput); setPage(1); }} style={{ padding: '6px 10px', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
              <Search style={{ width: 12, height: 12 }} />
            </button>
          </div>
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Entity type</label>
          <select value={entityType} onChange={e => { setEntityType(e.target.value); setPage(1); }} style={{ width: '100%', padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }}>
            <option value="">All types</option>
            {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>User role</label>
          <select value={userRole} onChange={e => { setUserRole(e.target.value); setPage(1); }} style={{ width: '100%', padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }}>
            <option value="">All roles</option>
            {USER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>From date</label>
          <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1); }} style={{ width: '100%', padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>To date</label>
          <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1); }} style={{ width: '100%', padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }} />
        </div>
        <button onClick={() => { setSearch(''); setSearchInput(''); setEntityType(''); setUserRole(''); setFromDate(''); setToDate(''); setPage(1); }} style={{ padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', fontSize: 12, cursor: 'pointer', color: '#6b7280' }}>
          Clear
        </button>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading audit records…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No audit records match the current filters</div>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Time','Action','Entity','Tenant','Role','IP'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row: any, i: number) => (
                  <tr key={row.id ?? i} style={{ borderBottom: '1px solid #f9fafb' }}>
                    <td style={{ padding: '9px 14px', fontSize: 11, color: '#9ca3af', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      {row.timestamp ? new Date(row.timestamp).toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 14 }}>{ACTION_ICONS[row.action] ?? '⚡'}</span>
                        <span style={{ fontSize: 12, fontWeight: 500, color: '#111' }}>{actionLabel(row.action)}</span>
                      </div>
                    </td>
                    <td style={{ padding: '9px 14px', fontSize: 12, color: '#374151' }}>
                      <span style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontFamily: 'monospace' }}>{row.entityType}</span>
                      {row.entityId && <span style={{ marginLeft: 4, color: '#9ca3af', fontSize: 11 }}>#{row.entityId}</span>}
                    </td>
                    <td style={{ padding: '9px 14px', fontSize: 11, color: '#6b7280' }}>{row.tenantId ?? '—'}</td>
                    <td style={{ padding: '9px 14px', fontSize: 11, color: '#6b7280' }}>{row.userRole ?? '—'}</td>
                    <td style={{ padding: '9px 14px', fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>{row.ipAddress ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Pagination */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid #f3f4f6' }}>
              <span style={{ fontSize: 12, color: '#6b7280' }}>Showing {((page-1)*50)+1}–{Math.min(page*50, total)} of {total.toLocaleString()} events</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1} style={{ padding: '4px 10px', border: '1px solid #e5e7eb', borderRadius: 4, background: '#fff', fontSize: 12, cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? '#d1d5db' : '#374151' }}>← Prev</button>
                <span style={{ padding: '4px 10px', fontSize: 12, color: '#374151' }}>Page {page} of {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages} style={{ padding: '4px 10px', border: '1px solid #e5e7eb', borderRadius: 4, background: '#fff', fontSize: 12, cursor: page === totalPages ? 'not-allowed' : 'pointer', color: page === totalPages ? '#d1d5db' : '#374151' }}>Next →</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
