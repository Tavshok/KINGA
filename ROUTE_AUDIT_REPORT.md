# Route Audit Report

**Generated:** 2/19/2026, 2:33:45 AM

## Summary

- **Total Routes:** 70
- **Protected Routes:** 59
- **Public Routes:** 11

### Routes by Role

- **admin**: 56 routes
- **insurer**: 37 routes
- **assessor**: 8 routes
- **claimant**: 6 routes
- **panel_beater**: 5 routes
- **platform_super_admin**: 3 routes
- **user**: 1 routes

## Route Details

| Route | Component | Protected | Allowed Roles | Insurer Roles | Notes |
|-------|-----------|-----------|---------------|---------------|-------|
| `/` | Home | 🔓 | - | - | - |
| `/404` | NotFound | 🔓 | - | - | NOTE: About Theme; - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css; to keep consistent foreground/background color across components; - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook; switchable |
| `/add-assessor` | AddAssessor | 🔒 | insurer, admin | - | - |
| `/admin` | AdminDashboard | 🔒 | admin | - | - |
| `/admin/dashboard` | AdminDashboard | 🔒 | admin | - | - |
| `/admin/market-quotes` | MarketQuotesIngestion | 🔒 | admin | - | - |
| `/admin/monetization` | MonetizationDashboard | 🔒 | admin | - | - |
| `/admin/operational-health` | OperationalHealthDashboard | 🔒 | admin | - | - |
| `/admin/tenants` | TenantManagement | 🔒 | admin | - | - |
| `/admin/tenants/:tenantId/roles` | TenantRoleConfig | 🔒 | admin | - | - |
| `/admin/tenants/register` | TenantRegistration | 🔒 | platform_super_admin | - | - |
| `/admin/tier-management` | AdminTierManagement | 🔒 | admin | - | - |
| `/admin/workflow-settings` | WorkflowSettings | 🔒 | admin, insurer | - | - |
| `/agency` | KingaAgency | 🔓 | - | - | - |
| `/analytics` | AnalyticsHub | 🔒 | insurer, admin | - | - |
| `/assessment-results` | AssessmentResults | 🔒 | insurer, admin | - | - |
| `/assessor` | AssessorDashboard | 🔒 | assessor, admin | - | - |
| `/assessor/claims/:id` | AssessorClaimDetails | 🔒 | assessor, admin | - | - |
| `/assessor/dashboard` | AssessorDashboard | 🔒 | assessor, admin | - | - |
| `/assessor/leaderboard` | AssessorLeaderboard | 🔒 | assessor, admin | - | - |
| `/assessor/performance` | AssessorPerformanceDashboard | 🔒 | assessor, admin | - | - |
| `/assessors` | AssessorList | 🔒 | insurer, admin | - | - |
| `/assign-assessor/:claimId` | AssignAssessor | 🔒 | insurer, admin | - | - |
| `/claimant/dashboard` | ClaimantDashboard | 🔒 | claimant, admin | - | - |
| `/claimant/submit-claim` | SubmitClaim | 🔒 | claimant, admin | - | - |
| `/claims-manager/comparison/:id` | ClaimsManagerComparisonView | 🔒 | insurer, admin | - | RoleGuard: claims_manager |
| `/claims/:id/documents` | ClaimDocuments | 🔒 | insurer, admin, assessor, panel_beater, claimant | - | - |
| `/fleet-management` | FleetManagement | 🔒 | insurer, admin, claimant | - | - |
| `/historical-claims` | HistoricalClaimsPipeline | 🔒 | admin | - | - |
| `/insurance/dashboard` | InsuranceDashboard | 🔓 | - | - | - |
| `/insurance/payments` | PaymentVerification | 🔒 | insurer, admin | - | - |
| `/insurance/quote` | InsuranceQuote | 🔓 | - | - | - |
| `/insurance/quote/:quoteId` | QuoteDetails | 🔓 | - | - | - |
| `/insurer` | InsurerDashboard | 🔒 | insurer, admin | - | - |
| `/insurer-portal` | InsurerRoleSelection | 🔒 | insurer, admin | - | - |
| `/insurer-portal/claims-manager` | ClaimsManagerDashboard | 🔒 | insurer, admin | - | RoleGuard: claims_manager |
| `/insurer-portal/claims-processor` | ClaimsProcessorDashboard | 🔒 | insurer, admin | - | RoleGuard: claims_processor |
| `/insurer-portal/executive` | ExecutiveDashboard | 🔒 | insurer, admin | - | RoleGuard: executive |
| `/insurer-portal/governance` | GovernanceDashboard | 🔓 | - | risk_manager, claims_manager, executive, insurer_admin | RoleGuard: executive, insurer_admin |
| `/insurer-portal/internal-assessor` | InternalAssessorDashboard | 🔒 | insurer, admin | - | RoleGuard: assessor_internal |
| `/insurer-portal/risk-manager` | RiskManagerDashboard | 🔒 | insurer, admin | - | RoleGuard: risk_manager |
| `/insurer-portal/workflow-analytics` | WorkflowAnalyticsDashboard | 🔒 | insurer, admin | - | RoleGuard: executive, risk_manager, claims_manager |
| `/insurer/automation-policies` | AutomationPolicies | 🔒 | insurer, admin | - | - |
| `/insurer/batch-export` | BatchExport | 🔒 | insurer, admin | - | - |
| `/insurer/claims/:claimId/quote-comparison` | InsurerQuoteComparison | 🔒 | insurer, admin | - | - |
| `/insurer/claims/:id` | InsurerClaimDetails | 🔒 | insurer, admin | - | - |
| `/insurer/claims/:id/comparison` | InsurerComparisonView | 🔒 | insurer, admin | - | - |
| `/insurer/claims/triage` | InsurerClaimsTriage | 🔒 | insurer, admin | - | - |
| `/insurer/comparison/:id` | InsurerComparisonView | 🔒 | insurer, admin | - | - |
| `/insurer/dashboard` | InsurerDashboard | 🔒 | insurer, admin | - | - |
| `/insurer/external-assessment` | InsurerExternalAssessmentUpload | 🔒 | insurer, admin | - | - |
| `/insurer/fraud-analytics` | FraudAnalyticsDashboard | 🔒 | insurer, admin | - | - |
| `/insurer/panel-beater-performance` | PanelBeaterPerformanceDashboard | 🔒 | insurer, admin | - | - |
| `/insurer/quote-optimization/:id` | InsurerQuoteComparison | 🔒 | insurer, admin | - | - |
| `/insurer/replay-dashboard` | ReplayDashboard | 🔒 | insurer, admin | - | - |
| `/join-as-assessor` | JoinAsAssessor | 🔓 | - | - | - |
| `/login` | Login | 🔓 | - | - | - |
| `/ml/review/queue` | ReviewQueue | 🔒 | admin | - | - |
| `/new-upload` | NewAssessmentUpload | 🔒 | insurer, admin | - | - |
| `/onboarding` | Onboarding | 🔓 | - | - | - |
| `/panel-beater/claims/:id/quote` | PanelBeaterQuoteSubmission | 🔒 | panel_beater, admin | - | - |
| `/panel-beater/dashboard` | PanelBeaterDashboard | 🔒 | panel_beater, admin | - | - |
| `/platform/claim-trace/:claimId` | PlatformClaimTrace | 🔒 | platform_super_admin | - | - |
| `/platform/overview` | PlatformOverviewDashboard | 🔒 | platform_super_admin | - | - |
| `/portal-hub` | PortalHub | 🔒 | insurer, assessor, panel_beater, claimant, admin | - | - |
| `/processor/upload-documents` | UploadDocuments | 🔒 | insurer, admin | - | - |
| `/role-setup` | RoleSetup | 🔒 | insurer, admin | - | - |
| `/simple-upload` | SimpleUpload | 🔒 | insurer, admin | - | - |
| `/unauthorized` | Unauthorized | 🔓 | - | - | - |
| `/user-diagnostic` | UserDiagnostic | 🔒 | user, admin, insurer, assessor, panel_beater, claimant | - | - |

## Role Access Matrix

Routes accessible by each role:

### admin (56 routes)

- `/add-assessor`
- `/admin`
- `/admin/dashboard`
- `/admin/market-quotes`
- `/admin/monetization`
- `/admin/operational-health`
- `/admin/tenants`
- `/admin/tenants/:tenantId/roles`
- `/admin/tier-management`
- `/admin/workflow-settings`
- `/analytics`
- `/assessment-results`
- `/assessor`
- `/assessor/claims/:id`
- `/assessor/dashboard`
- `/assessor/leaderboard`
- `/assessor/performance`
- `/assessors`
- `/assign-assessor/:claimId`
- `/claimant/dashboard`
- `/claimant/submit-claim`
- `/claims-manager/comparison/:id`
- `/claims/:id/documents`
- `/fleet-management`
- `/historical-claims`
- `/insurance/payments`
- `/insurer`
- `/insurer-portal`
- `/insurer-portal/claims-manager`
- `/insurer-portal/claims-processor`
- `/insurer-portal/executive`
- `/insurer-portal/internal-assessor`
- `/insurer-portal/risk-manager`
- `/insurer-portal/workflow-analytics`
- `/insurer/automation-policies`
- `/insurer/batch-export`
- `/insurer/claims/:claimId/quote-comparison`
- `/insurer/claims/:id`
- `/insurer/claims/:id/comparison`
- `/insurer/claims/triage`
- `/insurer/comparison/:id`
- `/insurer/dashboard`
- `/insurer/external-assessment`
- `/insurer/fraud-analytics`
- `/insurer/panel-beater-performance`
- `/insurer/quote-optimization/:id`
- `/insurer/replay-dashboard`
- `/ml/review/queue`
- `/new-upload`
- `/panel-beater/claims/:id/quote`
- `/panel-beater/dashboard`
- `/portal-hub`
- `/processor/upload-documents`
- `/role-setup`
- `/simple-upload`
- `/user-diagnostic`

### assessor (8 routes)

- `/assessor`
- `/assessor/claims/:id`
- `/assessor/dashboard`
- `/assessor/leaderboard`
- `/assessor/performance`
- `/claims/:id/documents`
- `/portal-hub`
- `/user-diagnostic`

### claimant (6 routes)

- `/claimant/dashboard`
- `/claimant/submit-claim`
- `/claims/:id/documents`
- `/fleet-management`
- `/portal-hub`
- `/user-diagnostic`

### insurer (37 routes)

- `/add-assessor`
- `/admin/workflow-settings`
- `/analytics`
- `/assessment-results`
- `/assessors`
- `/assign-assessor/:claimId`
- `/claims-manager/comparison/:id`
- `/claims/:id/documents`
- `/fleet-management`
- `/insurance/payments`
- `/insurer`
- `/insurer-portal`
- `/insurer-portal/claims-manager`
- `/insurer-portal/claims-processor`
- `/insurer-portal/executive`
- `/insurer-portal/internal-assessor`
- `/insurer-portal/risk-manager`
- `/insurer-portal/workflow-analytics`
- `/insurer/automation-policies`
- `/insurer/batch-export`
- `/insurer/claims/:claimId/quote-comparison`
- `/insurer/claims/:id`
- `/insurer/claims/:id/comparison`
- `/insurer/claims/triage`
- `/insurer/comparison/:id`
- `/insurer/dashboard`
- `/insurer/external-assessment`
- `/insurer/fraud-analytics`
- `/insurer/panel-beater-performance`
- `/insurer/quote-optimization/:id`
- `/insurer/replay-dashboard`
- `/new-upload`
- `/portal-hub`
- `/processor/upload-documents`
- `/role-setup`
- `/simple-upload`
- `/user-diagnostic`

### panel_beater (5 routes)

- `/claims/:id/documents`
- `/panel-beater/claims/:id/quote`
- `/panel-beater/dashboard`
- `/portal-hub`
- `/user-diagnostic`

### platform_super_admin (3 routes)

- `/admin/tenants/register`
- `/platform/claim-trace/:claimId`
- `/platform/overview`

### user (1 routes)

- `/user-diagnostic`

## Protected Route Patterns

### Public Routes (No Authentication Required)

- `/` - Home
- `/404` - NotFound
- `/agency` - KingaAgency
- `/insurance/dashboard` - InsuranceDashboard
- `/insurance/quote` - InsuranceQuote
- `/insurance/quote/:quoteId` - QuoteDetails
- `/insurer-portal/governance` - GovernanceDashboard
- `/join-as-assessor` - JoinAsAssessor
- `/login` - Login
- `/onboarding` - Onboarding
- `/unauthorized` - Unauthorized

### Admin-Only Routes

- `/admin` - AdminDashboard
- `/admin/dashboard` - AdminDashboard
- `/admin/market-quotes` - MarketQuotesIngestion
- `/admin/monetization` - MonetizationDashboard
- `/admin/operational-health` - OperationalHealthDashboard
- `/admin/tenants` - TenantManagement
- `/admin/tenants/:tenantId/roles` - TenantRoleConfig
- `/admin/tier-management` - AdminTierManagement
- `/historical-claims` - HistoricalClaimsPipeline
- `/ml/review/queue` - ReviewQueue

### Multi-Role Routes

- `/add-assessor` - insurer, admin
- `/admin/workflow-settings` - admin, insurer
- `/analytics` - insurer, admin
- `/assessment-results` - insurer, admin
- `/assessor` - assessor, admin
- `/assessor/claims/:id` - assessor, admin
- `/assessor/dashboard` - assessor, admin
- `/assessor/leaderboard` - assessor, admin
- `/assessor/performance` - assessor, admin
- `/assessors` - insurer, admin
- `/assign-assessor/:claimId` - insurer, admin
- `/claimant/dashboard` - claimant, admin
- `/claimant/submit-claim` - claimant, admin
- `/claims-manager/comparison/:id` - insurer, admin
- `/claims/:id/documents` - insurer, admin, assessor, panel_beater, claimant
- `/fleet-management` - insurer, admin, claimant
- `/insurance/payments` - insurer, admin
- `/insurer` - insurer, admin
- `/insurer-portal` - insurer, admin
- `/insurer-portal/claims-manager` - insurer, admin
- `/insurer-portal/claims-processor` - insurer, admin
- `/insurer-portal/executive` - insurer, admin
- `/insurer-portal/internal-assessor` - insurer, admin
- `/insurer-portal/risk-manager` - insurer, admin
- `/insurer-portal/workflow-analytics` - insurer, admin
- `/insurer/automation-policies` - insurer, admin
- `/insurer/batch-export` - insurer, admin
- `/insurer/claims/:claimId/quote-comparison` - insurer, admin
- `/insurer/claims/:id` - insurer, admin
- `/insurer/claims/:id/comparison` - insurer, admin
- `/insurer/claims/triage` - insurer, admin
- `/insurer/comparison/:id` - insurer, admin
- `/insurer/dashboard` - insurer, admin
- `/insurer/external-assessment` - insurer, admin
- `/insurer/fraud-analytics` - insurer, admin
- `/insurer/panel-beater-performance` - insurer, admin
- `/insurer/quote-optimization/:id` - insurer, admin
- `/insurer/replay-dashboard` - insurer, admin
- `/new-upload` - insurer, admin
- `/panel-beater/claims/:id/quote` - panel_beater, admin
- `/panel-beater/dashboard` - panel_beater, admin
- `/portal-hub` - insurer, assessor, panel_beater, claimant, admin
- `/processor/upload-documents` - insurer, admin
- `/role-setup` - insurer, admin
- `/simple-upload` - insurer, admin
- `/user-diagnostic` - user, admin, insurer, assessor, panel_beater, claimant
