/**
 * GovernanceExceptionsRegister — Executive Dashboard component
 * Displays a paginated list of governance exceptions (overrides, segregation violations).
 * Uses governance.getExceptionsRegister procedure.
 */

import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { AlertTriangle, ShieldAlert, ChevronLeft, ChevronRight } from "lucide-react";

const TYPE_CONFIG = {
  override: { label: 'Executive Override', icon: ShieldAlert, color: '#F59E0B', bg: '#FFFBEB' },
  segregation: { label: 'Segregation Violation', icon: AlertTriangle, color: '#EF4444', bg: '#FEF2F2' },
  escalation: { label: 'Escalation', icon: AlertTriangle, color: '#7C3AED', bg: '#FDF2F8' },
};

const PAGE_SIZE = 10;

function formatDate(val: string | null | undefined): string {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleDateString('en-ZW', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return String(val);
  }
}

export function GovernanceExceptionsRegister() {
  const [page, setPage] = useState(0);
  const [typeFilter, setTypeFilter] = useState<'all' | 'override' | 'segregation' | 'escalation'>('all');

  const { data, isLoading, isError } = trpc.governance.getExceptionsRegister.useQuery(
    { limit: PAGE_SIZE, offset: page * PAGE_SIZE, type: typeFilter },
    { retry: 0 }
  );

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
        {(['all', 'override', 'segregation'] as const).map(t => (
          <button
            key={t}
            onClick={() => { setTypeFilter(t); setPage(0); }}
            style={{
              padding: '5px 12px',
              fontSize: '11px',
              fontWeight: typeFilter === t ? 600 : 400,
              background: typeFilter === t ? '#1C5C39' : '#F3F4F6',
              color: typeFilter === t ? '#FFFFFF' : '#6B7280',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              textTransform: 'capitalize',
            }}
          >
            {t === 'all' ? 'All Exceptions' : t === 'override' ? 'Overrides' : 'Segregation'}
          </button>
        ))}
        {data && (
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#6B7280', alignSelf: 'center' }}>
            {data.total} exception{data.total !== 1 ? 's' : ''} found
          </span>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ padding: '24px', textAlign: 'center', color: '#6B7280', fontSize: '13px' }}>Loading exceptions…</div>
      ) : isError || !data ? (
        <div style={{ padding: '24px', color: '#EF4444', fontSize: '13px' }}>Unable to load exceptions register.</div>
      ) : data.exceptions.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: '#6B7280', fontSize: '13px' }}>
          No exceptions recorded in this category.
        </div>
      ) : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
            <thead>
              <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E7E2D6' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#6B7280', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Type</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#6B7280', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Claim ID</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#6B7280', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Description</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#6B7280', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Reason</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#6B7280', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {data.exceptions.map((exc: any, idx: number) => {
                const cfg = TYPE_CONFIG[exc.type as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG.override;
                const Icon = cfg.icon;
                return (
                  <tr key={exc.id ?? idx} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: cfg.bg, color: cfg.color, padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>
                        <Icon style={{ width: '11px', height: '11px' }} />
                        {cfg.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                      {exc.claimId ?? '—'}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#374151', maxWidth: '280px' }}>
                      {exc.description ?? '—'}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#6B7280', maxWidth: '180px', fontStyle: exc.reason ? 'normal' : 'italic' }}>
                      {exc.reason ?? 'No reason recorded'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#6B7280', whiteSpace: 'nowrap' }}>
                      {formatDate(exc.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                style={{ padding: '4px 8px', background: 'none', border: '1px solid #E7E2D6', borderRadius: '4px', cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.4 : 1 }}
              >
                <ChevronLeft style={{ width: '14px', height: '14px' }} />
              </button>
              <span style={{ fontSize: '12px', color: '#6B7280' }}>Page {page + 1} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                style={{ padding: '4px 8px', background: 'none', border: '1px solid #E7E2D6', borderRadius: '4px', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', opacity: page >= totalPages - 1 ? 0.4 : 1 }}
              >
                <ChevronRight style={{ width: '14px', height: '14px' }} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
