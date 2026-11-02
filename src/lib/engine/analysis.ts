import { createHash } from "node:crypto";
import type { AiClient } from "@/lib/ai/client";
import { analysisMessages } from "@/lib/ai/prompts";
import { analysisSchema, normalizeAnalysis } from "./schema";
import type { Character, CharacterAnalysis, CharacterInput } from "./types";

export const ANALYSIS_PROMPT_VERSION = "analysis-v1";

export function analysisHash(input: CharacterInput): string {
  const payload = JSON.stringify({
    v: ANALYSIS_PROMPT_VERSION,
    name: input.name,
    abilityText: input.abilityText,
    personality: input.personality,
    background: input.background,
    weakness: input.weakness,
  });
  return createHash("sha256").update(payload).digest("hex");
}

export async function analyzeCharacter(
  ai: AiClient,
  input: CharacterInput,
): Promise<{ analysis: CharacterAnalysis; model: string; ms: number }> {
  const { system, user } = analysisMessages(input);
  const started = Date.now();
  const result = await ai.json({
    system,
    user,
    schema: analysisSchema,
    label: "能力解析",
    tier: "analysis",
    maxTokens: 6500,
  });
  const analysis = normalizeAnalysis(result.data, result.model);
  return { analysis, model: result.model, ms: Date.now() - started };
}

export function needsAnalysis(character: Character): boolean {
  return (
    !character.analysis ||
    character.analysisHash !== analysisHash(character) ||
    character.analysis.version !== 1
  );
}
