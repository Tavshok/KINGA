import { trpc } from "@/lib/trpc";
import { Users, Building2, Activity, Clock, TrendingUp, RefreshCw } from "lucide-react";
import { useState } from "react";

export default function TenantMonitoring() {
  const { data: tenants = [], isLoading } = trpc.tenant.list.useQuery();
  const { data: health } = trpc.admin.getPlatformHealth.useQuery();
  const { data: activeUsers } = trpc.platformOperations.getActiveUsers.useQuery();
  const tenantStats: any[] = (health as any)?.tenantStats ?? [];

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#F7F8F6', minHeight: '100vh', padding: '24px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111', margin: 0 }}>Tenant Monitoring</h1>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>Status and usage for every insurer, agency, fleet operator, and engineering company</p>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Tenants', value: isLoading ? '…' : (tenants as any[]).length },
          { label: 'Active Users', value: (activeUsers as any)?.activeCount ?? '…' },
          { label: 'Avg Confidence', value: `${Math.round(Number((health as any)?.assessStats?.avgConf ?? 0))}%` },
          { label: 'Assessments (24h)', value: Number((health as any)?.assessStats?.last24h ?? 0) },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px' }}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>{kpi.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#111' }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Tenant table */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Building2 style={{ width: 14, height: 14, color: '#6b7280' }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>All Tenants</span>
        </div>
        {isLoading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading tenant data…</div>
        ) : (tenants as any[]).length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No tenants registered yet</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Tenant ID','Name','Currency','Subscription Tier','SLA (hours)','AI Rerun Limit','Created'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(tenants as any[]).map((t: any) => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                  <td style={{ padding: '10px 16px', fontSize: 11, fontFamily: 'monospace', color: '#6b7280' }}>{t.id}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#111' }}>{t.name || t.displayName || t.id}</td>
                  <td style={{ padding: '10px 16px', fontSize: 12, color: '#374151' }}>{t.currency ?? 'USD'}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: t.subscriptionTier === 'enterprise' ? '#eff6ff' : t.subscriptionTier === 'professional' ? '#f0fdf4' : '#f9fafb', color: t.subscriptionTier === 'enterprise' ? '#1d4ed8' : t.subscriptionTier === 'professional' ? '#15803d' : '#374151', fontWeight: 500 }}>
                      {t.subscriptionTier ?? t.tier ?? 'standard'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 12, color: '#374151' }}>{t.intakeEscalationHours ?? 72}</td>
                  <td style={{ padding: '10px 16px', fontSize: 12, color: '#374151' }}>{t.aiRerunLimitPerHour ?? 5}/hr</td>
                  <td style={{ padding: '10px 16px', fontSize: 11, color: '#9ca3af' }}>{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
