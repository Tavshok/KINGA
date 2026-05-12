// @ts-nocheck
/**
 * Vehicle Structural Intelligence Panel
 *
 * Displays:
 *  - ANCAP / Global NCAP Africa safety ratings with visual score bars
 *  - CRASH3 stiffness coefficients and vehicle class
 *  - NHTSA VIN decode results
 *  - Compatibility risk assessment (insured vs third-party)
 *  - AI-generated structural narrative
 *
 * Used in: ClaimsManagerComparisonView, AssessorClaimDetails, ForensicAuditReport
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Car,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  Activity,
  Zap,
  BarChart3,
  FileText,
  Globe,
  Star,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function ScoreBar({
  label,
  value,
  max = 100,
  colorThresholds = [70, 85],
}: {
  label: string;
  value: number;
  max?: number;
  colorThresholds?: [number, number];
}) {
  if (!value || value === 0) return null;
  const pct = Math.min(100, (value / max) * 100);
  const color =
    pct >= colorThresholds[1]
      ? "bg-emerald-500"
      : pct >= colorThresholds[0]
      ? "bg-amber-500"
      : "bg-red-500";
  const textColor =
    pct >= colorThresholds[1]
      ? "text-emerald-700 dark:text-emerald-300"
      : pct >= colorThresholds[0]
      ? "text-amber-700 dark:text-amber-300"
      : "text-red-700 dark:text-red-300";

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-semibold ${textColor}`}>{value}%</span>
      </div>
      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
        <div
          className={`${color} h-2 rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StarRating({ stars, max = 5, label }: { stars: number; max?: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-28 shrink-0">{label}</span>
      <div className="flex gap-0.5">
        {Array.from({ length: max }).map((_, i) => (
          <Star
            key={i}
            className={`w-3.5 h-3.5 ${
              i < stars
                ? "fill-amber-400 text-amber-400"
                : "fill-slate-200 text-slate-300 dark:fill-slate-600 dark:text-slate-600"
            }`}
          />
        ))}
      </div>
      <span className="text-xs font-semibold text-muted-foreground">{stars}/{max}</span>
    </div>
  );
}

function RiskBadge({ level }: { level: "low" | "medium" | "high" | "unknown" }) {
  const config = {
    low: { label: "Low Risk", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-300", icon: ShieldCheck },
    medium: { label: "Medium Risk", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-300", icon: ShieldAlert },
    high: { label: "High Risk", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-300", icon: ShieldX },
    unknown: { label: "Unknown", className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-300", icon: Shield },
  };
  const { label, className, icon: Icon } = config[level];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${className}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

function CompatibilityRiskCard({
  insuredClass,
  thirdPartyClass,
  risk,
}: {
  insuredClass?: string;
  thirdPartyClass?: string;
  risk: "low" | "medium" | "high" | "unknown";
}) {
  const descriptions = {
    low: "The two vehicles are structurally compatible. Similar mass and stiffness characteristics reduce the risk of disproportionate injury distribution.",
    medium: "Moderate structural mismatch detected. The heavier or stiffer vehicle may impose greater deceleration forces on the lighter vehicle's occupants.",
    high: "Significant structural incompatibility. The mass and stiffness differential creates a high risk of disproportionate injury to occupants of the lighter/less stiff vehicle. This is a critical factor in injury severity assessment.",
    unknown: "Insufficient data to assess structural compatibility between the two vehicles.",
  };
  const colors = {
    low: "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20",
    medium: "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20",
    high: "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20",
    unknown: "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/20",
  };
  return (
    <div className={`rounded-lg border p-3 space-y-2 ${colors[risk]}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">Structural Compatibility</span>
        <RiskBadge level={risk} />
      </div>
      {insuredClass && thirdPartyClass && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{insuredClass}</span>
          <span>vs</span>
          <span className="font-medium text-foreground">{thirdPartyClass}</span>
        </div>
      )}
      <p className="text-xs text-muted-foreground leading-relaxed">{descriptions[risk]}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PANEL
// ─────────────────────────────────────────────────────────────────────────────

interface VehicleStructuralIntelligencePanelProps {
  /** Provide claimId to auto-fetch from the claim record */
  claimId?: number;
  /** Or provide vehicle details directly */
  make?: string;
  model?: string;
  year?: number;
  vin?: string;
  counterpartMake?: string;
  counterpartModel?: string;
  counterpartYear?: number;
  /** Whether to generate AI narrative (default: true) */
  generateNarrative?: boolean;
  /** Compact mode for embedding in other panels */
  compact?: boolean;
}

export function VehicleStructuralIntelligencePanel({
  claimId,
  make,
  model,
  year,
  vin,
  counterpartMake,
  counterpartModel,
  counterpartYear,
  generateNarrative = true,
  compact = false,
}: VehicleStructuralIntelligencePanelProps) {
  const [narrativeExpanded, setNarrativeExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState("ratings");

  // Fetch via claimId if provided
  const claimProfileQuery = trpc.vehicleStructural.getClaimProfile.useQuery(
    { claimId: claimId!, generateNarrative },
    { enabled: !!claimId, staleTime: 5 * 60 * 1000 }
  );

  // Or fetch directly
  const directProfileQuery = trpc.vehicleStructural.getProfile.useQuery(
    {
      make: make!,
      model: model!,
      year,
      vin,
      counterpartMake,
      counterpartModel,
      counterpartYear,
      generateNarrative,
    },
    { enabled: !claimId && !!make && !!model, staleTime: 5 * 60 * 1000 }
  );

  const isLoading = claimId ? claimProfileQuery.isLoading : directProfileQuery.isLoading;
  const error = claimId ? claimProfileQuery.error : directProfileQuery.error;

  // Resolve data
  const insuredProfile = claimId
    ? claimProfileQuery.data?.insuredVehicle
    : directProfileQuery.data;
  const thirdPartyProfile = claimId
    ? claimProfileQuery.data?.thirdPartyVehicle
    : null;

  if (isLoading) {
    return (
      <Card className="border-slate-200 dark:border-slate-700">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-500" />
            <CardTitle className="text-sm font-semibold">Vehicle Structural Intelligence</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  if (error || !insuredProfile) {
    return (
      <Card className="border-slate-200 dark:border-slate-700">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-slate-400" />
            <CardTitle className="text-sm font-semibold text-muted-foreground">Vehicle Structural Intelligence</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            {error ? "Failed to load structural intelligence data." : "No vehicle data available for structural analysis."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const { ancapRating, globalNcapAfrica, crash3Class, nhtsaDecode, safetyRiskLevel, compatibilityRisk, structuralNarrative } = insuredProfile;
  const vehicleLabel = `${insuredProfile.make} ${insuredProfile.model}${insuredProfile.year ? ` (${insuredProfile.year})` : ""}`;
  const tpCrash3 = thirdPartyProfile?.crash3Class;

  return (
    <Card className="border-slate-200 dark:border-slate-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-500" />
            <CardTitle className="text-sm font-semibold">Vehicle Structural Intelligence</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <RiskBadge level={safetyRiskLevel} />
          </div>
        </div>
        <CardDescription className="text-xs mt-1">
          {vehicleLabel}
          {insuredProfile.vin && (
            <span className="ml-2 font-mono text-xs text-muted-foreground">VIN: {insuredProfile.vin}</span>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Compatibility Risk (if counterpart available) */}
        {(thirdPartyProfile || counterpartMake) && (
          <CompatibilityRiskCard
            insuredClass={crash3Class?.vehicleClass}
            thirdPartyClass={tpCrash3?.vehicleClass}
            risk={compatibilityRisk}
          />
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 h-8 text-xs">
            <TabsTrigger value="ratings" className="text-xs px-1">
              <Shield className="w-3 h-3 mr-1" />
              Ratings
            </TabsTrigger>
            <TabsTrigger value="crash3" className="text-xs px-1">
              <Activity className="w-3 h-3 mr-1" />
              CRASH3
            </TabsTrigger>
            <TabsTrigger value="vin" className="text-xs px-1">
              <Car className="w-3 h-3 mr-1" />
              VIN
            </TabsTrigger>
            <TabsTrigger value="narrative" className="text-xs px-1">
              <FileText className="w-3 h-3 mr-1" />
              Report
            </TabsTrigger>
          </TabsList>

          {/* ── SAFETY RATINGS TAB ── */}
          <TabsContent value="ratings" className="mt-3 space-y-4">
            {/* ANCAP Rating */}
            {ancapRating ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-xs font-semibold">ANCAP Safety Rating</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-3.5 h-3.5 ${
                            i < ancapRating.stars
                              ? "fill-amber-400 text-amber-400"
                              : "fill-slate-200 text-slate-300 dark:fill-slate-600 dark:text-slate-600"
                          }`}
                        />
                      ))}
                    </div>
                    <Badge variant="outline" className="text-xs px-1.5 py-0 h-5">
                      {ancapRating.stars}★ {ancapRating.protocol}
                    </Badge>
                  </div>
                </div>

                {ancapRating.adultOccupant > 0 && (
                  <div className="space-y-2 pl-1">
                    <ScoreBar label="Adult Occupant Protection" value={ancapRating.adultOccupant} />
                    <ScoreBar label="Child Occupant Protection" value={ancapRating.childOccupant} />
                    {ancapRating.vruProtection > 0 && (
                      <ScoreBar label="Vulnerable Road User" value={ancapRating.vruProtection} />
                    )}
                    {ancapRating.safetyAssist > 0 && (
                      <ScoreBar label="Safety Assist" value={ancapRating.safetyAssist} />
                    )}
                  </div>
                )}

                <div className="text-xs text-muted-foreground bg-slate-50 dark:bg-slate-800/50 rounded p-2 space-y-0.5">
                  <div className="flex gap-2">
                    <span className="font-medium">Test year:</span>
                    <span>{ancapRating.testYear}</span>
                  </div>
                  {ancapRating.variant && (
                    <div className="flex gap-2">
                      <span className="font-medium">Variant:</span>
                      <span>{ancapRating.variant}</span>
                    </div>
                  )}
                  {ancapRating.notes && (
                    <div className="flex gap-1 items-start mt-1">
                      <Info className="w-3 h-3 mt-0.5 shrink-0 text-blue-400" />
                      <span className="italic">{ancapRating.notes}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground italic flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                No ANCAP rating found for this vehicle.
              </div>
            )}

            {/* Global NCAP Africa Rating */}
            {globalNcapAfrica && (
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-orange-500" />
                  <span className="text-xs font-semibold">Global NCAP Africa ({globalNcapAfrica.testYear})</span>
                </div>
                <div className="space-y-1.5 pl-1">
                  <StarRating stars={globalNcapAfrica.adultStars} label="Adult Occupant" />
                  {globalNcapAfrica.childStars > 0 && (
                    <StarRating stars={globalNcapAfrica.childStars} label="Child Occupant" />
                  )}
                </div>
                {globalNcapAfrica.notes && (
                  <div className="flex gap-1 items-start text-xs text-muted-foreground">
                    <Info className="w-3 h-3 mt-0.5 shrink-0 text-orange-400" />
                    <span className="italic">{globalNcapAfrica.notes}</span>
                  </div>
                )}
              </div>
            )}

            {/* Third-party vehicle ratings */}
            {thirdPartyProfile && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div className="flex items-center gap-2">
                  <Car className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-xs font-semibold text-muted-foreground">
                    Third-Party: {thirdPartyProfile.make} {thirdPartyProfile.model}
                  </span>
                </div>
                {thirdPartyProfile.ancapRating ? (
                  <div className="pl-1 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="flex gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`w-3 h-3 ${
                              i < thirdPartyProfile.ancapRating.stars
                                ? "fill-amber-400 text-amber-400"
                                : "fill-slate-200 text-slate-300 dark:fill-slate-600"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        ANCAP {thirdPartyProfile.ancapRating.stars}★ ({thirdPartyProfile.ancapRating.testYear})
                      </span>
                    </div>
                    {thirdPartyProfile.ancapRating.adultOccupant > 0 && (
                      <ScoreBar label="Adult Occupant" value={thirdPartyProfile.ancapRating.adultOccupant} />
                    )}
                  </div>
                ) : thirdPartyProfile.globalNcapAfrica ? (
                  <div className="pl-1">
                    <StarRating stars={thirdPartyProfile.globalNcapAfrica.adultStars} label="Global NCAP Africa" />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic pl-1">No safety rating available.</p>
                )}
              </div>
            )}
          </TabsContent>

          {/* ── CRASH3 TAB ── */}
          <TabsContent value="crash3" className="mt-3 space-y-4">
            {crash3Class ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-purple-500" />
                    <span className="text-xs font-semibold">CRASH3 Stiffness Profile</span>
                  </div>
                  <Badge variant="outline" className="text-xs">{crash3Class.vehicleClass}</Badge>
                </div>

                <p className="text-xs text-muted-foreground">{crash3Class.description}</p>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2.5 text-center">
                    <div className="text-lg font-bold text-purple-600 dark:text-purple-400">{crash3Class.A_kN_m}</div>
                    <div className="text-xs text-muted-foreground">A coefficient (kN/m)</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Stiffness offset</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2.5 text-center">
                    <div className="text-lg font-bold text-purple-600 dark:text-purple-400">{crash3Class.B_kN_m2}</div>
                    <div className="text-xs text-muted-foreground">B coefficient (kN/m²)</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Stiffness slope</div>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2.5 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Typical mass range</span>
                    <span className="font-medium">{crash3Class.typicalMassRange_kg[0]}–{crash3Class.typicalMassRange_kg[1]} kg</span>
                  </div>
                </div>

                {crash3Class.notes && (
                  <div className="flex gap-1.5 items-start text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded p-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                    <span>{crash3Class.notes}</span>
                  </div>
                )}

                {/* Third-party comparison */}
                {tpCrash3 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="flex items-center gap-2">
                      <Car className="w-3.5 h-3.5 text-slate-500" />
                      <span className="text-xs font-semibold text-muted-foreground">Third-Party CRASH3</span>
                      <Badge variant="outline" className="text-xs ml-auto">{tpCrash3.vehicleClass}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded p-2 text-center">
                        <div className="text-base font-bold text-slate-600 dark:text-slate-400">{tpCrash3.A_kN_m}</div>
                        <div className="text-xs text-muted-foreground">A (kN/m)</div>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded p-2 text-center">
                        <div className="text-base font-bold text-slate-600 dark:text-slate-400">{tpCrash3.B_kN_m2}</div>
                        <div className="text-xs text-muted-foreground">B (kN/m²)</div>
                      </div>
                    </div>
                    {/* Stiffness delta */}
                    <div className="text-xs text-muted-foreground bg-slate-50 dark:bg-slate-800/50 rounded p-2">
                      <span className="font-medium">Stiffness delta (A): </span>
                      <span className={crash3Class.A_kN_m - tpCrash3.A_kN_m > 50 ? "text-red-600 dark:text-red-400 font-semibold" : "text-emerald-600 dark:text-emerald-400"}>
                        {crash3Class.A_kN_m - tpCrash3.A_kN_m > 0 ? "+" : ""}{crash3Class.A_kN_m - tpCrash3.A_kN_m} kN/m
                      </span>
                      {" (insured vs third-party)"}
                    </div>
                  </div>
                )}

                <div className="text-xs text-muted-foreground italic">
                  Source: Campbell 1974; Prasad 1990; Nystrom et al. (JSHeld). Coefficients are class averages for frontal impacts.
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground italic flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                CRASH3 class not determined for this vehicle. Manual classification required.
              </div>
            )}
          </TabsContent>

          {/* ── VIN DECODE TAB ── */}
          <TabsContent value="vin" className="mt-3 space-y-3">
            {nhtsaDecode && !nhtsaDecode.errorCode ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Car className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-xs font-semibold">NHTSA VIN Decode</span>
                  <Badge variant="outline" className="text-xs ml-auto text-emerald-600 border-emerald-300">Decoded</Badge>
                </div>

                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  {[
                    ["Make", nhtsaDecode.make],
                    ["Model", nhtsaDecode.model],
                    ["Year", nhtsaDecode.modelYear],
                    ["Vehicle Type", nhtsaDecode.vehicleType],
                    ["Body Class", nhtsaDecode.bodyClass],
                    ["Drive Type", nhtsaDecode.driveType],
                    ["Cylinders", nhtsaDecode.engineCylinders],
                    ["Displacement", nhtsaDecode.engineDisplacementL ? `${nhtsaDecode.engineDisplacementL}L` : undefined],
                    ["Fuel Type", nhtsaDecode.fuelTypePrimary],
                    ["GVWR Class", nhtsaDecode.gvwrClass],
                    ["Plant Country", nhtsaDecode.plantCountry],
                    ["Series", nhtsaDecode.series],
                    ["Trim", nhtsaDecode.trim],
                    ["Transmission", nhtsaDecode.transmissionStyle],
                  ]
                    .filter(([, v]) => v)
                    .map(([label, value]) => (
                      <div key={label} className="bg-slate-50 dark:bg-slate-800/50 rounded p-1.5">
                        <div className="text-muted-foreground">{label}</div>
                        <div className="font-medium text-foreground truncate">{value}</div>
                      </div>
                    ))}
                </div>
              </div>
            ) : nhtsaDecode?.errorCode ? (
              <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                VIN decode: {nhtsaDecode.errorText || nhtsaDecode.errorCode}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground italic flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                No VIN provided. Enter a VIN to enable NHTSA decode.
              </div>
            )}
          </TabsContent>

          {/* ── NARRATIVE TAB ── */}
          <TabsContent value="narrative" className="mt-3 space-y-3">
            {structuralNarrative ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-xs font-semibold">AI Structural Intelligence Narrative</span>
                  <Badge variant="outline" className="text-xs ml-auto">AI Generated</Badge>
                </div>
                <div
                  className={`text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 ${
                    !narrativeExpanded ? "max-h-48 overflow-hidden relative" : ""
                  }`}
                >
                  {structuralNarrative}
                  {!narrativeExpanded && (
                    <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-slate-50 dark:from-slate-800/50 to-transparent" />
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-7 text-xs"
                  onClick={() => setNarrativeExpanded(!narrativeExpanded)}
                >
                  {narrativeExpanded ? (
                    <>
                      <ChevronUp className="w-3 h-3 mr-1" />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3 h-3 mr-1" />
                      Read full narrative
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground italic flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                AI narrative not generated. Enable narrative generation to view the structural assessment report.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default VehicleStructuralIntelligencePanel;
