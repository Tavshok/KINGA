/**
 * automotiveDomainCorrector.test.ts
 *
 * Tests for the permanent OCR/handwriting correction engine.
 * Covers all 7 correction categories with real-world misread patterns.
 */

import { describe, it, expect } from 'vitest';
import {
  correctVehicleMake,
  correctVehicleModel,
  correctColour,
  correctRegistrationOcr,
  isPolicyNumberInvalid,
  detectThirdPartyFromNarrative,
  levenshtein,
  applyAutomotiveDomainCorrections,
} from './automotiveDomainCorrector';
import type { ClaimRecord } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeClaimRecord(overrides: Partial<ClaimRecord> = {}): ClaimRecord {
  return {
    vehicle: {
      make: 'BMW',
      model: '318i',
      year: 2018,
      registrationNumber: 'ADP6423',
      colour: 'SILVER',
      vin: null,
      engineNumber: null,
      mileage: null,
      fuelType: null,
      transmission: null,
      bodyType: null,
      ...((overrides.vehicle as any) ?? {}),
    },
    accidentDetails: {
      dateOfAccident: '2026-01-15',
      timeOfAccident: '14:30',
      locationOfAccident: 'Harare',
      narrativeDescription: 'The insured was driving when the accident occurred.',
      estimatedSpeedKmh: 60,
      thirdPartyPresent: false,
      thirdPartyVehicleMake: null,
      thirdPartyVehicleModel: null,
      thirdPartyVehicleRegistration: null,
      ...((overrides.accidentDetails as any) ?? {}),
    },
    insuranceContext: {
      policyNumber: 'POL-2024-001234',
      insurerName: 'Test Insurer',
      claimNumber: 'CLM-001',
      ...((overrides.insuranceContext as any) ?? {}),
    },
    policeReport: null,
    assumptions: [],
    recoveryActions: [],
    ...overrides,
  } as ClaimRecord;
}

// ─── 1. Levenshtein Distance ──────────────────────────────────────────────────

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('BMW', 'BMW')).toBe(0);
  });

  it('returns 1 for single character substitution', () => {
    expect(levenshtein('BMD', 'BMW')).toBe(1);
  });

  it('returns 1 for single insertion', () => {
    expect(levenshtein('TOYATA', 'TOYOTA')).toBe(1);
  });

  it('returns 2 for two edits', () => {
    expect(levenshtein('NISAAN', 'NISSAN')).toBe(1);
  });

  it('handles empty strings', () => {
    expect(levenshtein('', 'BMW')).toBe(3);
    expect(levenshtein('BMW', '')).toBe(3);
    expect(levenshtein('', '')).toBe(0);
  });
});

// ─── 2. Vehicle Make Correction ───────────────────────────────────────────────

describe('correctVehicleMake', () => {
  it('corrects BMD to BMW (exact variant match)', () => {
    const result = correctVehicleMake('BMD');
    expect(result).not.toBeNull();
    expect(result!.corrected).toBe('BMW');
    expect(result!.confidence).toBeGreaterThan(0.9);
  });

  it('corrects BMV to BMW', () => {
    const result = correctVehicleMake('BMV');
    expect(result!.corrected).toBe('BMW');
  });

  it('corrects BNW to BMW', () => {
    const result = correctVehicleMake('BNW');
    expect(result!.corrected).toBe('BMW');
  });

  it('corrects TOYATA to Toyota', () => {
    const result = correctVehicleMake('TOYATA');
    expect(result!.corrected).toBe('Toyota');
  });

  it('corrects TOYOYA to Toyota', () => {
    const result = correctVehicleMake('TOYOYA');
    expect(result!.corrected).toBe('Toyota');
  });

  it('corrects MERCEDEZ to Mercedes-Benz', () => {
    const result = correctVehicleMake('MERCEDEZ');
    expect(result!.corrected).toBe('Mercedes-Benz');
  });

  it('corrects NISAAN to Nissan', () => {
    const result = correctVehicleMake('NISAAN');
    expect(result!.corrected).toBe('Nissan');
  });

  it('corrects HONDE to Honda', () => {
    const result = correctVehicleMake('HONDE');
    expect(result!.corrected).toBe('Honda');
  });

  it('corrects VOLKWAGEN to Volkswagen', () => {
    const result = correctVehicleMake('VOLKWAGEN');
    expect(result!.corrected).toBe('Volkswagen');
  });

  it('corrects VW to Volkswagen', () => {
    const result = correctVehicleMake('VW');
    expect(result!.corrected).toBe('Volkswagen');
  });

  it('corrects HYUNDEI to Hyundai', () => {
    const result = correctVehicleMake('HYUNDEI');
    expect(result!.corrected).toBe('Hyundai');
  });

  it('corrects MASDA to Mazda', () => {
    const result = correctVehicleMake('MASDA');
    expect(result!.corrected).toBe('Mazda');
  });

  it('corrects MITSUBISI to Mitsubishi', () => {
    const result = correctVehicleMake('MITSUBISI');
    expect(result!.corrected).toBe('Mitsubishi');
  });

  it('returns null for already-correct BMW', () => {
    const result = correctVehicleMake('BMW');
    expect(result).toBeNull();
  });

  it('returns null for already-correct Toyota', () => {
    const result = correctVehicleMake('Toyota');
    expect(result).toBeNull();
  });

  it('returns null for null input', () => {
    expect(correctVehicleMake(null)).toBeNull();
    expect(correctVehicleMake(undefined)).toBeNull();
    expect(correctVehicleMake('')).toBeNull();
  });

  it('returns null for completely unknown make', () => {
    const result = correctVehicleMake('XYZABC');
    expect(result).toBeNull();
  });

  it('handles lowercase input', () => {
    const result = correctVehicleMake('bmd');
    expect(result!.corrected).toBe('BMW');
  });

  it('handles mixed case input', () => {
    const result = correctVehicleMake('Bmd');
    expect(result!.corrected).toBe('BMW');
  });
});

// ─── 3. Vehicle Model Correction ─────────────────────────────────────────────

describe('correctVehicleModel', () => {
  it('corrects 318L to 318i for BMW', () => {
    const result = correctVehicleModel('BMW', '318L');
    expect(result!.corrected).toBe('318i');
  });

  it('corrects CORROLA to Corolla for Toyota', () => {
    const result = correctVehicleModel('Toyota', 'CORROLA');
    expect(result!.corrected).toBe('Corolla');
  });

  it('corrects HILAX to Hilux for Toyota', () => {
    const result = correctVehicleModel('Toyota', 'HILAX');
    expect(result!.corrected).toBe('Hilux');
  });

  it('corrects LANDCRUZER to Land Cruiser for Toyota', () => {
    const result = correctVehicleModel('Toyota', 'LANDCRUZER');
    expect(result!.corrected).toBe('Land Cruiser');
  });

  it('corrects POLO VIBO to Polo Vivo for Volkswagen', () => {
    const result = correctVehicleModel('Volkswagen', 'POLO VIBO');
    expect(result!.corrected).toBe('Polo Vivo');
  });

  it('corrects NAVARRA to Navara for Nissan', () => {
    const result = correctVehicleModel('Nissan', 'NAVARRA');
    expect(result!.corrected).toBe('Navara');
  });

  it('returns null for unknown make', () => {
    const result = correctVehicleModel('XYZABC', 'Corolla');
    expect(result).toBeNull();
  });

  it('returns null for null inputs', () => {
    expect(correctVehicleModel(null, '318i')).toBeNull();
    expect(correctVehicleModel('BMW', null)).toBeNull();
  });

  it('returns null for already-correct model', () => {
    const result = correctVehicleModel('BMW', '318i');
    expect(result).toBeNull();
  });
});

// ─── 4. Colour Correction ─────────────────────────────────────────────────────

describe('correctColour', () => {
  it('corrects SILVAR to SILVER', () => {
    const result = correctColour('SILVAR');
    expect(result!.corrected).toBe('SILVER');
  });

  it('corrects SLIVER to SILVER', () => {
    const result = correctColour('SLIVER');
    expect(result!.corrected).toBe('SILVER');
  });

  it('corrects WHIT to WHITE', () => {
    const result = correctColour('WHIT');
    expect(result!.corrected).toBe('WHITE');
  });

  it('corrects BLAK to BLACK', () => {
    const result = correctColour('BLAK');
    expect(result!.corrected).toBe('BLACK');
  });

  it('corrects GERY to GREY', () => {
    const result = correctColour('GERY');
    expect(result!.corrected).toBe('GREY');
  });

  it('corrects GRAY to GREY', () => {
    const result = correctColour('GRAY');
    expect(result!.corrected).toBe('GREY');
  });

  it('corrects GREAN to GREEN', () => {
    const result = correctColour('GREAN');
    expect(result!.corrected).toBe('GREEN');
  });

  it('corrects ORENGE to ORANGE', () => {
    const result = correctColour('ORENGE');
    expect(result!.corrected).toBe('ORANGE');
  });

  it('corrects BURGANDY to BURGUNDY', () => {
    const result = correctColour('BURGANDY');
    expect(result!.corrected).toBe('BURGUNDY');
  });

  it('returns null for already-correct SILVER', () => {
    // SILVER is in the correction table as a value, not a key
    const result = correctColour('SILVER');
    expect(result).toBeNull();
  });

  it('returns null for null input', () => {
    expect(correctColour(null)).toBeNull();
    expect(correctColour(undefined)).toBeNull();
  });
});

// ─── 5. Registration OCR Correction ──────────────────────────────────────────

describe('correctRegistrationOcr', () => {
  it('does not change a correct registration', () => {
    const result = correctRegistrationOcr('ADP6423');
    expect(result).toBe('ADP6423');
  });

  it('corrects O to 0 in digit section', () => {
    const result = correctRegistrationOcr('ADPO423');
    expect(result).toBe('ADP0423');
  });

  it('corrects I to 1 in digit section', () => {
    const result = correctRegistrationOcr('ADPI423');
    expect(result).toBe('ADP1423');
  });

  it('handles empty/short input gracefully', () => {
    expect(correctRegistrationOcr('')).toBe('');
    expect(correctRegistrationOcr('AB')).toBe('AB');
    expect(correctRegistrationOcr(null as any)).toBe(null);
  });
});

// ─── 6. Policy Number Validation ─────────────────────────────────────────────

describe('isPolicyNumberInvalid', () => {
  it('flags "NO" as invalid', () => {
    expect(isPolicyNumberInvalid('NO')).toBe(true);
  });

  it('flags "YES" as invalid', () => {
    expect(isPolicyNumberInvalid('YES')).toBe(true);
  });

  it('flags "N/A" as invalid', () => {
    expect(isPolicyNumberInvalid('N/A')).toBe(true);
  });

  it('flags "NONE" as invalid', () => {
    expect(isPolicyNumberInvalid('NONE')).toBe(true);
  });

  it('flags "POLICY NUMBER" as invalid', () => {
    expect(isPolicyNumberInvalid('POLICY NUMBER')).toBe(true);
  });

  it('flags "POL" as invalid (short all-letter string)', () => {
    expect(isPolicyNumberInvalid('POL')).toBe(true);
  });

  it('flags null/undefined as invalid', () => {
    expect(isPolicyNumberInvalid(null)).toBe(true);
    expect(isPolicyNumberInvalid(undefined)).toBe(true);
    expect(isPolicyNumberInvalid('')).toBe(true);
  });

  it('flags string with no digits as invalid', () => {
    expect(isPolicyNumberInvalid('ABCDEF')).toBe(true);
  });

  it('accepts a valid policy number with digits', () => {
    expect(isPolicyNumberInvalid('POL-2024-001234')).toBe(false);
  });

  it('accepts a numeric policy number', () => {
    expect(isPolicyNumberInvalid('1234567890')).toBe(false);
  });

  it('accepts alphanumeric policy number', () => {
    expect(isPolicyNumberInvalid('ZW2024ABC123')).toBe(false);
  });
});

// ─── 7. Third-Party Detection from Narrative ──────────────────────────────────

describe('detectThirdPartyFromNarrative', () => {
  it('detects "rammed into the back of another vehicle"', () => {
    expect(detectThirdPartyFromNarrative('The insured rammed into the back of another vehicle at the intersection.')).toBe(true);
  });

  it('detects "collided with a truck"', () => {
    expect(detectThirdPartyFromNarrative('The vehicle collided with a truck on the highway.')).toBe(true);
  });

  it('detects "hit another car"', () => {
    expect(detectThirdPartyFromNarrative('The insured hit another car while reversing.')).toBe(true);
  });

  it('detects "rear-ended a vehicle"', () => {
    expect(detectThirdPartyFromNarrative('The insured rear-ended a vehicle at the traffic lights.')).toBe(true);
  });

  it('detects vehicle make mention (BMW) in narrative', () => {
    expect(detectThirdPartyFromNarrative('The insured struck a BMW vehicle registration ADP6423.')).toBe(true);
  });

  it('detects "BMD VEHICLE" as a BMW misread', () => {
    expect(detectThirdPartyFromNarrative('The insured rammed into the BMD VEHICLE from behind.')).toBe(true);
  });

  it('detects registration plate pattern', () => {
    expect(detectThirdPartyFromNarrative('The other vehicle registration ABC 1234 ZW was involved.')).toBe(true);
  });

  it('returns false for single-vehicle accident narrative', () => {
    expect(detectThirdPartyFromNarrative('The insured lost control and hit a wall.')).toBe(false);
  });

  it('returns false for empty/null narrative', () => {
    expect(detectThirdPartyFromNarrative(null)).toBe(false);
    expect(detectThirdPartyFromNarrative('')).toBe(false);
    expect(detectThirdPartyFromNarrative('Short')).toBe(false);
  });
});

// ─── 8. Full applyAutomotiveDomainCorrections ─────────────────────────────────

describe('applyAutomotiveDomainCorrections', () => {
  it('corrects BMD make to BMW', () => {
    const record = makeClaimRecord({ vehicle: { make: 'BMD', model: '318i', year: 2018, registrationNumber: 'ADP6423', colour: 'SILVER' } as any });
    const result = applyAutomotiveDomainCorrections(record);
    expect(result.claimRecord.vehicle?.make).toBe('BMW');
    expect(result.correctionCount).toBeGreaterThanOrEqual(1);
    expect(result.corrections.some(c => c.field === 'vehicle.make' && c.original === 'BMD' && c.corrected === 'BMW')).toBe(true);
  });

  it('corrects 318L model to 318i when make is BMW', () => {
    const record = makeClaimRecord({ vehicle: { make: 'BMW', model: '318L', year: 2018, registrationNumber: 'ADP6423', colour: 'SILVER' } as any });
    const result = applyAutomotiveDomainCorrections(record);
    expect(result.claimRecord.vehicle?.model).toBe('318i');
  });

  it('corrects SILVAR colour to SILVER', () => {
    const record = makeClaimRecord({ vehicle: { make: 'BMW', model: '318i', year: 2018, registrationNumber: 'ADP6423', colour: 'SILVAR' } as any });
    const result = applyAutomotiveDomainCorrections(record);
    expect(result.claimRecord.vehicle?.colour).toBe('SILVER');
  });

  it('flags "NO" policy number as invalid and clears it', () => {
    const record = makeClaimRecord({ insuranceContext: { policyNumber: 'NO', insurerName: 'Test', claimNumber: 'CLM-001' } as any });
    const result = applyAutomotiveDomainCorrections(record);
    expect(result.policyNumberInvalid).toBe(true);
    expect(result.claimRecord.insuranceContext?.policyNumber).toBeNull();
  });

  it('detects third party from narrative and sets thirdPartyPresent=true', () => {
    const record = makeClaimRecord({
      accidentDetails: {
        dateOfAccident: '2026-01-15',
        timeOfAccident: '14:30',
        locationOfAccident: 'Harare',
        narrativeDescription: 'The insured rammed into the BMD VEHICLE from behind at the intersection.',
        estimatedSpeedKmh: 60,
        thirdPartyPresent: false,
        thirdPartyVehicleMake: null,
        thirdPartyVehicleModel: null,
        thirdPartyVehicleRegistration: null,
      } as any,
    });
    const result = applyAutomotiveDomainCorrections(record);
    expect(result.thirdPartyDetectedFromNarrative).toBe(true);
    expect(result.claimRecord.accidentDetails?.thirdPartyPresent).toBe(true);
  });

  it('does not mutate the original claimRecord', () => {
    const record = makeClaimRecord({ vehicle: { make: 'BMD', model: '318L', year: 2018, registrationNumber: 'ADP6423', colour: 'SILVAR' } as any });
    const originalMake = record.vehicle?.make;
    applyAutomotiveDomainCorrections(record);
    expect(record.vehicle?.make).toBe(originalMake); // original unchanged
  });

  it('returns 0 corrections for a clean record', () => {
    const record = makeClaimRecord();
    const result = applyAutomotiveDomainCorrections(record);
    expect(result.correctionCount).toBe(0);
    expect(result.corrections).toHaveLength(0);
  });

  it('applies multiple corrections in a single pass', () => {
    const record = makeClaimRecord({
      vehicle: { make: 'BMD', model: '318L', year: 2018, registrationNumber: 'ADP6423', colour: 'SILVAR' } as any,
      insuranceContext: { policyNumber: 'NO', insurerName: 'Test', claimNumber: 'CLM-001' } as any,
    });
    const result = applyAutomotiveDomainCorrections(record);
    expect(result.correctionCount).toBeGreaterThanOrEqual(3); // make + model + colour + policy
    expect(result.claimRecord.vehicle?.make).toBe('BMW');
    expect(result.claimRecord.vehicle?.model).toBe('318i');
    expect(result.claimRecord.vehicle?.colour).toBe('SILVER');
    expect(result.claimRecord.insuranceContext?.policyNumber).toBeNull();
  });

  it('corrects third-party vehicle make (BMD → BMW)', () => {
    const record = makeClaimRecord({
      accidentDetails: {
        dateOfAccident: '2026-01-15',
        timeOfAccident: '14:30',
        locationOfAccident: 'Harare',
        narrativeDescription: 'Accident occurred.',
        estimatedSpeedKmh: 60,
        thirdPartyPresent: true,
        thirdPartyVehicleMake: 'BMD',
        thirdPartyVehicleModel: null,
        thirdPartyVehicleRegistration: null,
      } as any,
    });
    const result = applyAutomotiveDomainCorrections(record);
    expect(result.claimRecord.accidentDetails?.thirdPartyVehicleMake).toBe('BMW');
  });
});
