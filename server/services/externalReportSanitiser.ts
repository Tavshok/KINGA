/**
 * externalReportSanitiser.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Stage 31 — Pre-Export Text Sanitisation Layer
 *
 * Before any external report is exported (PDF, email, download) every text
 * field is scanned for legally unsafe language.  The module:
 *
 *  1. Replaces known forbidden terms with neutral equivalents.
 *  2. Detects residual unsafe phrases that cannot be auto-replaced.
 *  3. Blocks the export and returns a structured error when unresolvable
 *     phrases remain.
 *  4. Logs every substitution for the audit trail.
 *
 * Design principles
 * ─────────────────
 * • Pure functions — no I/O, no side-effects, fully testable.
 * • Case-insensitive matching with word-boundary awareness.
 * • Replacement preserves original sentence capitalisation.
 * • "Block" means returning SanitiseResult.safe === false; the caller
 *   decides whether to throw a TRPCError or surface a UI warning.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SanitisationCorrection {
  field: string;
  original: string;
  corrected: string;
  rule: string;
}

export interface SanitiseResult {
  /** True only when every field is clean and safe to export. */
  safe: boolean;
  /** The sanitised copy of the input object (same shape). */
  sanitised: Record<string, string>;
  /** Every substitution that was applied. */
  corrections: SanitisationCorrection[];
  /** Phrases that were detected but could not be safely replaced. */
  blockedPhrases: Array<{ field: string; phrase: string }>;
}

// ─── Forbidden term registry ──────────────────────────────────────────────────

/**
 * Each entry describes one replacement rule.
 *
 * `pattern`     – regex (case-insensitive, applied globally).
 * `replacement` – neutral substitute string.
 * `label`       – human-readable rule name used in the audit log.
 * `blockIfFound`– when true the phrase is NEVER auto-replaced; instead it
 *                 triggers an export block.  Use for terms so legally
 *                 sensitive that any automatic rewrite risks distortion.
 */
export interface SanitisationRule {
  pattern: RegExp;
  replacement: string;
  label: string;
  blockIfFound?: boolean;
}

export const SANITISATION_RULES: SanitisationRule[] = [
  // ── Explicitly listed forbidden terms ──────────────────────────────────────
  {
    pattern: /\bfraud(?:ulent|ulently|ulence)?\b/gi,
    replacement: "assessment finding",
    label: "fraud-language",
  },
  {
    pattern: /\banomaly\b/gi,
    replacement: "review outcome",
    label: "anomaly-language",
  },
  {
    pattern: /\bscore\b/gi,
    replacement: "assessment result",
    label: "score-reference",
  },
  {
    pattern: /\binconsistency\s+severity\b/gi,
    replacement: "requires verification",
    label: "inconsistency-severity",
  },
  {
    pattern: /\bsuspicious(?:ly|ness)?\b/gi,
    replacement: "requires verification",
    label: "suspicious-language",
  },

  // ── Extended suspicion / accusation terms (from Stage 22 guard) ────────────
  {
    pattern: /\bmisreport(?:ed|ing|s)?\b/gi,
    replacement: "further review required",
    label: "misreport-language",
  },
  {
    pattern: /\bundisclose[ds]?\b/gi,
    replacement: "additional verification needed",
    label: "undisclosed-language",
  },
  {
    pattern: /\bpre-?existing\s+condition\b/gi,
    replacement: "condition noted for review",
    label: "pre-existing-language",
  },
  {
    pattern: /\binflat(?:ed|ing|ion)\b/gi,
    replacement: "further review required",
    label: "inflate-language",
  },
  {
    pattern: /\btamper(?:ed|ing|s)?\b/gi,
    replacement: "additional verification needed",
    label: "tamper-language",
  },
  {
    pattern: /\bconceal(?:ed|ing|ment|s)?\b/gi,
    replacement: "additional verification needed",
    label: "conceal-language",
  },
  {
    pattern: /\bomit(?:ted|ting|s)?\b/gi,
    replacement: "not included in available documentation",
    label: "omit-language",
  },
  {
    pattern: /\bfalsif(?:ied|ying|ication)\b/gi,
    replacement: "requires verification",
    label: "falsify-language",
  },
  {
    pattern: /\bdecepti(?:ve|on|vely)\b/gi,
    replacement: "requires further review",
    label: "deceptive-language",
  },
  {
    pattern: /\bdeliberate(?:ly)?\b/gi,
    replacement: "noted for review",
    label: "deliberate-language",
  },
  {
    pattern: /\bintentional(?:ly)?\b/gi,
    replacement: "noted for review",
    label: "intentional-language",
  },
  {
    pattern: /\bwrongdoing\b/gi,
    replacement: "matter requiring review",
    label: "wrongdoing-language",
  },
  {
    pattern: /\bmisrepresent(?:ed|ing|ation|s)?\b/gi,
    replacement: "additional verification needed",
    label: "misrepresent-language",
  },

  // ── Scoring / internal logic references ────────────────────────────────────
  {
    pattern: /\b(?:fraud\s+)?risk\s+score\b/gi,
    replacement: "assessment result",
    label: "risk-score-reference",
  },
  {
    pattern: /\bconfidence\s+score\b/gi,
    replacement: "assessment result",
    label: "confidence-score-reference",
  },
  {
    pattern: /\bweighted\s+(?:score|factor)\b/gi,
    replacement: "assessment result",
    label: "weighted-score-reference",
  },
  {
    pattern: /\b(?:high|medium|low)\s+risk\b/gi,
    replacement: "requires verification",
    label: "risk-level-reference",
  },
  {
    pattern: /\bred\s+flag\b/gi,
    replacement: "item noted for review",
    label: "red-flag-language",
  },
  {
    pattern: /\bflag(?:ged|ging|s)?\b/gi,
    replacement: "noted for review",
    label: "flagged-language",
  },

  // ── Block-only terms — too sensitive for auto-replacement ──────────────────
  {
    pattern: /\bcriminal\b/gi,
    replacement: "",
    label: "criminal-language",
    blockIfFound: true,
  },
  {
    pattern: /\bprosecution\b/gi,
    replacement: "",
    label: "prosecution-language",
    blockIfFound: true,
  },
  {
    pattern: /\bperjury\b/gi,
    replacement: "",
    label: "perjury-language",
    blockIfFound: true,
  },
  {
    pattern: /\bstage[d\s]+accident\b/gi,
    replacement: "",
    label: "staged-accident-language",
    blockIfFound: true,
  },
];

// ─── Tone enforcement patterns ────────────────────────────────────────────────

/**
 * Phrases that are not simple word substitutions but indicate an
 * accusatory tone.  These are always block-triggering.
 */
export const TONE_VIOLATION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bproven\s+to\s+be\s+false\b/gi, label: "proven-false" },
  { pattern: /\bknowingly\b/gi, label: "knowingly" },
  { pattern: /\bwillfully\b/gi, label: "willfully" },
  { pattern: /\bwith\s+intent\s+to\b/gi, label: "intent-to" },
  { pattern: /\bfor\s+personal\s+gain\b/gi, label: "personal-gain" },
  { pattern: /\bto\s+defraud\b/gi, label: "to-defraud" },
];

// ─── Core sanitisation engine ─────────────────────────────────────────────────

/**
 * Apply a single replacement rule to a string.
 * Returns the modified string and a list of corrections made.
 */
function applyRule(
  text: string,
  rule: SanitisationRule,
  fieldName: string
): { text: string; corrections: SanitisationCorrection[] } {
  const corrections: SanitisationCorrection[] = [];
  const result = text.replace(rule.pattern, (match) => {
    // Preserve leading capitalisation of the original match
    const replacement = rule.replacement;
    if (!replacement) return match; // blockIfFound rules — leave in place for block detection
    const isCapitalised = match.charAt(0) === match.charAt(0).toUpperCase() && match.charAt(0) !== match.charAt(0).toLowerCase();
    const adjusted = isCapitalised
      ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
      : replacement;
    corrections.push({
      field: fieldName,
      original: match,
      corrected: adjusted,
      rule: rule.label,
    });
    return adjusted;
  });
  return { text: result, corrections };
}

/**
 * Sanitise a single text field.
 * Returns the cleaned text, all corrections applied, and any blocked phrases.
 */
function sanitiseField(
  text: string,
  fieldName: string
): {
  text: string;
  corrections: SanitisationCorrection[];
  blockedPhrases: Array<{ field: string; phrase: string }>;
} {
  let current = text;
  const corrections: SanitisationCorrection[] = [];
  const blockedPhrases: Array<{ field: string; phrase: string }> = [];

  for (const rule of SANITISATION_RULES) {
    if (rule.blockIfFound) {
      // Detect but do not replace — collect as blocked
      const matches = current.match(rule.pattern);
      if (matches) {
        for (const m of matches) {
          blockedPhrases.push({ field: fieldName, phrase: m });
        }
      }
    } else {
      const { text: updated, corrections: newCorrections } = applyRule(current, rule, fieldName);
      current = updated;
      corrections.push(...newCorrections);
    }
  }

  // Tone violation check — always block
  for (const { pattern, label } of TONE_VIOLATION_PATTERNS) {
    const matches = current.match(pattern);
    if (matches) {
      for (const m of matches) {
        blockedPhrases.push({ field: fieldName, phrase: `[tone:${label}] ${m}` });
      }
    }
  }

  return { text: current, corrections, blockedPhrases };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Sanitise all string fields in a flat or nested object before export.
 *
 * @param fields  - A record of { fieldName: textValue } to sanitise.
 *                  Only string values are processed; non-strings are passed through.
 * @returns SanitiseResult — safe === false means the export must be blocked.
 */
export function sanitiseExternalReport(
  fields: Record<string, unknown>
): SanitiseResult {
  const sanitised: Record<string, string> = {};
  const allCorrections: SanitisationCorrection[] = [];
  const allBlockedPhrases: Array<{ field: string; phrase: string }> = [];

  for (const [key, value] of Object.entries(fields)) {
    if (typeof value !== "string") {
      // Pass non-string values through unchanged (cast to string for output map)
      sanitised[key] = value == null ? "" : String(value);
      continue;
    }

    const { text, corrections, blockedPhrases } = sanitiseField(value, key);
    sanitised[key] = text;
    allCorrections.push(...corrections);
    allBlockedPhrases.push(...blockedPhrases);
  }

  return {
    safe: allBlockedPhrases.length === 0,
    sanitised,
    corrections: allCorrections,
    blockedPhrases: allBlockedPhrases,
  };
}

/**
 * Convenience wrapper for ReportNarrative objects.
 * All eight narrative text fields are sanitised in one call.
 */
export function sanitiseReportNarrative(narrative: Record<string, string>): SanitiseResult {
  return sanitiseExternalReport(narrative);
}

/**
 * Throw a structured error description when export must be blocked.
 * The caller is responsible for converting this into a TRPCError or HTTP 422.
 */
export function buildBlockError(
  blockedPhrases: Array<{ field: string; phrase: string }>
): { code: "EXPORT_BLOCKED"; message: string; details: typeof blockedPhrases } {
  const summary = blockedPhrases
    .map((b) => `"${b.phrase}" in field "${b.field}"`)
    .join("; ");
  return {
    code: "EXPORT_BLOCKED",
    message: `External report export blocked — unsafe language detected: ${summary}`,
    details: blockedPhrases,
  };
}
