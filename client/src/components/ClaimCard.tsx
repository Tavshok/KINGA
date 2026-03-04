import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, 
  Download, 
  Upload, 
  AlertTriangle, 
  Eye, 
  TrendingUp,
  Brain,
  UserPlus,
  Clock
} from "lucide-react";

interface ClaimCardProps {
  claim: {
    id: number;
    claimNumber: string;
    claimantName?: string;
    policyholderName?: string;
    claimType?: string;
    vehicleRegistration?: string;
    vehicleMake?: string;
    vehicleModel?: string;
    policyNumber?: string;
    aiConfidenceScore?: number;
    fraudRiskScore?: number;
    workflowState?: string;
    status?: string;
    createdAt?: string | Date;
  };
  onViewDetails: (claimId: number) => void;
  onDownloadReport: (claimId: number) => void;
  onUploadEvidence: (claimId: number) => void;
  onEscalate: (claimId: number) => void;
  onTriggerAI?: (claimId: number) => void;
  onAssignAssessor?: (claimId: number) => void;
  showAITrigger?: boolean;
  showAssignAssessor?: boolean;
}

export function ClaimCard({
  claim,
  onViewDetails,
  onDownloadReport,
  onUploadEvidence,
  onEscalate,
  onTriggerAI,
  onAssignAssessor,
  showAITrigger = false,
  showAssignAssessor = false,
}: ClaimCardProps) {
  
  const getConfidenceBadge = (score?: number) => {
    if (!score) return null;
    
    const variant = score >= 80 ? "default" : score >= 60 ? "secondary" : "destructive";
    const color = score >= 80 ? "text-green-700" : score >= 60 ? "text-amber-700" : "text-red-700";
    
    return (
      <Badge variant={variant} className={`${color} flex items-center gap-1`}>
        <TrendingUp className="h-3 w-3" />
        AI: {score}%
      </Badge>
    );
  };

  const getFraudRiskBadge = (score?: number) => {
    if (!score) return null;
    
    const variant = score >= 70 ? "destructive" : score >= 40 ? "secondary" : "outline";
    const label = score >= 70 ? "High Risk" : score >= 40 ? "Medium Risk" : "Low Risk";
    
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" />
        {label} ({score}%)
      </Badge>
    );
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return null;
    
    const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; color: string }> = {
      pending: { variant: "outline", color: "text-slate-700" },
      in_review: { variant: "secondary", color: "text-amber-700" },
      ai_flagged: { variant: "destructive", color: "text-red-700" },
      completed: { variant: "default", color: "text-green-700" },
      created: { variant: "outline", color: "text-slate-700" },
      assigned: { variant: "secondary", color: "text-blue-700" },
      disputed: { variant: "destructive", color: "text-orange-700" },
      // Document-ingestion statuses
      intake_pending: { variant: "outline", color: "text-amber-700" },
      quotes_pending: { variant: "secondary", color: "text-blue-700" },
      assessment_complete: { variant: "default", color: "text-teal-700" },
      closed: { variant: "default", color: "text-green-700" },
    };

    const config = statusConfig[status] || { variant: "outline" as const, color: "text-slate-700" };
    
    return (
      <Badge variant={config.variant} className={config.color}>
        {status.replace(/_/g, " ").toUpperCase()}
      </Badge>
    );
  };

  /** Returns an "Awaiting Processing" badge for intake_pending claims */
  const getAwaitingProcessingBadge = (status?: string) => {
    if (status !== "intake_pending") return null;
    return (
      <Badge
        variant="outline"
        className="border-amber-400 bg-amber-50 text-amber-800 font-semibold flex items-center gap-1"
      >
        <Clock className="h-3 w-3" />
        Awaiting Processing
      </Badge>
    );
  };

  return (
    <Card className="hover:shadow-md transition-shadow border-l-4 border-l-primary/40">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Left: Claim Information */}
          <div className="flex-1 space-y-3">
            {/* Header Row */}
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="font-bold text-lg text-primary">{claim.claimNumber}</h3>
              {getStatusBadge(claim.status || claim.workflowState)}
              {getAwaitingProcessingBadge(claim.status)}
              {getConfidenceBadge(claim.aiConfidenceScore)}
              {getFraudRiskBadge(claim.fraudRiskScore)}
            </div>

            {/* Claim Details Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-sm">
              <div>
                <span className="font-medium text-slate-600">Policyholder:</span>
                <p className="text-slate-900">{claim.policyholderName || claim.claimantName || "N/A"}</p>
              </div>
              <div>
                <span className="font-medium text-slate-600">Claim Type:</span>
                <p className="text-slate-900">{claim.claimType || "Motor Vehicle"}</p>
              </div>
              <div>
                <span className="font-medium text-slate-600">Vehicle:</span>
                <p className="text-slate-900">
                  {claim.vehicleRegistration || "N/A"}
                  {claim.vehicleMake && ` (${claim.vehicleMake} ${claim.vehicleModel || ""})`}
                </p>
              </div>
              <div>
                <span className="font-medium text-slate-600">Policy Number:</span>
                <p className="text-slate-900">{claim.policyNumber || "N/A"}</p>
              </div>
              <div>
                <span className="font-medium text-slate-600">Submitted:</span>
                <p className="text-slate-900">
                  {claim.createdAt 
                    ? new Date(claim.createdAt).toLocaleDateString() 
                    : "N/A"}
                </p>
              </div>
            </div>
          </div>

          {/* Right: Action Buttons */}
          <div className="flex flex-col gap-2 min-w-[200px]">
            <Button 
              size="sm" 
              variant="default"
              onClick={() => onViewDetails(claim.id)}
              className="w-full justify-start"
            >
              <Eye className="h-4 w-4 mr-2" />
              View Details
            </Button>
            
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => onDownloadReport(claim.id)}
              className="w-full justify-start"
            >
              <Download className="h-4 w-4 mr-2" />
              Download AI Report
            </Button>
            
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => onUploadEvidence(claim.id)}
              className="w-full justify-start"
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload Evidence
            </Button>
            
            {showAITrigger && onTriggerAI && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => onTriggerAI(claim.id)}
                className="w-full justify-start border-purple-300 text-purple-700 hover:bg-purple-50"
              >
                <Brain className="h-4 w-4 mr-2" />
                Trigger AI Assessment
              </Button>
            )}
            
            {showAssignAssessor && onAssignAssessor && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => onAssignAssessor(claim.id)}
                className="w-full justify-start border-blue-300 text-blue-700 hover:bg-blue-50"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Assign Assessor
              </Button>
            )}
            
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => onEscalate(claim.id)}
              className="w-full justify-start border-orange-300 text-orange-700 hover:bg-orange-50"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Escalate
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
