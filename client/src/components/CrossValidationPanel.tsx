import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, XCircle, AlertTriangle, Eye, EyeOff, Shield,
  HelpCircle, ArrowRight, DollarSign, Wrench
} from "lucide-react";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

interface CrossValidationItem {
  partName: string;
  rawName: string;
  zone: string | null;
  category: 'confirmed' | 'quoted_not_visible' | 'visible_not_quoted' | 'unaffected';
  isExternallyVisible: boolean;
  riskLevel: string;
  explanation: string;
  confidence: number;
  quotedCost?: number;
  quotedAction?: string;
}

interface CrossValidationSummary {
  totalQuotedParts: number;
  totalVisibleDamage: number;
  confirmedCount: number;
  quotedNotVisibleCount: number;
  visibleNotQuotedCount: number;
  legitimateHiddenCount: number;
  suspiciousCount: number;
  overallRiskScore: number;
  overallRiskLevel: string;
}

interface CrossValidationData {
  timestamp: string;
  summary: CrossValidationSummary;
  items: CrossValidationItem[];
  fraudIndicators: string[];
  recommendations: string[];
}

const categoryConfig = {
  confirmed: {
    icon: CheckCircle2,
    label: 'Confirmed',
    description: 'Quoted and visible in photos',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-300',
    textColor: 'text-green-800',
    iconColor: 'text-green-600',
    badgeClass: 'bg-green-100 text-green-800',
  },
  quoted_not_visible: {
    icon: EyeOff,
    label: 'Quoted — Not Visible',
    description: 'Quoted for repair but not visible in photos',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-300',
    textColor: 'text-amber-800',
    iconColor: 'text-amber-600',
    badgeClass: 'bg-amber-100 text-amber-800',
  },
  visible_not_quoted: {
    icon: Eye,
    label: 'Visible — Not Quoted',
    description: 'Visible damage not included in quote',
    bgColor: 'bg-primary/5',
    borderColor: 'border-primary/40',
    textColor: 'text-secondary',
    iconColor: 'text-primary',
    badgeClass: 'bg-primary/10 text-secondary',
  },
  unaffected: {
    icon: HelpCircle,
    label: 'Unaffected',
    description: 'No damage detected',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    textColor: 'text-gray-600',
    iconColor: 'text-gray-400',
    badgeClass: 'bg-gray-100 text-gray-600',
  },
};

const riskLevelColor = (level: string) => {
  switch (level.toLowerCase()) {
    case 'none': return 'text-green-600';
    case 'low': return 'text-green-600';
    case 'medium': return 'text-amber-600';
    case 'high': return 'text-red-600';
    case 'critical': return 'text-red-700';
    default: return 'text-gray-600';
  }
};

export function CrossValidationPanel({ data }: { data: CrossValidationData }) {
  const { fmt } = useTenantCurrency();
  const { summary, items, fraudIndicators, recommendations } = data;

  const confirmed = items.filter(i => i.category === 'confirmed');
  const quotedNotVisible = items.filter(i => i.category === 'quoted_not_visible');
  const visibleNotQuoted = items.filter(i => i.category === 'visible_not_quoted');

  const suspiciousItems = quotedNotVisible.filter(i => i.isExternallyVisible);
  const legitimateHidden = quotedNotVisible.filter(i => !i.isExternallyVisible);

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <Shield className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Quote vs Photo Cross-Validation</h2>
            <p className="text-sm text-gray-500">AI comparison of quoted repair items against visible damage in photos</p>
          </div>
          <Badge className={`ml-auto text-sm px-3 py-1 ${
            summary.overallRiskLevel === 'low' ? 'bg-green-100 text-green-800' :
            summary.overallRiskLevel === 'medium' ? 'bg-amber-100 text-amber-800' :
            'bg-red-100 text-red-800'
          }`}>
            Risk: {summary.overallRiskScore}/100
          </Badge>
        </div>

        {/* Summary Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="p-3 bg-green-50 rounded-lg text-center border border-green-200">
            <p className="text-2xl font-bold text-green-600">{summary.confirmedCount}</p>
            <p className="text-xs text-green-700 font-medium">Confirmed</p>
          </div>
          <div className="p-3 bg-amber-50 rounded-lg text-center border border-amber-200">
            <p className="text-2xl font-bold text-amber-600">{summary.quotedNotVisibleCount}</p>
            <p className="text-xs text-amber-700 font-medium">Quoted Not Visible</p>
          </div>
          <div className="p-3 bg-primary/5 rounded-lg text-center border border-primary/20">
            <p className="text-2xl font-bold text-primary">{summary.visibleNotQuotedCount}</p>
            <p className="text-xs text-primary/90 font-medium">Visible Not Quoted</p>
          </div>
          <div className="p-3 bg-red-50 rounded-lg text-center border border-red-200">
            <p className="text-2xl font-bold text-red-600">{summary.suspiciousCount}</p>
            <p className="text-xs text-red-700 font-medium">Suspicious</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg text-center border border-gray-200">
            <p className="text-2xl font-bold text-gray-600">{summary.legitimateHiddenCount}</p>
            <p className="text-xs text-gray-700 font-medium">Hidden/Internal</p>
          </div>
        </div>
      </Card>

      {/* Suspicious Items Alert */}
      {suspiciousItems.length > 0 && (
        <Card className="p-5 border-red-200 bg-red-50/50">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <h3 className="font-semibold text-red-800">Suspicious: Externally Visible Parts Quoted But Not Seen in Photos</h3>
          </div>
          <p className="text-sm text-red-700 mb-3">
            These parts should be visible in damage photos but were not detected. This may indicate phantom damage claims or insufficient photo documentation.
          </p>
          <div className="space-y-2">
            {suspiciousItems.map((item, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-white rounded-lg border border-red-200">
                <div className="flex items-center gap-3">
                  <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <div>
                    <span className="font-medium text-gray-900">{item.partName}</span>
                    {item.zone && <Badge variant="outline" className="ml-2 text-xs">{item.zone}</Badge>}
                    <p className="text-xs text-gray-500 mt-0.5">{item.explanation}</p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  {item.quotedCost && <p className="text-sm font-semibold text-red-600">{fmt(item.quotedCost * 100)}</p>}
                  {item.quotedAction && <p className="text-xs text-gray-500 capitalize">{item.quotedAction}</p>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Confirmed Items */}
      {confirmed.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <h3 className="font-semibold text-gray-900">Confirmed Damage ({confirmed.length})</h3>
            <span className="text-sm text-gray-500">— Quoted parts with visible damage in photos</span>
          </div>
          <div className="grid md:grid-cols-2 gap-2">
            {confirmed.map((item, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-green-50/50 rounded-lg border border-green-100">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  <div>
                    <span className="text-sm font-medium text-gray-900">{item.partName}</span>
                    {item.zone && <span className="text-xs text-gray-400 ml-1">({item.zone})</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {item.quotedCost && <span className="text-sm font-medium text-green-600">{fmt(item.quotedCost * 100)}</span>}
                  <Badge className="bg-green-100 text-green-700 text-xs">{Math.round(item.confidence * 100)}%</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Legitimate Hidden Damage */}
      {legitimateHidden.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Wrench className="w-5 h-5 text-gray-600" />
            <h3 className="font-semibold text-gray-900">Hidden/Internal Damage ({legitimateHidden.length})</h3>
            <span className="text-sm text-gray-500">— Internal parts not expected to be visible in photos</span>
          </div>
          <div className="grid md:grid-cols-2 gap-2">
            {legitimateHidden.map((item, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div className="flex items-center gap-2">
                  <EyeOff className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  <div>
                    <span className="text-sm font-medium text-gray-900">{item.partName}</span>
                    {item.zone && <span className="text-xs text-gray-400 ml-1">({item.zone})</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {item.quotedCost && <span className="text-sm font-medium text-gray-600">{fmt(item.quotedCost * 100)}</span>}
                  <Badge variant="outline" className="text-xs">Internal</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Visible Not Quoted */}
      {visibleNotQuoted.length > 0 && (
        <Card className="p-5 border-primary/20 bg-primary/5/30">
          <div className="flex items-center gap-2 mb-4">
            <Eye className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-gray-900">Visible Damage Not Quoted ({visibleNotQuoted.length})</h3>
            <span className="text-sm text-gray-500">— Damage seen in photos but not included in repair quote</span>
          </div>
          <p className="text-sm text-primary/90 mb-3">
            These items show visible damage in the photos but were not included in the repair quote. This may indicate underquoting or pre-existing damage.
          </p>
          <div className="space-y-2">
            {visibleNotQuoted.map((item, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-white rounded-lg border border-primary/10">
                <div className="flex items-center gap-2">
                  <Eye className="w-3.5 h-3.5 text-primary/80 flex-shrink-0" />
                  <div>
                    <span className="text-sm font-medium text-gray-900">{item.partName}</span>
                    {item.zone && <Badge variant="outline" className="ml-2 text-xs">{item.zone}</Badge>}
                    <p className="text-xs text-gray-500 mt-0.5">{item.explanation}</p>
                  </div>
                </div>
                <Badge className="bg-primary/10 text-primary/90 text-xs">{Math.round(item.confidence * 100)}%</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Fraud Indicators from Cross-Validation */}
      {fraudIndicators.length > 0 && (
        <Card className="p-5 border-amber-200 bg-amber-50/30">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <h3 className="font-semibold text-amber-800">Fraud Indicators from Cross-Validation</h3>
          </div>
          <ul className="space-y-2">
            {fraudIndicators.map((indicator, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-amber-700">
                <ArrowRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>{indicator}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-gray-900">Cross-Validation Recommendations</h3>
          </div>
          <ul className="space-y-2">
            {recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-indigo-500" />
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
