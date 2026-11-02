import { z } from "zod";
import { getStore } from "@/lib/store";
import { analyzeCharacter, analysisHash, needsAnalysis } from "@/lib/engine/analysis";
import { ARENAS, createBattle, findArena } from "@/lib/engine/battle";
import type { Battle, BattleSummary, Character } from "@/lib/engine/types";
import type { AiClient } from "@/lib/ai/client";

export const battleCreateSchema = z.object({
  fighterAId: z.string().min(1),
  fighterBId: z.string().min(1),
  arenaName: z.string().max(80).optional(),
  title: z.string().trim().max(80).optional(),
});

export async function ensureAnalyzed(character: Character, ai: AiClient): Promise<Character> {
  if (!needsAnalysis(character)) return character;
  const { analysis, model } = await analyzeCharacter(ai, character);
  const updated: Character = {
    ...character,
    analysis,
    analysisHash: analysisHash(character),
    analysisModel: model,
    analysisError: null,
    analyzedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await getStore().saveCharacter(updated);
  return updated;
}

export async function createBattleFromCharacters(params: {
  fighterAId: string;
  fighterBId: string;
  arenaName?: string;
  title?: string;
  ai: AiClient;
}): Promise<Battle> {
  if (params.fighterAId === params.fighterBId) {
    throw new Error("同じキャラクター同士では対戦できません。");
  }
  const store = getStore();
  const a = await store.getCharacter(params.fighterAId);
  const b = await store.getCharacter(params.fighterBId);
  if (!a || !b) throw new Error("選択したキャラクターが見つかりません。");
  const [fighterA, fighterB] = await Promise.all([ensureAnalyzed(a, params.ai), ensureAnalyzed(b, params.ai)]);
  const battle = createBattle({
    fighterA,
    fighterB,
    arena: findArena(params.arenaName),
    title: params.title,
  });
  await store.saveBattle(battle);
  return battle;
}

export async function listBattles(): Promise<BattleSummary[]> {
  return getStore().listBattles();
}

export async function getBattle(id: string): Promise<Battle | null> {
  return getStore().getBattle(id);
}

export async function saveBattle(battle: Battle): Promise<void> {
  await getStore().saveBattle(battle);
}

export async function deleteBattle(id: string): Promise<void> {
  await getStore().deleteBattle(id);
}

export function arenaList() {
  return ARENAS;
}
