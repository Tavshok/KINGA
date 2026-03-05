import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, AlertTriangle, XCircle, Shield, Activity,
  DollarSign, Car, Brain, Eye, Wrench, TrendingUp, ArrowDown,
  FileText, ShieldCheck
} from "lucide-react";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

interface PhysicsData {
  physicsScore: number;
  damageConsistency: string;
  impactSpeed: number;
  impactForce: number;
  is_valid: boolean;
  flags: string[];
}

interface FraudData {
  riskScore: number;
  overallRisk: string;
  flaggedIssues: string[];
}

interface CrossValidationSummary {
  confirmedCount: number;
  quotedNotVisibleCount: number;
  visibleNotQuotedCount: number;
  suspiciousCount: number;
  legitimateHiddenCount: number;
  overallRiskScore: number;
  overallRiskLevel: string;
}

interface IncidentClassification {
  incidentType: string;
  isCollision: boolean;
  vehicleWasStationary: boolean;
  confidence: number;
  reasoning: string;
}

interface NarrativeValidation {
  narrativeScore: number;
  isPlausible: boolean;
  supports: string[];
  concerns: string[];
  deductions: string[];
}

interface ExecutiveSummaryProps {
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  vehicleRegistration?: string;
  accidentType?: string;
  accidentDescription?: string;
  totalCost: number;
  originalQuote?: number;
  agreedCost?: number;
  savings?: number;
  componentCount: number;
  physicsData: PhysicsData;
  fraudData: FraudData;
  crossValidation?: { summary: CrossValidationSummary; fraudIndicators: string[] };
  incidentClassification?: IncidentClassification;
  narrativeValidation?: NarrativeValidation;
  dataCompleteness: number;
  damagePhotoCount: number;
}

function StatusIcon({ status }: { status: 'pass' | 'warning' | 'fail' }) {
  if (status === 'pass') return <CheckCircle2 className="w-5 h-5 text-green-600" />;
  if (status === 'warning') return <AlertTriangle className="w-5 h-5 text-amber-500" />;
  return <XCircle className="w-5 h-5 text-red-600" />;
}

function getOverallVerdict(physics: PhysicsData, fraud: FraudData, cv?: { summary: CrossValidationSummary }, narrative?: NarrativeValidation) {
  let score = 0;
  let maxScore = 0;

  // Physics/Damage validation (weight: 30)
  maxScore += 30;
  if (physics.physicsScore >= 70) score += 30;
  else if (physics.physicsScore >= 40) score += 15;

  // Fraud (weight: 30)
  maxScore += 30;
  if (fraud.riskScore <= 30) score += 30;
  else if (fraud.riskScore <= 60) score += 15;

  // Cross-validation (weight: 25)
  if (cv) {
    maxScore += 25;
    if (cv.summary.suspiciousCount === 0) score += 25;
    else if (cv.summary.suspiciousCount <= 2) score += 12;
  }

  // Narrative validation (weight: 15)
  if (narrative) {
    maxScore += 15;
    if (narrative.isPlausible) score += 15;
    else if (narrative.narrativeScore >= 40) score += 7;
  } else {
    maxScore += 15;
    score += 15; // base
  }

  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 50;

  if (pct >= 75) return { label: 'CLAIM APPEARS LEGITIMATE', color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', status: 'pass' as const };
  if (pct >= 45) return { label: 'CLAIM REQUIRES FURTHER REVIEW', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', status: 'warning' as const };
  return { label: 'SIGNIFICANT CONCERNS IDENTIFIED', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', status: 'fail' as const };
}

/** Format incident type for display */
function formatIncidentType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function ExecutiveSummary({
  vehicleMake, vehicleModel, vehicleYear, vehicleRegistration,
  accidentType, accidentDescription, totalCost, originalQuote, agreedCost, savings,
  componentCount, physicsData, fraudData, crossValidation,
  incidentClassification, narrativeValidation,
  dataCompleteness, damagePhotoCount
}: ExecutiveSummaryProps) {

  const { fmt, currencySymbol: symbol } = useTenantCurrency();
  const verdict = getOverallVerdict(physicsData, fraudData, crossValidation, narrativeValidation);
  const isCollision = incidentClassification?.isCollision ?? true;
  const incidentType = incidentClassification?.incidentType || accidentType || 'unknown';
  const incidentLabel = formatIncidentType(incidentType);

  // Determine the validation card label based on incident type
  const validationLabel = isCollision ? 'Physics Validation' : 'Damage Validation';

  const physicsStatus = physicsData.physicsScore >= 70 ? 'pass' : physicsData.physicsScore >= 40 ? 'warning' : 'fail';
  const fraudStatus = fraudData.riskScore <= 30 ? 'pass' : fraudData.riskScore <= 60 ? 'warning' : 'fail';
  const cvStatus = crossValidation
    ? (crossValidation.summary.suspiciousCount === 0 ? 'pass' : crossValidation.summary.suspiciousCount <= 2 ? 'warning' : 'fail')
    : null;
  const narrativeStatus = narrativeValidation
    ? (narrativeValidation.isPlausible ? 'pass' : narrativeValidation.narrativeScore >= 40 ? 'warning' : 'fail')
    : null;

  return (
    <Card className={`p-6 ${verdict.bg} ${verdict.border} border-2`}>
      <div className="flex items-start gap-4 mb-6">
        <div className={`p-3 rounded-xl ${verdict.bg}`}>
          <Brain className={`w-7 h-7 ${verdict.color}`} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xl font-bold text-gray-900">Executive Summary</h2>
            <Badge className={`text-sm px-3 py-1 ${
              verdict.status === 'pass' ? 'bg-green-100 text-green-800' :
              verdict.status === 'warning' ? 'bg-amber-100 text-amber-800' :
              'bg-red-100 text-red-800'
            }`}>
              {verdict.label}
            </Badge>
          </div>
          <p className="text-sm text-gray-600">
            AI-powered assessment of {vehicleYear} {vehicleMake} {vehicleModel} ({vehicleRegistration})
            {' — '}{incidentLabel.toLowerCase()} incident
          </p>
        </div>
      </div>

      {/* Key Validation Results Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Physics / Damage Validation */}
        <div className="p-4 bg-white rounded-lg border border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            <StatusIcon status={physicsStatus} />
            <span className="text-sm font-semibold text-gray-700">{validationLabel}</span>
          </div>
          <p className={`text-lg font-bold ${physicsStatus === 'pass' ? 'text-green-600' : physicsStatus === 'warning' ? 'text-amber-600' : 'text-red-600'}`}>
            {physicsData.physicsScore}/100
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {isCollision
              ? (physicsData.damageConsistency === 'consistent'
                  ? 'Damage consistent with reported accident'
                  : physicsData.damageConsistency === 'questionable'
                  ? 'Some inconsistencies detected'
                  : 'Damage inconsistent with reported accident')
              : (physicsData.damageConsistency === 'consistent'
                  ? `Damage consistent with ${incidentLabel.toLowerCase()}`
                  : physicsData.damageConsistency === 'questionable'
                  ? 'Some concerns with damage pattern'
                  : `Damage pattern questionable for ${incidentLabel.toLowerCase()}`)
            }
          </p>
          {physicsData.flags.length > 0 && (
            <p className="text-xs text-amber-600 mt-1">{physicsData.flags.length} flag(s) raised</p>
          )}
        </div>

        {/* Fraud Risk */}
        <div className="p-4 bg-white rounded-lg border border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            <StatusIcon status={fraudStatus} />
            <span className="text-sm font-semibold text-gray-700">Fraud Risk</span>
          </div>
          <p className={`text-lg font-bold ${fraudStatus === 'pass' ? 'text-green-600' : fraudStatus === 'warning' ? 'text-amber-600' : 'text-red-600'}`}>
            {fraudData.riskScore}/100 ({fraudData.overallRisk})
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {fraudData.flaggedIssues.length > 0
              ? `${fraudData.flaggedIssues.length} risk factor(s) identified`
              : 'No significant risk factors'}
          </p>
        </div>

        {/* Cross-Validation */}
        <div className="p-4 bg-white rounded-lg border border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            {cvStatus ? <StatusIcon status={cvStatus} /> : <Eye className="w-5 h-5 text-gray-400" />}
            <span className="text-sm font-semibold text-gray-700">Quote vs Photos</span>
          </div>
          {crossValidation ? (
            <>
              <p className={`text-lg font-bold ${cvStatus === 'pass' ? 'text-green-600' : cvStatus === 'warning' ? 'text-amber-600' : 'text-red-600'}`}>
                {crossValidation.summary.confirmedCount} confirmed
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {crossValidation.summary.suspiciousCount > 0
                  ? `${crossValidation.summary.suspiciousCount} suspicious item(s)`
                  : 'All quoted parts verified'}
                {crossValidation.summary.visibleNotQuotedCount > 0 &&
                  ` · ${crossValidation.summary.visibleNotQuotedCount} unquoted damage`}
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-gray-400">N/A</p>
              <p className="text-xs text-gray-500 mt-1">Insufficient data for cross-validation</p>
            </>
          )}
        </div>

        {/* Cost Analysis */}
        <div className="p-4 bg-white rounded-lg border border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-green-600" />
            <span className="text-sm font-semibold text-gray-700">Cost Analysis</span>
          </div>
          <p className="text-lg font-bold text-green-600">
            {symbol}{totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {componentCount} component(s) · {damagePhotoCount} photo(s)
            {savings && savings > 0 && (
              <span className="text-green-600 font-medium"> · {symbol}{savings.toLocaleString()} saved</span>
            )}
          </p>
        </div>
      </div>

      {/* Narrative Validation Section (for non-collision incidents) */}
      {narrativeValidation && (
        <div className="mb-4 p-4 bg-white rounded-lg border border-gray-200">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-semibold text-gray-700">Narrative & Incident Validation</h3>
            {narrativeStatus && (
              <Badge className={`text-xs px-2 py-0.5 ${
                narrativeStatus === 'pass' ? 'bg-green-100 text-green-800' :
                narrativeStatus === 'warning' ? 'bg-amber-100 text-amber-800' :
                'bg-red-100 text-red-800'
              }`}>
                {narrativeValidation.narrativeScore}/100
              </Badge>
            )}
          </div>
          {incidentClassification && (
            <p className="text-sm text-gray-600 mb-2">
              <strong>Incident type:</strong> {incidentLabel}
              {!isCollision && ' (non-collision)'}
              {incidentClassification.vehicleWasStationary && ' · Vehicle was stationary'}
            </p>
          )}
          {narrativeValidation.deductions.length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-semibold text-gray-600 mb-1">AI Deductions:</p>
              <ul className="space-y-1">
                {narrativeValidation.deductions.map((d, i) => (
                  <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                    <Brain className="w-3 h-3 mt-0.5 flex-shrink-0 text-indigo-500" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {narrativeValidation.supports.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-green-700 mb-1">Supporting Factors:</p>
                <ul className="space-y-0.5">
                  {narrativeValidation.supports.map((s, i) => (
                    <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                      <CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0 text-green-500" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {narrativeValidation.concerns.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-700 mb-1">Concerns:</p>
                <ul className="space-y-0.5">
                  {narrativeValidation.concerns.map((c, i) => (
                    <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                      <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-amber-500" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Key Findings Narrative */}
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Key Findings</h3>
        <div className="text-sm text-gray-700 space-y-2">
          <p>
            <strong>{isCollision ? 'Physics' : 'Damage Validation'}:</strong>{' '}
            {isCollision ? (
              // Collision incident: show physics analysis with impact speed/force
              physicsData.is_valid
                ? `The reported ${incidentLabel.toLowerCase()} at an estimated ${physicsData.impactSpeed} km/h with ${physicsData.impactForce} kN impact force is physically consistent with the observed damage pattern (score: ${physicsData.physicsScore}/100).`
                : `Physics analysis raises concerns about the reported ${incidentLabel.toLowerCase()}. The estimated ${physicsData.impactSpeed} km/h impact producing ${physicsData.impactForce} kN does not fully align with the observed damage (score: ${physicsData.physicsScore}/100).`
            ) : (
              // Non-collision incident: show damage pattern validation WITHOUT collision dynamics
              physicsData.is_valid
                ? `The damage pattern is consistent with the reported ${incidentLabel.toLowerCase()} incident. The described damage to ${physicsData.damageConsistency === 'consistent' ? 'the affected components aligns with' : 'some components may not fully align with'} what would be expected from this type of incident (score: ${physicsData.physicsScore}/100).`
                : `The damage pattern raises some questions for the reported ${incidentLabel.toLowerCase()} incident. The observed damage may not fully align with what would typically be expected from this type of incident (score: ${physicsData.physicsScore}/100).`
            )}
            {physicsData.flags.length > 0 && ` Flags: ${physicsData.flags.join('; ')}.`}
          </p>

          <p>
            <strong>Fraud Risk:</strong>{' '}
            {fraudData.riskScore <= 30
              ? `Low fraud probability at ${fraudData.riskScore}/100. No significant indicators of fraudulent activity.`
              : fraudData.riskScore <= 60
              ? `Moderate fraud risk at ${fraudData.riskScore}/100. ${fraudData.flaggedIssues.length > 0 ? `Factors include: ${fraudData.flaggedIssues.slice(0, 3).join('; ')}.` : 'Additional review recommended.'}`
              : `Elevated fraud risk at ${fraudData.riskScore}/100. ${fraudData.flaggedIssues.length > 0 ? `Key concerns: ${fraudData.flaggedIssues.slice(0, 3).join('; ')}.` : 'Immediate investigation recommended.'}`
            }
          </p>

          {crossValidation && (
            <p>
              <strong>Cross-Validation:</strong>{' '}
              {crossValidation.summary.confirmedCount} of {crossValidation.summary.confirmedCount + crossValidation.summary.quotedNotVisibleCount} quoted parts confirmed visible in photos.
              {crossValidation.summary.suspiciousCount > 0
                ? ` ${crossValidation.summary.suspiciousCount} externally-visible part(s) were quoted but not detected in photos — these require investigation.`
                : ' All externally-visible quoted parts were verified in the photo evidence.'
              }
              {crossValidation.summary.visibleNotQuotedCount > 0 &&
                ` Additionally, ${crossValidation.summary.visibleNotQuotedCount} area(s) of visible damage were not included in the repair quote.`
              }
              {crossValidation.summary.legitimateHiddenCount > 0 &&
                ` ${crossValidation.summary.legitimateHiddenCount} internal/hidden component(s) are quoted but cannot be verified from photos alone.`
              }
            </p>
          )}

          <p>
            <strong>Cost:</strong>{' '}
            Total repair cost of {symbol}{totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} across {componentCount} component(s).
            {originalQuote && agreedCost && originalQuote > agreedCost
              ? ` Negotiated down from ${symbol}${originalQuote.toLocaleString()} (${Math.round(((originalQuote - agreedCost) / originalQuote) * 100)}% reduction).`
              : ''
            }
            {' '}Data completeness: {dataCompleteness}%.
          </p>
        </div>
      </div>

      {/* Critical Alerts */}
      {(fraudData.flaggedIssues.length > 0 || (crossValidation?.fraudIndicators?.length ?? 0) > 0 || physicsData.flags.length > 0) && (
        <div className="mt-4 p-4 bg-white rounded-lg border border-amber-200">
          <h3 className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Items Requiring Attention
          </h3>
          <ul className="space-y-1.5">
            {physicsData.flags.map((flag, i) => (
              <li key={`p-${i}`} className="flex items-start gap-2 text-sm text-gray-700">
                <Activity className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-primary/80" />
                <span><strong className="text-primary/90">{isCollision ? 'Physics' : 'Damage'}:</strong> {flag}</span>
              </li>
            ))}
            {fraudData.flaggedIssues.slice(0, 5).map((issue, i) => (
              <li key={`f-${i}`} className="flex items-start gap-2 text-sm text-gray-700">
                <Shield className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-red-500" />
                <span><strong className="text-red-700">Fraud:</strong> {issue}</span>
              </li>
            ))}
            {crossValidation?.fraudIndicators?.slice(0, 3).map((ind, i) => (
              <li key={`cv-${i}`} className="flex items-start gap-2 text-sm text-gray-700">
                <Eye className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-500" />
                <span><strong className="text-amber-700">Cross-Validation:</strong> {ind}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
