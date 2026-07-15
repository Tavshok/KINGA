import { describe, it, expect } from 'vitest';
import {
  normaliseVisionComponentName,
  normaliseVisionComponentNames,
  normaliseEnrichedPhotos,
} from './services/visionTermNormaliser';

describe('normaliseVisionComponentName', () => {
  // Core Wing → Fender cases (confirmed from real corpus)
  it('normalises "LH Front Wing" to "LH Front Fender"', () => {
    expect(normaliseVisionComponentName('LH Front Wing')).toBe('LH Front Fender');
  });
  it('normalises "RH Front Wing" to "RH Front Fender"', () => {
    expect(normaliseVisionComponentName('RH Front Wing')).toBe('RH Front Fender');
  });
  it('normalises "LH Rear Wing" to "LH Rear Fender"', () => {
    expect(normaliseVisionComponentName('LH Rear Wing')).toBe('LH Rear Fender');
  });
  it('normalises "RH Rear Wing" to "RH Rear Fender"', () => {
    expect(normaliseVisionComponentName('RH Rear Wing')).toBe('RH Rear Fender');
  });
  it('normalises standalone "Wing" to "Fender"', () => {
    expect(normaliseVisionComponentName('Wing')).toBe('Fender');
  });
  it('normalises "Front Wing" to "Front Fender"', () => {
    expect(normaliseVisionComponentName('Front Wing')).toBe('Front Fender');
  });

  // Terms that should NOT be changed (real documents also use these)
  it('does not change "Bonnet"', () => {
    expect(normaliseVisionComponentName('Bonnet')).toBe('Bonnet');
  });
  it('does not change "Windscreen"', () => {
    expect(normaliseVisionComponentName('Windscreen')).toBe('Windscreen');
  });
  it('does not change "Boot Lid"', () => {
    expect(normaliseVisionComponentName('Boot Lid')).toBe('Boot Lid');
  });
  it('does not change "LH Sill"', () => {
    expect(normaliseVisionComponentName('LH Sill')).toBe('LH Sill');
  });
  it('does not change "Tyre"', () => {
    expect(normaliseVisionComponentName('Tyre')).toBe('Tyre');
  });
  it('does not change "Front Bumper Bar"', () => {
    expect(normaliseVisionComponentName('Front Bumper Bar')).toBe('Front Bumper Bar');
  });
  it('does not change "Radiator"', () => {
    expect(normaliseVisionComponentName('Radiator')).toBe('Radiator');
  });
  it('does not change "Driver Airbag"', () => {
    expect(normaliseVisionComponentName('Driver Airbag')).toBe('Driver Airbag');
  });

  // Word boundary safety — must NOT match partial words
  it('does not change "Swing arm"', () => {
    expect(normaliseVisionComponentName('Swing arm')).toBe('Swing arm');
  });
  it('does not change "Awning"', () => {
    expect(normaliseVisionComponentName('Awning')).toBe('Awning');
  });
  it('does not change "Towing bracket"', () => {
    expect(normaliseVisionComponentName('Towing bracket')).toBe('Towing bracket');
  });

  // Edge cases
  it('handles empty string', () => {
    expect(normaliseVisionComponentName('')).toBe('');
  });
  it('handles null gracefully', () => {
    expect(normaliseVisionComponentName(null as unknown as string)).toBe(null);
  });
});

describe('normaliseVisionComponentNames', () => {
  it('normalises an array of names', () => {
    const input = ['LH Front Wing', 'Bonnet', 'RH Front Wing', 'Windscreen', 'Radiator'];
    const expected = ['LH Front Fender', 'Bonnet', 'RH Front Fender', 'Windscreen', 'Radiator'];
    expect(normaliseVisionComponentNames(input)).toEqual(expected);
  });

  it('returns empty array for empty input', () => {
    expect(normaliseVisionComponentNames([])).toEqual([]);
  });
});

describe('normaliseEnrichedPhotos', () => {
  it('normalises detectedComponents in each photo', () => {
    const input = [
      { url: 'https://example.com/1.jpg', detectedComponents: ['LH Front Wing', 'Bonnet', 'Radiator'] },
      { url: 'https://example.com/2.jpg', detectedComponents: ['RH Front Wing', 'Front Bumper Bar'] },
      { url: 'https://example.com/3.jpg', detectedComponents: [] },
      { url: 'https://example.com/4.jpg' }, // no detectedComponents field
    ];
    const result = normaliseEnrichedPhotos(input);
    expect(result[0].detectedComponents).toEqual(['LH Front Fender', 'Bonnet', 'Radiator']);
    expect(result[1].detectedComponents).toEqual(['RH Front Fender', 'Front Bumper Bar']);
    expect(result[2].detectedComponents).toEqual([]);
    expect(result[3].detectedComponents).toBeUndefined();
  });

  it('does not mutate the original array', () => {
    const input = [{ url: 'x', detectedComponents: ['LH Front Wing'] }];
    normaliseEnrichedPhotos(input);
    expect(input[0].detectedComponents).toEqual(['LH Front Wing']); // unchanged
  });
});
