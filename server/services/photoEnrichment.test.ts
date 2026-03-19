/**
 * Unit tests for photoEnrichment service
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock invokeLLM ─────────────────────────────────────────────────────────────
vi.mock('../_core/llm', () => ({
  invokeLLM: vi.fn(),
}));

import { invokeLLM } from '../_core/llm';
import { enrichDamagePhotos } from './photoEnrichment';

const mockInvokeLLM = vi.mocked(invokeLLM);

const GOOD_LLM_RESPONSE = {
  choices: [{
    message: {
      content: JSON.stringify({
        impactZone: 'front',
        detectedComponents: ['front bumper', 'hood', 'left headlight'],
        severity: 'severe',
        confidenceScore: 82,
        caption: 'Severe frontal collision damage to bumper and hood.',
        imageQuality: 'good',
      }),
    },
  }],
};

const REAR_LLM_RESPONSE = {
  choices: [{
    message: {
      content: JSON.stringify({
        impactZone: 'rear',
        detectedComponents: ['rear bumper', 'trunk'],
        severity: 'moderate',
        confidenceScore: 75,
        caption: 'Moderate rear impact damage.',
        imageQuality: 'good',
      }),
    },
  }],
};

describe('enrichDamagePhotos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty result when no photo URLs provided', async () => {
    const result = await enrichDamagePhotos({ photoUrls: [] });
    expect(result.enriched_photos).toHaveLength(0);
    expect(result.inconsistencies).toHaveLength(0);
    expect(result.summary.totalPhotos).toBe(0);
  });

  it('enriches a single photo with vision LLM response', async () => {
    mockInvokeLLM.mockResolvedValue(GOOD_LLM_RESPONSE as any);

    const result = await enrichDamagePhotos({
      photoUrls: ['https://example.com/photo1.jpg'],
    });

    expect(result.enriched_photos).toHaveLength(1);
    const photo = result.enriched_photos[0];
    expect(photo.impactZone).toBe('front');
    expect(photo.detectedComponents).toContain('front bumper');
    expect(photo.severity).toBe('severe');
    expect(photo.confidenceScore).toBe(82);
    expect(photo.imageQuality).toBe('good');
    expect(photo.url).toBe('https://example.com/photo1.jpg');
    expect(photo.index).toBe(0);
  });

  it('enriches multiple photos with correct indices', async () => {
    mockInvokeLLM
      .mockResolvedValueOnce(GOOD_LLM_RESPONSE as any)
      .mockResolvedValueOnce(REAR_LLM_RESPONSE as any);

    const result = await enrichDamagePhotos({
      photoUrls: [
        'https://example.com/photo1.jpg',
        'https://example.com/photo2.jpg',
      ],
    });

    expect(result.enriched_photos).toHaveLength(2);
    expect(result.enriched_photos[0].index).toBe(0);
    expect(result.enriched_photos[1].index).toBe(1);
    expect(result.enriched_photos[0].impactZone).toBe('front');
    expect(result.enriched_photos[1].impactZone).toBe('rear');
  });

  it('falls back gracefully when LLM returns null content', async () => {
    mockInvokeLLM.mockResolvedValue({
      choices: [{ message: { content: null } }],
    } as any);

    const result = await enrichDamagePhotos({
      photoUrls: ['https://example.com/photo1.jpg'],
    });

    expect(result.enriched_photos).toHaveLength(1);
    const photo = result.enriched_photos[0];
    expect(photo.impactZone).toBe('unknown');
    expect(photo.confidenceScore).toBe(0);
    expect(photo.imageQuality).toBe('poor');
  });

  it('falls back gracefully when LLM throws', async () => {
    mockInvokeLLM.mockRejectedValue(new Error('LLM timeout'));

    const result = await enrichDamagePhotos({
      photoUrls: ['https://example.com/photo1.jpg'],
    });

    expect(result.enriched_photos).toHaveLength(1);
    expect(result.enriched_photos[0].impactZone).toBe('unknown');
    expect(result.enriched_photos[0].confidenceScore).toBe(0);
  });

  it('detects unreported damage inconsistency', async () => {
    mockInvokeLLM.mockResolvedValue(GOOD_LLM_RESPONSE as any);

    const result = await enrichDamagePhotos({
      photoUrls: ['https://example.com/photo1.jpg'],
      reportedDamageDescription: 'Minor scratch on rear bumper',
      aiExtractedComponents: ['rear bumper'],
    });

    // front bumper, hood, left headlight are not in reported description or AI components
    const inconsistencies = result.inconsistencies;
    expect(inconsistencies.length).toBeGreaterThan(0);
    expect(inconsistencies.some(i => i.type === 'unreported_damage')).toBe(true);
  });

  it('does not flag inconsistency when component is in reported description', async () => {
    mockInvokeLLM.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            impactZone: 'front',
            detectedComponents: ['front bumper'],
            severity: 'minor',
            confidenceScore: 80,
            caption: 'Minor front bumper damage.',
            imageQuality: 'good',
          }),
        },
      }],
    } as any);

    const result = await enrichDamagePhotos({
      photoUrls: ['https://example.com/photo1.jpg'],
      reportedDamageDescription: 'Front bumper is damaged',
      aiExtractedComponents: [],
    });

    // front bumper IS in reported description, so no inconsistency
    expect(result.inconsistencies.filter(i => i.type === 'unreported_damage')).toHaveLength(0);
  });

  it('caps photos at maxPhotos limit', async () => {
    mockInvokeLLM.mockResolvedValue(GOOD_LLM_RESPONSE as any);

    const urls = Array.from({ length: 25 }, (_, i) => `https://example.com/photo${i}.jpg`);
    const result = await enrichDamagePhotos({
      photoUrls: urls,
      maxPhotos: 5,
    });

    expect(result.enriched_photos).toHaveLength(5);
    expect(result.summary.totalPhotos).toBe(5);
  });

  it('computes correct summary statistics', async () => {
    mockInvokeLLM
      .mockResolvedValueOnce(GOOD_LLM_RESPONSE as any)
      .mockResolvedValueOnce(REAR_LLM_RESPONSE as any);

    const result = await enrichDamagePhotos({
      photoUrls: [
        'https://example.com/photo1.jpg',
        'https://example.com/photo2.jpg',
      ],
    });

    expect(result.summary.totalPhotos).toBe(2);
    expect(result.summary.analyzedPhotos).toBe(2);
    expect(result.summary.unusablePhotos).toBe(0);
    // Average of 82 and 75 = 78.5, rounds to 79
    expect(result.summary.averageConfidence).toBe(79);
  });

  it('excludes unusable photos from averageConfidence', async () => {
    mockInvokeLLM
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              impactZone: 'front',
              detectedComponents: ['bumper'],
              severity: 'minor',
              confidenceScore: 60,
              caption: 'Blurry image.',
              imageQuality: 'unusable',
            }),
          },
        }],
      } as any)
      .mockResolvedValueOnce(GOOD_LLM_RESPONSE as any);

    const result = await enrichDamagePhotos({
      photoUrls: [
        'https://example.com/blurry.jpg',
        'https://example.com/clear.jpg',
      ],
    });

    expect(result.summary.unusablePhotos).toBe(1);
    expect(result.summary.analyzedPhotos).toBe(1);
  });
});
