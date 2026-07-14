import { useState, useMemo } from "react";
import { calculateAllZoneSeverities, getSeverityColor, getSeverityDescription, type DamageSeverity } from "@/lib/damageSeverity";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AlertTriangle, ArrowRight, Shield, Target, HelpCircle, CheckCircle2 } from "lucide-react";
import { DegradedModeBanner } from "@/components/DegradedModeBanner";
import { useDamageMapGuard } from "@/hooks/useVisualDataGuard";

/** Physics validation data — same shape as VehicleImpactVectorDiagram */
interface PhysicsValidation {
  impactAngleDegrees: number;
  calculatedImpactForceKN?: number;
  impactLocationNormalized?: { relativeX: number; relativeY: number };
}

interface VehicleDamageVisualizationProps {
  damagedComponents: string[];
  accidentType?: string;
  estimatedCost?: number;
  structuralDamage?: boolean;
  airbagDeployment?: boolean;
  /** Pass physicsValidation from the physics pipeline stage to enable expected-vs-detected overlay */
  physicsValidation?: PhysicsValidation | null;
}

// Map component names to vehicle zones
const COMPONENT_TO_ZONE: Record<string, string[]> = {
  front: ["bumper", "front bumper", "fender", "headlight", "hood", "bonnet", "grille", "radiator", "bull bar", "fog light", "indicator"],
  rear: ["trunk", "boot", "taillight", "rear bumper", "rear fender", "tail gate", "tow bar", "number plate light"],
  left_side: ["left door", "left fender", "left mirror", "left quarter panel", "driver door", "driver side", "left running board", "left mudguard", "left side panel"],
  right_side: ["right door", "right fender", "right mirror", "right quarter panel", "passenger door", "passenger side", "right running board", "right mudguard", "right side panel"],
  roof: ["roof", "sunroof", "pillar", "canopy", "roof rack", "a-pillar", "b-pillar", "c-pillar"],
  windshield: ["windshield", "windscreen", "front glass", "wiper"],
  rear_glass: ["rear windshield", "rear windscreen", "rear glass"],
  undercarriage: ["chassis", "suspension", "axle", "frame", "subframe", "exhaust", "sump", "drive shaft"],
};

// Accident type to primary impact direction
const ACCIDENT_IMPACT_DIRECTION: Record<string, { angle: number; label: string }> = {
  frontal: { angle: 270, label: "Frontal Impact" },
  head_on: { angle: 270, label: "Head-On Collision" },
  rear_end: { angle: 90, label: "Rear-End Impact" },
  rear: { angle: 90, label: "Rear Impact" },
  side_impact: { angle: 0, label: "Side Impact" },
  side_driver: { angle: 180, label: "Driver Side Impact" },
  side_passenger: { angle: 0, label: "Passenger Side Impact" },
  rollover: { angle: -1, label: "Rollover" },
  parking_lot: { angle: -1, label: "Parking Lot Incident" },
  highway: { angle: 270, label: "Highway Collision" },
  multi_impact: { angle: -1, label: "Multiple Impact Points" },
};

/**
 * Derives the 1–3 zones that physics predicts should be damaged given an impact angle.
 * Angle convention (same as VehicleImpactVectorDiagram):
 *   0° = right side, 90° = rear, 180° = left side, 270° = front
 * Returns primary zone(s) + adjacent transition zones for oblique angles.
 */
function deriveExpectedZonesFromAngle(degrees: number): Set<string> {
  const zones = new Set<string>();
  // Normalise to 0–360
  const a = ((degrees % 360) + 360) % 360;

  // Pure cardinal directions
  if (a >= 337.5 || a < 22.5) { zones.add("right_side"); return zones; }
  if (a >= 22.5 && a < 67.5) { zones.add("right_side"); zones.add("rear"); return zones; }
  if (a >= 67.5 && a < 112.5) { zones.add("rear"); return zones; }
  if (a >= 112.5 && a < 157.5) { zones.add("rear"); zones.add("left_side"); return zones; }
  if (a >= 157.5 && a < 202.5) { zones.add("left_side"); return zones; }
  if (a >= 202.5 && a < 247.5) { zones.add("left_side"); zones.add("front"); return zones; }
  if (a >= 247.5 && a < 292.5) { zones.add("front"); return zones; }
  if (a >= 292.5 && a < 337.5) { zones.add("front"); zones.add("right_side"); return zones; }
  return zones;
}

export default function VehicleDamageVisualization({
  damagedComponents,
  accidentType,
  estimatedCost = 0,
  structuralDamage = false,
  airbagDeployment = false,
  physicsValidation,
}: VehicleDamageVisualizationProps) {
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);

  // Stage 28: Defensive rendering — NEVER hide component due to missing data
  const damageGuard = useDamageMapGuard({
    zones: [],
    damagedComponents,
    accidentType,
  });
  const effectiveComponents = damageGuard.isDegraded ? damageGuard.resolvedComponents : damagedComponents;

  // Determine which zones are damaged (detected by damage analysis)
  const damagedZones = useMemo(() => {
    const zones = new Set<string>();
    if (damageGuard.isDegraded) {
      damageGuard.resolvedZones.forEach(z => zones.add(z));
    }
    effectiveComponents.forEach(component => {
      const lowerComp = component.toLowerCase();
      Object.entries(COMPONENT_TO_ZONE).forEach(([zone, keywords]) => {
        if (keywords.some(keyword => lowerComp.includes(keyword) || keyword.includes(lowerComp))) {
          zones.add(zone);
        }
      });
      if (!Array.from(zones).length) {
        if (lowerComp.includes("front") || lowerComp.includes("bumper") || lowerComp.includes("hood")) zones.add("front");
        if (lowerComp.includes("rear") || lowerComp.includes("back") || lowerComp.includes("boot")) zones.add("rear");
        if (lowerComp.includes("left") || lowerComp.includes("driver")) zones.add("left_side");
        if (lowerComp.includes("right") || lowerComp.includes("passenger")) zones.add("right_side");
        if (lowerComp.includes("roof") || lowerComp.includes("top")) zones.add("roof");
      }
    });
    if (accidentType === "frontal" || accidentType === "head_on") zones.add("front");
    else if (accidentType === "rear_end" || accidentType === "rear") zones.add("rear");
    else if (accidentType?.includes("side_driver")) zones.add("left_side");
    else if (accidentType?.includes("side_passenger") || accidentType === "side_impact") zones.add("right_side");
    else if (accidentType === "rollover") zones.add("roof");
    return zones;
  }, [damagedComponents, accidentType, damageGuard.isDegraded, damageGuard.resolvedZones, damageGuard.resolvedComponents, effectiveComponents]);

  // Derive expected zones from physics impact angle
  const expectedZones = useMemo(() => {
    if (physicsValidation?.impactAngleDegrees != null) {
      return deriveExpectedZonesFromAngle(physicsValidation.impactAngleDegrees);
    }
    return new Set<string>();
  }, [physicsValidation]);

  const hasPhysicsOverlay = expectedZones.size > 0;

  // Zone classification for overlay
  const getZoneClass = (zone: string): "detected-expected" | "detected-only" | "expected-only" | "undamaged" => {
    const detected = damagedZones.has(zone);
    const expected = expectedZones.has(zone);
    if (detected && expected) return "detected-expected";
    if (detected && !expected) return "detected-only";
    if (!detected && expected) return "expected-only";
    return "undamaged";
  };

  // Build zone-to-components map for severity calculation
  const zoneComponentsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    damagedZones.forEach(zone => {
      const componentsInZone = damagedComponents.filter(comp => {
        const lowerComp = comp.toLowerCase();
        return COMPONENT_TO_ZONE[zone]?.some(keyword => lowerComp.includes(keyword) || keyword.includes(lowerComp));
      });
      if (componentsInZone.length === 0) {
        map.set(zone, [zone.replace("_", " ") + " area"]);
      } else {
        map.set(zone, componentsInZone);
      }
    });
    return map;
  }, [damagedZones, damagedComponents]);

  // Calculate severity scores
  const zoneSeverities = useMemo(() =>
    calculateAllZoneSeverities(zoneComponentsMap, {
      estimatedCost,
      structuralDamage,
      airbagDeployment,
      accidentType: accidentType || "unknown",
      damagedComponents,
    }), [zoneComponentsMap, estimatedCost, structuralDamage, airbagDeployment, accidentType, damagedComponents]);

  const severityMap = useMemo(() => {
    const m = new Map<string, DamageSeverity>();
    zoneSeverities.forEach(s => m.set(s.zone, s));
    return m;
  }, [zoneSeverities]);

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  const getZoneFill = (zone: string) => {
    const isActive = hoveredZone === zone || selectedZone === zone;
    const cls = getZoneClass(zone);

    if (cls === "detected-expected" || cls === "detected-only") {
      const severity = severityMap.get(zone);
      if (severity) {
        const color = getSeverityColor(severity.level);
        return isActive ? color : color + "99";
      }
      return isActive ? "#dc2626" : "#dc262666";
    }
    if (cls === "expected-only") {
      // Blue tint — physics predicted damage, none detected
      return isActive ? "#3b82f6" : "#3b82f622";
    }
    if (isDark) return isActive ? "#334155" : "#1e293b";
    return isActive ? "#cbd5e1" : "#e2e8f0";
  };

  const getZoneStroke = (zone: string) => {
    const cls = getZoneClass(zone);
    if (cls === "detected-expected") {
      const severity = severityMap.get(zone);
      return severity ? getSeverityColor(severity.level) : "#dc2626";
    }
    if (cls === "detected-only") {
      // Amber dashed — unexpected damage
      return "#f59e0b";
    }
    if (cls === "expected-only") {
      return "#3b82f6";
    }
    return isDark ? "#475569" : "#94a3b8";
  };

  const getZoneStrokeWidth = (zone: string) => {
    const isActive = hoveredZone === zone || selectedZone === zone;
    const cls = getZoneClass(zone);
    if (cls === "detected-expected") return isActive ? 3 : 2.5;
    if (cls === "detected-only") return isActive ? 3 : 2.5;
    if (cls === "expected-only") return isActive ? 2.5 : 2;
    return isActive ? 1.5 : 1;
  };

  const getZoneStrokeDasharray = (zone: string) => {
    const cls = getZoneClass(zone);
    if (cls === "detected-only") return "6 3";   // amber dashed = unexpected
    if (cls === "expected-only") return "5 4";   // blue dashed = missing
    return undefined;
  };

  const handleZoneClick = (zone: string) => {
    setSelectedZone(selectedZone === zone ? null : zone);
  };

  const getComponentsForZone = (zone: string): string[] => {
    return zoneComponentsMap.get(zone) || [];
  };

  const impactInfo = accidentType ? ACCIDENT_IMPACT_DIRECTION[accidentType] : null;
  const activeZone = selectedZone || hoveredZone;
  const activeZoneSeverity = activeZone ? severityMap.get(activeZone) : null;
  const activeZoneClass = activeZone ? getZoneClass(activeZone) : null;

  // Summary counts for overlay badge
  const unexpectedCount = Array.from(damagedZones).filter(z => !expectedZones.has(z)).length;
  const missingCount = Array.from(expectedZones).filter(z => !damagedZones.has(z)).length;
  const confirmedCount = Array.from(damagedZones).filter(z => expectedZones.has(z)).length;

  // Helper to render a zone path with overlay props
  const zoneProps = (zone: string) => ({
    fill: getZoneFill(zone),
    stroke: getZoneStroke(zone),
    strokeWidth: getZoneStrokeWidth(zone),
    strokeDasharray: getZoneStrokeDasharray(zone),
    onMouseEnter: () => setHoveredZone(zone),
    onMouseLeave: () => setHoveredZone(null),
    onClick: () => handleZoneClick(zone),
    className: "cursor-pointer",
    filter: damagedZones.has(zone) ? "url(#damage-glow)" : undefined,
  });

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg"><Target className="w-5 h-5 text-red-600" /></div>
        <h2 className="text-xl font-semibold">Vehicle Damage Map</h2>
        <Badge variant="secondary">{damagedZones.size} zones affected</Badge>
        {impactInfo && <Badge variant="outline" className="gap-1"><ArrowRight className="w-3 h-3" />{impactInfo.label}</Badge>}
        {hasPhysicsOverlay && (
          <Badge variant="outline" className="gap-1 border-blue-400 text-blue-600 dark:text-blue-400">
            Physics overlay active
          </Badge>
        )}
      </div>

      {/* Physics overlay summary row */}
      {hasPhysicsOverlay && (
        <div className="flex flex-wrap gap-3 mb-4 p-3 rounded-lg bg-muted/40 border border-border text-xs">
          {confirmedCount > 0 && (
            <span className="flex items-center gap-1.5 text-green-700 dark:text-green-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {confirmedCount} zone{confirmedCount !== 1 ? "s" : ""} confirmed by physics
            </span>
          )}
          {unexpectedCount > 0 && (
            <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-medium">
              <AlertTriangle className="w-3.5 h-3.5" />
              {unexpectedCount} unexpected zone{unexpectedCount !== 1 ? "s" : ""} (not predicted by physics)
            </span>
          )}
          {missingCount > 0 && (
            <span className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400 font-medium">
              <HelpCircle className="w-3.5 h-3.5" />
              {missingCount} zone{missingCount !== 1 ? "s" : ""} expected but not detected
            </span>
          )}
          {confirmedCount > 0 && unexpectedCount === 0 && missingCount === 0 && (
            <span className="text-muted-foreground">Damage pattern fully consistent with physics model</span>
          )}
        </div>
      )}

      {damageGuard.isDegraded && damageGuard.degradedLabel && (
        <DegradedModeBanner
          label={damageGuard.degradedLabel}
          detail="Damage zones are inferred from accident type. Upload damage photos or components for precise mapping."
          size="md"
        />
      )}

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Vehicle Diagram - 3 columns */}
        <div className="lg:col-span-3">
          <svg viewBox="0 0 360 580" className="w-full h-auto max-w-sm mx-auto" style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.25))" }}>
            <defs>
              <marker id="impact-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <polygon points="0 0, 8 4, 0 8" fill="#ef4444" />
              </marker>
              <filter id="damage-glow">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Vehicle body outline */}
            <path
              d="M 130 40 C 130 25, 230 25, 230 40
                 L 245 80 L 255 130 L 260 200 L 260 380 L 255 450 L 245 500 L 230 540
                 C 230 555, 130 555, 130 540
                 L 115 500 L 105 450 L 100 380 L 100 200 L 105 130 L 115 80 Z"
              fill="none"
              stroke={isDark ? "#64748b" : "#374151"}
              strokeWidth="2.5"
            />

            {/* ── FRONT ZONE ── */}
            <path
              d="M 130 40 C 130 25, 230 25, 230 40 L 245 80 L 255 130 L 105 130 L 115 80 Z"
              {...zoneProps("front")}
            />
            <ellipse cx="125" cy="65" rx="12" ry="8" fill="none" stroke="#6b7280" strokeWidth="1" opacity="0.5" />
            <ellipse cx="235" cy="65" rx="12" ry="8" fill="none" stroke="#6b7280" strokeWidth="1" opacity="0.5" />
            <rect x="155" y="55" width="50" height="15" rx="3" fill="none" stroke="#6b7280" strokeWidth="0.8" opacity="0.4" />
            <text x="180" y="110" textAnchor="middle" fontSize="11" fill={isDark ? "#e2e8f0" : "#374151"} fontWeight="600" pointerEvents="none">FRONT</text>

            {/* ── WINDSHIELD ── */}
            <path d="M 120 140 L 240 140 L 235 195 L 125 195 Z" {...zoneProps("windshield")} />
            <line x1="145" y1="145" x2="140" y2="190" stroke="#9ca3af" strokeWidth="0.5" opacity="0.4" />
            <line x1="215" y1="145" x2="220" y2="190" stroke="#9ca3af" strokeWidth="0.5" opacity="0.4" />
            <text x="180" y="172" textAnchor="middle" fontSize="9" fill={isDark ? "#94a3b8" : "#64748b"} pointerEvents="none">Windshield</text>

            {/* ── LEFT SIDE ── */}
            <path d="M 100 200 L 120 200 L 120 380 L 100 380 L 100 200 Z" {...zoneProps("left_side")} />
            <line x1="100" y1="250" x2="120" y2="250" stroke="#9ca3af" strokeWidth="0.8" opacity="0.5" />
            <line x1="100" y1="330" x2="120" y2="330" stroke="#9ca3af" strokeWidth="0.8" opacity="0.5" />
            <ellipse cx="93" cy="210" rx="8" ry="5" fill={damagedZones.has("left_side") ? getZoneFill("left_side") : (isDark ? "#1e293b" : "#e2e8f0")} stroke={isDark ? "#475569" : "#94a3b8"} strokeWidth="1" />
            <text x="85" y="295" textAnchor="middle" fontSize="9" fill={isDark ? "#94a3b8" : "#64748b"} transform="rotate(-90 85 295)" pointerEvents="none">LEFT (Driver)</text>

            {/* ── RIGHT SIDE ── */}
            <path d="M 240 200 L 260 200 L 260 380 L 240 380 L 240 200 Z" {...zoneProps("right_side")} />
            <line x1="240" y1="250" x2="260" y2="250" stroke="#9ca3af" strokeWidth="0.8" opacity="0.5" />
            <line x1="240" y1="330" x2="260" y2="330" stroke="#9ca3af" strokeWidth="0.8" opacity="0.5" />
            <ellipse cx="267" cy="210" rx="8" ry="5" fill={damagedZones.has("right_side") ? getZoneFill("right_side") : (isDark ? "#1e293b" : "#e2e8f0")} stroke={isDark ? "#475569" : "#94a3b8"} strokeWidth="1" />
            <text x="275" y="285" textAnchor="middle" fontSize="9" fill={isDark ? "#94a3b8" : "#64748b"} transform="rotate(90 275 285)" pointerEvents="none">RIGHT (Passenger)</text>

            {/* ── ROOF / CABIN ── */}
            <rect x="125" y="205" width="110" height="170" rx="8" {...zoneProps("roof")} />
            <rect x="140" y="220" width="30" height="35" rx="5" fill="none" stroke="#d1d5db" strokeWidth="0.8" />
            <rect x="190" y="220" width="30" height="35" rx="5" fill="none" stroke="#d1d5db" strokeWidth="0.8" />
            <rect x="135" y="290" width="90" height="35" rx="5" fill="none" stroke="#d1d5db" strokeWidth="0.8" />
            <text x="180" y="355" textAnchor="middle" fontSize="10" fill={isDark ? "#94a3b8" : "#64748b"} pointerEvents="none">CABIN / ROOF</text>

            {/* ── REAR GLASS ── */}
            <path d="M 125 385 L 235 385 L 240 435 L 120 435 Z" {...zoneProps("rear_glass")} />
            <text x="180" y="415" textAnchor="middle" fontSize="9" fill={isDark ? "#94a3b8" : "#64748b"} pointerEvents="none">Rear Glass</text>

            {/* ── REAR ZONE ── */}
            <path d="M 115 445 L 245 445 L 245 500 L 230 540 C 230 555, 130 555, 130 540 L 115 500 Z" {...zoneProps("rear")} />
            <ellipse cx="130" cy="510" rx="10" ry="7" fill="none" stroke="#6b7280" strokeWidth="1" opacity="0.5" />
            <ellipse cx="230" cy="510" rx="10" ry="7" fill="none" stroke="#6b7280" strokeWidth="1" opacity="0.5" />
            <text x="180" y="495" textAnchor="middle" fontSize="11" fill={isDark ? "#e2e8f0" : "#374151"} fontWeight="600" pointerEvents="none">REAR</text>

            {/* ── WHEELS ── */}
            <ellipse cx="95" cy="155" rx="14" ry="22" fill="#64748b" opacity="0.4" stroke="#64748b" strokeWidth="1.5" />
            <ellipse cx="265" cy="155" rx="14" ry="22" fill="#64748b" opacity="0.4" stroke="#64748b" strokeWidth="1.5" />
            <ellipse cx="95" cy="430" rx="14" ry="22" fill="#64748b" opacity="0.4" stroke="#64748b" strokeWidth="1.5" />
            <ellipse cx="265" cy="430" rx="14" ry="22" fill="#64748b" opacity="0.4" stroke="#64748b" strokeWidth="1.5" />

            {/* ── IMPACT DIRECTION ARROWS ── */}
            {impactInfo && impactInfo.angle >= 0 && (() => {
              const arrows: { x1: number; y1: number; x2: number; y2: number }[] = [];
              if (impactInfo.angle === 270) {
                arrows.push({ x1: 180, y1: 0, x2: 180, y2: 30 });
                arrows.push({ x1: 150, y1: 5, x2: 165, y2: 30 });
                arrows.push({ x1: 210, y1: 5, x2: 195, y2: 30 });
              } else if (impactInfo.angle === 90) {
                arrows.push({ x1: 180, y1: 580, x2: 180, y2: 550 });
                arrows.push({ x1: 150, y1: 575, x2: 165, y2: 550 });
                arrows.push({ x1: 210, y1: 575, x2: 195, y2: 550 });
              } else if (impactInfo.angle === 0) {
                arrows.push({ x1: 340, y1: 290, x2: 270, y2: 290 });
                arrows.push({ x1: 335, y1: 260, x2: 270, y2: 270 });
                arrows.push({ x1: 335, y1: 320, x2: 270, y2: 310 });
              } else if (impactInfo.angle === 180) {
                arrows.push({ x1: 20, y1: 290, x2: 90, y2: 290 });
                arrows.push({ x1: 25, y1: 260, x2: 90, y2: 270 });
                arrows.push({ x1: 25, y1: 320, x2: 90, y2: 310 });
              }
              return arrows.map((a, i) => (
                <line key={i} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2}
                  stroke="#ef4444" strokeWidth={i === 0 ? 3 : 2} markerEnd="url(#impact-arrow)"
                  opacity={i === 0 ? 0.9 : 0.6} />
              ));
            })()}

            {/* Damage indicators — pulsing dots on detected zones */}
            {Array.from(damagedZones).map(zone => {
              const positions: Record<string, { x: number; y: number }> = {
                front: { x: 180, y: 80 },
                windshield: { x: 180, y: 165 },
                left_side: { x: 110, y: 290 },
                right_side: { x: 250, y: 290 },
                roof: { x: 180, y: 280 },
                rear_glass: { x: 180, y: 410 },
                rear: { x: 180, y: 500 },
                undercarriage: { x: 180, y: 340 },
              };
              const pos = positions[zone];
              if (!pos) return null;
              const cls = getZoneClass(zone);
              const color = cls === "detected-only" ? "#f59e0b" : (severityMap.get(zone) ? getSeverityColor(severityMap.get(zone)!.level) : "#ef4444");
              return (
                <g key={zone}>
                  <circle cx={pos.x} cy={pos.y} r="8" fill={color} opacity="0.3">
                    <animate attributeName="r" values="6;12;6" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.4;0.1;0.4" dur="2s" repeatCount="indefinite" />
                  </circle>
                  <circle cx={pos.x} cy={pos.y} r="4" fill={color} stroke="white" strokeWidth="1.5" />
                </g>
              );
            })}

            {/* Expected-only zone indicators — question mark dots */}
            {hasPhysicsOverlay && Array.from(expectedZones).filter(z => !damagedZones.has(z)).map(zone => {
              const positions: Record<string, { x: number; y: number }> = {
                front: { x: 180, y: 80 },
                windshield: { x: 180, y: 165 },
                left_side: { x: 110, y: 290 },
                right_side: { x: 250, y: 290 },
                roof: { x: 180, y: 280 },
                rear_glass: { x: 180, y: 410 },
                rear: { x: 180, y: 500 },
                undercarriage: { x: 180, y: 340 },
              };
              const pos = positions[zone];
              if (!pos) return null;
              return (
                <g key={`expected-${zone}`}>
                  <circle cx={pos.x} cy={pos.y} r="10" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.7" />
                  <text x={pos.x} y={pos.y + 4} textAnchor="middle" fontSize="10" fill="#3b82f6" fontWeight="700" pointerEvents="none">?</text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Zone Details Panel - 2 columns */}
        <div className="lg:col-span-2 space-y-4">
          {/* Active zone detail */}
          {activeZone && (
            <div className={`p-4 rounded-lg border-2 ${
              activeZoneClass === "detected-expected" ? 'border-red-200 dark:border-red-800 bg-red-50/5 dark:bg-red-950/20' :
              activeZoneClass === "detected-only" ? 'border-amber-300 dark:border-amber-700 bg-amber-50/10 dark:bg-amber-950/20' :
              activeZoneClass === "expected-only" ? 'border-blue-300 dark:border-blue-700 bg-blue-50/10 dark:bg-blue-950/20' :
              'border-border bg-muted/50'
            }`}>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="font-semibold text-sm capitalize">{activeZone.replace(/_/g, " ")} Zone</span>
                {activeZoneSeverity && (
                  <Badge style={{ backgroundColor: getSeverityColor(activeZoneSeverity.level) }} className="text-white text-xs">
                    {activeZoneSeverity.level} ({activeZoneSeverity.score}/10)
                  </Badge>
                )}
                {activeZoneClass === "detected-only" && hasPhysicsOverlay && (
                  <Badge variant="outline" className="text-xs border-amber-400 text-amber-600 dark:text-amber-400 gap-1">
                    <AlertTriangle className="w-3 h-3" /> Unexpected
                  </Badge>
                )}
                {activeZoneClass === "expected-only" && (
                  <Badge variant="outline" className="text-xs border-blue-400 text-blue-600 dark:text-blue-400 gap-1">
                    <HelpCircle className="w-3 h-3" /> Missing
                  </Badge>
                )}
                {activeZoneClass === "detected-expected" && hasPhysicsOverlay && (
                  <Badge variant="outline" className="text-xs border-green-400 text-green-600 dark:text-green-400 gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Confirmed
                  </Badge>
                )}
              </div>

              {activeZoneClass === "expected-only" ? (
                <div>
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">Physics predicted damage — none detected</p>
                  <p className="text-xs text-muted-foreground">The physics model (impact angle {physicsValidation?.impactAngleDegrees?.toFixed(0)}°) predicts this zone should have sustained damage, but no components in this zone were found in the damage report. This may indicate unreported damage, a glancing blow, or a discrepancy in the incident description.</p>
                </div>
              ) : activeZoneClass === "detected-only" && hasPhysicsOverlay ? (
                <>
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-2">Damage detected — not predicted by physics</p>
                  <p className="text-xs text-muted-foreground mb-2">Physics model did not predict damage in this zone based on the reported impact angle. Possible causes: secondary impact, pre-existing damage, or inaccurate impact direction in the claim.</p>
                  <div className="space-y-1">
                    {getComponentsForZone(activeZone).map((comp, idx) => (
                      <p key={idx} className="text-xs text-foreground/80 capitalize flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                        {comp}
                      </p>
                    ))}
                  </div>
                </>
              ) : damagedZones.has(activeZone) ? (
                <>
                  <p className="text-xs text-red-600 font-medium mb-2">Damage Detected{activeZoneClass === "detected-expected" && hasPhysicsOverlay ? " · Physics Confirmed" : ""}</p>
                  <div className="space-y-1 mb-2">
                    {getComponentsForZone(activeZone).map((comp, idx) => (
                      <p key={idx} className="text-xs text-foreground/80 capitalize flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                        {comp}
                      </p>
                    ))}
                  </div>
                  {activeZoneSeverity && (activeZoneSeverity.safetyImplications ?? []).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-red-200 dark:border-red-800">
                      <p className="text-xs font-medium text-foreground/80 mb-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-500" /> Safety Concerns:
                      </p>
                      {(activeZoneSeverity.safetyImplications ?? []).map((concern, idx) => (
                        <p key={idx} className="text-xs text-amber-700 dark:text-amber-300 ml-4">- {concern}</p>
                      ))}
                    </div>
                  )}
                  {activeZoneSeverity && (
                    <p className="text-xs text-muted-foreground mt-2 italic">{getSeverityDescription(activeZoneSeverity.level)}</p>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">No damage detected in this zone</p>
              )}
            </div>
          )}

          {!activeZone && (
            <div className="p-4 rounded-lg border border-dashed border-border bg-muted/50 text-center">
              <Target className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground font-medium">Hover or click a zone</p>
              <p className="text-xs text-muted-foreground/70">to see damage details</p>
            </div>
          )}

          {/* Severity Priority List */}
          {zoneSeverities.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-muted-foreground" /> Damage Priority
              </h4>
              {zoneSeverities.map((sev, idx) => {
                const cls = getZoneClass(sev.zone);
                return (
                  <div
                    key={sev.zone}
                    className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      selectedZone === sev.zone ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/20' : 'border-border hover:bg-muted/50'
                    }`}
                    onClick={() => handleZoneClick(sev.zone)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground w-5">#{idx + 1}</span>
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getSeverityColor(sev.level) }} />
                      <span className="text-sm font-medium capitalize">{sev.zone.replace(/_/g, " ")}</span>
                      {cls === "detected-only" && hasPhysicsOverlay && (
                        <AlertTriangle className="w-3 h-3 text-amber-500" />
                      )}
                      {cls === "detected-expected" && hasPhysicsOverlay && (
                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs" style={{ borderColor: getSeverityColor(sev.level), color: getSeverityColor(sev.level) }}>
                        {sev.level}
                      </Badge>
                      <span className="text-xs font-bold text-foreground/70">{sev.score}/10</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div className="pt-2 border-t border-border">
            <p className="text-xs font-semibold text-foreground/70 mb-2">Severity Scale</p>
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              {(["Critical", "Severe", "Moderate", "Minor"] as const).map(level => (
                <div key={level} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: getSeverityColor(level) }} />
                  <span className="text-xs text-foreground/70">{level}</span>
                </div>
              ))}
            </div>
            {hasPhysicsOverlay && (
              <>
                <p className="text-xs font-semibold text-foreground/70 mb-1.5 mt-2">Physics Overlay</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm border-2 border-green-500" style={{ backgroundColor: "transparent" }} />
                    <span className="text-xs text-foreground/70">Detected + physics confirmed</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm border-2 border-dashed border-amber-500" style={{ backgroundColor: "transparent" }} />
                    <span className="text-xs text-foreground/70">Detected — unexpected by physics</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm border-2 border-dashed border-blue-500" style={{ backgroundColor: "#3b82f611" }} />
                    <span className="text-xs text-foreground/70">Expected — not detected</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
