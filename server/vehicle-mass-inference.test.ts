/**
 * Tests for the vehicle mass inference logic used in the physics pipeline.
 *
 * The logic lives inline in db.ts (inside runAiAssessmentPipeline) but the
 * same lookup table and fallback chain is mirrored here so it can be unit-
 * tested without spinning up the full database.
 */

import { describe, it, expect } from "vitest";

// ─── Mirror of the inference logic from db.ts ────────────────────────────────

const vehicleMassTable: Record<string, number> = {
  // Honda
  "honda fit": 1050, "honda jazz": 1050, "honda city": 1150, "honda civic": 1250,
  "honda accord": 1500, "honda cr-v": 1550, "honda hr-v": 1300, "honda pilot": 2000,
  "honda odyssey": 1900, "honda freed": 1200,
  // Toyota
  "toyota vitz": 980, "toyota yaris": 1050, "toyota corolla": 1300,
  "toyota corolla cross": 1450, "toyota camry": 1600,
  "toyota rav4": 1700, "toyota c-hr": 1400, "toyota rush": 1500,
  "toyota hilux": 1900, "toyota fortuner": 2100, "toyota land cruiser": 2500,
  "toyota land cruiser prado": 2200, "toyota prado": 2200,
  "toyota tundra": 2300, "toyota tacoma": 1800, "toyota sienna": 2100,
  "toyota hiace": 1900, "toyota quantum": 1900, "toyota probox": 1100,
  "toyota starlet": 900, "toyota etios": 1050,
  // Nissan
  "nissan np200": 900, "nissan np300": 1700, "nissan navara": 1900,
  "nissan x-trail": 1600, "nissan qashqai": 1450, "nissan juke": 1250,
  "nissan micra": 950, "nissan note": 1100, "nissan patrol": 2600,
  "nissan leaf": 1600, "nissan hardbody": 1400,
  // Isuzu
  "isuzu d-max": 1900, "isuzu d-teq": 1900, "isuzu kb": 1900, "isuzu mu-x": 2100,
  // Mazda
  "mazda 2": 1050, "mazda 3": 1300, "mazda 6": 1500, "mazda cx-5": 1600,
  "mazda bt-50": 1900, "mazda mx-5": 1100,
  // Ford
  "ford fiesta": 1050, "ford focus": 1300, "ford mustang": 1800,
  "ford ranger": 1950, "ford f-150": 2300, "ford everest": 2200,
  "ford ecosport": 1300,
  // Volkswagen
  "volkswagen polo": 1100, "volkswagen polo vivo": 1050, "volkswagen up": 950,
  "volkswagen golf": 1300, "volkswagen jetta": 1400, "volkswagen passat": 1600,
  "volkswagen tiguan": 1600, "volkswagen touareg": 2100, "volkswagen amarok": 2100,
  // Mitsubishi
  "mitsubishi colt": 1100, "mitsubishi triton": 1900, "mitsubishi l200": 1900,
  "mitsubishi outlander": 1700, "mitsubishi pajero": 2200,
  // Suzuki
  "suzuki alto": 750, "suzuki swift": 900, "suzuki vitara": 1100,
  "suzuki jimny": 1100, "suzuki grand vitara": 1500,
  // Hyundai
  "hyundai i10": 900, "hyundai i20": 1050, "hyundai i30": 1300,
  "hyundai elantra": 1350, "hyundai tucson": 1600, "hyundai santa fe": 1900,
  "hyundai creta": 1350, "hyundai h100": 1500, "hyundai ioniq 5": 2100,
  // Kia
  "kia picanto": 900, "kia rio": 1050, "kia cerato": 1350,
  "kia sportage": 1600, "kia sorento": 1900, "kia ev6": 2000,
  // BMW
  "bmw 3 series": 1500, "bmw 5 series": 1700, "bmw x3": 1700,
  "bmw x5": 2100, "bmw x7": 2400, "bmw i3": 1200,
  // Mercedes
  "mercedes c-class": 1500, "mercedes e-class": 1700, "mercedes s-class": 2100,
  "mercedes glc": 1800, "mercedes gle": 2100, "mercedes g-class": 2500,
  "mercedes sprinter": 2200,
  // Audi
  "audi a3": 1400, "audi a4": 1600, "audi q5": 1800, "audi q7": 2200,
  // Chevrolet / Opel
  "chevrolet spark": 900, "chevrolet cruze": 1400, "chevrolet trailblazer": 2000,
  "opel corsa": 1100, "opel astra": 1300,
  // Renault
  "renault kwid": 800, "renault sandero": 1050, "renault duster": 1300,
  // Chinese brands
  "haval h6": 1600, "haval jolion": 1450, "mg zs": 1350, "mg hs": 1600,
  "byd atto 3": 1750, "tesla model 3": 1850, "tesla model y": 2000,
  // Commercial
  "toyota hiace": 1900, "nissan urvan": 1900, "mercedes sprinter": 2200,
};

function findMassByKeyword(keyword: string): number | undefined {
  if (!keyword || keyword === "unknown") return undefined;
  // Full string match
  const direct = Object.entries(vehicleMassTable).find(([k]) => k.includes(keyword));
  if (direct) return direct[1];
  // Word-by-word match (skip short tokens like numbers, "np", "d-")
  const words = keyword.split(/\s+/).filter(w => w.length >= 4);
  for (const word of words) {
    const entry = Object.entries(vehicleMassTable).find(([k]) => k.includes(word));
    if (entry) return entry[1];
  }
  return undefined;
}

function inferMassByClass(make: string, model: string): number {
  const combined = `${make} ${model}`;
  if (/hilux|ranger|navara|d-max|d-teq|triton|l200|bt-50|np300|amarok|frontier|tacoma|tundra|f-150|f-250|wingle|steed|np200|hardbody/.test(combined)) return 1900;
  if (/land cruiser|prado|fortuner|patrol|pajero|defender|discovery|grand cherokee|wrangler|expedition|suburban|tahoe|4runner|trooper/.test(combined)) return 2300;
  if (/cr-v|rav4|tucson|santa fe|sorento|cx-5|tiguan|x-trail|qashqai|outlander|mu-x|everest|explorer|edge|koleos|duster|haval h6|jolion|mg hs/.test(combined)) return 1700;
  if (/hr-v|vitara|jimny|juke|kona|venue|seltos|stonic|creta|ecosport|captur|2008|t-cross|t-roc|gla|glb|q3|x1|x2|asx|rvr|mg zs|haval h2/.test(combined)) return 1400;
  if (/hiace|quantum|h1|staria|urvan|sprinter|transit|transporter|trafic|berlingo|caddy|vito|crafter|daily/.test(combined)) return 2000;
  if (/polo|vivo|swift|celerio|alto|kwid|sandero|picanto|morning|i10|i20|atos|vitz|yaris|starlet|etios|agya|fiesta|ka|up|clio|208|punto|500|micra|note|spark|aveo|baleno|city/.test(combined)) return 1050;
  return 1300;
}

function yearMassAdjustment(baseKg: number, year: number): number {
  if (year < 1990) return Math.max(baseKg - 100, 700);
  if (year >= 2020) return baseKg + 50;
  return baseKg;
}

function inferVehicleMass(make: string, model: string, year: number): number {
  const physicsMake = make.toLowerCase();
  const physicsModel = model.toLowerCase();
  const key = `${physicsMake} ${physicsModel}`;

  const raw =
    vehicleMassTable[key] ||
    vehicleMassTable[physicsModel] ||
    vehicleMassTable[physicsMake] ||
    findMassByKeyword(physicsModel) ||
    findMassByKeyword(physicsMake) ||
    inferMassByClass(physicsMake, physicsModel);

  return yearMassAdjustment(raw, year);
}

function inferVehicleType(make: string, model: string): string {
  const combined = `${make.toLowerCase()} ${model.toLowerCase()}`;
  if (/hilux|ranger|navara|d-max|d-teq|triton|l200|bt-50|np300|np200|amarok|frontier|tacoma|tundra|f-150|f-250|wingle|steed|hardbody/.test(combined)) return "pickup";
  if (/land cruiser|prado|fortuner|patrol|pajero|defender|discovery|grand cherokee|wrangler|expedition|suburban|tahoe|4runner|trooper|mu-x|everest|explorer|edge|sorento|santa fe|cx-9|cx-7|cx-5|rav4|cr-v|tucson|x-trail|qashqai|outlander|tiguan|touareg|x5|x7|q7|q8|glc|gle|gls|g-class|xc90|xc60|haval h6|jolion|mg hs/.test(combined)) return "suv";
  if (/hiace|quantum|h1|staria|urvan|sprinter|transit|transporter|trafic|berlingo|caddy|vito|crafter|daily|odyssey|sienna|carnival|tourneo/.test(combined)) return "van";
  if (/mx-5|z4|tt|r8|mustang|stinger|amg gt|boxster|cayman|911|corvette/.test(combined)) return "sports";
  if (/polo|vivo|swift|celerio|alto|kwid|sandero|picanto|morning|i10|i20|atos|vitz|yaris|starlet|etios|agya|fiesta|ka|up|clio|208|punto|500|micra|note|spark|aveo|baleno/.test(combined)) return "compact";
  return "sedan";
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Vehicle mass inference — Tier 1 (exact make+model lookup)", () => {
  it("Honda Fit → 1050 kg (pre-2020)", () => {
    expect(inferVehicleMass("Honda", "Fit", 2018)).toBe(1050);
  });
  it("Honda Fit → 1100 kg (post-2019 +50 kg adjustment)", () => {
    expect(inferVehicleMass("Honda", "Fit", 2021)).toBe(1100);
  });
  it("Toyota Hilux → 1900 kg", () => {
    expect(inferVehicleMass("Toyota", "Hilux", 2019)).toBe(1900);
  });
  it("Toyota Land Cruiser → 2500 kg", () => {
    expect(inferVehicleMass("Toyota", "Land Cruiser", 2018)).toBe(2500);
  });
  it("Toyota Prado → 2200 kg", () => {
    expect(inferVehicleMass("Toyota", "Prado", 2017)).toBe(2200);
  });
  it("Volkswagen Golf → 1300 kg", () => {
    expect(inferVehicleMass("Volkswagen", "Golf", 2019)).toBe(1300);
  });
  it("Mazda BT-50 → 1900 kg", () => {
    expect(inferVehicleMass("Mazda", "BT-50", 2018)).toBe(1900);
  });
  it("Kia Picanto → 900 kg", () => {
    expect(inferVehicleMass("Kia", "Picanto", 2018)).toBe(900);
  });
  it("BMW X5 → 2100 kg", () => {
    expect(inferVehicleMass("BMW", "X5", 2019)).toBe(2100);
  });
  it("Mercedes C-Class → 1500 kg", () => {
    expect(inferVehicleMass("Mercedes", "C-Class", 2019)).toBe(1500);
  });
  it("Tesla Model 3 → 1900 kg (1850 + 50 for 2022)", () => {
    expect(inferVehicleMass("Tesla", "Model 3", 2022)).toBe(1900);
  });
  it("Haval H6 → 1600 kg", () => {
    expect(inferVehicleMass("Haval", "H6", 2019)).toBe(1600);
  });
  it("MG ZS → 1350 kg", () => {
    expect(inferVehicleMass("MG", "ZS", 2019)).toBe(1350);
  });
});

describe("Vehicle mass inference — Tier 3 (partial keyword match)", () => {
  it("Toyota 'Land Cruiser 200' → matches 'toyota land cruiser' entry", () => {
    // model = "land cruiser 200" → findMassByKeyword finds 'toyota land cruiser'
    const mass = inferVehicleMass("Toyota", "Land Cruiser 200", 2018);
    expect(mass).toBeGreaterThanOrEqual(2500);
  });
  it("Nissan 'Navara NP300' → matches 'nissan navara' entry", () => {
    const mass = inferVehicleMass("Nissan", "Navara NP300", 2019);
    expect(mass).toBeGreaterThanOrEqual(1900);
  });
});

describe("Vehicle mass inference — Tier 4 (class heuristic)", () => {
  it("Unknown pickup keyword → 1900 kg", () => {
    expect(inferVehicleMass("Unknown", "Hilux Clone", 2018)).toBe(1900);
  });
  it("Unknown large SUV keyword → ≥2200 kg (Tier 3 finds 'land cruiser' entry = 2500 kg)", () => {
    // Tier 3 word-by-word now finds 'toyota land cruiser' (2500 kg) before Tier 4
    expect(inferVehicleMass("Unknown", "Land Cruiser Clone", 2018)).toBeGreaterThanOrEqual(2200);
  });
  it("Unknown compact keyword → ≥1050 kg (Tier 3 finds 'volkswagen polo' = 1100 kg)", () => {
    // Tier 3 word-by-word now finds 'volkswagen polo' (1100 kg) before Tier 4
    expect(inferVehicleMass("Unknown", "Polo Clone", 2018)).toBeGreaterThanOrEqual(1050);
  });
  it("Completely unknown vehicle → 1300 kg (sedan default)", () => {
    expect(inferVehicleMass("Unknown", "Unknown", 2018)).toBe(1300);
  });
});

describe("Vehicle mass inference — Tier 5 (year adjustment)", () => {
  it("Pre-1990 vehicle → mass reduced by 100 kg", () => {
    const modern = inferVehicleMass("Toyota", "Corolla", 2010);
    const vintage = inferVehicleMass("Toyota", "Corolla", 1985);
    expect(vintage).toBe(modern - 100);
  });
  it("Post-2019 vehicle → mass increased by 50 kg", () => {
    const base = inferVehicleMass("Toyota", "Corolla", 2018);
    const modern = inferVehicleMass("Toyota", "Corolla", 2022);
    expect(modern).toBe(base + 50);
  });
  it("Year 2000-2019 → no adjustment", () => {
    const y2005 = inferVehicleMass("Toyota", "Corolla", 2005);
    const y2015 = inferVehicleMass("Toyota", "Corolla", 2015);
    expect(y2005).toBe(y2015);
  });
});

describe("Vehicle type classification", () => {
  it("Toyota Hilux → pickup", () => expect(inferVehicleType("Toyota", "Hilux")).toBe("pickup"));
  it("Ford Ranger → pickup", () => expect(inferVehicleType("Ford", "Ranger")).toBe("pickup"));
  it("Toyota Fortuner → suv", () => expect(inferVehicleType("Toyota", "Fortuner")).toBe("suv"));
  it("Toyota Land Cruiser → suv", () => expect(inferVehicleType("Toyota", "Land Cruiser")).toBe("suv"));
  it("Toyota Hiace → van", () => expect(inferVehicleType("Toyota", "Hiace")).toBe("van"));
  it("Honda Fit → sedan (not compact, no regex match)", () => expect(inferVehicleType("Honda", "Fit")).toBe("sedan"));
  it("Volkswagen Polo → compact", () => expect(inferVehicleType("Volkswagen", "Polo")).toBe("compact"));
  it("Mazda MX-5 → sports", () => expect(inferVehicleType("Mazda", "MX-5")).toBe("sports"));
  it("Toyota Corolla → sedan", () => expect(inferVehicleType("Toyota", "Corolla")).toBe("sedan"));
  it("BMW X5 → suv", () => expect(inferVehicleType("BMW", "X5")).toBe("suv"));
});

describe("Mass reasonableness checks", () => {
  it("All table values are between 700 kg and 3500 kg", () => {
    for (const [key, mass] of Object.entries(vehicleMassTable)) {
      expect(mass, `${key} mass out of range`).toBeGreaterThanOrEqual(700);
      expect(mass, `${key} mass out of range`).toBeLessThanOrEqual(3500);
    }
  });
  it("Pickup trucks are heavier than compact cars", () => {
    const pickup = inferVehicleMass("Toyota", "Hilux", 2018);
    const compact = inferVehicleMass("Volkswagen", "Polo", 2018);
    expect(pickup).toBeGreaterThan(compact);
  });
  it("Large SUVs are heavier than sedans", () => {
    const suv = inferVehicleMass("Toyota", "Land Cruiser", 2018);
    const sedan = inferVehicleMass("Toyota", "Corolla", 2018);
    expect(suv).toBeGreaterThan(sedan);
  });
});
