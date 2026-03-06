/**
 * Driver Intelligence Registry — Helper Module
 * ──────────────────────────────────────────────
 * Provides:
 *   - normaliseLicenseNumber()     — uppercase, strip spaces/hyphens
 *   - normaliseDriverName()        — trim, collapse whitespace, title-case
 *   - parseLicenseDate()           — OCR-tolerant date normalisation
 *   - isLicenseExpired()           — null expiry = never expires
 *   - computeDriverRiskScore()     — 0–100 composite risk signal
 *   - matchOrCreateDriver()        — find by license, fallback to name+dob, else create
 *   - linkDriverToClaim()          — insert driver_claims row (idempotent)
 *   - upsertDriverFromClaim()      — main entry point called by the pipeline
 *   - getDriverById()
 *   - getDriverByLicense()
 *   - getDriverClaimHistory()
 *   - listHighRiskDrivers()
 */

import { eq, and, or, desc, like, sql } from "drizzle-orm";
import { drivers, driverClaims } from "../drizzle/schema";
import type { InsertDriver, InsertDriverClaim } from "../drizzle/schema";
import { getDb } from "./db";

// ─── Normalisation helpers ────────────────────────────────────────────────────

/**
 * Normalise a driver's licence number for consistent matching.
 * Converts to uppercase and strips all spaces and hyphens.
 * Returns null for empty/undefined inputs.
 */
export function normaliseLicenseNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.replace(/[\s\-]/g, "").toUpperCase().trim();
  return s.length >= 3 ? s : null;
}

/**
 * Normalise a driver name: trim, collapse internal whitespace, title-case.
 * Returns null for empty/undefined inputs.
 */
export function normaliseDriverName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().replace(/\s+/g, " ");
  if (s.length < 2) return null;
  // Title-case: lowercase everything first, then capitalise first letter of each word
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * OCR-tolerant date parser. Accepts:
 *   - YYYY-MM-DD (ISO)
 *   - DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
 *   - MM/DD/YYYY (US format — only used if day > 12 is impossible)
 *   - "YYYY" alone (year-only — stored as YYYY-01-01)
 *   - "does not expire", "no expiry", "lifetime", "permanent" → returns "NO_EXPIRY" sentinel
 *
 * Returns an ISO date string (YYYY-MM-DD), "NO_EXPIRY", or null if unparseable.
 */
export function parseLicenseDate(raw: string | null | undefined): string | "NO_EXPIRY" | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();

  // Sentinel: non-expiring licence
  if (
    s === "does not expire" ||
    s === "no expiry" ||
    s === "no expiration" ||
    s === "lifetime" ||
    s === "permanent" ||
    s === "indefinite" ||
    s === "n/a" ||
    s === "none" ||
    s === "-"
  ) {
    return "NO_EXPIRY";
  }

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return raw.trim();

  // YYYY only
  if (/^\d{4}$/.test(raw.trim())) return `${raw.trim()}-01-01`;

  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  const dmy = raw.trim().match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const day = d.padStart(2, "0");
    const month = m.padStart(2, "0");
    // Validate ranges
    if (parseInt(month) >= 1 && parseInt(month) <= 12 && parseInt(day) >= 1 && parseInt(day) <= 31) {
      return `${y}-${month}-${day}`;
    }
  }

  // MM/DD/YYYY (US format)
  const mdy = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    const month = m.padStart(2, "0");
    const day = d.padStart(2, "0");
    if (parseInt(month) >= 1 && parseInt(month) <= 12 && parseInt(day) >= 1 && parseInt(day) <= 31) {
      return `${y}-${month}-${day}`;
    }
  }

  // Month name formats: "12 Jan 2025", "Jan 12 2025", "January 2025"
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const namedDate = s.match(/^(\d{1,2})\s+([a-z]{3})\w*\s+(\d{4})$/);
  if (namedDate) {
    const [, d, mon, y] = namedDate;
    const month = months[mon.slice(0, 3)];
    if (month) return `${y}-${month}-${d.padStart(2, "0")}`;
  }
  const namedDateUS = s.match(/^([a-z]{3})\w*\s+(\d{1,2}),?\s+(\d{4})$/);
  if (namedDateUS) {
    const [, mon, d, y] = namedDateUS;
    const month = months[mon.slice(0, 3)];
    if (month) return `${y}-${month}-${d.padStart(2, "0")}`;
  }
  // Month + year only: "Jan 2025"
  const monthYear = s.match(/^([a-z]{3})\w*\s+(\d{4})$/);
  if (monthYear) {
    const [, mon, y] = monthYear;
    const month = months[mon.slice(0, 3)];
    if (month) return `${y}-${month}-01`;
  }

  return null;
}

/**
 * Check whether a licence is expired.
 * - null expiry date → never expires → returns false
 * - "NO_EXPIRY" sentinel → never expires → returns false
 * - Valid date in the past → returns true
 */
export function isLicenseExpired(expiryDate: string | null | undefined): boolean {
  if (!expiryDate || expiryDate === "NO_EXPIRY") return false;
  try {
    // Compare as ISO date strings (YYYY-MM-DD) to avoid timezone conversion issues.
    // new Date("2025-01-01") parses as UTC midnight, which can shift to the previous
    // calendar day in positive-offset timezones. String comparison is safer.
    const todayStr = new Date().toISOString().slice(0, 10);
    // Normalise the expiry to YYYY-MM-DD if it's a longer ISO string
    const expiryStr = expiryDate.slice(0, 10);
    // Validate it looks like a date
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryStr)) return false;
    return expiryStr < todayStr;
  } catch {
    return false;
  }
}

// ─── Risk score ───────────────────────────────────────────────────────────────

export interface DriverRiskParams {
  totalClaimsCount: number;
  atFaultClaimsCount: number;
  isStagedAccidentSuspect: boolean;
  lastFraudRiskScore: number;
}

/**
 * Compute a composite driver risk score (0–100).
 *
 * Scoring table:
 *   totalClaimsCount ≥ 5  → +30
 *   totalClaimsCount = 3–4 → +20
 *   totalClaimsCount = 2  → +10
 *   atFaultClaimsCount ≥ 3 → +20
 *   atFaultClaimsCount = 2 → +10
 *   isStagedAccidentSuspect → +30
 *   lastFraudRiskScore ≥ 70 → +20
 *   lastFraudRiskScore ≥ 40 → +10
 */
export function computeDriverRiskScore(params: DriverRiskParams): number {
  let score = 0;

  // Claim frequency
  if (params.totalClaimsCount >= 5) score += 30;
  else if (params.totalClaimsCount >= 3) score += 20;
  else if (params.totalClaimsCount >= 2) score += 10;

  // At-fault ratio
  if (params.atFaultClaimsCount >= 3) score += 20;
  else if (params.atFaultClaimsCount >= 2) score += 10;

  // Staged accident flag
  if (params.isStagedAccidentSuspect) score += 30;

  // Fraud risk from linked claims
  if (params.lastFraudRiskScore >= 70) score += 20;
  else if (params.lastFraudRiskScore >= 40) score += 10;

  return Math.min(score, 100);
}

// ─── Match or create ──────────────────────────────────────────────────────────

export interface DriverInput {
  fullName: string;
  licenseNumber?: string | null;
  licenseIssueDate?: string | null;
  licenseExpiryDate?: string | null;
  dateOfBirth?: string | null;
  phone?: string | null;
  email?: string | null;
  nationalIdNumber?: string | null;
  licenseCountry?: string | null;
  dataSource?: "ocr" | "manual" | "import" | "unknown";
  ocrConfidenceScore?: number | null;
  tenantId?: string | null;
}

/**
 * Find an existing driver record or create a new one.
 *
 * Match priority:
 *   1. Normalised license number (exact match) — most reliable
 *   2. Full name + date of birth (both must be present and match)
 *   3. Full name + email
 *   4. Full name + phone
 *
 * If no match is found, a new record is created.
 *
 * Returns the driver's id and whether the record was newly created.
 */
export async function matchOrCreateDriver(
  input: DriverInput
): Promise<{ driverId: number; isNew: boolean } | null> {
  const db = await getDb();
  if (!db) return null;

  const normLicense = normaliseLicenseNumber(input.licenseNumber);
  const normName = normaliseDriverName(input.fullName);
  if (!normName) return null;

  // ── Step 1: Match by license number ──────────────────────────────────────
  if (normLicense) {
    const existing = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.licenseNumber, normLicense))
      .limit(1);

    if (existing.length > 0) {
      // Update last_seen_at and any enriched fields
      await db
        .update(drivers)
        .set({
          lastSeenAt: new Date().toISOString().slice(0, 19).replace("T", " "),
          // Enrich with better data if available
          ...(input.phone && { phone: input.phone }),
          ...(input.email && { email: input.email }),
          ...(input.dateOfBirth && { dateOfBirth: input.dateOfBirth }),
          ...(input.licenseIssueDate && { licenseIssueDate: input.licenseIssueDate }),
          ...(input.licenseExpiryDate && { licenseExpiryDate: input.licenseExpiryDate }),
          ...(input.nationalIdNumber && { nationalIdNumber: input.nationalIdNumber }),
        })
        .where(eq(drivers.id, existing[0].id));
      return { driverId: existing[0].id, isNew: false };
    }
  }

  // ── Step 2: Match by name + DOB ───────────────────────────────────────────
  if (input.dateOfBirth) {
    const existing = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(
        and(
          eq(drivers.fullName, normName),
          eq(drivers.dateOfBirth, input.dateOfBirth)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(drivers)
        .set({
          lastSeenAt: new Date().toISOString().slice(0, 19).replace("T", " "),
          ...(normLicense && { licenseNumber: normLicense }),
          ...(input.phone && { phone: input.phone }),
          ...(input.email && { email: input.email }),
        })
        .where(eq(drivers.id, existing[0].id));
      return { driverId: existing[0].id, isNew: false };
    }
  }

  // ── Step 3: Match by name + email ─────────────────────────────────────────
  if (input.email) {
    const existing = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(
        and(
          eq(drivers.fullName, normName),
          eq(drivers.email, input.email.toLowerCase().trim())
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(drivers)
        .set({
          lastSeenAt: new Date().toISOString().slice(0, 19).replace("T", " "),
          ...(normLicense && { licenseNumber: normLicense }),
          ...(input.phone && { phone: input.phone }),
        })
        .where(eq(drivers.id, existing[0].id));
      return { driverId: existing[0].id, isNew: false };
    }
  }

  // ── Step 4: Match by name + phone ─────────────────────────────────────────
  if (input.phone) {
    const normPhone = input.phone.replace(/[\s\-\(\)]/g, "");
    const existing = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(
        and(
          eq(drivers.fullName, normName),
          eq(drivers.phone, normPhone)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(drivers)
        .set({
          lastSeenAt: new Date().toISOString().slice(0, 19).replace("T", " "),
          ...(normLicense && { licenseNumber: normLicense }),
          ...(input.email && { email: input.email }),
        })
        .where(eq(drivers.id, existing[0].id));
      return { driverId: existing[0].id, isNew: false };
    }
  }

  // ── Step 5: Create new record ─────────────────────────────────────────────
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const record: InsertDriver = {
    fullName: normName,
    licenseNumber: normLicense ?? null,
    licenseIssueDate: input.licenseIssueDate ?? null,
    licenseExpiryDate: input.licenseExpiryDate ?? null,
    dateOfBirth: input.dateOfBirth ?? null,
    phone: input.phone ? input.phone.replace(/[\s\-\(\)]/g, "") : null,
    email: input.email ? input.email.toLowerCase().trim() : null,
    nationalIdNumber: input.nationalIdNumber ?? null,
    licenseCountry: input.licenseCountry ?? null,
    dataSource: input.dataSource ?? "unknown",
    ocrConfidenceScore: input.ocrConfidenceScore ?? null,
    tenantId: input.tenantId ?? null,
    firstSeenAt: now,
    createdAt: now,
  };

  try {
    const result = await db.insert(drivers).values(record);
    const insertId = (result as any)[0]?.insertId ?? null;
    if (!insertId) return null;
    console.log(`[DriverRegistry] Created new driver id=${insertId} name="${normName}" license="${normLicense ?? 'N/A'}"`);
    return { driverId: insertId, isNew: true };
  } catch (err: any) {
    // Handle duplicate license number race condition
    if (err.code === "ER_DUP_ENTRY" && normLicense) {
      const existing = await db
        .select({ id: drivers.id })
        .from(drivers)
        .where(eq(drivers.licenseNumber, normLicense))
        .limit(1);
      if (existing.length > 0) {
        return { driverId: existing[0].id, isNew: false };
      }
    }
    console.error(`[DriverRegistry] Insert failed: ${err.message}`);
    return null;
  }
}

// ─── Link driver to claim ─────────────────────────────────────────────────────

export type DriverRole = "driver" | "claimant" | "passenger" | "third_party_driver" | "witness" | "unknown";

/**
 * Insert a driver_claims row (idempotent — ignores duplicate key errors).
 * Also increments the driver's total_claims_count and updates risk score.
 */
export async function linkDriverToClaim(params: {
  driverId: number;
  claimId: number;
  role: DriverRole;
  isAtFault?: boolean;
  wasInjured?: boolean;
  fraudRiskScore?: number;
  tenantId?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const { driverId, claimId, role, isAtFault = false, wasInjured = false, fraudRiskScore = 0, tenantId } = params;

  // Insert driver_claims row (ignore duplicate)
  try {
    await db.insert(driverClaims).values({
      driverId,
      claimId,
      role,
      isAtFault: isAtFault ? 1 : 0,
      wasInjured: wasInjured ? 1 : 0,
      tenantId: tenantId ?? null,
      createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
    } as InsertDriverClaim);
  } catch (err: any) {
    if (!err.message?.includes("Duplicate entry")) {
      console.warn(`[DriverRegistry] driver_claims insert warning: ${err.message}`);
    }
  }

  // Update driver aggregates
  const driver = await db
    .select({
      totalClaimsCount: drivers.totalClaimsCount,
      atFaultClaimsCount: drivers.atFaultClaimsCount,
      isStagedAccidentSuspect: drivers.isStagedAccidentSuspect,
      claimIdsJson: drivers.claimIdsJson,
    })
    .from(drivers)
    .where(eq(drivers.id, driverId))
    .limit(1);

  if (!driver.length) return;

  const d = driver[0];
  const newTotal = (d.totalClaimsCount ?? 0) + 1;
  const newAtFault = (d.atFaultClaimsCount ?? 0) + (isAtFault ? 1 : 0);

  // Update claim IDs JSON
  let claimIds: number[] = [];
  try {
    claimIds = JSON.parse(d.claimIdsJson ?? "[]");
  } catch {}
  if (!claimIds.includes(claimId)) claimIds.push(claimId);

  const newRiskScore = computeDriverRiskScore({
    totalClaimsCount: newTotal,
    atFaultClaimsCount: newAtFault,
    isStagedAccidentSuspect: !!(d.isStagedAccidentSuspect),
    lastFraudRiskScore: fraudRiskScore,
  });

  await db
    .update(drivers)
    .set({
      totalClaimsCount: newTotal,
      atFaultClaimsCount: newAtFault,
      isRepeatClaimer: newTotal >= 3 ? 1 : 0,
      driverRiskScore: newRiskScore,
      lastFraudRiskScore: fraudRiskScore,
      claimIdsJson: JSON.stringify(claimIds),
      lastSeenAt: new Date().toISOString().slice(0, 19).replace("T", " "),
    })
    .where(eq(drivers.id, driverId));

  console.log(
    `[DriverRegistry] Linked driver=${driverId} to claim=${claimId} role=${role} totalClaims=${newTotal} riskScore=${newRiskScore}`
  );
}

// ─── Main pipeline entry point ────────────────────────────────────────────────

export interface UpsertDriverFromClaimParams {
  claimId: number;
  // Insured driver fields
  driverName?: string | null;
  driverLicenseNumber?: string | null;
  driverLicenseIssueDate?: string | null;
  driverLicenseExpiryDate?: string | null;
  driverDateOfBirth?: string | null;
  driverPhone?: string | null;
  driverEmail?: string | null;
  driverNationalId?: string | null;
  driverLicenseCountry?: string | null;
  // Third-party driver fields
  thirdPartyDriverName?: string | null;
  thirdPartyDriverLicense?: string | null;
  // Claimant fields (from the claim form — may be the same person as the driver)
  claimantName?: string | null;
  claimantPhone?: string | null;
  claimantEmail?: string | null;
  claimantIdNumber?: string | null;
  // Context
  fraudRiskScore?: number;
  dataSource?: "ocr" | "manual" | "import" | "unknown";
  ocrConfidenceScore?: number | null;
  tenantId?: string | null;
}

/**
 * Main entry point called by the AI assessment pipeline.
 * Upserts driver records for the insured driver, third-party driver, and claimant.
 * Returns the driverRegistryId and thirdPartyDriverRegistryId for FK storage on the claim.
 */
export async function upsertDriverFromClaim(
  params: UpsertDriverFromClaimParams
): Promise<{ driverRegistryId: number | null; thirdPartyDriverRegistryId: number | null }> {
  const result = { driverRegistryId: null as number | null, thirdPartyDriverRegistryId: null as number | null };

  // ── Insured driver (the person operating the vehicle) ───────────────────
  // The driver is ALWAYS registered independently of the claimant.
  // A driver may be the vehicle owner, a family member, an employee, or any
  // other person — they are NOT assumed to be the same as the claimant.
  if (params.driverName) {
    // Parse OCR dates with tolerance
    const parsedIssue = parseLicenseDate(params.driverLicenseIssueDate);
    const parsedExpiry = parseLicenseDate(params.driverLicenseExpiryDate);

    const match = await matchOrCreateDriver({
      fullName: params.driverName,
      licenseNumber: params.driverLicenseNumber,
      licenseIssueDate: parsedIssue === "NO_EXPIRY" ? null : parsedIssue,
      // NULL means the licence does not expire — the sentinel is consumed here.
      licenseExpiryDate: parsedExpiry === "NO_EXPIRY" ? null : parsedExpiry,
      dateOfBirth: params.driverDateOfBirth,
      phone: params.driverPhone,
      email: params.driverEmail,
      nationalIdNumber: params.driverNationalId,
      licenseCountry: params.driverLicenseCountry,
      dataSource: params.dataSource ?? "unknown",
      ocrConfidenceScore: params.ocrConfidenceScore,
      tenantId: params.tenantId,
    });

    if (match) {
      result.driverRegistryId = match.driverId;
      // Always link as 'driver' role — independent of any claimant record.
      await linkDriverToClaim({
        driverId: match.driverId,
        claimId: params.claimId,
        role: "driver",
        fraudRiskScore: params.fraudRiskScore ?? 0,
        tenantId: params.tenantId,
      });
    }
  }

  // ── Claimant (person who lodged the claim) ────────────────────────────────
  // Registered as a SEPARATE record under the 'claimant' role.
  // The claimant may be the vehicle owner, an insured party, a legal
  // representative, or any other person — they are NOT assumed to be the driver.
  // We always attempt to create a claimant record if name data is available,
  // regardless of whether a driver record was created above.
  if (params.claimantName) {
    const claimantMatch = await matchOrCreateDriver({
      fullName: params.claimantName,
      // Claimant typically has no licence data — use national ID if available.
      nationalIdNumber: params.claimantIdNumber,
      phone: params.claimantPhone,
      email: params.claimantEmail,
      dataSource: params.dataSource ?? "unknown",
      tenantId: params.tenantId,
    });

    if (claimantMatch) {
      // Link as 'claimant' role — always separate from the 'driver' role.
      await linkDriverToClaim({
        driverId: claimantMatch.driverId,
        claimId: params.claimId,
        role: "claimant",
        fraudRiskScore: params.fraudRiskScore ?? 0,
        tenantId: params.tenantId,
      });
      // If no driver was found, use the claimant's registry ID as a fallback
      // so the claim always has at least one person linked.
      if (!result.driverRegistryId) {
        result.driverRegistryId = claimantMatch.driverId;
      }
    }
  }

  // ── Third-party driver ────────────────────────────────────────────────────
  if (params.thirdPartyDriverName) {
    const tpMatch = await matchOrCreateDriver({
      fullName: params.thirdPartyDriverName,
      licenseNumber: params.thirdPartyDriverLicense,
      dataSource: params.dataSource ?? "unknown",
      tenantId: params.tenantId,
    });

    if (tpMatch) {
      result.thirdPartyDriverRegistryId = tpMatch.driverId;
      await linkDriverToClaim({
        driverId: tpMatch.driverId,
        claimId: params.claimId,
        role: "third_party_driver",
        fraudRiskScore: params.fraudRiskScore ?? 0,
        tenantId: params.tenantId,
      });
    }
  }

  return result;
}

// ─── Query helpers ────────────────────────────────────────────────────────────

export async function getDriverById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(drivers).where(eq(drivers.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getDriverByLicense(licenseNumber: string) {
  const db = await getDb();
  if (!db) return null;
  const norm = normaliseLicenseNumber(licenseNumber);
  if (!norm) return null;
  const rows = await db.select().from(drivers).where(eq(drivers.licenseNumber, norm)).limit(1);
  return rows[0] ?? null;
}

export async function getDriverClaimHistory(driverId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(driverClaims)
    .where(eq(driverClaims.driverId, driverId))
    .orderBy(desc(driverClaims.createdAt));
}

export async function listHighRiskDrivers(tenantId?: string, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [sql`driver_risk_score > 0`];
  if (tenantId) conditions.push(eq(drivers.tenantId, tenantId));
  return db
    .select()
    .from(drivers)
    .where(and(...conditions))
    .orderBy(desc(drivers.driverRiskScore))
    .limit(limit);
}

export async function searchDrivers(query: string, tenantId?: string, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [
    or(
      like(drivers.fullName, `%${query}%`),
      like(drivers.licenseNumber, `%${query.toUpperCase()}%`),
      like(drivers.email, `%${query.toLowerCase()}%`),
      like(drivers.phone, `%${query}%`)
    )!,
  ];
  if (tenantId) conditions.push(eq(drivers.tenantId, tenantId));
  return db
    .select()
    .from(drivers)
    .where(and(...conditions))
    .orderBy(desc(drivers.lastSeenAt))
    .limit(limit);
}
