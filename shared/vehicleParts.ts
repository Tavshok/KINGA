/**
 * Public vehicle-parts contract.
 *
 * This compatibility barrel preserves the legacy import path. Callers must import
 * from this file unless they own a deliberately internal implementation concern.
 */
export * from './vehicleParts.types';
export { VEHICLE_PARTS } from './vehicleParts.catalogue';
export {
  resolveComponent,
  resolveComponentZone,
  getPartsByZone,
  normalizeComponentName,
  getSubParts,
  groupComponentsByZone,
} from './vehicleParts.lookup';
export { isPlausiblePartName } from './vehicleParts.plausibility';
export { resolveToCanonical, resolveToCanonicalId } from './vehicleParts.normalise';
