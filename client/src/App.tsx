import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Unauthorized from "./pages/Unauthorized";
import ProtectedRoute from "./components/ProtectedRoute";
import InsurerDashboard from "./pages/InsurerDashboard";
import AssessorDashboard from "@/pages/AssessorDashboard";
import AssessorPerformance from "@/pages/AssessorPerformance";
import PanelBeaterDashboard from "./pages/PanelBeaterDashboard";
import PanelBeaterQuoteSubmission from "./pages/PanelBeaterQuoteSubmission";
import ClaimantDashboard from "./pages/ClaimantDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import SubmitClaim from "./pages/SubmitClaim";
import InsurerClaimsTriage from "./pages/InsurerClaimsTriage";
import InsurerClaimDetails from "./pages/InsurerClaimDetails";
import InsurerComparisonView from "./pages/InsurerComparisonView";
import InsurerQuoteComparison from "./pages/InsurerQuoteComparison";
import AssessorPerformanceDashboard from "@/pages/AssessorPerformanceDashboard";
import AssessorLeaderboard from "@/pages/AssessorLeaderboard";
import AdminTierManagement from "@/pages/AdminTierManagement";
import FraudAnalyticsDashboard from "./pages/FraudAnalyticsDashboard";
import BatchExport from "@/pages/BatchExport";
import InsurerExternalAssessmentUpload from "@/pages/InsurerExternalAssessmentUpload";
import AssessorClaimDetails from "./pages/AssessorClaimDetails";
import ClaimDocuments from "./pages/ClaimDocuments";
import PortalHub from "./pages/PortalHub";
import ExecutiveDashboard from "./pages/ExecutiveDashboard";
import ClaimsProcessorDashboard from "./pages/ClaimsProcessorDashboard";
import InternalAssessorDashboard from "./pages/InternalAssessorDashboard";
import RiskManagerDashboard from "./pages/RiskManagerDashboard";
import ClaimsManagerDashboard from "./pages/ClaimsManagerDashboard";
import AssessmentResults from "./pages/AssessmentResults";
import NewAssessmentUpload from "./pages/NewAssessmentUpload";
import SimpleUpload from "./pages/SimpleUpload";
import ClaimsCostTrend from "./pages/analytics/ClaimsCostTrend";
import FraudHeatmap from "./pages/analytics/FraudHeatmap";
import FleetRisk from "./pages/analytics/FleetRisk";
import PanelBeaterPerformance from "./pages/analytics/PanelBeaterPerformance";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/unauthorized" component={Unauthorized} />
      
      {/* Analytics Dashboards */}
      <Route path="/analytics/claims-cost">
        <ProtectedRoute allowedRoles={["insurer", "admin"]}>
          <ClaimsCostTrend />
        </ProtectedRoute>
      </Route>
      <Route path="/analytics/fraud-heatmap">
        <ProtectedRoute allowedRoles={["insurer", "admin"]}>
          <FraudHeatmap />
        </ProtectedRoute>
      </Route>
      <Route path="/analytics/fleet-risk">
        <ProtectedRoute allowedRoles={["insurer", "admin"]}>
          <FleetRisk />
        </ProtectedRoute>
      </Route>
      <Route path="/analytics/panel-beater">
        <ProtectedRoute allowedRoles={["insurer", "admin"]}>
          <PanelBeaterPerformance />
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
      
      {/* Portal Hub - Role Selection */}
      <Route path="/portal-hub">
        <ProtectedRoute allowedRoles={["insurer", "assessor", "panel_beater", "claimant", "admin"]}>
          <PortalHub />
        </ProtectedRoute>
      </Route>
      
      {/* Executive Dashboard */}
      <Route path="/executive">
        <ProtectedRoute allowedRoles={["insurer", "admin"]}>
          <ExecutiveDashboard />
        </ProtectedRoute>
      </Route>
      
      {/* Claims Processor Dashboard */}
      <Route path="/claims-processor">
        <ProtectedRoute allowedRoles={["insurer", "admin"]}>
          <ClaimsProcessorDashboard />
        </ProtectedRoute>
      </Route>
      
      {/* Internal Assessor Dashboard */}
      <Route path="/internal-assessor">
        <ProtectedRoute allowedRoles={["insurer", "admin"]}>
          <InternalAssessorDashboard />
        </ProtectedRoute>
      </Route>
      
      {/* Risk Manager Dashboard */}
      <Route path="/risk-manager">
        <ProtectedRoute allowedRoles={["insurer", "admin"]}>
          <RiskManagerDashboard />
        </ProtectedRoute>
      </Route>
      
      {/* Claims Manager Dashboard */}
      <Route path="/claims-manager">
        <ProtectedRoute allowedRoles={["insurer", "admin"]}>
          <ClaimsManagerDashboard />
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
      
      <Route path="/insurer/claims/:id">
        <ProtectedRoute allowedRoles={["insurer", "admin"]}>
          <InsurerClaimDetails />
        </ProtectedRoute>
      </Route>
          <Route path="/insurer/claims/:claimId/quote-comparison">
        <ProtectedRoute allowedRoles={["insurer", "admin"]}>
          <InsurerQuoteComparison />
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
      
      <Route path="/assessor/performance">
        <ProtectedRoute allowedRoles={["assessor", "admin"]}>
          <AssessorPerformance />
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
      <Route path="/claimant/dashboard" component={() => (
        <ProtectedRoute allowedRoles={["claimant", "admin"]}>
          <ClaimantDashboard />
        </ProtectedRoute>
      )} />
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
      <Route path="/admin/tier-management">
        <ProtectedRoute allowedRoles={["admin"]}>
          <AdminTierManagement />
        </ProtectedRoute>
      </Route>
      
      <Route path="/admin/dashboard" component={() => (
        <ProtectedRoute allowedRoles={["admin"]}>
          <AdminDashboard />
        </ProtectedRoute>
      )} />
      
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
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
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
