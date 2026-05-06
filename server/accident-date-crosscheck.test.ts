/**
 * accident-date-crosscheck.test.ts
 *
 * Tests for accidentDateCrossCheckEngine.ts
 * Covers: date parsing, claim/police mismatch, pre-incident images, combined signals, edge cases.
 */

import { describe, it, expect } from 'vitest';
import {
  parseDate,
  runAccidentDateCrossCheck,
  type DateCrossCheckInput,
} from './pipeline-v2/accidentDateCrossCheckEngine';

// ─────────────────────────────────────────────────────────────────────────────
// parseDate tests
// ─────────────────────────────────────────────────────────────────────────────

describe('parseDate', () => {
  it('parses ISO 8601 date', () => {
    const d = parseDate('2024-03-15');
    expect(d).not.toBeNull();
    expect(d!.toISOString().slice(0, 10)).toBe('2024-03-15');
  });

  it('parses ISO 8601 datetime', () => {
    const d = parseDate('2024-03-15T10:30:00Z');
    expect(d).not.toBeNull();
    expect(d!.toISOString().slice(0, 10)).toBe('2024-03-15');
  });

  it('parses EXIF format YYYY:MM:DD HH:MM:SS', () => {
    const d = parseDate('2024:03:15 10:30:00');
    expect(d).not.toBeNull();
    expect(d!.toISOString().slice(0, 10)).toBe('2024-03-15');
  });

  it('parses DD/MM/YYYY', () => {
    const d = parseDate('15/03/2024');
    expect(d).not.toBeNull();
    expect(d!.toISOString().slice(0, 10)).toBe('2024-03-15');
  });

  it('parses DD-MM-YYYY', () => {
    const d = parseDate('15-03-2024');
    expect(d).not.toBeNull();
    expect(d!.toISOString().slice(0, 10)).toBe('2024-03-15');
  });

  it('parses YYYY/MM/DD', () => {
    const d = parseDate('2024/03/15');
    expect(d).not.toBeNull();
    expect(d!.toISOString().slice(0, 10)).toBe('2024-03-15');
  });

  it('parses DD MMM YYYY', () => {
    const d = parseDate('15 Mar 2024');
    expect(d).not.toBeNull();
    expect(d!.toISOString().slice(0, 10)).toBe('2024-03-15');
  });

  it('returns null for empty string', () => {
    expect(parseDate('')).toBeNull();
  });

  it('returns null for null', () => {
    expect(parseDate(null)).toBeNull();
  });

  it('returns null for garbage string', () => {
    expect(parseDate('not-a-date')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runAccidentDateCrossCheck tests
// ─────────────────────────────────────────────────────────────────────────────

describe('runAccidentDateCrossCheck', () => {
  // ── Consistent cases ──────────────────────────────────────────────────────

  it('returns consistent when claim and police dates match exactly', () => {
    const result = runAccidentDateCrossCheck({
      accidentDate: '2024-03-15',
      policeReportDate: '2024-03-15',
    });
    expect(result.verdict).toBe('consistent');
    expect(result.fraudScore).toBe(0);
    expect(result.claimPoliceMatch).toBe(true);
    expect(result.claimPoliceDayDiff).toBe(0);
  });

  it('returns consistent when dates differ by exactly 1 day (filing delay tolerance)', () => {
    const result = runAccidentDateCrossCheck({
      accidentDate: '2024-03-15',
      policeReportDate: '2024-03-16',
    });
    expect(result.verdict).toBe('consistent');
    expect(result.fraudScore).toBe(0);
    expect(result.claimPoliceMatch).toBe(true);
    expect(result.claimPoliceDayDiff).toBe(1);
  });

  it('returns consistent when all photos are taken on or after incident date', () => {
    const result = runAccidentDateCrossCheck({
      accidentDate: '2024-03-15',
      policeReportDate: '2024-03-15',
      photoForensicsResults: [
        { url: 'https://s3.example.com/photo1.jpg', analysisResult: { capture_datetime: '2024:03:15 14:00:00', is_non_vehicle: false } },
        { url: 'https://s3.example.com/photo2.jpg', analysisResult: { capture_datetime: '2024:03:16 09:00:00', is_non_vehicle: false } },
      ],
    });
    expect(result.verdict).toBe('consistent');
    expect(result.fraudScore).toBe(0);
    expect(result.preIncidentImages).toHaveLength(0);
    expect(result.photosWithExifDate).toBe(2);
  });

  // ── Date mismatch cases ───────────────────────────────────────────────────

  it('returns mismatch when claim and police dates differ by more than 1 day', () => {
    const result = runAccidentDateCrossCheck({
      accidentDate: '2024-03-15',
      policeReportDate: '2024-03-20',
    });
    expect(result.verdict).toBe('mismatch');
    expect(result.fraudScore).toBe(8);
    expect(result.claimPoliceMatch).toBe(false);
    expect(result.claimPoliceDayDiff).toBe(5);
  });

  it('mismatch summary contains both dates and day difference', () => {
    const result = runAccidentDateCrossCheck({
      accidentDate: '2024-03-15',
      policeReportDate: '2024-03-20',
    });
    expect(result.summary).toContain('2024-03-15');
    expect(result.summary).toContain('2024-03-20');
    expect(result.summary).toContain('5 day');
  });

  // ── Pre-incident image cases ──────────────────────────────────────────────

  it('returns pre_incident_image when a photo EXIF date is before incident date', () => {
    const result = runAccidentDateCrossCheck({
      accidentDate: '2024-03-15',
      policeReportDate: '2024-03-15',
      photoForensicsResults: [
        { url: 'https://s3.example.com/old.jpg', analysisResult: { capture_datetime: '2024:03:10 08:00:00', is_non_vehicle: false } },
        { url: 'https://s3.example.com/new.jpg', analysisResult: { capture_datetime: '2024:03:15 14:00:00', is_non_vehicle: false } },
      ],
    });
    expect(result.verdict).toBe('pre_incident_image');
    expect(result.fraudScore).toBe(15);
    expect(result.preIncidentImages).toHaveLength(1);
    expect(result.preIncidentImages[0].url).toBe('https://s3.example.com/old.jpg');
    expect(result.preIncidentImages[0].daysBeforeIncident).toBe(5);
  });

  it('skips non-vehicle photos when checking pre-incident images', () => {
    const result = runAccidentDateCrossCheck({
      accidentDate: '2024-03-15',
      photoForensicsResults: [
        // This is a document scan — should be ignored
        { url: 'https://s3.example.com/doc.jpg', analysisResult: { capture_datetime: '2024:01:01 00:00:00', is_non_vehicle: true } },
      ],
    });
    // Non-vehicle photo should not trigger pre_incident_image
    expect(result.preIncidentImages).toHaveLength(0);
    expect(result.photosWithExifDate).toBe(0);
  });

  it('skips photos with no EXIF date and returns consistent when no fraud found', () => {
    const result = runAccidentDateCrossCheck({
      accidentDate: '2024-03-15',
      photoForensicsResults: [
        { url: 'https://s3.example.com/no-exif.jpg', analysisResult: { capture_datetime: null, is_non_vehicle: false } },
      ],
    });
    expect(result.preIncidentImages).toHaveLength(0);
    expect(result.photosWithExifDate).toBe(0);
    // Engine has accidentDate but no police date and no EXIF photos — no fraud signal, consistent
    expect(result.fraudScore).toBe(0);
  });

  // ── Combined signal cases ─────────────────────────────────────────────────

  it('returns both when date mismatch AND pre-incident image are detected', () => {
    const result = runAccidentDateCrossCheck({
      accidentDate: '2024-03-15',
      policeReportDate: '2024-03-25',  // 10 days apart — mismatch
      photoForensicsResults: [
        { url: 'https://s3.example.com/old.jpg', analysisResult: { capture_datetime: '2024:03:10 08:00:00', is_non_vehicle: false } },
      ],
    });
    expect(result.verdict).toBe('both');
    expect(result.fraudScore).toBe(20);
    expect(result.preIncidentImages).toHaveLength(1);
    expect(result.claimPoliceMatch).toBe(false);
  });

  // ── Insufficient data cases ───────────────────────────────────────────────

  it('returns insufficient_data when no dates are available', () => {
    const result = runAccidentDateCrossCheck({
      accidentDate: null,
      policeReportDate: null,
    });
    expect(result.verdict).toBe('insufficient_data');
    expect(result.fraudScore).toBe(0);
    expect(result.claimPoliceMatch).toBeNull();
  });

  it('does not flag mismatch when only one date is available', () => {
    const result = runAccidentDateCrossCheck({
      accidentDate: '2024-03-15',
      policeReportDate: null,
    });
    // Can't compare — should not flag as mismatch
    expect(result.claimPoliceMatch).toBeNull();
    expect(result.claimPoliceDayDiff).toBeNull();
    expect(result.fraudScore).toBe(0);
  });

  // ── Date format robustness ────────────────────────────────────────────────

  it('handles DD/MM/YYYY claim date and EXIF photo date correctly', () => {
    const result = runAccidentDateCrossCheck({
      accidentDate: '15/03/2024',
      policeReportDate: '2024-03-15',
      photoForensicsResults: [
        { url: 'https://s3.example.com/photo.jpg', analysisResult: { capture_datetime: '2024:03:14 23:59:59', is_non_vehicle: false } },
      ],
    });
    expect(result.claimPoliceMatch).toBe(true);
    expect(result.preIncidentImages).toHaveLength(1);
    expect(result.verdict).toBe('pre_incident_image');
  });

  // ── Score capping ─────────────────────────────────────────────────────────

  it('caps fraud score at 20 for combined signals', () => {
    const result = runAccidentDateCrossCheck({
      accidentDate: '2024-03-15',
      policeReportDate: '2024-04-15',  // 31 days apart
      photoForensicsResults: [
        { url: 'https://s3.example.com/p1.jpg', analysisResult: { capture_datetime: '2024:01:01 00:00:00', is_non_vehicle: false } },
        { url: 'https://s3.example.com/p2.jpg', analysisResult: { capture_datetime: '2024:02:01 00:00:00', is_non_vehicle: false } },
      ],
    });
    expect(result.fraudScore).toBe(20);
    expect(result.fraudScore).toBeLessThanOrEqual(20);
  });
});
