/**
 * CrossClaimIntelligencePanel — Executive Dashboard component
 * Displays top entities (vehicles, drivers) appearing across cross-claim signals.
 * Uses crossClaim.getTopEntities procedure.
 */

import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Car, User, AlertTriangle, Activity } from "lucide-react";

type EntityType = 'all' | 'vehicle' | 'driver';

const ENTITY_TABS: { value: EntityType; label: string; icon: typeof Car }[] = [
  { value: 'all', label: 'All Entities', icon: Activity },
  { value: 'vehicle', label: 'Vehicles', icon: Car },
  { value: 'driver', label: 'Drivers', icon: User },
];

function ConfidenceBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span style={{ fontSize: '10px', fontWeight: 600, background: '#FEF2F2', color: '#EF4444', padding: '2px 6px', borderRadius: '10px' }}>
      {count} high
    </span>
  );
}

export function CrossClaimIntelligencePanel() {
  const [entityType, setEntityType] = useState<EntityType>('all');

  const { data, isLoading, isError } = trpc.crossClaim.getTopEntities.useQuery(
    { entityType, limit: 10 },
    { retry: 0 }
  );

  const entities = entityType === 'driver'
    ? (data?.drivers ?? [])
    : entityType === 'vehicle'
    ? (data?.vehicles ?? [])
    : [...(data?.vehicles ?? []), ...(data?.drivers ?? [])].sort((a, b) => b.signalCount - a.signalCount).slice(0, 10);

  return (
    <div>
      {/* Summary strip */}
      {data && (
        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '2px' }}>Total Signals</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#15201A', fontVariantNumeric: 'tabular-nums' }}>{data.summary.totalSignals.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '2px' }}>High Confidence</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#EF4444', fontVariantNumeric: 'tabular-nums' }}>{data.summary.highConfidence.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '2px' }}>Dismissed</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#6B7280', fontVariantNumeric: 'tabular-nums' }}>{data.summary.dismissed.toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* Entity type tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '14px' }}>
        {ENTITY_TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.value}
              onClick={() => setEntityType(tab.value)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 12px',
                fontSize: '11px',
                fontWeight: entityType === tab.value ? 600 : 400,
                background: entityType === tab.value ? '#1C5C39' : '#F3F4F6',
                color: entityType === tab.value ? '#FFFFFF' : '#6B7280',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <Icon style={{ width: '12px', height: '12px' }} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Entity table */}
      {isLoading ? (
        <div style={{ padding: '24px', textAlign: 'center', color: '#6B7280', fontSize: '13px' }}>Loading entities…</div>
      ) : isError ? (
        <div style={{ padding: '24px', color: '#EF4444', fontSize: '13px' }}>Unable to load cross-claim intelligence data.</div>
      ) : entities.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: '#6B7280', fontSize: '13px' }}>
          No cross-claim signals detected yet.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
          <thead>
            <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E7E2D6' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#6B7280', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Entity</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#6B7280', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Type</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#6B7280', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Signals</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#6B7280', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Claims</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#6B7280', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Risk</th>
            </tr>
          </thead>
          <tbody>
            {entities.map((entity, idx) => (
              <tr key={`${entity.type}-${entity.entityValue}-${idx}`} style={{ borderBottom: '1px solid #F3F4F6' }}>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ fontWeight: 600, color: '#15201A' }}>{entity.entityValue || '—'}</div>
                  {entity.make && (
                    <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '1px' }}>{entity.make} {entity.model ?? ''}</div>
                  )}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: entity.type === 'vehicle' ? '#EEF4FB' : '#F0F7F2',
                    color: entity.type === 'vehicle' ? '#4878A8' : '#3C7844',
                    padding: '2px 7px',
                    borderRadius: '10px',
                  }}>
                    {entity.type === 'vehicle' ? <Car style={{ width: '10px', height: '10px' }} /> : <User style={{ width: '10px', height: '10px' }} />}
                    {entity.type}
                  </span>
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#374151' }}>
                  {entity.signalCount}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#374151' }}>
                  {entity.claimCount}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                    <ConfidenceBadge count={entity.highConfCount} />
                    {entity.highConfCount > 0 && (
                      <AlertTriangle style={{ width: '13px', height: '13px', color: '#EF4444' }} />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
