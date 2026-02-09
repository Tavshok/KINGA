import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, AlertTriangle } from "lucide-react";

interface FraudIndicators {
  claimHistory: number; // 0-10
  damageConsistency: number; // 0-10
  documentAuthenticity: number; // 0-10
  behavioralPatterns: number; // 0-10
  ownershipVerification: number; // 0-10
  geographicRisk: number; // 0-10
}

interface FraudRiskRadarChartProps {
  indicators: FraudIndicators;
  overallRisk: 'low' | 'medium' | 'high';
  riskScore: number; // 0-100
  flaggedIssues: string[];
}

export function FraudRiskRadarChart({ indicators, overallRisk, riskScore, flaggedIssues }: FraudRiskRadarChartProps) {
  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300', fill: '#10b981' };
      case 'medium': return { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300', fill: '#f59e0b' };
      case 'high': return { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300', fill: '#ef4444' };
      default: return { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300', fill: '#6b7280' };
    }
  };

  const colors = getRiskColor(overallRisk);

  // Calculate radar chart points
  const centerX = 150;
  const centerY = 150;
  const maxRadius = 100;
  
  const angleStep = (2 * Math.PI) / 6; // 6 indicators
  const indicatorsArray = [
    { label: 'Claim History', value: indicators.claimHistory, angle: 0 },
    { label: 'Damage Match', value: indicators.damageConsistency, angle: angleStep },
    { label: 'Documents', value: indicators.documentAuthenticity, angle: angleStep * 2 },
    { label: 'Behavior', value: indicators.behavioralPatterns, angle: angleStep * 3 },
    { label: 'Ownership', value: indicators.ownershipVerification, angle: angleStep * 4 },
    { label: 'Geography', value: indicators.geographicRisk, angle: angleStep * 5 },
  ];

  // Calculate points for the data polygon
  const dataPoints = indicatorsArray.map(ind => {
    const radius = (ind.value / 10) * maxRadius;
    const x = centerX + radius * Math.cos(ind.angle - Math.PI / 2);
    const y = centerY + radius * Math.sin(ind.angle - Math.PI / 2);
    return { x, y, ...ind };
  });

  const dataPolygonPoints = dataPoints.map(p => `${p.x},${p.y}`).join(' ');

  // Calculate reference circle points (for 10/10 scale)
  const referencePoints = indicatorsArray.map(ind => {
    const x = centerX + maxRadius * Math.cos(ind.angle - Math.PI / 2);
    const y = centerY + maxRadius * Math.sin(ind.angle - Math.PI / 2);
    return { x, y };
  });

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`p-2 ${colors.bg} rounded-lg`}>
            <Shield className={`w-5 h-5 ${colors.text}`} />
          </div>
          <h2 className="text-xl font-semibold">Fraud Risk Assessment</h2>
        </div>
        <Badge className={`${colors.bg} ${colors.text} ${colors.border}`}>
          {overallRisk.toUpperCase()} RISK
        </Badge>
      </div>

      {/* Risk Score */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">Overall Fraud Risk Score</span>
          <span className="text-2xl font-bold" style={{ color: colors.fill }}>
            {riskScore}/100
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div 
            className="h-3 rounded-full transition-all duration-500"
            style={{ 
              width: `${riskScore}%`,
              backgroundColor: colors.fill
            }}
          ></div>
        </div>
      </div>

      {/* Radar Chart */}
      <div className="bg-gray-50 rounded-lg p-4 mb-4">
        <svg viewBox="0 0 300 300" className="w-full">
          {/* Background circles (scale rings) */}
          {[0.2, 0.4, 0.6, 0.8, 1.0].map((scale, i) => (
            <circle
              key={i}
              cx={centerX}
              cy={centerY}
              r={maxRadius * scale}
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="1"
            />
          ))}

          {/* Axis lines */}
          {referencePoints.map((point, i) => (
            <line
              key={i}
              x1={centerX}
              y1={centerY}
              x2={point.x}
              y2={point.y}
              stroke="#d1d5db"
              strokeWidth="1"
            />
          ))}

          {/* Reference polygon (max values) */}
          <polygon
            points={referencePoints.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#9ca3af"
            strokeWidth="1"
            strokeDasharray="5,5"
          />

          {/* Data polygon */}
          <polygon
            points={dataPolygonPoints}
            fill={colors.fill}
            fillOpacity="0.3"
            stroke={colors.fill}
            strokeWidth="2"
          />

          {/* Data points */}
          {dataPoints.map((point, i) => (
            <circle
              key={i}
              cx={point.x}
              cy={point.y}
              r="4"
              fill={colors.fill}
              stroke="white"
              strokeWidth="2"
            />
          ))}

          {/* Labels */}
          {dataPoints.map((point, i) => {
            const labelRadius = maxRadius + 25;
            const labelX = centerX + labelRadius * Math.cos(point.angle - Math.PI / 2);
            const labelY = centerY + labelRadius * Math.sin(point.angle - Math.PI / 2);
            
            return (
              <g key={i}>
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="600"
                  fill="#374151"
                >
                  {point.label}
                </text>
                <text
                  x={labelX}
                  y={labelY + 12}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#6b7280"
                >
                  {point.value}/10
                </text>
              </g>
            );
          })}

          {/* Center point */}
          <circle cx={centerX} cy={centerY} r="3" fill="#374151" />
        </svg>
      </div>

      {/* Indicator Breakdown */}
      <div className="space-y-2 mb-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Risk Indicators:</h3>
        {indicatorsArray.map((ind, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-gray-600">{ind.label}</span>
            <div className="flex items-center gap-2">
              <div className="w-24 bg-gray-200 rounded-full h-2">
                <div 
                  className="h-2 rounded-full"
                  style={{ 
                    width: `${(ind.value / 10) * 100}%`,
                    backgroundColor: ind.value >= 7 ? '#ef4444' : ind.value >= 4 ? '#f59e0b' : '#10b981'
                  }}
                ></div>
              </div>
              <span className="font-semibold w-8 text-right">{ind.value}/10</span>
            </div>
          </div>
        ))}
      </div>

      {/* Flagged Issues */}
      {flaggedIssues.length > 0 && (
        <div className="p-4 bg-red-50 rounded-lg border border-red-200">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <h3 className="text-sm font-semibold text-red-800">Flagged Issues:</h3>
          </div>
          <ul className="space-y-1">
            {flaggedIssues.map((issue, i) => (
              <li key={i} className="text-sm text-red-700">
                • {issue}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Summary */}
      <div className={`mt-4 p-3 ${colors.bg} rounded-lg`}>
        <p className={`text-sm ${colors.text}`}>
          {overallRisk === 'low' && (
            <span>✅ <strong>Low risk</strong> - No significant fraud indicators detected. Claim appears legitimate based on all assessment criteria.</span>
          )}
          {overallRisk === 'medium' && (
            <span>⚠️ <strong>Medium risk</strong> - Some concerning patterns detected. Recommend additional verification before approval.</span>
          )}
          {overallRisk === 'high' && (
            <span>🚨 <strong>High risk</strong> - Multiple fraud indicators present. Thorough investigation required before proceeding.</span>
          )}
        </p>
      </div>
    </Card>
  );
}
