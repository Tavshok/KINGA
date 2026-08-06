import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { Search, UserCheck, UserX, Shield } from "lucide-react";

const ALL_ROLES = ['user','admin','insurer','assessor','panel_beater','claimant','platform_super_admin','fleet_admin','fleet_manager','fleet_driver','agency','engineer'];
const INSURER_ROLES = ['claims_processor','assessor_internal','assessor_external','risk_manager','claims_manager','executive','insurer_admin','recovery_officer'];

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  platform_super_admin: { bg: '#fef3c7', color: '#92400e' },
  admin: { bg: '#ede9fe', color: '#5b21b6' },
  insurer: { bg: '#dbeafe', color: '#1e40af' },
  assessor: { bg: '#dcfce7', color: '#166534' },
  panel_beater: { bg: '#fce7f3', color: '#9d174d' },
  claimant: { bg: '#f3f4f6', color: '#374151' },
  agency: { bg: '#ecfdf5', color: '#065f46' },
  engineer: { bg: '#fff7ed', color: '#9a3412' },
  fleet_admin: { bg: '#f0f9ff', color: '#0c4a6e' },
  fleet_manager: { bg: '#f0f9ff', color: '#0c4a6e' },
  fleet_driver: { bg: '#f0f9ff', color: '#0c4a6e' },
  user: { bg: '#f9fafb', color: '#6b7280' },
};

export default function UserManagement() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [editUser, setEditUser] = useState<any>(null);
  const [newRole, setNewRole] = useState('');
  const [newInsurerRole, setNewInsurerRole] = useState('');
  const [justification, setJustification] = useState('');

  const { data, isLoading, refetch } = trpc.admin.getUsersAdmin.useQuery({
    page, pageSize: 50, search: search || undefined, role: roleFilter || undefined,
  }, { keepPreviousData: true });

  const deactivate = trpc.admin.deactivateUser.useMutation({
    onSuccess: () => { toast.success('User deactivated'); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const assignRole = trpc.platformUserRoles.assignRole.useMutation({
    onSuccess: () => { toast.success('Role updated successfully'); setEditUser(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const users = (data as any)?.users ?? [];
  const total = (data as any)?.total ?? 0;
  const totalPages = (data as any)?.totalPages ?? 1;

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#F7F8F6', minHeight: '100vh', padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111', margin: 0 }}>User Management</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>{total.toLocaleString()} users across all tenants</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Search name or email</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={searchInput} onChange={e => setSearchInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput); setPage(1); }}} placeholder="Search…" style={{ flex: 1, padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }} />
            <button onClick={() => { setSearch(searchInput); setPage(1); }} style={{ padding: '6px 10px', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
              <Search style={{ width: 12, height: 12 }} />
            </button>
          </div>
        </div>
        <div style={{ width: 180 }}>
          <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Filter by role</label>
          <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }} style={{ width: '100%', padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }}>
            <option value="">All roles</option>
            {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <button onClick={() => { setSearch(''); setSearchInput(''); setRoleFilter(''); setPage(1); }} style={{ padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', fontSize: 12, cursor: 'pointer', color: '#6b7280' }}>Clear</button>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading users…</div>
        ) : users.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No users found</div>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Name','Email','Role','Insurer Role','Tenant','Last Sign In','Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((user: any) => {
                  const roleStyle = ROLE_COLORS[user.role] ?? ROLE_COLORS.user;
                  return (
                    <tr key={user.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#111' }}>{user.name ?? '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: '#6b7280' }}>{user.email ?? '—'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: roleStyle.bg, color: roleStyle.color, fontWeight: 600 }}>{user.role}</span>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: '#6b7280' }}>{user.insurerRole ?? '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: '#6b7280' }}>{user.tenantId ?? '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: '#9ca3af' }}>{user.lastSignedIn ? new Date(user.lastSignedIn).toLocaleDateString() : '—'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => { setEditUser(user); setNewRole(user.role); setNewInsurerRole(user.insurerRole ?? ''); setJustification(''); }} style={{ fontSize: 11, padding: '3px 8px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 4, cursor: 'pointer' }}>
                            <Shield style={{ width: 10, height: 10, display: 'inline', marginRight: 3 }} />Role
                          </button>
                          {user.isActive !== 0 && (
                            <button onClick={() => deactivate.mutate({ userId: user.id })} style={{ fontSize: 11, padding: '3px 8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer' }}>
                              <UserX style={{ width: 10, height: 10, display: 'inline', marginRight: 3 }} />Deactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid #f3f4f6' }}>
              <span style={{ fontSize: 12, color: '#6b7280' }}>Showing {((page-1)*50)+1}–{Math.min(page*50, total)} of {total.toLocaleString()} users</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1} style={{ padding: '4px 10px', border: '1px solid #e5e7eb', borderRadius: 4, background: '#fff', fontSize: 12, cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? '#d1d5db' : '#374151' }}>← Prev</button>
                <span style={{ padding: '4px 10px', fontSize: 12, color: '#374151' }}>Page {page} of {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages} style={{ padding: '4px 10px', border: '1px solid #e5e7eb', borderRadius: 4, background: '#fff', fontSize: 12, cursor: page === totalPages ? 'not-allowed' : 'pointer', color: page === totalPages ? '#d1d5db' : '#374151' }}>Next →</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Role Assignment Modal */}
      {editUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 440 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111', marginBottom: 4 }}>Assign Role</h3>
            <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>{editUser.name ?? editUser.email}</p>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Platform Role</label>
              <select value={newRole} onChange={e => setNewRole(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13 }}>
                {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {newRole === 'insurer' && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Insurer Sub-Role (optional)</label>
                <select value={newInsurerRole} onChange={e => setNewInsurerRole(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13 }}>
                  <option value="">None</option>
                  {INSURER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            )}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Justification (required for audit)</label>
              <textarea value={justification} onChange={e => setJustification(e.target.value)} style={{ width: '100%', height: 60, border: '1px solid #e5e7eb', borderRadius: 6, padding: 8, fontSize: 12, resize: 'none' }} placeholder="Reason for role change…" />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditUser(null)} style={{ padding: '8px 16px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={() => assignRole.mutate({ targetUserId: editUser.id, newRole: newRole as any, newInsurerRole: (newRole === 'insurer' && newInsurerRole) ? newInsurerRole as any : undefined, justification })}
                disabled={!justification.trim() || assignRole.isPending}
                style={{ padding: '8px 16px', border: 'none', borderRadius: 6, background: justification.trim() ? '#111' : '#d1d5db', color: '#fff', fontSize: 13, cursor: justification.trim() ? 'pointer' : 'not-allowed', fontWeight: 600 }}
              >
                {assignRole.isPending ? 'Saving…' : 'Assign Role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
