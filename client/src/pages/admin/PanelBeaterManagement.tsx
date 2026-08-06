import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle, XCircle, AlertTriangle, Clock, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

type PBStatus = 'pending' | 'approved' | 'suspended' | 'rejected';

const STATUS_CONFIG: Record<PBStatus, { label: string; bg: string; color: string }> = {
  pending:   { label: 'Pending',   bg: '#fffbeb', color: '#d97706' },
  approved:  { label: 'Approved',  bg: '#f0fdf4', color: '#16a34a' },
  suspended: { label: 'Suspended', bg: '#fff7ed', color: '#ea580c' },
  rejected:  { label: 'Rejected',  bg: '#fef2f2', color: '#dc2626' },
};

export default function PanelBeaterManagement() {
  const [activeTab, setActiveTab] = useState<PBStatus | 'all'>('all');
  const [reasonModal, setReasonModal] = useState<{ id: number; action: PBStatus } | null>(null);
  const [reason, setReason] = useState('');

  const { data: panelBeaters = [], isLoading, refetch } = trpc.admin.getPanelBeatersAdmin.useQuery();
  const utils = trpc.useUtils();
  const updateStatus = trpc.admin.updatePanelBeaterStatus.useMutation({
    onSuccess: (data) => {
      toast.success(`Panel beater ${data.status} successfully`);
      setReasonModal(null);
      setReason('');
      refetch();
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const pbs = (panelBeaters as any[]);
  const filtered = activeTab === 'all' ? pbs : pbs.filter((pb: any) => (pb.panelBeaterStatus ?? (pb.approved ? 'approved' : 'pending')) === activeTab);

  const counts = {
    all: pbs.length,
    pending: pbs.filter((pb: any) => (pb.panelBeaterStatus ?? (pb.approved ? 'approved' : 'pending')) === 'pending').length,
    approved: pbs.filter((pb: any) => (pb.panelBeaterStatus ?? (pb.approved ? 'approved' : 'pending')) === 'approved').length,
    suspended: pbs.filter((pb: any) => (pb.panelBeaterStatus ?? (pb.approved ? 'approved' : 'pending')) === 'suspended').length,
    rejected: pbs.filter((pb: any) => (pb.panelBeaterStatus ?? (pb.approved ? 'approved' : 'pending')) === 'rejected').length,
  };

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#F7F8F6', minHeight: '100vh', padding: '24px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111', margin: 0 }}>Panel Beater Management</h1>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>Full lifecycle management with audit history</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 4, width: 'fit-content' }}>
        {(['all','pending','approved','suspended','rejected'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: activeTab === tab ? '#111' : 'none', color: activeTab === tab ? '#fff' : '#6b7280', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)} ({counts[tab]})
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No panel beaters in this category</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Business Name','City','Email','Performance','Status','Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((pb: any) => {
                const pbStatus: PBStatus = pb.panelBeaterStatus ?? (pb.approved ? 'approved' : 'pending');
                const cfg = STATUS_CONFIG[pbStatus];
                return (
                  <tr key={pb.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                    <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#111' }}>{pb.businessName}</td>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: '#6b7280' }}>{pb.city ?? '—'}</td>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: '#6b7280' }}>{pb.email ?? '—'}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: pb.performanceTier === 'A' ? '#f0fdf4' : pb.performanceTier === 'D' ? '#fef2f2' : '#f9fafb', color: pb.performanceTier === 'A' ? '#16a34a' : pb.performanceTier === 'D' ? '#dc2626' : '#374151' }}>
                        Tier {pb.performanceTier ?? 'B'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: cfg.bg, color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {pbStatus !== 'approved' && (
                          <button onClick={() => updateStatus.mutate({ panelBeaterId: pb.id, status: 'approved' })} style={{ fontSize: 11, padding: '3px 8px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 4, cursor: 'pointer' }}>Approve</button>
                        )}
                        {pbStatus !== 'suspended' && pbStatus !== 'rejected' && (
                          <button onClick={() => setReasonModal({ id: pb.id, action: 'suspended' })} style={{ fontSize: 11, padding: '3px 8px', background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa', borderRadius: 4, cursor: 'pointer' }}>Suspend</button>
                        )}
                        {pbStatus !== 'rejected' && (
                          <button onClick={() => setReasonModal({ id: pb.id, action: 'rejected' })} style={{ fontSize: 11, padding: '3px 8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer' }}>Reject</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Reason modal */}
      {reasonModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 400 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111', marginBottom: 12 }}>
              {reasonModal.action === 'suspended' ? 'Suspend' : 'Reject'} Panel Beater
            </h3>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>Provide a reason (optional — recorded in audit log):</p>
            <textarea value={reason} onChange={e => setReason(e.target.value)} style={{ width: '100%', height: 80, border: '1px solid #e5e7eb', borderRadius: 6, padding: 8, fontSize: 13, resize: 'none' }} placeholder="Reason for action…" />
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => { setReasonModal(null); setReason(''); }} style={{ padding: '8px 16px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => updateStatus.mutate({ panelBeaterId: reasonModal.id, status: reasonModal.action, reason })} style={{ padding: '8px 16px', border: 'none', borderRadius: 6, background: reasonModal.action === 'suspended' ? '#ea580c' : '#dc2626', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
                {updateStatus.isPending ? 'Processing…' : `Confirm ${reasonModal.action}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
