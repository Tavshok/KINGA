import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, AlertTriangle, Brain } from "lucide-react";

interface AICommentaryCardProps {
  title: string;
  type: 'physics' | 'fraud' | 'quote';
  status: 'pass' | 'warning' | 'fail' | 'info';
  commentary: string;
  keyFindings?: string[];
  recommendations?: string[];
}

export function AICommentaryCard({
  title,
  type,
  status,
  commentary,
  keyFindings = [],
  recommendations = []
}: AICommentaryCardProps) {
  
  const getStatusConfig = () => {
    switch (status) {
      case 'pass':
        return {
          icon: CheckCircle2,
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          badge: 'bg-green-100 text-green-800'
        };
      case 'warning':
        return {
          icon: AlertTriangle,
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200',
          badge: 'bg-yellow-100 text-yellow-800'
        };
      case 'fail':
        return {
          icon: AlertCircle,
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          badge: 'bg-red-100 text-red-800'
        };
      default:
        return {
          icon: Brain,
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
          badge: 'bg-blue-100 text-blue-800'
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <Card className={`${config.borderColor} border-2`}>
      <CardHeader className={config.bgColor}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Icon className={`h-6 w-6 ${config.color}`} />
            <CardTitle className="text-lg">{title}</CardTitle>
          </div>
          <Badge className={config.badge}>
            {status === 'pass' ? 'Validated' : status === 'warning' ? 'Review Required' : status === 'fail' ? 'Issues Detected' : 'Analysis Complete'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-4">
        {/* Main Commentary */}
        <div className="prose prose-sm max-w-none">
          <p className="text-gray-700 leading-relaxed">{commentary}</p>
        </div>

        {/* Key Findings */}
        {keyFindings.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-900">Key Findings:</h4>
            <ul className="space-y-1.5">
              {keyFindings.map((finding, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-blue-600 mt-0.5">•</span>
                  <span>{finding}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div className={`${config.bgColor} border ${config.borderColor} rounded-lg p-4 space-y-2`}>
            <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Recommended Actions:
            </h4>
            <ul className="space-y-1.5">
              {recommendations.map((rec, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className={config.color}>→</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
