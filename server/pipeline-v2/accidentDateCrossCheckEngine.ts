/**
 * accidentDateCrossCheckEngine.ts
 *
 * Cross-checks the accident date across three independent sources:
 *   1. Claim form  — claimRecord.accidentDate
 *   2. Police report — claimRecord.policeReportDate
 *   3. Image EXIF metadata — Stage8Output.photoForensics.photos[].capture_datetime
 *
 * Two fraud signals:
 *   A. DATE_MISMATCH — claim form date and police report date differ by >1 day
 *   B. PRE_INCIDENT_IMAGE — at least one photo's EXIF capture_datetime is
 *      strictly before the claim form accident date (image existed before the
 *      incident occurred — strong fraud indicator)
 *
 * Fraud score contribution (0–20):
 *   - DATE_MISMATCH alone:          8 points
 *   - PRE_INCIDENT_IMAGE alone:    15 points
 *   - Both signals:                20 points (capped)
 *
 * The engine is deliberately conservative:
 *   - Missing dates are treated as "unavailable", not as mismatches.
 *   - A 1-day tolerance is applied to claim/police date comparison to account
 *     for timezone differences and report-filing delays.
 *   - Images with no EXIF date are silently skipped (not flagged).
 *   - Vehicle damage photos only — non-vehicle images are excluded.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DateCrossCheckVerdict =
  | 'consistent'          // All available dates are consistent
  | 'mismatch'            // Claim form and police report dates differ
  | 'pre_incident_image'  // At least one photo pre-dates the incident
  | 'both'                // Both mismatch and pre-incident image detected
  | 'insufficient_data';  // Not enough date sources to perform any check

export interface PreIncidentImageDetail {
  /** S3 URL of the photo */
  url: string;
  /** EXIF capture datetime string as returned by exifr */
  captureDateTime: string;
  /** Parsed capture date (UTC midnight) */
  captureDateIso: string;
  /** Incident date from claim form */
  incidentDateIso: string;
  /** Days before incident (positive = before) */
  daysBeforeIncident: number;
}

export interface DateCrossCheckResult {
  /** Overall verdict */
  verdict: DateCrossCheckVerdict;
  /** Fraud score contribution (0–20) */
  fraudScore: number;
  /** Incident date extracted from claim form (ISO YYYY-MM-DD or null) */
  claimFormDate: string | null;
  /** Date from police report (ISO YYYY-MM-DD or null) */
  policeReportDate: string | null;
  /** Whether claim form and police report dates match (null = one or both missing) */
  claimPoliceMatch: boolean | null;
  /** Absolute day difference between claim form and police report dates */
  claimPoliceDayDiff: number | null;
  /** Photos whose EXIF date is before the incident date */
  preIncidentImages: PreIncidentImageDetail[];
  /** Total vehicle damage photos with a parseable EXIF date */
  photosWithExifDate: number;
  /** Human-readable summary for the fraud indicator table */
  summary: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Date parsing helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a date string into a UTC midnight Date object.
 * Handles:
 *   - ISO 8601: "2024-03-15", "2024-03-15T10:30:00Z"
 *   - EXIF format: "2024:03:15 10:30:00"
 *   - DD/MM/YYYY: "15/03/2024"
 *   - DD-MM-YYYY: "15-03-2024"
 *   - DD MMM YYYY: "15 Mar 2024"
 *   - YYYY/MM/DD: "2024/03/15"
 * Returns null if unparseable.
 */
export function parseDate(raw: string | null | undefined): Date | null {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;

  // EXIF format: "YYYY:MM:DD HH:MM:SS"
  const exifMatch = s.match(/^(\d{4}):(\d{2}):(\d{2})(?:\s+\d{2}:\d{2}:\d{2})?/);
  if (exifMatch) {
    const [, y, m, d] = exifMatch;
    return utcMidnight(parseInt(y), parseInt(m), parseInt(d));
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return utcMidnight(parseInt(y), parseInt(m), parseInt(d));
  }

  // YYYY/MM/DD
  const ymd = s.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return utcMidnight(parseInt(y), parseInt(m), parseInt(d));
  }

  // ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return utcMidnight(parseInt(y), parseInt(m), parseInt(d));
  }

  // DD MMM YYYY (e.g. "15 Mar 2024")
  const MONTHS: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  const dmy2 = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
  if (dmy2) {
    const [, d, mon, y] = dmy2;
    const m = MONTHS[mon.toLowerCase().slice(0, 3)];
    if (m) return utcMidnight(parseInt(y), m, parseInt(d));
  }

  return null;
}

function utcMidnight(year: number, month: number, day: number): Date | null {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  if (isNaN(d.getTime())) return null;
  return d;
}

/** Absolute day difference between two UTC-midnight dates */
function dayDiff(a: Date, b: Date): number {
  return Math.round(Math.abs(a.getTime() - b.getTime()) / 86_400_000);
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main engine
// ─────────────────────────────────────────────────────────────────────────────

export interface DateCrossCheckInput {
  /** Accident date from claim form (any parseable format) */
  accidentDate: string | null | undefined;
  /** Date from police report (any parseable format) */
  policeReportDate: string | null | undefined;
  /**
   * Per-photo results from Stage 8 photoForensics.
   * Only vehicle damage photos with a parseable capture_datetime are used.
   */
  photoForensicsResults?: Array<{
    url: string;
    analysisResult?: {
      capture_datetime: string | null;
      is_non_vehicle?: boolean;
    } | null;
  }> | null;
}

export function runAccidentDateCrossCheck(input: DateCrossCheckInput): DateCrossCheckResult {
  const claimDate = parseDate(input.accidentDate);
  const policeDate = parseDate(input.policeReportDate);

  const claimFormDate = claimDate ? toIso(claimDate) : null;
  const policeReportDate = policeDate ? toIso(policeDate) : null;

  // ── Check A: Claim form vs police report date ─────────────────────────────
  let claimPoliceMatch: boolean | null = null;
  let claimPoliceDayDiff: number | null = null;
  let hasDateMismatch = false;

  if (claimDate && policeDate) {
    claimPoliceDayDiff = dayDiff(claimDate, policeDate);
    // Allow 1-day tolerance for timezone/filing-delay differences
    claimPoliceMatch = claimPoliceDayDiff <= 1;
    hasDateMismatch = !claimPoliceMatch;
  }

  // ── Check B: Pre-incident images ──────────────────────────────────────────
  const preIncidentImages: PreIncidentImageDetail[] = [];
  let photosWithExifDate = 0;

  if (claimDate && input.photoForensicsResults) {
    for (const photo of input.photoForensicsResults) {
      const ar = photo.analysisResult;
      if (!ar || ar.is_non_vehicle) continue;  // skip non-vehicle photos
      if (!ar.capture_datetime) continue;       // no EXIF date — skip silently

      const captureDate = parseDate(ar.capture_datetime);
      if (!captureDate) continue;

      photosWithExifDate++;

      // Strictly before incident date (not same day — same-day is consistent)
      if (captureDate.getTime() < claimDate.getTime()) {
        preIncidentImages.push({
          url: photo.url,
          captureDateTime: ar.capture_datetime,
          captureDateIso: toIso(captureDate),
          incidentDateIso: toIso(claimDate),
          daysBeforeIncident: dayDiff(captureDate, claimDate),
        });
      }
    }
  }

  const hasPreIncidentImages = preIncidentImages.length > 0;

  // ── Verdict ───────────────────────────────────────────────────────────────
  let verdict: DateCrossCheckVerdict;
  let fraudScore: number;

  if (!claimDate && !policeDate && photosWithExifDate === 0) {
    verdict = 'insufficient_data';
    fraudScore = 0;
  } else if (hasDateMismatch && hasPreIncidentImages) {
    verdict = 'both';
    fraudScore = 20;
  } else if (hasPreIncidentImages) {
    verdict = 'pre_incident_image';
    fraudScore = 15;
  } else if (hasDateMismatch) {
    verdict = 'mismatch';
    fraudScore = 8;
  } else {
    verdict = 'consistent';
    fraudScore = 0;
  }

  // ── Human-readable summary ────────────────────────────────────────────────
  const summaryParts: string[] = [];

  if (claimPoliceMatch === true) {
    summaryParts.push(`Claim form date (${claimFormDate}) matches police report date (${policeReportDate}).`);
  } else if (claimPoliceMatch === false) {
    summaryParts.push(`Date mismatch: claim form (${claimFormDate}) vs police report (${policeReportDate}) — ${claimPoliceDayDiff} day(s) apart.`);
  } else {
    if (!claimFormDate) summaryParts.push('No accident date on claim form.');
    if (!policeReportDate) summaryParts.push('No date on police report.');
  }

  if (hasPreIncidentImages) {
    summaryParts.push(
      `${preIncidentImages.length} photo(s) have EXIF capture dates before the incident date: ` +
      preIncidentImages.map(p => `${p.captureDateIso} (${p.daysBeforeIncident}d before incident)`).join(', ') + '.'
    );
  } else if (photosWithExifDate > 0) {
    summaryParts.push(`All ${photosWithExifDate} photo(s) with EXIF dates are consistent with the incident date.`);
  }

  if (verdict === 'insufficient_data') {
    summaryParts.push('Insufficient date data available for cross-check.');
  }

  const summary = summaryParts.join(' ') || 'Date cross-check completed.';

  return {
    verdict,
    fraudScore,
    claimFormDate,
    policeReportDate,
    claimPoliceMatch,
    claimPoliceDayDiff,
    preIncidentImages,
    photosWithExifDate,
    summary,
  };
}
