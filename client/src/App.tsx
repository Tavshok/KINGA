import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { OnboardingManager } from "./components/OnboardingManager";
import DevRoleBadge from "./components/DevRoleBadge";
import { lazy, Suspense } from "react";
import ProtectedRoute from "./components/ProtectedRoute";
import { RoleGuard } from "./components/RoleGuard";

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
const InsurerClaimsTriage = lazy(() => import("./pages/InsurerClaimsTriage"));
const InsurerClaimDetails = lazy(() => import("./pages/InsurerClaimDetails"));
const InsurerComparisonView = lazy(() => import("./pages/InsurerComparisonView"));
const InsurerQuoteComparison = lazy(() => import("./pages/InsurerQuoteComparison"));
const InsurerExternalAssessmentUpload = lazy(() => import("@/pages/InsurerExternalAssessmentUpload"));
const InsurerRoleSelection = lazy(() => import("./pages/InsurerRoleSelection"));

// Insurer sub-role dashboards
const ExecutiveDashboard = lazy(() => import("./pages/ExecutiveDashboard"));
const GovernanceDashboard = lazy(() => import("./pages/GovernanceDashboard"));
const WorkflowAnalyticsDashboard = lazy(() => import("./pages/WorkflowAnalyticsDashboard"));
const ClaimsProcessorDashboard = lazy(() => import("./pages/ClaimsProcessorDashboard"));
const InternalAssessorDashboard = lazy(() => import("./pages/InternalAssessorDashboard"));
const RiskManagerDashboard = lazy(() => import("./pages/RiskManagerDashboard"));
const ClaimsManagerDashboard = lazy(() => import("./pages/ClaimsManagerDashboard"));
const ClaimsManagerComparisonView = lazy(() => import("./pages/ClaimsManagerComparisonView"));
const WorkflowSettings = lazy(() => import("./pages/WorkflowSettings"));
const MonetizationDashboard = lazy(() => import("./pages/MonetizationDashboard"));
const OperationalHealthDashboard = lazy(() => import("./pages/OperationalHealthDashboard"));
const PlatformOverviewDashboard = lazy(() => import("./pages/PlatformOverviewDashboard"));
const PlatformClaimTrace = lazy(() => import("./pages/PlatformClaimTrace"));

// Assessor pages
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
const SubmitClaim = lazy(() => import("./pages/SubmitClaim"));

// Admin pages
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminTierManagement = lazy(() => import("@/pages/AdminTierManagement"));
const AdminSeedData = lazy(() => import("./pages/AdminSeedData"));
const ObservabilityDashboard = lazy(() => import("./pages/admin/ObservabilityDashboard"));
const TenantManagement = lazy(() => import("./pages/admin/TenantManagement"));
const TenantRoleConfig = lazy(() => import("./pages/admin/TenantRoleConfig"));
const TenantRegistration = lazy(() => import("./pages/admin/TenantRegistration"));
const MarketQuotesIngestion = lazy(() => import("./pages/MarketQuotesIngestion"));
const KingaAgency = lazy(() => import("./pages/KingaAgency"));

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

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/login" component={Login} />
        <Route path="/onboarding" component={Onboarding} />
        <Route path="/unauthorized" component={Unauthorized} />
        
        {/* Analytics Dashboards */}
        <Route path="/analytics">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
            <AnalyticsHub />
          </ProtectedRoute>
        </Route>
        
        {/* Monetization Dashboard (Super-Admin Only) */}
        <Route path="/admin/monetization">
          <ProtectedRoute allowedRoles={["admin"]}>
            <MonetizationDashboard />
          </ProtectedRoute>
        </Route>
        
        {/* Operational Health Dashboard (Super-Admin Only) */}
        <Route path="/admin/operational-health">
          <ProtectedRoute allowedRoles={["admin"]}>
            <OperationalHealthDashboard />
          </ProtectedRoute>
        </Route>
        
        {/* Platform Super Admin Observability */}
        <Route path="/platform/overview">
          <ProtectedRoute allowedRoles={["platform_super_admin"]}>
            <PlatformOverviewDashboard />
          </ProtectedRoute>
        </Route>
        
        <Route path="/platform/claim-trace/:claimId">
          <ProtectedRoute allowedRoles={["platform_super_admin"]}>
            <PlatformClaimTrace />
          </ProtectedRoute>
        </Route>
        {/* Assessment Results */}
        <Route path="/assessment-results">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
            <AssessmentResults />
          </ProtectedRoute>
        </Route>
        
        {/* New Assessment Upload (Debug) */}
        <Route path="/new-upload">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
            <NewAssessmentUpload />
          </ProtectedRoute>
        </Route>
        
        {/* Simple Upload (NEW SYSTEM) */}
        <Route path="/simple-upload">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
            <SimpleUpload />
          </ProtectedRoute>
        </Route>
        
        {/* Role Setup - Quick Configuration */}
        <Route path="/role-setup">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
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
          <ProtectedRoute allowedRoles={["insurer", "assessor", "panel_beater", "claimant", "admin"]}>
            <PortalHub />
          </ProtectedRoute>
        </Route>
        
        {/* Insurer Portal - Role Selection */}
        <Route path="/insurer-portal">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
            <InsurerRoleSelection />
          </ProtectedRoute>
        </Route>
        
        {/* Insurer Sub-Role Dashboards */}
        <Route path="/insurer-portal/workflow-analytics">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
            <RoleGuard allowedRoles={["executive", "risk_manager", "claims_manager"]}>
              <WorkflowAnalyticsDashboard />
            </RoleGuard>
          </ProtectedRoute>
        </Route>

        <Route path="/insurer-portal/executive">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
            <RoleGuard allowedRoles={["executive"]}>
              <ExecutiveDashboard />
            </RoleGuard>
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer-portal/governance">
          <ProtectedRoute 
            allowedRoles={["insurer", "admin"]}
            allowedInsurerRoles={["risk_manager", "claims_manager", "executive", "insurer_admin"]}
          >
            <RoleGuard allowedRoles={["executive", "insurer_admin"]}>
              <GovernanceDashboard />
            </RoleGuard>
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer-portal/claims-processor">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
            <RoleGuard allowedRoles={["claims_processor"]}>
              <ClaimsProcessorDashboard />
            </RoleGuard>
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer-portal/internal-assessor">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
            <RoleGuard allowedRoles={["assessor_internal"]}>
              <InternalAssessorDashboard />
            </RoleGuard>
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer-portal/risk-manager">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
            <RoleGuard allowedRoles={["risk_manager"]}>
              <RiskManagerDashboard />
            </RoleGuard>
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer-portal/claims-manager">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
            <RoleGuard allowedRoles={["claims_manager"]}>
              <ClaimsManagerDashboard />
            </RoleGuard>
          </ProtectedRoute>
        </Route>
        
        <Route path="/claims-manager/comparison/:id">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
            <RoleGuard allowedRoles={["claims_manager"]}>
              <ClaimsManagerComparisonView />
            </RoleGuard>
          </ProtectedRoute>
        </Route>
        
        {/* Insurer Routes */}
        <Route path="/insurer">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
            <InsurerDashboard />
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer/dashboard">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
            <InsurerDashboard />
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer/claims/triage">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
            <InsurerClaimsTriage />
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer/claims/:id/comparison">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
            <InsurerComparisonView />
          </ProtectedRoute>
        </Route>
        
        {/* Alternative comparison route for backward compatibility */}
        <Route path="/insurer/comparison/:id">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
            <InsurerComparisonView />
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer/claims/:claimId/quote-comparison">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
            <InsurerQuoteComparison />
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer/panel-beater-performance">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
            <PanelBeaterPerformanceDashboard />
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer/claims/:id">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
            <InsurerClaimDetails />
          </ProtectedRoute>
        </Route>
        <Route path="/insurer/quote-optimization/:id">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
            <InsurerQuoteComparison />
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer/fraud-analytics">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
            <FraudAnalyticsDashboard />
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer/batch-export">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
            <BatchExport />
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer/external-assessment">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
            <InsurerExternalAssessmentUpload />
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer/automation-policies">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
            <AutomationPolicies />
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurer/replay-dashboard">
          <ProtectedRoute allowedRoles={["insurer", "admin"]} insurerRoles={["insurer_admin", "executive", "claims_manager"]}>
            <ReplayDashboard />
          </ProtectedRoute>
        </Route>
        
        {/* Legacy fleet management route — kept for backward compatibility */}
        <Route path="/fleet-management">
          <ProtectedRoute allowedRoles={["insurer", "admin", "claimant"]}>
            <FleetManagement />
          </ProtectedRoute>
        </Route>

        {/* Standalone fleet route — any authenticated user can access */}
        <Route path="/fleet">
          <ProtectedRoute>
            <FleetManagement />
          </ProtectedRoute>
        </Route>

        <Route path="/fleet/:rest*">
          <ProtectedRoute>
            <FleetManagement />
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurance/quote">
          <InsuranceQuote />
        </Route>

        <Route path="/agency">
          <ProtectedRoute allowedRoles={["agency", "admin"]}>
            <KingaAgency />
          </ProtectedRoute>
        </Route>
        
        <Route path="/insurance/quote/:quoteId">
          <QuoteDetails />
        </Route>
        
        <Route path="/insurance/payments">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
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
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
            <AddAssessor />
          </ProtectedRoute>
        </Route>
        
        <Route path="/assessors">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
            <AssessorList />
          </ProtectedRoute>
        </Route>
        
        <Route path="/assign-assessor/:claimId">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
            <AssignAssessor />
          </ProtectedRoute>
        </Route>
        
        {/* Public Marketplace Registration */}
        <Route path="/join-as-assessor" component={JoinAsAssessor} />
        
        {/* Document Intelligence Pipeline */}
        <Route path="/processor/upload-documents">
          <ProtectedRoute allowedRoles={["insurer", "admin"]}>
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
          <ProtectedRoute allowedRoles={["assessor", "admin"]}>
            <AssessorDashboard />
          </ProtectedRoute>
        </Route>
        
        <Route path="/assessor/dashboard">
          <ProtectedRoute allowedRoles={["assessor", "admin"]}>
            <AssessorDashboard />
          </ProtectedRoute>
        </Route>
        
        <Route path="/assessor/claims/:id">
          <ProtectedRoute allowedRoles={["assessor", "admin"]}>
            <AssessorClaimDetails />
          </ProtectedRoute>
        </Route>
        
        <Route path="/assessor/performance">
          <ProtectedRoute allowedRoles={["assessor", "admin"]}>
            <AssessorPerformanceDashboard />
          </ProtectedRoute>
        </Route>
        <Route path="/assessor/leaderboard">
          <ProtectedRoute allowedRoles={["assessor", "admin"]}>
            <AssessorLeaderboard />
          </ProtectedRoute>
        </Route>
        
        {/* Panel Beater Routes */}
        <Route path="/panel-beater/dashboard">
          <ProtectedRoute allowedRoles={["panel_beater", "admin"]}>
            <PanelBeaterDashboard />
          </ProtectedRoute>
        </Route>
        
        <Route path="/panel-beater/claims/:id/quote">
          <ProtectedRoute allowedRoles={["panel_beater", "admin"]}>
            <PanelBeaterQuoteSubmission />
          </ProtectedRoute>
        </Route>
        
        {/* Claimant Routes */}
        <Route path="/claimant/dashboard">
          <ProtectedRoute allowedRoles={["claimant", "admin"]}>
            <ClaimantDashboard />
          </ProtectedRoute>
        </Route>
        <Route path="/claimant/submit-claim">
          <ProtectedRoute allowedRoles={["claimant", "admin"]}>
            <SubmitClaim />
          </ProtectedRoute>
        </Route>

        {/* Admin Routes */}
        <Route path="/admin">
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminDashboard />
          </ProtectedRoute>
        </Route>
        
        <Route path="/admin/tenants">
          <ProtectedRoute allowedRoles={["admin"]}>
            <TenantManagement />
          </ProtectedRoute>
        </Route>
        
        <Route path="/admin/tenants/:tenantId/roles">
          <ProtectedRoute allowedRoles={["admin"]}>
            <TenantRoleConfig />
          </ProtectedRoute>
        </Route>
        
        <Route path="/admin/tenants/register">
          <ProtectedRoute allowedRoles={["platform_super_admin"]}>
            <TenantRegistration />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/tier-management">
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminTierManagement />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/seed-data">
          <ProtectedRoute allowedRoles={["platform_super_admin"]}>
            <AdminSeedData />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/observability">
          <ProtectedRoute allowedRoles={["platform_super_admin"]}>
            <ObservabilityDashboard />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/market-quotes">
          <ProtectedRoute allowedRoles={["admin"]}>
            <MarketQuotesIngestion />
          </ProtectedRoute>
        </Route>
        
        <Route path="/admin/dashboard">
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminDashboard />
          </ProtectedRoute>
        </Route>
        
        <Route path="/admin/workflow-settings">
          <ProtectedRoute allowedRoles={["admin", "insurer"]} insurerRoles={["insurer_admin", "executive"]}>
            <WorkflowSettings />
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
        // switchable
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
