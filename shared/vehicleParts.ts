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
  | "undercarriage";

export const ZONE_LABELS: Record<VehicleZone, string> = {
  front: "Front End",
  rear: "Rear End",
  left_side: "Left Side (Driver)",
  right_side: "Right Side (Passenger)",
  roof: "Roof / Cabin",
  windshield: "Windshield",
  rear_glass: "Rear Glass",
  undercarriage: "Undercarriage / Chassis",
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

// ─── Complete Parts Catalogue ────────────────────────────────────────

export const VEHICLE_PARTS: VehiclePart[] = [
  // ═══════════════════════════════════════════════════════════════════
  // FRONT END
  // ═══════════════════════════════════════════════════════════════════
  {
    id: "front_bumper",
    name: "Front Bumper",
    aliases: ["front bumper cover", "front valance", "bumper bar", "front spoiler"],
    zone: "front",
    structural: false,
    costTier: "medium",
    subParts: [
      { id: "front_bumper_cover", name: "Bumper Cover (Skin)", aliases: ["bumper fascia", "bumper shell"], defaultAction: "replace", structural: false },
      { id: "front_bumper_reinforcement", name: "Bumper Reinforcement Bar", aliases: ["bumper beam", "impact bar", "rebar"], defaultAction: "replace", structural: true },
      { id: "front_bumper_absorber", name: "Energy Absorber", aliases: ["foam absorber", "crash box", "bumper foam"], defaultAction: "replace", structural: true },
      { id: "front_bumper_bracket_l", name: "Bumper Bracket (Left)", aliases: ["bumper mount left"], defaultAction: "replace", structural: false },
      { id: "front_bumper_bracket_r", name: "Bumper Bracket (Right)", aliases: ["bumper mount right"], defaultAction: "replace", structural: false },
      { id: "front_lip_spoiler", name: "Front Lip Spoiler", aliases: ["chin spoiler", "front splitter"], defaultAction: "replace", structural: false },
      { id: "front_tow_hook_cover", name: "Tow Hook Cover", aliases: ["tow eye cover"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "bonnet",
    name: "Bonnet (Hood)",
    aliases: ["hood", "engine cover", "bonnet panel"],
    zone: "front",
    structural: false,
    costTier: "medium",
    subParts: [
      { id: "bonnet_panel", name: "Bonnet Panel", aliases: ["hood panel", "bonnet skin"], defaultAction: "replace", structural: false },
      { id: "bonnet_hinge_l", name: "Bonnet Hinge (Left)", aliases: ["hood hinge left"], defaultAction: "replace", structural: false },
      { id: "bonnet_hinge_r", name: "Bonnet Hinge (Right)", aliases: ["hood hinge right"], defaultAction: "replace", structural: false },
      { id: "bonnet_latch", name: "Bonnet Latch", aliases: ["hood latch", "bonnet lock"], defaultAction: "replace", structural: false },
      { id: "bonnet_insulator", name: "Bonnet Insulator", aliases: ["hood insulation pad"], defaultAction: "replace", structural: false },
      { id: "bonnet_gas_strut", name: "Bonnet Gas Strut", aliases: ["hood strut", "bonnet prop rod"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "headlight_l",
    name: "Headlight Assembly (Left)",
    aliases: ["left headlamp", "driver headlight", "LH headlight"],
    zone: "front",
    structural: false,
    costTier: "medium",
    subParts: [
      { id: "headlight_l_lens", name: "Headlight Lens (Left)", aliases: ["headlamp glass left"], defaultAction: "replace", structural: false },
      { id: "headlight_l_housing", name: "Headlight Housing (Left)", aliases: ["headlamp body left"], defaultAction: "replace", structural: false },
      { id: "headlight_l_bulb", name: "Headlight Bulb (Left)", aliases: ["headlamp globe left", "LED module left"], defaultAction: "replace", structural: false },
      { id: "headlight_l_ballast", name: "Headlight Ballast/LED Driver (Left)", aliases: ["HID ballast left", "xenon module left"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "headlight_r",
    name: "Headlight Assembly (Right)",
    aliases: ["right headlamp", "passenger headlight", "RH headlight"],
    zone: "front",
    structural: false,
    costTier: "medium",
    subParts: [
      { id: "headlight_r_lens", name: "Headlight Lens (Right)", aliases: ["headlamp glass right"], defaultAction: "replace", structural: false },
      { id: "headlight_r_housing", name: "Headlight Housing (Right)", aliases: ["headlamp body right"], defaultAction: "replace", structural: false },
      { id: "headlight_r_bulb", name: "Headlight Bulb (Right)", aliases: ["headlamp globe right", "LED module right"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "grille",
    name: "Front Grille",
    aliases: ["radiator grille", "grill", "front grill"],
    zone: "front",
    structural: false,
    costTier: "low",
    subParts: [
      { id: "grille_upper", name: "Upper Grille", aliases: ["top grille"], defaultAction: "replace", structural: false },
      { id: "grille_lower", name: "Lower Grille", aliases: ["bottom grille", "air dam grille"], defaultAction: "replace", structural: false },
      { id: "grille_emblem", name: "Grille Emblem / Badge", aliases: ["manufacturer badge", "logo"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "radiator",
    name: "Radiator Assembly",
    aliases: ["coolant radiator", "engine radiator"],
    zone: "front",
    structural: false,
    costTier: "medium",
    subParts: [
      { id: "radiator_core", name: "Radiator Core", aliases: ["radiator"], defaultAction: "replace", structural: false },
      { id: "radiator_fan", name: "Radiator Fan", aliases: ["cooling fan", "electric fan"], defaultAction: "replace", structural: false },
      { id: "radiator_support", name: "Radiator Support Panel", aliases: ["rad support", "radiator cradle", "slam panel"], defaultAction: "repair", structural: true },
      { id: "condenser", name: "A/C Condenser", aliases: ["air con condenser", "aircon condenser"], defaultAction: "replace", structural: false },
      { id: "intercooler", name: "Intercooler", aliases: ["charge air cooler"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "front_fender_l",
    name: "Front Fender (Left)",
    aliases: ["left front wing", "LH front fender", "driver front fender", "front mudguard left"],
    zone: "front",
    structural: false,
    costTier: "medium",
    subParts: [
      { id: "front_fender_l_panel", name: "Fender Panel (Left)", aliases: ["wing panel left"], defaultAction: "replace", structural: false },
      { id: "front_fender_l_liner", name: "Fender Liner (Left)", aliases: ["wheel arch liner left", "inner fender left"], defaultAction: "replace", structural: false },
      { id: "front_fender_l_moulding", name: "Fender Moulding (Left)", aliases: ["wheel arch trim left"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "front_fender_r",
    name: "Front Fender (Right)",
    aliases: ["right front wing", "RH front fender", "passenger front fender", "front mudguard right"],
    zone: "front",
    structural: false,
    costTier: "medium",
    subParts: [
      { id: "front_fender_r_panel", name: "Fender Panel (Right)", aliases: ["wing panel right"], defaultAction: "replace", structural: false },
      { id: "front_fender_r_liner", name: "Fender Liner (Right)", aliases: ["wheel arch liner right", "inner fender right"], defaultAction: "replace", structural: false },
      { id: "front_fender_r_moulding", name: "Fender Moulding (Right)", aliases: ["wheel arch trim right"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "fog_light_l",
    name: "Fog Light (Left)",
    aliases: ["left fog lamp", "LH fog light"],
    zone: "front",
    structural: false,
    costTier: "low",
    subParts: [
      { id: "fog_light_l_unit", name: "Fog Light Unit (Left)", aliases: ["fog lamp assembly left"], defaultAction: "replace", structural: false },
      { id: "fog_light_l_cover", name: "Fog Light Cover (Left)", aliases: ["fog lamp bezel left"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "fog_light_r",
    name: "Fog Light (Right)",
    aliases: ["right fog lamp", "RH fog light"],
    zone: "front",
    structural: false,
    costTier: "low",
    subParts: [
      { id: "fog_light_r_unit", name: "Fog Light Unit (Right)", aliases: ["fog lamp assembly right"], defaultAction: "replace", structural: false },
      { id: "fog_light_r_cover", name: "Fog Light Cover (Right)", aliases: ["fog lamp bezel right"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "bull_bar",
    name: "Bull Bar / Nudge Bar",
    aliases: ["bull bar", "nudge bar", "roo bar", "push bar", "front guard"],
    zone: "front",
    structural: false,
    costTier: "medium",
    subParts: [
      { id: "bull_bar_frame", name: "Bull Bar Frame", aliases: ["bull bar main tube"], defaultAction: "replace", structural: false },
      { id: "bull_bar_mount", name: "Bull Bar Mounting Brackets", aliases: ["bull bar brackets"], defaultAction: "replace", structural: false },
      { id: "bull_bar_light", name: "Bull Bar Auxiliary Lights", aliases: ["spot lights", "driving lights"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "indicator_l",
    name: "Front Indicator (Left)",
    aliases: ["left turn signal", "LH indicator", "blinker left"],
    zone: "front",
    structural: false,
    costTier: "low",
    subParts: [],
  },
  {
    id: "indicator_r",
    name: "Front Indicator (Right)",
    aliases: ["right turn signal", "RH indicator", "blinker right"],
    zone: "front",
    structural: false,
    costTier: "low",
    subParts: [],
  },

  // ═══════════════════════════════════════════════════════════════════
  // LEFT SIDE (DRIVER SIDE — South Africa is right-hand drive)
  // ═══════════════════════════════════════════════════════════════════
  {
    id: "left_front_door",
    name: "Front Door (Left / Passenger)",
    aliases: ["LH front door", "passenger front door", "left front door"],
    zone: "left_side",
    structural: true,
    costTier: "high",
    subParts: [
      { id: "left_front_door_shell", name: "Door Shell (Left Front)", aliases: ["door skin left front"], defaultAction: "replace", structural: true },
      { id: "left_front_door_glass", name: "Door Glass (Left Front)", aliases: ["window glass left front"], defaultAction: "replace", structural: false },
      { id: "left_front_door_regulator", name: "Window Regulator (Left Front)", aliases: ["window mechanism left front"], defaultAction: "replace", structural: false },
      { id: "left_front_door_handle_ext", name: "Exterior Door Handle (Left Front)", aliases: ["outside handle left front"], defaultAction: "replace", structural: false },
      { id: "left_front_door_handle_int", name: "Interior Door Handle (Left Front)", aliases: ["inside handle left front"], defaultAction: "replace", structural: false },
      { id: "left_front_door_hinge", name: "Door Hinges (Left Front)", aliases: ["door hinge left front"], defaultAction: "replace", structural: true },
      { id: "left_front_door_lock", name: "Door Lock Actuator (Left Front)", aliases: ["central locking left front"], defaultAction: "replace", structural: false },
      { id: "left_front_door_trim", name: "Door Trim Panel (Left Front)", aliases: ["door card left front", "inner door panel left front"], defaultAction: "replace", structural: false },
      { id: "left_front_door_moulding", name: "Door Moulding (Left Front)", aliases: ["door strip left front", "body moulding left front"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "left_rear_door",
    name: "Rear Door (Left)",
    aliases: ["LH rear door", "left rear door", "passenger rear door"],
    zone: "left_side",
    structural: true,
    costTier: "high",
    subParts: [
      { id: "left_rear_door_shell", name: "Door Shell (Left Rear)", aliases: ["door skin left rear"], defaultAction: "replace", structural: true },
      { id: "left_rear_door_glass", name: "Door Glass (Left Rear)", aliases: ["window glass left rear"], defaultAction: "replace", structural: false },
      { id: "left_rear_door_regulator", name: "Window Regulator (Left Rear)", aliases: ["window mechanism left rear"], defaultAction: "replace", structural: false },
      { id: "left_rear_door_handle", name: "Door Handle (Left Rear)", aliases: ["outside handle left rear"], defaultAction: "replace", structural: false },
      { id: "left_rear_door_trim", name: "Door Trim Panel (Left Rear)", aliases: ["door card left rear"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "left_mirror",
    name: "Side Mirror (Left)",
    aliases: ["LH mirror", "left wing mirror", "left side mirror", "passenger mirror"],
    zone: "left_side",
    structural: false,
    costTier: "low",
    subParts: [
      { id: "left_mirror_glass", name: "Mirror Glass (Left)", aliases: ["mirror element left"], defaultAction: "replace", structural: false },
      { id: "left_mirror_housing", name: "Mirror Housing (Left)", aliases: ["mirror cover left", "mirror cap left"], defaultAction: "replace", structural: false },
      { id: "left_mirror_motor", name: "Mirror Motor (Left)", aliases: ["mirror actuator left"], defaultAction: "replace", structural: false },
      { id: "left_mirror_indicator", name: "Mirror Indicator (Left)", aliases: ["mirror turn signal left"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "left_quarter_panel",
    name: "Quarter Panel (Left)",
    aliases: ["LH quarter panel", "left rear quarter", "left rear fender"],
    zone: "left_side",
    structural: true,
    costTier: "high",
    subParts: [
      { id: "left_quarter_panel_outer", name: "Quarter Panel Outer (Left)", aliases: ["quarter skin left"], defaultAction: "repair", structural: true },
      { id: "left_quarter_panel_inner", name: "Quarter Panel Inner (Left)", aliases: ["inner quarter left"], defaultAction: "repair", structural: true },
      { id: "left_wheel_arch_rear", name: "Rear Wheel Arch (Left)", aliases: ["wheel house left rear"], defaultAction: "repair", structural: true },
    ],
  },
  {
    id: "left_sill",
    name: "Sill Panel / Rocker Panel (Left)",
    aliases: ["LH sill", "left rocker", "left side skirt", "running board left"],
    zone: "left_side",
    structural: true,
    costTier: "medium",
    subParts: [
      { id: "left_sill_outer", name: "Outer Sill (Left)", aliases: ["rocker panel outer left"], defaultAction: "repair", structural: true },
      { id: "left_sill_inner", name: "Inner Sill (Left)", aliases: ["rocker panel inner left"], defaultAction: "repair", structural: true },
      { id: "left_running_board", name: "Running Board / Side Step (Left)", aliases: ["side step left", "nerf bar left"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "left_side_panel",
    name: "Side Panel (Left)",
    aliases: ["LH body side", "left body panel"],
    zone: "left_side",
    structural: true,
    costTier: "high",
    subParts: [],
  },

  // ═══════════════════════════════════════════════════════════════════
  // RIGHT SIDE (DRIVER SIDE in SA — right-hand drive)
  // ═══════════════════════════════════════════════════════════════════
  {
    id: "right_front_door",
    name: "Front Door (Right / Driver)",
    aliases: ["RH front door", "driver front door", "right front door"],
    zone: "right_side",
    structural: true,
    costTier: "high",
    subParts: [
      { id: "right_front_door_shell", name: "Door Shell (Right Front)", aliases: ["door skin right front"], defaultAction: "replace", structural: true },
      { id: "right_front_door_glass", name: "Door Glass (Right Front)", aliases: ["window glass right front"], defaultAction: "replace", structural: false },
      { id: "right_front_door_regulator", name: "Window Regulator (Right Front)", aliases: ["window mechanism right front"], defaultAction: "replace", structural: false },
      { id: "right_front_door_handle_ext", name: "Exterior Door Handle (Right Front)", aliases: ["outside handle right front"], defaultAction: "replace", structural: false },
      { id: "right_front_door_handle_int", name: "Interior Door Handle (Right Front)", aliases: ["inside handle right front"], defaultAction: "replace", structural: false },
      { id: "right_front_door_hinge", name: "Door Hinges (Right Front)", aliases: ["door hinge right front"], defaultAction: "replace", structural: true },
      { id: "right_front_door_lock", name: "Door Lock Actuator (Right Front)", aliases: ["central locking right front"], defaultAction: "replace", structural: false },
      { id: "right_front_door_trim", name: "Door Trim Panel (Right Front)", aliases: ["door card right front"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "right_rear_door",
    name: "Rear Door (Right)",
    aliases: ["RH rear door", "right rear door", "driver rear door"],
    zone: "right_side",
    structural: true,
    costTier: "high",
    subParts: [
      { id: "right_rear_door_shell", name: "Door Shell (Right Rear)", aliases: ["door skin right rear"], defaultAction: "replace", structural: true },
      { id: "right_rear_door_glass", name: "Door Glass (Right Rear)", aliases: ["window glass right rear"], defaultAction: "replace", structural: false },
      { id: "right_rear_door_regulator", name: "Window Regulator (Right Rear)", aliases: ["window mechanism right rear"], defaultAction: "replace", structural: false },
      { id: "right_rear_door_handle", name: "Door Handle (Right Rear)", aliases: ["outside handle right rear"], defaultAction: "replace", structural: false },
      { id: "right_rear_door_trim", name: "Door Trim Panel (Right Rear)", aliases: ["door card right rear"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "right_mirror",
    name: "Side Mirror (Right)",
    aliases: ["RH mirror", "right wing mirror", "right side mirror", "driver mirror"],
    zone: "right_side",
    structural: false,
    costTier: "low",
    subParts: [
      { id: "right_mirror_glass", name: "Mirror Glass (Right)", aliases: ["mirror element right"], defaultAction: "replace", structural: false },
      { id: "right_mirror_housing", name: "Mirror Housing (Right)", aliases: ["mirror cover right", "mirror cap right"], defaultAction: "replace", structural: false },
      { id: "right_mirror_motor", name: "Mirror Motor (Right)", aliases: ["mirror actuator right"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "right_quarter_panel",
    name: "Quarter Panel (Right)",
    aliases: ["RH quarter panel", "right rear quarter", "right rear fender"],
    zone: "right_side",
    structural: true,
    costTier: "high",
    subParts: [
      { id: "right_quarter_panel_outer", name: "Quarter Panel Outer (Right)", aliases: ["quarter skin right"], defaultAction: "repair", structural: true },
      { id: "right_quarter_panel_inner", name: "Quarter Panel Inner (Right)", aliases: ["inner quarter right"], defaultAction: "repair", structural: true },
      { id: "right_wheel_arch_rear", name: "Rear Wheel Arch (Right)", aliases: ["wheel house right rear"], defaultAction: "repair", structural: true },
    ],
  },
  {
    id: "right_sill",
    name: "Sill Panel / Rocker Panel (Right)",
    aliases: ["RH sill", "right rocker", "right side skirt", "running board right"],
    zone: "right_side",
    structural: true,
    costTier: "medium",
    subParts: [
      { id: "right_sill_outer", name: "Outer Sill (Right)", aliases: ["rocker panel outer right"], defaultAction: "repair", structural: true },
      { id: "right_sill_inner", name: "Inner Sill (Right)", aliases: ["rocker panel inner right"], defaultAction: "repair", structural: true },
      { id: "right_running_board", name: "Running Board / Side Step (Right)", aliases: ["side step right", "nerf bar right"], defaultAction: "replace", structural: false },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // REAR END
  // ═══════════════════════════════════════════════════════════════════
  {
    id: "rear_bumper",
    name: "Rear Bumper",
    aliases: ["rear bumper cover", "back bumper", "rear valance"],
    zone: "rear",
    structural: false,
    costTier: "medium",
    subParts: [
      { id: "rear_bumper_cover", name: "Bumper Cover (Rear)", aliases: ["rear bumper fascia", "rear bumper skin"], defaultAction: "replace", structural: false },
      { id: "rear_bumper_reinforcement", name: "Bumper Reinforcement Bar (Rear)", aliases: ["rear bumper beam", "rear impact bar"], defaultAction: "replace", structural: true },
      { id: "rear_bumper_absorber", name: "Energy Absorber (Rear)", aliases: ["rear crash box", "rear bumper foam"], defaultAction: "replace", structural: true },
      { id: "rear_bumper_bracket_l", name: "Bumper Bracket Left (Rear)", aliases: ["rear bumper mount left"], defaultAction: "replace", structural: false },
      { id: "rear_bumper_bracket_r", name: "Bumper Bracket Right (Rear)", aliases: ["rear bumper mount right"], defaultAction: "replace", structural: false },
      { id: "rear_diffuser", name: "Rear Diffuser", aliases: ["rear valance panel"], defaultAction: "replace", structural: false },
      { id: "rear_tow_bar", name: "Tow Bar", aliases: ["towbar", "tow hitch", "trailer hitch"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "boot_lid",
    name: "Boot Lid (Trunk Lid)",
    aliases: ["trunk lid", "boot", "decklid", "tailgate"],
    zone: "rear",
    structural: false,
    costTier: "medium",
    subParts: [
      { id: "boot_lid_panel", name: "Boot Lid Panel", aliases: ["trunk panel", "boot skin"], defaultAction: "replace", structural: false },
      { id: "boot_lid_hinge_l", name: "Boot Lid Hinge (Left)", aliases: ["trunk hinge left"], defaultAction: "replace", structural: false },
      { id: "boot_lid_hinge_r", name: "Boot Lid Hinge (Right)", aliases: ["trunk hinge right"], defaultAction: "replace", structural: false },
      { id: "boot_lid_latch", name: "Boot Lid Latch", aliases: ["trunk latch", "boot lock"], defaultAction: "replace", structural: false },
      { id: "boot_lid_gas_strut", name: "Boot Lid Gas Strut", aliases: ["trunk strut"], defaultAction: "replace", structural: false },
      { id: "boot_lid_spoiler", name: "Boot Lid Spoiler", aliases: ["trunk spoiler", "rear wing"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "tailgate",
    name: "Tailgate (SUV / Bakkie)",
    aliases: ["tail gate", "rear gate", "bakkie tailgate", "liftgate"],
    zone: "rear",
    structural: true,
    costTier: "high",
    subParts: [
      { id: "tailgate_shell", name: "Tailgate Shell", aliases: ["tailgate panel"], defaultAction: "replace", structural: true },
      { id: "tailgate_glass", name: "Tailgate Glass", aliases: ["rear window", "liftgate glass"], defaultAction: "replace", structural: false },
      { id: "tailgate_wiper", name: "Tailgate Wiper", aliases: ["rear wiper"], defaultAction: "replace", structural: false },
      { id: "tailgate_handle", name: "Tailgate Handle", aliases: ["tailgate latch handle"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "tail_light_l",
    name: "Tail Light (Left)",
    aliases: ["left taillight", "LH tail lamp", "rear light left"],
    zone: "rear",
    structural: false,
    costTier: "low",
    subParts: [
      { id: "tail_light_l_lens", name: "Tail Light Lens (Left)", aliases: ["taillight glass left"], defaultAction: "replace", structural: false },
      { id: "tail_light_l_housing", name: "Tail Light Housing (Left)", aliases: ["taillight body left"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "tail_light_r",
    name: "Tail Light (Right)",
    aliases: ["right taillight", "RH tail lamp", "rear light right"],
    zone: "rear",
    structural: false,
    costTier: "low",
    subParts: [
      { id: "tail_light_r_lens", name: "Tail Light Lens (Right)", aliases: ["taillight glass right"], defaultAction: "replace", structural: false },
      { id: "tail_light_r_housing", name: "Tail Light Housing (Right)", aliases: ["taillight body right"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "rear_panel",
    name: "Rear Body Panel",
    aliases: ["rear end panel", "back panel", "rear valance panel"],
    zone: "rear",
    structural: true,
    costTier: "high",
    subParts: [
      { id: "rear_panel_outer", name: "Rear Panel Outer", aliases: ["rear body outer"], defaultAction: "repair", structural: true },
      { id: "rear_panel_inner", name: "Rear Panel Inner", aliases: ["rear body inner"], defaultAction: "repair", structural: true },
    ],
  },
  {
    id: "number_plate_light",
    name: "Number Plate Light",
    aliases: ["license plate light", "registration plate lamp"],
    zone: "rear",
    structural: false,
    costTier: "low",
    subParts: [],
  },
  {
    id: "rear_canopy",
    name: "Canopy (Bakkie)",
    aliases: ["bakkie canopy", "truck canopy", "load bin cover", "tonneau cover"],
    zone: "rear",
    structural: false,
    costTier: "medium",
    subParts: [
      { id: "canopy_shell", name: "Canopy Shell", aliases: ["canopy body"], defaultAction: "replace", structural: false },
      { id: "canopy_glass", name: "Canopy Glass", aliases: ["canopy windows"], defaultAction: "replace", structural: false },
      { id: "canopy_clamps", name: "Canopy Clamps", aliases: ["canopy mounts"], defaultAction: "replace", structural: false },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // WINDSHIELD
  // ═══════════════════════════════════════════════════════════════════
  {
    id: "windscreen",
    name: "Windscreen (Windshield)",
    aliases: ["windshield", "front windscreen", "front glass", "laminated glass"],
    zone: "windshield",
    structural: true,
    costTier: "medium",
    subParts: [
      { id: "windscreen_glass", name: "Windscreen Glass", aliases: ["windshield glass"], defaultAction: "replace", structural: true },
      { id: "windscreen_seal", name: "Windscreen Seal", aliases: ["windshield rubber", "windscreen gasket"], defaultAction: "replace", structural: false },
      { id: "windscreen_moulding", name: "Windscreen Moulding", aliases: ["windshield trim"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "wiper_assembly",
    name: "Wiper Assembly",
    aliases: ["windscreen wipers", "windshield wipers"],
    zone: "windshield",
    structural: false,
    costTier: "low",
    subParts: [
      { id: "wiper_arm_l", name: "Wiper Arm (Left)", aliases: ["driver wiper arm"], defaultAction: "replace", structural: false },
      { id: "wiper_arm_r", name: "Wiper Arm (Right)", aliases: ["passenger wiper arm"], defaultAction: "replace", structural: false },
      { id: "wiper_motor", name: "Wiper Motor", aliases: ["wiper linkage motor"], defaultAction: "replace", structural: false },
      { id: "wiper_cowl", name: "Wiper Cowl Panel", aliases: ["scuttle panel", "cowl vent"], defaultAction: "replace", structural: false },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // REAR GLASS
  // ═══════════════════════════════════════════════════════════════════
  {
    id: "rear_windscreen",
    name: "Rear Windscreen",
    aliases: ["rear windshield", "rear glass", "back glass", "rear window"],
    zone: "rear_glass",
    structural: false,
    costTier: "medium",
    subParts: [
      { id: "rear_windscreen_glass", name: "Rear Windscreen Glass", aliases: ["rear window glass"], defaultAction: "replace", structural: false },
      { id: "rear_windscreen_seal", name: "Rear Windscreen Seal", aliases: ["rear window rubber"], defaultAction: "replace", structural: false },
      { id: "rear_wiper", name: "Rear Wiper", aliases: ["rear windscreen wiper"], defaultAction: "replace", structural: false },
      { id: "rear_defroster", name: "Rear Defroster Element", aliases: ["rear demister", "heated rear window"], defaultAction: "replace", structural: false },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // ROOF / CABIN
  // ═══════════════════════════════════════════════════════════════════
  {
    id: "roof_panel",
    name: "Roof Panel",
    aliases: ["roof skin", "roof sheet"],
    zone: "roof",
    structural: true,
    costTier: "high",
    subParts: [
      { id: "roof_panel_outer", name: "Roof Panel Outer", aliases: ["roof skin"], defaultAction: "repair", structural: true },
      { id: "roof_lining", name: "Roof Lining (Headliner)", aliases: ["headliner", "roof trim"], defaultAction: "replace", structural: false },
      { id: "roof_rack", name: "Roof Rack / Rails", aliases: ["roof rails", "luggage rack"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "sunroof",
    name: "Sunroof / Moonroof",
    aliases: ["sunroof", "moonroof", "panoramic roof"],
    zone: "roof",
    structural: false,
    costTier: "high",
    subParts: [
      { id: "sunroof_glass", name: "Sunroof Glass Panel", aliases: ["sunroof glass"], defaultAction: "replace", structural: false },
      { id: "sunroof_motor", name: "Sunroof Motor", aliases: ["sunroof actuator"], defaultAction: "replace", structural: false },
      { id: "sunroof_seal", name: "Sunroof Seal", aliases: ["sunroof rubber"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "a_pillar",
    name: "A-Pillar",
    aliases: ["front pillar", "windscreen pillar"],
    zone: "roof",
    structural: true,
    costTier: "high",
    subParts: [
      { id: "a_pillar_l", name: "A-Pillar (Left)", aliases: ["left front pillar"], defaultAction: "repair", structural: true },
      { id: "a_pillar_r", name: "A-Pillar (Right)", aliases: ["right front pillar"], defaultAction: "repair", structural: true },
      { id: "a_pillar_trim_l", name: "A-Pillar Trim (Left)", aliases: ["pillar cover left"], defaultAction: "replace", structural: false },
      { id: "a_pillar_trim_r", name: "A-Pillar Trim (Right)", aliases: ["pillar cover right"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "b_pillar",
    name: "B-Pillar",
    aliases: ["centre pillar", "center pillar"],
    zone: "roof",
    structural: true,
    costTier: "high",
    subParts: [
      { id: "b_pillar_l", name: "B-Pillar (Left)", aliases: ["left centre pillar"], defaultAction: "repair", structural: true },
      { id: "b_pillar_r", name: "B-Pillar (Right)", aliases: ["right centre pillar"], defaultAction: "repair", structural: true },
    ],
  },
  {
    id: "c_pillar",
    name: "C-Pillar",
    aliases: ["rear pillar", "quarter pillar"],
    zone: "roof",
    structural: true,
    costTier: "high",
    subParts: [
      { id: "c_pillar_l", name: "C-Pillar (Left)", aliases: ["left rear pillar"], defaultAction: "repair", structural: true },
      { id: "c_pillar_r", name: "C-Pillar (Right)", aliases: ["right rear pillar"], defaultAction: "repair", structural: true },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // UNDERCARRIAGE / CHASSIS
  // ═══════════════════════════════════════════════════════════════════
  {
    id: "chassis_frame",
    name: "Chassis Frame / Subframe",
    aliases: ["chassis", "frame", "subframe", "ladder frame", "monocoque"],
    zone: "undercarriage",
    structural: true,
    costTier: "high",
    subParts: [
      { id: "front_subframe", name: "Front Subframe", aliases: ["front crossmember", "engine cradle"], defaultAction: "replace", structural: true },
      { id: "rear_subframe", name: "Rear Subframe", aliases: ["rear crossmember"], defaultAction: "replace", structural: true },
      { id: "floor_pan", name: "Floor Pan", aliases: ["floor panel", "underbody"], defaultAction: "repair", structural: true },
    ],
  },
  {
    id: "suspension_front",
    name: "Front Suspension",
    aliases: ["front suspension", "front struts", "front shocks"],
    zone: "undercarriage",
    structural: true,
    costTier: "medium",
    subParts: [
      { id: "front_strut_l", name: "Front Strut / Shock (Left)", aliases: ["LH front shock absorber"], defaultAction: "replace", structural: true },
      { id: "front_strut_r", name: "Front Strut / Shock (Right)", aliases: ["RH front shock absorber"], defaultAction: "replace", structural: true },
      { id: "front_control_arm_l", name: "Front Control Arm (Left)", aliases: ["LH wishbone", "LH lower arm"], defaultAction: "replace", structural: true },
      { id: "front_control_arm_r", name: "Front Control Arm (Right)", aliases: ["RH wishbone", "RH lower arm"], defaultAction: "replace", structural: true },
      { id: "front_spring_l", name: "Front Spring (Left)", aliases: ["LH coil spring front"], defaultAction: "replace", structural: true },
      { id: "front_spring_r", name: "Front Spring (Right)", aliases: ["RH coil spring front"], defaultAction: "replace", structural: true },
      { id: "front_anti_roll_bar", name: "Front Anti-Roll Bar", aliases: ["front sway bar", "front stabiliser bar"], defaultAction: "replace", structural: true },
      { id: "steering_rack", name: "Steering Rack", aliases: ["power steering rack", "steering gear"], defaultAction: "replace", structural: true },
      { id: "tie_rod_l", name: "Tie Rod End (Left)", aliases: ["LH track rod end"], defaultAction: "replace", structural: true },
      { id: "tie_rod_r", name: "Tie Rod End (Right)", aliases: ["RH track rod end"], defaultAction: "replace", structural: true },
    ],
  },
  {
    id: "suspension_rear",
    name: "Rear Suspension",
    aliases: ["rear suspension", "rear shocks", "rear struts"],
    zone: "undercarriage",
    structural: true,
    costTier: "medium",
    subParts: [
      { id: "rear_shock_l", name: "Rear Shock Absorber (Left)", aliases: ["LH rear shock"], defaultAction: "replace", structural: true },
      { id: "rear_shock_r", name: "Rear Shock Absorber (Right)", aliases: ["RH rear shock"], defaultAction: "replace", structural: true },
      { id: "rear_spring_l", name: "Rear Spring (Left)", aliases: ["LH coil spring rear", "LH leaf spring"], defaultAction: "replace", structural: true },
      { id: "rear_spring_r", name: "Rear Spring (Right)", aliases: ["RH coil spring rear", "RH leaf spring"], defaultAction: "replace", structural: true },
      { id: "rear_trailing_arm_l", name: "Rear Trailing Arm (Left)", aliases: ["LH rear arm"], defaultAction: "replace", structural: true },
      { id: "rear_trailing_arm_r", name: "Rear Trailing Arm (Right)", aliases: ["RH rear arm"], defaultAction: "replace", structural: true },
      { id: "rear_anti_roll_bar", name: "Rear Anti-Roll Bar", aliases: ["rear sway bar", "rear stabiliser bar"], defaultAction: "replace", structural: true },
    ],
  },
  {
    id: "exhaust_system",
    name: "Exhaust System",
    aliases: ["exhaust", "exhaust pipe", "muffler", "silencer"],
    zone: "undercarriage",
    structural: false,
    costTier: "medium",
    subParts: [
      { id: "exhaust_manifold", name: "Exhaust Manifold", aliases: ["exhaust header"], defaultAction: "replace", structural: false },
      { id: "catalytic_converter", name: "Catalytic Converter", aliases: ["cat", "catalytic"], defaultAction: "replace", structural: false },
      { id: "exhaust_pipe", name: "Exhaust Pipe", aliases: ["exhaust tube"], defaultAction: "replace", structural: false },
      { id: "silencer", name: "Silencer (Muffler)", aliases: ["muffler", "back box"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "drivetrain",
    name: "Drivetrain",
    aliases: ["drive shaft", "propshaft", "CV joints", "differential"],
    zone: "undercarriage",
    structural: true,
    costTier: "high",
    subParts: [
      { id: "drive_shaft", name: "Drive Shaft (Propshaft)", aliases: ["propeller shaft"], defaultAction: "replace", structural: true },
      { id: "cv_joint_l", name: "CV Joint (Left)", aliases: ["LH constant velocity joint"], defaultAction: "replace", structural: true },
      { id: "cv_joint_r", name: "CV Joint (Right)", aliases: ["RH constant velocity joint"], defaultAction: "replace", structural: true },
      { id: "differential", name: "Differential", aliases: ["diff", "rear diff", "front diff"], defaultAction: "replace", structural: true },
      { id: "transfer_case", name: "Transfer Case", aliases: ["transfer box", "4x4 transfer"], defaultAction: "replace", structural: true },
    ],
  },
  {
    id: "wheels_tyres",
    name: "Wheels & Tyres",
    aliases: ["wheel", "rim", "tyre", "tire", "alloy wheel", "mag wheel"],
    zone: "undercarriage",
    structural: false,
    costTier: "medium",
    subParts: [
      { id: "wheel_fl", name: "Wheel (Front Left)", aliases: ["LH front rim", "front left mag"], defaultAction: "replace", structural: false },
      { id: "wheel_fr", name: "Wheel (Front Right)", aliases: ["RH front rim", "front right mag"], defaultAction: "replace", structural: false },
      { id: "wheel_rl", name: "Wheel (Rear Left)", aliases: ["LH rear rim", "rear left mag"], defaultAction: "replace", structural: false },
      { id: "wheel_rr", name: "Wheel (Rear Right)", aliases: ["RH rear rim", "rear right mag"], defaultAction: "replace", structural: false },
      { id: "tyre_fl", name: "Tyre (Front Left)", aliases: ["LH front tire"], defaultAction: "replace", structural: false },
      { id: "tyre_fr", name: "Tyre (Front Right)", aliases: ["RH front tire"], defaultAction: "replace", structural: false },
      { id: "tyre_rl", name: "Tyre (Rear Left)", aliases: ["LH rear tire"], defaultAction: "replace", structural: false },
      { id: "tyre_rr", name: "Tyre (Rear Right)", aliases: ["RH rear tire"], defaultAction: "replace", structural: false },
    ],
  },
  {
    id: "engine_sump",
    name: "Engine Sump / Oil Pan",
    aliases: ["sump", "oil pan", "engine oil pan"],
    zone: "undercarriage",
    structural: false,
    costTier: "low",
    subParts: [],
  },
  {
    id: "fuel_tank",
    name: "Fuel Tank",
    aliases: ["petrol tank", "diesel tank", "gas tank"],
    zone: "undercarriage",
    structural: false,
    costTier: "medium",
    subParts: [],
  },
];

// ─── Lookup Utilities ────────────────────────────────────────────────

/** Build a flat index: lowercase alias → VehiclePart */
const _aliasIndex = new Map<string, VehiclePart>();
for (const part of VEHICLE_PARTS) {
  _aliasIndex.set(part.name.toLowerCase(), part);
  _aliasIndex.set(part.id, part);
  for (const alias of part.aliases) {
    _aliasIndex.set(alias.toLowerCase(), part);
  }
  for (const sub of part.subParts) {
    _aliasIndex.set(sub.name.toLowerCase(), part);
    _aliasIndex.set(sub.id, part);
    for (const alias of sub.aliases) {
      _aliasIndex.set(alias.toLowerCase(), part);
    }
  }
}

/**
 * Resolve a free-text component name to a structured VehiclePart.
 * Uses exact match first, then fuzzy substring matching.
 */
export function resolveComponent(rawName: string): VehiclePart | null {
  const lower = rawName.trim().toLowerCase();
  
  // 1. Exact match
  if (_aliasIndex.has(lower)) return _aliasIndex.get(lower)!;
  
  // 2. Substring match (e.g. "left front door" matches "Front Door (Left / Passenger)")
  for (const [key, part] of Array.from(_aliasIndex.entries())) {
    if (lower.includes(key) || key.includes(lower)) {
      return part;
    }
  }
  
  // 3. Token overlap (at least 2 tokens must match)
  const tokens = lower.split(/[\s\/\-_,()]+/).filter(t => t.length > 2);
  let bestMatch: VehiclePart | null = null;
  let bestScore = 0;
  
  for (const part of VEHICLE_PARTS) {
    const partTokens = [
      ...part.name.toLowerCase().split(/[\s\/\-_,()]+/),
      ...part.aliases.flatMap(a => a.toLowerCase().split(/[\s\/\-_,()]+/)),
    ].filter(t => t.length > 2);
    
    const overlap = tokens.filter(t => partTokens.some(pt => pt.includes(t) || t.includes(pt))).length;
    if (overlap > bestScore && overlap >= 2) {
      bestScore = overlap;
      bestMatch = part;
    }
  }
  
  return bestMatch;
}

/**
 * Resolve a component name to its zone.
 */
export function resolveComponentZone(rawName: string): VehicleZone | null {
  const part = resolveComponent(rawName);
  return part ? part.zone : null;
}

/**
 * Get all parts in a specific zone.
 */
export function getPartsByZone(zone: VehicleZone): VehiclePart[] {
  return VEHICLE_PARTS.filter(p => p.zone === zone);
}

/**
 * Normalize a raw component name to its canonical form.
 * Returns the official part name if found, otherwise the original string.
 */
export function normalizeComponentName(rawName: string): string {
  const part = resolveComponent(rawName);
  return part ? part.name : rawName;
}

/**
 * Get sub-parts for a given component.
 */
export function getSubParts(rawName: string): VehicleSubPart[] {
  const part = resolveComponent(rawName);
  return part ? part.subParts : [];
}

/**
 * Resolve multiple raw component names and group by zone.
 */
export function groupComponentsByZone(rawNames: string[]): Map<VehicleZone, { part: VehiclePart; rawName: string }[]> {
  const grouped = new Map<VehicleZone, { part: VehiclePart; rawName: string }[]>();
  
  for (const raw of rawNames) {
    const part = resolveComponent(raw);
    if (part) {
      const existing = grouped.get(part.zone) || [];
      // Avoid duplicates
      if (!existing.some(e => e.part.id === part.id)) {
        existing.push({ part, rawName: raw });
        grouped.set(part.zone, existing);
      }
    }
  }
  
  return grouped;
}
