/**
 * Role-Specific Onboarding Walkthrough Component
 * 
 * Provides a 3-step onboarding experience for new users based on their role:
 * 1. What you do (role responsibilities)
 * 2. What you see (dashboard preview and features)
 * 3. What you cannot modify (permissions and restrictions)
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  Eye,
  Lock,
  Briefcase,
  ArrowRight,
  ArrowLeft,
  X,
} from "lucide-react";

export type UserRole =
  | "claimant"
  | "claims_processor"
  | "assessor_internal"
  | "assessor_external"
  | "risk_manager"
  | "claims_manager"
  | "executive"
  | "fleet_manager";

interface OnboardingStep {
  icon: React.ReactNode;
  title: string;
  description: string;
  items: string[];
}

interface RoleOnboardingContent {
  roleName: string;
  roleDescription: string;
  steps: [OnboardingStep, OnboardingStep, OnboardingStep]; // Exactly 3 steps
}

const ROLE_ONBOARDING_CONTENT: Record<UserRole, RoleOnboardingContent> = {
  claimant: {
    roleName: "Claimant",
    roleDescription: "Submit and track your insurance claims",
    steps: [
      {
        icon: <Briefcase className="w-8 h-8 text-blue-600" />,
        title: "What You Do",
        description: "Your primary responsibilities as a claimant",
        items: [
          "Submit new claims with incident details and photos",
          "Upload supporting documents (police reports, photos, quotes)",
          "Track claim status and processing updates",
          "Respond to requests for additional information",
          "Review and accept settlement offers",
        ],
      },
      {
        icon: <Eye className="w-8 h-8 text-green-600" />,
        title: "What You See",
        description: "Your dashboard and available features",
        items: [
          "Your submitted claims with current status",
          "Claim timeline showing processing stages",
          "Messages and notifications from claims team",
          "Settlement offers and payment status",
          "Document upload interface for your claims",
        ],
      },
      {
        icon: <Lock className="w-8 h-8 text-amber-600" />,
        title: "What You Cannot Modify",
        description: "System protections and restrictions",
        items: [
          "AI assessment results and fraud risk scores",
          "Internal assessor evaluations and notes",
          "Claims processing workflow and approvals",
          "Other claimants' information and claims",
          "System-generated timestamps and audit logs",
        ],
      },
    ],
  },
  claims_processor: {
    roleName: "Claims Processor",
    roleDescription: "Process and manage incoming insurance claims",
    steps: [
      {
        icon: <Briefcase className="w-8 h-8 text-blue-600" />,
        title: "What You Do",
        description: "Your primary responsibilities as a claims processor",
        items: [
          "Review incoming claims for completeness",
          "Request additional documentation from claimants",
          "Route claims to appropriate assessors",
          "Update claim status throughout processing",
          "Coordinate between claimants and internal teams",
        ],
      },
      {
        icon: <Eye className="w-8 h-8 text-green-600" />,
        title: "What You See",
        description: "Your dashboard and available features",
        items: [
          "Queue of claims requiring processing",
          "Claim details, documents, and photos",
          "AI assessment recommendations",
          "Communication tools for claimant contact",
          "Workflow status and next actions",
        ],
      },
      {
        icon: <Lock className="w-8 h-8 text-amber-600" />,
        title: "What You Cannot Modify",
        description: "System protections and restrictions",
        items: [
          "AI-generated assessments and confidence scores",
          "Final approval decisions (requires Claims Manager)",
          "Fraud risk scores and override justifications",
          "Assessor evaluations and cost estimates",
          "Executive override decisions and audit trails",
        ],
      },
    ],
  },
  assessor_internal: {
    roleName: "Internal Assessor",
    roleDescription: "Evaluate vehicle damage and estimate repair costs",
    steps: [
      {
        icon: <Briefcase className="w-8 h-8 text-blue-600" />,
        title: "What You Do",
        description: "Your primary responsibilities as an internal assessor",
        items: [
          "Review AI assessments and damage photos",
          "Conduct detailed damage evaluations",
          "Estimate repair costs and timelines",
          "Validate or adjust AI cost predictions",
          "Provide professional assessment reports",
        ],
      },
      {
        icon: <Eye className="w-8 h-8 text-green-600" />,
        title: "What You See",
        description: "Your dashboard and available features",
        items: [
          "Assigned claims requiring assessment",
          "AI assessment with confidence breakdown",
          "Damage photos and incident details",
          "Cost estimation tools and historical data",
          "Comparison view: AI vs your assessment",
        ],
      },
      {
        icon: <Lock className="w-8 h-8 text-amber-600" />,
        title: "What You Cannot Modify",
        description: "System protections and restrictions",
        items: [
          "AI assessment results (view-only)",
          "Final claim approval decisions",
          "Fraud risk scores and flags",
          "Claims assigned to other assessors",
          "Executive override justifications",
        ],
      },
    ],
  },
  assessor_external: {
    roleName: "External Assessor",
    roleDescription: "Provide independent damage assessments",
    steps: [
      {
        icon: <Briefcase className="w-8 h-8 text-blue-600" />,
        title: "What You Do",
        description: "Your primary responsibilities as an external assessor",
        items: [
          "Conduct independent damage assessments",
          "Upload assessment reports and photos",
          "Estimate repair costs based on market rates",
          "Provide professional opinions on damage severity",
          "Submit completed assessments for review",
        ],
      },
      {
        icon: <Eye className="w-8 h-8 text-green-600" />,
        title: "What You See",
        description: "Your dashboard and available features",
        items: [
          "Claims assigned to you for assessment",
          "Claimant-provided photos and documents",
          "Assessment submission interface",
          "Your assessment history and performance",
          "Payment status for completed assessments",
        ],
      },
      {
        icon: <Lock className="w-8 h-8 text-amber-600" />,
        title: "What You Cannot Modify",
        description: "System protections and restrictions",
        items: [
          "Internal AI assessments and scores",
          "Internal assessor evaluations",
          "Claim approval workflows and decisions",
          "Other assessors' reports",
          "Claimant personal information (beyond claim details)",
        ],
      },
    ],
  },
  risk_manager: {
    roleName: "Risk Manager",
    roleDescription: "Monitor fraud risk and ensure compliance",
    steps: [
      {
        icon: <Briefcase className="w-8 h-8 text-blue-600" />,
        title: "What You Do",
        description: "Your primary responsibilities as a risk manager",
        items: [
          "Monitor fraud risk scores across all claims",
          "Review high-risk claims flagged by AI",
          "Analyze patterns and trends in fraud indicators",
          "Recommend policy changes to reduce risk",
          "Audit segregation of duties compliance",
        ],
      },
      {
        icon: <Eye className="w-8 h-8 text-green-600" />,
        title: "What You See",
        description: "Your dashboard and available features",
        items: [
          "Risk analytics dashboard with fraud metrics",
          "High-risk claims requiring attention",
          "AI confidence breakdown and discrepancy analysis",
          "Historical claimant risk profiles",
          "Technical validation panel (damage plausibility, prior claims)",
        ],
      },
      {
        icon: <Lock className="w-8 h-8 text-amber-600" />,
        title: "What You Cannot Modify",
        description: "System protections and restrictions",
        items: [
          "Final payment authorization (requires Claims Manager)",
          "Panel beater selection and quote approval",
          "AI fraud detection algorithms",
          "Executive override decisions",
          "Claim workflow state transitions",
        ],
      },
    ],
  },
  claims_manager: {
    roleName: "Claims Manager",
    roleDescription: "Approve claims and manage team operations",
    steps: [
      {
        icon: <Briefcase className="w-8 h-8 text-blue-600" />,
        title: "What You Do",
        description: "Your primary responsibilities as a claims manager",
        items: [
          "Review and approve final claim settlements",
          "Select panel beaters and approve quotes",
          "Manage claims processing team workload",
          "Override AI recommendations with justification",
          "Monitor team performance and SLA compliance",
        ],
      },
      {
        icon: <Eye className="w-8 h-8 text-green-600" />,
        title: "What You See",
        description: "Your dashboard and available features",
        items: [
          "Claims requiring final approval",
          "Three-column comparison: AI, Assessor, Panel Beater quotes",
          "Cost variance analysis with color-coded badges",
          "Team performance metrics and workload",
          "Override history and audit trails",
        ],
      },
      {
        icon: <Lock className="w-8 h-8 text-amber-600" />,
        title: "What You Cannot Modify",
        description: "System protections and restrictions",
        items: [
          "AI assessment algorithms and confidence scores",
          "Assessor evaluations (view-only)",
          "Executive-level analytics and reports",
          "System audit logs and timestamps",
          "Segregation of duties enforcement rules",
        ],
      },
    ],
  },
  executive: {
    roleName: "Executive",
    roleDescription: "Monitor performance and strategic oversight",
    steps: [
      {
        icon: <Briefcase className="w-8 h-8 text-blue-600" />,
        title: "What You Do",
        description: "Your primary responsibilities as an executive",
        items: [
          "Monitor key performance indicators (KPIs)",
          "Review fast-track and auto-approval rates",
          "Analyze fraud risk exposure and trends",
          "Override critical decisions with justification",
          "Export performance reports for board review",
        ],
      },
      {
        icon: <Eye className="w-8 h-8 text-green-600" />,
        title: "What You See",
        description: "Your dashboard and available features",
        items: [
          "Executive dashboard with 6 KPI cards",
          "Confidence score gauge with risk bands",
          "Workflow bottleneck charts",
          "Override transparency panel (30-day metrics)",
          "Analytics export (PDF/CSV) with date filtering",
        ],
      },
      {
        icon: <Lock className="w-8 h-8 text-amber-600" />,
        title: "What You Cannot Modify",
        description: "System protections and restrictions",
        items: [
          "Individual claim processing workflows",
          "AI assessment algorithms",
          "Assessor evaluations and cost estimates",
          "Claims Manager approval decisions (unless override)",
          "System audit logs (immutable)",
        ],
      },
    ],
  },
  fleet_manager: {
    roleName: "Fleet Manager",
    roleDescription: "Manage vehicle fleet and bulk claims",
    steps: [
      {
        icon: <Briefcase className="w-8 h-8 text-blue-600" />,
        title: "What You Do",
        description: "Your primary responsibilities as a fleet manager",
        items: [
          "Submit claims for multiple fleet vehicles",
          "Track claim status across entire fleet",
          "Manage vehicle maintenance and repair schedules",
          "Coordinate with panel beaters for bulk repairs",
          "Monitor fleet-wide claim costs and trends",
        ],
      },
      {
        icon: <Eye className="w-8 h-8 text-green-600" />,
        title: "What You See",
        description: "Your dashboard and available features",
        items: [
          "Fleet overview with vehicle status",
          "Active claims grouped by vehicle",
          "Fleet-wide analytics and cost summaries",
          "Bulk claim submission interface",
          "Repair scheduling and coordination tools",
        ],
      },
      {
        icon: <Lock className="w-8 h-8 text-amber-600" />,
        title: "What You Cannot Modify",
        description: "System protections and restrictions",
        items: [
          "Individual claim assessments and approvals",
          "AI fraud risk scores",
          "Claims for vehicles outside your fleet",
          "Internal processing workflows",
          "Executive-level analytics and reports",
        ],
      },
    ],
  },
};

interface OnboardingWalkthroughProps {
  role: UserRole;
  onComplete: () => void;
  onSkip: () => void;
}

export function OnboardingWalkthrough({
  role,
  onComplete,
  onSkip,
}: OnboardingWalkthroughProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const content = ROLE_ONBOARDING_CONTENT[role];
  const totalSteps = 3;
  const progress = ((currentStep + 1) / totalSteps) * 100;

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const currentStepData = content.steps[currentStep];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl bg-white dark:bg-card shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-foreground">
                Welcome, {content.roleName}!
              </h2>
              <p className="text-sm text-gray-600 dark:text-muted-foreground mt-1">
                {content.roleDescription}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onSkip}
              className="text-gray-600 dark:text-gray-400 dark:text-muted-foreground/70 hover:text-gray-600 dark:text-muted-foreground"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-600 dark:text-muted-foreground">
              <span>
                Step {currentStep + 1} of {totalSteps}
              </span>
              <span>{Math.round(progress)}% complete</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="mb-4">{currentStepData.icon}</div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-foreground mb-2">
              {currentStepData.title}
            </h3>
            <p className="text-sm text-gray-600 dark:text-muted-foreground">
              {currentStepData.description}
            </p>
          </div>

          <div className="bg-gray-50 dark:bg-muted/50 rounded-lg p-6">
            <ul className="space-y-3">
              {currentStepData.items.map((item, index) => (
                <li key={index} className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-700 dark:text-foreground/80 text-left">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50 dark:bg-muted/50 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={currentStep === 0}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onSkip}>
              Skip Tour
            </Button>
            <Button onClick={handleNext} className="gap-2">
              {currentStep === totalSteps - 1 ? (
                <>
                  Get Started
                  <CheckCircle2 className="w-4 h-4" />
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
