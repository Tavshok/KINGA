/**
 * Client-side text sanitisation utility — mirrors Phase 1 G4 patterns.
 *
 * Strips internal pipeline artefacts (CONFLICT markers, XML fragments, LLM
 * instruction tags, raw flag strings) and replaces interactive UI strings
 * that are invalid in a static/PDF report context.
 *
 * This is intentionally a pure function with no dependencies so it can be
 * used anywhere in the client without introducing circular imports.
 */

const SANITISATION_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  // Internal conflict markers from AI pipeline
  { pattern: /CONFLICT\s+Dimension\s+\d+\s+\d+\s*(?:CONFLICT)?/gi, replacement: '' },
  { pattern: /END_CONFLICT/gi, replacement: '' },

  // XML/JSON fragments
  { pattern: /<\?xml[^>]*\?>/gi, replacement: '' },
  { pattern: /<xml[^>]*>[\s\S]*?<\/xml>/gi, replacement: '' },
  { pattern: /JSON_FRAGMENT_\w+/g, replacement: '' },

  // LLM instruction tags
  { pattern: /\[INST\][\s\S]*?\[\/INST\]/gi, replacement: '' },
  { pattern: /<\|im_start\|>[\s\S]*?<\|im_end\|>/gi, replacement: '' },

  // Malformed URLs
  { pattern: /https?:\/\/\S+[\s\-]\S+/g, replacement: '[URL removed]' },

  // Raw flag strings
  { pattern: /\bphotos_not_ingested\b/g, replacement: 'Photos available – manual review required' },
  { pattern: /\bingestion_failure\b/g, replacement: 'Data extraction incomplete' },
  { pattern: /\bdescription_not_mapped\b/g, replacement: 'Description could not be classified' },

  // Interactive UI strings invalid in static/PDF context
  { pattern: /\bRun Now\b/g, replacement: 'Analysis Pending' },
  { pattern: /\bHover or click\b/gi, replacement: 'See details below' },
  { pattern: /\bClick to expand\b/gi, replacement: '(Expandable section)' },

  // Whitespace normalisation
  { pattern: /[ \t]{2,}/g, replacement: ' ' },
  { pattern: /\n{3,}/g, replacement: '\n\n' },
];

/**
 * Sanitise a single text string by removing internal pipeline artefacts.
 * Returns an empty string if input is null or undefined.
 */
export function sanitiseField(text: string | null | undefined): string {
  if (!text) return '';
  let result = String(text);
  for (const rule of SANITISATION_RULES) {
    result = result.replace(rule.pattern, rule.replacement);
  }
  return result.trim();
}

/**
 * Sanitise a record of text fields, returning a new record with clean values.
 */
export function sanitiseFields<T extends Record<string, string | null | undefined>>(
  fields: T,
): Record<keyof T, string> {
  const result = {} as Record<keyof T, string>;
  for (const key of Object.keys(fields) as Array<keyof T>) {
    result[key] = sanitiseField(fields[key]);
  }
  return result;
}
