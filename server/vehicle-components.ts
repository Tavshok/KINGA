/**
 * vehicle-components.ts
 *
 * Maps vehicle make/model/year/powertrain to actual structural part names used in
 * hidden damage inference. All names are specific to the vehicle's actual architecture —
 * body style, engine family, suspension layout, and powertrain type.
 *
 * Fallback hierarchy:
 *   1. Exact make+model match
 *   2. Make family match (e.g., all Nissan AD variants)
 *   3. Vehicle class match (sedan/SUV/pickup/van)
 *   4. Generic names (last resort)
 */

export interface VehicleComponentSet {
  // Front impact chain
  frontBumperBeam: string;          // Step 1 — first energy absorber
  radiatorSupport: string;          // Step 2 — behind bumper beam
  radiator: string;                 // Step 3 — cooling unit
  acCondenser: string;              // Step 3b — alongside radiator
  engineMounts: string;             // Step 4 — force-gated at 25 kN
  steeringRack: string;             // Step 5 — force-gated at 35 kN
  transmissionMount: string;        // Step 5b — catastrophic only (>60 kN)
  frontSubframe: string;            // Structural — part of radiator support chain

  // Rear impact chain
  rearBumperBeam: string;           // Step 1
  bootFloor: string;                // Step 2
  rearChassisRails: string;         // Step 3
  fuelTank: string;                 // Step 4 — force-gated
  rearAxle: string;                 // Step 5 — severe force only

  // Side impact chain
  doorIntrusionBeam: (side: 'driver' | 'passenger') => string;  // Step 1
  bPillar: (side: 'driver' | 'passenger') => string;            // Step 2
  rockerSill: (side: 'driver' | 'passenger') => string;         // Step 3
  aPillar: (side: 'driver' | 'passenger') => string;            // Step 4 — severe

  // General / high-energy
  suspensionGeometry: string;       // Wheel alignment / geometry
  wiringHarness: string;            // Impact zone wiring

  // EV/Hybrid specific
  hvBattery?: string;               // High-voltage battery pack
  hvCabling?: string;               // HV orange cabling
  inverter?: string;                // Power inverter / motor controller

  // Metadata
  engineFamily: string;             // e.g. "QG15DE", "1NZ-FE"
  bodyCode: string;                 // e.g. "Y11", "E120", "B15"
  suspensionFront: string;          // e.g. "MacPherson strut"
  suspensionRear: string;           // e.g. "torsion beam"
  bodyConstruction: string;         // e.g. "unibody monocoque"
}

// ─────────────────────────────────────────────────────────────────────────────
// VEHICLE DATABASE
// ─────────────────────────────────────────────────────────────────────────────

type VehicleKey = string; // "make|model_family" e.g. "nissan|ad" or "toyota|corolla"

const vehicleComponentDB: Record<VehicleKey, VehicleComponentSet> = {

  // ── NISSAN AD / AD Wagon (Y11, B15, WFY11) ──────────────────────────────
  "nissan|ad": {
    frontBumperBeam:    "Nissan AD Wagon WFY11 front bumper reinforcement bar (steel, 1.2mm pressed)",
    radiatorSupport:    "Nissan AD WFY11 front radiator core support panel (welded monocoque)",
    radiator:           "Nissan AD QG15DE aluminium/plastic radiator (16mm tube, 32mm header)",
    acCondenser:        "Nissan AD WFY11 parallel-flow AC condenser (R134a, 260×380mm)",
    engineMounts:       "Nissan QG15DE right-hand torque strut mount + left hydraulic mount (WFY11 subframe)",
    steeringRack:       "Nissan AD WFY11 rack-and-pinion steering assembly (column shaft + universal joint)",
    transmissionMount:  "Nissan AD WFY11 transaxle rear mount bracket (4-speed automatic/5-speed manual)",
    frontSubframe:      "Nissan AD WFY11 front suspension crossmember / subframe (bolt-on, 2-point)",
    rearBumperBeam:     "Nissan AD WFY11 rear bumper reinforcement bar (steel pressed)",
    bootFloor:          "Nissan AD WFY11 rear floor panel / spare tyre well (monocoque)",
    rearChassisRails:   "Nissan AD WFY11 rear longitudinal chassis rails (unibody, welded)",
    fuelTank:           "Nissan AD WFY11 polyethylene fuel tank (42L, underfloor mounted)",
    rearAxle:           "Nissan AD WFY11 torsion beam rear axle (trailing arm geometry)",
    doorIntrusionBeam:  (side) => `Nissan AD WFY11 ${side}-side door intrusion beam (tubular steel, door inner)`,
    bPillar:            (side) => `Nissan AD WFY11 ${side}-side B-pillar inner/outer reinforcement (high-strength steel)`,
    rockerSill:         (side) => `Nissan AD WFY11 ${side}-side rocker sill / side sill reinforcement (unibody)`,
    aPillar:            (side) => `Nissan AD WFY11 ${side}-side A-pillar assembly (windscreen pillar, UHSS)`,
    suspensionGeometry: "Nissan AD WFY11 front MacPherson strut geometry (camber/caster/toe alignment)",
    wiringHarness:      "Nissan AD WFY11 main engine bay wiring harness (QG15DE ECU loom, 42-pin)",
    engineFamily:       "QG15DE (1.5L DOHC, 4-cylinder)",
    bodyCode:           "WFY11 / Y11",
    suspensionFront:    "MacPherson strut with coil spring",
    suspensionRear:     "Torsion beam (trailing arm)",
    bodyConstruction:   "Unibody monocoque (steel)",
  },

  // ── NISSAN TIIDA / LATIO (C11) ───────────────────────────────────────────
  "nissan|tiida": {
    frontBumperBeam:    "Nissan Tiida C11 front bumper reinforcement bar (steel, 1.5mm pressed)",
    radiatorSupport:    "Nissan Tiida C11 front radiator core support (welded monocoque upper/lower)",
    radiator:           "Nissan Tiida HR15DE/MR18DE aluminium radiator (plastic tanks, 26mm core)",
    acCondenser:        "Nissan Tiida C11 parallel-flow AC condenser (R134a, 270×400mm)",
    engineMounts:       "Nissan Tiida C11 right-hand torque rod mount + left hydraulic mount",
    steeringRack:       "Nissan Tiida C11 electric power-assisted rack-and-pinion (EPAS)",
    transmissionMount:  "Nissan Tiida C11 CVT/automatic transaxle rear mount",
    frontSubframe:      "Nissan Tiida C11 front suspension subframe (bolt-on aluminium crossmember)",
    rearBumperBeam:     "Nissan Tiida C11 rear bumper reinforcement bar (steel)",
    bootFloor:          "Nissan Tiida C11 rear boot floor panel (monocoque, spare tyre recess)",
    rearChassisRails:   "Nissan Tiida C11 rear longitudinal chassis rails (unibody welded)",
    fuelTank:           "Nissan Tiida C11 polyethylene fuel tank (50L, underfloor)",
    rearAxle:           "Nissan Tiida C11 torsion beam rear axle (H-beam trailing arm)",
    doorIntrusionBeam:  (side) => `Nissan Tiida C11 ${side}-side door side-impact beam (tubular steel)`,
    bPillar:            (side) => `Nissan Tiida C11 ${side}-side B-pillar reinforcement (UHSS inner/outer)`,
    rockerSill:         (side) => `Nissan Tiida C11 ${side}-side rocker sill reinforcement (unibody)`,
    aPillar:            (side) => `Nissan Tiida C11 ${side}-side A-pillar (windscreen pillar, UHSS)`,
    suspensionGeometry: "Nissan Tiida C11 front MacPherson strut geometry (camber/caster/toe)",
    wiringHarness:      "Nissan Tiida C11 engine bay wiring harness (HR15DE/MR18DE ECU loom)",
    engineFamily:       "HR15DE / MR18DE (1.5L–1.8L DOHC)",
    bodyCode:           "C11",
    suspensionFront:    "MacPherson strut with coil spring",
    suspensionRear:     "Torsion beam (H-beam trailing arm)",
    bodyConstruction:   "Unibody monocoque (steel)",
  },

  // ── NISSAN NP200 / HARDBODY (D22) ────────────────────────────────────────
  "nissan|np200": {
    frontBumperBeam:    "Nissan NP200 front bumper reinforcement bar (steel, ladder-frame mounted)",
    radiatorSupport:    "Nissan NP200 front radiator support panel (body-on-frame, bolt-on)",
    radiator:           "Nissan NP200 1.6L aluminium/plastic radiator (single-row, 28mm core)",
    acCondenser:        "Nissan NP200 parallel-flow AC condenser (R134a, 240×360mm)",
    engineMounts:       "Nissan NP200 1.6L engine mounts (front + rear, rubber-isolated, frame-mounted)",
    steeringRack:       "Nissan NP200 recirculating ball steering box (column + drag link)",
    transmissionMount:  "Nissan NP200 5-speed manual gearbox crossmember mount",
    frontSubframe:      "Nissan NP200 front ladder-frame crossmember (body-on-frame, steel)",
    rearBumperBeam:     "Nissan NP200 rear bumper reinforcement (steel, ladder-frame mounted)",
    bootFloor:          "Nissan NP200 load bed floor (steel, separate from cab)",
    rearChassisRails:   "Nissan NP200 rear ladder-frame rails (C-section steel, full-length)",
    fuelTank:           "Nissan NP200 steel fuel tank (47L, frame-mounted under cab)",
    rearAxle:           "Nissan NP200 solid rear axle (leaf spring, semi-floating)",
    doorIntrusionBeam:  (side) => `Nissan NP200 ${side}-side door intrusion beam (tubular steel, cab door)`,
    bPillar:            (side) => `Nissan NP200 ${side}-side B-pillar (cab structure, steel)`,
    rockerSill:         (side) => `Nissan NP200 ${side}-side cab sill / rocker panel`,
    aPillar:            (side) => `Nissan NP200 ${side}-side A-pillar (cab windscreen pillar)`,
    suspensionGeometry: "Nissan NP200 front independent double-wishbone geometry (caster/camber/toe)",
    wiringHarness:      "Nissan NP200 engine bay wiring harness (1.6L ECU loom, 36-pin)",
    engineFamily:       "HR16DE (1.6L DOHC) / Z24 (2.4L carb)",
    bodyCode:           "NP200 / D22",
    suspensionFront:    "Independent double wishbone with coil spring",
    suspensionRear:     "Solid axle with leaf springs",
    bodyConstruction:   "Body-on-frame (ladder chassis)",
  },

  // ── TOYOTA COROLLA (E120 / AE100 / ZZE122) ───────────────────────────────
  "toyota|corolla": {
    frontBumperBeam:    "Toyota Corolla E120 front bumper reinforcement bar (steel, 1.4mm pressed)",
    radiatorSupport:    "Toyota Corolla E120 front radiator core support (welded monocoque upper/lower tie bar)",
    radiator:           "Toyota Corolla 1ZZ-FE/2ZZ-GE aluminium radiator (plastic tanks, 26mm core)",
    acCondenser:        "Toyota Corolla E120 parallel-flow AC condenser (R134a, 265×395mm)",
    engineMounts:       "Toyota Corolla E120 right-hand torque strut + left hydraulic mount (1ZZ-FE)",
    steeringRack:       "Toyota Corolla E120 electric power-assisted rack-and-pinion (EPAS column)",
    transmissionMount:  "Toyota Corolla E120 U340E automatic / C59 manual transaxle rear mount",
    frontSubframe:      "Toyota Corolla E120 front suspension crossmember (bolt-on steel subframe)",
    rearBumperBeam:     "Toyota Corolla E120 rear bumper reinforcement bar (steel pressed)",
    bootFloor:          "Toyota Corolla E120 rear boot floor / spare tyre well (monocoque)",
    rearChassisRails:   "Toyota Corolla E120 rear longitudinal chassis rails (unibody welded)",
    fuelTank:           "Toyota Corolla E120 polyethylene fuel tank (50L, underfloor)",
    rearAxle:           "Toyota Corolla E120 torsion beam rear axle (trailing arm, anti-roll bar)",
    doorIntrusionBeam:  (side) => `Toyota Corolla E120 ${side}-side door intrusion beam (tubular steel)`,
    bPillar:            (side) => `Toyota Corolla E120 ${side}-side B-pillar reinforcement (UHSS inner/outer)`,
    rockerSill:         (side) => `Toyota Corolla E120 ${side}-side rocker sill reinforcement (unibody)`,
    aPillar:            (side) => `Toyota Corolla E120 ${side}-side A-pillar (windscreen pillar, UHSS)`,
    suspensionGeometry: "Toyota Corolla E120 front MacPherson strut geometry (camber/caster/toe alignment)",
    wiringHarness:      "Toyota Corolla E120 engine bay wiring harness (1ZZ-FE ECU loom, 48-pin)",
    engineFamily:       "1ZZ-FE / 2ZZ-GE (1.8L–1.8L DOHC VVT-i)",
    bodyCode:           "E120 / ZZE122",
    suspensionFront:    "MacPherson strut with coil spring",
    suspensionRear:     "Torsion beam (trailing arm)",
    bodyConstruction:   "Unibody monocoque (steel)",
  },

  // ── TOYOTA HILUX (AN10/AN20/AN120/AN130) ─────────────────────────────────
  "toyota|hilux": {
    frontBumperBeam:    "Toyota Hilux AN120 front bumper reinforcement bar (steel, ladder-frame mounted)",
    radiatorSupport:    "Toyota Hilux AN120 front radiator support panel (body-on-frame, bolt-on)",
    radiator:           "Toyota Hilux 2GD-FTV/1GD-FTV aluminium radiator (dual-core, 36mm)",
    acCondenser:        "Toyota Hilux AN120 parallel-flow AC condenser (R134a, 290×420mm)",
    engineMounts:       "Toyota Hilux AN120 2GD-FTV engine mounts (front + rear, rubber-isolated, frame)",
    steeringRack:       "Toyota Hilux AN120 hydraulic power-assisted rack-and-pinion (HPAS)",
    transmissionMount:  "Toyota Hilux AN120 A750F automatic / R150F manual gearbox crossmember",
    frontSubframe:      "Toyota Hilux AN120 front ladder-frame crossmember (double-wishbone subframe)",
    rearBumperBeam:     "Toyota Hilux AN120 rear bumper reinforcement (steel, ladder-frame mounted)",
    bootFloor:          "Toyota Hilux AN120 load bed floor (steel, separate from cab)",
    rearChassisRails:   "Toyota Hilux AN120 rear ladder-frame rails (high-strength steel, C-section)",
    fuelTank:           "Toyota Hilux AN120 steel fuel tank (80L, frame-mounted)",
    rearAxle:           "Toyota Hilux AN120 solid rear axle (leaf spring, semi-floating differential)",
    doorIntrusionBeam:  (side) => `Toyota Hilux AN120 ${side}-side door intrusion beam (tubular steel, cab door)`,
    bPillar:            (side) => `Toyota Hilux AN120 ${side}-side B-pillar (cab structure, UHSS)`,
    rockerSill:         (side) => `Toyota Hilux AN120 ${side}-side cab sill / rocker panel`,
    aPillar:            (side) => `Toyota Hilux AN120 ${side}-side A-pillar (cab windscreen pillar, UHSS)`,
    suspensionGeometry: "Toyota Hilux AN120 front double-wishbone geometry (caster/camber/toe, 4WD)",
    wiringHarness:      "Toyota Hilux AN120 engine bay wiring harness (2GD-FTV ECU loom, 64-pin)",
    engineFamily:       "2GD-FTV (2.4L D-4D diesel) / 1GD-FTV (2.8L diesel)",
    bodyCode:           "AN120 / AN130",
    suspensionFront:    "Independent double wishbone with torsion bar",
    suspensionRear:     "Solid axle with leaf springs",
    bodyConstruction:   "Body-on-frame (ladder chassis, high-strength steel)",
  },

  // ── TOYOTA YARIS / VITZ (XP90 / XP130) ──────────────────────────────────
  "toyota|yaris": {
    frontBumperBeam:    "Toyota Yaris XP130 front bumper reinforcement bar (steel, 1.0mm pressed)",
    radiatorSupport:    "Toyota Yaris XP130 front radiator core support (welded monocoque)",
    radiator:           "Toyota Yaris 1KR-FE/1NZ-FE aluminium/plastic radiator (18mm core)",
    acCondenser:        "Toyota Yaris XP130 parallel-flow AC condenser (R134a, 240×360mm)",
    engineMounts:       "Toyota Yaris XP130 right-hand torque strut + left hydraulic mount (1KR-FE)",
    steeringRack:       "Toyota Yaris XP130 electric power-assisted rack-and-pinion (EPAS)",
    transmissionMount:  "Toyota Yaris XP130 K310 CVT / C50 manual transaxle rear mount",
    frontSubframe:      "Toyota Yaris XP130 front suspension crossmember (bolt-on steel)",
    rearBumperBeam:     "Toyota Yaris XP130 rear bumper reinforcement bar (steel pressed)",
    bootFloor:          "Toyota Yaris XP130 rear boot floor panel (monocoque)",
    rearChassisRails:   "Toyota Yaris XP130 rear longitudinal chassis rails (unibody welded)",
    fuelTank:           "Toyota Yaris XP130 polyethylene fuel tank (42L, underfloor)",
    rearAxle:           "Toyota Yaris XP130 torsion beam rear axle (trailing arm)",
    doorIntrusionBeam:  (side) => `Toyota Yaris XP130 ${side}-side door intrusion beam (tubular steel)`,
    bPillar:            (side) => `Toyota Yaris XP130 ${side}-side B-pillar reinforcement (UHSS)`,
    rockerSill:         (side) => `Toyota Yaris XP130 ${side}-side rocker sill reinforcement`,
    aPillar:            (side) => `Toyota Yaris XP130 ${side}-side A-pillar (windscreen pillar, UHSS)`,
    suspensionGeometry: "Toyota Yaris XP130 front MacPherson strut geometry (camber/caster/toe)",
    wiringHarness:      "Toyota Yaris XP130 engine bay wiring harness (1KR-FE ECU loom, 32-pin)",
    engineFamily:       "1KR-FE (1.0L DOHC) / 1NZ-FE (1.5L DOHC)",
    bodyCode:           "XP130 / XP90",
    suspensionFront:    "MacPherson strut with coil spring",
    suspensionRear:     "Torsion beam (trailing arm)",
    bodyConstruction:   "Unibody monocoque (steel)",
  },

  // ── HONDA JAZZ / FIT (GD / GE / GK) ─────────────────────────────────────
  "honda|jazz": {
    frontBumperBeam:    "Honda Jazz GE8 front bumper reinforcement bar (steel, 1.2mm pressed)",
    radiatorSupport:    "Honda Jazz GE8 front radiator core support (welded monocoque)",
    radiator:           "Honda Jazz L13A/L15A aluminium/plastic radiator (18mm core, plastic tanks)",
    acCondenser:        "Honda Jazz GE8 parallel-flow AC condenser (R134a, 250×370mm)",
    engineMounts:       "Honda Jazz GE8 right-hand torque rod + left hydraulic mount (L13A)",
    steeringRack:       "Honda Jazz GE8 electric power-assisted rack-and-pinion (EPAS)",
    transmissionMount:  "Honda Jazz GE8 CVT/automatic transaxle rear mount",
    frontSubframe:      "Honda Jazz GE8 front suspension subframe (bolt-on aluminium crossmember)",
    rearBumperBeam:     "Honda Jazz GE8 rear bumper reinforcement bar (steel pressed)",
    bootFloor:          "Honda Jazz GE8 rear boot floor / magic seat well (monocoque)",
    rearChassisRails:   "Honda Jazz GE8 rear longitudinal chassis rails (unibody welded)",
    fuelTank:           "Honda Jazz GE8 polyethylene fuel tank (40L, underfloor)",
    rearAxle:           "Honda Jazz GE8 torsion beam rear axle (H-beam trailing arm)",
    doorIntrusionBeam:  (side) => `Honda Jazz GE8 ${side}-side door intrusion beam (tubular steel)`,
    bPillar:            (side) => `Honda Jazz GE8 ${side}-side B-pillar reinforcement (UHSS inner/outer)`,
    rockerSill:         (side) => `Honda Jazz GE8 ${side}-side rocker sill / side sill reinforcement`,
    aPillar:            (side) => `Honda Jazz GE8 ${side}-side A-pillar (windscreen pillar, UHSS)`,
    suspensionGeometry: "Honda Jazz GE8 front MacPherson strut geometry (camber/caster/toe)",
    wiringHarness:      "Honda Jazz GE8 engine bay wiring harness (L13A ECU loom, 38-pin)",
    engineFamily:       "L13A / L15A (1.3L–1.5L SOHC i-VTEC)",
    bodyCode:           "GE8 / GD3",
    suspensionFront:    "MacPherson strut with coil spring",
    suspensionRear:     "Torsion beam (H-beam trailing arm)",
    bodyConstruction:   "Unibody monocoque (steel)",
  },

  // ── VOLKSWAGEN POLO (9N / 6R / AW) ───────────────────────────────────────
  "volkswagen|polo": {
    frontBumperBeam:    "VW Polo 6R front bumper reinforcement bar (steel, 1.5mm pressed, MQB-A0)",
    radiatorSupport:    "VW Polo 6R front radiator core support (welded monocoque, upper/lower tie)",
    radiator:           "VW Polo 1.2 TSI/1.4 TDI aluminium radiator (plastic tanks, 22mm core)",
    acCondenser:        "VW Polo 6R parallel-flow AC condenser (R134a/R1234yf, 260×380mm)",
    engineMounts:       "VW Polo 6R right-hand torque strut + left hydraulic mount (1.2 TSI)",
    steeringRack:       "VW Polo 6R electric power-assisted rack-and-pinion (EPAS, EPS column)",
    transmissionMount:  "VW Polo 6R DSG/manual transaxle rear mount (02T/0AM gearbox)",
    frontSubframe:      "VW Polo 6R front suspension subframe (bolt-on steel crossmember)",
    rearBumperBeam:     "VW Polo 6R rear bumper reinforcement bar (steel pressed)",
    bootFloor:          "VW Polo 6R rear boot floor panel (monocoque, spare tyre well)",
    rearChassisRails:   "VW Polo 6R rear longitudinal chassis rails (unibody welded)",
    fuelTank:           "VW Polo 6R polyethylene fuel tank (45L, underfloor)",
    rearAxle:           "VW Polo 6R torsion beam rear axle (trailing arm, anti-roll bar integrated)",
    doorIntrusionBeam:  (side) => `VW Polo 6R ${side}-side door side-impact beam (tubular steel)`,
    bPillar:            (side) => `VW Polo 6R ${side}-side B-pillar reinforcement (UHSS inner/outer)`,
    rockerSill:         (side) => `VW Polo 6R ${side}-side rocker sill reinforcement (unibody)`,
    aPillar:            (side) => `VW Polo 6R ${side}-side A-pillar (windscreen pillar, UHSS)`,
    suspensionGeometry: "VW Polo 6R front MacPherson strut geometry (camber/caster/toe alignment)",
    wiringHarness:      "VW Polo 6R engine bay wiring harness (1.2 TSI ECU loom, 52-pin)",
    engineFamily:       "1.2 TSI (CBZA/CBZB) / 1.4 TDI (BMS/BNM)",
    bodyCode:           "6R / 6C / AW",
    suspensionFront:    "MacPherson strut with coil spring",
    suspensionRear:     "Torsion beam (trailing arm)",
    bodyConstruction:   "Unibody monocoque (steel, PQ25 platform)",
  },

  // ── MAZDA 3 (BK / BL / BM) ───────────────────────────────────────────────
  "mazda|3": {
    frontBumperBeam:    "Mazda 3 BL front bumper reinforcement bar (steel, 1.4mm pressed)",
    radiatorSupport:    "Mazda 3 BL front radiator core support (welded monocoque)",
    radiator:           "Mazda 3 LF-VE/MZR 2.0 aluminium/plastic radiator (26mm core)",
    acCondenser:        "Mazda 3 BL parallel-flow AC condenser (R134a, 270×400mm)",
    engineMounts:       "Mazda 3 BL right-hand torque strut + left hydraulic mount (LF-VE)",
    steeringRack:       "Mazda 3 BL electric power-assisted rack-and-pinion (EPAS)",
    transmissionMount:  "Mazda 3 BL automatic/manual transaxle rear mount",
    frontSubframe:      "Mazda 3 BL front suspension subframe (bolt-on steel crossmember)",
    rearBumperBeam:     "Mazda 3 BL rear bumper reinforcement bar (steel pressed)",
    bootFloor:          "Mazda 3 BL rear boot floor panel (monocoque)",
    rearChassisRails:   "Mazda 3 BL rear longitudinal chassis rails (unibody welded)",
    fuelTank:           "Mazda 3 BL polyethylene fuel tank (55L, underfloor)",
    rearAxle:           "Mazda 3 BL multi-link rear suspension (trailing arm + lateral links)",
    doorIntrusionBeam:  (side) => `Mazda 3 BL ${side}-side door intrusion beam (tubular steel)`,
    bPillar:            (side) => `Mazda 3 BL ${side}-side B-pillar reinforcement (UHSS inner/outer)`,
    rockerSill:         (side) => `Mazda 3 BL ${side}-side rocker sill reinforcement (unibody)`,
    aPillar:            (side) => `Mazda 3 BL ${side}-side A-pillar (windscreen pillar, UHSS)`,
    suspensionGeometry: "Mazda 3 BL front MacPherson strut geometry (camber/caster/toe)",
    wiringHarness:      "Mazda 3 BL engine bay wiring harness (LF-VE ECU loom, 48-pin)",
    engineFamily:       "LF-VE / LF-DE (2.0L DOHC MZR)",
    bodyCode:           "BL / BK",
    suspensionFront:    "MacPherson strut with coil spring",
    suspensionRear:     "Multi-link independent",
    bodyConstruction:   "Unibody monocoque (steel)",
  },

  // ── FORD RANGER (T6 / PXII / PXIII) ─────────────────────────────────────
  "ford|ranger": {
    frontBumperBeam:    "Ford Ranger T6 front bumper reinforcement bar (steel, ladder-frame mounted)",
    radiatorSupport:    "Ford Ranger T6 front radiator support panel (body-on-frame, bolt-on)",
    radiator:           "Ford Ranger 2.2 TDCi/3.2 TDCi aluminium radiator (dual-core, 36mm)",
    acCondenser:        "Ford Ranger T6 parallel-flow AC condenser (R134a, 290×430mm)",
    engineMounts:       "Ford Ranger T6 2.2 TDCi engine mounts (front + rear, rubber-isolated, frame)",
    steeringRack:       "Ford Ranger T6 hydraulic power-assisted rack-and-pinion (HPAS)",
    transmissionMount:  "Ford Ranger T6 6R80/6R140 automatic gearbox crossmember mount",
    frontSubframe:      "Ford Ranger T6 front ladder-frame crossmember (double-wishbone subframe)",
    rearBumperBeam:     "Ford Ranger T6 rear bumper reinforcement (steel, ladder-frame mounted)",
    bootFloor:          "Ford Ranger T6 load bed floor (steel, separate from cab)",
    rearChassisRails:   "Ford Ranger T6 rear ladder-frame rails (high-strength steel)",
    fuelTank:           "Ford Ranger T6 steel fuel tank (80L, frame-mounted)",
    rearAxle:           "Ford Ranger T6 solid rear axle (leaf spring, limited-slip differential)",
    doorIntrusionBeam:  (side) => `Ford Ranger T6 ${side}-side door intrusion beam (tubular steel, cab door)`,
    bPillar:            (side) => `Ford Ranger T6 ${side}-side B-pillar (cab structure, UHSS)`,
    rockerSill:         (side) => `Ford Ranger T6 ${side}-side cab sill / rocker panel`,
    aPillar:            (side) => `Ford Ranger T6 ${side}-side A-pillar (cab windscreen pillar, UHSS)`,
    suspensionGeometry: "Ford Ranger T6 front double-wishbone geometry (caster/camber/toe, 4WD)",
    wiringHarness:      "Ford Ranger T6 engine bay wiring harness (2.2 TDCi PCM loom, 60-pin)",
    engineFamily:       "2.2 TDCi (DRFF/DRFG) / 3.2 TDCi (CYFF)",
    bodyCode:           "T6 / PXII / PXIII",
    suspensionFront:    "Independent double wishbone with coil spring",
    suspensionRear:     "Solid axle with leaf springs",
    bodyConstruction:   "Body-on-frame (ladder chassis)",
  },

  // ── BMW 3 SERIES (E46 / E90 / F30) ───────────────────────────────────────
  "bmw|3": {
    frontBumperBeam:    "BMW 3 Series E90 front bumper reinforcement bar (aluminium crash box + steel beam)",
    radiatorSupport:    "BMW 3 Series E90 front end carrier / radiator support (bolt-on aluminium)",
    radiator:           "BMW 3 Series N46B20/N52B30 aluminium radiator (plastic tanks, 32mm core)",
    acCondenser:        "BMW 3 Series E90 parallel-flow AC condenser (R134a, 280×420mm)",
    engineMounts:       "BMW 3 Series E90 right-hand + left-hand hydraulic engine mounts (N52B30)",
    steeringRack:       "BMW 3 Series E90 electric power-assisted rack-and-pinion (EPS, variable ratio)",
    transmissionMount:  "BMW 3 Series E90 ZF 6HP21 automatic / Getrag 6-speed manual gearbox mount",
    frontSubframe:      "BMW 3 Series E90 front aluminium subframe (bolt-on, MacPherson carrier)",
    rearBumperBeam:     "BMW 3 Series E90 rear bumper reinforcement bar (aluminium crash box + steel)",
    bootFloor:          "BMW 3 Series E90 rear boot floor panel (monocoque, spare tyre well)",
    rearChassisRails:   "BMW 3 Series E90 rear longitudinal chassis rails (unibody, high-strength steel)",
    fuelTank:           "BMW 3 Series E90 polyethylene fuel tank (63L, underfloor saddle-type)",
    rearAxle:           "BMW 3 Series E90 multi-link rear axle (ZF integral link, independent)",
    doorIntrusionBeam:  (side) => `BMW 3 Series E90 ${side}-side door intrusion beam (ultra-high-strength steel)`,
    bPillar:            (side) => `BMW 3 Series E90 ${side}-side B-pillar reinforcement (UHSS, press-hardened)`,
    rockerSill:         (side) => `BMW 3 Series E90 ${side}-side rocker sill reinforcement (unibody, UHSS)`,
    aPillar:            (side) => `BMW 3 Series E90 ${side}-side A-pillar (windscreen pillar, press-hardened UHSS)`,
    suspensionGeometry: "BMW 3 Series E90 front MacPherson strut geometry (camber/caster/toe, ZF steering)",
    wiringHarness:      "BMW 3 Series E90 engine bay wiring harness (N52B30 DME loom, 88-pin)",
    engineFamily:       "N46B20 (2.0L) / N52B30 (3.0L) / N47D20 (2.0L diesel)",
    bodyCode:           "E90 / E91 / F30",
    suspensionFront:    "MacPherson strut with coil spring (aluminium subframe)",
    suspensionRear:     "Multi-link independent (ZF integral link)",
    bodyConstruction:   "Unibody monocoque (steel, aluminium front end)",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// CLASS-LEVEL FALLBACKS (when exact make/model not in DB)
// ─────────────────────────────────────────────────────────────────────────────

function buildClassFallback(
  make: string,
  model: string,
  bodyCode: string,
  vehicleClass: 'sedan' | 'hatchback' | 'suv' | 'pickup' | 'van' | 'compact',
  engineFamily: string,
  suspFront: string,
  suspRear: string,
  construction: string
): VehicleComponentSet {
  const label = `${make} ${model} ${bodyCode}`.trim();
  return {
    frontBumperBeam:    `${label} front bumper reinforcement bar (steel, pressed)`,
    radiatorSupport:    `${label} front radiator core support (${construction})`,
    radiator:           `${label} ${engineFamily} aluminium/plastic radiator`,
    acCondenser:        `${label} parallel-flow AC condenser (R134a)`,
    engineMounts:       `${label} ${engineFamily} engine mounts (rubber-isolated)`,
    steeringRack:       `${label} power-assisted rack-and-pinion steering`,
    transmissionMount:  `${label} gearbox / transaxle rear mount`,
    frontSubframe:      `${label} front suspension subframe / crossmember`,
    rearBumperBeam:     `${label} rear bumper reinforcement bar (steel)`,
    bootFloor:          `${label} rear boot floor / load bed floor`,
    rearChassisRails:   `${label} rear chassis rails (${construction})`,
    fuelTank:           `${label} fuel tank (underfloor mounted)`,
    rearAxle:           `${label} rear axle / suspension assembly (${suspRear})`,
    doorIntrusionBeam:  (side) => `${label} ${side}-side door intrusion beam (steel)`,
    bPillar:            (side) => `${label} ${side}-side B-pillar reinforcement`,
    rockerSill:         (side) => `${label} ${side}-side rocker sill reinforcement`,
    aPillar:            (side) => `${label} ${side}-side A-pillar (windscreen pillar)`,
    suspensionGeometry: `${label} front suspension geometry (${suspFront})`,
    wiringHarness:      `${label} engine bay wiring harness (${engineFamily} ECU loom)`,
    engineFamily,
    bodyCode,
    suspensionFront:    suspFront,
    suspensionRear:     suspRear,
    bodyConstruction:   construction,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve vehicle-specific component names for hidden damage inference.
 *
 * @param make       - Vehicle make (e.g. "Nissan", "Toyota")
 * @param model      - Vehicle model (e.g. "AD", "Corolla", "Hilux")
 * @param year       - Model year (e.g. 2008)
 * @param powertrain - Powertrain type: 'ice' | 'bev' | 'phev' | 'hev'
 * @param vehicleType - Body class: 'sedan' | 'suv' | 'pickup' | 'van' | 'compact'
 */
export function resolveVehicleComponents(
  make: string,
  model: string,
  year: number | null,
  powertrain: 'ice' | 'bev' | 'phev' | 'hev',
  vehicleType: 'sedan' | 'suv' | 'pickup' | 'van' | 'truck' | 'sports' | 'compact'
): VehicleComponentSet {
  const makeLower  = (make  || '').toLowerCase().trim();
  const modelLower = (model || '').toLowerCase().trim();

  // ── 1. Exact make+model lookup ─────────────────────────────────────────────
  // Try progressively shorter model keys (e.g. "ad wagon" → "ad")
  const modelWords = modelLower.split(/\s+/);
  for (let len = modelWords.length; len >= 1; len--) {
    const key = `${makeLower}|${modelWords.slice(0, len).join(' ')}`;
    if (vehicleComponentDB[key]) return vehicleComponentDB[key];
  }

  // ── 2. Make-family partial match ───────────────────────────────────────────
  for (const [dbKey, components] of Object.entries(vehicleComponentDB)) {
    const [dbMake, dbModel] = dbKey.split('|');
    if (dbMake === makeLower && modelLower.includes(dbModel)) return components;
    if (dbMake === makeLower && dbModel.includes(modelWords[0])) return components;
  }

  // ── 3. Class-level fallback ────────────────────────────────────────────────
  const makeTitle = make ? make.charAt(0).toUpperCase() + make.slice(1).toLowerCase() : 'Unknown';
  const modelTitle = model ? model.charAt(0).toUpperCase() + model.slice(1).toLowerCase() : 'Unknown';
  const yearStr = year ? String(year) : '';
  const bodyCode = yearStr;

  switch (vehicleType) {
    case 'pickup':
    case 'truck':
      return buildClassFallback(makeTitle, modelTitle, bodyCode, 'pickup',
        'diesel/petrol engine', 'Independent double wishbone', 'Solid axle with leaf springs',
        'Body-on-frame (ladder chassis)');
    case 'suv':
      return buildClassFallback(makeTitle, modelTitle, bodyCode, 'suv',
        'petrol/diesel engine', 'MacPherson strut / double wishbone', 'Multi-link independent',
        'Unibody monocoque (steel)');
    case 'van':
      return buildClassFallback(makeTitle, modelTitle, bodyCode, 'van',
        'diesel/petrol engine', 'MacPherson strut', 'Solid axle / torsion beam',
        'Unibody monocoque (steel)');
    case 'compact':
      return buildClassFallback(makeTitle, modelTitle, bodyCode, 'compact',
        'petrol engine', 'MacPherson strut', 'Torsion beam (trailing arm)',
        'Unibody monocoque (steel)');
    default: // sedan / sports
      return buildClassFallback(makeTitle, modelTitle, bodyCode, 'sedan',
        'petrol/diesel engine', 'MacPherson strut', 'Multi-link / torsion beam',
        'Unibody monocoque (steel)');
  }
}

/**
 * Add EV/Hybrid-specific components to an existing component set.
 * Call this after resolveVehicleComponents when powertrain is 'bev', 'phev', or 'hev'.
 */
export function addEvHybridComponents(
  components: VehicleComponentSet,
  make: string,
  model: string,
  powertrain: 'bev' | 'phev' | 'hev'
): VehicleComponentSet {
  const label = `${make} ${model}`.trim();
  return {
    ...components,
    hvBattery:  powertrain === 'bev'
      ? `${label} high-voltage lithium-ion battery pack (underfloor, 400V system)`
      : `${label} hybrid battery module (NiMH/Li-ion, 200V system)`,
    hvCabling:  `${label} high-voltage orange cabling (400V/200V, impact zone routing)`,
    inverter:   `${label} power inverter / motor controller (${powertrain === 'bev' ? '400V DC-AC' : 'hybrid PCU'})`,
  };
}
