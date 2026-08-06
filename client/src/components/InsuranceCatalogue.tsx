/**
 * Phase 10 — Insurance Product Catalogue
 * Displays all available insurance product lines with icons and descriptions.
 * Used in the Client Portal Insurance tab and the public landing page.
 */
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Car, Home, Cpu, HardHat, Zap, Shield, Briefcase,
  FileText, Users, Award, Anchor, Plane, UserCheck, Building2
} from "lucide-react";

export type InsuranceProduct = {
  id: string;
  name: string;
  category: "motor" | "property" | "engineering" | "liability" | "bonds" | "personal";
  description: string;
  icon: React.ReactNode;
  popular?: boolean;
  fields: "motor" | "property" | "engineering" | "bonds" | "personal" | "liability";
};

export const INSURANCE_PRODUCTS: InsuranceProduct[] = [
  // Motor
  {
    id: "comprehensive",
    name: "Comprehensive Motor",
    category: "motor",
    description: "Full coverage for your vehicle including own damage, third-party liability, fire and theft.",
    icon: <Car className="h-6 w-6" />,
    popular: true,
    fields: "motor",
  },
  {
    id: "third_party",
    name: "Third Party Only",
    category: "motor",
    description: "Covers damage and injury to third parties. Minimum statutory cover.",
    icon: <Car className="h-6 w-6" />,
    fields: "motor",
  },
  {
    id: "third_party_fire_theft",
    name: "Third Party, Fire & Theft",
    category: "motor",
    description: "Third-party cover plus protection against fire damage and vehicle theft.",
    icon: <Car className="h-6 w-6" />,
    fields: "motor",
  },
  {
    id: "fleet",
    name: "Fleet Insurance",
    category: "motor",
    description: "Single policy covering multiple vehicles for businesses and organisations.",
    icon: <Car className="h-6 w-6" />,
    fields: "motor",
  },
  // Property
  {
    id: "homeowners",
    name: "Homeowners Insurance",
    category: "property",
    description: "Protects your home structure and contents against fire, storm, theft, and other perils.",
    icon: <Home className="h-6 w-6" />,
    popular: true,
    fields: "property",
  },
  {
    id: "fire_and_perils",
    name: "Fire & Allied Perils",
    category: "property",
    description: "Commercial property cover for fire, lightning, explosion, storm, and flood damage.",
    icon: <Building2 className="h-6 w-6" />,
    fields: "property",
  },
  {
    id: "assets_all_risks",
    name: "Assets All Risks",
    category: "property",
    description: "Broad all-risks cover for business assets, equipment, and stock against accidental loss or damage.",
    icon: <Shield className="h-6 w-6" />,
    popular: true,
    fields: "property",
  },
  // Engineering
  {
    id: "plant_all_risks",
    name: "Plant All Risks",
    category: "engineering",
    description: "Covers construction plant, machinery, and equipment against accidental damage and breakdown.",
    icon: <HardHat className="h-6 w-6" />,
    popular: true,
    fields: "engineering",
  },
  {
    id: "electronic_equipment",
    name: "Electronic Equipment",
    category: "engineering",
    description: "Protects computers, servers, medical equipment, and other electronic devices against damage and breakdown.",
    icon: <Cpu className="h-6 w-6" />,
    fields: "engineering",
  },
  {
    id: "contractors_all_risks",
    name: "Contractors All Risks (CAR)",
    category: "engineering",
    description: "Covers civil engineering and building projects during construction against material damage and third-party liability.",
    icon: <HardHat className="h-6 w-6" />,
    popular: true,
    fields: "engineering",
  },
  {
    id: "erection_all_risks",
    name: "Erection All Risks (EAR)",
    category: "engineering",
    description: "Covers mechanical and electrical plant erection projects including testing and commissioning.",
    icon: <Zap className="h-6 w-6" />,
    fields: "engineering",
  },
  // Liability
  {
    id: "public_liability",
    name: "Public Liability",
    category: "liability",
    description: "Protects your business against claims from members of the public for injury or property damage.",
    icon: <Users className="h-6 w-6" />,
    popular: true,
    fields: "liability",
  },
  {
    id: "employers_liability",
    name: "Employers Liability",
    category: "liability",
    description: "Covers your legal liability for employee injuries or illness arising from their employment.",
    icon: <Briefcase className="h-6 w-6" />,
    fields: "liability",
  },
  {
    id: "professional_indemnity",
    name: "Professional Indemnity",
    category: "liability",
    description: "Protects professionals against claims of negligence, errors, or omissions in their services.",
    icon: <Award className="h-6 w-6" />,
    fields: "liability",
  },
  // Bonds
  {
    id: "fidelity_guarantee",
    name: "Fidelity Guarantee",
    category: "bonds",
    description: "Protects employers against financial loss caused by dishonest acts of employees.",
    icon: <FileText className="h-6 w-6" />,
    fields: "bonds",
  },
  {
    id: "bonds",
    name: "Surety Bonds",
    category: "bonds",
    description: "Performance, advance payment, bid, and customs bonds for contractual and regulatory obligations.",
    icon: <Anchor className="h-6 w-6" />,
    popular: true,
    fields: "bonds",
  },
  // Personal
  {
    id: "personal_accident",
    name: "Personal Accident",
    category: "personal",
    description: "Pays a lump sum or income replacement in the event of accidental death or disability.",
    icon: <UserCheck className="h-6 w-6" />,
    fields: "personal",
  },
  {
    id: "travel",
    name: "Travel Insurance",
    category: "personal",
    description: "Covers medical emergencies, trip cancellation, lost luggage, and travel delays.",
    icon: <Plane className="h-6 w-6" />,
    fields: "personal",
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  motor: "Motor",
  property: "Property",
  engineering: "Engineering",
  liability: "Liability",
  bonds: "Bonds & Guarantees",
  personal: "Personal",
};

const CATEGORY_COLORS: Record<string, string> = {
  motor: "bg-blue-50 border-blue-200 text-blue-800",
  property: "bg-amber-50 border-amber-200 text-amber-800",
  engineering: "bg-orange-50 border-orange-200 text-orange-800",
  liability: "bg-purple-50 border-purple-200 text-purple-800",
  bonds: "bg-emerald-50 border-emerald-200 text-emerald-800",
  personal: "bg-pink-50 border-pink-200 text-pink-800",
};

const ICON_BG: Record<string, string> = {
  motor: "bg-blue-100 text-blue-600",
  property: "bg-amber-100 text-amber-600",
  engineering: "bg-orange-100 text-orange-600",
  liability: "bg-purple-100 text-purple-600",
  bonds: "bg-emerald-100 text-emerald-600",
  personal: "bg-pink-100 text-pink-600",
};

interface InsuranceCatalogueProps {
  onSelect: (product: InsuranceProduct) => void;
  filterCategory?: string;
}

export default function InsuranceCatalogue({ onSelect, filterCategory }: InsuranceCatalogueProps) {
  const categories = filterCategory
    ? [filterCategory]
    : ["motor", "property", "engineering", "liability", "bonds", "personal"];

  return (
    <div className="space-y-8">
      {categories.map(cat => {
        const products = INSURANCE_PRODUCTS.filter(p => p.category === cat);
        if (products.length === 0) return null;
        return (
          <div key={cat}>
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
              {CATEGORY_LABELS[cat]}
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {products.map(product => (
                <div
                  key={product.id}
                  className={`relative rounded-xl border p-4 cursor-pointer hover:shadow-md transition-shadow ${CATEGORY_COLORS[product.category]}`}
                  onClick={() => onSelect(product)}
                >
                  {product.popular && (
                    <Badge className="absolute top-3 right-3 text-xs bg-white/80 text-slate-700 border border-slate-200">
                      Popular
                    </Badge>
                  )}
                  <div className={`inline-flex p-2 rounded-lg mb-3 ${ICON_BG[product.category]}`}>
                    {product.icon}
                  </div>
                  <h4 className="font-semibold text-sm mb-1">{product.name}</h4>
                  <p className="text-xs opacity-80 leading-relaxed mb-3">{product.description}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full bg-white/60 hover:bg-white border-current/30 text-xs"
                    onClick={(e) => { e.stopPropagation(); onSelect(product); }}
                  >
                    Request Cover
                  </Button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
