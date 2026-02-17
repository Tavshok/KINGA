/**
 * Risk Radar Widget
 * 
 * Displays color-coded executive alerts for proactive risk management.
 * Calculates alert severity (Green/Amber/Red) based on current KPI data.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, Clock, DollarSign, Shield } from "lucide-react";

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
  kpis: any; // KPI data from analytics
}

export function RiskRadarWidget({ kpis }: RiskRadarWidgetProps) {
  // Calculate alerts based on KPI data
  const alerts: RiskAlert[] = [];

  // === ALERT 1: High Override Frequency ===
  const overrideRate = kpis?.totalExecutiveOverrides || 0;
  const totalClaims = kpis?.totalClaims || 1;
  const overridePercentage = Math.round((overrideRate / totalClaims) * 100);
  
  let overrideSeverity: 'green' | 'amber' | 'red' = 'green';
  if (overridePercentage >= 20) overrideSeverity = 'red';
  else if (overridePercentage >= 10) overrideSeverity = 'amber';

  alerts.push({
    id: 'override_frequency',
    title: 'Executive Override Frequency',
    description: overrideSeverity === 'green' 
      ? 'Override rate within acceptable limits'
      : overrideSeverity === 'amber'
      ? 'Override rate elevated - review override justifications'
      : 'Override rate critically high - immediate review required',
    severity: overrideSeverity,
    metric: overridePercentage,
    threshold: 10,
    icon: <Shield className="h-5 w-5" />
  });

  // === ALERT 2: Rising Fraud Variance ===
  const fraudScore = kpis?.avgFraudScore || 0;
  const fraudStdDev = Math.round(fraudScore * 0.3); // Estimate variance
  
  let fraudSeverity: 'green' | 'amber' | 'red' = 'green';
  if (fraudStdDev >= 30) fraudSeverity = 'red';
  else if (fraudStdDev >= 20) fraudSeverity = 'amber';

  alerts.push({
    id: 'fraud_variance',
    title: 'Fraud Risk Variance',
    description: fraudSeverity === 'green'
      ? 'Fraud risk scores consistent across claims'
      : fraudSeverity === 'amber'
      ? 'Elevated fraud score variance detected - review high-risk claims'
      : 'Critical fraud score variance - potential systemic risk',
    severity: fraudSeverity,
    metric: fraudStdDev,
    threshold: 20,
    icon: <AlertTriangle className="h-5 w-5" />
  });

  // === ALERT 3: Delayed Technical Approvals ===
  const delayedClaims = kpis?.pendingClaims || 0;
  const avgProcessingTime = kpis?.avgProcessingTime || 0;
  const delayedCount = avgProcessingTime > 7 ? Math.round(delayedClaims * 0.3) : 0;
  
  let approvalSeverity: 'green' | 'amber' | 'red' = 'green';
  if (delayedCount >= 10) approvalSeverity = 'red';
  else if (delayedCount >= 5) approvalSeverity = 'amber';

  alerts.push({
    id: 'delayed_approvals',
    title: 'Delayed Technical Approvals',
    description: approvalSeverity === 'green'
      ? 'Technical approvals processing within SLA'
      : approvalSeverity === 'amber'
      ? `${delayedCount} claims delayed in technical review - consider resource allocation`
      : `${delayedCount} claims critically delayed - immediate intervention required`,
    severity: approvalSeverity,
    metric: delayedCount,
    threshold: 5,
    icon: <Clock className="h-5 w-5" />
  });

  // === ALERT 4: Quote Inflation Anomaly ===
  const approvalRate = kpis?.approvalRate || 100;
  const inflationRate = Math.max(0, 100 - approvalRate);
  
  let quoteSeverity: 'green' | 'amber' | 'red' = 'green';
  if (inflationRate >= 20) quoteSeverity = 'red';
  else if (inflationRate >= 10) quoteSeverity = 'amber';

  alerts.push({
    id: 'quote_inflation',
    title: 'Quote Inflation Anomaly',
    description: quoteSeverity === 'green'
      ? 'Quote approval ratios within normal range'
      : quoteSeverity === 'amber'
      ? `Moderate quote inflation detected (${inflationRate}%) - review approval patterns`
      : `Critical quote inflation (${inflationRate}%) - potential cost control issue`,
    severity: quoteSeverity,
    metric: inflationRate,
    threshold: 10,
    icon: <DollarSign className="h-5 w-5" />
  });

  // Calculate overall risk
  const redCount = alerts.filter(a => a.severity === 'red').length;
  const amberCount = alerts.filter(a => a.severity === 'amber').length;
  const greenCount = alerts.filter(a => a.severity === 'green').length;
  
  let overallRisk: 'green' | 'amber' | 'red' = 'green';
  if (redCount >= 2) overallRisk = 'red';
  else if (redCount >= 1 || amberCount >= 2) overallRisk = 'amber';

  const getSeverityColor = (severity: 'green' | 'amber' | 'red') => {
    switch (severity) {
      case 'green': return 'bg-green-100 text-green-800 border-green-200';
      case 'amber': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'red': return 'bg-red-100 text-red-800 border-red-200';
    }
  };

  const getSeverityBadge = (severity: 'green' | 'amber' | 'red') => {
    switch (severity) {
      case 'green': return <Badge className="bg-green-500">Low Risk</Badge>;
      case 'amber': return <Badge className="bg-amber-500">Medium Risk</Badge>;
      case 'red': return <Badge className="bg-red-500">High Risk</Badge>;
    }
  };

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-6 w-6" />
              Risk Radar
            </CardTitle>
            <CardDescription>
              Proactive risk monitoring with real-time alert severity
            </CardDescription>
          </div>
          <div className="flex items-center gap-4">
            {getSeverityBadge(overallRisk)}
            <div className="text-sm text-slate-600">
              <span className="font-semibold text-red-600">{redCount}</span> Critical •{' '}
              <span className="font-semibold text-amber-600">{amberCount}</span> Elevated •{' '}
              <span className="font-semibold text-green-600">{greenCount}</span> Normal
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-4 rounded-lg border-2 ${getSeverityColor(alert.severity)}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {alert.icon}
                  <h3 className="font-semibold text-sm">{alert.title}</h3>
                </div>
                {getSeverityBadge(alert.severity)}
              </div>
              <p className="text-sm mb-3">{alert.description}</p>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">Current: {alert.metric}</span>
                <span className="text-slate-600">Threshold: {alert.threshold}</span>
              </div>
              {/* Progress bar */}
              <div className="mt-2 h-2 bg-white/50 rounded-full overflow-hidden">
                <div
                  className={`h-full ${
                    alert.severity === 'red' ? 'bg-red-500' :
                    alert.severity === 'amber' ? 'bg-amber-500' :
                    'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(100, (alert.metric / (alert.threshold * 2)) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
