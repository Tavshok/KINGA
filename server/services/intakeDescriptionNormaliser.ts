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
    confidence: 0,
  };

  if (!rawDescription || rawDescription.trim().length < 5) {
    return fallback;
  }

  const userPrompt = [
    "INPUT:",
    "Claimant's incident description:",
    `"${rawDescription}"`,
    "",
    "TASK:",
    "1. Rewrite the description in clear, professional language while preserving all stated facts.",
    "2. Identify a short reported cause label if explicitly stated (e.g. 'frontal collision', 'animal strike', 'rear-end collision', 'hail damage'), else return null.",
    "3. Set meaningPreserved to true only if you are certain no facts were altered.",
    "4. Set confidence (0-100) based on how clearly the original description was written.",
    "",
    "Return structured JSON only.",
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
                description: "Cleaned, professional version of the description",
              },
              meaningPreserved: {
                type: "boolean",
                description: "True only if no facts were altered",
              },
              reportedCauseLabel: {
                type: ["string", "null"],
                description: "Short cause label if explicitly stated, else null",
              },
              confidence: {
                type: "integer",
                description: "Quality confidence 0-100",
              },
            },
            required: [
              "normalisedText",
              "meaningPreserved",
              "reportedCauseLabel",
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
      meaningPreserved: boolean;
      reportedCauseLabel: string | null;
      confidence: number;
    };

    // Safety check: if meaning was not preserved, fall back to original
    if (!parsed.meaningPreserved) {
      return {
        ...fallback,
        reportedCauseLabel: parsed.reportedCauseLabel,
        confidence: parsed.confidence,
      };
    }

    return {
      normalisedText: parsed.normalisedText || rawDescription,
      originalText: rawDescription,
      meaningPreserved: parsed.meaningPreserved,
      reportedCauseLabel: parsed.reportedCauseLabel,
      confidence: parsed.confidence,
    };
  } catch (err) {
    console.warn("[IntakeNormaliser] LLM call failed, using raw description:", err);
    return fallback;
  }
}
