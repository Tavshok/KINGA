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
import AssessorDashboard from "./pages/AssessorDashboard";
import PanelBeaterDashboard from "./pages/PanelBeaterDashboard";
import PanelBeaterQuoteSubmission from "./pages/PanelBeaterQuoteSubmission";
import ClaimantDashboard from "./pages/ClaimantDashboard";
import SubmitClaim from "./pages/SubmitClaim";
import InsurerClaimsTriage from "./pages/InsurerClaimsTriage";
import InsurerComparisonView from "./pages/InsurerComparisonView";
import AssessorClaimDetails from "./pages/AssessorClaimDetails";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/unauthorized" component={Unauthorized} />
      
      {/* Insurer Routes */}
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
      
      {/* Assessor Routes */}
      <Route path="/assessor/dashboard">
        <ProtectedRoute allowedRoles={["assessor"]}>
          <AssessorDashboard />
        </ProtectedRoute>
      </Route>
      
      <Route path="/assessor/claims/:id">
        <ProtectedRoute allowedRoles={["assessor"]}>
          <AssessorClaimDetails />
        </ProtectedRoute>
      </Route>
      
      {/* Panel Beater Routes */}
      <Route path="/panel-beater/dashboard">
        <ProtectedRoute allowedRoles={["panel_beater"]}>
          <PanelBeaterDashboard />
        </ProtectedRoute>
      </Route>
      
      <Route path="/panel-beater/claims/:id/quote">
        <ProtectedRoute allowedRoles={["panel_beater"]}>
          <PanelBeaterQuoteSubmission />
        </ProtectedRoute>
      </Route>
      
      {/* Claimant Routes */}
      <Route path="/claimant/dashboard">
        <ProtectedRoute allowedRoles={["claimant"]}>
          <ClaimantDashboard />
        </ProtectedRoute>
      </Route>
      
      <Route path="/claimant/submit-claim">
        <ProtectedRoute allowedRoles={["claimant"]}>
          <SubmitClaim />
        </ProtectedRoute>
      </Route>
      
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
