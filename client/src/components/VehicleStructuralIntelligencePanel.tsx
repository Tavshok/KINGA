// @ts-nocheck
/**
 * Vehicle Structural Intelligence Panel
 *
 * Confidence tiers (shown as inline badges throughout):
 *  "Verified"  — data from ANCAP/Global NCAP/CRASH3 database for this specific vehicle
 *  "Estimated" — class-based inference when vehicle is not individually tested
 *  "No data"   — insufficient information to even infer (no make/model)
 *
 * The panel NEVER shows blank boxes or raw error codes.
 * Every state renders a professionally worded explanation.
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
  FileText,
  Globe,
  Star,
  CheckCircle2,
  HelpCircle,
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

/** Small inline badge showing data confidence tier */
function ConfidenceBadge({
  tier,
  reason,
}: {
  tier?: "verified" | "inferred" | "insufficient";
  reason?: string;
}) {
  if (!tier || tier === "verified") {
    return (
      <span
        title="Data sourced directly from ANCAP / Global NCAP / CRASH3 test database"
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
      >
        <CheckCircle2 className="w-2.5 h-2.5" />
        Verified
      </span>
    );
  }
  if (tier === "inferred") {
    return (
      <span
        title={reason || "Estimated from vehicle class characteristics — no individual crash test data found"}
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
      >
        <HelpCircle className="w-2.5 h-2.5" />
        Estimated
      </span>
    );
  }
  return (
    <span
      title="Insufficient data to assess"
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
    >
      <HelpCircle className="w-2.5 h-2.5" />
      No data
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
  claimId?: number;
  make?: string;
  model?: string;
  year?: number;
  vin?: string;
  counterpartMake?: string;
  counterpartModel?: string;
  counterpartYear?: number;
  generateNarrative?: boolean;
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

  const claimProfileQuery = trpc.vehicleStructural.getClaimProfile.useQuery(
    { claimId: claimId!, generateNarrative },
    { enabled: !!claimId, staleTime: 5 * 60 * 1000 }
  );
  const directProfileQuery = trpc.vehicleStructural.getProfile.useQuery(
    { make: make!, model: model!, year, vin, counterpartMake, counterpartModel, counterpartYear, generateNarrative },
    { enabled: !claimId && !!make && !!model, staleTime: 5 * 60 * 1000 }
  );

  const isLoading = claimId ? claimProfileQuery.isLoading : directProfileQuery.isLoading;
  const error = claimId ? claimProfileQuery.error : directProfileQuery.error;
  const insuredProfile = claimId ? claimProfileQuery.data?.insuredVehicle : directProfileQuery.data;
  const thirdPartyProfile = claimId ? claimProfileQuery.data?.thirdPartyVehicle : null;

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
          <p className="text-xs text-muted-foreground leading-relaxed">
            {error
              ? "Structural intelligence data could not be retrieved. The analysis will proceed without vehicle-specific structural parameters."
              : "Vehicle make and model are not recorded on this claim. Structural analysis requires at minimum the vehicle make and model to proceed."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const {
    ancapRating,
    ancapConfidenceTier,
    ancapInferenceReason,
    globalNcapAfrica,
    crash3Class,
    nhtsaDecode,
    safetyRiskLevel,
    compatibilityRisk,
    structuralNarrative,
    hasInferredData,
  } = insuredProfile;

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
            {hasInferredData && (
              <span
                title="Some data points are estimated from vehicle class characteristics rather than individual crash test results"
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
              >
                <HelpCircle className="w-2.5 h-2.5" />
                Partial estimates
              </span>
            )}
            <RiskBadge level={safetyRiskLevel} />
          </div>
        </div>
        <CardDescription className="text-xs mt-1">
          {vehicleLabel}
          {insuredProfile.vin && (
            <span className="ml-2 font-mono text-muted-foreground/70">VIN: {insuredProfile.vin}</span>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {thirdPartyProfile && (
          <CompatibilityRiskCard
            insuredClass={crash3Class?.vehicleClass}
            thirdPartyClass={tpCrash3?.vehicleClass}
            risk={compatibilityRisk}
          />
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 h-8">
            <TabsTrigger value="ratings" className="text-xs">Ratings</TabsTrigger>
            <TabsTrigger value="crash3" className="text-xs">CRASH3</TabsTrigger>
            <TabsTrigger value="vin" className="text-xs">VIN</TabsTrigger>
            <TabsTrigger value="narrative" className="text-xs">Report</TabsTrigger>
          </TabsList>

          {/* ── SAFETY RATINGS TAB ── */}
          <TabsContent value="ratings" className="mt-3 space-y-4">
            {/* Case 1: Verified ANCAP data */}
            {ancapRating ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-xs font-semibold">ANCAP Safety Rating</span>
                    <ConfidenceBadge tier="verified" />
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
            ) : globalNcapAfrica && !ancapRating ? (
              /* Case 2: Verified Global NCAP Africa (no ANCAP) */
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-orange-500" />
                  <span className="text-xs font-semibold">Global NCAP Africa ({globalNcapAfrica.testYear})</span>
                  <ConfidenceBadge tier="verified" />
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
            ) : ancapConfidenceTier === "inferred" && crash3Class ? (
              /* Case 3: No crash test data — inferred from vehicle class */
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs font-semibold">Safety Risk Assessment</span>
                  <ConfidenceBadge tier="inferred" reason={ancapInferenceReason} />
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                      <strong>No formal crash test data found</strong> for {insuredProfile.make} {insuredProfile.model} in the ANCAP or Global NCAP Africa databases.
                    </p>
                  </div>
                  <div className="pl-5 space-y-1 text-xs text-muted-foreground">
                    <p>Safety risk has been estimated from the vehicle's structural class:</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">{crash3Class.vehicleClass}</Badge>
                      <RiskBadge level={safetyRiskLevel} />
                    </div>
                    <p className="mt-1 italic text-amber-700 dark:text-amber-400">
                      This estimate is based on typical structural characteristics for this vehicle category and should not be treated as equivalent to a formal crash test result.
                    </p>
                  </div>
                </div>
                {ancapInferenceReason && (
                  <p className="text-xs text-muted-foreground italic pl-1">{ancapInferenceReason}</p>
                )}
              </div>
            ) : (
              /* Case 4: Truly insufficient — no make/model or class data */
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs font-semibold text-muted-foreground">Safety Rating</span>
                  <ConfidenceBadge tier="insufficient" />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Insufficient vehicle data to assess safety ratings. No ANCAP, Global NCAP Africa, or class-based estimate is available for this vehicle. The structural risk assessment for this claim cannot be completed from available data sources.
                </p>
              </div>
            )}

            {/* Show Global NCAP additionally when ANCAP is also present */}
            {ancapRating && globalNcapAfrica && (
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-orange-500" />
                  <span className="text-xs font-semibold">Global NCAP Africa ({globalNcapAfrica.testYear})</span>
                  <ConfidenceBadge tier="verified" />
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
                  <ConfidenceBadge
                    tier={
                      thirdPartyProfile.ancapRating || thirdPartyProfile.globalNcapAfrica
                        ? "verified"
                        : thirdPartyProfile.ancapConfidenceTier || "insufficient"
                    }
                    reason={thirdPartyProfile.ancapInferenceReason}
                  />
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
                ) : thirdPartyProfile.ancapConfidenceTier === "inferred" && thirdPartyProfile.crash3Class ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400 italic pl-1">
                    No crash test data. Safety risk estimated from vehicle class: {thirdPartyProfile.crash3Class.vehicleClass}.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground italic pl-1">
                    No safety rating data available for this vehicle. Structural risk for the third party cannot be independently assessed from available databases.
                  </p>
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
                    <ConfidenceBadge
                      tier={crash3Class.confidenceTier || "verified"}
                      reason={crash3Class.inferenceReason}
                    />
                  </div>
                  <Badge variant="outline" className="text-xs">{crash3Class.vehicleClass}</Badge>
                </div>

                {/* Inference explanation when estimated */}
                {crash3Class.confidenceTier === "inferred" && crash3Class.inferenceReason && (
                  <div className="flex gap-1.5 items-start text-xs bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded p-2">
                    <HelpCircle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                    <span className="text-amber-800 dark:text-amber-300">{crash3Class.inferenceReason}</span>
                  </div>
                )}

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
                    <span className="font-medium">
                      {crash3Class.typicalMassRange_kg[0]}–{crash3Class.typicalMassRange_kg[1]} kg
                    </span>
                  </div>
                </div>

                {crash3Class.notes && (
                  <div className="flex gap-1.5 items-start text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded p-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                    <span>{crash3Class.notes}</span>
                  </div>
                )}

                {/* Third-party CRASH3 comparison */}
                {tpCrash3 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="flex items-center gap-2">
                      <Car className="w-3.5 h-3.5 text-slate-500" />
                      <span className="text-xs font-semibold text-muted-foreground">Third-Party CRASH3</span>
                      <ConfidenceBadge
                        tier={tpCrash3.confidenceTier || "verified"}
                        reason={tpCrash3.inferenceReason}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 text-center">
                        <div className="text-base font-bold text-slate-600 dark:text-slate-300">{tpCrash3.A_kN_m}</div>
                        <div className="text-xs text-muted-foreground">A (kN/m)</div>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 text-center">
                        <div className="text-base font-bold text-slate-600 dark:text-slate-300">{tpCrash3.B_kN_m2}</div>
                        <div className="text-xs text-muted-foreground">B (kN/m²)</div>
                      </div>
                    </div>
                    {/* Stiffness delta indicator */}
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded p-2 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Stiffness delta (A)</span>
                        <span
                          className={`font-semibold ${
                            Math.abs(crash3Class.A_kN_m - tpCrash3.A_kN_m) > 80
                              ? "text-red-600 dark:text-red-400"
                              : Math.abs(crash3Class.A_kN_m - tpCrash3.A_kN_m) > 40
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-emerald-600 dark:text-emerald-400"
                          }`}
                        >
                          {Math.abs(crash3Class.A_kN_m - tpCrash3.A_kN_m)} kN/m
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="text-xs text-muted-foreground italic">
                  Source: Campbell 1974; Prasad 1990; Nystrom et al. (JSHeld). Coefficients are class averages for frontal impacts.
                </div>
              </div>
            ) : (
              /* No CRASH3 data — not even inferred */
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs font-semibold text-muted-foreground">CRASH3 Stiffness Profile</span>
                  <ConfidenceBadge tier="insufficient" />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The vehicle could not be matched to a CRASH3 structural class, and insufficient information is available to infer a class-based estimate. Stiffness coefficient analysis cannot be completed for this vehicle.
                </p>
                <p className="text-xs text-muted-foreground italic">
                  To enable CRASH3 analysis, ensure the vehicle make, model, and year are correctly recorded on the claim.
                </p>
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
              /* VIN decode returned an error — explain professionally */
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Car className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">VIN Decode — Partial Result</span>
                </div>
                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                  The VIN was submitted to the NHTSA database but returned a non-standard response. This is common for vehicles manufactured outside the United States or for older model years not fully indexed by NHTSA.
                </p>
                <p className="text-xs text-muted-foreground italic">
                  NHTSA response: {nhtsaDecode.errorText || nhtsaDecode.errorCode}
                </p>
                <p className="text-xs text-muted-foreground">
                  Structural analysis has proceeded using the vehicle make and model recorded on the claim.
                </p>
              </div>
            ) : (
              /* No VIN provided */
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Car className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs font-semibold text-muted-foreground">VIN Decode</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  No Vehicle Identification Number (VIN) is recorded on this claim. VIN decode provides additional specification data (body class, drivetrain, plant country) that improves the accuracy of CRASH3 class inference.
                </p>
                <p className="text-xs text-muted-foreground italic">
                  Structural analysis has proceeded using the vehicle make and model. Adding the VIN will improve classification accuracy.
                </p>
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
                  {hasInferredData && (
                    <ConfidenceBadge
                      tier="inferred"
                      reason="Narrative incorporates estimated data points — see Ratings and CRASH3 tabs for details"
                    />
                  )}
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
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs font-semibold text-muted-foreground">AI Structural Narrative</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  AI narrative generation is disabled for this view. The narrative is automatically generated when the Forensic Audit Report is produced and incorporates all available structural intelligence data.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default VehicleStructuralIntelligencePanel;
