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
    aliases: ["front bumper cover", "front valance", "bumper bar", "front spoiler", "F/B", "FB", "front bar", "front facia", "front fascia", "front bumper assy", "front bumper assembly", "B/bar", "bumper bar front"],
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
    aliases: ["left headlamp", "driver headlight", "LH headlight", "headlamps", "headlights", "headlamp set", "headlight set", "headlamp assembly", "headlight assembly"],
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
    aliases: ["LH quarter panel", "left rear quarter", "left rear fender", "Q/P LH", "QP LH", "LH Q/P", "LH QP", "left quarter", "linker kwartpaneel"],
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
    aliases: ["RH quarter panel", "right rear quarter", "right rear fender", "Q/P RH", "QP RH", "RH Q/P", "RH QP", "right quarter", "regterkwartpaneel"],
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
    aliases: ["rear bumper cover", "back bumper", "rear valance", "R/B", "RB", "rear bar", "rear facia", "rear fascia", "R bumper", "rear bumper assy", "back bar", "rear bumper assembly"],
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
    name: "Tailgate (SUV / Pickup)",
    aliases: ["tail gate", "rear gate", "pickup tailgate", "liftgate", "load bed gate"],
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
    name: "Canopy (Pickup)",
    aliases: ["pickup canopy", "truck canopy", "load bin cover", "tonneau cover", "pickup load bed", "load bed", "load bay cover"],
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
    aliases: ["windshield", "front windscreen", "front glass", "laminated glass", "W/screen", "W/S", "windscreen"],
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
    aliases: ["front pillar", "windscreen pillar", "A/P", "AP", "a pillar", "voorste pilaar"],
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
  // ─── Safety / Restraint Systems ──────────────────────────────────────
  {
    id: "airbag_driver",
    name: "Driver Airbag",
    aliases: ["driver air bag", "steering wheel airbag", "driver srs", "driver srs airbag", "airbags complete", "airbags", "airbag set", "airbag complete", "air bags complete", "air bags"],
    zone: "roof",
    structural: false,
    costTier: "high",
    subParts: [],
  },
  {
    id: "airbag_passenger",
    name: "Passenger Airbag",
    aliases: ["passenger air bag", "front passenger airbag", "passenger srs", "co-driver airbag"],
    zone: "roof",
    structural: false,
    costTier: "high",
    subParts: [],
  },
  {
    id: "airbag_knee",
    name: "Knee Airbag",
    aliases: ["knee air bag", "knee bolster airbag", "knee srs"],
    zone: "roof",
    structural: false,
    costTier: "high",
    subParts: [],
  },
  {
    id: "airbag_curtain_l",
    name: "Curtain Airbag (Left)",
    aliases: ["lhs curtain airbag", "left curtain air bag", "side curtain left"],
    zone: "left_side",
    structural: false,
    costTier: "high",
    subParts: [],
  },
  {
    id: "airbag_curtain_r",
    name: "Curtain Airbag (Right)",
    aliases: ["rhs curtain airbag", "right curtain air bag", "side curtain right"],
    zone: "right_side",
    structural: false,
    costTier: "high",
    subParts: [],
  },
  {
    id: "airbag_module",
    name: "Airbag Control Module",
    aliases: ["airbag module", "air bag module", "srs module", "srs ecu", "airbag ecu", "srs control unit"],
    zone: "roof",
    structural: false,
    costTier: "high",
    subParts: [],
  },
  {
    id: "seatbelt_fl",
    name: "Seat Belt (Front Left)",
    aliases: ["lhs front seat belt", "lhs front seatbelt", "driver seat belt", "driver seatbelt", "lf seat belt", "lhs front seat belt+ stalk", "lhs front seat belt + stalk", "lf seatbelt stalk", "l/f seat belt+ stalk", "l/f seat belt + stalk"],
    zone: "roof",
    structural: false,
    costTier: "medium",
    subParts: [],
  },
  {
    id: "seatbelt_fr",
    name: "Seat Belt (Front Right)",
    aliases: ["rhs front seat belt", "rhs front seatbelt", "passenger seat belt", "passenger seatbelt", "rf seat belt", "rhs front seat belt+ stalk", "rhs front seat belt + stalk", "rf seatbelt stalk", "r/f seat belt+ stalk", "r/f seat belt + stalk"],
    zone: "roof",
    structural: false,
    costTier: "medium",
    subParts: [],
  },
  {
    id: "seatbelt_rl",
    name: "Seat Belt (Rear Left)",
    aliases: ["lhs rear seat belt", "rear left seatbelt", "rl seat belt"],
    zone: "roof",
    structural: false,
    costTier: "medium",
    subParts: [],
  },
  {
    id: "seatbelt_rr",
    name: "Seat Belt (Rear Right)",
    aliases: ["rhs rear seat belt", "rear right seatbelt", "rr seat belt"],
    zone: "roof",
    structural: false,
    costTier: "medium",
    subParts: [],
  },
  // ─── Sliding Door (MPV / SUV / Van / Bakkie) ──────────────────────────
  {
    id: "sliding_door_l",
    name: "Sliding Door (Left)",
    aliases: ["lhs sliding door", "lhs slide", "left sliding door", "lh sliding door", "l/s slide", "lhs rear sliding door", "rhs slide"],
    zone: "left_side",
    structural: false,
    costTier: "high",
    subParts: [],
  },
  {
    id: "sliding_door_r",
    name: "Sliding Door (Right)",
    aliases: ["rhs sliding door", "rhs slide", "right sliding door", "rh sliding door", "r/s slide", "rhs rear sliding door"],
    zone: "right_side",
    structural: false,
    costTier: "high",
    subParts: [],
  },
  // ─── Chassis / Suspension (SA terminology) ───────────────────────────
  {
    id: "cab_mountings",
    name: "Cab Mountings",
    aliases: ["cab mounts", "cab mounting", "body mounts", "cab isolators"],
    zone: "undercarriage",
    structural: true,
    costTier: "medium",
    subParts: [],
  },
  {
    id: "camber_bolts",
    name: "Camber Bolts",
    aliases: ["camber bolt", "camber adjustment bolts", "alignment bolts"],
    zone: "undercarriage",
    structural: true,
    costTier: "low",
    subParts: [],
  },
  {
    id: "cross_member_bracket",
    name: "Cross Member Bracket",
    aliases: ["crossmember bracket", "subframe bracket", "cross-member bracket", "cross member bkt"],
    zone: "undercarriage",
    structural: true,
    costTier: "medium",
    subParts: [],
  },
  {
    id: "rad_support_panel",
    name: "Radiator Support Panel",
    aliases: ["rad support", "radiator support panel", "front slam panel", "radiator core support"],
    zone: "front",
    structural: true,
    costTier: "medium",
    subParts: [],
  },
  {
    id: "bumper_frame",
    name: "Bumper Frame",
    aliases: ["bumper carrier", "bumper support frame", "front bumper frame", "rear bumper frame"],
    zone: "front",
    structural: true,
    costTier: "medium",
    subParts: [],
  },
  {
    id: "engine_bottom_cover",
    name: "Engine Bottom Cover",
    aliases: ["engine undershield", "sump guard", "engine skid plate", "bottom engine cover"],
    zone: "undercarriage",
    structural: false,
    costTier: "low",
    subParts: [],
  },
  {
    id: "sump_cover",
    name: "Sump Cover",
    aliases: ["oil sump cover", "sump guard plate", "sump skid plate"],
    zone: "undercarriage",
    structural: false,
    costTier: "low",
    subParts: [],
  },
  {
    id: "grille_air_guides",
    name: "Grille Air Guides",
    aliases: ["grille air guide", "air guide grille", "bumper air duct", "front air duct"],
    zone: "front",
    structural: false,
    costTier: "low",
    subParts: [],
  },
  // ─── A/C & Electrical (SA service terminology) ───────────────────────
  {
    id: "aircon_regas",
    name: "Air Conditioning Regas",
    aliases: ["o/s/c regas", "osc regas", "a/c regas", "ac regas", "aircon regas", "air con regas", "refrigerant recharge"],
    zone: "roof",
    structural: false,
    costTier: "low",
    subParts: [],
  },
  {
    id: "aircon_reprogram",
    name: "Air Conditioning Reprogram",
    aliases: ["o/s/c reprogram", "osc reprogram", "a/c reprogram", "ac reprogram", "aircon reprogram", "hvac reprogram"],
    zone: "roof",
    structural: false,
    costTier: "low",
    subParts: [],
  },
  {
    id: "aircon_condenser",
    name: "Air Conditioning Condenser",
    aliases: ["aircon rad", "a/c condenser", "ac condenser", "aircon condenser", "air con radiator", "condenser unit"],
    zone: "front",
    structural: false,
    costTier: "medium",
    subParts: [],
  },
  // ─── Admin / Inspection Fees (SA workshop terminology) ───────────────
  {
    id: "voj",
    name: "Vehicle of Interest Fee",
    aliases: ["voj", "vehicle of interest", "inspection fee", "voi fee", "vehicle inspection fee"],
    zone: "roof",
    structural: false,
    costTier: "low",
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
  // Guard: only attempt substring match for alias keys >= 4 characters.
  // Short abbreviations like "RB", "AP", "LH" would otherwise match as
  // substrings inside unrelated words (e.g. "tuRBo", "cAPacitor").
  for (const [key, part] of Array.from(_aliasIndex.entries())) {
    if (key.length >= 4 && (lower.includes(key) || key.includes(lower))) {
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

// ─── Semantic Plausibility Guard ─────────────────────────────────────────────
//
// Used by the hallucination guard in quoteExtractionEngine when resolveComponent
// returns null (i.e. the name is not in the parts dictionary). Instead of a hard
// reject, we ask: "is this a recognisable English/automotive word or phrase that
// could plausibly appear on a vehicle repair quote?"
//
// Strategy (hybrid, no external packages):
//   1. Character-pattern hard-reject: random strings, pure numbers, very short
//      tokens, or strings with excessive non-alpha characters are rejected.
//   2. Domain word-set check: every meaningful token must appear in either
//      (a) the AUTOMOTIVE_DOMAIN_WORDS set (curated from all part names/aliases
//          plus common workshop/repair vocabulary), or
//      (b) a GENERAL_REPAIR_WORDS set (English words that commonly appear in
//          repair quotes but are not vehicle parts themselves).
//   3. If at least 60% of meaningful tokens pass the word-set check, the name
//      is considered plausible and passes through as is_unresolved=true.
//
// This means:
//   "headlamps"         → passes  (token "headlamps" is in domain set)
//   "sundries"          → passes  (in repair words)
//   "radiator support"  → passes  (both tokens in domain set)
//   "paint material"    → passes  (both tokens in repair words)
//   "nuojgfop"          → rejects (not a word, fails pattern check)
//   "A4B7X"             → rejects (looks like a code, not a description)
//   "123"               → rejects (pure number)

/** All meaningful tokens extracted from the VEHICLE_PARTS taxonomy (auto-seeded). */
const AUTOMOTIVE_DOMAIN_WORDS = new Set<string>([
  // Auto-extracted from VEHICLE_PARTS names and aliases
  "4x4","absorber","ac","actuator","adjustment","air","airbag","airbags","aircon",
  "alignment","alloy","anti","arch","arm","assembly","assy","auxiliary","back",
  "badge","bag","bags","ballast","bar","bay","beam","bed","belt","bezel","bin",
  "body","bolster","bolt","bolts","bonnet","boot","bottom","box","bracket","brackets",
  "bulb","bull","bumper","cab","camber","canopy","cap","carrier","case","cat",
  "catalytic","center","central","centre","charge","chassis","chin","clamps","coil",
  "complete","condenser","conditioning","constant","control","converter","coolant",
  "cooler","cooling","core","cover","cowl","cradle","crash","cross","crossmember",
  "curtain","cv","dam","decklid","defroster","demister","diesel","diff","differential",
  "diffuser","door","drive","driver","drivetrain","driving","duct","ecu","electric",
  "element","emblem","end","energy","engine","exhaust","exterior","eye","facia","fan",
  "fascia","fender","floor","foam","fog","frame","front","fuel","gas","gasket","gate",
  "gear","glass","globe","grill","grille","guard","guide","guides","handle","header",
  "headlamp","headlamps","headlight","headlights","headliner","heated","hid","hinge",
  "hinges","hitch","hood","hook","house","housing","hvac","impact","indicator","inner",
  "inside","insulation","insulator","intercooler","interior","isolators","joint",
  "joints","knee","lamp","latch","leaf","led","left","lens","lid","liftgate","light",
  "lights","liner","lining","linkage","lip","load","lock","locking","logo","lower",
  "luggage","mag","main","manifold","mechanism","member","mirror","module","monocoque",
  "moonroof","motor","moulding","mount","mounting","mountings","mounts","mudguard",
  "muffler","nerf","nudge","number","oil","outer","outside","pad","pan","panel",
  "panoramic","passenger","petrol","pickup","pillar","pipe","plate","power","prop",
  "propeller","propshaft","push","quarter","rack","rad","radiator","rails","rear",
  "rebar","recharge","refrigerant","regas","registration","regulator","reinforcement",
  "reprogram","right","rim","rocker","rod","roll","roof","rubber","running","screen",
  "scuttle","seal","seat","seatbelt","set","shaft","sheet","shell","shock","shocks",
  "side","signal","silencer","sill","skid","skin","skirt","slam","slide","sliding",
  "splitter","spoiler","spot","spring","srs","stabiliser","stalk","steering","step",
  "strip","strut","struts","subframe","sump","sunroof","support","suspension","suv",
  "sway","system","tail","tailgate","taillight","tank","tie","tire","tonneau","top",
  "tow","towbar","track","trailer","trailing","transfer","trim","truck","trunk","tube",
  "turn","tyre","tyres","underbody","undershield","unit","upper","valance","vehicle",
  "velocity","vent","wheel","wheels","window","windows","windscreen","windshield",
  "wing","wiper","wipers","wishbone","xenon",
  // Common SA abbreviations used in quotes
  "lh","rh","lhs","rhs","lf","rf","rl","rr","fb","rb","qp","bkt","asm","incl","excl",
  "assy","no","nr","qty","ea","pc","pcs","pr","set","kit","oe","oem",
  // Additional automotive terms not in taxonomy
  "abs","acc","adas","adaptive","alternator","antenna","axle","battery","bearing",
  "boot","brake","brakes","bumperette","bush","bushing","cable","caliper","cam",
  "camshaft","catalytic","clutch","coilover","compressor","crankshaft","crossbar",
  "cylinder","damper","deflector","disc","distributor","driveshaft","drum","dynamo",
  "filter","flywheel","gearbox","generator","grease","halfshaft","harness","hub",
  "ignition","injector","intercooler","knuckle","lifter","manifold","mounts","nozzle",
  "oxygen","piston","plug","pressure","pump","pushrod","relay","reservoir","ring",
  "rotor","sensor","servo","shaft","solenoid","spark","spindle","starter","strainer",
  "sway","switch","tensioner","thermostat","throttle","timing","torque","transmission",
  "turbo","turbocharger","universal","valve","velocity","viscous","washer","wiring",
  // Common part name variants and modifiers
  "reinforcer","reinforcing","reinforced","deflector","deflecting",
  "absorber","absorbing","retainer","retaining","retainer",
  "liner","lining","cladding","casing","housing","enclosure",
  "crossbar","crossmember","crossbeam","crosspiece",
  "bracket","bracing","brace","strapping","strap",
  "mounting","fastener","fastening","clip","clamp","clamps",
]);

/** Common English words that appear in repair quotes but are not vehicle parts. */
const GENERAL_REPAIR_WORDS = new Set<string>([
  // Repair actions
  "repair","replace","refinish","repaint","respray","strip","refit","align","weld",
  "straighten","blend","polish","clean","inspect","adjust","calibrate","program",
  "flush","bleed","charge","regas","recharge","remove","install","fit","supply",
  "paint","labour","labor","work","service","overhaul","rebuild","recondition",
  // Cost categories
  "sundries","consumables","materials","parts","spares","accessories","hardware",
  "fluids","chemicals","adhesive","sealant","primer","filler","clear","coat","base",
  "metallic","solid","pearl","effect","colour","color","tint","mix","mixing",
  // Modifiers and descriptors
  "new","used","reconditioned","aftermarket","genuine","oem","pattern","second",
  "hand","refurbished","remanufactured","exchange","core","deposit","surcharge",
  "complete","assembly","kit","set","pair","single","left","right","front","rear",
  "upper","lower","inner","outer","top","bottom","centre","center","side","end",
  "small","large","medium","short","long","heavy","light","standard","premium",
  // Administrative/financial line items
  "vat","tax","levy","fee","charge","discount","rebate","credit","debit","total",
  "subtotal","sub","balance","deposit","advance","payment","invoice","quote",
  "estimate","assessment","inspection","report","administration","admin","handling",
  "delivery","collection","storage","towing","hire","rental","courtesy","car",
  // Common English words in part descriptions
  "and","the","of","for","with","to","in","on","at","by","from","into","onto",
  "assembly","bracket","cover","panel","trim","seal","gasket","pad","clip","bolt",
  "nut","screw","washer","pin","spring","ring","cap","plug","hose","pipe","tube",
  "wire","cable","harness","connector","switch","relay","sensor","module","unit",
  "motor","pump","valve","filter","bearing","bush","seal","ring","kit","set",
]);

/**
 * Determine whether a raw part name is semantically plausible for a vehicle
 * repair quote. Used as the second gate in the hallucination guard when
 * resolveComponent() returns null.
 *
 * Returns:
 *   "plausible"   — name looks like a genuine repair quote line item
 *   "implausible" — name is clearly nonsense (random chars, pure number, etc.)
 *   "uncertain"   — name has some recognisable tokens but not enough to be sure
 *                   (caller should treat as plausible to avoid false rejections)
 */
export function isPlausiblePartName(rawName: string): "plausible" | "implausible" | "uncertain" {
  const trimmed = rawName.trim();
  if (!trimmed) return "implausible";

  // ── Hard-reject patterns ──────────────────────────────────────────────────
  // 1. Pure number (e.g. "123", "4500")
  if (/^\d+(\.\d+)?$/.test(trimmed)) return "implausible";

  // 2. Very short (1-3 chars) and not a known abbreviation
  if (trimmed.length <= 3 && !AUTOMOTIVE_DOMAIN_WORDS.has(trimmed.toLowerCase())) return "implausible";

  // 3. Excessive non-alpha characters (>40% of non-space chars are digits/symbols)
  //    Catches things like "A4B7-X99", "##ERROR##", "???", part codes
  //    NOTE: count BEFORE stripping symbols to catch "##ERROR##" (6 of 9 chars are #)
  const alphaCount = (trimmed.match(/[a-zA-Z]/g) || []).length;
  const totalCount = trimmed.replace(/\s/g, '').length;
  if (totalCount > 0 && alphaCount / totalCount < 0.6) return "implausible";

  // 4. Looks like a random string: no vowels in any token of length >= 5
  //    "nuojgfop" has vowels but is still random — catch by vowel-consonant ratio
  const tokens = trimmed.toLowerCase().split(/[\s\/\-_,()]+/).filter(t => t.length >= 3);
  if (tokens.length === 0) return "implausible";

  let implausibleTokens = 0;
  for (const tok of tokens) {
    const vowels = (tok.match(/[aeiou]/g) || []).length;
    const consonants = (tok.match(/[bcdfghjklmnpqrstvwxyz]/g) || []).length;
    // A token with no vowels and length >= 4 is likely an abbreviation or gibberish
    // Allow known abbreviations; reject unknown ones >= 5 chars with no vowels
    if (vowels === 0 && tok.length >= 5 && !AUTOMOTIVE_DOMAIN_WORDS.has(tok)) {
      implausibleTokens++;
    }
    // For tokens not in domain sets, use bigram plausibility:
    // Real English words have common letter pairs (bigrams). Random strings don't.
    // Common English bigrams: th, he, in, er, an, re, on, en, at, es, st, nt, etc.
    const COMMON_BIGRAMS = new Set([
      'th','he','in','er','an','re','on','en','at','es','st','nt','ou','ed','to',
      'it','is','hi','or','as','ar','al','nd','le','de','se','te','me','ng','ha',
      'ti','ve','co','ra','ro','li','ri','si','ca','la','ma','na','ta','wa','sh',
      'tr','pr','pl','cl','cr','br','gr','fr','dr','sp','sc','sk','sm','sn','sw',
      'ck','ss','ll','tt','ff','rr','pp','mm','nn','oo','ee','ai','ea','ie','ue',
    ]);
    if (tok.length >= 5 &&
        !AUTOMOTIVE_DOMAIN_WORDS.has(tok) &&
        !GENERAL_REPAIR_WORDS.has(tok)) {
      // Count how many consecutive character pairs are common English bigrams
      let bigramMatches = 0;
      for (let i = 0; i < tok.length - 1; i++) {
        if (COMMON_BIGRAMS.has(tok[i] + tok[i + 1])) bigramMatches++;
      }
      const bigramRatio = bigramMatches / (tok.length - 1);
      // Real English words typically have >25% bigram matches.
      // Random strings like "nuojgfop" have 0% bigram density.
      // Use OR: low bigrams alone is sufficient to flag as implausible
      // (don't require high vowel ratio — random strings can have vowels).
      if (bigramRatio < 0.25) {
        implausibleTokens++;
      }
    }
  }

  // ── Domain word-set check ─────────────────────────────────────────────────
  let matchedTokens = 0;
  for (const tok of tokens) {
    if (AUTOMOTIVE_DOMAIN_WORDS.has(tok) || GENERAL_REPAIR_WORDS.has(tok)) {
      matchedTokens++;
    } else {
      // Partial match: check if tok is a substring of any domain word or vice versa
      // (handles plurals, compound words, slight variations)
      const partialMatch = [...AUTOMOTIVE_DOMAIN_WORDS, ...GENERAL_REPAIR_WORDS]
        .some(w => (w.length >= 4 && tok.includes(w)) || (tok.length >= 4 && w.includes(tok)));
      if (partialMatch) matchedTokens++;
    }
  }

  const matchRatio = tokens.length > 0 ? matchedTokens / tokens.length : 0;
  const implausibleRatio = tokens.length > 0 ? implausibleTokens / tokens.length : 0;

  // If more than half the tokens are implausible → reject
  if (implausibleRatio > 0.5) return "implausible";

  // If at least 60% of tokens are in the domain word sets → plausible
  if (matchRatio >= 0.6) return "plausible";

  // Otherwise → uncertain (caller treats as plausible to avoid false rejections)
  return "uncertain";
}
