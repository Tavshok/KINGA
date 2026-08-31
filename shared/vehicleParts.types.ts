/**
 * KINGA Vehicle Parts Taxonomy
 * 
 * Comprehensive mapping of vehicle components, sub-components, and their
 * physical zones on the vehicle body. Uses South African automotive terminology
 * alongside international naming conventions.
 * 
 * Each part belongs to a zone (front, rear, left_side, right_side, roof,
 * windshield, rear_glass, undercarriage) and may have sub-parts for
 * granular damage reporting.
 */

// ─── Zone Definitions ────────────────────────────────────────────────

export type VehicleZone =
  | "front"
  | "rear"
  | "left_side"
  | "right_side"
  | "roof"
  | "windshield"
  | "rear_glass"
  | "undercarriage"
  | "powertrain"
  | "suspension"
  | "brakes"
  | "electrical"
  | "interior"
  | "cooling";

export const ZONE_LABELS: Record<VehicleZone, string> = {
  front: "Front End",
  rear: "Rear End",
  left_side: "Left Side (Driver)",
  right_side: "Right Side (Passenger)",
  roof: "Roof / Cabin",
  windshield: "Windshield",
  rear_glass: "Rear Glass",
  undercarriage: "Undercarriage / Chassis",
  powertrain: "Powertrain / Drivetrain",
  suspension: "Suspension & Steering",
  brakes: "Brakes",
  electrical: "Electrical & ADAS",
  interior: "Interior",
  cooling: "Cooling & HVAC",
};

// ─── Part Definition ─────────────────────────────────────────────────

export interface VehicleSubPart {
  id: string;
  name: string;
  /** South African / common alternative names */
  aliases: string[];
  /** Typical repair action */
  defaultAction: "repair" | "replace" | "refinish";
  /** Is this a structural / safety-critical part? */
  structural: boolean;
}

export interface VehiclePart {
  id: string;
  name: string;
  /** South African / common alternative names */
  aliases: string[];
  zone: VehicleZone;
  /** Sub-components that belong to this part */
  subParts: VehicleSubPart[];
  /** Is this a structural / safety-critical part? */
  structural: boolean;
  /** Typical cost tier: low < R5k, medium R5-15k, high > R15k */
  costTier: "low" | "medium" | "high";
}

