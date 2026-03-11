import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Zap } from "lucide-react";
import { clamp, getConfidenceColor, formatConfidenceScore } from "@/lib/mathUtils";

/**
 * Physics Validation Data (from backend quantitative physics engine)
 */
interface PhysicsValidation {
  impactAngleDegrees: number; // 0-360°
  calculatedImpactForceKN: number; // kilonewtons
  impactLocationNormalized: {
    relativeX: number; // 0-1
    relativeY: number; // 0-1
  };
}

interface VehicleImpactVectorDiagramProps {
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  accidentType?: string;
  impactSpeed?: number; // km/h (legacy)
  impactForce?: number; // kN (legacy)
  impactPoint?: string; // front, rear, left_side, right_side, etc. (legacy)
  damagedComponents?: string[];
  damageConsistency?: 'consistent' | 'questionable' | 'impossible';
  
  // NEW: Quantitative physics data
  physicsValidation?: PhysicsValidation | null;
  
  // NEW: AI confidence score (0-1)
  confidenceScore?: number;
}

export function VehicleImpactVectorDiagram({
  vehicleMake,
  vehicleModel,
  vehicleYear,
  accidentType,
  impactSpeed,
  impactForce,
  impactPoint,
  damagedComponents = [],
  damageConsistency = 'consistent',
  physicsValidation,
  confidenceScore,
}: VehicleImpactVectorDiagramProps) {
  
  // SVG canvas dimensions
  const SVG_WIDTH = 300;
  const SVG_HEIGHT = 200;
  const VEHICLE_CENTER_X = 150;
  const VEHICLE_CENTER_Y = 100;
  
  /**
   * Calculate dynamic vector configuration from quantitative physics data
   */
  const getQuantitativeImpactConfig = () => {
    if (!physicsValidation) {
      return null; // Fall back to legacy
    }
    
    const { impactAngleDegrees, calculatedImpactForceKN, impactLocationNormalized } = physicsValidation;
    
    // 1. Convert angle to radians
    const radians = impactAngleDegrees * (Math.PI / 180);
    
    // 2. Calculate force-scaled vector length
    // Scale factor: 1 kN = 2 pixels, clamped between 20-120px
    const FORCE_SCALE_FACTOR = 2;
    const vectorLength = clamp(calculatedImpactForceKN * FORCE_SCALE_FACTOR, 20, 120);
    
    // 3. Calculate directional components (pointing TOWARD impact point)
    // Adjust angle by 180° so arrow points inward
    const adjustedRadians = radians + Math.PI;
    const dx = Math.cos(adjustedRadians) * vectorLength;
    const dy = Math.sin(adjustedRadians) * vectorLength;
    
    // 4. Convert normalized location to SVG coordinates
    const impactX = impactLocationNormalized.relativeX * SVG_WIDTH;
    const impactY = impactLocationNormalized.relativeY * SVG_HEIGHT;
    
    // 5. Calculate vector start and end points
    const vectorX1 = impactX - dx; // Start point (outside vehicle)
    const vectorY1 = impactY - dy;
    const vectorX2 = impactX; // End point (impact location)
    const vectorY2 = impactY;
    
    // 6. Determine label based on angle
    let label = 'Impact';
    if (impactAngleDegrees >= 337.5 || impactAngleDegrees < 22.5) label = 'Frontal Impact';
    else if (impactAngleDegrees >= 22.5 && impactAngleDegrees < 67.5) label = 'Front-Right Impact';
    else if (impactAngleDegrees >= 67.5 && impactAngleDegrees < 112.5) label = 'Right Side Impact';
    else if (impactAngleDegrees >= 112.5 && impactAngleDegrees < 157.5) label = 'Rear-Right Impact';
    else if (impactAngleDegrees >= 157.5 && impactAngleDegrees < 202.5) label = 'Rear Impact';
    else if (impactAngleDegrees >= 202.5 && impactAngleDegrees < 247.5) label = 'Rear-Left Impact';
    else if (impactAngleDegrees >= 247.5 && impactAngleDegrees < 292.5) label = 'Left Side Impact';
    else label = 'Front-Left Impact';
    
    // 7. Determine crumple zone
    let crumpleZone: 'front' | 'rear' | 'side' = 'front';
    if (impactAngleDegrees >= 135 && impactAngleDegrees < 225) crumpleZone = 'rear';
    else if ((impactAngleDegrees >= 45 && impactAngleDegrees < 135) || (impactAngleDegrees >= 225 && impactAngleDegrees < 315)) crumpleZone = 'side';
    
    return {
      direction: `${impactAngleDegrees}°`,
      vectorX1,
      vectorY1,
      vectorX2,
      vectorY2,
      impactX,
      impactY,
      label,
      crumpleZone,
      isQuantitative: true,
    };
  };
  
  /**
   * Legacy static impact configuration (fallback for historical claims)
   */
  const getLegacyImpactConfig = () => {
    const point = impactPoint?.toLowerCase() || '';
    const type = accidentType?.toLowerCase() || '';
    
    // Map impact point to vector direction (hardcoded coordinates)
    if (point.includes('front') || type.includes('frontal') || type.includes('head_on')) {
      return {
        direction: 'front',
        vectorX1: 20,
        vectorY1: 100,
        vectorX2: 95,
        vectorY2: 100,
        impactX: 100,
        impactY: 100,
        label: 'Frontal Impact',
        crumpleZone: 'front' as const,
        isQuantitative: false,
      };
    } else if (point.includes('rear') || type.includes('rear_end')) {
      return {
        direction: 'rear',
        vectorX1: 280,
        vectorY1: 100,
        vectorX2: 205,
        vectorY2: 100,
        impactX: 200,
        impactY: 100,
        label: 'Rear Impact',
        crumpleZone: 'rear' as const,
        isQuantitative: false,
      };
    } else if (point.includes('left') || type.includes('side_impact') || type.includes('t_bone')) {
      return {
        direction: 'left_side',
        vectorX1: 150,
        vectorY1: 20,
        vectorX2: 150,
        vectorY2: 70,
        impactX: 150,
        impactY: 75,
        label: 'Left Side Impact',
        crumpleZone: 'side' as const,
        isQuantitative: false,
      };
    } else if (point.includes('right')) {
      return {
        direction: 'right_side',
        vectorX1: 150,
        vectorY1: 180,
        vectorX2: 150,
        vectorY2: 130,
        impactX: 150,
        impactY: 125,
        label: 'Right Side Impact',
        crumpleZone: 'side' as const,
        isQuantitative: false,
      };
    } else {
      // Default to front impact
      return {
        direction: 'front',
        vectorX1: 20,
        vectorY1: 100,
        vectorX2: 95,
        vectorY2: 100,
        impactX: 100,
        impactY: 100,
        label: 'Impact',
        crumpleZone: 'front' as const,
        isQuantitative: false,
      };
    }
  };

  // Use quantitative calculation if available, otherwise fall back to legacy
  const config = getQuantitativeImpactConfig() || getLegacyImpactConfig();
  
  // Calculate vector thickness based on impact force
  // Quantitative: force-scaled, Legacy: generic scaling
  const vectorThickness = physicsValidation
    ? clamp(physicsValidation.calculatedImpactForceKN / 15, 2, 8)
    : impactForce
    ? clamp(impactForce / 10, 2, 6)
    : 3;
  
  // Use quantitative force if available, otherwise fall back to legacy
  const displayForce = physicsValidation?.calculatedImpactForceKN ?? impactForce;
  const displaySpeed = impactSpeed;
  const displayAngle = physicsValidation?.impactAngleDegrees;
  
  // Get damage zones from components
  const getDamageZones = () => {
    const zones = new Set<string>();
    damagedComponents.forEach(comp => {
      const c = comp.toLowerCase();
      if (c.includes('bumper') || c.includes('grille') || c.includes('hood') || c.includes('bonnet')) zones.add('front');
      if (c.includes('rear') || c.includes('trunk') || c.includes('boot') || c.includes('tail')) zones.add('rear');
      if (c.includes('door') || c.includes('fender') || c.includes('quarter')) zones.add('side');
      if (c.includes('roof') || c.includes('pillar')) zones.add('top');
    });
    return Array.from(zones);
  };

  const damageZones = getDamageZones();
  
  const getConsistencyColor = (consistency: string) => {
    switch (consistency) {
      case 'consistent': return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border-green-300 dark:border-green-700';
      case 'questionable': return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700';
      case 'impossible': return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700';
      default: return 'bg-gray-100 dark:bg-muted text-gray-800 dark:text-foreground border-gray-300 dark:border-border';
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <Zap className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Impact Force Vectors</h2>
            {vehicleMake && vehicleModel && (
              <p className="text-sm text-gray-600 dark:text-muted-foreground">
                {vehicleMake} {vehicleModel} {vehicleYear || ''}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={getConsistencyColor(damageConsistency)}>
            {damageConsistency}
          </Badge>
          {config.isQuantitative ? (
            <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-200">
              Quantitative Physics
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs bg-yellow-50 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-200">
              Qualitative Mode
            </Badge>
          )}
          {confidenceScore !== undefined && (
            <Badge 
              variant="outline" 
              className={`text-xs ${getConfidenceColor(confidenceScore).bg} ${getConfidenceColor(confidenceScore).text} ${getConfidenceColor(confidenceScore).border}`}
              title={`${getConfidenceColor(confidenceScore).label}: AI assessment reliability`}
            >
              {formatConfidenceScore(confidenceScore)} Confidence
            </Badge>
          )}
        </div>
      </div>

      {/* Impact Metrics Summary */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {displaySpeed && (
          <div className="p-3 bg-primary/5 rounded-lg">
            <p className="text-xs text-gray-600 dark:text-muted-foreground mb-1">Impact Speed</p>
            <p className="text-xl font-bold text-primary">{displaySpeed} km/h</p>
          </div>
        )}
        {displayForce && (
          <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg">
            <p className="text-xs text-gray-600 dark:text-muted-foreground mb-1">Impact Force</p>
            <p className="text-xl font-bold text-purple-600">{displayForce.toFixed(1)} kN</p>
            <p className="text-xs text-gray-500 dark:text-muted-foreground mt-1">
              ≈ {(displayForce * 0.102).toFixed(1)} tons
            </p>
          </div>
        )}
        {displayAngle !== undefined && (
          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
            <p className="text-xs text-gray-600 dark:text-muted-foreground mb-1">Impact Angle</p>
            <p className="text-xl font-bold text-blue-600">{displayAngle}°</p>
          </div>
        )}
      </div>

      {/* Vehicle-Specific Force Vector Diagram */}
      <div className="bg-gray-50 dark:bg-muted/50 rounded-lg p-4">
        <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} className="w-full">
          <defs>
            {/* Confidence-based arrowheads */}
            <marker id="arrowhead-green" markerWidth="10" markerHeight="10" 
                    refX="9" refY="3" orient="auto">
              <polygon points="0 0, 10 3, 0 6" fill="#15803d" />
            </marker>
            <marker id="arrowhead-amber" markerWidth="10" markerHeight="10" 
                    refX="9" refY="3" orient="auto">
              <polygon points="0 0, 10 3, 0 6" fill="#b45309" />
            </marker>
            <marker id="arrowhead-red" markerWidth="10" markerHeight="10" 
                    refX="9" refY="3" orient="auto">
              <polygon points="0 0, 10 3, 0 6" fill="#b91c1c" />
            </marker>
            <marker id="arrowhead-orange" markerWidth="8" markerHeight="8" 
                    refX="7" refY="2.5" orient="auto">
              <polygon points="0 0, 8 2.5, 0 5" fill="#f59e0b" />
            </marker>
            
            {/* Damage zone highlighting */}
            <pattern id="damage-pattern" patternUnits="userSpaceOnUse" width="4" height="4">
              <path d="M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2" 
                    style={{stroke: '#ef4444', strokeWidth: 0.5}} />
            </pattern>
          </defs>
          
          {/* Vehicle body (top-down view) */}
          <rect x="100" y="75" width="100" height="50" rx="5" 
                fill={damageZones.length > 0 ? "#fee2e2" : "#e5e7eb"} 
                stroke="#6b7280" strokeWidth="2"/>
          
          {/* Vehicle details */}
          <text x="150" y="105" fontSize="10" fill="#374151" 
                textAnchor="middle" fontWeight="600">
            {vehicleMake ? `${vehicleMake.substring(0, 8)}` : 'Vehicle'}
          </text>
          
          {/* Damage zone overlays */}
          {damageZones.includes('front') && (
            <rect x="95" y="75" width="10" height="50" 
                  fill="url(#damage-pattern)" opacity="0.7"/>
          )}
          {damageZones.includes('rear') && (
            <rect x="195" y="75" width="10" height="50" 
                  fill="url(#damage-pattern)" opacity="0.7"/>
          )}
          {damageZones.includes('side') && (
            <>
              <rect x="100" y="70" width="100" height="10" 
                    fill="url(#damage-pattern)" opacity="0.7"/>
              <rect x="100" y="120" width="100" height="10" 
                    fill="url(#damage-pattern)" opacity="0.7"/>
            </>
          )}
          
          {/* Impact point marker */}
          <circle cx={config.impactX} cy={config.impactY} r="6" 
                  fill="#ef4444" stroke="#991b1b" strokeWidth="2"/>
          <circle cx={config.impactX} cy={config.impactY} r="3" 
                  fill="#fca5a5" opacity="0.8"/>
          
          {/* Primary impact vector (thickness scaled by force, color by confidence) */}
          <line 
            x1={config.vectorX1} 
            y1={config.vectorY1} 
            x2={config.vectorX2} 
            y2={config.vectorY2} 
            stroke={confidenceScore !== undefined ? getConfidenceColor(confidenceScore).vector : "#dc2626"} 
            strokeWidth={vectorThickness} 
            markerEnd={confidenceScore !== undefined && confidenceScore > 0.85 ? "url(#arrowhead-green)" : confidenceScore !== undefined && confidenceScore >= 0.6 ? "url(#arrowhead-amber)" : "url(#arrowhead-red)"}
          />
          <text 
            x={(config.vectorX1 + config.vectorX2) / 2} 
            y={config.vectorY1 - 10} 
            fontSize="10" 
            fill="#dc2626" 
            fontWeight="600"
            textAnchor="middle"
          >
            {config.label}
          </text>
          
          {/* Energy dissipation zones (crumple zones) */}
          {config.crumpleZone === 'front' && (
            <>
              <circle cx="100" cy="100" r="25" fill="none" 
                      stroke="#10b981" strokeWidth="2" strokeDasharray="5,5" opacity="0.5"/>
              <circle cx="100" cy="100" r="40" fill="none" 
                      stroke="#10b981" strokeWidth="1" strokeDasharray="5,5" opacity="0.3"/>
            </>
          )}
          {config.crumpleZone === 'rear' && (
            <>
              <circle cx="200" cy="100" r="25" fill="none" 
                      stroke="#10b981" strokeWidth="2" strokeDasharray="5,5" opacity="0.5"/>
              <circle cx="200" cy="100" r="40" fill="none" 
                      stroke="#10b981" strokeWidth="1" strokeDasharray="5,5" opacity="0.3"/>
            </>
          )}
          {config.crumpleZone === 'side' && (
            <>
              <ellipse cx="150" cy="100" rx="40" ry="25" fill="none" 
                       stroke="#10b981" strokeWidth="2" strokeDasharray="5,5" opacity="0.5"/>
              <ellipse cx="150" cy="100" rx="55" ry="35" fill="none" 
                       stroke="#10b981" strokeWidth="1" strokeDasharray="5,5" opacity="0.3"/>
            </>
          )}
          
          {/* Deformation arrows */}
          {displayForce && displayForce > 30 && (
            <>
              <line 
                x1={config.impactX + 10} 
                y1={config.impactY} 
                x2={config.impactX + 60} 
                y2={config.impactY} 
                stroke="#f59e0b" 
                strokeWidth="2" 
                markerEnd="url(#arrowhead-orange)"
                opacity="0.7"
              />
              <text 
                x={config.impactX + 35} 
                y={config.impactY - 8} 
                fontSize="8" 
                fill="#f59e0b" 
                fontWeight="600"
                textAnchor="middle"
              >
                Deformation
              </text>
            </>
          )}
          
          {/* Energy dissipation label */}
          <text x="150" y="165" fontSize="10" fill="#10b981" 
                textAnchor="middle" fontWeight="600">
            Energy Dissipation Zone
          </text>
        </svg>
      </div>

      {/* Damaged Components List */}
      {damagedComponents.length > 0 && (
        <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/30 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <p className="text-sm font-semibold text-red-900 dark:text-red-200">Damaged Components</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {damagedComponents.slice(0, 6).map((comp, idx) => (
              <Badge key={idx} variant="outline" className="text-xs bg-white dark:bg-card">
                {comp}
              </Badge>
            ))}
            {damagedComponents.length > 6 && (
              <Badge variant="outline" className="text-xs bg-white dark:bg-card">
                +{damagedComponents.length - 6} more
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Physics Consistency Note */}
      <div className="mt-4 p-3 bg-primary/5 rounded-lg">
        <p className="text-sm text-gray-700 dark:text-foreground/80">
          {damageConsistency === 'consistent' && (
            <span>✅ Impact vectors and damage pattern are <strong>consistent</strong> with reported collision physics.</span>
          )}
          {damageConsistency === 'questionable' && (
            <span>⚠️ Some aspects of the impact pattern are <strong>questionable</strong>. Damage location may not fully align with reported collision angle.</span>
          )}
          {damageConsistency === 'impossible' && (
            <span>🚨 Impact vectors are <strong>physically inconsistent</strong> with the observed damage pattern. High fraud risk detected.</span>
          )}
        </p>
      </div>
    </Card>
  );
}
