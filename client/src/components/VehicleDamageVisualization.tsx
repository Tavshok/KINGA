import { useState } from "react";

interface VehicleDamageVisualizationProps {
  damagedComponents: string[];
  accidentType?: string;
}

export default function VehicleDamageVisualization({ damagedComponents, accidentType }: VehicleDamageVisualizationProps) {
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);

  // Map components to vehicle zones
  const componentToZone: Record<string, string[]> = {
    "front": ["bumper", "fender", "headlight", "hood", "grille", "radiator"],
    "rear": ["trunk", "taillight", "rear bumper", "rear fender"],
    "left_side": ["left door", "left fender", "left mirror", "left quarter panel"],
    "right_side": ["right door", "right fender", "right mirror", "right quarter panel"],
    "roof": ["roof", "sunroof", "pillar"],
    "windshield": ["windshield", "front glass"],
    "rear_glass": ["rear windshield", "rear glass"],
  };

  // Determine which zones are damaged
  const damagedZones = new Set<string>();
  damagedComponents.forEach(component => {
    const lowerComp = component.toLowerCase();
    Object.entries(componentToZone).forEach(([zone, keywords]) => {
      if (keywords.some(keyword => lowerComp.includes(keyword))) {
        damagedZones.add(zone);
      }
    });
  });

  // Also highlight zones based on accident type
  if (accidentType === "frontal") {
    damagedZones.add("front");
  } else if (accidentType === "rear") {
    damagedZones.add("rear");
  } else if (accidentType?.includes("side_driver")) {
    damagedZones.add("left_side");
  } else if (accidentType?.includes("side_passenger")) {
    damagedZones.add("right_side");
  } else if (accidentType === "rollover") {
    damagedZones.add("roof");
  }

  const getZoneColor = (zone: string) => {
    if (damagedZones.has(zone)) {
      return hoveredZone === zone ? "#dc2626" : "#f87171"; // red-600 : red-400
    }
    return hoveredZone === zone ? "#e5e7eb" : "#f3f4f6"; // gray-200 : gray-100
  };

  const getZoneOpacity = (zone: string) => {
    if (damagedZones.has(zone)) {
      return hoveredZone === zone ? 0.9 : 0.7;
    }
    return hoveredZone === zone ? 0.5 : 0.3;
  };

  const getComponentsForZone = (zone: string): string[] => {
    return damagedComponents.filter(comp => {
      const lowerComp = comp.toLowerCase();
      return componentToZone[zone]?.some(keyword => lowerComp.includes(keyword));
    });
  };

  return (
    <div className="relative">
      <svg
        viewBox="0 0 400 600"
        className="w-full h-auto max-w-md mx-auto"
        style={{ filter: "drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1))" }}
      >
        {/* Vehicle Outline */}
        <rect
          x="100"
          y="50"
          width="200"
          height="500"
          rx="20"
          fill="none"
          stroke="#374151"
          strokeWidth="3"
        />

        {/* Front Zone */}
        <path
          d="M 100 50 Q 200 30 300 50 L 300 120 L 100 120 Z"
          fill={getZoneColor("front")}
          fillOpacity={getZoneOpacity("front")}
          stroke={damagedZones.has("front") ? "#dc2626" : "#9ca3af"}
          strokeWidth="2"
          onMouseEnter={() => setHoveredZone("front")}
          onMouseLeave={() => setHoveredZone(null)}
          className="cursor-pointer transition-all"
        />
        <text x="200" y="85" textAnchor="middle" fontSize="14" fill="#374151" fontWeight="600">
          Front
        </text>

        {/* Windshield */}
        <rect
          x="120"
          y="130"
          width="160"
          height="60"
          rx="5"
          fill={getZoneColor("windshield")}
          fillOpacity={getZoneOpacity("windshield")}
          stroke={damagedZones.has("windshield") ? "#dc2626" : "#9ca3af"}
          strokeWidth="2"
          onMouseEnter={() => setHoveredZone("windshield")}
          onMouseLeave={() => setHoveredZone(null)}
          className="cursor-pointer transition-all"
        />
        <text x="200" y="165" textAnchor="middle" fontSize="12" fill="#374151">
          Windshield
        </text>

        {/* Left Side */}
        <rect
          x="100"
          y="200"
          width="40"
          height="200"
          rx="5"
          fill={getZoneColor("left_side")}
          fillOpacity={getZoneOpacity("left_side")}
          stroke={damagedZones.has("left_side") ? "#dc2626" : "#9ca3af"}
          strokeWidth="2"
          onMouseEnter={() => setHoveredZone("left_side")}
          onMouseLeave={() => setHoveredZone(null)}
          className="cursor-pointer transition-all"
        />
        <text
          x="120"
          y="305"
          textAnchor="middle"
          fontSize="12"
          fill="#374151"
          transform="rotate(-90 120 305)"
        >
          Left Side
        </text>

        {/* Right Side */}
        <rect
          x="260"
          y="200"
          width="40"
          height="200"
          rx="5"
          fill={getZoneColor("right_side")}
          fillOpacity={getZoneOpacity("right_side")}
          stroke={damagedZones.has("right_side") ? "#dc2626" : "#9ca3af"}
          strokeWidth="2"
          onMouseEnter={() => setHoveredZone("right_side")}
          onMouseLeave={() => setHoveredZone(null)}
          className="cursor-pointer transition-all"
        />
        <text
          x="280"
          y="295"
          textAnchor="middle"
          fontSize="12"
          fill="#374151"
          transform="rotate(90 280 295)"
        >
          Right Side
        </text>

        {/* Roof */}
        <rect
          x="150"
          y="220"
          width="100"
          height="160"
          rx="5"
          fill={getZoneColor("roof")}
          fillOpacity={getZoneOpacity("roof")}
          stroke={damagedZones.has("roof") ? "#dc2626" : "#9ca3af"}
          strokeWidth="2"
          onMouseEnter={() => setHoveredZone("roof")}
          onMouseLeave={() => setHoveredZone(null)}
          className="cursor-pointer transition-all"
        />
        <text x="200" y="305" textAnchor="middle" fontSize="12" fill="#374151">
          Roof
        </text>

        {/* Rear Glass */}
        <rect
          x="120"
          y="410"
          width="160"
          height="60"
          rx="5"
          fill={getZoneColor("rear_glass")}
          fillOpacity={getZoneOpacity("rear_glass")}
          stroke={damagedZones.has("rear_glass") ? "#dc2626" : "#9ca3af"}
          strokeWidth="2"
          onMouseEnter={() => setHoveredZone("rear_glass")}
          onMouseLeave={() => setHoveredZone(null)}
          className="cursor-pointer transition-all"
        />
        <text x="200" y="445" textAnchor="middle" fontSize="12" fill="#374151">
          Rear Glass
        </text>

        {/* Rear Zone */}
        <path
          d="M 100 480 L 100 550 Q 200 570 300 550 L 300 480 Z"
          fill={getZoneColor("rear")}
          fillOpacity={getZoneOpacity("rear")}
          stroke={damagedZones.has("rear") ? "#dc2626" : "#9ca3af"}
          strokeWidth="2"
          onMouseEnter={() => setHoveredZone("rear")}
          onMouseLeave={() => setHoveredZone(null)}
          className="cursor-pointer transition-all"
        />
        <text x="200" y="525" textAnchor="middle" fontSize="14" fill="#374151" fontWeight="600">
          Rear
        </text>
      </svg>

      {/* Hover Tooltip */}
      {hoveredZone && (
        <div className="mt-4 p-3 bg-white rounded-lg border-2 border-gray-300 shadow-lg">
          <p className="font-semibold text-sm capitalize mb-1">
            {hoveredZone.replace("_", " ")} Zone
          </p>
          {damagedZones.has(hoveredZone) ? (
            <div>
              <p className="text-xs text-red-600 font-medium mb-1">⚠️ Damage Detected</p>
              <div className="space-y-1">
                {getComponentsForZone(hoveredZone).map((comp, idx) => (
                  <p key={idx} className="text-xs text-gray-700 capitalize">
                    • {comp}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-600">No damage detected</p>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex items-center justify-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-400 rounded"></div>
          <span className="text-xs text-gray-700">Damaged</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-100 rounded border border-gray-300"></div>
          <span className="text-xs text-gray-700">No Damage</span>
        </div>
      </div>
    </div>
  );
}
