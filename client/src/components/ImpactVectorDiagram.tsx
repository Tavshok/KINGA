/**
 * ImpactVectorDiagram — SVG force vector visualisation
 *
 * Renders a top-down vehicle silhouette with:
 *   - Impact direction arrow (scaled by force magnitude)
 *   - Energy dissipation zone (gradient fill)
 *   - Speed, force, and energy labels
 *   - Damage zone highlights matching impacted area
 */
import { useMemo } from "react";

interface ImpactVectorDiagramProps {
  impactDirection: string;   // "FRONTAL" | "REAR" | "SIDE" | "LEFT" | "RIGHT" | etc.
  impactForceKn: number;
  estimatedSpeedKmh: number;
  deltaVKmh: number;
  energyKj: number;
  impactAngle?: number;      // 0-360 degrees
  damagedZones?: string[];   // ["FRONT", "SIDE", "REAR"]
}

// Map direction labels to SVG rotation angles (0 = top/north)
function directionToAngle(dir: string, angle?: number): number {
  if (angle != null && angle >= 0) return angle;
  const d = dir.toUpperCase();
  if (d.includes("FRONT") || d.includes("HEAD")) return 0;
  if (d.includes("REAR") || d.includes("BACK")) return 180;
  if (d.includes("LEFT") || d.includes("DRIVER")) return 270;
  if (d.includes("RIGHT") || d.includes("PASSENGER")) return 90;
  if (d.includes("SIDE")) return 90;
  return 0;
}

// Map direction to which vehicle zones are impacted
function impactedZones(dir: string): Set<string> {
  const d = dir.toUpperCase();
  if (d.includes("FRONT") || d.includes("HEAD")) return new Set(["front"]);
  if (d.includes("REAR") || d.includes("BACK")) return new Set(["rear"]);
  if (d.includes("LEFT") || d.includes("DRIVER")) return new Set(["left"]);
  if (d.includes("RIGHT") || d.includes("PASSENGER")) return new Set(["right"]);
  if (d.includes("SIDE")) return new Set(["right", "left"]);
  return new Set(["front"]);
}

export function ImpactVectorDiagram({
  impactDirection,
  impactForceKn,
  estimatedSpeedKmh,
  deltaVKmh,
  energyKj,
  impactAngle,
  damagedZones = [],
}: ImpactVectorDiagramProps) {
  const angle = useMemo(() => directionToAngle(impactDirection, impactAngle), [impactDirection, impactAngle]);
  const zones = useMemo(() => impactedZones(impactDirection), [impactDirection]);

  // Scale arrow length: 40px minimum, 100px max, proportional to force
  const arrowLen = Math.min(100, Math.max(40, impactForceKn * 0.8));

  // Vehicle center in SVG
  const cx = 160, cy = 140;

  // Arrow start point (outside vehicle, pointing inward)
  const rad = (angle - 90) * (Math.PI / 180);
  const arrowStartX = cx + Math.cos(rad) * (arrowLen + 65);
  const arrowStartY = cy + Math.sin(rad) * (arrowLen + 65);
  const arrowEndX = cx + Math.cos(rad) * 65;
  const arrowEndY = cy + Math.sin(rad) * 65;

  // Impact zone highlight position
  const impactZoneX = cx + Math.cos(rad) * 50;
  const impactZoneY = cy + Math.sin(rad) * 50;

  // Zone colors
  const zoneColor = (zone: string) => {
    if (zones.has(zone) || damagedZones.some(z => z.toLowerCase().includes(zone))) {
      return "var(--color-destructive, #ef4444)";
    }
    return "var(--color-muted, #e5e7eb)";
  };
  const zoneOpacity = (zone: string) =>
    zones.has(zone) || damagedZones.some(z => z.toLowerCase().includes(zone)) ? 0.35 : 0.12;

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      {/* SVG Diagram */}
      <div className="relative shrink-0">
        <svg
          viewBox="0 0 320 280"
          className="w-full max-w-[320px] h-auto"
          role="img"
          aria-label={`Impact vector diagram: ${impactDirection} collision at ${estimatedSpeedKmh} km/h, ${impactForceKn} kN`}
        >
          <defs>
            {/* Impact glow gradient */}
            <radialGradient id="impactGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
            </radialGradient>
            {/* Arrow marker */}
            <marker id="arrowHead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" className="fill-red-500" />
            </marker>
          </defs>

          {/* Vehicle body — top-down silhouette */}
          <g transform={`translate(${cx}, ${cy})`}>
            {/* Body outline */}
            <rect x="-30" y="-55" width="60" height="110" rx="12" ry="12"
              className="fill-muted stroke-border" strokeWidth="1.5" />
            {/* Windshield */}
            <path d="M-24,-35 L24,-35 L20,-20 L-20,-20 Z"
              className="fill-background stroke-border" strokeWidth="1" opacity="0.7" />
            {/* Rear window */}
            <path d="M-22,25 L22,25 L20,38 L-20,38 Z"
              className="fill-background stroke-border" strokeWidth="1" opacity="0.7" />
            {/* Wheels */}
            <rect x="-35" y="-40" width="8" height="18" rx="3" className="fill-foreground/30" />
            <rect x="27" y="-40" width="8" height="18" rx="3" className="fill-foreground/30" />
            <rect x="-35" y="22" width="8" height="18" rx="3" className="fill-foreground/30" />
            <rect x="27" y="22" width="8" height="18" rx="3" className="fill-foreground/30" />

            {/* Zone highlights */}
            {/* Front */}
            <rect x="-28" y="-53" width="56" height="25" rx="10"
              fill={zoneColor("front")} opacity={zoneOpacity("front")} />
            {/* Rear */}
            <rect x="-28" y="28" width="56" height="25" rx="10"
              fill={zoneColor("rear")} opacity={zoneOpacity("rear")} />
            {/* Left */}
            <rect x="-30" y="-30" width="15" height="60" rx="5"
              fill={zoneColor("left")} opacity={zoneOpacity("left")} />
            {/* Right */}
            <rect x="15" y="-30" width="15" height="60" rx="5"
              fill={zoneColor("right")} opacity={zoneOpacity("right")} />

            {/* Direction indicator (small triangle at front) */}
            <polygon points="0,-52 -6,-45 6,-45" className="fill-primary/60" />
          </g>

          {/* Impact glow at contact point */}
          <circle cx={impactZoneX} cy={impactZoneY} r="30" fill="url(#impactGlow)" />

          {/* Force vector arrow */}
          <line
            x1={arrowStartX} y1={arrowStartY}
            x2={arrowEndX} y2={arrowEndY}
            className="stroke-red-500"
            strokeWidth={Math.min(4, Math.max(2, impactForceKn / 30))}
            markerEnd="url(#arrowHead)"
            strokeLinecap="round"
          />

          {/* Force label at arrow start */}
          <text
            x={arrowStartX + Math.cos(rad + Math.PI / 2) * 12}
            y={arrowStartY + Math.sin(rad + Math.PI / 2) * 12}
            className="fill-red-500 text-[10px] font-bold"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {impactForceKn.toFixed(1)} kN
          </text>

          {/* Speed label */}
          <text x="10" y="20" className="fill-foreground text-[11px] font-semibold">
            {estimatedSpeedKmh.toFixed(0)} km/h
          </text>

          {/* Direction label */}
          <text x="10" y="270" className="fill-muted-foreground text-[10px]">
            {impactDirection}
          </text>
        </svg>
      </div>

      {/* Data table */}
      <div className="flex-1 min-w-0">
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Impact Speed", value: `${estimatedSpeedKmh.toFixed(1)} km/h`, highlight: estimatedSpeedKmh > 60 },
            { label: "Delta-V", value: `${deltaVKmh.toFixed(1)} km/h`, highlight: deltaVKmh > 30 },
            { label: "Impact Force", value: `${impactForceKn.toFixed(1)} kN`, highlight: impactForceKn > 50 },
            { label: "Energy Dissipated", value: `${energyKj.toFixed(1)} kJ`, highlight: energyKj > 100 },
            { label: "Direction", value: impactDirection, highlight: false },
            { label: "Impact Angle", value: `${angle}°`, highlight: false },
          ].map(({ label, value, highlight }) => (
            <div key={label} className={`rounded-lg border px-3 py-2 ${highlight ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30" : "border-border bg-muted/20"}`}>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
              <p className={`text-sm font-bold tabular-nums ${highlight ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>{value}</p>
            </div>
          ))}
        </div>
        {/* Severity band */}
        <div className="mt-3 rounded-lg border border-border bg-muted/20 px-3 py-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Severity Classification</p>
          <p className={`text-sm font-bold ${
            estimatedSpeedKmh > 80 ? "text-red-600 dark:text-red-400" :
            estimatedSpeedKmh > 40 ? "text-amber-600 dark:text-amber-400" :
            "text-green-600 dark:text-green-400"
          }`}>
            {estimatedSpeedKmh > 80 ? "SEVERE" : estimatedSpeedKmh > 40 ? "MODERATE" : "MINOR"}
            {" — "}
            {estimatedSpeedKmh > 80 ? "High-energy impact, structural damage likely" :
             estimatedSpeedKmh > 40 ? "Moderate impact, check structural components" :
             "Low-energy impact, cosmetic damage expected"}
          </p>
        </div>
      </div>
    </div>
  );
}
