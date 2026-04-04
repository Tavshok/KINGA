/**
 * ClaimsExplanationPanel.tsx
 *
 * Displays the professional insurance explanation for a claim decision.
 * Suitable for adjusters and auditors — uses formal insurance and engineering language.
 * Fetches explanation via getClaimExplanation tRPC query.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { FileText, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Clock } from "lucide-react";

interface ClaimsExplanationPanelProps {
  claimId: number;
  /** Optional: pass pre-computed decision data to avoid an extra DB round-trip */
  precomputed?: {
    recommendation: "APPROVE" | "REVIEW" | "REJECT";
    key_drivers: string[];
    reasoning: string;
    confidence?: number | null;
    decision_basis?: "assessor_validated" | "system_validated" | "insufficient_data" | null;
    claim_reference?: string | null;
    incident_type?: string | null;
    severity?: string | null;
    estimated_cost?: number | null;
    currency?: string | null;
    fraud_risk_level?: string | null;
    physics_plausible?: boolean | null;
    damage_consistent?: boolean | null;
    consistency_status?: string | null;
    blocking_factors?: string[] | null;
    warnings?: string[] | null;
  };
}

const RECOMMENDATION_CONFIG = {
  APPROVE: {
    label: "Approved for Settlement",
    icon: CheckCircle2,
    bg: "bg-emerald-50 border-emerald-200",
    text: "text-emerald-800",
    badge: "bg-emerald-100 text-emerald-800 border border-emerald-300",
    iconColor: "text-emerald-600",
  },
  REVIEW: {
    label: "Referred for Manual Review",
    icon: Clock,
    bg: "bg-amber-50 border-amber-200",
    text: "text-amber-800",
    badge: "bg-amber-100 text-amber-800 border border-amber-300",
    iconColor: "text-amber-600",
  },
  REJECT: {
    label: "Declined",
    icon: AlertCircle,
    bg: "bg-red-50 border-red-200",
    text: "text-red-800",
    badge: "bg-red-100 text-red-800 border border-red-300",
    iconColor: "text-red-600",
  },
} as const;

const CONFIDENCE_BAND_LABELS: Record<string, string> = {
  HIGH: "High",
  MEDIUM: "Moderate",
  LOW: "Limited",
  INSUFFICIENT: "Insufficient",
};

const CONFIDENCE_BAND_COLORS: Record<string, string> = {
  HIGH: "text-emerald-700",
  MEDIUM: "text-amber-700",
  LOW: "text-orange-700",
  INSUFFICIENT: "text-red-700",
};

function SectionCard({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="border border-gray-200 rounded-md p-4 bg-white">
      <h4 className="text-sm font-semibold text-gray-700 mb-2">{heading}</h4>
      <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
    </div>
  );
}

export default function ClaimsExplanationPanel({
  claimId,
  precomputed,
}: ClaimsExplanationPanelProps) {
  const [expanded, setExpanded] = useState(false);

  // Use precomputed data if available, otherwise fetch from DB
  const dbQuery = trpc.decision.getClaimExplanation.useQuery(
    { claimId },
    { enabled: !precomputed }
  );

  const precomputedQuery = trpc.decision.generateClaimExplanation.useQuery(
    precomputed ?? {
      recommendation: "REVIEW",
      key_drivers: [],
      reasoning: "",
    },
    { enabled: !!precomputed }
  );

  const query = precomputed ? precomputedQuery : dbQuery;
  const data = query.data;
  const isLoading = query.isLoading;
  const isError = query.isError;

  if (isLoading) {
    return (
      <div className="border border-gray-200 rounded-lg p-5 bg-white">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h3 className="text-base font-semibold text-gray-700">Claims Assessment Report</h3>
        </div>
        <div className="space-y-2 animate-pulse">
          <div className="h-4 bg-gray-100 rounded w-3/4" />
          <div className="h-4 bg-gray-100 rounded w-1/2" />
          <div className="h-4 bg-gray-100 rounded w-2/3" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="border border-gray-200 rounded-lg p-5 bg-white">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h3 className="text-base font-semibold text-gray-700">Claims Assessment Report</h3>
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-400">
          Assessment report is not yet available for this claim.
        </p>
      </div>
    );
  }

  const config = RECOMMENDATION_CONFIG[data.metadata.recommendation];
  const RecommendationIcon = config.icon;
  const bandLabel = CONFIDENCE_BAND_LABELS[data.metadata.confidence_band] ?? data.metadata.confidence_band;
  const bandColor = CONFIDENCE_BAND_COLORS[data.metadata.confidence_band] ?? "text-gray-600";

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-gray-700 dark:text-gray-400" />
          <h3 className="text-base font-semibold text-gray-800">Claims Assessment Report</h3>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${config.badge}`}>
          {config.label}
        </span>
      </div>

      {/* Recommendation Banner */}
      <div className={`px-5 py-4 border-b ${config.bg}`}>
        <div className="flex items-start gap-3">
          <RecommendationIcon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${config.iconColor}`} />
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium ${config.text} leading-relaxed`}>
              {data.summary}
            </p>
          </div>
        </div>
      </div>

      {/* Metadata Row */}
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap gap-4 text-xs text-gray-700 dark:text-gray-400">
        <span>
          <span className="font-medium text-gray-600">Assessment Confidence:</span>{" "}
          <span className={`font-semibold ${bandColor}`}>{bandLabel}</span>
        </span>
        {data.metadata.decision_basis && (
          <span>
            <span className="font-medium text-gray-600">Basis:</span>{" "}
            {data.metadata.decision_basis === "assessor_validated"
              ? "Assessor Validated"
              : data.metadata.decision_basis === "insufficient_data"
              ? "Insufficient Data"
              : "Technical Review"}
          </span>
        )}
        <span>
          <span className="font-medium text-gray-600">Generated:</span>{" "}
          {new Date(data.metadata.generated_at).toLocaleString()}
        </span>
      </div>

      {/* Expandable Sections */}
      <div className="px-5 py-4">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-900 transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-4 h-4" />
              Hide Detailed Assessment
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              View Detailed Assessment
            </>
          )}
        </button>

        {expanded && (
          <div className="mt-4 space-y-3">
            {data.sections.map((section, idx) => (
              <SectionCard key={idx} heading={section.heading} body={section.body} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
