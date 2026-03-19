import { describe, it, expect } from 'vitest';
import {
  estimateMileageFromYear,
  classifyVehicleUsage,
} from './mileageEstimation';

// Fix "current year" to 2026 for deterministic tests
const CURRENT_YEAR = 2026;

describe('classifyVehicleUsage', () => {
  it('classifies pickup trucks as commercial', () => {
    expect(classifyVehicleUsage('Toyota', 'Hilux')).toBe('commercial');
    expect(classifyVehicleUsage('Ford', 'Ranger')).toBe('commercial');
    expect(classifyVehicleUsage('Isuzu', 'D-Max')).toBe('commercial');
  });

  it('classifies vans and buses as commercial', () => {
    expect(classifyVehicleUsage('Mercedes', 'Sprinter')).toBe('commercial');
    expect(classifyVehicleUsage('Toyota', 'Minibus')).toBe('commercial');
  });

  it('classifies BMW, Mercedes, Audi as premium', () => {
    expect(classifyVehicleUsage('BMW', '3 Series')).toBe('premium');
    expect(classifyVehicleUsage('Audi', 'A4')).toBe('premium');
    expect(classifyVehicleUsage('Mercedes-Benz', 'C200')).toBe('premium');
  });

  it('classifies Toyota Corolla as standard', () => {
    expect(classifyVehicleUsage('Toyota', 'Corolla')).toBe('standard');
    expect(classifyVehicleUsage('Honda', 'Civic')).toBe('standard');
  });

  it('handles null/undefined gracefully', () => {
    expect(classifyVehicleUsage(null, null)).toBe('standard');
    expect(classifyVehicleUsage(undefined, undefined)).toBe('standard');
  });
});

describe('estimateMileageFromYear', () => {
  it('returns a range for a standard vehicle', () => {
    // 2021 standard → 5 years → 12k–20k × 5 = 60k–100k
    const result = estimateMileageFromYear(2021, 'Toyota', 'Corolla', CURRENT_YEAR);
    expect(result.estimated_mileage_range[0]).toBe(60_000);
    expect(result.estimated_mileage_range[1]).toBe(100_000);
    expect(result.assumed_mileage_used).toBe(80_000);
    expect(result.confidence).toBe('LOW');
    expect(result.source).toBe('year_based_estimation');
    expect(result.estimated_years).toBe(5);
  });

  it('applies +30% multiplier for commercial vehicles', () => {
    // 2022 Hilux → 4 years → 12k×1.3×4=62.4k → 62k, 20k×1.3×4=104k → 104k
    const result = estimateMileageFromYear(2022, 'Toyota', 'Hilux', CURRENT_YEAR);
    expect(result.estimated_mileage_range[0]).toBe(62_000);
    expect(result.estimated_mileage_range[1]).toBe(104_000);
    expect(result.assumed_mileage_used).toBe(83_000);
  });

  it('applies -15% multiplier for premium vehicles', () => {
    // 2020 BMW → 6 years → 12k×0.85×6=61.2k → 61k, 20k×0.85×6=102k → 102k
    const result = estimateMileageFromYear(2020, 'BMW', '3 Series', CURRENT_YEAR);
    expect(result.estimated_mileage_range[0]).toBe(61_000);
    expect(result.estimated_mileage_range[1]).toBe(102_000);
  });

  it('clamps minimum years to 1 for current-year vehicles', () => {
    const result = estimateMileageFromYear(CURRENT_YEAR, 'Toyota', 'Corolla', CURRENT_YEAR);
    expect(result.estimated_years).toBe(1);
    expect(result.estimated_mileage_range[0]).toBe(12_000);
    expect(result.estimated_mileage_range[1]).toBe(20_000);
  });

  it('clamps minimum years to 1 for future-year vehicles', () => {
    const result = estimateMileageFromYear(CURRENT_YEAR + 2, 'Toyota', 'Corolla', CURRENT_YEAR);
    expect(result.estimated_years).toBe(1);
  });

  it('includes a human-readable warning message', () => {
    const result = estimateMileageFromYear(2021, 'Toyota', 'Corolla', CURRENT_YEAR);
    expect(result.warning_message).toContain('Mileage not provided');
    expect(result.warning_message).toContain('LOW');
    expect(result.warning_message).toContain('5 years');
  });

  it('warning mentions commercial for pickup trucks', () => {
    const result = estimateMileageFromYear(2022, 'Ford', 'Ranger', CURRENT_YEAR);
    expect(result.warning_message).toContain('commercial');
  });

  it('warning mentions premium for luxury vehicles', () => {
    const result = estimateMileageFromYear(2022, 'BMW', 'X5', CURRENT_YEAR);
    expect(result.warning_message).toContain('premium');
  });
});
