/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TRUTH MONITORING ENGINE — TRE v3.0 Enhancement 4
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Claims are not static. Implements truth re-evaluation when:
 *   - new documents arrive
 *   - new images arrive
 *   - quotes change
 *   - fraud models update
 *   - manual corrections occur
 *
 * Core principle: Never overwrite historical truth.
 * New evidence creates new versions, not overwrites.
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type TruthChangeType =
  | "new_document"
  | "new_image"
  | "quote_change"
  | "fraud_model_update"
  | "manual_correction"
  | "engine_rerun"
  | "regulatory_update";

export type CertificateStatus =
  | "VALID"
  | "INVALIDATED"
  | "PENDING_REVALIDATION"
  | "EXPIRED";

export interface TruthChangeEvent {
  /** Unique event ID */
  eventId: string;
  /** Claim/assessment ID */
  claimId: string;
  /** Type of change */
  changeType: TruthChangeType;
  /** ISO timestamp of the change */
  timestamp: string;
  /** Human-readable description */
  description: string;
  /** Fields expected to be affected by this change */
  affectedFields: string[];
  /** Whether this change invalidates the current certificate */
  invalidatesCertificate: boolean;
  /** Source of the change (user ID, system, engine name) */
  source: string;
  /** Metadata about the change */
  metadata?: Record<string, unknown>;
}

export interface TruthVersion {
  /** Version number (1-based, increments with each re-certification) */
  version: number;
  /** ISO timestamp when this version was created */
  createdAt: string;
  /** Change event that triggered this version */
  triggeringEvent: TruthChangeEvent;
  /** Certificate status for this version */
  certificateStatus: CertificateStatus;
  /** Certificate ID for this version */
  certificateId: string | null;
  /** Summary of what changed from the previous version */
  changeSummary: string;
  /** Key field values at this version (snapshot) */
  fieldSnapshot: Record<string, unknown>;
}

export interface TruthDriftReport {
  /** Claim/assessment ID */
  claimId: string;
  /** Current version number */
  currentVersion: number;
  /** All historical versions */
  versions: TruthVersion[];
  /** Fields that have drifted across versions */
  driftedFields: Array<{
    field: string;
    originalValue: unknown;
    currentValue: unknown;
    changeCount: number;
    lastChangedAt: string;
  }>;
  /** Total number of change events */
  totalChangeEvents: number;
  /** Whether the current certificate is valid */
  currentCertificateValid: boolean;
  /** ISO timestamp of report generation */
  generatedAt: string;
}

export interface MonitoringState {
  claimId: string;
  currentCertificateStatus: CertificateStatus;
  currentCertificateId: string | null;
  currentVersion: number;
  changeEvents: TruthChangeEvent[];
  versions: TruthVersion[];
  lastCheckedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE DETECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect whether a new change event should invalidate the current certificate.
 */
export function detectTruthChange(
  event: TruthChangeEvent,
  currentCertificateStatus: CertificateStatus
): { shouldInvalidate: boolean; reason: string } {
  if (currentCertificateStatus === "INVALIDATED" || currentCertificateStatus === "PENDING_REVALIDATION") {
    return { shouldInvalidate: false, reason: "Certificate already invalidated" };
  }

  // These change types always invalidate
  const alwaysInvalidate: TruthChangeType[] = [
    "new_document",
    "new_image",
    "fraud_model_update",
    "manual_correction",
  ];

  if (alwaysInvalidate.includes(event.changeType)) {
    return {
      shouldInvalidate: true,
      reason: `Change type "${event.changeType}" always invalidates the certificate`,
    };
  }

  // Quote change only invalidates if it affects cost fields
  if (event.changeType === "quote_change") {
    const affectsCost = event.affectedFields.some(f => f.startsWith("cost.") || f.startsWith("decision."));
    return {
      shouldInvalidate: affectsCost,
      reason: affectsCost
        ? "Quote change affects cost or decision fields"
        : "Quote change does not affect certified fields",
    };
  }

  // Engine rerun always invalidates
  if (event.changeType === "engine_rerun") {
    return { shouldInvalidate: true, reason: "Engine rerun requires re-certification" };
  }

  return { shouldInvalidate: event.invalidatesCertificate, reason: "Event flagged as certificate-invalidating" };
}

/**
 * Invalidate the current certificate and return the updated state.
 */
export function invalidateCertificate(
  state: MonitoringState,
  event: TruthChangeEvent
): MonitoringState {
  return {
    ...state,
    currentCertificateStatus: "INVALIDATED",
    changeEvents: [...state.changeEvents, event],
    lastCheckedAt: new Date().toISOString(),
  };
}

/**
 * Create a new truth version when re-certification occurs.
 * Never overwrites the previous version.
 */
export function createTruthVersion(
  state: MonitoringState,
  triggeringEvent: TruthChangeEvent,
  newCertificateId: string,
  changeSummary: string,
  fieldSnapshot: Record<string, unknown>
): MonitoringState {
  const newVersion: TruthVersion = {
    version: state.currentVersion + 1,
    createdAt: new Date().toISOString(),
    triggeringEvent,
    certificateStatus: "VALID",
    certificateId: newCertificateId,
    changeSummary,
    fieldSnapshot,
  };

  return {
    ...state,
    currentVersion: state.currentVersion + 1,
    currentCertificateStatus: "VALID",
    currentCertificateId: newCertificateId,
    versions: [...state.versions, newVersion],
    lastCheckedAt: new Date().toISOString(),
  };
}

/**
 * Generate a truth drift report comparing all versions.
 */
export function generateTruthDriftReport(state: MonitoringState): TruthDriftReport {
  const driftedFieldsMap = new Map<string, {
    originalValue: unknown;
    currentValue: unknown;
    changeCount: number;
    lastChangedAt: string;
  }>();

  // Compare each version's snapshot against the first version
  const firstSnapshot = state.versions[0]?.fieldSnapshot ?? {};
  const currentSnapshot = state.versions[state.versions.length - 1]?.fieldSnapshot ?? {};

  for (const [field, currentValue] of Object.entries(currentSnapshot)) {
    const originalValue = firstSnapshot[field];
    if (JSON.stringify(originalValue) !== JSON.stringify(currentValue)) {
      // Count how many versions changed this field
      let changeCount = 0;
      let lastChangedAt = state.versions[0]?.createdAt ?? new Date().toISOString();
      for (let i = 1; i < state.versions.length; i++) {
        const prev = state.versions[i - 1].fieldSnapshot[field];
        const curr = state.versions[i].fieldSnapshot[field];
        if (JSON.stringify(prev) !== JSON.stringify(curr)) {
          changeCount++;
          lastChangedAt = state.versions[i].createdAt;
        }
      }
      driftedFieldsMap.set(field, { originalValue, currentValue, changeCount, lastChangedAt });
    }
  }

  return {
    claimId: state.claimId,
    currentVersion: state.currentVersion,
    versions: state.versions,
    driftedFields: Array.from(driftedFieldsMap.entries()).map(([field, data]) => ({ field, ...data })),
    totalChangeEvents: state.changeEvents.length,
    currentCertificateValid: state.currentCertificateStatus === "VALID",
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Create initial monitoring state for a new claim.
 */
export function createInitialMonitoringState(
  claimId: string,
  certificateId: string,
  fieldSnapshot: Record<string, unknown>
): MonitoringState {
  const initialVersion: TruthVersion = {
    version: 1,
    createdAt: new Date().toISOString(),
    triggeringEvent: {
      eventId: `init_${claimId}`,
      claimId,
      changeType: "engine_rerun",
      timestamp: new Date().toISOString(),
      description: "Initial truth certification",
      affectedFields: Object.keys(fieldSnapshot),
      invalidatesCertificate: false,
      source: "truth_reconciliation_engine",
    },
    certificateStatus: "VALID",
    certificateId,
    changeSummary: "Initial truth certification",
    fieldSnapshot,
  };

  return {
    claimId,
    currentCertificateStatus: "VALID",
    currentCertificateId: certificateId,
    currentVersion: 1,
    changeEvents: [],
    versions: [initialVersion],
    lastCheckedAt: new Date().toISOString(),
  };
}
