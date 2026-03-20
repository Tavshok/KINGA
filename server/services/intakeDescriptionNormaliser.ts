/**
 * Intake Description Normaliser
 *
 * Cleans and structures a claimant's free-text incident description at intake time
 * without altering facts or adding assumptions. Uses the claims intake assistant persona.
 *
 * Runs as a lightweight async step during claim creation so the pipeline always
 * receives a well-formed description regardless of how the claimant wrote it.
 */

import { invokeLLM } from "../_core/llm";

export interface NormalisedDescription {
  /** Cleaned, structured version of the original description */
  normalisedText: string;
  /** Original text as submitted by the claimant */
  originalText: string;
  /** Whether the LLM confirmed meaning was preserved */
  meaningPreserved: boolean;
  /** Short label for the reported cause if identifiable, else null */
  reportedCauseLabel: string | null;
  /** Key facts extracted from the description as a bullet list */
  keyFacts: string[];
  /** Confidence score 0-100 for the normalisation quality */
  confidence: number;
}

const SYSTEM_PROMPT = `You are a claims intake assistant.

Your task is to clean and structure a claimant's description without changing meaning.

Rules:
- Do NOT alter facts
- Do NOT add assumptions
- Clarify language while preserving intent`;

/**
 * Normalise a claimant's free-text incident description.
 * Returns the original text unchanged if the LLM call fails.
 */
export async function normaliseIncidentDescription(
  rawDescription: string
): Promise<NormalisedDescription> {
  const fallback: NormalisedDescription = {
    normalisedText: rawDescription,
    originalText: rawDescription,
    meaningPreserved: true,
    reportedCauseLabel: null,
    keyFacts: [],
    confidence: 0,
  };

  if (!rawDescription || rawDescription.trim().length < 5) {
    return fallback;
  }

  const userPrompt = [
    "INPUT:",
    `${rawDescription}`,
    "",
    "TASK:",
    "Produce:",
    "1. Cleaned incident description",
    "2. Extracted reported cause (if clear, else null)",
    "3. Key facts (bullet list)",
    "",
    "Return JSON.",
  ].join("\n");

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "normalised_description",
          strict: true,
          schema: {
            type: "object",
            properties: {
              normalisedText: {
                type: "string",
                description: "Cleaned, professional version of the incident description",
              },
              reportedCauseLabel: {
                type: ["string", "null"],
                description: "Short cause label if explicitly stated (e.g. 'animal strike', 'rear-end collision'), else null",
              },
              keyFacts: {
                type: "array",
                items: { type: "string" },
                description: "Bullet list of key facts extracted from the description",
              },
              meaningPreserved: {
                type: "boolean",
                description: "True only if no facts were altered during cleaning",
              },
              confidence: {
                type: "integer",
                description: "Quality confidence 0-100 based on clarity of the original description",
              },
            },
            required: [
              "normalisedText",
              "reportedCauseLabel",
              "keyFacts",
              "meaningPreserved",
              "confidence",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices?.[0]?.message?.content;
    if (!rawContent) return fallback;

    const parsed = JSON.parse(
      typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent)
    ) as {
      normalisedText: string;
      reportedCauseLabel: string | null;
      keyFacts: string[];
      meaningPreserved: boolean;
      confidence: number;
    };

    // Safety check: if meaning was not preserved, fall back to original text
    // but still capture the extracted metadata
    if (!parsed.meaningPreserved) {
      return {
        ...fallback,
        reportedCauseLabel: parsed.reportedCauseLabel,
        keyFacts: Array.isArray(parsed.keyFacts) ? parsed.keyFacts : [],
        confidence: parsed.confidence,
      };
    }

    return {
      normalisedText: parsed.normalisedText || rawDescription,
      originalText: rawDescription,
      meaningPreserved: parsed.meaningPreserved,
      reportedCauseLabel: parsed.reportedCauseLabel,
      keyFacts: Array.isArray(parsed.keyFacts) ? parsed.keyFacts : [],
      confidence: parsed.confidence,
    };
  } catch (err) {
    console.warn("[IntakeNormaliser] LLM call failed, using raw description:", err);
    return fallback;
  }
}
