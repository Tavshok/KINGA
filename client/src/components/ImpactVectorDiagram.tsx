/**
 * ImpactVectorDiagram — Enhanced SVG force vector visualisation
 *
 * Renders a large, prominent top-down vehicle silhouette with:
 *   - Impact direction arrow (scaled by force magnitude)
 *   - Energy dissipation zone (gradient fill)
 *   - Speed, force, and energy labels
 *   - Damage zone highlights matching impacted area
 *   - Severity-coloured ring around the vehicle
 *   - Pulsing impact glow for visual emphasis
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

function severityFromSpeed(kmh: number): { label: string; color: string; ringColor: string } {
  if (kmh < 15) return { label: "Cosmetic", color: "#22c55e", ringColor: "#22c55e" };
  if (kmh < 30) return { label: "Minor", color: "#eab308", ringColor: "#eab308" };
  if (kmh < 55) return { label: "Moderate", color: "#f97316", ringColor: "#f97316" };
  if (kmh < 80) return { label: "Severe", color: "#ef4444", ringColor: "#ef4444" };
  return { label: "Catastrophic", color: "#dc2626", ringColor: "#dc2626" };
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
  // All hooks must be called unconditionally (React Rules of Hooks)
  const angle = useMemo(() => directionToAngle(impactDirection, impactAngle), [impactDirection, impactAngle]);
  const zones = useMemo(() => impactedZones(impactDirection), [impactDirection]);
  const severity = useMemo(() => severityFromSpeed(estimatedSpeedKmh), [estimatedSpeedKmh]);

  // ── Fallback: render placeholder when physics data is absent ─────────────────
  const hasPhysicsData = estimatedSpeedKmh > 0 || impactForceKn > 0 || energyKj > 0;
  if (!hasPhysicsData) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-10 px-6 rounded-xl border border-dashed border-border bg-muted/20">
        <svg viewBox="0 0 400 200" className="w-full max-w-[320px] h-auto opacity-30" aria-hidden="true">
          {/* Placeholder vehicle silhouette */}
          <rect x="162" y="30" width="76" height="140" rx="15" className="fill-muted stroke-border" strokeWidth="1.5" />
          <path d="M170,52 L230,52 L226,72 L174,72 Z" className="fill-background/50 stroke-border" strokeWidth="1" />
          <path d="M172,132 L228,132 L226,150 L174,150 Z" className="fill-background/50 stroke-border" strokeWidth="1" />
          <rect x="155" y="48" width="10" height="22" rx="4" className="fill-foreground/20" />
          <rect x="235" y="48" width="10" height="22" rx="4" className="fill-foreground/20" />
          <rect x="155" y="130" width="10" height="22" rx="4" className="fill-foreground/20" />
          <rect x="235" y="130" width="10" height="22" rx="4" className="fill-foreground/20" />
          {/* Dashed question mark circle */}
          <circle cx="200" cy="100" r="90" fill="none" className="stroke-border" strokeWidth="1" strokeDasharray="6 4" />
        </svg>
        <div className="text-center">
          <p className="text-sm font-semibold text-muted-foreground">Physics Analysis Pending</p>
          <p className="text-xs text-muted-foreground mt-1">Speed, force, and energy calculations are not yet available for this claim.</p>
          <p className="text-xs text-muted-foreground mt-0.5">Re-run the AI assessment to generate the impact vector diagram.</p>
        </div>
      </div>
    );
  }

  // Scale arrow length: 50px minimum, 120px max, proportional to force
  const arrowLen = Math.min(120, Math.max(50, impactForceKn * 0.9));

  // Vehicle center in SVG
  const cx = 200, cy = 200;

  // Arrow start point (outside vehicle, pointing inward)
  const rad = (angle - 90) * (Math.PI / 180);
  const arrowStartX = cx + Math.cos(rad) * (arrowLen + 80);
  const arrowStartY = cy + Math.sin(rad) * (arrowLen + 80);
  const arrowEndX = cx + Math.cos(rad) * 80;
  const arrowEndY = cy + Math.sin(rad) * 80;

  // Impact zone highlight position
  const impactZoneX = cx + Math.cos(rad) * 60;
  const impactZoneY = cy + Math.sin(rad) * 60;

  // Zone colors
  const zoneColor = (zone: string) => {
    if (zones.has(zone) || damagedZones.some(z => z.toLowerCase().includes(zone))) {
      return severity.color;
    }
    return "currentColor";
  };
  const zoneOpacity = (zone: string) =>
    zones.has(zone) || damagedZones.some(z => z.toLowerCase().includes(zone)) ? 0.4 : 0.06;

  // Arrow stroke width based on force
  const arrowStroke = Math.min(5, Math.max(2.5, impactForceKn / 25));

  return (
    <div className="flex flex-col xl:flex-row gap-6 items-start">
      {/* SVG Diagram — larger and more prominent */}
      <div className="relative shrink-0 w-full xl:w-auto flex justify-center">
        <svg
          viewBox="0 0 400 400"
          className="w-full max-w-[400px] h-auto"
          role="img"
          aria-label={`Impact vector diagram: ${impactDirection} collision at ${estimatedSpeedKmh} km/h, ${impactForceKn} kN`}
        >
          <defs>
            {/* Impact glow gradient — severity coloured */}
            <radialGradient id="impactGlowEnhanced" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={severity.color} stopOpacity="0.6" />
              <stop offset="50%" stopColor={severity.color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={severity.color} stopOpacity="0" />
            </radialGradient>
            {/* Arrow marker */}
            <marker id="arrowHeadEnhanced" markerWidth="12" markerHeight="8" refX="11" refY="4" orient="auto">
              <polygon points="0 0, 12 4, 0 8" fill={severity.color} />
            </marker>
            {/* Outer ring gradient */}
            <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={severity.ringColor} stopOpacity="0.3" />
              <stop offset="50%" stopColor={severity.ringColor} stopOpacity="0.1" />
              <stop offset="100%" stopColor={severity.ringColor} stopOpacity="0.3" />
            </linearGradient>
            {/* Vehicle body gradient */}
            <linearGradient id="vehicleBodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" className="[stop-color:var(--color-muted)]" stopOpacity="0.8" />
              <stop offset="100%" className="[stop-color:var(--color-muted)]" stopOpacity="0.4" />
            </linearGradient>
          </defs>

          {/* Background grid — subtle engineering paper effect */}
          <g opacity="0.15">
            {Array.from({ length: 9 }, (_, i) => (
              <line key={`h${i}`} x1="20" y1={40 + i * 40} x2="380" y2={40 + i * 40} className="stroke-border" strokeWidth="0.5" />
            ))}
            {Array.from({ length: 9 }, (_, i) => (
              <line key={`v${i}`} x1={40 + i * 40} y1="20" x2={40 + i * 40} y2="380" className="stroke-border" strokeWidth="0.5" />
            ))}
          </g>

          {/* Severity ring around vehicle */}
          <circle cx={cx} cy={cy} r="95" fill="none" stroke="url(#ringGrad)" strokeWidth="2" strokeDasharray="6 4" />

          {/* Vehicle body — top-down silhouette */}
          <g transform={`translate(${cx}, ${cy})`}>
            {/* Body outline — larger */}
            <rect x="-38" y="-70" width="76" height="140" rx="15" ry="15"
              fill="url(#vehicleBodyGrad)" className="stroke-border" strokeWidth="1.5" />
            {/* Windshield */}
            <path d="M-30,-48 L30,-48 L26,-28 L-26,-28 Z"
              className="fill-background/70 stroke-border" strokeWidth="1" />
            {/* Rear window */}
            <path d="M-28,32 L28,32 L26,50 L-26,50 Z"
              className="fill-background/70 stroke-border" strokeWidth="1" />
            {/* Wheels */}
            <rect x="-45" y="-52" width="10" height="22" rx="4" className="fill-foreground/25" />
            <rect x="35" y="-52" width="10" height="22" rx="4" className="fill-foreground/25" />
            <rect x="-45" y="30" width="10" height="22" rx="4" className="fill-foreground/25" />
            <rect x="35" y="30" width="10" height="22" rx="4" className="fill-foreground/25" />

            {/* Zone highlights */}
            <rect x="-35" y="-68" width="70" height="30" rx="12"
              fill={zoneColor("front")} opacity={zoneOpacity("front")} />
            <rect x="-35" y="38" width="70" height="30" rx="12"
              fill={zoneColor("rear")} opacity={zoneOpacity("rear")} />
            <rect x="-38" y="-38" width="18" height="76" rx="6"
              fill={zoneColor("left")} opacity={zoneOpacity("left")} />
            <rect x="20" y="-38" width="18" height="76" rx="6"
              fill={zoneColor("right")} opacity={zoneOpacity("right")} />

            {/* Direction indicator (small triangle at front) */}
            <polygon points="0,-66 -7,-58 7,-58" className="fill-primary/50" />
          </g>

          {/* Impact glow at contact point — larger */}
          <circle cx={impactZoneX} cy={impactZoneY} r="45" fill="url(#impactGlowEnhanced)" />

          {/* Secondary ripple ring */}
          <circle cx={impactZoneX} cy={impactZoneY} r="35" fill="none" stroke={severity.color} strokeWidth="1" strokeOpacity="0.2" strokeDasharray="4 3" />

          {/* Force vector arrow */}
          <line
            x1={arrowStartX} y1={arrowStartY}
            x2={arrowEndX} y2={arrowEndY}
            stroke={severity.color}
            strokeWidth={arrowStroke}
            markerEnd="url(#arrowHeadEnhanced)"
            strokeLinecap="round"
          />

          {/* Force label at arrow start */}
          <text
            x={arrowStartX + Math.cos(rad + Math.PI / 2) * 16}
            y={arrowStartY + Math.sin(rad + Math.PI / 2) * 16}
            fill={severity.color}
            fontSize="12"
            fontWeight="700"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {impactForceKn.toFixed(1)} kN
          </text>

          {/* Speed badge — top left */}
          <rect x="12" y="12" width="90" height="32" rx="6" className="fill-card stroke-border" strokeWidth="1" />
          <text x="57" y="24" className="fill-foreground" fontSize="10" fontWeight="600" textAnchor="middle" dominantBaseline="middle">
            {estimatedSpeedKmh.toFixed(0)} km/h
          </text>
          <text x="57" y="36" className="fill-muted-foreground" fontSize="8" textAnchor="middle" dominantBaseline="middle">
            IMPACT SPEED
          </text>

          {/* Direction badge — bottom left */}
          <rect x="12" y="356" width="90" height="32" rx="6" className="fill-card stroke-border" strokeWidth="1" />
          <text x="57" y="368" className="fill-foreground" fontSize="10" fontWeight="600" textAnchor="middle" dominantBaseline="middle">
            {impactDirection}
          </text>
          <text x="57" y="380" className="fill-muted-foreground" fontSize="8" textAnchor="middle" dominantBaseline="middle">
            DIRECTION
          </text>

          {/* Angle badge — top right */}
          <rect x="298" y="12" width="90" height="32" rx="6" className="fill-card stroke-border" strokeWidth="1" />
          <text x="343" y="24" className="fill-foreground" fontSize="10" fontWeight="600" textAnchor="middle" dominantBaseline="middle">
            {angle}°
          </text>
          <text x="343" y="36" className="fill-muted-foreground" fontSize="8" textAnchor="middle" dominantBaseline="middle">
            ANGLE
          </text>

          {/* Severity badge — bottom right */}
          <rect x="298" y="356" width="90" height="32" rx="6" fill={severity.color} fillOpacity="0.15" stroke={severity.color} strokeWidth="1" strokeOpacity="0.4" />
          <text x="343" y="372" fill={severity.color} fontSize="10" fontWeight="700" textAnchor="middle" dominantBaseline="middle">
            {severity.label.toUpperCase()}
          </text>
        </svg>
      </div>

      {/* Data panel */}
      <div className="flex-1 min-w-0 space-y-3">
        {/* Primary metrics */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Impact Speed", value: `${estimatedSpeedKmh.toFixed(1)} km/h`, highlight: estimatedSpeedKmh > 60 },
            { label: "Delta-V", value: `${deltaVKmh.toFixed(1)} km/h`, highlight: deltaVKmh > 30 },
            { label: "Impact Force", value: `${impactForceKn.toFixed(1)} kN`, highlight: impactForceKn > 50 },
            { label: "Energy Dissipated", value: `${energyKj.toFixed(1)} kJ`, highlight: energyKj > 100 },
          ].map(({ label, value, highlight }) => (
            <div key={label} className={`rounded-lg border px-3 py-2.5 ${highlight ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30" : "border-border bg-muted/20"}`}>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
              <p className={`text-lg font-bold tabular-nums ${highlight ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Direction & angle */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Direction</p>
            <p className="text-sm font-bold text-foreground">{impactDirection}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Impact Angle</p>
            <p className="text-sm font-bold text-foreground">{angle}°</p>
          </div>
        </div>

        {/* Severity classification */}
        <div className={`rounded-lg border px-4 py-3 ${
          estimatedSpeedKmh > 80 ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30" :
          estimatedSpeedKmh > 40 ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30" :
          "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
        }`}>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Severity Classification</p>
          <p className={`text-base font-bold ${
            estimatedSpeedKmh > 80 ? "text-red-600 dark:text-red-400" :
            estimatedSpeedKmh > 40 ? "text-amber-600 dark:text-amber-400" :
            "text-green-600 dark:text-green-400"
          }`}>
            {severity.label.toUpperCase()}
            {" — "}
            {estimatedSpeedKmh > 80 ? "High-energy impact, structural damage likely" :
             estimatedSpeedKmh > 40 ? "Moderate impact, check structural components" :
             "Low-energy impact, cosmetic damage expected"}
          </p>
        </div>

        {/* Damaged zones summary */}
        {damagedZones.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Affected Zones</p>
            <div className="flex flex-wrap gap-2">
              {damagedZones.map((zone) => (
                <span key={zone} className="text-xs font-semibold px-2.5 py-1 rounded-full border border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                  {zone}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
