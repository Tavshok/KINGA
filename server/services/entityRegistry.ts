/**
 * KINGA Entity Registry Service
 * ──────────────────────────────
 * Upserts entity records (driver, claimant, assessor, panel beater, police officer, fleet)
 * and writes relationship graph edges after every pipeline completion.
 *
 * Design principles:
 * - Non-blocking: all writes are fire-and-forget (never delay pipeline response)
 * - Idempotent: safe to call multiple times for the same claim
 * - Fuzzy deduplication: uses normalised name matching to merge near-duplicates
 * - Optimistic: never throws — logs errors and continues
 */

// db import removed - all queries use mysql2 directly via execSql/querySql helpers

// ── Types ─────────────────────────────────────────────────────

export interface EntityRegistryInput {
  claimId: number;
  tenantId: string;
  incidentDate?: string;       // ISO date string
  incidentTime?: string;       // HH:MM
  incidentLocation?: string;
  incidentLat?: number;
  incidentLng?: number;

  // Claimant
  claimantName?: string;
  claimantIdNumber?: string;
  claimantAddress?: string;
  claimantPhone?: string;
  claimantEmail?: string;
  policyNumber?: string;

  // Driver (may differ from claimant)
  driverName?: string;
  driverIdNumber?: string;
  driverLicenceNumber?: string;
  driverLicenceClass?: string;
  driverLicenceExpiry?: string;
  driverLicenceIssueDate?: string;
  driverDateOfBirth?: string;
  driverNationality?: string;
  driverAddress?: string;
  driverPhone?: string;
  driverLicencePhotoUrl?: string;

  // Third party
  thirdPartyName?: string;
  thirdPartyIdNumber?: string;
  thirdPartyAddress?: string;
  thirdPartyPhone?: string;

  // Police officer
  officerName?: string;
  officerBadgeNumber?: string;
  officerStation?: string;
  officerRank?: string;
  officerRegion?: string;

  // Assessor
  assessorName?: string;
  assessorCompany?: string;
  assessorAccreditationNumber?: string;
  assessorRegion?: string;

  // Panel beater
  panelBeaterName?: string;
  panelBeaterAddress?: string;
  panelBeaterPhone?: string;
  panelBeaterEmail?: string;
  panelBeaterVatNumber?: string;

  // Fleet / company
  fleetCompanyName?: string;
  fleetRegistrationNumber?: string;
  fleetIndustry?: string;

  // Cost data (for assessor/panel beater quality tracking)
  submittedCostUsd?: number;
  trueCostUsd?: number;
  structuralGapCount?: number;
}

export interface EntityRegistryResult {
  driverRegistryId?: number;
  claimantRegistryId?: number;
  assessorRegistryId?: number;
  panelBeaterRegistryId?: number;
  officerRegistryId?: number;
  fleetRegistryId?: number;
  edgesWritten: number;
}

// ── Utility: normalise name for fuzzy matching ────────────────

function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function incidentHour(time?: string): number | undefined {
  if (!time) return undefined;
  const parts = time.split(":");
  const h = parseInt(parts[0], 10);
  return isNaN(h) ? undefined : h;
}

function isNightHour(hour?: number): boolean {
  if (hour === undefined) return false;
  return hour >= 22 || hour < 5;
}

function dayOfWeek(dateStr?: string): number | undefined {
  if (!dateStr) return undefined;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? undefined : d.getDay(); // 0=Sun, 6=Sat
}

function isWeekend(dow?: number): boolean {
  return dow === 0 || dow === 6;
}

function nowIso(): string {
  return new Date().toISOString();
}

// Use mysql2 directly for parameterised queries
async function execSql(query: string, params: unknown[] = []): Promise<{ insertId?: number; affectedRows?: number }> {
  const { default: mysql } = await import("mysql2/promise");
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  try {
    const [result] = await conn.execute(query, params) as any;
    return { insertId: result.insertId, affectedRows: result.affectedRows };
  } finally {
    await conn.end();
  }
}

async function querySql(query: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const { default: mysql } = await import("mysql2/promise");
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  try {
    const [rows] = await conn.execute(query, params) as any;
    return rows as Record<string, unknown>[];
  } finally {
    await conn.end();
  }
}

// ── Upsert: Driver ────────────────────────────────────────────

async function upsertDriver(input: EntityRegistryInput): Promise<number | undefined> {
  const { driverName, driverIdNumber, driverLicenceNumber, tenantId, claimId } = input;
  if (!driverName && !driverIdNumber && !driverLicenceNumber) return undefined;

  const now = nowIso();
  const normName = driverName ? normaliseName(driverName) : null;

  // Find existing by ID number or licence number first (most reliable)
  let existing: Record<string, unknown> | undefined;
  if (driverIdNumber) {
    const rows = await querySql(
      "SELECT id, total_claims, claim_ids_json, addresses, address_change_count FROM driver_registry WHERE id_number = ? LIMIT 1",
      [driverIdNumber]
    );
    existing = rows[0];
  }
  if (!existing && driverLicenceNumber) {
    const rows = await querySql(
      "SELECT id, total_claims, claim_ids_json, addresses, address_change_count FROM driver_registry WHERE licence_number = ? LIMIT 1",
      [driverLicenceNumber]
    );
    existing = rows[0];
  }
  if (!existing && normName) {
    const rows = await querySql(
      "SELECT id, total_claims, claim_ids_json, addresses, address_change_count FROM driver_registry WHERE full_name = ? AND tenant_id = ? LIMIT 1",
      [driverName, tenantId]
    );
    existing = rows[0];
  }

  if (existing) {
    const id = existing.id as number;
    const claimIds: number[] = JSON.parse((existing.claim_ids_json as string) || "[]");
    if (!claimIds.includes(claimId)) claimIds.push(claimId);

    // Track address changes
    const addresses: string[] = JSON.parse((existing.addresses as string) || "[]");
    let addressChangeCount = (existing.address_change_count as number) || 0;
    if (input.driverAddress && !addresses.includes(input.driverAddress)) {
      addresses.push(input.driverAddress);
      addressChangeCount++;
    }

    await execSql(
      `UPDATE driver_registry SET
        total_claims = total_claims + 1,
        claims_as_driver = claims_as_driver + 1,
        last_claim_date = ?,
        claim_ids_json = ?,
        addresses = ?,
        current_address = COALESCE(?, current_address),
        address_change_count = ?,
        licence_expiry_date = COALESCE(?, licence_expiry_date),
        licence_class = COALESCE(?, licence_class),
        updated_at = ?
      WHERE id = ?`,
      [
        input.incidentDate || now,
        JSON.stringify(claimIds),
        JSON.stringify(addresses),
        input.driverAddress || null,
        addressChangeCount,
        input.driverLicenceExpiry || null,
        input.driverLicenceClass || null,
        now,
        id,
      ]
    );
    return id;
  } else {
    // Insert new driver
    const result = await execSql(
      `INSERT INTO driver_registry (
        id_number, licence_number, full_name, date_of_birth, nationality,
        licence_class, licence_issue_date, licence_expiry_date, licence_photo_url,
        addresses, current_address, address_change_count,
        phone_numbers, total_claims, claims_as_driver,
        first_claim_date, last_claim_date, claim_ids_json, insurer_ids_json,
        risk_score, is_watchlisted, tenant_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, 1, ?, ?, ?, ?, 0, 0, ?, ?, ?)`,
      [
        driverIdNumber || null,
        driverLicenceNumber || null,
        driverName || null,
        input.driverDateOfBirth || null,
        input.driverNationality || null,
        input.driverLicenceClass || null,
        input.driverLicenceIssueDate || null,
        input.driverLicenceExpiry || null,
        input.driverLicencePhotoUrl || null,
        JSON.stringify(input.driverAddress ? [input.driverAddress] : []),
        input.driverAddress || null,
        JSON.stringify(input.driverPhone ? [input.driverPhone] : []),
        input.incidentDate || now,
        input.incidentDate || now,
        JSON.stringify([claimId]),
        JSON.stringify([tenantId]),
        tenantId,
        now,
        now,
      ]
    );
    return result.insertId;
  }
}

// ── Upsert: Claimant ──────────────────────────────────────────

async function upsertClaimant(input: EntityRegistryInput): Promise<number | undefined> {
  const { claimantName, claimantIdNumber, tenantId, claimId } = input;
  if (!claimantName && !claimantIdNumber) return undefined;

  const now = nowIso();

  let existing: Record<string, unknown> | undefined;
  if (claimantIdNumber) {
    const rows = await querySql(
      "SELECT id, total_claims, claim_ids_json, addresses, address_change_count FROM claimant_registry WHERE id_number = ? LIMIT 1",
      [claimantIdNumber]
    );
    existing = rows[0];
  }
  if (!existing && claimantName) {
    const rows = await querySql(
      "SELECT id, total_claims, claim_ids_json, addresses, address_change_count FROM claimant_registry WHERE full_name = ? AND tenant_id = ? LIMIT 1",
      [claimantName, tenantId]
    );
    existing = rows[0];
  }

  if (existing) {
    const id = existing.id as number;
    const claimIds: number[] = JSON.parse((existing.claim_ids_json as string) || "[]");
    if (!claimIds.includes(claimId)) claimIds.push(claimId);

    const addresses: string[] = JSON.parse((existing.addresses as string) || "[]");
    let addressChangeCount = (existing.address_change_count as number) || 0;
    if (input.claimantAddress && !addresses.includes(input.claimantAddress)) {
      addresses.push(input.claimantAddress);
      addressChangeCount++;
    }

    await execSql(
      `UPDATE claimant_registry SET
        total_claims = total_claims + 1,
        last_claim_date = ?,
        claim_ids_json = ?,
        addresses = ?,
        current_address = COALESCE(?, current_address),
        address_change_count = ?,
        updated_at = ?
      WHERE id = ?`,
      [input.incidentDate || now, JSON.stringify(claimIds), JSON.stringify(addresses), input.claimantAddress || null, addressChangeCount, now, id]
    );
    return id;
  } else {
    const result = await execSql(
      `INSERT INTO claimant_registry (
        full_name, id_number, addresses, current_address, address_change_count,
        phone_numbers, email_addresses, policy_numbers, insurer_ids,
        total_claims, claims_approved, claims_rejected, claims_flagged,
        first_claim_date, last_claim_date, claim_ids_json,
        risk_score, is_watchlisted, tenant_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, 1, 0, 0, 0, ?, ?, ?, 0, 0, ?, ?, ?)`,
      [
        claimantName || null,
        claimantIdNumber || null,
        JSON.stringify(input.claimantAddress ? [input.claimantAddress] : []),
        input.claimantAddress || null,
        JSON.stringify(input.claimantPhone ? [input.claimantPhone] : []),
        JSON.stringify(input.claimantEmail ? [input.claimantEmail] : []),
        JSON.stringify(input.policyNumber ? [input.policyNumber] : []),
        JSON.stringify([tenantId]),
        input.incidentDate || now,
        input.incidentDate || now,
        JSON.stringify([claimId]),
        tenantId,
        now,
        now,
      ]
    );
    return result.insertId;
  }
}

// ── Upsert: Police Officer ────────────────────────────────────

async function upsertOfficer(input: EntityRegistryInput): Promise<number | undefined> {
  const { officerName, officerBadgeNumber, tenantId, claimId } = input;
  if (!officerName && !officerBadgeNumber) return undefined;

  const now = nowIso();

  let existing: Record<string, unknown> | undefined;
  if (officerBadgeNumber) {
    const rows = await querySql(
      "SELECT id, total_claims, claim_ids_json, assessor_co_occurrences FROM police_officer_registry WHERE badge_number = ? LIMIT 1",
      [officerBadgeNumber]
    );
    existing = rows[0];
  }
  if (!existing && officerName) {
    const rows = await querySql(
      "SELECT id, total_claims, claim_ids_json, assessor_co_occurrences FROM police_officer_registry WHERE full_name = ? AND tenant_id = ? LIMIT 1",
      [officerName, tenantId]
    );
    existing = rows[0];
  }

  if (existing) {
    const id = existing.id as number;
    const claimIds: number[] = JSON.parse((existing.claim_ids_json as string) || "[]");
    if (!claimIds.includes(claimId)) claimIds.push(claimId);

    // Track assessor co-occurrences
    const coOccurrences: Record<string, number> = JSON.parse((existing.assessor_co_occurrences as string) || "{}");
    if (input.assessorName) {
      const key = normaliseName(input.assessorName);
      coOccurrences[key] = (coOccurrences[key] || 0) + 1;
    }

    await execSql(
      `UPDATE police_officer_registry SET
        total_claims = total_claims + 1,
        claim_ids_json = ?,
        assessor_co_occurrences = ?,
        updated_at = ?
      WHERE id = ?`,
      [JSON.stringify(claimIds), JSON.stringify(coOccurrences), now, id]
    );
    return id;
  } else {
    const coOccurrences: Record<string, number> = {};
    if (input.assessorName) {
      coOccurrences[normaliseName(input.assessorName)] = 1;
    }

    const result = await execSql(
      `INSERT INTO police_officer_registry (
        full_name, badge_number, station, region, officer_rank,
        total_claims, claim_ids_json, assessor_co_occurrences,
        risk_score, is_watchlisted, tenant_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, 0, 0, ?, ?, ?)`,
      [
        officerName || null,
        officerBadgeNumber || null,
        input.officerStation || null,
        input.officerRegion || null,
        input.officerRank || null,
        JSON.stringify([claimId]),
        JSON.stringify(coOccurrences),
        tenantId,
        now,
        now,
      ]
    );
    return result.insertId;
  }
}

// ── Upsert: Assessor ──────────────────────────────────────────

async function upsertAssessor(input: EntityRegistryInput): Promise<number | undefined> {
  const { assessorName, assessorCompany, tenantId, claimId } = input;
  if (!assessorName && !assessorCompany) return undefined;

  const now = nowIso();
  let existing: Record<string, unknown> | undefined;

  if (assessorName) {
    const rows = await querySql(
      "SELECT id, total_claims_assessed, panel_beater_routing, cost_suppression_claims FROM assessor_registry WHERE full_name = ? AND tenant_id = ? LIMIT 1",
      [assessorName, tenantId]
    );
    existing = rows[0];
  }

  if (existing) {
    const id = existing.id as number;
    const routing: Record<string, number> = JSON.parse((existing.panel_beater_routing as string) || "{}");
    if (input.panelBeaterName) {
      const key = normaliseName(input.panelBeaterName);
      routing[key] = (routing[key] || 0) + 1;
    }

    // Compute HHI (Herfindahl-Hirschman Index) for routing concentration
    const totalRouted = Object.values(routing).reduce((a, b) => a + b, 0);
    const hhi = totalRouted > 0
      ? Object.values(routing).reduce((sum, count) => sum + Math.pow(count / totalRouted, 2), 0)
      : 0;
    const hhiScore = Math.round(hhi * 100);

    // Track cost suppression
    let costSuppressionClaims = (existing.cost_suppression_claims as number) || 0;
    if (input.submittedCostUsd && input.trueCostUsd) {
      const deviation = (input.submittedCostUsd - input.trueCostUsd) / input.trueCostUsd;
      if (deviation < -0.15) costSuppressionClaims++;
    }

    await execSql(
      `UPDATE assessor_registry SET
        total_claims_assessed = total_claims_assessed + 1,
        panel_beater_routing = ?,
        routing_concentration_score = ?,
        cost_suppression_claims = ?,
        updated_at = ?
      WHERE id = ?`,
      [JSON.stringify(routing), hhiScore, costSuppressionClaims, now, id]
    );
    return id;
  } else {
    const routing: Record<string, number> = {};
    if (input.panelBeaterName) {
      routing[normaliseName(input.panelBeaterName)] = 1;
    }

    const result = await execSql(
      `INSERT INTO assessor_registry (
        full_name, company_name, accreditation_number, region,
        total_claims_assessed, panel_beater_routing, routing_concentration_score,
        cost_suppression_claims, structural_gap_claims,
        risk_score, is_watchlisted, tenant_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 1, ?, 0, 0, 0, 0, 0, ?, ?, ?)`,
      [
        assessorName || null,
        assessorCompany || null,
        input.assessorAccreditationNumber || null,
        input.assessorRegion || null,
        JSON.stringify(routing),
        tenantId,
        now,
        now,
      ]
    );
    return result.insertId;
  }
}

// ── Upsert: Panel Beater ──────────────────────────────────────

async function upsertPanelBeater(input: EntityRegistryInput): Promise<number | undefined> {
  const { panelBeaterName, tenantId, claimId } = input;
  if (!panelBeaterName) return undefined;

  const now = nowIso();
  let existing: Record<string, unknown> | undefined;

  const rows = await querySql(
    "SELECT id, total_quotes_submitted, assessor_routing, quotes_below_cost_count, structural_gap_count FROM panel_beater_registry WHERE company_name = ? AND tenant_id = ? LIMIT 1",
    [panelBeaterName, tenantId]
  );
  existing = rows[0];

  if (existing) {
    const id = existing.id as number;
    const routing: Record<string, number> = JSON.parse((existing.assessor_routing as string) || "{}");
    if (input.assessorName) {
      const key = normaliseName(input.assessorName);
      routing[key] = (routing[key] || 0) + 1;
    }

    let quotesBelowCost = (existing.quotes_below_cost_count as number) || 0;
    let structuralGapCount = (existing.structural_gap_count as number) || 0;

    if (input.submittedCostUsd && input.trueCostUsd) {
      if (input.submittedCostUsd < input.trueCostUsd * 0.85) quotesBelowCost++;
    }
    if (input.structuralGapCount && input.structuralGapCount > 0) {
      structuralGapCount += input.structuralGapCount;
    }

    await execSql(
      `UPDATE panel_beater_registry SET
        total_quotes_submitted = total_quotes_submitted + 1,
        assessor_routing = ?,
        quotes_below_cost_count = ?,
        structural_gap_count = ?,
        updated_at = ?
      WHERE id = ?`,
      [JSON.stringify(routing), quotesBelowCost, structuralGapCount, now, id]
    );
    return id;
  } else {
    const routing: Record<string, number> = {};
    if (input.assessorName) {
      routing[normaliseName(input.assessorName)] = 1;
    }

    const result = await execSql(
      `INSERT INTO panel_beater_registry (
        company_name, address, phone, email, vat_number,
        total_quotes_submitted, assessor_routing, routing_concentration_score,
        quotes_below_cost_count, quotes_above_cost_count, structural_gap_count,
        risk_score, is_watchlisted, tenant_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, 0, 0, 0, ?, 0, 0, ?, ?, ?)`,
      [
        panelBeaterName,
        input.panelBeaterAddress || null,
        input.panelBeaterPhone || null,
        input.panelBeaterEmail || null,
        input.panelBeaterVatNumber || null,
        JSON.stringify(routing),
        input.structuralGapCount || 0,
        tenantId,
        now,
        now,
      ]
    );
    return result.insertId;
  }
}

// ── Write Relationship Graph Edges ────────────────────────────

async function writeEdge(
  entityAType: string,
  entityAId: number,
  relationshipType: string,
  entityBType: string,
  entityBId: number,
  claimId: number,
  tenantId: string
): Promise<void> {
  const now = nowIso();
  try {
    await execSql(
      `INSERT INTO entity_relationship_graph 
        (entity_a_type, entity_a_id, relationship_type, entity_b_type, entity_b_id, claim_id, tenant_id, edge_weight, first_seen_at, last_seen_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
       ON DUPLICATE KEY UPDATE edge_weight = edge_weight + 1, last_seen_at = ?`,
      [entityAType, entityAId, relationshipType, entityBType, entityBId, claimId, tenantId, now, now, now, now]
    );
  } catch (e: any) {
    // Non-fatal: log and continue
    console.warn("[EntityRegistry] Edge write failed:", e.message?.substring(0, 100));
  }
}

// ── Write ML Feature Record ───────────────────────────────────

async function writeClaimFeatures(
  input: EntityRegistryInput,
  ids: EntityRegistryResult,
  assessmentId?: number,
  fraudScore?: number,
  fraudIndicators?: unknown,
  physicsData?: { deltaV?: number; crushDepth?: number; impactForce?: number; airbagDeployed?: boolean },
  costData?: { submittedCostUsd?: number; trueCostUsd?: number; costDeviationPct?: number; structuralGapCount?: number; costBasis?: string },
  damageData?: { componentCount?: number; structuralDamageFlag?: boolean; damageZone?: string },
  photoData?: { photoCount?: number; exifPresent?: boolean; gpsPresent?: boolean },
  documentData?: { policeReportPresent?: boolean; licencePresent?: boolean }
): Promise<void> {
  const now = nowIso();
  const hour = incidentHour(input.incidentTime);
  const dow = dayOfWeek(input.incidentDate);

  try {
    await execSql(
      `INSERT INTO claim_features (
        claim_id, assessment_id, tenant_id,
        delta_v, crush_depth, impact_force, airbag_deployed,
        component_count, structural_damage_flag, damage_zone,
        submitted_cost_usd, true_cost_usd, cost_deviation_pct, structural_gap_count, cost_basis,
        driver_registry_id, claimant_registry_id, assessor_registry_id, panel_beater_registry_id, officer_registry_id,
        driver_total_claims,
        incident_hour, incident_day_of_week, incident_is_night, incident_is_weekend,
        photo_count, exif_present, gps_present, police_report_present, licence_present,
        fraud_indicators, rule_based_fraud_score,
        incident_lat, incident_lng, incident_location_raw,
        geocoding_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        assessment_id = VALUES(assessment_id),
        rule_based_fraud_score = VALUES(rule_based_fraud_score),
        fraud_indicators = VALUES(fraud_indicators),
        incident_lat = COALESCE(VALUES(incident_lat), incident_lat),
        incident_lng = COALESCE(VALUES(incident_lng), incident_lng)`,
      [
        input.claimId, assessmentId || null, input.tenantId,
        physicsData?.deltaV || null, physicsData?.crushDepth || null, physicsData?.impactForce || null,
        physicsData?.airbagDeployed != null ? (physicsData.airbagDeployed ? 1 : 0) : null,
        damageData?.componentCount || null,
        damageData?.structuralDamageFlag != null ? (damageData.structuralDamageFlag ? 1 : 0) : null,
        damageData?.damageZone || null,
        costData?.submittedCostUsd || null, costData?.trueCostUsd || null,
        costData?.costDeviationPct || null, costData?.structuralGapCount || null, costData?.costBasis || null,
        ids.driverRegistryId || null, ids.claimantRegistryId || null,
        ids.assessorRegistryId || null, ids.panelBeaterRegistryId || null, ids.officerRegistryId || null,
        null, // driver_total_claims — populated by batch job
        hour ?? null, dow ?? null,
        hour != null ? (isNightHour(hour) ? 1 : 0) : null,
        dow != null ? (isWeekend(dow) ? 1 : 0) : null,
        photoData?.photoCount || null,
        photoData?.exifPresent != null ? (photoData.exifPresent ? 1 : 0) : null,
        photoData?.gpsPresent != null ? (photoData.gpsPresent ? 1 : 0) : null,
        documentData?.policeReportPresent != null ? (documentData.policeReportPresent ? 1 : 0) : null,
        documentData?.licencePresent != null ? (documentData.licencePresent ? 1 : 0) : null,
        fraudIndicators ? JSON.stringify(fraudIndicators) : null,
        fraudScore || null,
        input.incidentLat || null, input.incidentLng || null, input.incidentLocation || null,
        input.incidentLat ? "geocoded" : "pending",
        now,
      ]
    );
  } catch (e: any) {
    console.warn("[EntityRegistry] Feature write failed:", e.message?.substring(0, 100));
  }
}

// ── Main Entry Point ──────────────────────────────────────────

export async function processEntityRegistry(
  input: EntityRegistryInput,
  options?: {
    assessmentId?: number;
    fraudScore?: number;
    fraudIndicators?: unknown;
    physicsData?: { deltaV?: number; crushDepth?: number; impactForce?: number; airbagDeployed?: boolean };
    costData?: { submittedCostUsd?: number; trueCostUsd?: number; costDeviationPct?: number; structuralGapCount?: number; costBasis?: string };
    damageData?: { componentCount?: number; structuralDamageFlag?: boolean; damageZone?: string };
    photoData?: { photoCount?: number; exifPresent?: boolean; gpsPresent?: boolean };
    documentData?: { policeReportPresent?: boolean; licencePresent?: boolean };
  }
): Promise<EntityRegistryResult> {
  const result: EntityRegistryResult = { edgesWritten: 0 };

  try {
    // Upsert all entities in parallel
    const [driverId, claimantId, officerId, assessorId, panelBeaterId] = await Promise.all([
      upsertDriver(input).catch(e => { console.warn("[EntityRegistry] Driver upsert failed:", e.message); return undefined; }),
      upsertClaimant(input).catch(e => { console.warn("[EntityRegistry] Claimant upsert failed:", e.message); return undefined; }),
      upsertOfficer(input).catch(e => { console.warn("[EntityRegistry] Officer upsert failed:", e.message); return undefined; }),
      upsertAssessor(input).catch(e => { console.warn("[EntityRegistry] Assessor upsert failed:", e.message); return undefined; }),
      upsertPanelBeater(input).catch(e => { console.warn("[EntityRegistry] Panel beater upsert failed:", e.message); return undefined; }),
    ]);

    result.driverRegistryId = driverId;
    result.claimantRegistryId = claimantId;
    result.officerRegistryId = officerId;
    result.assessorRegistryId = assessorId;
    result.panelBeaterRegistryId = panelBeaterId;

    // Write relationship graph edges
    const edges: Promise<void>[] = [];
    const { claimId, tenantId } = input;

    if (claimantId && driverId) {
      const driverIsSameAsClaimant =
        (input.driverIdNumber && input.claimantIdNumber && input.driverIdNumber === input.claimantIdNumber) ||
        (input.driverName && input.claimantName &&
          normaliseName(input.driverName) === normaliseName(input.claimantName));

      edges.push(writeEdge("claimant", claimantId,
        driverIsSameAsClaimant ? "driver_is_claimant" : "driver_differs_from_claimant",
        "driver", driverId, claimId, tenantId));
    }

    if (claimantId && assessorId) {
      edges.push(writeEdge("claimant", claimantId, "assessed_by", "assessor", assessorId, claimId, tenantId));
    }

    if (claimantId && panelBeaterId) {
      edges.push(writeEdge("claimant", claimantId, "repaired_by", "panel_beater", panelBeaterId, claimId, tenantId));
    }

    if (claimantId && officerId) {
      edges.push(writeEdge("claimant", claimantId, "attended_by", "police_officer", officerId, claimId, tenantId));
    }

    if (assessorId && panelBeaterId) {
      edges.push(writeEdge("assessor", assessorId, "assessor_routed_to", "panel_beater", panelBeaterId, claimId, tenantId));
    }

    if (officerId && assessorId) {
      edges.push(writeEdge("police_officer", officerId, "officer_attended_assessor", "assessor", assessorId, claimId, tenantId));
    }

    await Promise.allSettled(edges);
    result.edgesWritten = edges.length;

    // Write ML feature record
    await writeClaimFeatures(
      input, result,
      options?.assessmentId,
      options?.fraudScore,
      options?.fraudIndicators,
      options?.physicsData,
      options?.costData,
      options?.damageData,
      options?.photoData,
      options?.documentData
    );

    console.log(`[EntityRegistry] Claim ${claimId}: upserted ${[driverId, claimantId, officerId, assessorId, panelBeaterId].filter(Boolean).length} entities, wrote ${edges.length} graph edges`);

  } catch (e: any) {
    // Never throw — entity registry is non-blocking
    console.error("[EntityRegistry] Unexpected error:", e.message);
  }

  return result;
}

// ── Concentration Fraud Checks ────────────────────────────────

export interface OfficerConcentrationResult {
  officerName: string;
  totalClaims: number;
  riskLevel: "none" | "advisory" | "elevated" | "high" | "critical";
  fraudPoints: number;
  assessorCoOccurrences: Record<string, number>;
  topAssessorCount: number;
  collusionWebDetected: boolean;
}

export async function checkOfficerConcentration(
  officerName?: string,
  officerBadgeNumber?: string,
  tenantId?: string
): Promise<OfficerConcentrationResult | null> {
  if (!officerName && !officerBadgeNumber) return null;

  let rows: Record<string, unknown>[];
  if (officerBadgeNumber) {
    rows = await querySql(
      "SELECT * FROM police_officer_registry WHERE badge_number = ? LIMIT 1",
      [officerBadgeNumber]
    );
  } else {
    rows = await querySql(
      "SELECT * FROM police_officer_registry WHERE full_name = ? AND tenant_id = ? LIMIT 1",
      [officerName, tenantId]
    );
  }

  if (!rows[0]) return null;

  const officer = rows[0];
  const totalClaims = (officer.total_claims as number) || 0;
  const coOccurrences: Record<string, number> = JSON.parse((officer.assessor_co_occurrences as string) || "{}");
  const topAssessorCount = Math.max(...Object.values(coOccurrences), 0);
  const collusionWebDetected = topAssessorCount >= 3;

  let riskLevel: OfficerConcentrationResult["riskLevel"] = "none";
  let fraudPoints = 0;

  if (totalClaims >= 10) { riskLevel = "critical"; fraudPoints = 40; }
  else if (totalClaims >= 7) { riskLevel = "high"; fraudPoints = 30; }
  else if (totalClaims >= 5) { riskLevel = "elevated"; fraudPoints = 20; }
  else if (totalClaims >= 3) { riskLevel = "advisory"; fraudPoints = 15; }

  if (collusionWebDetected) fraudPoints += 25;

  return {
    officerName: (officer.full_name as string) || officerName || "",
    totalClaims,
    riskLevel,
    fraudPoints,
    assessorCoOccurrences: coOccurrences,
    topAssessorCount,
    collusionWebDetected,
  };
}

export interface AssessorRoutingResult {
  assessorName: string;
  totalClaims: number;
  topPanelBeaterPct: number;
  routingConcentrationScore: number;
  costSuppressionClaims: number;
  fraudPoints: number;
  collusionSuspected: boolean;
}

export async function checkAssessorRouting(
  assessorName?: string,
  tenantId?: string
): Promise<AssessorRoutingResult | null> {
  if (!assessorName) return null;

  const rows = await querySql(
    "SELECT * FROM assessor_registry WHERE full_name = ? AND tenant_id = ? LIMIT 1",
    [assessorName, tenantId]
  );

  if (!rows[0]) return null;

  const assessor = rows[0];
  const totalClaims = (assessor.total_claims_assessed as number) || 0;
  const routing: Record<string, number> = JSON.parse((assessor.panel_beater_routing as string) || "{}");
  const totalRouted = Object.values(routing).reduce((a, b) => a + b, 0);
  const topCount = Math.max(...Object.values(routing), 0);
  const topPct = totalRouted > 0 ? (topCount / totalRouted) * 100 : 0;
  const costSuppressionClaims = (assessor.cost_suppression_claims as number) || 0;

  let fraudPoints = 0;
  if (topPct >= 90 && totalClaims >= 5) fraudPoints += 30;
  else if (topPct >= 75 && totalClaims >= 5) fraudPoints += 20;
  else if (topPct >= 60 && totalClaims >= 5) fraudPoints += 10;

  if (costSuppressionClaims >= 3) fraudPoints += 15;

  return {
    assessorName: (assessor.full_name as string) || assessorName,
    totalClaims,
    topPanelBeaterPct: Math.round(topPct),
    routingConcentrationScore: (assessor.routing_concentration_score as number) || 0,
    costSuppressionClaims,
    fraudPoints,
    collusionSuspected: topPct >= 75 && costSuppressionClaims >= 2,
  };
}

export interface DriverHistoryResult {
  driverName: string;
  totalClaims: number;
  daysSinceLastClaim?: number;
  addressChangeCount: number;
  fraudPoints: number;
  rapidReclaimFlag: boolean;
  highFrequencyFlag: boolean;
}

export async function checkDriverHistory(
  driverName?: string,
  driverIdNumber?: string,
  driverLicenceNumber?: string,
  incidentDate?: string,
  tenantId?: string
): Promise<DriverHistoryResult | null> {
  if (!driverName && !driverIdNumber && !driverLicenceNumber) return null;

  let rows: Record<string, unknown>[];
  if (driverIdNumber) {
    rows = await querySql("SELECT * FROM driver_registry WHERE id_number = ? LIMIT 1", [driverIdNumber]);
  } else if (driverLicenceNumber) {
    rows = await querySql("SELECT * FROM driver_registry WHERE licence_number = ? LIMIT 1", [driverLicenceNumber]);
  } else {
    rows = await querySql("SELECT * FROM driver_registry WHERE full_name = ? AND tenant_id = ? LIMIT 1", [driverName, tenantId]);
  }

  if (!rows[0]) return null;

  const driver = rows[0];
  const totalClaims = (driver.total_claims as number) || 0;
  const lastClaimDate = driver.last_claim_date as string;
  const addressChangeCount = (driver.address_change_count as number) || 0;

  let daysSinceLastClaim: number | undefined;
  if (lastClaimDate && incidentDate) {
    const last = new Date(lastClaimDate);
    const current = new Date(incidentDate);
    if (!isNaN(last.getTime()) && !isNaN(current.getTime())) {
      daysSinceLastClaim = Math.floor((current.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
    }
  }

  let fraudPoints = 0;
  const rapidReclaimFlag = daysSinceLastClaim !== undefined && daysSinceLastClaim < 30;
  const highFrequencyFlag = totalClaims >= 3;

  if (daysSinceLastClaim !== undefined && daysSinceLastClaim < 7) fraudPoints += 30;
  else if (daysSinceLastClaim !== undefined && daysSinceLastClaim < 30) fraudPoints += 20;
  else if (daysSinceLastClaim !== undefined && daysSinceLastClaim < 90) fraudPoints += 10;

  if (totalClaims >= 5) fraudPoints += 20;
  else if (totalClaims >= 3) fraudPoints += 10;

  if (addressChangeCount >= 3) fraudPoints += 10;

  return {
    driverName: (driver.full_name as string) || driverName || "",
    totalClaims,
    daysSinceLastClaim,
    addressChangeCount,
    fraudPoints,
    rapidReclaimFlag,
    highFrequencyFlag,
  };
}
