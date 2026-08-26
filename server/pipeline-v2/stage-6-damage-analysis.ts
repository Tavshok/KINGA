/**
 * Public Stage 6 damage-analysis contract.
 *
 * Compatibility barrel: pipeline callers retain this path while vision, fallback,
 * merge, and orchestration concerns remain independently maintainable.
 */
export { readDamageFromPhotos } from './stage-6-damage-analysis.vision';
export { runDamageAnalysisStage } from './stage-6-damage-analysis.stage';
