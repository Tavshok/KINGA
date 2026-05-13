// @ts-nocheck
/**
 * Vehicle Structural Intelligence Service
 *
 * Provides:
 *  1. ANCAP / Global NCAP safety rating lookup (Southern Africa market focus)
 *  2. CRASH3 stiffness coefficient lookup by vehicle class
 *  3. NHTSA VIN decode integration (US NHTSA API — works for many global VINs)
 *  4. AI-powered structural risk narrative generation
 *
 * Data sources:
 *  - ANCAP (ancap.com.au) — Australasian NCAP, widely used in Southern Africa
 *  - Global NCAP Africa (globalncap.org/africaresults)
 *  - CRASH3 stiffness coefficients: Campbell 1974, Prasad 1990, Nystrom et al.
 *  - NHTSA vPIC API: https://vpic.nhtsa.dot.gov/api/
 */

import { invokeLLM } from "./_core/llm";

// ─────────────────────────────────────────────────────────────────────────────
// ANCAP RATINGS DATABASE
// ─────────────────────────────────────────────────────────────────────────────

interface ANCAPRating {
  make: string;
  model: string;
  variant?: string;
  buildYearFrom: number;
  buildYearTo?: number;
  stars: number;
  testYear: number;
  protocol: string;
  adultOccupant: number;   // %
  childOccupant: number;   // %
  vruProtection: number;   // %
  safetyAssist: number;    // %
  source: string;
  notes?: string;
}

interface GlobalNCAPAfrica {
  make: string;
  model: string;
  variant?: string;
  testYear: number;
  adultStars: number;
  childStars: number;
  source: string;
  notes?: string;
}

const ANCAP_RATINGS: ANCAPRating[] = [
  // ── TOYOTA ──────────────────────────────────────────────────────────────
  { make:"Toyota", model:"Hilux", variant:"Diesel exc. Rugged X", buildYearFrom:2025, stars:5, testYear:2025, protocol:"2024", adultOccupant:84, childOccupant:89, vruProtection:82, safetyAssist:82, source:"ancap.com.au/hilux-232736", notes:"Nov 2025 onwards. Rugged X unrated." },
  { make:"Toyota", model:"Hilux", variant:"Single/Dual/Extended Cab", buildYearFrom:2019, buildYearTo:2025, stars:5, testYear:2019, protocol:"2018", adultOccupant:90, childOccupant:88, vruProtection:76, safetyAssist:82, source:"ancap.com.au/hilux-cad396", notes:"Updated May 2019. Rating expired Dec 2025." },
  { make:"Toyota", model:"Prado", variant:"All variants (250 Series)", buildYearFrom:2024, stars:5, testYear:2024, protocol:"2022", adultOccupant:85, childOccupant:89, vruProtection:84, safetyAssist:82, source:"ancap.com.au/prado-cb1f0f", notes:"Nov 2024 onwards. Expires Dec 2031." },
  { make:"Toyota", model:"Prado", variant:"All variants (150 Series)", buildYearFrom:2013, buildYearTo:2022, stars:5, testYear:2011, protocol:"legacy", adultOccupant:0, childOccupant:0, vruProtection:0, safetyAssist:0, source:"ancap.com.au/prado-ddb0dd", notes:"Legacy: 35.11/37. Expired Dec 2022." },
  { make:"Toyota", model:"Fortuner", variant:"All variants", buildYearFrom:2019, buildYearTo:2025, stars:5, testYear:2019, protocol:"2018", adultOccupant:95, childOccupant:84, vruProtection:88, safetyAssist:78, source:"ancap.com.au/fortuner-aebf3a", notes:"Based on Hilux test. Expired Dec 2025." },
  { make:"Toyota", model:"Land Cruiser", variant:"300 Series", buildYearFrom:2021, stars:5, testYear:2022, protocol:"2020", adultOccupant:89, childOccupant:88, vruProtection:81, safetyAssist:81, source:"ancap.com.au/landcruiser", notes:"Expires Dec 2028." },
  { make:"Toyota", model:"RAV4", variant:"All variants", buildYearFrom:2019, stars:5, testYear:2019, protocol:"2018", adultOccupant:93, childOccupant:87, vruProtection:85, safetyAssist:77, source:"ancap.com.au/rav4-c922ba" },
  { make:"Toyota", model:"Corolla", variant:"All petrol/hybrid hatch", buildYearFrom:2018, stars:5, testYear:2018, protocol:"2018", adultOccupant:96, childOccupant:83, vruProtection:0, safetyAssist:0, source:"ancap.com.au/corolla-8ad73a" },
  { make:"Toyota", model:"Corolla Cross", variant:"All variants (ANCAP)", buildYearFrom:2023, stars:5, testYear:2023, protocol:"2022", adultOccupant:85, childOccupant:0, vruProtection:0, safetyAssist:0, source:"ancap.com.au/corolla-cross-530bf9", notes:"Global NCAP Africa 2026: 2 stars (no side head protection in African spec)." },
  { make:"Toyota", model:"Camry", variant:"All variants", buildYearFrom:2024, stars:5, testYear:2024, protocol:"2022", adultOccupant:95, childOccupant:87, vruProtection:0, safetyAssist:0, source:"ancap.com.au", notes:"Highest adult occupant score in 2024 ANCAP tests." },
  { make:"Toyota", model:"HiAce", variant:"Van/Commuter", buildYearFrom:2019, buildYearTo:2025, stars:5, testYear:2019, protocol:"2018", adultOccupant:80, childOccupant:86, vruProtection:87, safetyAssist:0, source:"ancap.com.au/hiace-389933" },
  { make:"Toyota", model:"HiAce", variant:"Van/Commuter (updated)", buildYearFrom:2025, stars:5, testYear:2025, protocol:"2024", adultOccupant:94, childOccupant:93, vruProtection:87, safetyAssist:0, source:"ancap.com.au/hiace-852c74", notes:"Updated Jun 2025 model." },
  // ── NISSAN ──────────────────────────────────────────────────────────────
  { make:"Nissan", model:"Navara", variant:"All dual cab (D27)", buildYearFrom:2025, stars:5, testYear:2024, protocol:"2022", adultOccupant:86, childOccupant:89, vruProtection:74, safetyAssist:70, source:"ancap.com.au/navara-fd8942", notes:"Based on Mitsubishi Triton. Expires Dec 2031." },
  { make:"Nissan", model:"Navara", variant:"NP300 Dual/King/Single Cab", buildYearFrom:2015, buildYearTo:2022, stars:5, testYear:2015, protocol:"legacy", adultOccupant:0, childOccupant:0, vruProtection:0, safetyAssist:0, source:"ancap.com.au/navara-52372f", notes:"Legacy: 35.01/37 dual/king; 34.01/37 single." },
  // ── ISUZU ───────────────────────────────────────────────────────────────
  { make:"Isuzu", model:"D-Max", variant:"All variants", buildYearFrom:2021, stars:5, testYear:2020, protocol:"2020", adultOccupant:83, childOccupant:89, vruProtection:69, safetyAssist:81, source:"ancap.com.au/d-max-d9fa82", notes:"First ute to earn 5 stars under 2020 criteria." },
  { make:"Isuzu", model:"MU-X", variant:"All variants", buildYearFrom:2021, stars:5, testYear:2021, protocol:"2020", adultOccupant:86, childOccupant:85, vruProtection:69, safetyAssist:84, source:"ancap.com.au/mu-x-2f75e8" },
  // ── FORD ────────────────────────────────────────────────────────────────
  { make:"Ford", model:"Ranger", variant:"All variants", buildYearFrom:2022, stars:5, testYear:2022, protocol:"2020", adultOccupant:84, childOccupant:93, vruProtection:74, safetyAssist:83, source:"ancap.com.au/ranger-58f98d" },
  { make:"Ford", model:"Everest", variant:"All variants", buildYearFrom:2022, stars:5, testYear:2022, protocol:"2020", adultOccupant:86, childOccupant:93, vruProtection:74, safetyAssist:86, source:"ancap.com.au/everest-f18eb7" },
  // ── VOLKSWAGEN ──────────────────────────────────────────────────────────
  { make:"Volkswagen", model:"Amarok", variant:"All variants (2nd gen)", buildYearFrom:2023, stars:5, testYear:2023, protocol:"2020", adultOccupant:86, childOccupant:93, vruProtection:74, safetyAssist:83, source:"ancap.com.au/amarok-262acd", notes:"Based on Ford Ranger test." },
  // ── MITSUBISHI ──────────────────────────────────────────────────────────
  { make:"Mitsubishi", model:"Triton", variant:"All variants", buildYearFrom:2024, stars:5, testYear:2024, protocol:"2022", adultOccupant:86, childOccupant:89, vruProtection:73, safetyAssist:70, source:"ancap.com.au/triton-08109a", notes:"Expires Dec 2031." },
  // ── MAZDA ───────────────────────────────────────────────────────────────
  { make:"Mazda", model:"BT-50", variant:"All variants", buildYearFrom:2021, stars:5, testYear:2020, protocol:"2020", adultOccupant:83, childOccupant:89, vruProtection:69, safetyAssist:81, source:"ancap.com.au/bt-50-d7c175", notes:"Based on Isuzu D-Max test." },
  { make:"Mazda", model:"CX-5", variant:"All variants", buildYearFrom:2021, stars:5, testYear:2021, protocol:"2020", adultOccupant:86, childOccupant:87, vruProtection:0, safetyAssist:0, source:"ancap.com.au" },
  // ── HYUNDAI ─────────────────────────────────────────────────────────────
  { make:"Hyundai", model:"Tucson", variant:"All variants", buildYearFrom:2021, stars:5, testYear:2021, protocol:"2020", adultOccupant:86, childOccupant:87, vruProtection:70, safetyAssist:70, source:"ancap.com.au/tucson-0b314b" },
];

const GLOBAL_NCAP_AFRICA: GlobalNCAPAfrica[] = [
  { make:"Toyota",    model:"Corolla Cross",  testYear:2026, adultStars:2, childStars:0, source:"globalncap.org/africaresults", notes:"2 stars — no standard side head protection in African spec." },
  { make:"Hyundai",   model:"Grand i10",      testYear:2025, adultStars:4, childStars:4, source:"globalncap.org/africaresults" },
  { make:"Nissan",    model:"Magnite",        testYear:2025, adultStars:4, childStars:4, source:"globalncap.org/africaresults", notes:"Improved variant from VIN MDHFBADD0Z0037139." },
  { make:"Volkswagen",model:"Polo Vivo",      variant:"Facelift + optional side airbags", testYear:2024, adultStars:4, childStars:3, source:"globalncap.org", notes:"4 stars with optional side airbags." },
  { make:"Volkswagen",model:"Polo Vivo",      variant:"Pre-facelift 2 airbags", testYear:2024, adultStars:3, childStars:0, source:"globalncap.org/africaresults" },
  { make:"Maruti Suzuki",model:"Ertiga",      variant:"2 airbags", testYear:2024, adultStars:2, childStars:0, source:"globalncap.org/africaresults" },
  { make:"Renault",   model:"Triber",         variant:"2 airbags", testYear:2024, adultStars:2, childStars:0, source:"globalncap.org/africaresults" },
  { make:"Kia",       model:"Pegas",          variant:"2 airbags", testYear:2024, adultStars:2, childStars:0, source:"globalncap.org/africaresults" },
  { make:"Suzuki",    model:"S-Presso",       variant:"2 airbags RHD", testYear:2022, adultStars:0, childStars:0, source:"globalncap.org/africaresults", notes:"Zero stars." },
  { make:"Mazda",     model:"2",              variant:"2 airbags RHD", testYear:2021, adultStars:4, childStars:0, source:"globalncap.org/africaresults" },
  { make:"Nissan",    model:"Almera",         variant:"2 airbags RHD", testYear:2021, adultStars:3, childStars:0, source:"globalncap.org/africaresults" },
  { make:"Mahindra",  model:"XUV300",         variant:"2 airbags RHD", testYear:2021, adultStars:5, childStars:0, source:"globalncap.org/africaresults" },
  { make:"Great Wall",model:"Steed 5",        variant:"No airbags RHD", testYear:2020, adultStars:0, childStars:0, source:"globalncap.org/africaresults", notes:"Zero stars — no airbags." },
  { make:"Haval",     model:"H1",             variant:"2 airbags RHD", testYear:2020, adultStars:3, childStars:0, source:"globalncap.org/africaresults" },
  { make:"Renault",   model:"Kwid",           variant:"2 airbags RHD", testYear:2020, adultStars:2, childStars:0, source:"globalncap.org/africaresults" },
  { make:"Toyota",    model:"Avanza",         variant:"2 airbags RHD", testYear:2019, adultStars:4, childStars:0, source:"aa.co.za/crash-tests/2019", notes:"4 stars despite unstable structure/footwell." },
  { make:"Nissan",    model:"NP300 Hardbody", variant:"2 airbags RHD", testYear:2018, adultStars:1, childStars:0, source:"globalncap.org/africaresults", notes:"1 star. 2020 car-to-car test: 0 stars for updated model." },
  { make:"Toyota",    model:"Yaris",          variant:"2 airbags RHD", testYear:2018, adultStars:4, childStars:0, source:"globalncap.org/africaresults" },
  { make:"Hyundai",   model:"i20",            variant:"2 airbags RHD", testYear:2018, adultStars:4, childStars:0, source:"globalncap.org/africaresults" },
  { make:"Kia",       model:"Picanto",        variant:"1 airbag RHD",  testYear:2018, adultStars:3, childStars:0, source:"globalncap.org/africaresults" },
  { make:"Renault",   model:"Sandero",        variant:"2 airbags RHD", testYear:2017, adultStars:3, childStars:0, source:"globalncap.org/africaresults" },
  { make:"Volkswagen",model:"Polo Vivo",      variant:"Original 2 airbags RHD", testYear:2017, adultStars:3, childStars:0, source:"globalncap.org/africaresults" },
  { make:"Datsun",    model:"GO+",            variant:"1 airbag RHD",  testYear:2017, adultStars:2, childStars:0, source:"globalncap.org/africaresults" },
  { make:"Chery",     model:"QQ3",            variant:"No airbags RHD",testYear:2017, adultStars:0, childStars:0, source:"globalncap.org/africaresults", notes:"Zero stars — no airbags." },
];

// ─────────────────────────────────────────────────────────────────────────────
// CRASH3 STIFFNESS COEFFICIENTS
// Source: Campbell 1974, Prasad 1990, Nystrom et al. (JSHeld paper)
// ─────────────────────────────────────────────────────────────────────────────

interface CRASH3Class {
  vehicleClass: string;
  description: string;
  A_kN_m: number;   // Stiffness coefficient A (kN/m)
  B_kN_m2: number;  // Stiffness coefficient B (kN/m²)
  typicalMassRange_kg: [number, number];
  notes?: string;
  /** Confidence tier: 'verified' = exact DB match, 'inferred' = class-based estimate */
  confidenceTier?: 'verified' | 'inferred' | 'insufficient';
  inferenceReason?: string;
}

const CRASH3_CLASSES: CRASH3Class[] = [
  {
    vehicleClass: "Mini/Subcompact",
    description: "Small passenger cars (e.g., VW Polo Vivo, Toyota Yaris, Suzuki S-Presso, Renault Kwid)",
    A_kN_m: 207, B_kN_m2: 429,
    typicalMassRange_kg: [850, 1200],
    notes: "Lower stiffness; higher crush depth per unit energy. Significant compatibility disadvantage in crashes with larger vehicles.",
  },
  {
    vehicleClass: "Compact/Sedan",
    description: "Mid-size sedans and hatchbacks (e.g., Toyota Corolla, VW Polo, Hyundai i30, Nissan Almera)",
    A_kN_m: 250, B_kN_m2: 510,
    typicalMassRange_kg: [1100, 1450],
  },
  {
    vehicleClass: "Mid-size Sedan/SUV",
    description: "Mid-size sedans, crossovers (e.g., Toyota Camry, Mazda CX-5, Hyundai Tucson, Toyota RAV4, Toyota Corolla Cross)",
    A_kN_m: 290, B_kN_m2: 580,
    typicalMassRange_kg: [1400, 1800],
  },
  {
    vehicleClass: "Full-size SUV/Pickup",
    description: "Full-size SUVs and pickup trucks (e.g., Toyota Hilux, Ford Ranger, Isuzu D-Max, Nissan Navara, VW Amarok, Toyota Prado, Toyota Fortuner)",
    A_kN_m: 340, B_kN_m2: 650,
    typicalMassRange_kg: [1800, 2500],
    notes: "Body-on-frame construction. High bumper ride height creates compatibility issues with passenger cars.",
  },
  {
    vehicleClass: "Large SUV/4x4",
    description: "Heavy-duty 4x4s and large SUVs (e.g., Toyota Land Cruiser 200/300, Nissan Patrol, Ford Everest)",
    A_kN_m: 380, B_kN_m2: 720,
    typicalMassRange_kg: [2200, 3200],
    notes: "Highest stiffness class. Significant mass and geometric incompatibility in crashes with smaller vehicles.",
  },
  {
    vehicleClass: "Light Commercial Van",
    description: "Vans and minibuses (e.g., Toyota HiAce, VW Transporter, Nissan NV200)",
    A_kN_m: 220, B_kN_m2: 460,
    typicalMassRange_kg: [1800, 3500],
    notes: "Front structure often less stiff than equivalent mass passenger car. High occupant compartment.",
  },
];

// Vehicle make/model → CRASH3 class mapping
const VEHICLE_CLASS_MAP: Record<string, string> = {
  // Toyota
  "toyota hilux": "Full-size SUV/Pickup",
  "toyota prado": "Full-size SUV/Pickup",
  "toyota fortuner": "Full-size SUV/Pickup",
  "toyota land cruiser": "Large SUV/4x4",
  "toyota landcruiser": "Large SUV/4x4",
  "toyota rav4": "Mid-size Sedan/SUV",
  "toyota corolla": "Compact/Sedan",
  "toyota corolla cross": "Mid-size Sedan/SUV",
  "toyota camry": "Mid-size Sedan/SUV",
  "toyota hiace": "Light Commercial Van",
  "toyota avanza": "Compact/Sedan",
  "toyota yaris": "Mini/Subcompact",
  "toyota etios": "Mini/Subcompact",
  "toyota starlet": "Mini/Subcompact",
  "toyota rush": "Compact/Sedan",
  // Nissan
  "nissan navara": "Full-size SUV/Pickup",
  "nissan np300": "Full-size SUV/Pickup",
  "nissan hardbody": "Full-size SUV/Pickup",
  "nissan np300 hardbody": "Full-size SUV/Pickup",
  "nissan patrol": "Large SUV/4x4",
  "nissan almera": "Compact/Sedan",
  "nissan magnite": "Mini/Subcompact",
  "nissan np200": "Mini/Subcompact",
  // Isuzu
  "isuzu d-max": "Full-size SUV/Pickup",
  "isuzu dmax": "Full-size SUV/Pickup",
  "isuzu mu-x": "Full-size SUV/Pickup",
  "isuzu mux": "Full-size SUV/Pickup",
  // Ford
  "ford ranger": "Full-size SUV/Pickup",
  "ford everest": "Large SUV/4x4",
  "ford figo": "Mini/Subcompact",
  "ford fiesta": "Mini/Subcompact",
  "ford focus": "Compact/Sedan",
  // Volkswagen
  "volkswagen amarok": "Full-size SUV/Pickup",
  "vw amarok": "Full-size SUV/Pickup",
  "volkswagen polo vivo": "Mini/Subcompact",
  "vw polo vivo": "Mini/Subcompact",
  "volkswagen polo": "Mini/Subcompact",
  "vw polo": "Mini/Subcompact",
  "volkswagen golf": "Compact/Sedan",
  "vw golf": "Compact/Sedan",
  "volkswagen tiguan": "Mid-size Sedan/SUV",
  "vw tiguan": "Mid-size Sedan/SUV",
  // Mitsubishi
  "mitsubishi triton": "Full-size SUV/Pickup",
  "mitsubishi l200": "Full-size SUV/Pickup",
  "mitsubishi pajero": "Large SUV/4x4",
  "mitsubishi outlander": "Mid-size Sedan/SUV",
  "mitsubishi asx": "Mid-size Sedan/SUV",
  // Mazda
  "mazda bt-50": "Full-size SUV/Pickup",
  "mazda cx-5": "Mid-size Sedan/SUV",
  "mazda cx-3": "Compact/Sedan",
  "mazda 2": "Mini/Subcompact",
  "mazda 3": "Compact/Sedan",
  // Hyundai
  "hyundai tucson": "Mid-size Sedan/SUV",
  "hyundai grand i10": "Mini/Subcompact",
  "hyundai i20": "Mini/Subcompact",
  "hyundai i30": "Compact/Sedan",
  "hyundai creta": "Compact/Sedan",
  "hyundai accent": "Compact/Sedan",
  // Kia
  "kia picanto": "Mini/Subcompact",
  "kia pegas": "Compact/Sedan",
  "kia rio": "Mini/Subcompact",
  "kia sportage": "Mid-size Sedan/SUV",
  // Renault
  "renault sandero": "Mini/Subcompact",
  "renault kwid": "Mini/Subcompact",
  "renault triber": "Compact/Sedan",
  "renault duster": "Mid-size Sedan/SUV",
  "renault kiger": "Mini/Subcompact",
  // Suzuki
  "suzuki s-presso": "Mini/Subcompact",
  "suzuki ignis": "Mini/Subcompact",
  "suzuki swift": "Mini/Subcompact",
  "suzuki vitara": "Compact/Sedan",
  "suzuki jimny": "Compact/Sedan",
  // Datsun
  "datsun go+": "Mini/Subcompact",
  "datsun go": "Mini/Subcompact",
  // Chery
  "chery qq3": "Mini/Subcompact",
  "chery tiggo": "Mid-size Sedan/SUV",
  // Great Wall / Haval / GWM
  "great wall steed": "Full-size SUV/Pickup",
  "gwm steed": "Full-size SUV/Pickup",
  "haval h1": "Mini/Subcompact",
  "haval h2": "Compact/Sedan",
  "haval jolion": "Mid-size Sedan/SUV",
  "gwm p-series": "Full-size SUV/Pickup",
  "gwm cannon": "Full-size SUV/Pickup",
  // Honda
  "honda amaze": "Compact/Sedan",
  "honda jazz": "Compact/Sedan",
  "honda civic": "Compact/Sedan",
  "honda cr-v": "Mid-size Sedan/SUV",
  // Mahindra
  "mahindra xuv300": "Mini/Subcompact",
  "mahindra pik up": "Full-size SUV/Pickup",
  // Mercedes-Benz
  "mercedes-benz c-class": "Compact/Sedan",
  "mercedes-benz e-class": "Mid-size Sedan/SUV",
  "mercedes-benz gle": "Large SUV/4x4",
  "mercedes-benz sprinter": "Light Commercial Van",
  // BMW
  "bmw 3 series": "Compact/Sedan",
  "bmw x3": "Mid-size Sedan/SUV",
  "bmw x5": "Large SUV/4x4",
};

// ─────────────────────────────────────────────────────────────────────────────
// LOOKUP FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

function normaliseKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s\-]/g, "").trim();
}

export function lookupANCAPRating(make: string, model: string, year?: number): ANCAPRating | null {
  const nm = normaliseKey(make);
  const nmod = normaliseKey(model);
  const matches = ANCAP_RATINGS.filter((r) => {
    const rm = normaliseKey(r.make);
    const rmod = normaliseKey(r.model);
    if (!rm.includes(nm) && !nm.includes(rm)) return false;
    if (!rmod.includes(nmod) && !nmod.includes(rmod)) return false;
    if (year) {
      if (year < r.buildYearFrom) return false;
      if (r.buildYearTo && year > r.buildYearTo) return false;
    }
    return true;
  });
  if (!matches.length) return null;
  return matches.sort((a, b) => b.testYear - a.testYear)[0];
}

export function lookupGlobalNCAP(make: string, model: string): GlobalNCAPAfrica | null {
  const nm = normaliseKey(make);
  const nmod = normaliseKey(model);
  const matches = GLOBAL_NCAP_AFRICA.filter((r) => {
    const rm = normaliseKey(r.make);
    const rmod = normaliseKey(r.model);
    return (rm.includes(nm) || nm.includes(rm)) && (rmod.includes(nmod) || nmod.includes(rmod));
  });
  if (!matches.length) return null;
  return matches.sort((a, b) => b.testYear - a.testYear)[0];
}

/**
 * Infer CRASH3 class from NHTSA body class string.
 */
function inferCrash3ClassFromBodyClass(bodyClass: string): string | null {
  const bc = bodyClass.toLowerCase();
  if (bc.includes('pickup') || bc.includes('truck')) return 'Full-size SUV/Pickup';
  if (bc.includes('sport utility') || bc.includes('suv')) return 'Mid-size Sedan/SUV';
  if (bc.includes('van') || bc.includes('minivan') || bc.includes('bus')) return 'Light Commercial Van';
  if (bc.includes('sedan') || bc.includes('hatchback') || bc.includes('coupe') || bc.includes('convertible')) return 'Compact/Sedan';
  if (bc.includes('wagon') || bc.includes('estate')) return 'Compact/Sedan';
  return null;
}

/**
 * Infer CRASH3 class from model name keywords when make/model is not in the map.
 */
function inferCrash3ClassFromKeywords(make: string, model: string): { vehicleClass: string; reason: string } | null {
  const combined = `${normaliseKey(make)} ${normaliseKey(model)}`;
  if (/\b(hilux|ranger|navara|amarok|bt-50|bt50|triton|l200|np300|hardbody|dmax|d-max|mux|mu-x|steed|cannon|p-series|bakkie|pickup|double cab|single cab|extra cab)\b/.test(combined))
    return { vehicleClass: 'Full-size SUV/Pickup', reason: 'Model name indicates bakkie/pickup truck category' };
  if (/\b(land cruiser|landcruiser|patrol|prado|fortuner|everest|pajero|discovery|defender|wrangler|4runner|highlander)\b/.test(combined))
    return { vehicleClass: 'Full-size SUV/Pickup', reason: 'Model name indicates full-size SUV/4x4 category' };
  if (/\b(rav4|rav-4|cx-5|cx5|tucson|sportage|tiguan|qashqai|x-trail|xtrail|duster|kiger|creta|seltos|c-hr|trailblazer|captiva|equinox|compass|renegade|eclipse cross|asx|hr-v|cr-v|t-roc|karoq|kodiaq|koleos|captur|arkana)\b/.test(combined))
    return { vehicleClass: 'Mid-size Sedan/SUV', reason: 'Model name indicates mid-size crossover/SUV category' };
  if (/\b(polo|yaris|swift|kwid|s-presso|spresso|i10|i20|picanto|rio|sandero|triber|etios|starlet|micra|march|spark|alto|celerio|baleno|ignis|magnite|tiago|altroz|nexon)\b/.test(combined))
    return { vehicleClass: 'Mini/Subcompact', reason: 'Model name indicates mini/subcompact category' };
  if (/\b(corolla|civic|golf|focus|almera|accent|verna|pegas|lancer|camry|accord|sonata|elantra|cerato|fiesta|astra|insignia|cruze|aveo|jetta|passat|vento|rapid|fabia|octavia|superb|3 series|c-class|e-class|a-class|a4|a6|320|330|520|530|c200|c300|e200|e300)\b/.test(combined))
    return { vehicleClass: 'Compact/Sedan', reason: 'Model name indicates compact/sedan category' };
  if (/\b(hiace|hi-ace|sprinter|transporter|transit|master|trafic|vivaro|nv200|nv300|caddy|crafter|movano|boxer|ducato|minibus|combi)\b/.test(combined))
    return { vehicleClass: 'Light Commercial Van', reason: 'Model name indicates light commercial van category' };
  return null;
}

export function getCRASH3Class(
  make: string,
  model: string,
  bodyClassFromNHTSA?: string
): CRASH3Class | null {
  const key = `${normaliseKey(make)} ${normaliseKey(model)}`;
  // 1. Exact match
  if (VEHICLE_CLASS_MAP[key]) {
    const cls = VEHICLE_CLASS_MAP[key];
    const found = CRASH3_CLASSES.find((c) => c.vehicleClass === cls);
    return found ? { ...found, confidenceTier: 'verified' } : null;
  }
  // 2. Partial match
  for (const [k, cls] of Object.entries(VEHICLE_CLASS_MAP)) {
    if (key.includes(k) || k.includes(key)) {
      const found = CRASH3_CLASSES.find((c) => c.vehicleClass === cls);
      return found ? { ...found, confidenceTier: 'verified' } : null;
    }
  }
  // 3. Infer from NHTSA body class
  if (bodyClassFromNHTSA) {
    const inferredClass = inferCrash3ClassFromBodyClass(bodyClassFromNHTSA);
    if (inferredClass) {
      const found = CRASH3_CLASSES.find((c) => c.vehicleClass === inferredClass);
      if (found) return { ...found, confidenceTier: 'inferred', inferenceReason: `Estimated from NHTSA body class: "${bodyClassFromNHTSA}"` };
    }
  }
  // 4. Infer from model name keywords
  const kwInference = inferCrash3ClassFromKeywords(make, model);
  if (kwInference) {
    const found = CRASH3_CLASSES.find((c) => c.vehicleClass === kwInference.vehicleClass);
    if (found) return { ...found, confidenceTier: 'inferred', inferenceReason: kwInference.reason };
  }
  // 5. Make-level fallback
  const makeKey = normaliseKey(make);
  const makeEntries = Object.entries(VEHICLE_CLASS_MAP).filter(([k]) => k.startsWith(makeKey + ' '));
  if (makeEntries.length > 0) {
    const classCounts: Record<string, number> = {};
    for (const [, cls] of makeEntries) classCounts[cls] = (classCounts[cls] || 0) + 1;
    const mostCommon = Object.entries(classCounts).sort((a, b) => b[1] - a[1])[0][0];
    const found = CRASH3_CLASSES.find((c) => c.vehicleClass === mostCommon);
    if (found) return { ...found, confidenceTier: 'inferred', inferenceReason: `Estimated from most common ${make} vehicle class in database (model "${model}" not individually mapped)` };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// NHTSA VIN DECODE
// ─────────────────────────────────────────────────────────────────────────────

export interface NHTSADecodeResult {
  make?: string;
  model?: string;
  modelYear?: string;
  vehicleType?: string;
  bodyClass?: string;
  driveType?: string;
  engineCylinders?: string;
  engineDisplacementL?: string;
  fuelTypePrimary?: string;
  gvwrClass?: string;
  plantCountry?: string;
  series?: string;
  trim?: string;
  transmissionStyle?: string;
  errorCode?: string;
  errorText?: string;
  raw?: Record<string, string>;
}

export async function decodeVINNHTSA(vin: string): Promise<NHTSADecodeResult> {
  if (!vin || vin.length < 11) {
    return { errorCode: "INVALID_VIN", errorText: "VIN must be at least 11 characters" };
  }
  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${encodeURIComponent(vin)}?format=json`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return { errorCode: "HTTP_ERROR", errorText: `NHTSA API returned ${resp.status}` };
    const json = await resp.json();
    const results: Array<{ Variable: string; Value: string }> = json?.Results ?? [];
    const get = (variable: string) => {
      const found = results.find((r) => r.Variable === variable);
      return found?.Value && found.Value !== "Not Applicable" && found.Value !== "null" ? found.Value : undefined;
    };
    const raw: Record<string, string> = {};
    for (const r of results) {
      if (r.Value && r.Value !== "Not Applicable" && r.Value !== "null") {
        raw[r.Variable] = r.Value;
      }
    }
    return {
      make: get("Make"),
      model: get("Model"),
      modelYear: get("Model Year"),
      vehicleType: get("Vehicle Type"),
      bodyClass: get("Body Class"),
      driveType: get("Drive Type"),
      engineCylinders: get("Engine Number of Cylinders"),
      engineDisplacementL: get("Displacement (L)"),
      fuelTypePrimary: get("Fuel Type - Primary"),
      gvwrClass: get("Gross Vehicle Weight Rating From"),
      plantCountry: get("Plant Country"),
      series: get("Series"),
      trim: get("Trim"),
      transmissionStyle: get("Transmission Style"),
      errorCode: get("Error Code"),
      errorText: get("Error Text"),
      raw,
    };
  } catch (err: any) {
    return { errorCode: "FETCH_ERROR", errorText: err?.message ?? "Unknown error" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURAL PROFILE BUILDER
// ─────────────────────────────────────────────────────────────────────────────

export interface VehicleStructuralProfile {
  vin?: string;
  make: string;
  model: string;
  year?: number;
  // NHTSA data
  nhtsaDecode?: NHTSADecodeResult;
  // ANCAP
  ancapRating?: ANCAPRating | null;
  /** 'verified' = DB match, 'inferred' = class-based estimate, 'insufficient' = no data at all */
  ancapConfidenceTier?: 'verified' | 'inferred' | 'insufficient';
  ancapInferenceReason?: string;
  // Global NCAP Africa
  globalNcapAfrica?: GlobalNCAPAfrica | null;
  // CRASH3
  crash3Class?: CRASH3Class | null;
  // Derived risk flags
  safetyRiskLevel: "low" | "medium" | "high" | "unknown";
  compatibilityRisk: "low" | "medium" | "high" | "unknown";
  // AI narrative
  structuralNarrative?: string;
  /** True if any data point was inferred rather than directly verified from a test database */
  hasInferredData?: boolean;
}

export async function buildVehicleStructuralProfile(params: {
  vin?: string;
  make: string;
  model: string;
  year?: number;
  counterpartMake?: string;
  counterpartModel?: string;
  counterpartYear?: number;
  generateNarrative?: boolean;
}): Promise<VehicleStructuralProfile> {
  const { vin, make, model, year, counterpartMake, counterpartModel, counterpartYear, generateNarrative = true } = params;

  // 1. NHTSA VIN decode
  let nhtsaDecode: NHTSADecodeResult | undefined;
  if (vin) {
    nhtsaDecode = await decodeVINNHTSA(vin);
  }

  // Use NHTSA data to fill gaps
  const resolvedMake = nhtsaDecode?.make || make;
  const resolvedModel = nhtsaDecode?.model || model;
  const resolvedYear = nhtsaDecode?.modelYear ? parseInt(nhtsaDecode.modelYear) : year;

  // 2. Safety ratings lookup
  const ancapRating = lookupANCAPRating(resolvedMake, resolvedModel, resolvedYear);
  const globalNcapAfrica = lookupGlobalNCAP(resolvedMake, resolvedModel);

  // 3. CRASH3 class — pass NHTSA body class for inference fallback
  const crash3Class = getCRASH3Class(resolvedMake, resolvedModel, nhtsaDecode?.bodyClass);

  // 4. Derive safety risk level and ANCAP confidence tier
  let safetyRiskLevel: VehicleStructuralProfile["safetyRiskLevel"] = "unknown";
  let ancapConfidenceTier: VehicleStructuralProfile["ancapConfidenceTier"] = 'insufficient';
  let ancapInferenceReason: string | undefined;
  if (ancapRating) {
    ancapConfidenceTier = 'verified';
    const adultScore = ancapRating.adultOccupant;
    if (adultScore >= 85) safetyRiskLevel = "low";
    else if (adultScore >= 70) safetyRiskLevel = "medium";
    else if (adultScore > 0) safetyRiskLevel = "high";
    else safetyRiskLevel = "medium"; // legacy rating (stars only, no percentage)
  } else if (globalNcapAfrica) {
    ancapConfidenceTier = 'verified';
    if (globalNcapAfrica.adultStars >= 4) safetyRiskLevel = "low";
    else if (globalNcapAfrica.adultStars >= 3) safetyRiskLevel = "medium";
    else safetyRiskLevel = "high";
  } else if (crash3Class) {
    // Infer safety risk from CRASH3 class when no test data exists
    ancapConfidenceTier = 'inferred';
    ancapInferenceReason = `No ANCAP or Global NCAP Africa test data found for ${resolvedMake} ${resolvedModel}. Safety risk estimated from vehicle class structural characteristics (${crash3Class.vehicleClass}).`;
    if (crash3Class.vehicleClass === 'Large SUV/4x4' || crash3Class.vehicleClass === 'Full-size SUV/Pickup') {
      safetyRiskLevel = "medium"; // structurally robust but unknown airbag/restraint quality
    } else if (crash3Class.vehicleClass === 'Mini/Subcompact') {
      safetyRiskLevel = "high"; // lightweight, likely minimal safety tech
    } else {
      safetyRiskLevel = "medium";
    }
  }

  // 5. Derive compatibility risk (if counterpart provided)
  let compatibilityRisk: VehicleStructuralProfile["compatibilityRisk"] = "unknown";
  if (counterpartMake && counterpartModel && crash3Class) {
    const counterpartCrash3 = getCRASH3Class(counterpartMake, counterpartModel);
    if (counterpartCrash3) {
      const massDiff = crash3Class.typicalMassRange_kg[0] - counterpartCrash3.typicalMassRange_kg[1];
      const stiffnessDiff = crash3Class.A_kN_m - counterpartCrash3.A_kN_m;
      if (massDiff > 600 || stiffnessDiff > 100) compatibilityRisk = "high";
      else if (massDiff > 200 || stiffnessDiff > 50) compatibilityRisk = "medium";
      else compatibilityRisk = "low";
    }
  }

  // 6. AI narrative
  let structuralNarrative: string | undefined;
  if (generateNarrative) {
    try {
      const ancapSummary = ancapRating
        ? `ANCAP ${ancapRating.stars}-star (${ancapRating.testYear}, ${ancapRating.protocol} protocol): Adult Occupant ${ancapRating.adultOccupant}%, Child Occupant ${ancapRating.childOccupant}%, VRU ${ancapRating.vruProtection}%, Safety Assist ${ancapRating.safetyAssist}%. [VERIFIED from ANCAP test database]`
        : globalNcapAfrica
        ? `Global NCAP Africa (${globalNcapAfrica.testYear}): ${globalNcapAfrica.adultStars} stars adult occupant. ${globalNcapAfrica.notes || ""} [VERIFIED from Global NCAP Africa database]`
        : ancapConfidenceTier === 'inferred'
        ? `No formal ANCAP or Global NCAP Africa crash test data available for ${resolvedMake} ${resolvedModel}. Safety risk has been estimated from vehicle class characteristics (${crash3Class?.vehicleClass ?? 'unknown class'}). [ESTIMATED — not from a crash test]`
        : "No ANCAP or Global NCAP Africa rating found for this vehicle. Safety performance cannot be assessed from available data.";

      const crash3Summary = crash3Class
        ? `CRASH3 class: ${crash3Class.vehicleClass} [${crash3Class.confidenceTier === 'verified' ? 'VERIFIED' : 'ESTIMATED'}${crash3Class.inferenceReason ? ` — ${crash3Class.inferenceReason}` : ''}]. Stiffness A=${crash3Class.A_kN_m} kN/m, B=${crash3Class.B_kN_m2} kN/m². Typical mass ${crash3Class.typicalMassRange_kg[0]}–${crash3Class.typicalMassRange_kg[1]} kg.`
        : `CRASH3 structural class could not be determined for ${resolvedMake} ${resolvedModel}. Insufficient data for stiffness coefficient estimation.`;

      const counterpartSummary = counterpartMake
        ? `Counterpart vehicle: ${counterpartMake} ${counterpartModel} (${counterpartYear || "year unknown"}).`
        : "No counterpart vehicle specified.";

      const nhtsaSummary = nhtsaDecode && !nhtsaDecode.errorCode
        ? `NHTSA VIN decode: ${nhtsaDecode.make} ${nhtsaDecode.model} ${nhtsaDecode.modelYear}, Body: ${nhtsaDecode.bodyClass || "N/A"}, Drive: ${nhtsaDecode.driveType || "N/A"}, Fuel: ${nhtsaDecode.fuelTypePrimary || "N/A"}.`
        : "";

      const prompt = `You are a forensic vehicle structural analyst for KINGA AutoVerify AI, specialising in the Southern African insurance market.

Vehicle under assessment: ${resolvedMake} ${resolvedModel} (${resolvedYear || "year unknown"})${vin ? `, VIN: ${vin}` : ""}.

${nhtsaSummary}

Safety ratings: ${ancapSummary}

Structural characteristics: ${crash3Summary}

${counterpartSummary}
Compatibility risk assessment: ${compatibilityRisk}.
Safety risk level: ${safetyRiskLevel}.

Write a concise, professional structural intelligence narrative (3–5 paragraphs) for inclusion in a forensic audit report. Cover:
1. The vehicle's structural classification and CRASH3 stiffness profile (state clearly if estimated vs. verified).
2. Its crashworthiness performance based on available safety ratings (if no test data exists, state the basis for the estimate).
3. Any compatibility concerns relative to the counterpart vehicle (if provided).
4. Implications for injury severity assessment and claim validity.
5. Any notable safety technology gaps relevant to the Southern African market specification.

Use precise, technical language appropriate for a forensic engineering report. Where data is estimated rather than verified from a crash test, explicitly state this using phrases such as "based on vehicle class characteristics" or "in the absence of formal crash test data". Never present estimated data as verified. Do not fabricate specific percentage scores or star ratings not present in the provided data.`;

      const llmResp = await invokeLLM({
        messages: [
          { role: "system", content: "You are a forensic vehicle structural analyst. Provide precise, evidence-based analysis." },
          { role: "user", content: prompt },
        ],
      });
      structuralNarrative = llmResp?.choices?.[0]?.message?.content ?? undefined;
    } catch {
      structuralNarrative = undefined;
    }
  }

  const hasInferredData =
    ancapConfidenceTier !== 'verified' ||
    (crash3Class?.confidenceTier !== undefined && crash3Class.confidenceTier !== 'verified');
  return {
    vin,
    make: resolvedMake,
    model: resolvedModel,
    year: resolvedYear,
    nhtsaDecode,
    ancapRating,
    ancapConfidenceTier,
    ancapInferenceReason,
    globalNcapAfrica,
    crash3Class,
    safetyRiskLevel,
    compatibilityRisk,
    structuralNarrative,
    hasInferredData,
  };
}
