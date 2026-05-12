/**
 * KINGA AutoVerify AI - Vehicle Safety Ratings Reference Data
 * Sources: ANCAP (ancap.com.au), Global NCAP (globalncap.org)
 * Last updated: 2026-05-12
 *
 * ANCAP scores are percentages of maximum points achieved.
 * Global NCAP Africa scores are star ratings (0-5 stars).
 */

export interface ANCAPRating {
  make: string;
  model: string;
  variant?: string;
  buildYearFrom: number;
  buildYearTo?: number; // undefined = current
  stars: 5 | 4 | 3 | 2 | 1 | 0;
  testYear: number;
  protocol: "2018" | "2020" | "2022" | "2024" | "legacy";
  adultOccupant: number; // percentage
  childOccupant: number; // percentage
  vruProtection: number; // percentage (Vulnerable Road User)
  safetyAssist: number; // percentage
  source: string;
  notes?: string;
}

export interface GlobalNCAP_Africa {
  make: string;
  model: string;
  variant?: string;
  testYear: number;
  adultStars: number; // 0-5
  childStars: number; // 0-5
  source: string;
  notes?: string;
}

// ============================================================
// ANCAP RATINGS DATABASE
// ============================================================
export const ANCAP_RATINGS: ANCAPRating[] = [
  // ---- TOYOTA ----
  {
    make: "Toyota",
    model: "Hilux",
    variant: "Diesel variants exc. Rugged X",
    buildYearFrom: 2025,
    stars: 5,
    testYear: 2025,
    protocol: "2024",
    adultOccupant: 84,
    childOccupant: 89,
    vruProtection: 82,
    safetyAssist: 82,
    source: "https://www.ancap.com.au/safety-ratings/toyota/hilux/232736",
    notes: "Nov 2025 onwards. Rugged X and BEV variants unrated.",
  },
  {
    make: "Toyota",
    model: "Hilux",
    variant: "Single/Dual/Extended Cab",
    buildYearFrom: 2019,
    buildYearTo: 2025,
    stars: 5,
    testYear: 2019,
    protocol: "2018",
    adultOccupant: 90,
    childOccupant: 88,
    vruProtection: 76,
    safetyAssist: 82,
    source: "https://www.ancap.com.au/safety-ratings/toyota/hilux/cad396",
    notes: "Updated model from May 2019. Rating expired Dec 2025.",
  },
  {
    make: "Toyota",
    model: "Prado",
    variant: "All variants",
    buildYearFrom: 2024,
    stars: 5,
    testYear: 2024,
    protocol: "2022",
    adultOccupant: 85,
    childOccupant: 89,
    vruProtection: 84,
    safetyAssist: 82,
    source: "https://www.ancap.com.au/safety-ratings/toyota/prado/cb1f0f",
    notes: "Nov 2024 onwards. Rating expires Dec 2031.",
  },
  {
    make: "Toyota",
    model: "Prado",
    variant: "All variants",
    buildYearFrom: 2013,
    buildYearTo: 2022,
    stars: 5,
    testYear: 2011,
    protocol: "legacy",
    adultOccupant: 0, // Legacy scoring system (35.11/37 overall)
    childOccupant: 0,
    vruProtection: 0,
    safetyAssist: 0,
    source: "https://www.ancap.com.au/safety-ratings/toyota/prado/ddb0dd",
    notes: "Legacy scoring: 35.11/37. Rating expired Dec 2022.",
  },
  {
    make: "Toyota",
    model: "Fortuner",
    variant: "All variants",
    buildYearFrom: 2019,
    buildYearTo: 2025,
    stars: 5,
    testYear: 2019,
    protocol: "2018",
    adultOccupant: 95,
    childOccupant: 84,
    vruProtection: 88,
    safetyAssist: 78,
    source: "https://www.ancap.com.au/safety-ratings/toyota/fortuner/aebf3a",
    notes: "Based on Hilux crash test data. Rating expired Dec 2025.",
  },
  {
    make: "Toyota",
    model: "Land Cruiser",
    variant: "300 Series, All variants",
    buildYearFrom: 2021,
    stars: 5,
    testYear: 2022,
    protocol: "2020",
    adultOccupant: 89,
    childOccupant: 88,
    vruProtection: 81,
    safetyAssist: 81,
    source: "https://www.ancap.com.au/media-and-gallery/media-releases/new-toyota-landcruiser-shows-strong-safety-performance",
    notes: "300 Series. Rating expires Dec 2028.",
  },
  {
    make: "Toyota",
    model: "RAV4",
    variant: "All variants",
    buildYearFrom: 2019,
    stars: 5,
    testYear: 2019,
    protocol: "2018",
    adultOccupant: 93,
    childOccupant: 87,
    vruProtection: 85,
    safetyAssist: 77,
    source: "https://www.ancap.com.au/safety-ratings/toyota/rav4/c922ba",
    notes: "May 2019 onwards.",
  },
  {
    make: "Toyota",
    model: "Corolla",
    variant: "All petrol/hybrid hatch variants",
    buildYearFrom: 2018,
    stars: 5,
    testYear: 2018,
    protocol: "2018",
    adultOccupant: 96,
    childOccupant: 83,
    vruProtection: 0, // Not assessed under 2018 protocol
    safetyAssist: 0,
    source: "https://www.ancap.com.au/safety-ratings/toyota/corolla/8ad73a",
    notes: "2018 test criteria. VRU/SA not separately scored.",
  },
  {
    make: "Toyota",
    model: "Corolla Cross",
    variant: "All variants",
    buildYearFrom: 2023,
    stars: 5,
    testYear: 2023,
    protocol: "2022",
    adultOccupant: 85,
    childOccupant: 0,
    vruProtection: 0,
    safetyAssist: 0,
    source: "https://www.ancap.com.au/safety-ratings/toyota/corolla-cross/530bf9",
    notes: "85% adult occupant. Global NCAP Africa 2026 test: 2 stars (no side head protection in African spec).",
  },
  {
    make: "Toyota",
    model: "Camry",
    variant: "All variants",
    buildYearFrom: 2024,
    stars: 5,
    testYear: 2024,
    protocol: "2022",
    adultOccupant: 95,
    childOccupant: 87,
    vruProtection: 0,
    safetyAssist: 0,
    source: "https://www.ancap.com.au",
    notes: "Highest individual adult occupant score of 2024 ANCAP tests.",
  },
  {
    make: "Toyota",
    model: "HiAce",
    variant: "Van/Commuter",
    buildYearFrom: 2019,
    buildYearTo: 2025,
    stars: 5,
    testYear: 2019,
    protocol: "2018",
    adultOccupant: 80,
    childOccupant: 86,
    vruProtection: 87,
    safetyAssist: 0,
    source: "https://www.ancap.com.au/safety-ratings/toyota/hiace/389933",
    notes: "May 2019 onwards. Updated 2025 model: 94% adult occupant.",
  },

  // ---- NISSAN ----
  {
    make: "Nissan",
    model: "Navara",
    variant: "All dual cab variants (D27)",
    buildYearFrom: 2025,
    stars: 5,
    testYear: 2024,
    protocol: "2022",
    adultOccupant: 86,
    childOccupant: 89,
    vruProtection: 74,
    safetyAssist: 70,
    source: "https://www.ancap.com.au/safety-ratings/nissan/navara/fd8942",
    notes: "Based on Mitsubishi Triton test data. Rating expires Dec 2031.",
  },
  {
    make: "Nissan",
    model: "Navara",
    variant: "NP300 Dual/King/Single Cab",
    buildYearFrom: 2015,
    buildYearTo: 2022,
    stars: 5,
    testYear: 2015,
    protocol: "legacy",
    adultOccupant: 0, // Legacy: 35.01/37 dual/king, 34.01/37 single
    childOccupant: 0,
    vruProtection: 0,
    safetyAssist: 0,
    source: "https://www.ancap.com.au/safety-ratings/nissan/navara/52372f",
    notes: "Legacy scoring. 35.01/37 dual/king cab; 34.01/37 single cab.",
  },

  // ---- ISUZU ----
  {
    make: "Isuzu",
    model: "D-Max",
    variant: "All variants",
    buildYearFrom: 2021,
    stars: 5,
    testYear: 2020,
    protocol: "2020",
    adultOccupant: 83,
    childOccupant: 89,
    vruProtection: 69,
    safetyAssist: 81,
    source: "https://www.ancap.com.au/safety-ratings/isuzu/d-max/d9fa82",
    notes: "First ute to earn 5 stars under 2020 criteria.",
  },
  {
    make: "Isuzu",
    model: "MU-X",
    variant: "All variants",
    buildYearFrom: 2021,
    stars: 5,
    testYear: 2021,
    protocol: "2020",
    adultOccupant: 86,
    childOccupant: 85,
    vruProtection: 69,
    safetyAssist: 84,
    source: "https://www.ancap.com.au/safety-ratings/isuzu/mu-x/2f75e8",
    notes: "Aug 2021 onwards.",
  },

  // ---- FORD ----
  {
    make: "Ford",
    model: "Ranger",
    variant: "All variants",
    buildYearFrom: 2022,
    stars: 5,
    testYear: 2022,
    protocol: "2020",
    adultOccupant: 84,
    childOccupant: 93,
    vruProtection: 74,
    safetyAssist: 83,
    source: "https://www.ancap.com.au/safety-ratings/ford/ranger/58f98d",
    notes: "Jul 2022 onwards.",
  },
  {
    make: "Ford",
    model: "Everest",
    variant: "All variants",
    buildYearFrom: 2022,
    stars: 5,
    testYear: 2022,
    protocol: "2020",
    adultOccupant: 86,
    childOccupant: 93,
    vruProtection: 74,
    safetyAssist: 86,
    source: "https://www.ancap.com.au/safety-ratings/ford/everest/f18eb7",
    notes: "Aug 2022 onwards.",
  },

  // ---- VOLKSWAGEN ----
  {
    make: "Volkswagen",
    model: "Amarok",
    variant: "All variants (2nd gen)",
    buildYearFrom: 2023,
    stars: 5,
    testYear: 2023,
    protocol: "2020",
    adultOccupant: 86,
    childOccupant: 93,
    vruProtection: 74,
    safetyAssist: 83,
    source: "https://www.ancap.com.au/safety-ratings/volkswagen/amarok/262acd",
    notes: "Based on Ford Ranger test data. May 2023 onwards.",
  },

  // ---- MITSUBISHI ----
  {
    make: "Mitsubishi",
    model: "Triton",
    variant: "All variants",
    buildYearFrom: 2024,
    stars: 5,
    testYear: 2024,
    protocol: "2022",
    adultOccupant: 86,
    childOccupant: 89,
    vruProtection: 73,
    safetyAssist: 70,
    source: "https://www.ancap.com.au/safety-ratings/mitsubishi/triton/08109a",
    notes: "Apr 2024 onwards. Rating expires Dec 2031.",
  },

  // ---- MAZDA ----
  {
    make: "Mazda",
    model: "BT-50",
    variant: "All variants",
    buildYearFrom: 2021,
    stars: 5,
    testYear: 2020,
    protocol: "2020",
    adultOccupant: 83,
    childOccupant: 89,
    vruProtection: 69,
    safetyAssist: 81,
    source: "https://www.ancap.com.au/safety-ratings/mazda/bt-50/d7c175",
    notes: "Based on Isuzu D-Max test data.",
  },
  {
    make: "Mazda",
    model: "CX-5",
    variant: "All variants",
    buildYearFrom: 2021,
    stars: 5,
    testYear: 2021,
    protocol: "2020",
    adultOccupant: 86,
    childOccupant: 87,
    vruProtection: 0,
    safetyAssist: 0,
    source: "https://www.ancap.com.au",
    notes: "2021 test.",
  },

  // ---- HYUNDAI ----
  {
    make: "Hyundai",
    model: "Tucson",
    variant: "All variants",
    buildYearFrom: 2021,
    stars: 5,
    testYear: 2021,
    protocol: "2020",
    adultOccupant: 86,
    childOccupant: 87,
    vruProtection: 70,
    safetyAssist: 70,
    source: "https://www.ancap.com.au/safety-ratings/hyundai/tucson/0b314b",
    notes: "2021 onwards.",
  },
];

// ============================================================
// GLOBAL NCAP AFRICA RATINGS DATABASE
// ============================================================
export const GLOBAL_NCAP_AFRICA: GlobalNCAP_Africa[] = [
  // 2026
  {
    make: "Toyota",
    model: "Corolla Cross",
    testYear: 2026,
    adultStars: 2,
    childStars: 0,
    source: "https://www.globalncap.org/africaresults",
    notes: "2 stars adult - no standard side head protection in African spec.",
  },
  // 2025
  {
    make: "Hyundai",
    model: "Grand i10",
    testYear: 2025,
    adultStars: 4,
    childStars: 4,
    source: "https://www.globalncap.org/africaresults",
  },
  {
    make: "Nissan",
    model: "Magnite",
    testYear: 2025,
    adultStars: 4,
    childStars: 4,
    source: "https://www.globalncap.org/africaresults",
    notes: "Improved variant from VIN MDHFBADD0Z0037139.",
  },
  // 2024
  {
    make: "Volkswagen",
    model: "Polo Vivo",
    variant: "Facelift - 2 airbags std + optional side airbags",
    testYear: 2024,
    adultStars: 4,
    childStars: 3,
    source: "https://www.globalncap.org/news/vw-polo-vivo-scores-four-stars-in-safercarsforafrica-voluntary-test",
    notes: "4-star adult with optional side airbags. Pre-facelift: 3 stars adult.",
  },
  {
    make: "Volkswagen",
    model: "Polo Vivo",
    variant: "Pre-facelift - 2 airbags",
    testYear: 2024,
    adultStars: 3,
    childStars: 0,
    source: "https://www.globalncap.org/africaresults",
  },
  {
    make: "Maruti Suzuki",
    model: "Ertiga",
    variant: "2 airbags",
    testYear: 2024,
    adultStars: 2,
    childStars: 0,
    source: "https://www.globalncap.org/africaresults",
  },
  {
    make: "Renault",
    model: "Triber",
    variant: "2 airbags",
    testYear: 2024,
    adultStars: 2,
    childStars: 0,
    source: "https://www.globalncap.org/africaresults",
  },
  {
    make: "Kia",
    model: "Pegas",
    variant: "2 airbags",
    testYear: 2024,
    adultStars: 2,
    childStars: 0,
    source: "https://www.globalncap.org/africaresults",
  },
  // 2022
  {
    make: "Suzuki",
    model: "S-Presso",
    variant: "2 airbags, RHD",
    testYear: 2022,
    adultStars: 0,
    childStars: 0,
    source: "https://www.globalncap.org/africaresults",
    notes: "Zero stars adult occupant.",
  },
  // 2021
  {
    make: "Mazda",
    model: "2",
    variant: "2 airbags, RHD",
    testYear: 2021,
    adultStars: 4,
    childStars: 0,
    source: "https://www.globalncap.org/africaresults",
  },
  {
    make: "Nissan",
    model: "Almera",
    variant: "2 airbags, RHD",
    testYear: 2021,
    adultStars: 3,
    childStars: 0,
    source: "https://www.globalncap.org/africaresults",
  },
  {
    make: "Mahindra",
    model: "XUV300",
    variant: "2 airbags, RHD",
    testYear: 2021,
    adultStars: 5,
    childStars: 0,
    source: "https://www.globalncap.org/africaresults",
    notes: "5 stars adult occupant.",
  },
  // 2020
  {
    make: "Great Wall",
    model: "Steed 5",
    variant: "No airbags, RHD",
    testYear: 2020,
    adultStars: 0,
    childStars: 0,
    source: "https://www.globalncap.org/africaresults",
    notes: "Zero stars - no airbags.",
  },
  {
    make: "Haval",
    model: "H1",
    variant: "2 airbags, RHD",
    testYear: 2020,
    adultStars: 3,
    childStars: 0,
    source: "https://www.globalncap.org/africaresults",
  },
  {
    make: "Renault",
    model: "Kwid",
    variant: "2 airbags, RHD",
    testYear: 2020,
    adultStars: 2,
    childStars: 0,
    source: "https://www.globalncap.org/africaresults",
  },
  // 2019
  {
    make: "Toyota",
    model: "Avanza",
    variant: "2 airbags, RHD",
    testYear: 2019,
    adultStars: 4,
    childStars: 0,
    source: "https://aa.co.za/media/crash-tests/2019-crash-test-results/",
    notes: "4 stars despite unstable structure/footwell area.",
  },
  // 2018
  {
    make: "Nissan",
    model: "NP300 Hardbody",
    variant: "2 airbags, RHD",
    testYear: 2018,
    adultStars: 1,
    childStars: 0,
    source: "https://www.citizen.co.za/motoring/global-ncap-safercarsforafrica-cars-ranked/",
    notes: "1 star adult occupant. 2020 car-to-car test showed 0 stars for updated model.",
  },
  {
    make: "Toyota",
    model: "Yaris",
    variant: "2 airbags, RHD",
    testYear: 2018,
    adultStars: 4,
    childStars: 0,
    source: "https://www.globalncap.org/africaresults",
  },
  {
    make: "Hyundai",
    model: "i20",
    variant: "2 airbags, RHD",
    testYear: 2018,
    adultStars: 4,
    childStars: 0,
    source: "https://www.globalncap.org/africaresults",
  },
  {
    make: "Kia",
    model: "Picanto",
    variant: "1 airbag, RHD",
    testYear: 2018,
    adultStars: 3,
    childStars: 0,
    source: "https://www.globalncap.org/africaresults",
  },
  // 2017
  {
    make: "Renault",
    model: "Sandero",
    variant: "2 airbags, RHD",
    testYear: 2017,
    adultStars: 3,
    childStars: 0,
    source: "https://www.globalncap.org/africaresults",
  },
  {
    make: "Volkswagen",
    model: "Polo Vivo",
    variant: "2 airbags, RHD (original)",
    testYear: 2017,
    adultStars: 3,
    childStars: 0,
    source: "https://www.globalncap.org/africaresults",
  },
  {
    make: "Datsun",
    model: "GO+",
    variant: "1 airbag, RHD",
    testYear: 2017,
    adultStars: 2,
    childStars: 0,
    source: "https://www.globalncap.org/africaresults",
  },
  {
    make: "Chery",
    model: "QQ3",
    variant: "No airbags, RHD",
    testYear: 2017,
    adultStars: 0,
    childStars: 0,
    source: "https://www.globalncap.org/africaresults",
    notes: "Zero stars - no airbags.",
  },
];

// ============================================================
// CRASH3 STIFFNESS COEFFICIENTS
// Source: Campbell 1974, Prasad 1990, Nystrom et al. (JSHeld paper)
// Units: A in N/m, B in N/m²
// ============================================================
export interface CRASH3Coefficients {
  vehicleClass: string;
  description: string;
  A_kN_m: number; // Stiffness coefficient A (kN/m)
  B_kN_m2: number; // Stiffness coefficient B (kN/m²)
  G_J_m2: number; // Residual crush energy G (J/m²)
  typicalMass_kg: [number, number]; // [min, max] kg
  notes?: string;
}

export const CRASH3_COEFFICIENTS: CRASH3Coefficients[] = [
  {
    vehicleClass: "Mini/Subcompact",
    description: "Small passenger cars (e.g., VW Polo, Toyota Yaris, Suzuki Swift)",
    A_kN_m: 207,
    B_kN_m2: 429,
    G_J_m2: 0,
    typicalMass_kg: [900, 1200],
    notes: "Lower stiffness; higher crush depth per unit energy",
  },
  {
    vehicleClass: "Compact/Sedan",
    description: "Mid-size sedans and hatchbacks (e.g., Toyota Corolla, VW Golf, Hyundai i30)",
    A_kN_m: 250,
    B_kN_m2: 510,
    G_J_m2: 0,
    typicalMass_kg: [1100, 1450],
  },
  {
    vehicleClass: "Mid-size Sedan/SUV",
    description: "Mid-size sedans, crossovers (e.g., Toyota Camry, Mazda CX-5, Hyundai Tucson)",
    A_kN_m: 290,
    B_kN_m2: 580,
    G_J_m2: 0,
    typicalMass_kg: [1400, 1800],
  },
  {
    vehicleClass: "Full-size SUV/Pickup",
    description: "Full-size SUVs and pickup trucks (e.g., Toyota Hilux, Ford Ranger, Isuzu D-Max, Toyota Prado)",
    A_kN_m: 340,
    B_kN_m2: 650,
    G_J_m2: 0,
    typicalMass_kg: [1800, 2400],
    notes: "Higher stiffness; body-on-frame construction",
  },
  {
    vehicleClass: "Large SUV/4x4",
    description: "Heavy-duty 4x4s and large SUVs (e.g., Toyota Land Cruiser 200/300, Nissan Patrol, Ford Everest)",
    A_kN_m: 380,
    B_kN_m2: 720,
    G_J_m2: 0,
    typicalMass_kg: [2200, 3000],
    notes: "Highest stiffness class; significant compatibility concerns in crashes with smaller vehicles",
  },
  {
    vehicleClass: "Light Commercial Van",
    description: "Vans and minibuses (e.g., Toyota HiAce, VW Transporter)",
    A_kN_m: 220,
    B_kN_m2: 460,
    G_J_m2: 0,
    typicalMass_kg: [1800, 3500],
    notes: "Front structure often less stiff than equivalent mass passenger car",
  },
];

// ============================================================
// VEHICLE MAKE/MODEL TO CRASH3 CLASS MAPPING
// ============================================================
export const VEHICLE_CRASH3_CLASS_MAP: Record<string, string> = {
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
  // Nissan
  "nissan navara": "Full-size SUV/Pickup",
  "nissan np300": "Full-size SUV/Pickup",
  "nissan hardbody": "Full-size SUV/Pickup",
  "nissan patrol": "Large SUV/4x4",
  "nissan almera": "Compact/Sedan",
  "nissan magnite": "Mini/Subcompact",
  // Isuzu
  "isuzu d-max": "Full-size SUV/Pickup",
  "isuzu dmax": "Full-size SUV/Pickup",
  "isuzu mu-x": "Full-size SUV/Pickup",
  // Ford
  "ford ranger": "Full-size SUV/Pickup",
  "ford everest": "Full-size SUV/Pickup",
  // Volkswagen
  "volkswagen amarok": "Full-size SUV/Pickup",
  "vw amarok": "Full-size SUV/Pickup",
  "volkswagen polo vivo": "Mini/Subcompact",
  "vw polo vivo": "Mini/Subcompact",
  "volkswagen polo": "Mini/Subcompact",
  "vw polo": "Mini/Subcompact",
  // Mitsubishi
  "mitsubishi triton": "Full-size SUV/Pickup",
  "mitsubishi l200": "Full-size SUV/Pickup",
  "mitsubishi pajero": "Large SUV/4x4",
  // Mazda
  "mazda bt-50": "Full-size SUV/Pickup",
  "mazda cx-5": "Mid-size Sedan/SUV",
  "mazda 2": "Mini/Subcompact",
  // Hyundai
  "hyundai tucson": "Mid-size Sedan/SUV",
  "hyundai grand i10": "Mini/Subcompact",
  "hyundai i20": "Mini/Subcompact",
  // Kia
  "kia picanto": "Mini/Subcompact",
  "kia pegas": "Compact/Sedan",
  // Renault
  "renault sandero": "Mini/Subcompact",
  "renault kwid": "Mini/Subcompact",
  "renault triber": "Compact/Sedan",
  // Suzuki
  "suzuki s-presso": "Mini/Subcompact",
  "suzuki ignis": "Mini/Subcompact",
  // Datsun
  "datsun go+": "Mini/Subcompact",
  "datsun go": "Mini/Subcompact",
  // Chery
  "chery qq3": "Mini/Subcompact",
  "chery tiggo": "Mid-size Sedan/SUV",
  // Great Wall / Haval
  "great wall steed": "Full-size SUV/Pickup",
  "haval h1": "Mini/Subcompact",
  // Honda
  "honda amaze": "Compact/Sedan",
  // Mahindra
  "mahindra xuv300": "Mini/Subcompact",
};

/**
 * Look up ANCAP rating for a given make and model
 */
export function lookupANCAPRating(make: string, model: string, year?: number): ANCAPRating | null {
  const normalizedMake = make.toLowerCase().trim();
  const normalizedModel = model.toLowerCase().trim();

  const matches = ANCAP_RATINGS.filter((r) => {
    const rMake = r.make.toLowerCase();
    const rModel = r.model.toLowerCase();
    if (!rMake.includes(normalizedMake) && !normalizedMake.includes(rMake)) return false;
    if (!rModel.includes(normalizedModel) && !normalizedModel.includes(rModel)) return false;
    if (year) {
      if (year < r.buildYearFrom) return false;
      if (r.buildYearTo && year > r.buildYearTo) return false;
    }
    return true;
  });

  if (matches.length === 0) return null;
  // Return most recent rating
  return matches.sort((a, b) => b.testYear - a.testYear)[0];
}

/**
 * Look up Global NCAP Africa rating for a given make and model
 */
export function lookupGlobalNCAP(make: string, model: string): GlobalNCAP_Africa | null {
  const normalizedMake = make.toLowerCase().trim();
  const normalizedModel = model.toLowerCase().trim();

  const matches = GLOBAL_NCAP_AFRICA.filter((r) => {
    const rMake = r.make.toLowerCase();
    const rModel = r.model.toLowerCase();
    return (
      (rMake.includes(normalizedMake) || normalizedMake.includes(rMake)) &&
      (rModel.includes(normalizedModel) || normalizedModel.includes(rModel))
    );
  });

  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.testYear - a.testYear)[0];
}

/**
 * Get CRASH3 coefficients for a vehicle
 */
export function getCRASH3Coefficients(make: string, model: string): CRASH3Coefficients | null {
  const key = `${make.toLowerCase().trim()} ${model.toLowerCase().trim()}`;
  const vehicleClass = VEHICLE_CRASH3_CLASS_MAP[key];
  if (!vehicleClass) return null;
  return CRASH3_COEFFICIENTS.find((c) => c.vehicleClass === vehicleClass) || null;
}
