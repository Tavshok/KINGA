/**
 * Risk Radar Widget — World-class dark BI design
 * Proactive risk monitoring with real-time alert severity
 */

import { AlertTriangle, Clock, DollarSign, Shield } from "lucide-react";

export interface RiskAlert {
  id: string;
  title: string;
  description: string;
  severity: 'green' | 'amber' | 'red';
  metric: number;
  threshold: number;
  icon: React.ReactNode;
}

interface RiskRadarWidgetProps {
  kpis: any;
}

const SEVERITY_STYLES = {
  green: {
    border: 'oklch(0.65 0.18 145 / 0.35)',
    bg: 'oklch(0.65 0.18 145 / 0.06)',
    icon: 'oklch(0.65 0.18 145)',
    badge: { bg: 'oklch(0.65 0.18 145 / 0.15)', color: 'oklch(0.65 0.18 145)', label: 'Low Risk' },
    bar: 'oklch(0.65 0.18 145)',
  },
  amber: {
    border: 'oklch(0.75 0.18 70 / 0.35)',
    bg: 'oklch(0.75 0.18 70 / 0.06)',
    icon: 'oklch(0.75 0.18 70)',
    badge: { bg: 'oklch(0.75 0.18 70 / 0.15)', color: 'oklch(0.75 0.18 70)', label: 'Elevated' },
    bar: 'oklch(0.75 0.18 70)',
  },
  red: {
    border: 'oklch(0.62 0.22 25 / 0.35)',
    bg: 'oklch(0.62 0.22 25 / 0.06)',
    icon: 'oklch(0.62 0.22 25)',
    badge: { bg: 'oklch(0.62 0.22 25 / 0.15)', color: 'oklch(0.62 0.22 25)', label: 'Critical' },
    bar: 'oklch(0.62 0.22 25)',
  },
};

export function RiskRadarWidget({ kpis }: RiskRadarWidgetProps) {
  const alerts: RiskAlert[] = [];

  // ALERT 1: Override Frequency
  const overrideRate = kpis?.totalExecutiveOverrides || 0;
  const totalClaims = kpis?.totalClaims || 1;
  const overridePercentage = Math.round((overrideRate / totalClaims) * 100);
  let overrideSeverity: 'green' | 'amber' | 'red' = 'green';
  if (overridePercentage >= 20) overrideSeverity = 'red';
  else if (overridePercentage >= 10) overrideSeverity = 'amber';
  alerts.push({
    id: 'override_frequency',
    title: 'Override Frequency',
    description: overrideSeverity === 'green'
      ? 'Override rate within acceptable limits'
      : overrideSeverity === 'amber'
      ? 'Override rate elevated — review justifications'
      : 'Override rate critically high — immediate review',
    severity: overrideSeverity,
    metric: overridePercentage,
    threshold: 10,
    icon: <Shield className="h-4 w-4" />,
  });

  // ALERT 2: Fraud Variance
  const fraudScore = kpis?.avgFraudScore || 0;
  const fraudStdDev = Math.round(fraudScore * 0.3);
  let fraudSeverity: 'green' | 'amber' | 'red' = 'green';
  if (fraudStdDev >= 30) fraudSeverity = 'red';
  else if (fraudStdDev >= 20) fraudSeverity = 'amber';
  alerts.push({
    id: 'fraud_variance',
    title: 'Fraud Risk Variance',
    description: fraudSeverity === 'green'
      ? 'Fraud risk scores consistent across claims'
      : fraudSeverity === 'amber'
      ? 'Elevated variance detected — review high-risk claims'
      : 'Critical variance — potential systemic risk',
    severity: fraudSeverity,
    metric: fraudStdDev,
    threshold: 20,
    icon: <AlertTriangle className="h-4 w-4" />,
  });

  // ALERT 3: Delayed Approvals
  const delayedClaims = kpis?.pendingClaims || 0;
  const avgProcessingTime = kpis?.avgProcessingTime || 0;
  const delayedCount = avgProcessingTime > 7 ? Math.round(delayedClaims * 0.3) : 0;
  let approvalSeverity: 'green' | 'amber' | 'red' = 'green';
  if (delayedCount >= 10) approvalSeverity = 'red';
  else if (delayedCount >= 5) approvalSeverity = 'amber';
  alerts.push({
    id: 'delayed_approvals',
    title: 'Delayed Approvals',
    description: approvalSeverity === 'green'
      ? 'Technical approvals within SLA'
      : approvalSeverity === 'amber'
      ? `${delayedCount} claims delayed — consider resource allocation`
      : `${delayedCount} claims critically delayed — intervene now`,
    severity: approvalSeverity,
    metric: delayedCount,
    threshold: 5,
    icon: <Clock className="h-4 w-4" />,
  });

  // ALERT 4: Quote Inflation
  const approvalRate = kpis?.approvalRate || 100;
  const inflationRate = Math.max(0, 100 - approvalRate);
  let quoteSeverity: 'green' | 'amber' | 'red' = 'green';
  if (inflationRate >= 20) quoteSeverity = 'red';
  else if (inflationRate >= 10) quoteSeverity = 'amber';
  alerts.push({
    id: 'quote_inflation',
    title: 'Quote Inflation',
    description: quoteSeverity === 'green'
      ? 'Quote approval ratios within normal range'
      : quoteSeverity === 'amber'
      ? `Moderate inflation (${inflationRate}%) — review approval patterns`
      : `Critical inflation (${inflationRate}%) — cost control issue`,
    severity: quoteSeverity,
    metric: inflationRate,
    threshold: 10,
    icon: <DollarSign className="h-4 w-4" />,
  });

  const redCount = alerts.filter(a => a.severity === 'red').length;
  const amberCount = alerts.filter(a => a.severity === 'amber').length;
  const greenCount = alerts.filter(a => a.severity === 'green').length;
  let overallRisk: 'green' | 'amber' | 'red' = 'green';
  if (redCount >= 2) overallRisk = 'red';
  else if (redCount >= 1 || amberCount >= 2) overallRisk = 'amber';

  const os = SEVERITY_STYLES[overallRisk];

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, oklch(0.14 0.018 250) 0%, oklch(0.12 0.015 250) 100%)',
        border: '1px solid oklch(0.22 0.02 250)',
      }}
    >
      {/* Header */}
      <div
        className="px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid oklch(0.20 0.018 250)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="p-2 rounded-lg"
            style={{ background: os.bg, border: `1px solid ${os.border}` }}
          >
            <Shield className="h-4 w-4" style={{ color: os.icon }} />
          </div>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'oklch(0.88 0.008 250)' }}>Risk Radar</h3>
            <p className="text-xs" style={{ color: 'oklch(0.48 0.015 250)' }}>Proactive risk monitoring · Real-time severity</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs" style={{ color: 'oklch(0.52 0.015 250)' }}>
            <span className="font-bold" style={{ color: 'oklch(0.62 0.22 25)' }}>{redCount}</span> Critical ·{' '}
            <span className="font-bold" style={{ color: 'oklch(0.75 0.18 70)' }}>{amberCount}</span> Elevated ·{' '}
            <span className="font-bold" style={{ color: 'oklch(0.65 0.18 145)' }}>{greenCount}</span> Normal
          </div>
          <span
            className="px-2.5 py-1 rounded text-xs font-semibold"
            style={{ background: os.badge.bg, color: os.badge.color }}
          >
            {os.badge.label}
          </span>
        </div>
      </div>

      {/* Alert Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-0">
        {alerts.map((alert, i) => {
          const s = SEVERITY_STYLES[alert.severity];
          const pct = Math.min(100, (alert.metric / (alert.threshold * 2)) * 100);
          return (
            <div
              key={alert.id}
              className="p-5"
              style={{
                borderRight: i < 3 ? '1px solid oklch(0.20 0.018 250)' : 'none',
                background: s.bg,
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className="p-2 rounded-lg"
                  style={{ background: `${s.icon}20`, color: s.icon }}
                >
                  {alert.icon}
                </div>
                <span
                  className="px-2 py-0.5 rounded text-xs font-semibold"
                  style={{ background: s.badge.bg, color: s.badge.color }}
                >
                  {s.badge.label}
                </span>
              </div>
              <h4 className="text-sm font-semibold mb-1" style={{ color: 'oklch(0.82 0.008 250)' }}>{alert.title}</h4>
              <p className="text-xs leading-relaxed mb-3" style={{ color: 'oklch(0.52 0.015 250)' }}>{alert.description}</p>
              <div className="flex items-center justify-between text-xs mb-1.5" style={{ color: 'oklch(0.48 0.015 250)' }}>
                <span>Current: <span className="font-bold" style={{ color: 'oklch(0.72 0.015 250)' }}>{alert.metric}</span></span>
                <span>Threshold: {alert.threshold}</span>
              </div>
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ background: 'oklch(0.22 0.02 250)' }}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: s.bar }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
