import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { OnboardingManager } from "./components/OnboardingManager";
import DevRoleBadge from "./components/DevRoleBadge";
import { lazy, Suspense } from "react";
import ProtectedRoute from "./components/ProtectedRoute";
import { RoleGuard } from "./components/RoleGuard";

/**
 * Simple redirect component used for legacy route aliases.
 * Immediately navigates to `to` when rendered.
 */
function RedirectToPortal({ to }: { to: string }) {
  const [, setLocation] = useLocation();
  // Redirect immediately on render (replace so the legacy URL is not in history)
  setLocation(to, { replace: true });
  return null;
}

// Loading fallback component
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

// Lazy load ALL page components to reduce initial bundle size
const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Login"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const Unauthorized = lazy(() => import("./pages/Unauthorized"));
const Onboarding = lazy(() => import("./pages/Onboarding"));

// Insurer pages
const InsurerDashboard = lazy(() => import("./pages/InsurerDashboard"));
const RecoveryPortal = lazy(() => import("./pages/RecoveryPortal"));
const RecoveryCaseDetail = lazy(() => import("./pages/RecoveryCaseDetail"));
const ThirdPartyProfiles = lazy(() => import("./pages/ThirdPartyProfiles"));
const InsurerClaimsTriage = lazy(() => import("./pages/InsurerClaimsTriage"));
const InsurerClaimDetails = lazy(() => import("./pages/InsurerClaimDetails"));
const InsurerComparisonView = lazy(() => import("./pages/InsurerComparisonView"));
const ClaimDecisionReport = lazy(() => import("./pages/ClaimDecisionReport"));
const InsurerQuoteComparison = lazy(() => import("./pages/InsurerQuoteComparison"));
const InsurerExternalAssessmentUpload = lazy(() => import("@/pages/InsurerExternalAssessmentUpload"));
const InsurerRoleSelection = lazy(() => import("./pages/InsurerRoleSelection"));

// Insurer sub-role dashboards
const ExecutiveDashboard = lazy(() => import("./pages/ExecutiveDashboard"));
const WorkflowAnalyticsDashboard = lazy(() => import("./pages/WorkflowAnalyticsDashboard"));
const ClaimsProcessorDashboard = lazy(() => import("./pages/ClaimsProcessorDashboard"));
const InternalAssessorDashboard = lazy(() => import("./pages/InternalAssessorDashboard"));
const RiskManagerDashboard = lazy(() => import("./pages/RiskManagerDashboard"));
const RiskManagerAnalytics = lazy(() => import("./pages/RiskManagerAnalytics"));
const ClaimsManagerDashboard = lazy(() => import("./pages/ClaimsManagerDashboard"));
const InsurerAdminDashboard = lazy(() => import("./pages/InsurerAdminDashboard"));
const TeamMembers = lazy(() => import("./pages/TeamMembers"));
const InviteAccept = lazy(() => import("./pages/InviteAccept"));
const ClaimsManagerComparisonView = lazy(() => import("./pages/ClaimsManagerComparisonView"));
const WorkflowSettings = lazy(() => import("./pages/WorkflowSettings"));
const MonetizationDashboard = lazy(() => import("./pages/MonetizationDashboard"));
const AdminRevenueDashboard = lazy(() => import("./pages/AdminRevenueDashboard"));
const PolicyManagementDashboard = lazy(() => import("./pages/PolicyManagementDashboard"));
const InteractiveReport = lazy(() => import("./pages/InteractiveReport"));
const OperationalHealthDashboard = lazy(() => import("./pages/OperationalHealthDashboard"));
const ExceptionIntelligenceHub = lazy(() => import("./pages/ExceptionIntelligenceHub"));
const PlatformOverviewDashboard = lazy(() => import("./pages/PlatformOverviewDashboard"));
const PlatformClaimTrace = lazy(() => import("./pages/PlatformClaimTrace"));
const PlatformMarketplace = lazy(() => import("./pages/PlatformMarketplace"));
const PlatformImpersonate = lazy(() => import("./pages/PlatformImpersonate"));
const PlatformClaimDebug = lazy(() => import("./pages/PlatformClaimDebug"));
const PipelineDebug = lazy(() => import("./pages/PipelineDebug"));
const PlatformUserRoleManager = lazy(() => import("./pages/PlatformUserRoleManager"));
const ClaimSimulator = lazy(() => import("./pages/platform/ClaimSimulator"));
const PlatformOperationsCentre = lazy(() => import("./pages/PlatformOperationsCentre")); // Epic 5-C
const VehicleRegistry = lazy(() => import("./pages/VehicleRegistry"));
import PlatformLayout from "./components/PlatformLayout";
import InsurerPortalLayout from "./components/InsurerPortalLayout";
import AdminPortalLayout from "./components/AdminPortalLayout";
import AssessorPortalLayout from "./components/AssessorPortalLayout";
import PanelBeaterPortalLayout from "./components/PanelBeaterPortalLayout";
import ClaimantPortalLayout from "./components/ClaimantPortalLayout";
import EngineerWorkspaceLayout from "./components/EngineerWorkspaceLayout"; // Epic 4.5: applied to /engineer/* routes

// Assessor pages
const ExternalAssessorDashboard = lazy(() => import("./pages/ExternalAssessorDashboard"));
const AssessorDashboard = lazy(() => import("@/pages/AssessorDashboard"));
const AssessorPerformance = lazy(() => import("@/pages/AssessorPerformance"));
const AssessorPerformanceDashboard = lazy(() => import("@/pages/AssessorPerformanceDashboard"));
const AssessorLeaderboard = lazy(() => import("@/pages/AssessorLeaderboard"));
const AssessorClaimDetails = lazy(() => import("./pages/AssessorClaimDetails"));

// Panel beater pages
const PanelBeaterDashboard = lazy(() => import("./pages/PanelBeaterDashboard"));
const PanelBeaterQuoteSubmission = lazy(() => import("./pages/PanelBeaterQuoteSubmission"));
const PanelBeaterPerformanceDashboard = lazy(() => import("./pages/PanelBeaterPerformance"));

// Claimant pages
const ClaimantDashboard = lazy(() => import("./pages/ClaimantDashboard"));
const ClaimantClaimDetail = lazy(() => import("./pages/ClaimantClaimDetail"));
const ClaimantDocuments = lazy(() => import("./pages/ClaimantDocuments"));
const SubmitClaim = lazy(() => import("./pages/SubmitClaim"));
const FleetManagerDashboard = lazy(() => import("./pages/FleetManagerDashboard"));
const FleetDriverDashboard = lazy(() => import("./pages/FleetDriverDashboard"));
const ValuationRequestPage = lazy(() => import("./pages/ValuationRequestPage"));
const TeaserReportPage = lazy(() => import("./pages/TeaserReportPage"));
const ClientProfile = lazy(() => import("./pages/ClientProfile"));
const ClientPortal = lazy(() => import("./pages/ClientPortal"));
const AgencyValuationInbox = lazy(() => import("./pages/AgencyValuationInbox"));
const FleetRegister = lazy(() => import("./pages/FleetRegister"));

// Admin pages
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminTierManagement = lazy(() => import("@/pages/AdminTierManagement"));
const AdminSeedData = lazy(() => import("./pages/AdminSeedData"));
const ObservabilityDashboard = lazy(() => import("./pages/admin/ObservabilityDashboard"));
const PipelineHealthDashboard = lazy(() => import("./pages/admin/PipelineHealthDashboard"));
const LearningDashboard = lazy(() => import("./pages/admin/LearningDashboard"));
const WorkflowTemplates = lazy(() => import("./pages/admin/WorkflowTemplates"));
const EscalationQueue = lazy(() => import("./pages/admin/EscalationQueue"));
const TenantManagement = lazy(() => import("./pages/admin/TenantManagement"));
const TenantRoleConfig = lazy(() => import("./pages/admin/TenantRoleConfig"));
const TenantRegistration = lazy(() => import("./pages/admin/TenantRegistration"));
const MarketQuotesIngestion = lazy(() => import("./pages/MarketQuotesIngestion"));
const IntegrityMetricsDashboard = lazy(() => import("./pages/admin/IntegrityMetricsDashboard"));
const PhysicsAccuracyDashboard = lazy(() => import("./pages/admin/PhysicsAccuracyDashboard"));
const KingaAgency = lazy(() => import("./pages/KingaAgency"));
const AgencyFleetQuotes = lazy(() => import("./pages/AgencyFleetQuotes"));
const CommissionDashboard = lazy(() => import("./pages/CommissionDashboard"));
// Engineering Workspace pages
const EngineerDashboard = lazy(() => import("./pages/EngineerDashboard"));
const EngineerAssignments = lazy(() => import("./pages/EngineerAssignments"));
const EngineerInspectionList = lazy(() => import("./pages/EngineerInspectionList"));
const EngineerInspectionDetail = lazy(() => import("./pages/EngineerInspectionDetail"));
const EngineerProjects = lazy(() => import("./pages/EngineerProjects"));
const InsurerFleetRFQs = lazy(() => import("./pages/InsurerFleetRFQs"));

// Feature pages
const AssessmentResults = lazy(() => import("./pages/AssessmentResults"));
const NewAssessmentUpload = lazy(() => import("./pages/NewAssessmentUpload"));
const SimpleUpload = lazy(() => import("./pages/SimpleUpload"));
const FraudAnalyticsDashboard = lazy(() => import("./pages/FraudAnalyticsDashboard"));
const BatchExport = lazy(() => import("@/pages/BatchExport"));
const ClaimDocuments = lazy(() => import("./pages/ClaimDocuments"));
const PortalHub = lazy(() => import("./pages/PortalHub"));
const AddAssessor = lazy(() => import("./pages/AddAssessor"));
const JoinAsAssessor = lazy(() => import("./pages/JoinAsAssessor"));
const AssessorList = lazy(() => import("./pages/AssessorList"));
const AssignAssessor = lazy(() => import("./pages/AssignAssessor"));
const UploadDocuments = lazy(() => import("./pages/processor/UploadDocuments"));
const HistoricalClaimsPipeline = lazy(() => import("./pages/HistoricalClaimsPipeline"));
const AutomationPolicies = lazy(() => import("./pages/AutomationPolicies"));
const ReplayDashboard = lazy(() => import("./pages/ReplayDashboard"));
const FleetManagement = lazy(() => import("./pages/FleetManagement"));
const InsuranceQuote = lazy(() => import("./pages/InsuranceQuote"));
const QuoteDetails = lazy(() => import("./pages/QuoteDetails"));
const PaymentVerification = lazy(() => import("./pages/PaymentVerification"));
const InsuranceDashboard = lazy(() => import("./pages/InsuranceDashboard"));
const ReviewQueue = lazy(() => import("./pages/ReviewQueue"));
const AnalyticsHub = lazy(() => import("./pages/analytics/AnalyticsHub"));
const RoleSetup = lazy(() => import("./pages/RoleSetup"));
const UserDiagnostic = lazy(() => import("./pages/UserDiagnostic"));
const RelationshipIntelligence = lazy(() => import("./pages/RelationshipIntelligence"));
const ReportsCentre = lazy(() => import("./pages/ReportsCentre"));
const NotificationCentre = lazy(() => import("./pages/NotificationCentre"));
const NotificationPreferences = lazy(() => import("./pages/NotificationPreferences"));
// Admin portal pages (MUST be declared before App/Router — hoisting bug fix for React error #130)
const PlatformHealthDashboard = lazy(() => import("./pages/admin/PlatformHealthDashboard"));
const IntelligenceEngineMonitoring = lazy(() => import("./pages/admin/IntelligenceEngineMonitoring"));
const TenantMonitoring = lazy(() => import("./pages/admin/TenantMonitoring"));
const PanelBeaterManagement = lazy(() => import("./pages/admin/PanelBeaterManagement"));
const ActivityTimeline = lazy(() => import("./pages/admin/ActivityTimeline"));
const AuditLog = lazy(() => import("./pages/admin/AuditLog"));
const UserManagement = lazy(() => import("./pages/admin/UserManagement"));
const SecurityEvents = lazy(() => import("./pages/admin/SecurityEvents"));
const NetworkOversight = lazy(() => import("./pages/admin/NetworkOversight"));
const TenantProvisioning = lazy(() => import("./pages/admin/TenantProvisioning"));
// Engineering + valuation pages (MUST be declared before App/Router — hoisting bug fix)
const AssetPassport = lazy(() => import("./pages/AssetPassport"));
const EngineeringIntelligenceDashboard = lazy(() => import("./pages/EngineeringIntelligenceDashboard"));
const BulkValuation = lazy(() => import("./pages/BulkValuation"));

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/login" component={Login} />
        <Route path="/onboarding" component={Onboarding} />
        <Route path="/invite/accept/:token" component={InviteAccept} />
        <Route path="/unauthorized" component={Unauthorized} />
        
        {/* Analytics Dashboards */}
        <Route path="/analytics">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <AnalyticsHub />
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer-portal/exception-intelligence">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <RoleGuard allowedRoles={["risk_manager", "claims_manager", "executive", "insurer_admin"]}>
              <InsurerPortalLayout><ExceptionIntelligenceHub /></InsurerPortalLayout>
            </RoleGuard>
          </ProtectedRoute>
        </Route>

        {/* Relationship Intelligence — entity web, hotspots, watchlists */}
        <Route path="/insurer-portal/relationship-intelligence">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <RoleGuard allowedRoles={["risk_manager", "claims_manager", "executive", "recovery_officer", "insurer_admin"]}>
              <InsurerPortalLayout><RelationshipIntelligence /></InsurerPortalLayout>
            </RoleGuard>
          </ProtectedRoute>
        </Route>

        {/* Team Members — insurer admin manages tenant users */}
        <Route path="/insurer-portal/team-members">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <RoleGuard allowedRoles={["insurer_admin"]}>
              <InsurerPortalLayout><TeamMembers /></InsurerPortalLayout>
            </RoleGuard>
          </ProtectedRoute>
        </Route>
        {/* Assessor Network — insurer_admin view of approved assessors within portal layout */}
        <Route path="/insurer-portal/assessors">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <RoleGuard allowedRoles={["insurer_admin", "claims_manager", "executive"]}>
              <InsurerPortalLayout><AssessorList /></InsurerPortalLayout>
            </RoleGuard>
          </ProtectedRoute>
        </Route>

        {/* Reports Centre — report catalogue, job tracker, admin regeneration */}
        <Route path="/insurer-portal/reports-centre">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <InsurerPortalLayout><ReportsCentre /></InsurerPortalLayout>
          </ProtectedRoute>
        </Route>
        
         {/* ── Platform Super Admin section (all wrapped in PlatformLayout sidebar) ── */}
        <Route path="/platform/overview">
          <ProtectedRoute domain="platform">
            <PlatformLayout><PlatformOverviewDashboard /></PlatformLayout>
          </ProtectedRoute>
        </Route>
        
        <Route path="/platform/claim-trace/:claimId">
          <ProtectedRoute domain="platform">
            <PlatformLayout><PlatformClaimTrace /></PlatformLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/platform/marketplace">
          <ProtectedRoute domain="platform">
            <PlatformLayout><PlatformMarketplace /></PlatformLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/platform/impersonate">
          <ProtectedRoute domain="platform">
            <PlatformLayout><PlatformImpersonate /></PlatformLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/platform/claim-debug/:claimId?">
          <ProtectedRoute domain="platform">
            <PlatformLayout><PlatformClaimDebug /></PlatformLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/platform/pipeline-debug/:claimId?">
          <ProtectedRoute domain="platform">
            <PlatformLayout><PipelineDebug /></PlatformLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/platform/system-health">
          <ProtectedRoute domain="platform">
            <PlatformLayout><OperationalHealthDashboard /></PlatformLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/platform/user-role-manager">
          <ProtectedRoute domain="platform">
            <PlatformLayout><PlatformUserRoleManager /></PlatformLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/platform/claim-simulator">
          <ProtectedRoute domain="platform">
            <PlatformLayout><ClaimSimulator /></PlatformLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/platform/operations">
          <ProtectedRoute domain="platform">
            <PlatformLayout><PlatformOperationsCentre /></PlatformLayout>
          </ProtectedRoute>
        </Route>
        {/* Assessment Results */}
        <Route path="/assessment-results">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <AssessmentResults />
          </ProtectedRoute>
        </Route>
        
        {/* New Assessment Upload (Debug) */}
        <Route path="/new-upload">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <NewAssessmentUpload />
          </ProtectedRoute>
        </Route>
        
        {/* Simple Upload (NEW SYSTEM) */}
        <Route path="/simple-upload">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <SimpleUpload />
          </ProtectedRoute>
        </Route>
        
        {/* Role Setup - Quick Configuration */}
        <Route path="/role-setup">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <RoleSetup />
          </ProtectedRoute>
        </Route>
        
        <Route path="/user-diagnostic">
          <ProtectedRoute allowedRoles={["user", "admin", "insurer", "assessor", "panel_beater", "claimant"]}>
            <UserDiagnostic />
          </ProtectedRoute>
        </Route>
        
        {/* Portal Hub - Role Selection */}
        <Route path="/portal-hub">
          {/* No ProtectedRoute here — /portal-hub is the OAuth landing page.
              Wrapping it in ProtectedRoute caused a redirect loop: OAuth sets the
              cookie and redirects here, but ProtectedRoute fires before auth.me
              resolves and sends the user back to /login. PortalHub handles its own
              auth state internally (shows login prompt if not authenticated). */}
          <PortalHub />
        </Route>
        
        {/* Insurer Portal - Role Selection */}
        <Route path="/insurer-portal">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <InsurerRoleSelection />
          </ProtectedRoute>
        </Route>
        
        {/* Insurer Sub-Role Dashboards */}
        <Route path="/insurer-portal/workflow-analytics">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <RoleGuard allowedRoles={["executive", "risk_manager", "insurer_admin"]}>
              <InsurerPortalLayout><WorkflowAnalyticsDashboard /></InsurerPortalLayout>
            </RoleGuard>
          </ProtectedRoute>
        </Route>

        <Route path="/insurer-portal/executive">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <RoleGuard allowedRoles={["executive"]}>
              <InsurerPortalLayout><ExecutiveDashboard /></InsurerPortalLayout>
            </RoleGuard>
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer-portal/claims-processor">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <RoleGuard allowedRoles={["claims_processor"]}>
              <InsurerPortalLayout><ClaimsProcessorDashboard /></InsurerPortalLayout>
            </RoleGuard>
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer-portal/internal-assessor">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <RoleGuard allowedRoles={["assessor_internal"]}>
              <InsurerPortalLayout><InternalAssessorDashboard /></InsurerPortalLayout>
            </RoleGuard>
          </ProtectedRoute>
        </Route>
        

        <Route path="/insurer-portal/risk-manager">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <RoleGuard allowedRoles={["risk_manager"]}>
              <InsurerPortalLayout><RiskManagerDashboard /></InsurerPortalLayout>
            </RoleGuard>
          </ProtectedRoute>
        </Route>

        <Route path="/insurer-portal/risk-analytics">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <RoleGuard allowedRoles={["risk_manager"]}>
              <RiskManagerAnalytics />
            </RoleGuard>
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer-portal/claims-manager">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <RoleGuard allowedRoles={["claims_manager"]}>
              <InsurerPortalLayout><ClaimsManagerDashboard /></InsurerPortalLayout>
            </RoleGuard>
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer-portal/insurer-admin">
          {/* Epic 4.5: wrapped in InsurerPortalLayout so insurer_admin has sidebar navigation */}
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <RoleGuard allowedRoles={["insurer_admin"]}>
              <InsurerPortalLayout><InsurerAdminDashboard /></InsurerPortalLayout>
            </RoleGuard>
          </ProtectedRoute>
        </Route>
        {/* Policy Management Dashboard */}
        <Route path="/insurer-portal/policy-management">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <RoleGuard allowedRoles={["insurer_admin", "executive"]}>
              <InsurerPortalLayout><PolicyManagementDashboard /></InsurerPortalLayout>
            </RoleGuard>
          </ProtectedRoute>
        </Route>
        <Route path="/insurer-portal/recovery/third-party-profiles">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <RoleGuard allowedRoles={["recovery_officer", "claims_manager", "insurer_admin", "executive"]}>
              <ThirdPartyProfiles />
            </RoleGuard>
          </ProtectedRoute>
        </Route>
        <Route path="/insurer-portal/recovery/:id">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <RoleGuard allowedRoles={["recovery_officer", "claims_manager", "insurer_admin", "executive"]}>
              <RecoveryCaseDetail />
            </RoleGuard>
          </ProtectedRoute>
        </Route>
        <Route path="/insurer-portal/recovery">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <RoleGuard allowedRoles={["recovery_officer", "claims_manager", "insurer_admin"]}>
              <RecoveryPortal />
            </RoleGuard>
          </ProtectedRoute>
        </Route>

        <Route path="/claims-manager/comparison/:id">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <RoleGuard allowedRoles={["claims_manager"]}>
              <ClaimsManagerComparisonView />
            </RoleGuard>
          </ProtectedRoute>
        </Route>
        
        {/* Insurer Routes */}
        <Route path="/insurer">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <InsurerDashboard />
          </ProtectedRoute>
        </Route>
        
        {/* Legacy redirects — these paths were superseded by the portal architecture.
            Keep them so bookmarked links and back-button history still resolve. */}
        <Route path="/insurer/dashboard">
          <RedirectToPortal to="/insurer-portal" />
        </Route>
        
        <Route path="/insurer/claims/triage">
          <RedirectToPortal to="/insurer-portal/claims-processor" />
        </Route>
        
        <Route path="/insurer/claims/:id/verdict">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <ClaimDecisionReport />
          </ProtectedRoute>
        </Route>

        <Route path="/insurer/claims/:id/comparison">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <InsurerComparisonView />
          </ProtectedRoute>
        </Route>
        
        {/* Alternative comparison route for backward compatibility */}
        <Route path="/insurer/comparison/:id">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <InsurerComparisonView />
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer/claims/:claimId/quote-comparison">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <InsurerQuoteComparison />
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer/panel-beater-performance">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <PanelBeaterPerformanceDashboard />
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer/claims/:id">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <InsurerClaimDetails />
          </ProtectedRoute>
        </Route>
        <Route path="/insurer/quote-optimization/:id">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <InsurerQuoteComparison />
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer/fraud-analytics">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <RoleGuard allowedRoles={["risk_manager", "claims_manager", "executive", "insurer_admin"]}>
              <InsurerPortalLayout><FraudAnalyticsDashboard /></InsurerPortalLayout>
            </RoleGuard>
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer/batch-export">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <RoleGuard allowedRoles={["insurer_admin", "claims_manager", "executive"]}>
              <BatchExport />
            </RoleGuard>
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer/external-assessment">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <RoleGuard allowedRoles={["insurer_admin", "risk_manager", "claims_manager", "executive"]}>
              <InsurerExternalAssessmentUpload />
            </RoleGuard>
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer/automation-policies">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <RoleGuard allowedRoles={["insurer_admin", "executive"]}>
              <AutomationPolicies />
            </RoleGuard>
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer/replay-dashboard">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]} allowedInsurerRoles={["insurer_admin", "executive", "claims_manager"]}>
            <ReplayDashboard />
          </ProtectedRoute>
        </Route>

        <Route path="/insurer/vehicle-registry/:id">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <RoleGuard allowedRoles={["insurer_admin", "risk_manager", "claims_manager", "executive", "claims_processor"]}>
              <VehicleRegistry />
            </RoleGuard>
          </ProtectedRoute>
        </Route>
        <Route path="/insurer/vehicle-registry">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <RoleGuard allowedRoles={["insurer_admin", "risk_manager", "claims_manager", "executive", "claims_processor"]}>
              <VehicleRegistry />
            </RoleGuard>
          </ProtectedRoute>
        </Route>
        
        {/* Legacy fleet management route — kept for backward compatibility */}
        <Route path="/fleet-management">
          <ProtectedRoute allowedRoles={["insurer", "admin", "claimant"]}>
            <FleetManagement />
          </ProtectedRoute>
        </Route>

        {/* Standalone fleet route — fleet roles only */}
        <Route path="/fleet">
          <ProtectedRoute domain="fleet">
            <FleetManagement />
          </ProtectedRoute>
        </Route>
        <Route path="/fleet/:rest*">
          <ProtectedRoute domain="fleet">
            <FleetManagement />
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurance/quote">
          <InsuranceQuote />
        </Route>
        <Route path="/get-a-quote">
          <ValuationRequestPage />
        </Route>
        <Route path="/quote/result/:token">
          <TeaserReportPage />
        </Route>
        <Route path="/my-profile">
          <ClientProfile />
        </Route>
        <Route path="/client">
          <ClientPortal />
        </Route>

        <Route path="/agency">
          <ProtectedRoute domain="agency">
            <KingaAgency />
          </ProtectedRoute>
        </Route>

        {/* Agency commission dashboard */}
        <Route path="/agency/commissions">
          <ProtectedRoute domain="agency">
            <CommissionDashboard />
          </ProtectedRoute>
        </Route>

        {/* Fleet RFQ comparison — accessible to any authenticated fleet owner */}
        <Route path="/agency/valuation">
          <ProtectedRoute allowedRoles={["agency_broker", "agency_admin", "admin", "platform_super_admin"]}>
            <KingaAgency />
          </ProtectedRoute>
        </Route>
        <Route path="/agency/valuation-requests">
          <ProtectedRoute domain="agency">
            <KingaAgency />
          </ProtectedRoute>
        </Route>
        <Route path="/agency/valuation/bulk">
          <ProtectedRoute allowedRoles={["agency_broker", "agency_admin", "admin", "platform_super_admin"]}>
            <BulkValuation />
          </ProtectedRoute>
        </Route>
        <Route path="/agency/quotes">
          <ProtectedRoute>
            <AgencyFleetQuotes />
          </ProtectedRoute>
        </Route>

        {/* Insurer portal: fleet policy RFQs from KINGA Agency */}
        <Route path="/insurer-portal/fleet-rfqs">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <RoleGuard allowedRoles={["insurer_admin", "executive", "claims_manager"]}>
              <InsurerFleetRFQs />
            </RoleGuard>
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurance/quote/:quoteId">
          <QuoteDetails />
        </Route>
        
        <Route path="/insurance/payments">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <PaymentVerification />
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurance/dashboard">
          <ProtectedRoute>
            <InsuranceDashboard />
          </ProtectedRoute>
        </Route>
        
        {/* Assessor Management Routes */}
        <Route path="/add-assessor">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <AddAssessor />
          </ProtectedRoute>
        </Route>
        
        <Route path="/assessors">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <AssessorList />
          </ProtectedRoute>
        </Route>
        
        <Route path="/assign-assessor/:claimId">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <AssignAssessor />
          </ProtectedRoute>
        </Route>
        
        {/* Public Marketplace Registration */}
        <Route path="/join-as-assessor" component={JoinAsAssessor} />
        
        {/* Document Intelligence Pipeline */}
        <Route path="/processor/upload-documents">
          <ProtectedRoute allowedRoles={["insurer", "admin", "platform_super_admin"]}>
            <UploadDocuments />
          </ProtectedRoute>
        </Route>
        
        {/* Historical Claims Intelligence Pipeline - Admin only, accessed via Admin Panel */}
        <Route path="/historical-claims">
          <ProtectedRoute allowedRoles={["admin"]}>
            <HistoricalClaimsPipeline />
          </ProtectedRoute>
        </Route>
        
        {/* ML Training Data Review Queue - Admin only */}
        <Route path="/ml/review/queue">
          <ProtectedRoute allowedRoles={["admin"]}>
            <ReviewQueue />
          </ProtectedRoute>
        </Route>
        
        {/* Document Management Route - accessible by all authenticated users */}
        <Route path="/claims/:id/documents">
          <ProtectedRoute allowedRoles={["insurer", "admin", "assessor", "panel_beater", "claimant"]}>
            <ClaimDocuments />
          </ProtectedRoute>
        </Route>
        
        {/* Assessor Routes */}
        <Route path="/assessor">
          <ProtectedRoute allowedRoles={["assessor", "admin", "platform_super_admin"]}>
            <AssessorPortalLayout><AssessorDashboard /></AssessorPortalLayout>
          </ProtectedRoute>
        </Route>
        
        <Route path="/assessor/dashboard">
          <ProtectedRoute allowedRoles={["assessor", "admin", "platform_super_admin"]}>
            <AssessorPortalLayout><AssessorDashboard /></AssessorPortalLayout>
          </ProtectedRoute>
        </Route>
        
        <Route path="/assessor/claims/:id">
          <ProtectedRoute allowedRoles={["assessor", "admin", "platform_super_admin"]}>
            <AssessorPortalLayout><AssessorClaimDetails /></AssessorPortalLayout>
          </ProtectedRoute>
        </Route>
        
        <Route path="/assessor/performance">
          <ProtectedRoute allowedRoles={["assessor", "admin", "platform_super_admin"]}>
            <AssessorPortalLayout><AssessorPerformanceDashboard /></AssessorPortalLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/assessor/leaderboard">
          <ProtectedRoute allowedRoles={["assessor", "admin", "platform_super_admin"]}>
            <AssessorPortalLayout><AssessorLeaderboard /></AssessorPortalLayout>
          </ProtectedRoute>
        </Route>
        {/* External Assessor Dashboard */}
        <Route path="/assessor/external">
          <ProtectedRoute allowedRoles={["assessor", "admin", "platform_super_admin"]}>
            <AssessorPortalLayout><ExternalAssessorDashboard /></AssessorPortalLayout>
          </ProtectedRoute>
        </Route>
        
        {/* Interactive Report — snapshot-based living report */}
        <Route path="/reports/interactive/:snapshotId">
          <ProtectedRoute allowedRoles={["insurer", "admin", "assessor"]}>
            <InteractiveReport />
          </ProtectedRoute>
        </Route>
        {/* Panel Beater Routes */}
        <Route path="/panel-beater/dashboard">
          <ProtectedRoute allowedRoles={["panel_beater", "admin", "platform_super_admin"]}>
            <PanelBeaterPortalLayout><PanelBeaterDashboard /></PanelBeaterPortalLayout>
          </ProtectedRoute>
        </Route>
        
        <Route path="/panel-beater/claims/:id/quote">
          <ProtectedRoute allowedRoles={["panel_beater", "admin", "platform_super_admin"]}>
            <PanelBeaterPortalLayout><PanelBeaterQuoteSubmission /></PanelBeaterPortalLayout>
          </ProtectedRoute>
        </Route>
        
        {/* Claimant Routes — /portal domain */}
        {/* Legacy claimant routes — all redirect to My Portal (/client) */}
        <Route path="/claimant/dashboard"><RedirectToPortal to="/client" /></Route>
        <Route path="/claimant/submit-claim"><RedirectToPortal to="/client/submit-claim" /></Route>
        <Route path="/claimant/fleet-dashboard"><RedirectToPortal to="/fleet" /></Route>
        <Route path="/claimant/fleet-register"><RedirectToPortal to="/fleet" /></Route>
        <Route path="/claimant/documents"><RedirectToPortal to="/client" /></Route>
        {/* Legacy fleet driver route — redirect to Fleet Management */}
        <Route path="/fleet/driver"><RedirectToPortal to="/fleet" /></Route>
        {/* Claim detail — accessible from My Portal without old shell */}
        <Route path="/claims/:id">
          <ProtectedRoute domain="portal">
            <ClaimantClaimDetail />
          </ProtectedRoute>
        </Route>

        {/* Admin Routes */}
        {/* ── Admin Routes — all wrapped in AdminPortalLayout (Control Tower) ── */}
        <Route path="/admin">
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminPortalLayout title="Admin Overview"><AdminDashboard /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/dashboard">
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminPortalLayout title="Admin Overview"><AdminDashboard /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/tenants/register">
          <ProtectedRoute allowedRoles={["admin", "platform_super_admin"]}>
            <AdminPortalLayout title="Register Tenant"><TenantRegistration /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/tenants/:tenantId/roles">
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminPortalLayout title="Tenant Role Configuration"><TenantRoleConfig /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/tenants">
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminPortalLayout title="Tenant Management"><TenantManagement /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/tier-management">
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminPortalLayout title="Tier Management"><AdminTierManagement /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/revenue">
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminPortalLayout title="Revenue Dashboard"><AdminRevenueDashboard /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/monetization">
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminPortalLayout title="Monetization"><MonetizationDashboard /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/operational-health">
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminPortalLayout title="Operational Health"><OperationalHealthDashboard /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/seed-data">
          <ProtectedRoute allowedRoles={["platform_super_admin", "admin"]}>
            <AdminPortalLayout title="Seed Data"><AdminSeedData /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/observability">
          <ProtectedRoute allowedRoles={["platform_super_admin", "admin"]}>
            <AdminPortalLayout title="Observability"><ObservabilityDashboard /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/integrity-metrics">
          <ProtectedRoute allowedRoles={["platform_super_admin", "admin", "insurer"]}>
            <AdminPortalLayout title="Integrity Metrics"><IntegrityMetricsDashboard /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/physics-accuracy">
          <ProtectedRoute allowedRoles={["platform_super_admin", "admin"]}>
            <AdminPortalLayout title="Physics Accuracy"><PhysicsAccuracyDashboard /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/pipeline-health">
          <ProtectedRoute allowedRoles={["platform_super_admin", "admin", "insurer"]}>
            <AdminPortalLayout title="Pipeline Health"><PipelineHealthDashboard /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/learning">
          <ProtectedRoute allowedRoles={["platform_super_admin", "admin", "insurer"]}>
            <AdminPortalLayout title="Learning Dashboard"><LearningDashboard /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/workflows">
          <ProtectedRoute allowedRoles={["admin", "insurer"]} allowedInsurerRoles={["claims_manager", "executive", "insurer_admin"]}>
            <AdminPortalLayout title="Workflow Templates"><WorkflowTemplates /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/escalation">
          <ProtectedRoute allowedRoles={["admin", "insurer"]}>
            <AdminPortalLayout title="Escalation Queue"><EscalationQueue /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/market-quotes">
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminPortalLayout title="Market Quotes Ingestion"><MarketQuotesIngestion /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/workflow-settings">
          <ProtectedRoute allowedRoles={["admin", "insurer"]} allowedInsurerRoles={["insurer_admin", "executive"]}>
            <AdminPortalLayout title="Workflow Settings"><WorkflowSettings /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        {/* Sprint B — Platform Administration Control Centre */}
        <Route path="/admin/platform-health">
          <ProtectedRoute allowedRoles={["admin", "platform_super_admin"]}>
            <AdminPortalLayout title="Platform Health"><PlatformHealthDashboard /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/engine-monitoring">
          <ProtectedRoute allowedRoles={["admin", "platform_super_admin"]}>
            <AdminPortalLayout title="Engine Monitoring"><IntelligenceEngineMonitoring /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/tenant-monitoring">
          <ProtectedRoute allowedRoles={["admin", "platform_super_admin"]}>
            <AdminPortalLayout title="Tenant Monitoring"><TenantMonitoring /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/panel-beaters">
          <ProtectedRoute allowedRoles={["admin", "platform_super_admin"]}>
            <AdminPortalLayout title="Panel Beater Management"><PanelBeaterManagement /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/activity-timeline">
          <ProtectedRoute allowedRoles={["admin", "platform_super_admin"]}>
            <AdminPortalLayout title="Activity Timeline"><ActivityTimeline /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        
        {/* Phase 1C — Tenant Provisioning */}
        <Route path="/admin/tenant-provisioning">
          <ProtectedRoute allowedRoles={["admin", "platform_super_admin"]}>
            <AdminPortalLayout title="Provision Tenant"><TenantProvisioning /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        {/* Phase 1A — Network Oversight */}
        <Route path="/admin/network">
          <ProtectedRoute allowedRoles={["admin", "platform_super_admin"]}>
            <AdminPortalLayout title="Network Oversight"><NetworkOversight /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        {/* Sprint C — Governance & Audit */}
        <Route path="/admin/audit-log">
          <ProtectedRoute allowedRoles={["admin", "platform_super_admin"]}>
            <AdminPortalLayout title="Audit Log"><AuditLog /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/users">
          <ProtectedRoute allowedRoles={["admin", "platform_super_admin"]}>
            <AdminPortalLayout title="User Management"><UserManagement /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/admin/security-events">
          <ProtectedRoute allowedRoles={["admin", "platform_super_admin"]}>
            <AdminPortalLayout title="Security Events"><SecurityEvents /></AdminPortalLayout>
          </ProtectedRoute>
        </Route>
        {/* Engineering Workspace Routes — /engineer domain (Epic 4.5: EngineerWorkspaceLayout applied) */}
        <Route path="/engineer/dashboard">
          <ProtectedRoute domain="engineer">
            <EngineerWorkspaceLayout><EngineerDashboard /></EngineerWorkspaceLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/engineer/assignments">
          <ProtectedRoute domain="engineer">
            <EngineerWorkspaceLayout><EngineerAssignments /></EngineerWorkspaceLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/engineer/inspections">
          <ProtectedRoute domain="engineer">
            <EngineerWorkspaceLayout><EngineerInspectionList /></EngineerWorkspaceLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/engineer/inspections/:id">
          <ProtectedRoute domain="engineer">
            <EngineerWorkspaceLayout><EngineerInspectionDetail /></EngineerWorkspaceLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/engineer/intelligence">
          <ProtectedRoute allowedRoles={["engineer", "risk_surveyor", "admin", "platform_super_admin"]}>
            <EngineerWorkspaceLayout><EngineeringIntelligenceDashboard /></EngineerWorkspaceLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/engineer/asset-passport">
          <ProtectedRoute allowedRoles={["engineer", "risk_surveyor", "admin", "platform_super_admin"]}>
            <EngineerWorkspaceLayout><AssetPassport /></EngineerWorkspaceLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/engineer/projects">
          <ProtectedRoute domain="engineer">
            <EngineerWorkspaceLayout><EngineerProjects /></EngineerWorkspaceLayout>
          </ProtectedRoute>
        </Route>
        {/* Epic 5-B — Notification Centre (accessible from all portals, protected) */}
        <Route path="/notifications/preferences">
          <ProtectedRoute>
            <NotificationPreferences />
          </ProtectedRoute>
        </Route>
        <Route path="/notifications">
          <ProtectedRoute>
            <NotificationCentre />
          </ProtectedRoute>
        </Route>
        <Route path="/404">
          <NotFound />
        </Route>
        <Route>
          <NotFound />
        </Route>
      </Switch>
    </Suspense>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        switchable
      >
        <TooltipProvider>
          <OnboardingManager>
            <DevRoleBadge />
            <Toaster />
            <Router />
          </OnboardingManager>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
