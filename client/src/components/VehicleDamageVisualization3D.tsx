/**
 * VehicleDamageVisualization3D
 * 
 * Interactive 3D vehicle model with:
 * - Rotatable/zoomable view (OrbitControls)
 * - Heat-mapped damage zones with severity coloring
 * - Impact direction arrows
 * - Clickable zones showing part details
 * - Cross-validation status indicators
 * - Legend and severity scale
 */

import { useRef, useState, useMemo, useCallback } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Text, Html, Environment } from "@react-three/drei";
import * as THREE from "three";
import type { VehicleZone } from "../../../shared/vehicleParts";
import { ZONE_LABELS } from "../../../shared/vehicleParts";

// ─── Types ───────────────────────────────────────────────────────────

interface DamageZoneData {
  zone: VehicleZone;
  severity: number; // 0-10
  level: "Minor" | "Moderate" | "Severe" | "Critical";
  components: string[];
  repairCost: number;
  /** Cross-validation status */
  validationStatus?: "confirmed" | "quoted_not_visible" | "visible_not_quoted" | "mixed";
}

interface ImpactData {
  direction: "front" | "rear" | "left" | "right" | "top" | "multi";
  speed?: number;
  force?: number;
}

interface Props {
  damageZones: DamageZoneData[];
  impactData?: ImpactData;
  vehicleType?: "sedan" | "suv" | "bakkie" | "hatchback";
  onZoneClick?: (zone: VehicleZone) => void;
  selectedZone?: VehicleZone | null;
  height?: number;
}

// ─── Color Utilities ─────────────────────────────────────────────────

function getSeverityColor(severity: number): THREE.Color {
  if (severity >= 8) return new THREE.Color(0xdc2626); // Critical - red
  if (severity >= 6) return new THREE.Color(0xf97316); // Severe - orange
  if (severity >= 4) return new THREE.Color(0xeab308); // Moderate - yellow
  if (severity >= 1) return new THREE.Color(0x22c55e); // Minor - green
  return new THREE.Color(0x94a3b8); // Undamaged - slate
}

function getValidationColor(status?: string): string {
  switch (status) {
    case "confirmed": return "#22c55e";
    case "quoted_not_visible": return "#ef4444";
    case "visible_not_quoted": return "#f59e0b";
    case "mixed": return "#8b5cf6";
    default: return "#94a3b8";
  }
}

function getValidationLabel(status?: string): string {
  switch (status) {
    case "confirmed": return "✓ Confirmed in Photos";
    case "quoted_not_visible": return "⚠ Quoted but Not Visible";
    case "visible_not_quoted": return "! Visible but Not Quoted";
    case "mixed": return "◐ Mixed Validation";
    default: return "— No Data";
  }
}

// ─── Vehicle Body Geometry ───────────────────────────────────────────

/**
 * Creates a simplified but recognizable vehicle body shape using
 * merged box geometries for each zone.
 */

interface ZoneGeometry {
  zone: VehicleZone;
  position: [number, number, number];
  size: [number, number, number];
  label: string;
  labelOffset: [number, number, number];
}

function getVehicleGeometry(vehicleType: string): ZoneGeometry[] {
  // Base dimensions (length x height x width) in Three.js units
  // Vehicle faces along +Z axis (front), -Z axis (rear)
  const isLong = vehicleType === "bakkie" || vehicleType === "suv";
  const bodyLength = isLong ? 5.0 : 4.4;
  const bodyWidth = 1.85;
  const bodyHeight = vehicleType === "suv" ? 1.0 : 0.8;
  const cabinHeight = vehicleType === "suv" ? 0.85 : 0.7;
  const groundClearance = vehicleType === "suv" || vehicleType === "bakkie" ? 0.35 : 0.2;
  const halfLen = bodyLength / 2;

  return [
    // Front end (bumper + grille + headlights)
    {
      zone: "front",
      position: [0, groundClearance + bodyHeight / 2, halfLen - 0.35],
      size: [bodyWidth, bodyHeight * 0.7, 0.7],
      label: "Front End",
      labelOffset: [0, 0.6, 0.5],
    },
    // Rear end (bumper + tail lights + boot/tailgate)
    {
      zone: "rear",
      position: [0, groundClearance + bodyHeight / 2, -(halfLen - 0.35)],
      size: [bodyWidth, bodyHeight * 0.7, 0.7],
      label: "Rear End",
      labelOffset: [0, 0.6, -0.5],
    },
    // Left side (doors + quarter panels + sills)
    {
      zone: "left_side",
      position: [-(bodyWidth / 2 + 0.02), groundClearance + bodyHeight / 2 + 0.15, 0],
      size: [0.12, bodyHeight + cabinHeight * 0.5, bodyLength * 0.65],
      label: "Left Side",
      labelOffset: [-0.5, 0.3, 0],
    },
    // Right side
    {
      zone: "right_side",
      position: [(bodyWidth / 2 + 0.02), groundClearance + bodyHeight / 2 + 0.15, 0],
      size: [0.12, bodyHeight + cabinHeight * 0.5, bodyLength * 0.65],
      label: "Right Side",
      labelOffset: [0.5, 0.3, 0],
    },
    // Roof / cabin
    {
      zone: "roof",
      position: [0, groundClearance + bodyHeight + cabinHeight / 2, 0.2],
      size: [bodyWidth * 0.88, cabinHeight, bodyLength * 0.45],
      label: "Roof / Cabin",
      labelOffset: [0, 0.55, 0],
    },
    // Windshield
    {
      zone: "windshield",
      position: [0, groundClearance + bodyHeight + cabinHeight * 0.3, bodyLength * 0.18],
      size: [bodyWidth * 0.85, cabinHeight * 0.7, 0.08],
      label: "Windshield",
      labelOffset: [0, 0.5, 0.3],
    },
    // Rear glass
    {
      zone: "rear_glass",
      position: [0, groundClearance + bodyHeight + cabinHeight * 0.3, -(bodyLength * 0.12)],
      size: [bodyWidth * 0.82, cabinHeight * 0.6, 0.08],
      label: "Rear Glass",
      labelOffset: [0, 0.5, -0.3],
    },
    // Undercarriage
    {
      zone: "undercarriage",
      position: [0, groundClearance / 2, 0],
      size: [bodyWidth * 0.9, groundClearance * 0.6, bodyLength * 0.85],
      label: "Undercarriage",
      labelOffset: [0, -0.4, 0],
    },
  ];
}

// ─── Vehicle Zone Mesh ───────────────────────────────────────────────

interface ZoneMeshProps {
  geometry: ZoneGeometry;
  damageData?: DamageZoneData;
  isSelected: boolean;
  onSelect: (zone: VehicleZone) => void;
  isHovered: boolean;
  onHover: (zone: VehicleZone | null) => void;
}

function ZoneMesh({ geometry, damageData, isSelected, onSelect, isHovered, onHover }: ZoneMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const severity = damageData?.severity || 0;
  const hasDamage = severity > 0;

  const baseColor = useMemo(() => getSeverityColor(severity), [severity]);

  const material = useMemo(() => {
    const mat = new THREE.MeshPhysicalMaterial({
      color: baseColor,
      transparent: true,
      opacity: hasDamage ? 0.85 : 0.25,
      roughness: 0.4,
      metalness: hasDamage ? 0.1 : 0.3,
      clearcoat: 0.3,
      side: THREE.DoubleSide,
    });
    return mat;
  }, [baseColor, hasDamage]);

  // Pulse animation for damaged zones
  useFrame((_, delta) => {
    if (meshRef.current && hasDamage) {
      const scale = isSelected ? 1.04 : isHovered ? 1.02 : 1.0;
      meshRef.current.scale.lerp(new THREE.Vector3(scale, scale, scale), delta * 5);

      // Pulse opacity for critical damage
      if (severity >= 8) {
        const pulse = Math.sin(Date.now() * 0.003) * 0.1 + 0.85;
        (meshRef.current.material as THREE.MeshPhysicalMaterial).opacity = pulse;
      }
    }
  });

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(geometry.zone);
  }, [geometry.zone, onSelect]);

  const handlePointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onHover(geometry.zone);
    document.body.style.cursor = "pointer";
  }, [geometry.zone, onHover]);

  const handlePointerOut = useCallback(() => {
    onHover(null);
    document.body.style.cursor = "default";
  }, [onHover]);

  return (
    <group>
      <mesh
        ref={meshRef}
        position={geometry.position}
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        material={material}
      >
        <boxGeometry args={geometry.size} />
        {/* Selection wireframe */}
        {isSelected && (
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(...geometry.size)]} />
            <lineBasicMaterial color="#ffffff" linewidth={2} />
          </lineSegments>
        )}
      </mesh>

      {/* Zone label */}
      {(isHovered || isSelected) && (
        <Html
          position={[
            geometry.position[0] + geometry.labelOffset[0],
            geometry.position[1] + geometry.labelOffset[1],
            geometry.position[2] + geometry.labelOffset[2],
          ]}
          center
          distanceFactor={6}
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              background: "rgba(0,0,0,0.85)",
              color: "#fff",
              padding: "6px 12px",
              borderRadius: "6px",
              fontSize: "12px",
              whiteSpace: "nowrap",
              border: `2px solid ${hasDamage ? baseColor.getStyle() : "#64748b"}`,
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 2 }}>{geometry.label}</div>
            {hasDamage ? (
              <>
                <div style={{ color: baseColor.getStyle() }}>
                  Severity: {severity.toFixed(1)}/10 — {damageData?.level}
                </div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>
                  {damageData?.components.length} component(s) • ${(damageData?.repairCost || 0).toLocaleString()}
                </div>
                {damageData?.validationStatus && (
                  <div style={{ fontSize: 11, color: getValidationColor(damageData.validationStatus), marginTop: 2 }}>
                    {getValidationLabel(damageData.validationStatus)}
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: "#94a3b8", fontSize: 11 }}>No damage detected</div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

// ─── Impact Arrow ────────────────────────────────────────────────────

function ImpactArrow({ impactData }: { impactData: ImpactData }) {
  const arrowRef = useRef<THREE.Group>(null);

  const arrowConfig = useMemo(() => {
    const configs: Record<string, { origin: THREE.Vector3; dir: THREE.Vector3; color: number }> = {
      front: { origin: new THREE.Vector3(0, 0.8, 3.5), dir: new THREE.Vector3(0, 0, -1), color: 0xff4444 },
      rear: { origin: new THREE.Vector3(0, 0.8, -3.5), dir: new THREE.Vector3(0, 0, 1), color: 0xff4444 },
      left: { origin: new THREE.Vector3(-2.5, 0.8, 0), dir: new THREE.Vector3(1, 0, 0), color: 0xff4444 },
      right: { origin: new THREE.Vector3(2.5, 0.8, 0), dir: new THREE.Vector3(-1, 0, 0), color: 0xff4444 },
      top: { origin: new THREE.Vector3(0, 3, 0), dir: new THREE.Vector3(0, -1, 0), color: 0xff4444 },
    };
    return configs[impactData.direction] || configs.front;
  }, [impactData.direction]);

  // Animate arrow pulsing
  useFrame(() => {
    if (arrowRef.current) {
      const pulse = Math.sin(Date.now() * 0.004) * 0.15;
      arrowRef.current.position.copy(arrowConfig.origin);
      if (impactData.direction === "front") arrowRef.current.position.z += pulse;
      else if (impactData.direction === "rear") arrowRef.current.position.z -= pulse;
      else if (impactData.direction === "left") arrowRef.current.position.x -= pulse;
      else if (impactData.direction === "right") arrowRef.current.position.x += pulse;
      else if (impactData.direction === "top") arrowRef.current.position.y += pulse;
    }
  });

  const arrowLength = 1.5;
  const headLength = 0.4;
  const headWidth = 0.25;

  return (
    <group ref={arrowRef} position={arrowConfig.origin.toArray()}>
      <arrowHelper
        args={[
          arrowConfig.dir,
          new THREE.Vector3(0, 0, 0),
          arrowLength,
          arrowConfig.color,
          headLength,
          headWidth,
        ]}
      />
      {/* Speed label */}
      {impactData.speed && (
        <Html position={[0, 0.4, 0]} center style={{ pointerEvents: "none" }}>
          <div
            style={{
              background: "rgba(220,38,38,0.9)",
              color: "#fff",
              padding: "3px 8px",
              borderRadius: "4px",
              fontSize: "11px",
              fontWeight: 700,
              fontFamily: "Inter, system-ui, sans-serif",
              whiteSpace: "nowrap",
            }}
          >
            {impactData.speed} km/h
            {impactData.force ? ` • ${impactData.force} kN` : ""}
          </div>
        </Html>
      )}
    </group>
  );
}

// ─── Multi-Impact Arrows ─────────────────────────────────────────────

function MultiImpactArrows({ impactData }: { impactData: ImpactData }) {
  if (impactData.direction !== "multi") {
    return <ImpactArrow impactData={impactData} />;
  }

  // Show arrows from multiple directions
  return (
    <>
      <ImpactArrow impactData={{ ...impactData, direction: "front" }} />
      <ImpactArrow impactData={{ ...impactData, direction: "rear" }} />
    </>
  );
}

// ─── Vehicle Wireframe (car outline) ─────────────────────────────────

function VehicleWireframe({ vehicleType }: { vehicleType: string }) {
  const isLong = vehicleType === "bakkie" || vehicleType === "suv";
  const bodyLength = isLong ? 5.0 : 4.4;
  const bodyWidth = 1.85;
  const bodyHeight = vehicleType === "suv" ? 1.0 : 0.8;
  const cabinHeight = vehicleType === "suv" ? 0.85 : 0.7;
  const gc = vehicleType === "suv" || vehicleType === "bakkie" ? 0.35 : 0.2;
  const halfLen = bodyLength / 2;

  return (
    <group>
      {/* Main body wireframe */}
      <lineSegments position={[0, gc + bodyHeight / 2, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyLength * 0.9)]} />
        <lineBasicMaterial color="#475569" transparent opacity={0.4} />
      </lineSegments>

      {/* Cabin wireframe */}
      <lineSegments position={[0, gc + bodyHeight + cabinHeight / 2, 0.2]}>
        <edgesGeometry args={[new THREE.BoxGeometry(bodyWidth * 0.88, cabinHeight, bodyLength * 0.45)]} />
        <lineBasicMaterial color="#475569" transparent opacity={0.3} />
      </lineSegments>

      {/* Wheels */}
      {[
        [-(bodyWidth / 2 - 0.1), gc * 0.7, halfLen - 0.8],
        [(bodyWidth / 2 - 0.1), gc * 0.7, halfLen - 0.8],
        [-(bodyWidth / 2 - 0.1), gc * 0.7, -(halfLen - 0.9)],
        [(bodyWidth / 2 - 0.1), gc * 0.7, -(halfLen - 0.9)],
      ].map((pos, i) => (
        <mesh key={`wheel-${i}`} position={pos as [number, number, number]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.32, 0.12, 8, 16]} />
          <meshStandardMaterial color="#1e293b" roughness={0.8} />
        </mesh>
      ))}

      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial color="#0f172a" transparent opacity={0.3} />
      </mesh>

      {/* Ground grid */}
      <gridHelper args={[8, 16, "#1e293b", "#1e293b"]} position={[0, 0, 0]} />
    </group>
  );
}

// ─── 3D Scene ────────────────────────────────────────────────────────

interface SceneProps {
  damageZones: DamageZoneData[];
  impactData?: ImpactData;
  vehicleType: string;
  selectedZone: VehicleZone | null;
  onZoneSelect: (zone: VehicleZone) => void;
}

function Scene({ damageZones, impactData, vehicleType, selectedZone, onZoneSelect }: SceneProps) {
  const [hoveredZone, setHoveredZone] = useState<VehicleZone | null>(null);
  const zoneGeometries = useMemo(() => getVehicleGeometry(vehicleType), [vehicleType]);

  const damageMap = useMemo(() => {
    const map = new Map<VehicleZone, DamageZoneData>();
    for (const dz of damageZones) {
      map.set(dz.zone, dz);
    }
    return map;
  }, [damageZones]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 8, 5]} intensity={0.8} castShadow />
      <directionalLight position={[-3, 4, -3]} intensity={0.3} />
      <pointLight position={[0, 5, 0]} intensity={0.2} />

      {/* Environment for reflections */}
      <Environment preset="city" />

      {/* Vehicle wireframe */}
      <VehicleWireframe vehicleType={vehicleType} />

      {/* Damage zone meshes */}
      {zoneGeometries.map((geo) => (
        <ZoneMesh
          key={geo.zone}
          geometry={geo}
          damageData={damageMap.get(geo.zone)}
          isSelected={selectedZone === geo.zone}
          onSelect={onZoneSelect}
          isHovered={hoveredZone === geo.zone}
          onHover={setHoveredZone}
        />
      ))}

      {/* Impact arrows */}
      {impactData && <MultiImpactArrows impactData={impactData} />}

      {/* Camera controls */}
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={3}
        maxDistance={12}
        autoRotate={!selectedZone && !hoveredZone}
        autoRotateSpeed={0.5}
        target={[0, 0.7, 0]}
      />
    </>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

export default function VehicleDamageVisualization3D({
  damageZones,
  impactData,
  vehicleType = "sedan",
  onZoneClick,
  selectedZone: externalSelectedZone,
  height = 500,
}: Props) {
  const [internalSelectedZone, setInternalSelectedZone] = useState<VehicleZone | null>(null);
  const selectedZone = externalSelectedZone !== undefined ? externalSelectedZone : internalSelectedZone;

  const handleZoneSelect = useCallback(
    (zone: VehicleZone) => {
      setInternalSelectedZone((prev) => (prev === zone ? null : zone));
      onZoneClick?.(zone);
    },
    [onZoneClick]
  );

  const selectedData = damageZones.find((dz) => dz.zone === selectedZone);
  const totalDamage = damageZones.reduce((sum, dz) => sum + dz.repairCost, 0);
  const maxSeverity = Math.max(...damageZones.map((dz) => dz.severity), 0);

  return (
    <div className="relative rounded-lg overflow-hidden bg-slate-950 border border-slate-800">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/80 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            3D Damage Visualization
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span>
            {damageZones.filter((dz) => dz.severity > 0).length} zone(s) affected
          </span>
          <span className="text-slate-600">|</span>
          <span>Total: ${totalDamage.toLocaleString()}</span>
          <span className="text-slate-600">|</span>
          <span>
            Peak severity:{" "}
            <span
              style={{
                color:
                  maxSeverity >= 8
                    ? "#dc2626"
                    : maxSeverity >= 6
                    ? "#f97316"
                    : maxSeverity >= 4
                    ? "#eab308"
                    : "#22c55e",
              }}
            >
              {maxSeverity.toFixed(1)}/10
            </span>
          </span>
        </div>
      </div>

      {/* 3D Canvas */}
      <div style={{ height: `${height}px` }}>
        <Canvas
          camera={{ position: [4, 3, 4], fov: 45, near: 0.1, far: 100 }}
          gl={{ antialias: true, alpha: false }}
          style={{ background: "#020617" }}
        >
          <Scene
            damageZones={damageZones}
            impactData={impactData}
            vehicleType={vehicleType}
            selectedZone={selectedZone}
            onZoneSelect={handleZoneSelect}
          />
        </Canvas>
      </div>

      {/* Controls hint */}
      <div className="absolute bottom-16 left-4 text-xs text-slate-500 bg-slate-900/70 px-3 py-1.5 rounded-md">
        🖱 Drag to rotate • Scroll to zoom • Click zone for details
      </div>

      {/* Severity Legend */}
      <div className="absolute top-14 right-4 bg-slate-900/90 border border-slate-700 rounded-lg p-3">
        <div className="text-xs font-semibold text-slate-300 mb-2">Severity Scale</div>
        {[
          { label: "Critical (8-10)", color: "#dc2626" },
          { label: "Severe (6-8)", color: "#f97316" },
          { label: "Moderate (4-6)", color: "#eab308" },
          { label: "Minor (1-4)", color: "#22c55e" },
          { label: "Undamaged", color: "#94a3b8" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2 mb-1">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-slate-400">{item.label}</span>
          </div>
        ))}

        {/* Cross-validation legend */}
        {damageZones.some((dz) => dz.validationStatus) && (
          <>
            <div className="text-xs font-semibold text-slate-300 mt-3 mb-2 pt-2 border-t border-slate-700">
              Validation Status
            </div>
            {[
              { label: "Confirmed", color: "#22c55e", icon: "✓" },
              { label: "Quoted, Not Visible", color: "#ef4444", icon: "⚠" },
              { label: "Visible, Not Quoted", color: "#f59e0b", icon: "!" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 mb-1">
                <span style={{ color: item.color, fontSize: 10, width: 12, textAlign: "center" }}>
                  {item.icon}
                </span>
                <span className="text-xs text-slate-400">{item.label}</span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Selected Zone Detail Panel */}
      {selectedData && (
        <div className="absolute bottom-16 right-4 bg-slate-900/95 border border-slate-700 rounded-lg p-4 max-w-xs">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-bold text-white">
              {ZONE_LABELS[selectedData.zone] || selectedData.zone}
            </h4>
            <span
              className="text-xs font-bold px-2 py-0.5 rounded"
              style={{
                backgroundColor:
                  selectedData.level === "Critical"
                    ? "#dc2626"
                    : selectedData.level === "Severe"
                    ? "#f97316"
                    : selectedData.level === "Moderate"
                    ? "#eab308"
                    : "#22c55e",
                color: selectedData.level === "Moderate" ? "#000" : "#fff",
              }}
            >
              {selectedData.level}
            </span>
          </div>

          <div className="space-y-1.5 text-xs text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-500">Severity Score</span>
              <span className="font-mono">{selectedData.severity.toFixed(1)} / 10</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Repair Cost</span>
              <span className="font-mono">${selectedData.repairCost.toLocaleString()}</span>
            </div>

            {/* Severity bar */}
            <div className="w-full bg-slate-800 rounded-full h-1.5 mt-1">
              <div
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: `${(selectedData.severity / 10) * 100}%`,
                  backgroundColor:
                    selectedData.severity >= 8
                      ? "#dc2626"
                      : selectedData.severity >= 6
                      ? "#f97316"
                      : selectedData.severity >= 4
                      ? "#eab308"
                      : "#22c55e",
                }}
              />
            </div>

            {/* Components list */}
            <div className="mt-2">
              <div className="text-slate-500 mb-1">Damaged Components:</div>
              <div className="flex flex-wrap gap-1">
                {selectedData.components.map((comp, i) => (
                  <span
                    key={i}
                    className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-xs"
                  >
                    {comp}
                  </span>
                ))}
              </div>
            </div>

            {/* Validation status */}
            {selectedData.validationStatus && (
              <div
                className="mt-2 pt-2 border-t border-slate-700 font-semibold"
                style={{ color: getValidationColor(selectedData.validationStatus) }}
              >
                {getValidationLabel(selectedData.validationStatus)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/80 border-t border-slate-800">
        <div className="text-xs text-slate-500">
          Vehicle Type: <span className="text-slate-300 capitalize">{vehicleType}</span>
        </div>
        <div className="flex items-center gap-3">
          {impactData && (
            <div className="text-xs text-slate-500">
              Impact:{" "}
              <span className="text-red-400 capitalize">{impactData.direction}</span>
              {impactData.speed && <span className="text-slate-400"> @ {impactData.speed} km/h</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
