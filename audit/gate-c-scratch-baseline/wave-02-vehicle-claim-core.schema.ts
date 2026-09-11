/**
 * Gate C Wave 2 source export.
 *
 * This module re-exports only the dependency-safe vehicle, claimant/driver,
 * policy, insurance, inspection and claim-core declarations selected by the
 * reviewed Gate C plan. It is used exclusively to generate review SQL for a
 * loopback-only scratch proof; it is not an application configuration and it
 * contains no database URL or credentials.
 */
export {
  claimAssignments,
  claimDocuments,
  claims,
  drivers,
  inspections,
  insuranceAuditLogs,
  insuranceCarriers,
  insurancePolicies,
  insuranceProducts,
  insuranceQuotes,
  measurementTypes,
  vehicleConditionAssessment,
  vehicleConditionSnapshots,
  vehicleDamageHistory,
  vehicleGeometryMeasurements,
  vehicleMarketValuations,
  vehicleMileageLogs,
  vehicleModels,
  vehiclePassportSnapshots,
  vehicleRegistry,
} from "../../drizzle/schema";
