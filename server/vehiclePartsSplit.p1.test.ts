import { describe, expect, it } from 'vitest';
import {
  VEHICLE_PARTS,
  getPartsByZone,
  getSubParts,
  isPlausiblePartName,
  resolveComponent,
  resolveToCanonical,
  resolveToCanonicalId,
} from '../shared/vehicleParts';

describe('vehicle-parts barrel split', () => {
  it('keeps taxonomy lookup and canonicalisation behaviour at the legacy path', () => {
    expect(VEHICLE_PARTS.length).toBeGreaterThan(100);
    expect(resolveComponent('front bumper')?.id).toBe('front_bumper');
    expect(resolveToCanonical('front bumper cover')).toBe('Front Bumper');
    expect(resolveToCanonicalId('front bumper cover')).toBe('front_bumper');
    expect(getSubParts('front bumper').length).toBeGreaterThan(0);
    expect(getPartsByZone('front').some((part) => part.id === 'front_bumper')).toBe(true);
    expect(isPlausiblePartName('radiator support')).toBe('plausible');
  });
});
