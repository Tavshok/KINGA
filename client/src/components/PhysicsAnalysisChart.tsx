import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, TrendingUp, Zap } from "lucide-react";

interface PhysicsData {
  impactSpeed?: number; // km/h
  impactForce?: number; // kN
  energyDissipated?: number; // kJ
  deceleration?: number; // g-force
  damageConsistency: 'consistent' | 'questionable' | 'impossible';
  physicsScore: number; // 0-100
}

interface PhysicsAnalysisChartProps {
  data: PhysicsData;
}

export function PhysicsAnalysisChart({ data }: PhysicsAnalysisChartProps) {
  const getConsistencyColor = (consistency: string) => {
    switch (consistency) {
      case 'consistent': return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border-green-300 dark:border-green-700';
      case 'questionable': return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700';
      case 'impossible': return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700';
      default: return 'bg-gray-100 dark:bg-muted text-gray-800 dark:text-foreground border-gray-300 dark:border-border';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#10b981'; // green-500
    if (score >= 60) return '#f59e0b'; // amber-500
    return '#ef4444'; // red-500
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <Activity className="w-5 h-5 text-purple-600" />
          </div>
          <h2 className="text-xl font-semibold">Physics Analysis</h2>
        </div>
        <Badge className={getConsistencyColor(data.damageConsistency)}>
          {data.damageConsistency}
        </Badge>
      </div>

      {/* Physics Score Gauge */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-foreground/80">Physics Validation Score</span>
          <span className="text-2xl font-bold" style={{ color: getScoreColor(data.physicsScore) }}>
            {data.physicsScore}/100
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div 
            className="h-3 rounded-full transition-all duration-500"
            style={{ 
              width: `${data.physicsScore}%`,
              backgroundColor: getScoreColor(data.physicsScore)
            }}
          ></div>
        </div>
        <p className="text-xs text-gray-700 dark:text-gray-400 dark:text-muted-foreground mt-1">
          Based on collision dynamics and damage pattern analysis
        </p>
      </div>

      {/* Impact Metrics */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {data.impactSpeed && (
          <div className="p-4 bg-primary/5 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium text-gray-600 dark:text-muted-foreground">Impact Speed</span>
            </div>
            <p className="text-2xl font-bold text-primary">{data.impactSpeed}</p>
            <p className="text-xs text-gray-700 dark:text-gray-400 dark:text-muted-foreground">km/h</p>
          </div>
        )}

        {data.impactForce && (
          <div className="p-4 bg-purple-50 dark:bg-purple-950/30 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-medium text-gray-600 dark:text-muted-foreground">Impact Force</span>
            </div>
            <p className="text-2xl font-bold text-purple-600">{data.impactForce}</p>
            <p className="text-xs text-gray-700 dark:text-gray-400 dark:text-muted-foreground">kN</p>
          </div>
        )}

        {data.energyDissipated && (
          <div className="p-4 bg-orange-50 dark:bg-orange-950/30 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-orange-600" />
              <span className="text-xs font-medium text-gray-600 dark:text-muted-foreground">Energy Dissipated</span>
            </div>
            <p className="text-2xl font-bold text-orange-600">{data.energyDissipated}</p>
            <p className="text-xs text-gray-700 dark:text-gray-400 dark:text-muted-foreground">kJ</p>
          </div>
        )}

        {data.deceleration && (
          <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-red-600" />
              <span className="text-xs font-medium text-gray-600 dark:text-muted-foreground">Deceleration</span>
            </div>
            <p className="text-2xl font-bold text-red-600">{data.deceleration}</p>
            <p className="text-xs text-gray-700 dark:text-gray-400 dark:text-muted-foreground">g-force</p>
          </div>
        )}
      </div>

      {/* Force Vector Visualization */}
      <div className="bg-gray-50 dark:bg-muted/50 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-foreground/80 mb-3">Impact Force Vectors</h3>
        <svg viewBox="0 0 300 200" className="w-full">
          {/* Vehicle representation */}
          <rect x="100" y="75" width="100" height="50" rx="5" 
                fill="#e5e7eb" stroke="#6b7280" strokeWidth="2"/>
          
          {/* Impact point */}
          <circle cx="100" cy="100" r="5" fill="#ef4444"/>
          
          {/* Force vector arrow */}
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="10" 
                    refX="9" refY="3" orient="auto">
              <polygon points="0 0, 10 3, 0 6" fill="#dc2626" />
            </marker>
          </defs>
          
          {/* Main impact vector */}
          <line x1="20" y1="100" x2="95" y2="100" 
                stroke="#dc2626" strokeWidth="3" markerEnd="url(#arrowhead)"/>
          <text x="50" y="90" fontSize="10" fill="#dc2626" fontWeight="600">
            Impact Force
          </text>
          
          {/* Deformation vector */}
          <line x1="150" y1="100" x2="230" y2="100" 
                stroke="#f59e0b" strokeWidth="2" markerEnd="url(#arrowhead)"/>
          <text x="170" y="90" fontSize="10" fill="#f59e0b" fontWeight="600">
            Deformation
          </text>
          
          {/* Energy dissipation indicators */}
          <circle cx="150" cy="100" r="30" fill="none" 
                  stroke="#10b981" strokeWidth="2" strokeDasharray="5,5" opacity="0.5"/>
          <circle cx="150" cy="100" r="45" fill="none" 
                  stroke="#10b981" strokeWidth="1" strokeDasharray="5,5" opacity="0.3"/>
          <text x="150" y="160" fontSize="10" fill="#10b981" 
                textAnchor="middle" fontWeight="600">
            Energy Dissipation Zone
          </text>
        </svg>
      </div>

      {/* Analysis Summary */}
      <div className="mt-4 p-3 bg-primary/5 rounded-lg">
        <p className="text-sm text-gray-700 dark:text-foreground/80">
          {data.damageConsistency === 'consistent' && (
            <span>✅ Damage pattern is <strong>consistent</strong> with reported collision physics. All measurements fall within expected ranges for this type of impact.</span>
          )}
          {data.damageConsistency === 'questionable' && (
            <span>⚠️ Some aspects of the damage pattern are <strong>questionable</strong>. Further investigation recommended to verify collision circumstances.</span>
          )}
          {data.damageConsistency === 'impossible' && (
            <span>🚨 Damage pattern is <strong>physically impossible</strong> given the reported collision parameters. High fraud risk detected.</span>
          )}
        </p>
      </div>
    </Card>
  );
}
