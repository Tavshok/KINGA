# KINGA tRPC API Reference
**Author:** Tavonga Shoko, Lead Engineer
**Generated:** August 2026

This document lists every tRPC procedure in the KINGA platform.
All procedures are accessible via `trpc.<namespace>.<procedure>` in the client.

---

## `adminRouter`

**File:** `server/routers/admin.ts`

| Procedure | Auth | Type |
|---|---|---|
| `createTenant` | Super Admin | ? |
| `getAllTenants` | Super Admin | Query |
| `sendInvitation` | Super Admin | ? |
| `getInvitationByToken` | Public | ? |
| `acceptInvitation` | Public | ? |
| `bulkSeedClaims` | Super Admin | ? |
| `bulkGenerateAiAssessments` | Super Admin | ? |
| `seedProductionEcosystem` | Super Admin | Mutation |
| `getObservabilityMetrics` | Super Admin | Query |
| `getPipelineHealth` | Protected | ? |
| `serverDiagnostics` | Super Admin | Query |
| `collectObservabilityMetrics` | Super Admin | Mutation |
| `getPendingRegistrations` | Protected | Query |
| `deactivateUser` | Protected | ? |
| `updateUserRole` | Protected | ? |
| `getPlatformHealth` | Super Admin | Query |
| `updatePanelBeaterStatus` | Super Admin | ? |
| `getPanelBeatersAdmin` | Super Admin | Query |
| `getActivityTimeline` | Super Admin | ? |
| `getAuditLog` | Super Admin | ? |
| `getSecurityEvents` | Super Admin | ? |
| `getUsersAdmin` | Super Admin | ? |
| `getInsurerNetwork` | Super Admin | Query |
| `getAgencyNetwork` | Super Admin | Query |
| `getAssessorPool` | Super Admin | Query |
| `getFleetOperatorRegistry` | Super Admin | Query |
| `getEngineeringRegistry` | Super Admin | Query |

## `agencyBrokerRouter`

**File:** `server/routers/agency-broker.ts`

| Procedure | Auth | Type |
|---|---|---|
| `respondToQuote` | Protected | Mutation |
| `createFleetQuoteRequest` | Protected | ? |
| `listFleetQuoteRequests` | Protected | ? |
| `listInsurerFleetRFQs` | Protected | ? |

## `agencyRouter`

**File:** `server/routers/agency.ts`

| Procedure | Auth | Type |
|---|---|---|
| `submitQuotation` | Protected | ? |
| `myQuotations` | Protected | Query |
| `allQuotations` | Protected | ? |
| `updateQuotation` | Protected | ? |
| `myPolicies` | Protected | Query |
| `allPolicies` | Protected | ? |
| `requestRenewal` | Protected | ? |
| `uploadDocument` | Protected | ? |
| `getDocuments` | Protected | ? |
| `getVehicleRiskIntelligence` | Protected | ? |
| `getVehicleForensics` | Protected | ? |

## `aiAnalysisRouter`

**File:** `server/routers/ai-analysis.ts`

| Procedure | Auth | Type |
|---|---|---|
| `triggerRerun` | Protected | ? |
| `recalculateConfidence` | Protected | ? |
| `triggerRoutingReevaluation` | Protected | ? |
| `getVersionHistory` | Protected | ? |
| `getRateLimitStatus` | Protected | ? |

## `aiAssessmentsRouter`

**File:** `server/routers/ai-assessments-core.ts`

| Procedure | Auth | Type |
|---|---|---|
| `byClaim` | Protected | ? |
| `historicalBenchmarks` | Protected | ? |
| `all` | Protected | Query |
| `getEnforcement` | Protected | ? |
| `saveSnapshot` | Protected | ? |
| `getLatestSnapshot` | Protected | ? |
| `replayDecision` | Protected | ? |
| `getLifecycle` | Protected | ? |
| `markReviewed` | Protected | ? |
| `finaliseDecision` | Protected | ? |
| `lockDecision` | Protected | ? |
| `getAuditLog` | Protected | ? |
| `getAuditExport` | Protected | ? |
| `validateAuditExport` | Protected | ? |
| `runShadowScan` | Protected | Mutation |
| `getShadowObservation` | Protected | ? |
| `getAllShadowObservations` | Protected | Query |
| `generateShadowReport` | Protected | ? |
| `generateAllShadowReports` | Protected | ? |
| `getReplayLogs` | Protected | ? |
| `validate` | Protected | ? |
| `getSnapshots` | Protected | ? |
| `pushReportToRole` | Protected | ? |
| `getSharedRoles` | Protected | ? |
| `getSharedWithMe` | Protected | Query |
| `resolvePdfPhotoUrls` | Protected | ? |

## `aiReanalysisRouter`

**File:** `server/routers/ai-reanalysis.ts`

| Procedure | Auth | Type |
|---|---|---|
| `reRunAiAnalysis` | Protected | ? |
| `getVersionHistory` | Protected | ? |
| `compareVersions` | Protected | ? |
| `getReanalysisStats` | Protected | ? |

## `approvalRouter`

**File:** `server/routers/approval.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getTemplates` | Protected | Query |
| `getDefaultTemplate` | Protected | Query |
| `createTemplate` | Protected | ? |
| `updateTemplate` | Protected | ? |
| `getClaimApprovalStatus` | Protected | ? |
| `submitApprovalDecision` | Protected | ? |
| `getApprovalHistory` | Protected | ? |
| `getApprovalQueue` | Protected | ? |
| `getWorkflowSummary` | Protected | Query |

## `assessorOnboardingRouter`

**File:** `server/routers/assessor-onboarding.ts`

| Procedure | Auth | Type |
|---|---|---|
| `addInsurerOwnedAssessor` | Protected | ? |
| `registerMarketplaceAssessor` | Protected | ? |
| `getMyProfile` | Protected | Query |
| `updateProfile` | Protected | ? |
| `enableMarketplace` | Protected | ? |
| `listInsurerAssessors` | Protected | Query |
| `searchMarketplace` | Protected | ? |

## `assessorsRouter`

**File:** `server/routers/assessors-core.ts`

| Procedure | Auth | Type |
|---|---|---|
| `list` | Protected | Query |
| `getPerformanceMetrics` | Protected | ? |
| `getPerformanceDashboard` | Protected | Query |
| `getLeaderboard` | Protected | Query |
| `getMyPerformanceTrend` | Protected | ? |
| `getMyInsurerRelationships` | Protected | Query |

## `assetPassportRouter`

**File:** `server/routers/asset-passport.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getPassport` | Protected | ? |
| `getInspectionHistory` | Protected | ? |
| `getTimeline` | Protected | ? |
| `getRiskProfile` | Protected | ? |
| `listAssets` | Protected | ? |
| `getMaintenanceHistory` | Protected | ? |

## `auditRouter`

**File:** `server/routers/audit.ts`

| Procedure | Auth | Type |
|---|---|---|
| `logAccessDenial` | Protected | ? |

## `authRouter`

**File:** `server/routers/auth-core.ts`

| Procedure | Auth | Type |
|---|---|---|
| `me` | Public | Query |
| `logout` | Public | Mutation |
| `setInsurerRole` | Protected | ? |
| `switchRole` | Protected | ? |
| `addSecondaryRole` | Protected | ? |

## `automationPoliciesRouter`

**File:** `server/routers/automation-policies.ts`

| Procedure | Auth | Type |
|---|---|---|
| `createPolicy` | Protected | ? |
| `getActivePolicy` | Protected | Query |
| `getPolicyHistory` | Protected | Query |
| `updatePolicy` | Protected | ? |

## `claimCompletionRouter`

**File:** `server/routers/claim-completion.ts`

| Procedure | Auth | Type |
|---|---|---|
| `completeClaim` | Protected | ? |
| `reopenClaim` | Protected | ? |

## `claimReportsRouter`

**File:** `server/routers/claim-reports-core.ts`

| Procedure | Auth | Type |
|---|---|---|
| `validate` | Protected | ? |
| `generate` | Protected | ? |
| `createSnapshot` | Protected | ? |
| `generatePdfFromSnapshot` | Protected | ? |
| `getInteractiveReport` | Protected | ? |
| `sendEmail` | Protected | ? |
| `getAccessHistory` | Protected | ? |

## `claimCommentsRouter`

**File:** `server/routers/claimComments.ts`

| Procedure | Auth | Type |
|---|---|---|
| `send` | Protected | ? |
| `list` | Protected | ? |
| `myNotifications` | Protected | ? |
| `unreadCount` | Protected | Query |
| `markRead` | Protected | ? |
| `markAllRead` | Protected | Mutation |
| `resolve` | Protected | ? |
| `statusTemplates` | Protected | Query |

## `claimsRouter`

**File:** `server/routers/claims-core.ts`

| Procedure | Auth | Type |
|---|---|---|
| `extractFromDocument` | Protected | ? |
| `createOnBehalfOf` | Protected | ? |
| `submit` | Protected | ? |
| `myClaims` | Protected | Query |
| `searchByIdentifier` | Protected | ? |
| `myAssignments` | Protected | Query |
| `byAssessor` | Protected | ? |
| `myQuoteRequests` | Protected | Query |
| `myQuoteHistory` | Protected | Query |
| `myPanelBeaterProfile` | Protected | Query |
| `getMyAnalytics` | Protected | ? |
| `getMyPerformanceTrend` | Protected | ? |
| `byStatus` | Insurer Domain | ? |
| `allForTenant` | Insurer Domain | Query |
| `getActiveClaims` | Insurer Domain | ? |
| `getFraudAlerts` | Insurer Domain | ? |
| `getDashboardStats` | Insurer Domain | ? |
| `getEscalations` | Insurer Domain | ? |
| `getFinancialDecisionQueue` | Insurer Domain | ? |
| `getManagerOverview` | Insurer Domain | ? |
| `getRiskPortfolioAnalytics` | Insurer Domain | ? |
| `getFraudRuleAccuracy` | Insurer Domain | Query |
| `getGeographicRiskClusters` | Insurer Domain | ? |
| `getExecutiveSummary` | Insurer Domain | ? |
| `getProcessorQueue` | Insurer Domain | ? |
| `getTierConfig` | Insurer Domain | Query |
| `updateTierConfig` | Protected | ? |
| `getById` | Protected | ? |
| `assignToAssessor` | Insurer Domain | ? |
| `verifyPolicy` | Protected | ? |
| `triggerAiAssessment` | Protected | ? |
| `resetStuckClaim` | Protected | ? |
| `debugPipeline` | Protected | ? |
| `approveClaim` | Protected | ? |
| `sendBackClaim` | Protected | ? |
| `closeForProcessing` | Protected | ? |
| `escalateClaim` | Protected | ? |
| `reopenClaim` | Protected | ? |
| `financialApproval` | Protected | ? |
| `getPanelBeaterChoices` | Protected | ? |
| `updateCurrency` | Protected | ? |
| `getCurrencyHistory` | Protected | ? |
| `acceptConstraint` | Protected | ? |
| `getConstraintOverrides` | Protected | ? |
| `saveAdjusterSignOff` | Protected | ? |
| `getAdjusterSignOff` | Protected | ? |
| `acceptSettlement` | Protected | ? |
| `initiateDispute` | Protected | ? |
| `getDisputeInfo` | Protected | ? |
| `authorizePayment` | Protected | ? |
| `rejectClaim` | Protected | ? |
| `insurerOverride` | Protected | ? |

## `claimsManagerRouter`

**File:** `server/routers/claims-manager.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getQueueHealthMatrix` | Insurer Domain | Query |
| `getAttentionRequired` | Insurer Domain | Query |
| `getApprovalWorkbenchMetrics` | Insurer Domain | Query |
| `getCapacityForecast` | Insurer Domain | Query |
| `getWorkloadDistribution` | Insurer Domain | Query |
| `getSendBackAnalytics` | Insurer Domain | Query |

## `commentsRouter`

**File:** `server/routers/comments.ts`

| Procedure | Auth | Type |
|---|---|---|
| `addComment` | Protected | ? |
| `addSectionComment` | Protected | ? |
| `listSectionComments` | Protected | ? |
| `resolveAnnotation` | Protected | ? |
| `listComments` | Protected | ? |
| `deleteComment` | Protected | ? |

## `complianceRouter`

**File:** `server/routers/compliance.ts`

| Procedure | Auth | Type |
|---|---|---|
| `generateReport` | Protected | ? |
| `getScheduledReports` | Protected | Query |

## `crossClaimIntelligenceRouter`

**File:** `server/routers/cross-claim-intelligence.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getByClaim` | Protected | ? |
| `getFraudFeed` | Protected | ? |
| `getBySignalType` | Protected | ? |
| `getStats` | Protected | ? |
| `dismissSignal` | Protected | ? |
| `getTopEntities` | Protected | ? |
| `runForClaim` | Protected | ? |

## `decisionRouter`

**File:** `server/routers/decision.ts`

| Procedure | Auth | Type |
|---|---|---|
| `evaluateClaimDecision` | Protected | Mutation |
| `evaluateClaimBatch` | Protected | ? |
| `getDecisionSummary` | Protected | ? |
| `checkContradictions` | Protected | ? |
| `getContradictionStats` | Protected | ? |
| `generateDecisionTrace` | Protected | ? |
| `getDecisionTrace` | Protected | ? |
| `checkReportReadiness` | Protected | ? |
| `getReadinessSummary` | Protected | ? |
| `generateClaimExplanation` | Protected | ? |
| `getClaimExplanation` | Protected | ? |
| `routeClaim` | Protected | ? |
| `routeClaimById` | Protected | ? |
| `getEscalationSummary` | Protected | ? |

## `documentIngestionRouter`

**File:** `server/routers/document-ingestion.ts`

| Procedure | Auth | Type |
|---|---|---|
| `uploadDocuments` | Protected | ? |
| `getIngestionBatches` | Protected | ? |
| `getBatchDocuments` | Protected | ? |
| `getDocumentDetails` | Protected | ? |
| `classifyDocument` | Protected | ? |
| `approveDocument` | Protected | ? |

## `driverRegistryRouter`

**File:** `server/routers/driver-registry.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getById` | Protected | ? |
| `getByLicense` | Protected | ? |
| `search` | Protected | ? |
| `getClaimHistory` | Protected | ? |
| `getClaimDrivers` | Protected | ? |
| `listHighRisk` | Protected | ? |
| `stats` | Protected | Query |
| `flagStagedAccident` | Protected | ? |
| `updateDriver` | Protected | ? |
| `list` | Protected | ? |

## `exceptionIntelligenceRouter`

**File:** `server/routers/exception-intelligence.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getExceptionQueue` | Protected | ? |
| `getExceptionAggregates` | Protected | ? |
| `getSystemDriftReport` | Protected | ? |
| `getActionableRecommendations` | Protected | ? |

## `fleetAccountsRouter`

**File:** `server/routers/fleet-accounts.ts`

| Procedure | Auth | Type |
|---|---|---|
| `createAccount` | Protected | ? |
| `listMyAccounts` | Protected | ? |
| `getAccount` | Protected | ? |
| `updateAccount` | Protected | ? |
| `linkToInsurer` | Protected | ? |
| `linkToAgency` | Protected | ? |
| `unlinkPartners` | Protected | ? |
| `setStatus` | Protected | ? |
| `createOrFindByCompanyName` | Protected | ? |
| `getClaimsForAccount` | Protected | ? |
| `registerAsFleetManager` | Protected | ? |
| `getMyRegistrationStatus` | Protected | Query |
| `listPendingRequests` | Protected | ? |
| `approveFleetManagerRequest` | Protected | ? |
| `rejectFleetManagerRequest` | Protected | ? |
| `flagClaimForReview` | Protected | ? |
| `getFraudFlaggedVehicles` | Protected | ? |
| `getFleetCostBreakdown` | Protected | ? |
| `getFleetCostTrends` | Protected | Query |
| `addFuelRecord` | Protected | ? |
| `listFuelRecords` | Protected | ? |
| `getFuelSummary` | Protected | Query |
| `addLicensingRecord` | Protected | ? |
| `listLicensingRecords` | Protected | ? |
| `getExpiringLicenses` | Protected | ? |
| `addVehicle` | Protected | ? |
| `listDrivers` | Protected | ? |
| `addDriver` | Protected | ? |
| `listMaintenanceRecords` | Protected | ? |
| `addMaintenanceRecord` | Protected | ? |
| `getMaintenanceAlerts` | Protected | ? |
| `getMaintenanceSummary` | Protected | Query |

## `fleetCoreRouter`

**File:** `server/routers/fleet-core.ts`

| Procedure | Auth | Type |
|---|---|---|
| `createFleet` | Protected | ? |
| `getMyFleets` | Protected | Query |
| `getFleetById` | Protected | ? |
| `onboardFleetDriver` | Protected | ? |
| `registerVehicle` | Protected | ? |
| `getFleetVehicles` | Protected | ? |
| `getMyVehicles` | Protected | Query |
| `downloadImportTemplate` | Protected | Mutation |
| `bulkImportVehicles` | Protected | ? |
| `exportFleetToExcel` | Protected | ? |
| `exportFleetToCSV` | Protected | ? |
| `getVehicleById` | Protected | ? |
| `updateVehicle` | Protected | ? |
| `deleteVehicle` | Protected | ? |
| `getMaintenanceAlerts` | Protected | ? |
| `getComplianceScore` | Protected | ? |
| `createMaintenanceSchedule` | Protected | ? |
| `recordMaintenanceService` | Protected | ? |
| `getMaintenanceHistory` | Protected | ? |
| `getVehicleMaintenanceSchedules` | Protected | ? |
| `updateVehicleMileage` | Protected | ? |
| `createServiceRequest` | Protected | ? |
| `getServiceRequests` | Protected | ? |
| `submitServiceQuote` | Protected | ? |
| `getServiceQuotes` | Protected | ? |
| `acceptServiceQuote` | Protected | ? |
| `registerServiceProvider` | Protected | ? |
| `getServiceProviders` | Protected | Query |
| `completeServiceRequest` | Protected | ? |

## `globalSearchRouter`

**File:** `server/routers/global-search.ts`

| Procedure | Auth | Type |
|---|---|---|
| `search` | Protected | ? |
| `recordClick` | Protected | ? |
| `getRecentSearches` | Protected | Query |
| `getAnalytics` | Protected | ? |
| `clearHistory` | Protected | Mutation |

## `governanceRouter`

**File:** `server/routers/governance.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getGovernanceSummary` | Protected | Query |
| `getExecutiveOverrides` | Protected | ? |
| `getSegregationViolations` | Protected | ? |
| `getOverrideFrequencyTrend` | Protected | Query |
| `getSegregationViolationHeatmap` | Protected | Query |
| `getRoleChangeTrend` | Protected | Query |
| `getInvolvementConflictDistribution` | Protected | Query |
| `getExceptionsRegister` | Protected | ? |
| `getOverrideHistory` | Protected | ? |

## `historicalClaimsRouter`

**File:** `server/routers/historical-claims.ts`

| Procedure | Auth | Type |
|---|---|---|
| `uploadAndProcess` | Protected | ? |
| `listClaims` | Protected | ? |
| `getClaimDetails` | Protected | ? |
| `captureGroundTruth` | Protected | ? |
| `updateRepairItem` | Protected | ? |
| `updateClaim` | Protected | ? |
| `getAnalyticsSummary` | Protected | Query |
| `getVarianceDistribution` | Protected | ? |
| `getAssessorBenchmarks` | Protected | Query |
| `getVehicleCostPatterns` | Protected | Query |

## `insuranceCoreRouter`

**File:** `server/routers/insurance-core.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getVehicleValuation` | Public | ? |
| `requestQuote` | Public | ? |
| `getQuote` | Public | ? |
| `submitPaymentProof` | Public | ? |
| `getPendingPayments` | Protected | Query |
| `verifyPayment` | Protected | ? |
| `rejectPayment` | Protected | ? |
| `getMyPolicies` | Protected | Query |
| `getMyQuotes` | Protected | Query |
| `downloadPolicyPDF` | Protected | ? |

## `insurancePhase7Router`

**File:** `server/routers/insurance-phase7.ts`

| Procedure | Auth | Type |
|---|---|---|
| `submitValuationRequest` | Public | ? |
| `getTeaserReport` | Public | ? |
| `getMyRequests` | Protected | Query |
| `unlockReportOnPolicyIssuance` | Protected | ? |
| `getValuationRequests` | Protected | ? |
| `assignInspector` | Protected | ? |
| `sendQuoteToClient` | Protected | ? |
| `acceptQuote` | Protected | ? |
| `sendDocumentToClient` | Protected | ? |
| `submitRequest` | Protected | ? |
| `getMyDocuments` | Protected | Query |

## `intakeGateRouter`

**File:** `server/routers/intake-gate.ts`

| Procedure | Auth | Type |
|---|---|---|
| `assignToProcessor` | Protected | ? |
| `getIntakeQueue` | Protected | Query |
| `getAvailableProcessors` | Protected | Query |
| `flagForEscalation` | Protected | ? |
| `overrideIntakeGate` | Protected | ? |
| `getAutoAssignStats` | Protected | Query |

## `crossModuleIntelligenceRouter`

**File:** `server/routers/intelligence-platform.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getVehicleSignals` | Protected | ? |
| `getDriverSignals` | Protected | ? |
| `getPlatformSignalSummary` | Protected | Query |
| `getSignalFeed` | Protected | ? |
| `getFleetSummary` | Protected | ? |
| `getVehicleRiskLeaderboard` | Protected | ? |
| `getDriverRiskLeaderboard` | Protected | ? |
| `listFleets` | Protected | Query |
| `getIncidentHistory` | Protected | ? |
| `getSnapshot` | Protected | Query |
| `getPerformanceTrends` | Protected | ? |
| `getSummary` | Protected | ? |
| `getInspectionTrends` | Protected | ? |
| `getMeasurementAnalytics` | Protected | ? |
| `getObservationAnalytics` | Protected | ? |
| `getRecentInspections` | Protected | ? |
| `getPhysicsQualityMetrics` | Protected | ? |
| `getExposureSummary` | Protected | ? |
| `getFraudSummary` | Protected | ? |
| `getOperationalMetrics` | Protected | ? |
| `getFinancialMetrics` | Protected | ? |
| `getRiskConcentration` | Protected | ? |
| `getPortfolioSummary` | Protected | ? |
| `getSnapshot` | Protected | Query |
| `getFleetExposureSummary` | Protected | Query |
| `getEngineeringRiskSummary` | Protected | Query |
| `getVehicleTimeline` | Protected | ? |
| `getClaimTimeline` | Protected | ? |
| `getPlatformActivityFeed` | Protected | ? |
| `getEntityTimeline` | Protected | ? |
| `getWorkflowActivity` | Protected | ? |
| `getVehicleRenewalRisk` | Protected | ? |
| `getDriverFraudPropensity` | Protected | ? |
| `getFleetRiskTrajectory` | Protected | ? |
| `getPortfolioLossForecast` | Protected | ? |
| `getBatchScores` | Protected | ? |
| `getScoreHistory` | Protected | ? |

## `intelligenceRouter`

**File:** `server/routers/intelligence.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getSummaryStats` | Protected | ? |
| `getOfficerRegistry` | Protected | ? |
| `getAssessorRegistry` | Protected | ? |
| `getPanelBeaterRegistry` | Protected | ? |
| `getDriverRegistry` | Protected | ? |
| `getAccidentClusters` | Protected | ? |
| `getAnomalyScores` | Protected | ? |
| `getRelationshipGraph` | Protected | ? |
| `getClaimantRegistry` | Protected | ? |

## `learningRouter`

**File:** `server/routers/learning.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getCostPatternAnalysis` | Protected | ? |
| `getFraudPatternAnalysis` | Protected | ? |
| `getCalibrationDrift` | Protected | ? |
| `getLearningStats` | Protected | Query |
| `getJurisdictionCalibration` | Protected | ? |
| `getJurisdictionSummary` | Protected | ? |
| `checkOutOfDomain` | Protected | ? |
| `getOutOfDomainSummary` | Protected | ? |
| `evaluateCalibrationFeedback` | Protected | ? |
| `applyCalibrationUpdate` | Protected | ? |
| `getCalibrationHistory` | Protected | ? |

## `marketQuotesRouter`

**File:** `server/routers/market-quotes.ts`

| Procedure | Auth | Type |
|---|---|---|
| `uploadQuote` | Admin | ? |
| `getPendingQuotes` | Admin | Query |
| `getQuoteDetails` | Admin | ? |
| `updateLineItem` | Admin | ? |
| `approveQuote` | Admin | ? |
| `rejectQuote` | Admin | ? |
| `getSupplierMetrics` | Admin | Query |

## `marketplaceRouter`

**File:** `server/routers/marketplace.ts`

| Procedure | Auth | Type |
|---|---|---|
| `createProfile` | Protected | Mutation |
| `updateProfile` | Protected | Mutation |
| `approveOrReject` | Protected | Mutation |
| `listApproved` | Protected | ? |
| `listAll` | Protected | ? |
| `linkProfile` | Protected | Mutation |
| `suspendLink` | Protected | Mutation |
| `getMyLinks` | Protected | Query |
| `upsertRelationship` | Insurer Domain | Mutation |
| `updateRelationshipStatus` | Protected | Mutation |
| `listRelationships` | Insurer Domain | ? |
| `getApprovedPanelBeaters` | Protected | Query |
| `getApprovedAssessors` | Protected | ? |

## `mlRouter`

**File:** `server/routers/ml.ts`

| Procedure | Auth | Type |
|---|---|---|
| `calculateConfidenceScore` | Protected | ? |
| `processConfidenceScore` | Protected | ? |
| `getConfidenceScore` | Protected | ? |
| `getReviewQueue` | Protected | ? |
| `approveForTraining` | Protected | ? |
| `rejectForTraining` | Protected | ? |
| `getReviewQueueStats` | Protected | Query |

## `monetizationRouter`

**File:** `server/routers/monetization.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getTenantMetrics` | Super Admin | ? |
| `getAllTenantsMetrics` | Super Admin | ? |
| `getAggregateMetrics` | Super Admin | ? |
| `getCurrentMonthMetrics` | Super Admin | Query |
| `getPreviousMonthMetrics` | Super Admin | Query |
| `getTenantUsageRanking` | Super Admin | ? |
| `getMonthlyRevenueSimulation` | Super Admin | ? |
| `getHighGrowthTenants` | Super Admin | ? |
| `getCostComputeRatio` | Super Admin | ? |
| `previewTenantTier` | Protected | ? |
| `getCurrentUsage` | Protected | Query |

## `notificationsRouter`

**File:** `server/routers/notifications.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getAll` | Protected | ? |
| `getUnreadCount` | Protected | Query |
| `markAsRead` | Protected | ? |
| `markAllAsRead` | Protected | Mutation |
| `archive` | Protected | ? |
| `archiveAll` | Protected | Mutation |
| `getPreferences` | Protected | Query |
| `updatePreference` | Protected | ? |

## `operationalHealthRouter`

**File:** `server/routers/operational-health.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getHealth` | Super Admin | Query |

## `panelBeatersRouter`

**File:** `server/routers/panel-beaters-core.ts`

| Procedure | Auth | Type |
|---|---|---|
| `list` | Public | Query |
| `uploadQuotePdf` | Protected | ? |
| `extractQuoteFromPdf` | Protected | ? |
| `uploadRepairPhotos` | Protected | ? |

## `personalVehiclesRouter`

**File:** `server/routers/personal-vehicles.ts`

| Procedure | Auth | Type |
|---|---|---|
| `listMyVehicles` | Protected | Query |
| `addVehicle` | Protected | ? |
| `updateVehicle` | Protected | ? |
| `deleteVehicle` | Protected | ? |

## `photoReextractionRouter`

**File:** `server/routers/photo-reextraction.ts`

| Procedure | Auth | Type |
|---|---|---|
| `trigger` | Protected | ? |
| `getStatus` | Protected | ? |
| `classifyPhotoUrls` | Protected | ? |
| `getLatest` | Protected | ? |

## `pipelineObservabilityRouter`

**File:** `server/routers/pipeline-observability.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getRecentRuns` | Protected | ? |
| `getRunDetail` | Protected | ? |
| `getStageHealth` | Protected | ? |
| `getClaimRuns` | Protected | ? |
| `getDashboardSummary` | Protected | ? |

## `platformMarketplaceRouter`

**File:** `server/routers/platform-marketplace.ts`

| Procedure | Auth | Type |
|---|---|---|
| `listProviders` | Super Admin | Query |
| `getProviderDetail` | Super Admin | Query |
| `updateApprovalStatus` | Super Admin | Mutation |
| `getProviderRelationships` | Super Admin | Query |
| `getStats` | Super Admin | Query |
| `verifyClaimIntegrity` | Super Admin | ? |
| `listUsersForImpersonation` | Super Admin | ? |
| `startImpersonation` | Super Admin | ? |
| `endImpersonation` | Super Admin | Mutation |

## `platformUserRolesRouter`

**File:** `server/routers/platform-user-roles.ts`

| Procedure | Auth | Type |
|---|---|---|
| `listUsers` | Super Admin | Query |
| `assignRole` | Super Admin | Mutation |
| `getUserAuditHistory` | Super Admin | ? |

## `platformRouter`

**File:** `server/routers/platform.ts`

| Procedure | Auth | Type |
|---|---|---|
| `assignUserRole` | Admin | Mutation |
| `listAllUsers` | Admin | Query |
| `simulateClaim` | Admin | Mutation |

## `quotesRouter`

**File:** `server/routers/quotes-core.ts`

| Procedure | Auth | Type |
|---|---|---|
| `submit` | Protected | ? |
| `byClaim` | Protected | ? |
| `getWithLineItems` | Protected | ? |
| `adjustByAssessor` | Protected | ? |
| `submitStripRequote` | Protected | ? |
| `submitSupplementary` | Protected | ? |
| `extractFromImage` | Protected | ? |
| `runAudit` | Protected | ? |

## `recoveryRouter`

**File:** `server/routers/recovery.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getCases` | Protected | ? |
| `getCase` | Protected | ? |
| `updateCase` | Protected | ? |
| `assignCase` | Protected | ? |
| `generateDemandLetter` | Protected | ? |
| `getKPIs` | Protected | Query |
| `getInsurerIntelligence` | Protected | Query |
| `getThirdPartyProfiles` | Protected | ? |
| `getPriorCases` | Protected | ? |
| `getCorrespondenceLog` | Protected | ? |
| `addCorrespondenceEntry` | Protected | ? |
| `exportCorrespondenceLog` | Protected | ? |
| `getWatchlist` | Protected | Query |

## `repairHistoryRouter`

**File:** `server/routers/repair-history.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getByClaim` | Protected | ? |
| `getByRepairer` | Protected | ? |
| `getByVehicle` | Protected | ? |
| `getRepairerStats` | Protected | ? |
| `getLeaderboard` | Protected | ? |
| `getFraudFlagged` | Protected | ? |
| `getRepeatDamage` | Protected | ? |
| `markRepairComplete` | Protected | ? |
| `getStats` | Protected | ? |

## `reportingRouter`

**File:** `server/routers/reporting.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getCatalogue` | Protected | Query |
| `generate` | Protected | ? |
| `getJobStatus` | Protected | ? |
| `getMyJobs` | Protected | Query |
| `recordDownload` | Protected | ? |
| `adminGetAllJobs` | Admin | ? |
| `getScheduledReports` | Protected | Query |
| `createSchedule` | Protected | ? |
| `deleteSchedule` | Protected | ? |
| `toggleSchedule` | Protected | ? |
| `adminRegeneratePipeline` | Admin | ? |
| `adminGetRegenerationHistory` | Admin | ? |
| `previewHtml` | Protected | ? |
| `getReportReadiness` | Protected | ? |

## `reportsRouter`

**File:** `server/routers/reports.ts`

| Procedure | Auth | Type |
|---|---|---|
| `generateExecutiveReport` | Protected | ? |
| `generateFinancialSummary` | Protected | ? |
| `generateAuditTrailReport` | Protected | ? |

## `reviewQueueRouter`

**File:** `server/routers/review-queue.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getPending` | Protected | ? |
| `getStats` | Protected | Query |
| `submitDecision` | Protected | ? |
| `getClaimHistory` | Protected | ? |
| `bulkApprove` | Protected | ? |

## `routingPolicyVersionRouter`

**File:** `server/routers/routing-policy-version.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getPolicyVersionHistory` | Protected | ? |
| `getHistoricalPolicyByVersion` | Protected | ? |
| `getHistoricalPolicyByTimestamp` | Protected | ? |
| `comparePolicyVersions` | Protected | ? |
| `replayRoutingDecision` | Protected | ? |
| `validateReplayAccuracy` | Protected | ? |

## `simulationRouter`

**File:** `server/routers/simulation.ts`

| Procedure | Auth | Type |
|---|---|---|
| `runFullWorkflow` | Protected | Query |

## `superAuditRouter`

**File:** `server/routers/super-audit.ts`

| Procedure | Auth | Type |
|---|---|---|
| `createSession` | Super Admin | Mutation |
| `getAllTenants` | Super Admin | Query |
| `setAuditContext` | Super Admin | ? |
| `getActiveSession` | Super Admin | Query |
| `trackAccessedClaim` | Super Admin | ? |
| `trackReplayedClaim` | Super Admin | ? |
| `trackAiScoringView` | Super Admin | ? |
| `trackRoutingLogicView` | Super Admin | ? |
| `endSession` | Super Admin | ? |

## `teamMembersRouter`

**File:** `server/routers/team-members.ts`

| Procedure | Auth | Type |
|---|---|---|
| `list` | Insurer Domain | Query |
| `invite` | Insurer Domain | ? |
| `updateRole` | Insurer Domain | ? |
| `deactivate` | Insurer Domain | ? |
| `listInvitations` | Insurer Domain | Query |
| `cancelInvitation` | Insurer Domain | ? |
| `getAuditLog` | Insurer Domain | Query |
| `resendInvitation` | Insurer Domain | ? |

## `tenantRouter`

**File:** `server/routers/tenant.ts`

| Procedure | Auth | Type |
|---|---|---|
| `list` | Protected | Query |
| `getById` | Protected | ? |
| `create` | Protected | ? |
| `update` | Protected | ? |
| `delete` | Protected | ? |
| `getRoleConfig` | Protected | ? |
| `updateRoleConfig` | Protected | ? |
| `getWorkflowThresholds` | Protected | ? |
| `updateWorkflowThresholds` | Protected | ? |
| `getSlaConfig` | Protected | ? |
| `updateSlaConfig` | Protected | ? |
| `getCurrent` | Protected | Query |
| `updateCurrency` | Protected | ? |
| `getRates` | Protected | ? |
| `updateRates` | Protected | ? |

## `treGovernanceRouter`

**File:** `server/routers/tre-governance.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getClaimTruthObject` | Protected | ? |
| `getCanonicalValues` | Protected | ? |
| `verifyCertificate` | Protected | ? |
| `getGovernanceSummary` | Protected | ? |
| `evaluateTruthRules` | Protected | ? |
| `getRegulatoryCompliance` | Protected | ? |
| `getExplanation` | Protected | ? |
| `getTruthQualityIndex` | Protected | ? |
| `getGovernanceDashboard` | Protected | ? |

## `treV4GovernanceRouter`

**File:** `server/routers/tre-v4-governance.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getEventBusStats` | Protected | Query |
| `getRecentEvents` | Protected | ? |
| `getClaimEvents` | Protected | ? |
| `analyzeImpact` | Protected | ? |
| `analyzeMultiEventImpact` | Protected | ? |
| `getQueueStats` | Protected | Query |
| `getPendingTasks` | Protected | ? |
| `enqueueConflict` | Protected | ? |
| `resolveTask` | Protected | ? |
| `escalateTask` | Protected | ? |
| `getPendingReviews` | Protected | ? |
| `submitReview` | Protected | ? |
| `getClaimReviews` | Protected | ? |
| `getMemorySnapshot` | Protected | Query |
| `getConflictPatterns` | Protected | Query |
| `getMemoryInsights` | Protected | Query |
| `getSimilarClaims` | Protected | ? |
| `getActiveModels` | Protected | Query |
| `getModelsWithDrift` | Protected | Query |
| `getModelGovernanceReport` | Protected | Query |
| `getSLAPerformanceReport` | Protected | ? |
| `getClaimSLAs` | Protected | ? |
| `startSLATracking` | Protected | ? |
| `completeSLATracking` | Protected | ? |
| `runSimulation` | Protected | ? |
| `runStandardSimulations` | Protected | ? |
| `getEnterpriseDashboard` | Protected | ? |
| `getTrustAPIv2` | Protected | ? |

## `vehicleDamageHistoryRouter`

**File:** `server/routers/vehicle-damage-history.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getByVehicle` | Protected | ? |
| `getByClaim` | Protected | ? |
| `getByZone` | Protected | ? |
| `getRepeatZones` | Protected | ? |
| `stats` | Protected | Query |

## `vehiclePassportRouter`

**File:** `server/routers/vehicle-passport.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getPassport` | Protected | ? |
| `getPassportByRegistration` | Protected | ? |
| `getTimeline` | Protected | ? |
| `getClaimHistory` | Protected | ? |
| `getFraudSignals` | Protected | ? |
| `getLatestSnapshot` | Protected | ? |

## `vehicleRegistryRouter`

**File:** `server/routers/vehicle-registry.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getById` | Protected | ? |
| `findByVinOrReg` | Protected | ? |
| `getClaimHistory` | Protected | ? |
| `list` | Protected | ? |
| `listHighRisk` | Protected | ? |
| `stats` | Protected | Query |
| `setFlag` | Protected | ? |

## `vehicleStructuralIntelligenceRouter`

**File:** `server/routers/vehicle-structural-intelligence.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getProfile` | Protected | ? |
| `decodeVIN` | Protected | ? |
| `lookupSafetyRating` | Protected | ? |
| `getCrash3Class` | Protected | ? |
| `getClaimProfile` | Protected | ? |

## `vehicleValuationCoreRouter`

**File:** `server/routers/vehicle-valuation-core.ts`

| Procedure | Auth | Type |
|---|---|---|
| `trigger` | Protected | ? |
| `byClaim` | Protected | ? |
| `enrichPhotos` | Protected | ? |
| `runConsistencyCheck` | Protected | ? |
| `annotate` | Protected | ? |
| `getClaimStats` | Protected | ? |
| `getAdaptiveWeights` | Protected | Query |
| `getWeightAdjustmentLog` | Protected | ? |
| `getNarrativeVersionHistory` | Protected | ? |

## `workflowAnalyticsRouter`

**File:** `server/routers/workflow-analytics.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getProcessingTimesByStage` | Protected | ? |
| `getBottlenecks` | Protected | ? |
| `getSLACompliance` | Protected | ? |
| `getUserProductivity` | Protected | ? |
| `getTransitionTrends` | Protected | ? |

## `workflowAuditRouter`

**File:** `server/routers/workflow-audit.ts`

| Procedure | Auth | Type |
|---|---|---|
| `logTransition` | Protected | ? |
| `updateClaimState` | Protected | ? |
| `getClaimHistory` | Protected | ? |

## `workflowQueriesRouter`

**File:** `server/routers/workflow-queries.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getClaimsByState` | Insurer Domain | ? |
| `getClaimsByStatus` | Insurer Domain | ? |
| `getAccessibleStates` | Insurer Domain | Query |

## `workflowRouter`

**File:** `server/routers/workflow.ts`

| Procedure | Auth | Type |
|---|---|---|
| `getConfiguration` | Protected | Query |
| `updateConfiguration` | Protected | ? |

## `integrityRouter`

**File:** `server/routers/routers.ts (inline)`

| Procedure | Auth | Type |
|---|---|---|
| `getMetrics` | Protected | ? |
| `getStats` | Protected | ? |
| `getMyStatus` | Protected | Query |
| `getStatusByAssessorId` | Protected | ? |
| `adminSetTier` | Protected | ? |
| `adminListAll` | Protected | Query |
| `getResult` | Insurer Domain | ? |
| `recordDecision` | Insurer Domain | ? |
| `retrigger` | Insurer Domain | ? |
| `testPublic` | Public | ? |
| `uploadExternalAssessment` | Protected | ? |
| `getCostOptimization` | Protected | ? |
| `submit` | Protected | ? |
| `byClaim` | Protected | ? |
| `create` | Protected | ? |
| `myAppointments` | Protected | Query |
| `byClaim` | Protected | ? |
| `uploadImage` | Protected | ? |
| `upload` | Protected | ? |
| `byClaim` | Protected | ? |
| `delete` | Protected | ? |
| `allByClaim` | Protected | ? |
| `create` | Protected | ? |
| `byClaim` | Protected | ? |
| `extractPhysicsData` | Protected | ? |
| `override` | Protected | ? |
| `getOverrideStatus` | Protected | ? |

