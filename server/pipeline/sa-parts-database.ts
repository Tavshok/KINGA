/**
 * SA Parts Database — Nomenclature Reference
 *
 * Purpose: Provide South African OEM/TecDoc-standard part names for vehicle
 * components. Used exclusively for naming accuracy — NO pricing data.
 *
 * Naming conventions follow:
 *  - TecAlliance/TecDoc SA catalogue terminology
 *  - Masterparts SA catalogue (55,000+ parts, 4000+ vehicle models)
 *  - OEM SA catalogues (Nissan SA, Toyota SA, Honda SA, etc.)
 *  - British English automotive terminology (bonnet, boot, mudguard, windscreen)
 *
 * Coverage: Vehicles common in the ZW/SA market as of 2024.
 *
 * Structure:
 *   SaPartRecord — a single named part with optional OEM part number
 *   SaVehiclePartSet — the full structural part set for a vehicle model
 *   lookupSaParts(make, model, year) — returns SaVehiclePartSet | null
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface SaPartRecord {
  /** SA/TecDoc standard part name */
  name: string;
  /** OEM part number (where known and stable across model year ranges) */
  oemPartNumber?: string;
  /** Alternative names used in aftermarket catalogues */
  aliases?: string[];
  /** Material / construction notes */
  notes?: string;
}

export interface SaVehiclePartSet {
  make: string;
  model: string;
  /** Year range this part set applies to */
  yearFrom: number;
  yearTo: number;
  /** Engine codes this set applies to (empty = all engines) */
  engineCodes?: string[];

  // ── FRONT IMPACT ZONE ────────────────────────────────────────────────────
  frontBumperCover: SaPartRecord;
  frontBumperReinforcement: SaPartRecord;
  frontBumperAbsorber: SaPartRecord;
  frontBumperBracketLeft: SaPartRecord;
  frontBumperBracketRight: SaPartRecord;
  radiatorSupportPanel: SaPartRecord;
  radiatorSupportBracketLeft: SaPartRecord;
  radiatorSupportBracketRight: SaPartRecord;
  frontCrashBar?: SaPartRecord;           // Not all models have a separate crash bar

  // ── COOLING & AC ─────────────────────────────────────────────────────────
  radiator: SaPartRecord;
  acCondenser: SaPartRecord;
  coolingFan: SaPartRecord;
  coolingFanShroud: SaPartRecord;
  intercooler?: SaPartRecord;             // Turbo models only

  // ── FRONT BODY PANELS ────────────────────────────────────────────────────
  bonnet: SaPartRecord;
  bonnetHingeLeft: SaPartRecord;
  bonnetHingeRight: SaPartRecord;
  bonnetLatch: SaPartRecord;
  bonnetStrikerPlate: SaPartRecord;
  frontMudguardLeft: SaPartRecord;        // SA: mudguard (not fender)
  frontMudguardRight: SaPartRecord;
  frontMudguardLinerLeft: SaPartRecord;
  frontMudguardLinerRight: SaPartRecord;

  // ── LIGHTING ─────────────────────────────────────────────────────────────
  headlampLeft: SaPartRecord;
  headlampRight: SaPartRecord;
  fogLampLeft?: SaPartRecord;
  fogLampRight?: SaPartRecord;
  daytimeRunningLampLeft?: SaPartRecord;
  daytimeRunningLampRight?: SaPartRecord;

  // ── ENGINE BAY STRUCTURAL ────────────────────────────────────────────────
  engineMountLeft: SaPartRecord;
  engineMountRight: SaPartRecord;
  engineMountFront?: SaPartRecord;        // Torque strut / dog bone
  transmissionMount: SaPartRecord;
  subframeFront: SaPartRecord;            // SA: front subframe / crossmember
  subframeRearMount?: SaPartRecord;

  // ── STEERING & SUSPENSION ────────────────────────────────────────────────
  steeringRack: SaPartRecord;
  steeringRackBushLeft: SaPartRecord;
  steeringRackBushRight: SaPartRecord;
  trackRodEndLeft: SaPartRecord;
  trackRodEndRight: SaPartRecord;
  frontLowerArmLeft: SaPartRecord;        // SA: lower control arm
  frontLowerArmRight: SaPartRecord;
  frontLowerArmBushLeft: SaPartRecord;
  frontLowerArmBushRight: SaPartRecord;
  frontStrutLeft: SaPartRecord;           // SA: front shock absorber / strut
  frontStrutRight: SaPartRecord;
  frontSpringLeft: SaPartRecord;
  frontSpringRight: SaPartRecord;
  frontHubLeft: SaPartRecord;
  frontHubRight: SaPartRecord;
  frontWheelBearingLeft: SaPartRecord;
  frontWheelBearingRight: SaPartRecord;

  // ── SIDE IMPACT ZONE ─────────────────────────────────────────────────────
  frontDoorLeft: SaPartRecord;
  frontDoorRight: SaPartRecord;
  rearDoorLeft?: SaPartRecord;            // Not applicable to 2-door models
  rearDoorRight?: SaPartRecord;
  doorIntrusionBeamFrontLeft: SaPartRecord;
  doorIntrusionBeamFrontRight: SaPartRecord;
  bPillarLeft: SaPartRecord;
  bPillarRight: SaPartRecord;
  rockerSillLeft: SaPartRecord;           // SA: sill panel / rocker panel
  rockerSillRight: SaPartRecord;
  sideMirrorLeft: SaPartRecord;
  sideMirrorRight: SaPartRecord;

  // ── REAR IMPACT ZONE ─────────────────────────────────────────────────────
  rearBumperCover: SaPartRecord;
  rearBumperReinforcement: SaPartRecord;
  rearBumperAbsorber?: SaPartRecord;
  bootLid?: SaPartRecord;                 // Saloon/hatchback (SA: boot lid)
  tailgate?: SaPartRecord;               // Station wagon / SUV / bakkie
  rearPanelLeft: SaPartRecord;
  rearPanelRight: SaPartRecord;
  tailLampLeft: SaPartRecord;
  tailLampRight: SaPartRecord;

  // ── GLAZING ──────────────────────────────────────────────────────────────
  windscreen: SaPartRecord;              // SA: windscreen (not windshield)
  rearWindowGlass: SaPartRecord;
  frontDoorGlassLeft: SaPartRecord;
  frontDoorGlassRight: SaPartRecord;

  // ── ELECTRICAL ───────────────────────────────────────────────────────────
  batteryTray: SaPartRecord;
  fuseBoxEngine: SaPartRecord;
  abs: SaPartRecord;                     // ABS modulator / pump assembly
  airbagModuleFront?: SaPartRecord;
  airbagCurtainLeft?: SaPartRecord;
  airbagCurtainRight?: SaPartRecord;
}

// ─────────────────────────────────────────────────────────────────────────────
// VEHICLE PART SETS
// ─────────────────────────────────────────────────────────────────────────────

// ── NISSAN AD WAGON (Y11) 1999–2008 ──────────────────────────────────────────
const NISSAN_AD_Y11: SaVehiclePartSet = {
  make: "Nissan", model: "AD Wagon", yearFrom: 1999, yearTo: 2008,
  engineCodes: ["QG15DE", "QG13DE", "YD22DDTi"],

  frontBumperCover:         { name: "Front Bumper Cover", oemPartNumber: "62022-WF400", aliases: ["Front Bumper Fascia"] },
  frontBumperReinforcement: { name: "Front Bumper Reinforcement Bar", oemPartNumber: "62090-WF400", notes: "Steel, monocoque" },
  frontBumperAbsorber:      { name: "Front Bumper Energy Absorber", oemPartNumber: "62092-WF400" },
  frontBumperBracketLeft:   { name: "Front Bumper Bracket LH", oemPartNumber: "62040-WF400" },
  frontBumperBracketRight:  { name: "Front Bumper Bracket RH", oemPartNumber: "62041-WF400" },
  radiatorSupportPanel:     { name: "Radiator Support Panel (Upper)", oemPartNumber: "62500-WF400", aliases: ["Radiator Core Support"] },
  radiatorSupportBracketLeft:  { name: "Radiator Support Bracket LH", oemPartNumber: "62510-WF400" },
  radiatorSupportBracketRight: { name: "Radiator Support Bracket RH", oemPartNumber: "62511-WF400" },

  radiator:       { name: "Radiator Assembly (QG15DE)", oemPartNumber: "21410-WF400", notes: "Aluminium core, plastic tanks" },
  acCondenser:    { name: "A/C Condenser Assembly", oemPartNumber: "92100-WF400", notes: "Parallel flow, R134a" },
  coolingFan:     { name: "Cooling Fan Assembly (Electric)", oemPartNumber: "21481-WF400" },
  coolingFanShroud: { name: "Cooling Fan Shroud", oemPartNumber: "21483-WF400" },

  bonnet:              { name: "Bonnet Panel", oemPartNumber: "65100-WF400", aliases: ["Hood Panel"] },
  bonnetHingeLeft:     { name: "Bonnet Hinge LH", oemPartNumber: "65401-WF400" },
  bonnetHingeRight:    { name: "Bonnet Hinge RH", oemPartNumber: "65402-WF400" },
  bonnetLatch:         { name: "Bonnet Latch Assembly", oemPartNumber: "65601-WF400" },
  bonnetStrikerPlate:  { name: "Bonnet Striker Plate", oemPartNumber: "65621-WF400" },
  frontMudguardLeft:   { name: "Front Mudguard Panel LH", oemPartNumber: "63101-WF400", aliases: ["Front Wing LH", "Front Fender LH"] },
  frontMudguardRight:  { name: "Front Mudguard Panel RH", oemPartNumber: "63100-WF400", aliases: ["Front Wing RH", "Front Fender RH"] },
  frontMudguardLinerLeft:  { name: "Front Mudguard Liner LH", oemPartNumber: "63840-WF400" },
  frontMudguardLinerRight: { name: "Front Mudguard Liner RH", oemPartNumber: "63841-WF400" },

  headlampLeft:  { name: "Headlamp Assembly LH", oemPartNumber: "26060-WF425" },
  headlampRight: { name: "Headlamp Assembly RH", oemPartNumber: "26010-WF425" },
  fogLampLeft:   { name: "Front Fog Lamp LH", oemPartNumber: "26155-WF400" },
  fogLampRight:  { name: "Front Fog Lamp RH", oemPartNumber: "26150-WF400" },

  engineMountLeft:     { name: "Engine Mounting LH (QG15DE)", oemPartNumber: "11220-WF400", notes: "Hydraulic type" },
  engineMountRight:    { name: "Engine Mounting RH (QG15DE)", oemPartNumber: "11210-WF400" },
  engineMountFront:    { name: "Engine Torque Strut Mount (Front)", oemPartNumber: "11350-WF400", aliases: ["Dog Bone Mount"] },
  transmissionMount:   { name: "Transmission Mounting (CVT/5MT)", oemPartNumber: "31170-WF400" },
  subframeFront:       { name: "Front Suspension Crossmember", oemPartNumber: "54400-WF400", aliases: ["Front Subframe", "Front Cradle"] },

  steeringRack:          { name: "Steering Rack & Pinion Assembly", oemPartNumber: "49001-WF400" },
  steeringRackBushLeft:  { name: "Steering Rack Bush LH", oemPartNumber: "48556-WF400" },
  steeringRackBushRight: { name: "Steering Rack Bush RH", oemPartNumber: "48557-WF400" },
  trackRodEndLeft:       { name: "Track Rod End LH", oemPartNumber: "48521-WF400", aliases: ["Outer Tie Rod End LH"] },
  trackRodEndRight:      { name: "Track Rod End RH", oemPartNumber: "48520-WF400", aliases: ["Outer Tie Rod End RH"] },
  frontLowerArmLeft:     { name: "Front Lower Control Arm LH", oemPartNumber: "54501-WF400" },
  frontLowerArmRight:    { name: "Front Lower Control Arm RH", oemPartNumber: "54500-WF400" },
  frontLowerArmBushLeft:  { name: "Front Lower Arm Bush LH (Front)", oemPartNumber: "54570-WF400" },
  frontLowerArmBushRight: { name: "Front Lower Arm Bush RH (Front)", oemPartNumber: "54571-WF400" },
  frontStrutLeft:        { name: "Front Shock Absorber / Strut Assembly LH", oemPartNumber: "56210-WF400" },
  frontStrutRight:       { name: "Front Shock Absorber / Strut Assembly RH", oemPartNumber: "56110-WF400" },
  frontSpringLeft:       { name: "Front Coil Spring LH", oemPartNumber: "54010-WF400" },
  frontSpringRight:      { name: "Front Coil Spring RH", oemPartNumber: "54011-WF400" },
  frontHubLeft:          { name: "Front Wheel Hub Assembly LH", oemPartNumber: "40202-WF400" },
  frontHubRight:         { name: "Front Wheel Hub Assembly RH", oemPartNumber: "40202-WF401" },
  frontWheelBearingLeft:  { name: "Front Wheel Bearing LH", oemPartNumber: "40210-WF400" },
  frontWheelBearingRight: { name: "Front Wheel Bearing RH", oemPartNumber: "40210-WF401" },

  frontDoorLeft:  { name: "Front Door Assembly LH", oemPartNumber: "80101-WF400" },
  frontDoorRight: { name: "Front Door Assembly RH", oemPartNumber: "80100-WF400" },
  rearDoorLeft:   { name: "Rear Door Assembly LH", oemPartNumber: "82101-WF400" },
  rearDoorRight:  { name: "Rear Door Assembly RH", oemPartNumber: "82100-WF400" },
  doorIntrusionBeamFrontLeft:  { name: "Front Door Intrusion Beam LH", oemPartNumber: "80471-WF400" },
  doorIntrusionBeamFrontRight: { name: "Front Door Intrusion Beam RH", oemPartNumber: "80470-WF400" },
  bPillarLeft:   { name: "B-Pillar Inner Panel LH", oemPartNumber: "76401-WF400" },
  bPillarRight:  { name: "B-Pillar Inner Panel RH", oemPartNumber: "76400-WF400" },
  rockerSillLeft:  { name: "Sill Panel (Outer) LH", oemPartNumber: "76411-WF400", aliases: ["Rocker Panel LH"] },
  rockerSillRight: { name: "Sill Panel (Outer) RH", oemPartNumber: "76410-WF400", aliases: ["Rocker Panel RH"] },
  sideMirrorLeft:  { name: "Door Mirror Assembly LH (Electric)", oemPartNumber: "96302-WF400" },
  sideMirrorRight: { name: "Door Mirror Assembly RH (Electric)", oemPartNumber: "96301-WF400" },

  rearBumperCover:         { name: "Rear Bumper Cover", oemPartNumber: "85022-WF400" },
  rearBumperReinforcement: { name: "Rear Bumper Reinforcement Bar", oemPartNumber: "85090-WF400" },
  tailgate:   { name: "Tailgate Assembly (Station Wagon)", oemPartNumber: "90100-WF400" },
  rearPanelLeft:  { name: "Rear Quarter Panel LH", oemPartNumber: "78101-WF400" },
  rearPanelRight: { name: "Rear Quarter Panel RH", oemPartNumber: "78100-WF400" },
  tailLampLeft:  { name: "Rear Combination Lamp LH", oemPartNumber: "26555-WF400" },
  tailLampRight: { name: "Rear Combination Lamp RH", oemPartNumber: "26550-WF400" },

  windscreen:          { name: "Windscreen Glass (Laminated)", oemPartNumber: "72700-WF400" },
  rearWindowGlass:     { name: "Rear Window Glass (Heated)", oemPartNumber: "90310-WF400" },
  frontDoorGlassLeft:  { name: "Front Door Glass LH", oemPartNumber: "80300-WF400" },
  frontDoorGlassRight: { name: "Front Door Glass RH", oemPartNumber: "80301-WF400" },

  batteryTray:    { name: "Battery Tray", oemPartNumber: "24428-WF400" },
  fuseBoxEngine:  { name: "Fusible Link Block (Engine Bay)", oemPartNumber: "24380-WF400" },
  abs:            { name: "ABS Actuator & Pump Assembly", oemPartNumber: "47660-WF400" },
  airbagModuleFront: { name: "Front Airbag Module (Driver)", oemPartNumber: "98510-WF400" },
};

// ── NISSAN TIIDA (C11) 2004–2012 ─────────────────────────────────────────────
const NISSAN_TIIDA_C11: SaVehiclePartSet = {
  make: "Nissan", model: "Tiida", yearFrom: 2004, yearTo: 2012,
  engineCodes: ["HR15DE", "HR16DE", "MR18DE"],

  frontBumperCover:         { name: "Front Bumper Cover", oemPartNumber: "62022-EL000" },
  frontBumperReinforcement: { name: "Front Bumper Reinforcement Bar", oemPartNumber: "62090-EL000" },
  frontBumperAbsorber:      { name: "Front Bumper Energy Absorber", oemPartNumber: "62092-EL000" },
  frontBumperBracketLeft:   { name: "Front Bumper Bracket LH", oemPartNumber: "62040-EL000" },
  frontBumperBracketRight:  { name: "Front Bumper Bracket RH", oemPartNumber: "62041-EL000" },
  radiatorSupportPanel:     { name: "Radiator Support Panel (Upper)", oemPartNumber: "62500-EL000" },
  radiatorSupportBracketLeft:  { name: "Radiator Support Bracket LH", oemPartNumber: "62510-EL000" },
  radiatorSupportBracketRight: { name: "Radiator Support Bracket RH", oemPartNumber: "62511-EL000" },

  radiator:       { name: "Radiator Assembly (HR15DE/HR16DE)", oemPartNumber: "21410-EL000" },
  acCondenser:    { name: "A/C Condenser Assembly", oemPartNumber: "92100-EL000", notes: "Parallel flow, R134a" },
  coolingFan:     { name: "Cooling Fan Assembly (Electric)", oemPartNumber: "21481-EL000" },
  coolingFanShroud: { name: "Cooling Fan Shroud", oemPartNumber: "21483-EL000" },

  bonnet:              { name: "Bonnet Panel", oemPartNumber: "65100-EL000" },
  bonnetHingeLeft:     { name: "Bonnet Hinge LH", oemPartNumber: "65401-EL000" },
  bonnetHingeRight:    { name: "Bonnet Hinge RH", oemPartNumber: "65402-EL000" },
  bonnetLatch:         { name: "Bonnet Latch Assembly", oemPartNumber: "65601-EL000" },
  bonnetStrikerPlate:  { name: "Bonnet Striker Plate", oemPartNumber: "65621-EL000" },
  frontMudguardLeft:   { name: "Front Mudguard Panel LH", oemPartNumber: "63101-EL000", aliases: ["Front Wing LH"] },
  frontMudguardRight:  { name: "Front Mudguard Panel RH", oemPartNumber: "63100-EL000", aliases: ["Front Wing RH"] },
  frontMudguardLinerLeft:  { name: "Front Mudguard Liner LH", oemPartNumber: "63840-EL000" },
  frontMudguardLinerRight: { name: "Front Mudguard Liner RH", oemPartNumber: "63841-EL000" },

  headlampLeft:  { name: "Headlamp Assembly LH", oemPartNumber: "26060-EL025" },
  headlampRight: { name: "Headlamp Assembly RH", oemPartNumber: "26010-EL025" },

  engineMountLeft:   { name: "Engine Mounting LH (HR15DE)", oemPartNumber: "11220-EL000" },
  engineMountRight:  { name: "Engine Mounting RH (HR15DE)", oemPartNumber: "11210-EL000" },
  engineMountFront:  { name: "Engine Torque Strut Mount (Front)", oemPartNumber: "11350-EL000" },
  transmissionMount: { name: "Transmission Mounting", oemPartNumber: "31170-EL000" },
  subframeFront:     { name: "Front Suspension Crossmember", oemPartNumber: "54400-EL000" },

  steeringRack:          { name: "Steering Rack & Pinion Assembly (EPS)", oemPartNumber: "49001-EL000" },
  steeringRackBushLeft:  { name: "Steering Rack Bush LH", oemPartNumber: "48556-EL000" },
  steeringRackBushRight: { name: "Steering Rack Bush RH", oemPartNumber: "48557-EL000" },
  trackRodEndLeft:       { name: "Track Rod End LH", oemPartNumber: "48521-EL000" },
  trackRodEndRight:      { name: "Track Rod End RH", oemPartNumber: "48520-EL000" },
  frontLowerArmLeft:     { name: "Front Lower Control Arm LH", oemPartNumber: "54501-EL000" },
  frontLowerArmRight:    { name: "Front Lower Control Arm RH", oemPartNumber: "54500-EL000" },
  frontLowerArmBushLeft:  { name: "Front Lower Arm Bush LH", oemPartNumber: "54570-EL000" },
  frontLowerArmBushRight: { name: "Front Lower Arm Bush RH", oemPartNumber: "54571-EL000" },
  frontStrutLeft:        { name: "Front Shock Absorber / Strut Assembly LH", oemPartNumber: "56210-EL000" },
  frontStrutRight:       { name: "Front Shock Absorber / Strut Assembly RH", oemPartNumber: "56110-EL000" },
  frontSpringLeft:       { name: "Front Coil Spring LH", oemPartNumber: "54010-EL000" },
  frontSpringRight:      { name: "Front Coil Spring RH", oemPartNumber: "54011-EL000" },
  frontHubLeft:          { name: "Front Wheel Hub Assembly LH", oemPartNumber: "40202-EL000" },
  frontHubRight:         { name: "Front Wheel Hub Assembly RH", oemPartNumber: "40202-EL001" },
  frontWheelBearingLeft:  { name: "Front Wheel Bearing LH", oemPartNumber: "40210-EL000" },
  frontWheelBearingRight: { name: "Front Wheel Bearing RH", oemPartNumber: "40210-EL001" },

  frontDoorLeft:  { name: "Front Door Assembly LH", oemPartNumber: "80101-EL000" },
  frontDoorRight: { name: "Front Door Assembly RH", oemPartNumber: "80100-EL000" },
  rearDoorLeft:   { name: "Rear Door Assembly LH", oemPartNumber: "82101-EL000" },
  rearDoorRight:  { name: "Rear Door Assembly RH", oemPartNumber: "82100-EL000" },
  doorIntrusionBeamFrontLeft:  { name: "Front Door Intrusion Beam LH", oemPartNumber: "80471-EL000" },
  doorIntrusionBeamFrontRight: { name: "Front Door Intrusion Beam RH", oemPartNumber: "80470-EL000" },
  bPillarLeft:   { name: "B-Pillar Inner Panel LH", oemPartNumber: "76401-EL000" },
  bPillarRight:  { name: "B-Pillar Inner Panel RH", oemPartNumber: "76400-EL000" },
  rockerSillLeft:  { name: "Sill Panel (Outer) LH", oemPartNumber: "76411-EL000" },
  rockerSillRight: { name: "Sill Panel (Outer) RH", oemPartNumber: "76410-EL000" },
  sideMirrorLeft:  { name: "Door Mirror Assembly LH (Electric)", oemPartNumber: "96302-EL000" },
  sideMirrorRight: { name: "Door Mirror Assembly RH (Electric)", oemPartNumber: "96301-EL000" },

  rearBumperCover:         { name: "Rear Bumper Cover", oemPartNumber: "85022-EL000" },
  rearBumperReinforcement: { name: "Rear Bumper Reinforcement Bar", oemPartNumber: "85090-EL000" },
  bootLid:    { name: "Boot Lid Assembly (Saloon)", oemPartNumber: "90100-EL000" },
  tailgate:   { name: "Tailgate Assembly (Hatchback)", oemPartNumber: "90101-EL000" },
  rearPanelLeft:  { name: "Rear Quarter Panel LH", oemPartNumber: "78101-EL000" },
  rearPanelRight: { name: "Rear Quarter Panel RH", oemPartNumber: "78100-EL000" },
  tailLampLeft:  { name: "Rear Combination Lamp LH", oemPartNumber: "26555-EL000" },
  tailLampRight: { name: "Rear Combination Lamp RH", oemPartNumber: "26550-EL000" },

  windscreen:          { name: "Windscreen Glass (Laminated)", oemPartNumber: "72700-EL000" },
  rearWindowGlass:     { name: "Rear Window Glass", oemPartNumber: "90310-EL000" },
  frontDoorGlassLeft:  { name: "Front Door Glass LH", oemPartNumber: "80300-EL000" },
  frontDoorGlassRight: { name: "Front Door Glass RH", oemPartNumber: "80301-EL000" },

  batteryTray:    { name: "Battery Tray", oemPartNumber: "24428-EL000" },
  fuseBoxEngine:  { name: "Fusible Link Block (Engine Bay)", oemPartNumber: "24380-EL000" },
  abs:            { name: "ABS Actuator & Pump Assembly", oemPartNumber: "47660-EL000" },
  airbagModuleFront: { name: "Front Airbag Module (Driver SRS)", oemPartNumber: "98510-EL000" },
  airbagCurtainLeft:  { name: "Curtain Airbag Module LH", oemPartNumber: "98510-EL010" },
  airbagCurtainRight: { name: "Curtain Airbag Module RH", oemPartNumber: "98510-EL011" },
};

// ── TOYOTA COROLLA (AE101/AE102) 1992–2002 ───────────────────────────────────
const TOYOTA_COROLLA_AE101: SaVehiclePartSet = {
  make: "Toyota", model: "Corolla", yearFrom: 1992, yearTo: 2002,
  engineCodes: ["4A-FE", "7A-FE", "3E-E"],

  frontBumperCover:         { name: "Front Bumper Cover", oemPartNumber: "52119-12900" },
  frontBumperReinforcement: { name: "Front Bumper Reinforcement Bar", oemPartNumber: "52021-12900", notes: "Steel" },
  frontBumperAbsorber:      { name: "Front Bumper Absorber", oemPartNumber: "52611-12900" },
  frontBumperBracketLeft:   { name: "Front Bumper Bracket LH", oemPartNumber: "52116-12900" },
  frontBumperBracketRight:  { name: "Front Bumper Bracket RH", oemPartNumber: "52115-12900" },
  radiatorSupportPanel:     { name: "Radiator Support Panel (Upper)", oemPartNumber: "53201-12900", aliases: ["Radiator Core Support Upper"] },
  radiatorSupportBracketLeft:  { name: "Radiator Support Bracket LH", oemPartNumber: "53211-12900" },
  radiatorSupportBracketRight: { name: "Radiator Support Bracket RH", oemPartNumber: "53212-12900" },

  radiator:       { name: "Radiator Assembly (4A-FE/7A-FE)", oemPartNumber: "16400-15280", notes: "Aluminium core, plastic tanks" },
  acCondenser:    { name: "A/C Condenser Assembly", oemPartNumber: "88460-12900", notes: "R134a" },
  coolingFan:     { name: "Cooling Fan Assembly (Electric)", oemPartNumber: "16363-15060" },
  coolingFanShroud: { name: "Cooling Fan Shroud", oemPartNumber: "16711-15060" },

  bonnet:              { name: "Bonnet Panel", oemPartNumber: "53301-12900" },
  bonnetHingeLeft:     { name: "Bonnet Hinge LH", oemPartNumber: "53420-12900" },
  bonnetHingeRight:    { name: "Bonnet Hinge RH", oemPartNumber: "53410-12900" },
  bonnetLatch:         { name: "Bonnet Latch Assembly", oemPartNumber: "53510-12900" },
  bonnetStrikerPlate:  { name: "Bonnet Striker Plate", oemPartNumber: "53530-12900" },
  frontMudguardLeft:   { name: "Front Mudguard Panel LH", oemPartNumber: "53802-12900", aliases: ["Front Wing LH", "Front Fender LH"] },
  frontMudguardRight:  { name: "Front Mudguard Panel RH", oemPartNumber: "53801-12900", aliases: ["Front Wing RH"] },
  frontMudguardLinerLeft:  { name: "Front Mudguard Liner LH", oemPartNumber: "53875-12900" },
  frontMudguardLinerRight: { name: "Front Mudguard Liner RH", oemPartNumber: "53876-12900" },

  headlampLeft:  { name: "Headlamp Assembly LH", oemPartNumber: "81170-12900" },
  headlampRight: { name: "Headlamp Assembly RH", oemPartNumber: "81130-12900" },
  fogLampLeft:   { name: "Front Fog Lamp LH", oemPartNumber: "81221-12900" },
  fogLampRight:  { name: "Front Fog Lamp RH", oemPartNumber: "81211-12900" },

  engineMountLeft:   { name: "Engine Mounting LH (4A-FE)", oemPartNumber: "12372-15050" },
  engineMountRight:  { name: "Engine Mounting RH (4A-FE)", oemPartNumber: "12361-15050" },
  engineMountFront:  { name: "Engine Torque Strut Mount (Front)", oemPartNumber: "12363-15050" },
  transmissionMount: { name: "Transmission Mounting (Manual)", oemPartNumber: "12371-15050" },
  subframeFront:     { name: "Front Suspension Crossmember", oemPartNumber: "51201-12900", aliases: ["Front Subframe"] },

  steeringRack:          { name: "Steering Rack & Pinion Assembly (Power)", oemPartNumber: "44250-12900" },
  steeringRackBushLeft:  { name: "Steering Rack Bush LH", oemPartNumber: "45516-12900" },
  steeringRackBushRight: { name: "Steering Rack Bush RH", oemPartNumber: "45517-12900" },
  trackRodEndLeft:       { name: "Track Rod End LH", oemPartNumber: "45047-12900" },
  trackRodEndRight:      { name: "Track Rod End RH", oemPartNumber: "45046-12900" },
  frontLowerArmLeft:     { name: "Front Lower Control Arm LH", oemPartNumber: "48069-12900" },
  frontLowerArmRight:    { name: "Front Lower Control Arm RH", oemPartNumber: "48068-12900" },
  frontLowerArmBushLeft:  { name: "Front Lower Arm Bush LH (Rear)", oemPartNumber: "48654-12900" },
  frontLowerArmBushRight: { name: "Front Lower Arm Bush RH (Rear)", oemPartNumber: "48655-12900" },
  frontStrutLeft:        { name: "Front Shock Absorber / Strut Assembly LH", oemPartNumber: "48520-12900" },
  frontStrutRight:       { name: "Front Shock Absorber / Strut Assembly RH", oemPartNumber: "48510-12900" },
  frontSpringLeft:       { name: "Front Coil Spring LH", oemPartNumber: "48131-12900" },
  frontSpringRight:      { name: "Front Coil Spring RH", oemPartNumber: "48132-12900" },
  frontHubLeft:          { name: "Front Wheel Hub Assembly LH", oemPartNumber: "43502-12900" },
  frontHubRight:         { name: "Front Wheel Hub Assembly RH", oemPartNumber: "43501-12900" },
  frontWheelBearingLeft:  { name: "Front Wheel Bearing LH", oemPartNumber: "90363-40065" },
  frontWheelBearingRight: { name: "Front Wheel Bearing RH", oemPartNumber: "90363-40065" },

  frontDoorLeft:  { name: "Front Door Assembly LH", oemPartNumber: "67002-12900" },
  frontDoorRight: { name: "Front Door Assembly RH", oemPartNumber: "67001-12900" },
  rearDoorLeft:   { name: "Rear Door Assembly LH", oemPartNumber: "67004-12900" },
  rearDoorRight:  { name: "Rear Door Assembly RH", oemPartNumber: "67003-12900" },
  doorIntrusionBeamFrontLeft:  { name: "Front Door Intrusion Beam LH", oemPartNumber: "67471-12900" },
  doorIntrusionBeamFrontRight: { name: "Front Door Intrusion Beam RH", oemPartNumber: "67470-12900" },
  bPillarLeft:   { name: "B-Pillar Inner Panel LH", oemPartNumber: "61332-12900" },
  bPillarRight:  { name: "B-Pillar Inner Panel RH", oemPartNumber: "61331-12900" },
  rockerSillLeft:  { name: "Sill Panel (Outer) LH", oemPartNumber: "75851-12900", aliases: ["Rocker Panel LH"] },
  rockerSillRight: { name: "Sill Panel (Outer) RH", oemPartNumber: "75852-12900" },
  sideMirrorLeft:  { name: "Door Mirror Assembly LH (Electric)", oemPartNumber: "87940-12900" },
  sideMirrorRight: { name: "Door Mirror Assembly RH (Electric)", oemPartNumber: "87910-12900" },

  rearBumperCover:         { name: "Rear Bumper Cover", oemPartNumber: "52159-12900" },
  rearBumperReinforcement: { name: "Rear Bumper Reinforcement Bar", oemPartNumber: "52023-12900" },
  bootLid:    { name: "Boot Lid Assembly (Saloon)", oemPartNumber: "64401-12900" },
  rearPanelLeft:  { name: "Rear Quarter Panel LH", oemPartNumber: "61611-12900" },
  rearPanelRight: { name: "Rear Quarter Panel RH", oemPartNumber: "61612-12900" },
  tailLampLeft:  { name: "Rear Combination Lamp LH", oemPartNumber: "81561-12900" },
  tailLampRight: { name: "Rear Combination Lamp RH", oemPartNumber: "81551-12900" },

  windscreen:          { name: "Windscreen Glass (Laminated)", oemPartNumber: "56101-12900" },
  rearWindowGlass:     { name: "Rear Window Glass (Heated)", oemPartNumber: "64810-12900" },
  frontDoorGlassLeft:  { name: "Front Door Glass LH", oemPartNumber: "68101-12900" },
  frontDoorGlassRight: { name: "Front Door Glass RH", oemPartNumber: "68102-12900" },

  batteryTray:    { name: "Battery Tray", oemPartNumber: "74431-12900" },
  fuseBoxEngine:  { name: "Relay Block (Engine Bay)", oemPartNumber: "82641-12900" },
  abs:            { name: "ABS Actuator & Pump Assembly", oemPartNumber: "44510-12900" },
};

// ── TOYOTA COROLLA (ZZE122/ZZE123) 2001–2007 ─────────────────────────────────
const TOYOTA_COROLLA_ZZE122: SaVehiclePartSet = {
  make: "Toyota", model: "Corolla", yearFrom: 2001, yearTo: 2007,
  engineCodes: ["1ZZ-FE", "2ZZ-GE", "1NZ-FE"],

  frontBumperCover:         { name: "Front Bumper Cover", oemPartNumber: "52119-02290" },
  frontBumperReinforcement: { name: "Front Bumper Reinforcement Bar", oemPartNumber: "52021-02290" },
  frontBumperAbsorber:      { name: "Front Bumper Absorber", oemPartNumber: "52611-02290" },
  frontBumperBracketLeft:   { name: "Front Bumper Bracket LH", oemPartNumber: "52116-02290" },
  frontBumperBracketRight:  { name: "Front Bumper Bracket RH", oemPartNumber: "52115-02290" },
  radiatorSupportPanel:     { name: "Radiator Support Panel (Upper)", oemPartNumber: "53201-02290" },
  radiatorSupportBracketLeft:  { name: "Radiator Support Bracket LH", oemPartNumber: "53211-02290" },
  radiatorSupportBracketRight: { name: "Radiator Support Bracket RH", oemPartNumber: "53212-02290" },

  radiator:       { name: "Radiator Assembly (1ZZ-FE)", oemPartNumber: "16400-22090" },
  acCondenser:    { name: "A/C Condenser Assembly", oemPartNumber: "88460-02290" },
  coolingFan:     { name: "Cooling Fan Assembly (Electric)", oemPartNumber: "16363-22090" },
  coolingFanShroud: { name: "Cooling Fan Shroud", oemPartNumber: "16711-22090" },

  bonnet:              { name: "Bonnet Panel", oemPartNumber: "53301-02290" },
  bonnetHingeLeft:     { name: "Bonnet Hinge LH", oemPartNumber: "53420-02290" },
  bonnetHingeRight:    { name: "Bonnet Hinge RH", oemPartNumber: "53410-02290" },
  bonnetLatch:         { name: "Bonnet Latch Assembly", oemPartNumber: "53510-02290" },
  bonnetStrikerPlate:  { name: "Bonnet Striker Plate", oemPartNumber: "53530-02290" },
  frontMudguardLeft:   { name: "Front Mudguard Panel LH", oemPartNumber: "53802-02290", aliases: ["Front Wing LH"] },
  frontMudguardRight:  { name: "Front Mudguard Panel RH", oemPartNumber: "53801-02290" },
  frontMudguardLinerLeft:  { name: "Front Mudguard Liner LH", oemPartNumber: "53875-02290" },
  frontMudguardLinerRight: { name: "Front Mudguard Liner RH", oemPartNumber: "53876-02290" },

  headlampLeft:  { name: "Headlamp Assembly LH", oemPartNumber: "81170-02290" },
  headlampRight: { name: "Headlamp Assembly RH", oemPartNumber: "81130-02290" },
  fogLampLeft:   { name: "Front Fog Lamp LH", oemPartNumber: "81221-02290" },
  fogLampRight:  { name: "Front Fog Lamp RH", oemPartNumber: "81211-02290" },

  engineMountLeft:   { name: "Engine Mounting LH (1ZZ-FE)", oemPartNumber: "12372-22090" },
  engineMountRight:  { name: "Engine Mounting RH (1ZZ-FE)", oemPartNumber: "12361-22090" },
  engineMountFront:  { name: "Engine Torque Strut Mount (Front)", oemPartNumber: "12363-22090" },
  transmissionMount: { name: "Transmission Mounting", oemPartNumber: "12371-22090" },
  subframeFront:     { name: "Front Suspension Crossmember", oemPartNumber: "51201-02290" },

  steeringRack:          { name: "Steering Rack & Pinion Assembly (EPS)", oemPartNumber: "44250-02290" },
  steeringRackBushLeft:  { name: "Steering Rack Bush LH", oemPartNumber: "45516-02290" },
  steeringRackBushRight: { name: "Steering Rack Bush RH", oemPartNumber: "45517-02290" },
  trackRodEndLeft:       { name: "Track Rod End LH", oemPartNumber: "45047-02290" },
  trackRodEndRight:      { name: "Track Rod End RH", oemPartNumber: "45046-02290" },
  frontLowerArmLeft:     { name: "Front Lower Control Arm LH", oemPartNumber: "48069-02290" },
  frontLowerArmRight:    { name: "Front Lower Control Arm RH", oemPartNumber: "48068-02290" },
  frontLowerArmBushLeft:  { name: "Front Lower Arm Bush LH", oemPartNumber: "48654-02290" },
  frontLowerArmBushRight: { name: "Front Lower Arm Bush RH", oemPartNumber: "48655-02290" },
  frontStrutLeft:        { name: "Front Shock Absorber / Strut Assembly LH", oemPartNumber: "48520-02290" },
  frontStrutRight:       { name: "Front Shock Absorber / Strut Assembly RH", oemPartNumber: "48510-02290" },
  frontSpringLeft:       { name: "Front Coil Spring LH", oemPartNumber: "48131-02290" },
  frontSpringRight:      { name: "Front Coil Spring RH", oemPartNumber: "48132-02290" },
  frontHubLeft:          { name: "Front Wheel Hub Assembly LH", oemPartNumber: "43502-02290" },
  frontHubRight:         { name: "Front Wheel Hub Assembly RH", oemPartNumber: "43501-02290" },
  frontWheelBearingLeft:  { name: "Front Wheel Bearing LH", oemPartNumber: "90363-40065" },
  frontWheelBearingRight: { name: "Front Wheel Bearing RH", oemPartNumber: "90363-40065" },

  frontDoorLeft:  { name: "Front Door Assembly LH", oemPartNumber: "67002-02290" },
  frontDoorRight: { name: "Front Door Assembly RH", oemPartNumber: "67001-02290" },
  rearDoorLeft:   { name: "Rear Door Assembly LH", oemPartNumber: "67004-02290" },
  rearDoorRight:  { name: "Rear Door Assembly RH", oemPartNumber: "67003-02290" },
  doorIntrusionBeamFrontLeft:  { name: "Front Door Intrusion Beam LH", oemPartNumber: "67471-02290" },
  doorIntrusionBeamFrontRight: { name: "Front Door Intrusion Beam RH", oemPartNumber: "67470-02290" },
  bPillarLeft:   { name: "B-Pillar Inner Panel LH", oemPartNumber: "61332-02290" },
  bPillarRight:  { name: "B-Pillar Inner Panel RH", oemPartNumber: "61331-02290" },
  rockerSillLeft:  { name: "Sill Panel (Outer) LH", oemPartNumber: "75851-02290" },
  rockerSillRight: { name: "Sill Panel (Outer) RH", oemPartNumber: "75852-02290" },
  sideMirrorLeft:  { name: "Door Mirror Assembly LH (Electric)", oemPartNumber: "87940-02290" },
  sideMirrorRight: { name: "Door Mirror Assembly RH (Electric)", oemPartNumber: "87910-02290" },

  rearBumperCover:         { name: "Rear Bumper Cover", oemPartNumber: "52159-02290" },
  rearBumperReinforcement: { name: "Rear Bumper Reinforcement Bar", oemPartNumber: "52023-02290" },
  bootLid:    { name: "Boot Lid Assembly (Saloon)", oemPartNumber: "64401-02290" },
  rearPanelLeft:  { name: "Rear Quarter Panel LH", oemPartNumber: "61611-02290" },
  rearPanelRight: { name: "Rear Quarter Panel RH", oemPartNumber: "61612-02290" },
  tailLampLeft:  { name: "Rear Combination Lamp LH", oemPartNumber: "81561-02290" },
  tailLampRight: { name: "Rear Combination Lamp RH", oemPartNumber: "81551-02290" },

  windscreen:          { name: "Windscreen Glass (Laminated)", oemPartNumber: "56101-02290" },
  rearWindowGlass:     { name: "Rear Window Glass (Heated)", oemPartNumber: "64810-02290" },
  frontDoorGlassLeft:  { name: "Front Door Glass LH", oemPartNumber: "68101-02290" },
  frontDoorGlassRight: { name: "Front Door Glass RH", oemPartNumber: "68102-02290" },

  batteryTray:    { name: "Battery Tray", oemPartNumber: "74431-02290" },
  fuseBoxEngine:  { name: "Relay Block (Engine Bay)", oemPartNumber: "82641-02290" },
  abs:            { name: "ABS Actuator & Pump Assembly", oemPartNumber: "44510-02290" },
  airbagModuleFront: { name: "Front Airbag Module (Driver SRS)", oemPartNumber: "45130-02290" },
  airbagCurtainLeft:  { name: "Curtain Airbag Module LH", oemPartNumber: "62180-02290" },
  airbagCurtainRight: { name: "Curtain Airbag Module RH", oemPartNumber: "62180-02291" },
};

// ── HONDA FIT / JAZZ (GD1/GD3) 2001–2008 ─────────────────────────────────────
const HONDA_FIT_GD: SaVehiclePartSet = {
  make: "Honda", model: "Fit", yearFrom: 2001, yearTo: 2008,
  engineCodes: ["L13A", "L15A"],

  frontBumperCover:         { name: "Front Bumper Cover", oemPartNumber: "71101-SAA-G00" },
  frontBumperReinforcement: { name: "Front Bumper Beam", oemPartNumber: "71130-SAA-G00" },
  frontBumperAbsorber:      { name: "Front Bumper Absorber", oemPartNumber: "71140-SAA-G00" },
  frontBumperBracketLeft:   { name: "Front Bumper Bracket LH", oemPartNumber: "71195-SAA-G00" },
  frontBumperBracketRight:  { name: "Front Bumper Bracket RH", oemPartNumber: "71196-SAA-G00" },
  radiatorSupportPanel:     { name: "Radiator Support Upper Panel", oemPartNumber: "60400-SAA-G00" },
  radiatorSupportBracketLeft:  { name: "Radiator Support Bracket LH", oemPartNumber: "60410-SAA-G00" },
  radiatorSupportBracketRight: { name: "Radiator Support Bracket RH", oemPartNumber: "60411-SAA-G00" },

  radiator:       { name: "Radiator Assembly (L13A/L15A)", oemPartNumber: "19010-RME-W51", notes: "Aluminium core" },
  acCondenser:    { name: "A/C Condenser Assembly", oemPartNumber: "80110-SAA-G00", notes: "R134a" },
  coolingFan:     { name: "Cooling Fan Assembly (Electric)", oemPartNumber: "19030-RME-W51" },
  coolingFanShroud: { name: "Cooling Fan Shroud", oemPartNumber: "19015-RME-W51" },

  bonnet:              { name: "Bonnet Panel", oemPartNumber: "60100-SAA-G00" },
  bonnetHingeLeft:     { name: "Bonnet Hinge LH", oemPartNumber: "60170-SAA-G00" },
  bonnetHingeRight:    { name: "Bonnet Hinge RH", oemPartNumber: "60160-SAA-G00" },
  bonnetLatch:         { name: "Bonnet Latch Assembly", oemPartNumber: "74120-SAA-G00" },
  bonnetStrikerPlate:  { name: "Bonnet Striker Plate", oemPartNumber: "74140-SAA-G00" },
  frontMudguardLeft:   { name: "Front Mudguard Panel LH", oemPartNumber: "60261-SAA-G00", aliases: ["Front Wing LH"] },
  frontMudguardRight:  { name: "Front Mudguard Panel RH", oemPartNumber: "60211-SAA-G00" },
  frontMudguardLinerLeft:  { name: "Front Mudguard Liner LH", oemPartNumber: "74101-SAA-G00" },
  frontMudguardLinerRight: { name: "Front Mudguard Liner RH", oemPartNumber: "74111-SAA-G00" },

  headlampLeft:  { name: "Headlamp Assembly LH", oemPartNumber: "33151-SAA-G01" },
  headlampRight: { name: "Headlamp Assembly RH", oemPartNumber: "33101-SAA-G01" },
  fogLampLeft:   { name: "Front Fog Lamp LH", oemPartNumber: "33951-SAA-G00" },
  fogLampRight:  { name: "Front Fog Lamp RH", oemPartNumber: "33901-SAA-G00" },

  engineMountLeft:   { name: "Engine Mounting LH (L13A)", oemPartNumber: "50821-SAA-G00" },
  engineMountRight:  { name: "Engine Mounting RH (L13A)", oemPartNumber: "50810-SAA-G00" },
  engineMountFront:  { name: "Engine Torque Strut Mount (Front)", oemPartNumber: "50840-SAA-G00" },
  transmissionMount: { name: "Transmission Mounting", oemPartNumber: "50850-SAA-G00" },
  subframeFront:     { name: "Front Sub-Frame Assembly", oemPartNumber: "50200-SAA-G00" },

  steeringRack:          { name: "Steering Rack & Pinion Assembly (EPS)", oemPartNumber: "53601-SAA-G00" },
  steeringRackBushLeft:  { name: "Steering Rack Bush LH", oemPartNumber: "53685-SAA-G00" },
  steeringRackBushRight: { name: "Steering Rack Bush RH", oemPartNumber: "53686-SAA-G00" },
  trackRodEndLeft:       { name: "Track Rod End LH", oemPartNumber: "53560-SAA-G00" },
  trackRodEndRight:      { name: "Track Rod End RH", oemPartNumber: "53540-SAA-G00" },
  frontLowerArmLeft:     { name: "Front Lower Control Arm LH", oemPartNumber: "51360-SAA-G00" },
  frontLowerArmRight:    { name: "Front Lower Control Arm RH", oemPartNumber: "51350-SAA-G00" },
  frontLowerArmBushLeft:  { name: "Front Lower Arm Bush LH", oemPartNumber: "51391-SAA-G00" },
  frontLowerArmBushRight: { name: "Front Lower Arm Bush RH", oemPartNumber: "51392-SAA-G00" },
  frontStrutLeft:        { name: "Front Shock Absorber / Strut Assembly LH", oemPartNumber: "51621-SAA-G00" },
  frontStrutRight:       { name: "Front Shock Absorber / Strut Assembly RH", oemPartNumber: "51611-SAA-G00" },
  frontSpringLeft:       { name: "Front Coil Spring LH", oemPartNumber: "51401-SAA-G00" },
  frontSpringRight:      { name: "Front Coil Spring RH", oemPartNumber: "51402-SAA-G00" },
  frontHubLeft:          { name: "Front Wheel Hub Assembly LH", oemPartNumber: "44600-SAA-G00" },
  frontHubRight:         { name: "Front Wheel Hub Assembly RH", oemPartNumber: "44600-SAA-G01" },
  frontWheelBearingLeft:  { name: "Front Wheel Bearing LH", oemPartNumber: "44300-SAA-G00" },
  frontWheelBearingRight: { name: "Front Wheel Bearing RH", oemPartNumber: "44300-SAA-G01" },

  frontDoorLeft:  { name: "Front Door Assembly LH", oemPartNumber: "67050-SAA-G00" },
  frontDoorRight: { name: "Front Door Assembly RH", oemPartNumber: "67010-SAA-G00" },
  rearDoorLeft:   { name: "Rear Door Assembly LH", oemPartNumber: "67550-SAA-G00" },
  rearDoorRight:  { name: "Rear Door Assembly RH", oemPartNumber: "67510-SAA-G00" },
  doorIntrusionBeamFrontLeft:  { name: "Front Door Intrusion Beam LH", oemPartNumber: "67471-SAA-G00" },
  doorIntrusionBeamFrontRight: { name: "Front Door Intrusion Beam RH", oemPartNumber: "67470-SAA-G00" },
  bPillarLeft:   { name: "B-Pillar Inner Panel LH", oemPartNumber: "63410-SAA-G00" },
  bPillarRight:  { name: "B-Pillar Inner Panel RH", oemPartNumber: "63420-SAA-G00" },
  rockerSillLeft:  { name: "Sill Panel (Outer) LH", oemPartNumber: "04636-SAA-G00" },
  rockerSillRight: { name: "Sill Panel (Outer) RH", oemPartNumber: "04637-SAA-G00" },
  sideMirrorLeft:  { name: "Door Mirror Assembly LH (Electric)", oemPartNumber: "76250-SAA-G00" },
  sideMirrorRight: { name: "Door Mirror Assembly RH (Electric)", oemPartNumber: "76200-SAA-G00" },

  rearBumperCover:         { name: "Rear Bumper Cover", oemPartNumber: "71501-SAA-G00" },
  rearBumperReinforcement: { name: "Rear Bumper Beam", oemPartNumber: "71530-SAA-G00" },
  tailgate:   { name: "Tailgate Assembly (Hatchback)", oemPartNumber: "68100-SAA-G00" },
  rearPanelLeft:  { name: "Rear Quarter Panel LH", oemPartNumber: "63600-SAA-G00" },
  rearPanelRight: { name: "Rear Quarter Panel RH", oemPartNumber: "63610-SAA-G00" },
  tailLampLeft:  { name: "Rear Combination Lamp LH", oemPartNumber: "33551-SAA-G01" },
  tailLampRight: { name: "Rear Combination Lamp RH", oemPartNumber: "33501-SAA-G01" },

  windscreen:          { name: "Windscreen Glass (Laminated)", oemPartNumber: "73111-SAA-G00" },
  rearWindowGlass:     { name: "Rear Window Glass (Heated)", oemPartNumber: "73211-SAA-G00" },
  frontDoorGlassLeft:  { name: "Front Door Glass LH", oemPartNumber: "73350-SAA-G00" },
  frontDoorGlassRight: { name: "Front Door Glass RH", oemPartNumber: "73300-SAA-G00" },

  batteryTray:    { name: "Battery Tray", oemPartNumber: "31521-SAA-G00" },
  fuseBoxEngine:  { name: "Under-Bonnet Fuse/Relay Box", oemPartNumber: "38250-SAA-G00" },
  abs:            { name: "ABS Modulator Assembly", oemPartNumber: "57110-SAA-G00" },
  airbagModuleFront: { name: "Front Airbag Module (Driver SRS)", oemPartNumber: "77810-SAA-G00" },
  airbagCurtainLeft:  { name: "Curtain Airbag Module LH", oemPartNumber: "78870-SAA-G00" },
  airbagCurtainRight: { name: "Curtain Airbag Module RH", oemPartNumber: "78871-SAA-G00" },
};

// ── MAZDA DEMIO / MAZDA2 (DY/DE) 2002–2014 ───────────────────────────────────
const MAZDA_DEMIO_DY_DE: SaVehiclePartSet = {
  make: "Mazda", model: "Demio", yearFrom: 2002, yearTo: 2014,
  engineCodes: ["ZJ-VE", "ZY-VE", "P3-VPS"],

  frontBumperCover:         { name: "Front Bumper Cover", oemPartNumber: "B34F-50-031" },
  frontBumperReinforcement: { name: "Front Bumper Reinforcement Bar", oemPartNumber: "B34F-50-1E0" },
  frontBumperAbsorber:      { name: "Front Bumper Absorber", oemPartNumber: "B34F-50-1F0" },
  frontBumperBracketLeft:   { name: "Front Bumper Bracket LH", oemPartNumber: "B34F-50-1G1" },
  frontBumperBracketRight:  { name: "Front Bumper Bracket RH", oemPartNumber: "B34F-50-1H1" },
  radiatorSupportPanel:     { name: "Radiator Support Panel (Upper)", oemPartNumber: "B34F-53-100" },
  radiatorSupportBracketLeft:  { name: "Radiator Support Bracket LH", oemPartNumber: "B34F-53-110" },
  radiatorSupportBracketRight: { name: "Radiator Support Bracket RH", oemPartNumber: "B34F-53-120" },

  radiator:       { name: "Radiator Assembly (ZJ-VE/ZY-VE)", oemPartNumber: "B34F-15-200" },
  acCondenser:    { name: "A/C Condenser Assembly", oemPartNumber: "BP4K-61-480" },
  coolingFan:     { name: "Cooling Fan Assembly (Electric)", oemPartNumber: "B34F-15-025" },
  coolingFanShroud: { name: "Cooling Fan Shroud", oemPartNumber: "B34F-15-210" },

  bonnet:              { name: "Bonnet Panel", oemPartNumber: "B34F-52-310" },
  bonnetHingeLeft:     { name: "Bonnet Hinge LH", oemPartNumber: "B34F-52-250" },
  bonnetHingeRight:    { name: "Bonnet Hinge RH", oemPartNumber: "B34F-52-240" },
  bonnetLatch:         { name: "Bonnet Latch Assembly", oemPartNumber: "B34F-56-620" },
  bonnetStrikerPlate:  { name: "Bonnet Striker Plate", oemPartNumber: "B34F-56-630" },
  frontMudguardLeft:   { name: "Front Mudguard Panel LH", oemPartNumber: "B34F-52-210" },
  frontMudguardRight:  { name: "Front Mudguard Panel RH", oemPartNumber: "B34F-52-220" },
  frontMudguardLinerLeft:  { name: "Front Mudguard Liner LH", oemPartNumber: "B34F-56-111" },
  frontMudguardLinerRight: { name: "Front Mudguard Liner RH", oemPartNumber: "B34F-56-121" },

  headlampLeft:  { name: "Headlamp Assembly LH", oemPartNumber: "B34F-51-040" },
  headlampRight: { name: "Headlamp Assembly RH", oemPartNumber: "B34F-51-030" },

  engineMountLeft:   { name: "Engine Mounting LH (ZJ-VE)", oemPartNumber: "B34F-39-040" },
  engineMountRight:  { name: "Engine Mounting RH (ZJ-VE)", oemPartNumber: "B34F-39-050" },
  engineMountFront:  { name: "Engine Torque Strut Mount (Front)", oemPartNumber: "B34F-39-060" },
  transmissionMount: { name: "Transmission Mounting", oemPartNumber: "B34F-39-070" },
  subframeFront:     { name: "Front Sub-Frame Assembly", oemPartNumber: "B34F-34-800" },

  steeringRack:          { name: "Steering Rack & Pinion Assembly (EPS)", oemPartNumber: "B34F-32-110" },
  steeringRackBushLeft:  { name: "Steering Rack Bush LH", oemPartNumber: "B34F-32-115" },
  steeringRackBushRight: { name: "Steering Rack Bush RH", oemPartNumber: "B34F-32-116" },
  trackRodEndLeft:       { name: "Track Rod End LH", oemPartNumber: "B34F-32-280" },
  trackRodEndRight:      { name: "Track Rod End RH", oemPartNumber: "B34F-32-290" },
  frontLowerArmLeft:     { name: "Front Lower Control Arm LH", oemPartNumber: "B34F-34-350" },
  frontLowerArmRight:    { name: "Front Lower Control Arm RH", oemPartNumber: "B34F-34-360" },
  frontLowerArmBushLeft:  { name: "Front Lower Arm Bush LH", oemPartNumber: "B34F-34-156" },
  frontLowerArmBushRight: { name: "Front Lower Arm Bush RH", oemPartNumber: "B34F-34-157" },
  frontStrutLeft:        { name: "Front Shock Absorber / Strut Assembly LH", oemPartNumber: "B34F-34-700" },
  frontStrutRight:       { name: "Front Shock Absorber / Strut Assembly RH", oemPartNumber: "B34F-34-710" },
  frontSpringLeft:       { name: "Front Coil Spring LH", oemPartNumber: "B34F-34-011" },
  frontSpringRight:      { name: "Front Coil Spring RH", oemPartNumber: "B34F-34-012" },
  frontHubLeft:          { name: "Front Wheel Hub Assembly LH", oemPartNumber: "B34F-33-040" },
  frontHubRight:         { name: "Front Wheel Hub Assembly RH", oemPartNumber: "B34F-33-050" },
  frontWheelBearingLeft:  { name: "Front Wheel Bearing LH", oemPartNumber: "B34F-33-047" },
  frontWheelBearingRight: { name: "Front Wheel Bearing RH", oemPartNumber: "B34F-33-057" },

  frontDoorLeft:  { name: "Front Door Assembly LH", oemPartNumber: "B34F-59-010" },
  frontDoorRight: { name: "Front Door Assembly RH", oemPartNumber: "B34F-59-020" },
  rearDoorLeft:   { name: "Rear Door Assembly LH", oemPartNumber: "B34F-59-030" },
  rearDoorRight:  { name: "Rear Door Assembly RH", oemPartNumber: "B34F-59-040" },
  doorIntrusionBeamFrontLeft:  { name: "Front Door Intrusion Beam LH", oemPartNumber: "B34F-59-211" },
  doorIntrusionBeamFrontRight: { name: "Front Door Intrusion Beam RH", oemPartNumber: "B34F-59-221" },
  bPillarLeft:   { name: "B-Pillar Inner Panel LH", oemPartNumber: "B34F-53-460" },
  bPillarRight:  { name: "B-Pillar Inner Panel RH", oemPartNumber: "B34F-53-470" },
  rockerSillLeft:  { name: "Sill Panel (Outer) LH", oemPartNumber: "B34F-53-480" },
  rockerSillRight: { name: "Sill Panel (Outer) RH", oemPartNumber: "B34F-53-490" },
  sideMirrorLeft:  { name: "Door Mirror Assembly LH (Electric)", oemPartNumber: "B34F-69-180" },
  sideMirrorRight: { name: "Door Mirror Assembly RH (Electric)", oemPartNumber: "B34F-69-190" },

  rearBumperCover:         { name: "Rear Bumper Cover", oemPartNumber: "B34F-50-221" },
  rearBumperReinforcement: { name: "Rear Bumper Reinforcement Bar", oemPartNumber: "B34F-50-2E0" },
  tailgate:   { name: "Tailgate Assembly (Hatchback)", oemPartNumber: "B34F-62-020" },
  rearPanelLeft:  { name: "Rear Quarter Panel LH", oemPartNumber: "B34F-53-600" },
  rearPanelRight: { name: "Rear Quarter Panel RH", oemPartNumber: "B34F-53-610" },
  tailLampLeft:  { name: "Rear Combination Lamp LH", oemPartNumber: "B34F-51-160" },
  tailLampRight: { name: "Rear Combination Lamp RH", oemPartNumber: "B34F-51-150" },

  windscreen:          { name: "Windscreen Glass (Laminated)", oemPartNumber: "B34F-63-900" },
  rearWindowGlass:     { name: "Rear Window Glass", oemPartNumber: "B34F-63-910" },
  frontDoorGlassLeft:  { name: "Front Door Glass LH", oemPartNumber: "B34F-59-511" },
  frontDoorGlassRight: { name: "Front Door Glass RH", oemPartNumber: "B34F-59-521" },

  batteryTray:    { name: "Battery Tray", oemPartNumber: "B34F-56-041" },
  fuseBoxEngine:  { name: "Main Fuse Box (Engine Bay)", oemPartNumber: "B34F-67-010" },
  abs:            { name: "ABS Modulator Assembly", oemPartNumber: "B34F-43-7A0" },
  airbagModuleFront: { name: "Front Airbag Module (Driver SRS)", oemPartNumber: "B34F-57-K00" },
};

// ── ISUZU KB / D-MAX (TFR/TFS) 2002–2012 ─────────────────────────────────────
const ISUZU_DMAX_TFR: SaVehiclePartSet = {
  make: "Isuzu", model: "D-Max", yearFrom: 2002, yearTo: 2012,
  engineCodes: ["4JA1", "4JH1-TC", "4JK1-TC", "4JJ1-TC"],

  frontBumperCover:         { name: "Front Bumper Assembly (Steel)", oemPartNumber: "8-97213-800-0", notes: "Steel step bumper, bakkie" },
  frontBumperReinforcement: { name: "Front Bumper Reinforcement Bar", oemPartNumber: "8-97213-801-0" },
  frontBumperAbsorber:      { name: "Front Bumper Absorber", oemPartNumber: "8-97213-802-0" },
  frontBumperBracketLeft:   { name: "Front Bumper Bracket LH", oemPartNumber: "8-97213-803-0" },
  frontBumperBracketRight:  { name: "Front Bumper Bracket RH", oemPartNumber: "8-97213-804-0" },
  radiatorSupportPanel:     { name: "Radiator Support Panel (Upper)", oemPartNumber: "8-97213-900-0" },
  radiatorSupportBracketLeft:  { name: "Radiator Support Bracket LH", oemPartNumber: "8-97213-901-0" },
  radiatorSupportBracketRight: { name: "Radiator Support Bracket RH", oemPartNumber: "8-97213-902-0" },

  radiator:       { name: "Radiator Assembly (4JH1-TC/4JJ1-TC)", oemPartNumber: "8-97213-500-0", notes: "Heavy duty, aluminium core" },
  acCondenser:    { name: "A/C Condenser Assembly", oemPartNumber: "8-97213-600-0" },
  coolingFan:     { name: "Cooling Fan (Viscous Clutch Type)", oemPartNumber: "8-97213-550-0" },
  coolingFanShroud: { name: "Cooling Fan Shroud", oemPartNumber: "8-97213-551-0" },
  intercooler:    { name: "Intercooler Assembly (Turbo Diesel)", oemPartNumber: "8-97213-700-0" },

  bonnet:              { name: "Bonnet Panel", oemPartNumber: "8-97213-100-0" },
  bonnetHingeLeft:     { name: "Bonnet Hinge LH", oemPartNumber: "8-97213-101-0" },
  bonnetHingeRight:    { name: "Bonnet Hinge RH", oemPartNumber: "8-97213-102-0" },
  bonnetLatch:         { name: "Bonnet Latch Assembly", oemPartNumber: "8-97213-103-0" },
  bonnetStrikerPlate:  { name: "Bonnet Striker Plate", oemPartNumber: "8-97213-104-0" },
  frontMudguardLeft:   { name: "Front Mudguard Panel LH (Flared)", oemPartNumber: "8-97213-200-0", aliases: ["Front Wing LH"] },
  frontMudguardRight:  { name: "Front Mudguard Panel RH (Flared)", oemPartNumber: "8-97213-201-0" },
  frontMudguardLinerLeft:  { name: "Front Mudguard Liner LH", oemPartNumber: "8-97213-202-0" },
  frontMudguardLinerRight: { name: "Front Mudguard Liner RH", oemPartNumber: "8-97213-203-0" },

  headlampLeft:  { name: "Headlamp Assembly LH", oemPartNumber: "8-97213-300-0" },
  headlampRight: { name: "Headlamp Assembly RH", oemPartNumber: "8-97213-301-0" },
  fogLampLeft:   { name: "Front Fog Lamp LH", oemPartNumber: "8-97213-302-0" },
  fogLampRight:  { name: "Front Fog Lamp RH", oemPartNumber: "8-97213-303-0" },

  engineMountLeft:   { name: "Engine Mounting LH (4JJ1-TC)", oemPartNumber: "8-97213-400-0" },
  engineMountRight:  { name: "Engine Mounting RH (4JJ1-TC)", oemPartNumber: "8-97213-401-0" },
  transmissionMount: { name: "Transmission Mounting (4WD)", oemPartNumber: "8-97213-402-0" },
  subframeFront:     { name: "Front Crossmember (Ladder Frame)", oemPartNumber: "8-97213-403-0", notes: "Ladder frame chassis, not monocoque" },

  steeringRack:          { name: "Steering Gear Box (Recirculating Ball)", oemPartNumber: "8-97213-450-0", notes: "Recirculating ball type, not rack & pinion" },
  steeringRackBushLeft:  { name: "Steering Gear Box Bush LH", oemPartNumber: "8-97213-451-0" },
  steeringRackBushRight: { name: "Steering Gear Box Bush RH", oemPartNumber: "8-97213-452-0" },
  trackRodEndLeft:       { name: "Drag Link End LH", oemPartNumber: "8-97213-453-0" },
  trackRodEndRight:      { name: "Drag Link End RH", oemPartNumber: "8-97213-454-0" },
  frontLowerArmLeft:     { name: "Front Lower Control Arm LH (4WD)", oemPartNumber: "8-97213-460-0" },
  frontLowerArmRight:    { name: "Front Lower Control Arm RH (4WD)", oemPartNumber: "8-97213-461-0" },
  frontLowerArmBushLeft:  { name: "Front Lower Arm Bush LH", oemPartNumber: "8-97213-462-0" },
  frontLowerArmBushRight: { name: "Front Lower Arm Bush RH", oemPartNumber: "8-97213-463-0" },
  frontStrutLeft:        { name: "Front Shock Absorber LH (Torsion Bar)", oemPartNumber: "8-97213-470-0" },
  frontStrutRight:       { name: "Front Shock Absorber RH (Torsion Bar)", oemPartNumber: "8-97213-471-0" },
  frontSpringLeft:       { name: "Front Torsion Bar LH", oemPartNumber: "8-97213-472-0" },
  frontSpringRight:      { name: "Front Torsion Bar RH", oemPartNumber: "8-97213-473-0" },
  frontHubLeft:          { name: "Front Wheel Hub Assembly LH (4WD)", oemPartNumber: "8-97213-480-0" },
  frontHubRight:         { name: "Front Wheel Hub Assembly RH (4WD)", oemPartNumber: "8-97213-481-0" },
  frontWheelBearingLeft:  { name: "Front Wheel Bearing LH", oemPartNumber: "8-97213-482-0" },
  frontWheelBearingRight: { name: "Front Wheel Bearing RH", oemPartNumber: "8-97213-483-0" },

  frontDoorLeft:  { name: "Front Door Assembly LH (Double Cab)", oemPartNumber: "8-97213-150-0" },
  frontDoorRight: { name: "Front Door Assembly RH (Double Cab)", oemPartNumber: "8-97213-151-0" },
  rearDoorLeft:   { name: "Rear Door Assembly LH (Double Cab)", oemPartNumber: "8-97213-152-0" },
  rearDoorRight:  { name: "Rear Door Assembly RH (Double Cab)", oemPartNumber: "8-97213-153-0" },
  doorIntrusionBeamFrontLeft:  { name: "Front Door Intrusion Beam LH", oemPartNumber: "8-97213-154-0" },
  doorIntrusionBeamFrontRight: { name: "Front Door Intrusion Beam RH", oemPartNumber: "8-97213-155-0" },
  bPillarLeft:   { name: "B-Pillar Inner Panel LH", oemPartNumber: "8-97213-156-0" },
  bPillarRight:  { name: "B-Pillar Inner Panel RH", oemPartNumber: "8-97213-157-0" },
  rockerSillLeft:  { name: "Sill Panel (Outer) LH", oemPartNumber: "8-97213-158-0" },
  rockerSillRight: { name: "Sill Panel (Outer) RH", oemPartNumber: "8-97213-159-0" },
  sideMirrorLeft:  { name: "Door Mirror Assembly LH (Electric, Heated)", oemPartNumber: "8-97213-160-0" },
  sideMirrorRight: { name: "Door Mirror Assembly RH (Electric, Heated)", oemPartNumber: "8-97213-161-0" },

  rearBumperCover:         { name: "Rear Step Bumper Assembly (Steel)", oemPartNumber: "8-97213-850-0" },
  rearBumperReinforcement: { name: "Rear Bumper Reinforcement Bar", oemPartNumber: "8-97213-851-0" },
  tailgate:   { name: "Tailgate Assembly (Bakkie Load Box)", oemPartNumber: "8-97213-900-1" },
  rearPanelLeft:  { name: "Rear Quarter Panel LH", oemPartNumber: "8-97213-901-1" },
  rearPanelRight: { name: "Rear Quarter Panel RH", oemPartNumber: "8-97213-902-1" },
  tailLampLeft:  { name: "Rear Combination Lamp LH", oemPartNumber: "8-97213-350-0" },
  tailLampRight: { name: "Rear Combination Lamp RH", oemPartNumber: "8-97213-351-0" },

  windscreen:          { name: "Windscreen Glass (Laminated)", oemPartNumber: "8-97213-700-1" },
  rearWindowGlass:     { name: "Rear Window Glass (Sliding)", oemPartNumber: "8-97213-701-1" },
  frontDoorGlassLeft:  { name: "Front Door Glass LH", oemPartNumber: "8-97213-702-1" },
  frontDoorGlassRight: { name: "Front Door Glass RH", oemPartNumber: "8-97213-703-1" },

  batteryTray:    { name: "Battery Tray", oemPartNumber: "8-97213-800-1" },
  fuseBoxEngine:  { name: "Fuse/Relay Block (Engine Bay)", oemPartNumber: "8-97213-801-1" },
  abs:            { name: "ABS Modulator Assembly", oemPartNumber: "8-97213-802-1" },
};

// ── HYUNDAI H100 / PORTER (2.5D) 1993–2013 ───────────────────────────────────
const HYUNDAI_H100: SaVehiclePartSet = {
  make: "Hyundai", model: "H100", yearFrom: 1993, yearTo: 2013,
  engineCodes: ["D4BB", "D4BH"],

  frontBumperCover:         { name: "Front Bumper Assembly (Steel)", oemPartNumber: "86511-43100" },
  frontBumperReinforcement: { name: "Front Bumper Reinforcement Bar", oemPartNumber: "86530-43100" },
  frontBumperAbsorber:      { name: "Front Bumper Absorber", oemPartNumber: "86540-43100" },
  frontBumperBracketLeft:   { name: "Front Bumper Bracket LH", oemPartNumber: "86515-43100" },
  frontBumperBracketRight:  { name: "Front Bumper Bracket RH", oemPartNumber: "86516-43100" },
  radiatorSupportPanel:     { name: "Radiator Support Panel (Upper)", oemPartNumber: "64101-43100" },
  radiatorSupportBracketLeft:  { name: "Radiator Support Bracket LH", oemPartNumber: "64111-43100" },
  radiatorSupportBracketRight: { name: "Radiator Support Bracket RH", oemPartNumber: "64112-43100" },

  radiator:       { name: "Radiator Assembly (D4BH Diesel)", oemPartNumber: "25310-43100", notes: "Heavy duty, aluminium core" },
  acCondenser:    { name: "A/C Condenser Assembly", oemPartNumber: "97606-43100" },
  coolingFan:     { name: "Cooling Fan (Viscous Clutch)", oemPartNumber: "25231-43100" },
  coolingFanShroud: { name: "Cooling Fan Shroud", oemPartNumber: "25350-43100" },

  bonnet:              { name: "Bonnet Panel", oemPartNumber: "66400-43100" },
  bonnetHingeLeft:     { name: "Bonnet Hinge LH", oemPartNumber: "79110-43100" },
  bonnetHingeRight:    { name: "Bonnet Hinge RH", oemPartNumber: "79120-43100" },
  bonnetLatch:         { name: "Bonnet Latch Assembly", oemPartNumber: "81130-43100" },
  bonnetStrikerPlate:  { name: "Bonnet Striker Plate", oemPartNumber: "81140-43100" },
  frontMudguardLeft:   { name: "Front Mudguard Panel LH", oemPartNumber: "66311-43100" },
  frontMudguardRight:  { name: "Front Mudguard Panel RH", oemPartNumber: "66321-43100" },
  frontMudguardLinerLeft:  { name: "Front Mudguard Liner LH", oemPartNumber: "86811-43100" },
  frontMudguardLinerRight: { name: "Front Mudguard Liner RH", oemPartNumber: "86821-43100" },

  headlampLeft:  { name: "Headlamp Assembly LH", oemPartNumber: "92101-43100" },
  headlampRight: { name: "Headlamp Assembly RH", oemPartNumber: "92102-43100" },

  engineMountLeft:   { name: "Engine Mounting LH (D4BH)", oemPartNumber: "21810-43100" },
  engineMountRight:  { name: "Engine Mounting RH (D4BH)", oemPartNumber: "21820-43100" },
  transmissionMount: { name: "Transmission Mounting", oemPartNumber: "21830-43100" },
  subframeFront:     { name: "Front Crossmember", oemPartNumber: "62400-43100" },

  steeringRack:          { name: "Steering Gear Box (Recirculating Ball)", oemPartNumber: "56500-43100" },
  steeringRackBushLeft:  { name: "Steering Gear Box Bush LH", oemPartNumber: "56511-43100" },
  steeringRackBushRight: { name: "Steering Gear Box Bush RH", oemPartNumber: "56512-43100" },
  trackRodEndLeft:       { name: "Track Rod End LH", oemPartNumber: "56820-43100" },
  trackRodEndRight:      { name: "Track Rod End RH", oemPartNumber: "56830-43100" },
  frontLowerArmLeft:     { name: "Front Lower Control Arm LH", oemPartNumber: "54501-43100" },
  frontLowerArmRight:    { name: "Front Lower Control Arm RH", oemPartNumber: "54511-43100" },
  frontLowerArmBushLeft:  { name: "Front Lower Arm Bush LH", oemPartNumber: "54551-43100" },
  frontLowerArmBushRight: { name: "Front Lower Arm Bush RH", oemPartNumber: "54561-43100" },
  frontStrutLeft:        { name: "Front Shock Absorber LH", oemPartNumber: "54611-43100" },
  frontStrutRight:       { name: "Front Shock Absorber RH", oemPartNumber: "54621-43100" },
  frontSpringLeft:       { name: "Front Leaf Spring LH", oemPartNumber: "54410-43100", notes: "Leaf spring suspension" },
  frontSpringRight:      { name: "Front Leaf Spring RH", oemPartNumber: "54420-43100" },
  frontHubLeft:          { name: "Front Wheel Hub Assembly LH", oemPartNumber: "51750-43100" },
  frontHubRight:         { name: "Front Wheel Hub Assembly RH", oemPartNumber: "51760-43100" },
  frontWheelBearingLeft:  { name: "Front Wheel Bearing LH (Tapered)", oemPartNumber: "51720-43100" },
  frontWheelBearingRight: { name: "Front Wheel Bearing RH (Tapered)", oemPartNumber: "51730-43100" },

  frontDoorLeft:  { name: "Front Door Assembly LH", oemPartNumber: "76003-43100" },
  frontDoorRight: { name: "Front Door Assembly RH", oemPartNumber: "76004-43100" },
  doorIntrusionBeamFrontLeft:  { name: "Front Door Intrusion Beam LH", oemPartNumber: "76471-43100" },
  doorIntrusionBeamFrontRight: { name: "Front Door Intrusion Beam RH", oemPartNumber: "76472-43100" },
  bPillarLeft:   { name: "B-Pillar Inner Panel LH", oemPartNumber: "71331-43100" },
  bPillarRight:  { name: "B-Pillar Inner Panel RH", oemPartNumber: "71332-43100" },
  rockerSillLeft:  { name: "Sill Panel (Outer) LH", oemPartNumber: "71411-43100" },
  rockerSillRight: { name: "Sill Panel (Outer) RH", oemPartNumber: "71412-43100" },
  sideMirrorLeft:  { name: "Door Mirror Assembly LH (Manual)", oemPartNumber: "87611-43100" },
  sideMirrorRight: { name: "Door Mirror Assembly RH (Manual)", oemPartNumber: "87621-43100" },

  rearBumperCover:         { name: "Rear Bumper Assembly (Steel)", oemPartNumber: "86611-43100" },
  rearBumperReinforcement: { name: "Rear Bumper Reinforcement Bar", oemPartNumber: "86630-43100" },
  tailgate:   { name: "Rear Door / Cargo Door Assembly", oemPartNumber: "73700-43100" },
  rearPanelLeft:  { name: "Rear Quarter Panel LH", oemPartNumber: "71611-43100" },
  rearPanelRight: { name: "Rear Quarter Panel RH", oemPartNumber: "71612-43100" },
  tailLampLeft:  { name: "Rear Combination Lamp LH", oemPartNumber: "92401-43100" },
  tailLampRight: { name: "Rear Combination Lamp RH", oemPartNumber: "92402-43100" },

  windscreen:          { name: "Windscreen Glass (Laminated)", oemPartNumber: "86110-43100" },
  rearWindowGlass:     { name: "Rear Window Glass", oemPartNumber: "86210-43100" },
  frontDoorGlassLeft:  { name: "Front Door Glass LH", oemPartNumber: "82310-43100" },
  frontDoorGlassRight: { name: "Front Door Glass RH", oemPartNumber: "82320-43100" },

  batteryTray:    { name: "Battery Tray", oemPartNumber: "37150-43100" },
  fuseBoxEngine:  { name: "Fuse/Relay Box (Engine Bay)", oemPartNumber: "91950-43100" },
  abs:            { name: "ABS Modulator Assembly", oemPartNumber: "58920-43100" },
};

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE INDEX
// ─────────────────────────────────────────────────────────────────────────────

const SA_PARTS_DB: SaVehiclePartSet[] = [
  NISSAN_AD_Y11,
  NISSAN_TIIDA_C11,
  TOYOTA_COROLLA_AE101,
  TOYOTA_COROLLA_ZZE122,
  HONDA_FIT_GD,
  MAZDA_DEMIO_DY_DE,
  ISUZU_DMAX_TFR,
  HYUNDAI_H100,
];

// ─────────────────────────────────────────────────────────────────────────────
// LOOKUP FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Look up SA-standard part names for a vehicle.
 *
 * Matching strategy (in order):
 * 1. Exact make + model + year within range
 * 2. Exact make + model (any year)
 * 3. null (caller should fall back to generic names)
 *
 * @param make  Vehicle make (case-insensitive, e.g. "nissan", "TOYOTA")
 * @param model Vehicle model (case-insensitive, e.g. "ad wagon", "Corolla")
 * @param year  Model year (e.g. 2003)
 */
export function lookupSaParts(
  make: string,
  model: string,
  year?: number
): SaVehiclePartSet | null {
  const normMake = make.trim().toLowerCase();
  const normModel = model.trim().toLowerCase();

  // Normalise common model aliases
  const modelAliases: Record<string, string> = {
    "ad": "ad wagon",
    "ad van": "ad wagon",
    "tiida latio": "tiida",
    "jazz": "fit",
    "fit jazz": "fit",
    "demio": "demio",
    "mazda2": "demio",
    "mazda 2": "demio",
    "kb": "d-max",
    "kb250": "d-max",
    "kb300": "d-max",
    "d max": "d-max",
    "dmax": "d-max",
    "h100 porter": "h100",
    "porter": "h100",
    "minibus": "h100",
  };

  const resolvedModel = modelAliases[normModel] ?? normModel;

  // Pass 1: exact make + model + year in range
  if (year) {
    const exact = SA_PARTS_DB.find(
      (v) =>
        v.make.toLowerCase() === normMake &&
        v.model.toLowerCase() === resolvedModel &&
        year >= v.yearFrom &&
        year <= v.yearTo
    );
    if (exact) return exact;
  }

  // Pass 2: exact make + model (any year — use most recent entry)
  const byModel = SA_PARTS_DB
    .filter(
      (v) =>
        v.make.toLowerCase() === normMake &&
        v.model.toLowerCase() === resolvedModel
    )
    .sort((a, b) => b.yearTo - a.yearTo);

  if (byModel.length > 0) return byModel[0];

  return null;
}

/**
 * Get the SA-standard name for a specific part on a vehicle.
 * Returns the generic fallback name if the vehicle is not in the database.
 *
 * @param partKey   Key of the part in SaVehiclePartSet (e.g. "frontBumperReinforcement")
 * @param make      Vehicle make
 * @param model     Vehicle model
 * @param year      Model year
 * @param fallback  Generic name to use if vehicle not found
 */
export function getSaPartName(
  partKey: keyof SaVehiclePartSet,
  make: string,
  model: string,
  year?: number,
  fallback?: string
): string {
  const partSet = lookupSaParts(make, model, year);
  if (!partSet) return fallback ?? String(partKey);

  const part = partSet[partKey];
  if (!part || typeof part !== "object" || !("name" in part)) {
    return fallback ?? String(partKey);
  }

  return (part as SaPartRecord).name;
}

/**
 * Get the OEM part number for a specific part on a vehicle.
 * Returns undefined if not found.
 */
export function getSaPartOemNumber(
  partKey: keyof SaVehiclePartSet,
  make: string,
  model: string,
  year?: number
): string | undefined {
  const partSet = lookupSaParts(make, model, year);
  if (!partSet) return undefined;

  const part = partSet[partKey];
  if (!part || typeof part !== "object" || !("oemPartNumber" in part)) {
    return undefined;
  }

  return (part as SaPartRecord).oemPartNumber;
}
