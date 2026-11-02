import { z } from "zod";
import { getStore } from "@/lib/store";
import type { Character } from "@/lib/engine/types";

export const characterInputSchema = z.object({
  name: z.string().trim().min(1, "名前を入力してください").max(60, "名前は60文字以内で入力してください"),
  abilityText: z
    .string()
    .trim()
    .min(10, "能力は10文字以上で入力してください")
    .max(6000, "能力は6000文字以内で入力してください"),
  personality: z.string().trim().max(2000, "性格は2000文字以内で入力してください").default(""),
  background: z.string().trim().max(6000, "設定は6000文字以内で入力してください").default(""),
  weakness: z.string().trim().max(2000, "弱点は2000文字以内で入力してください").default(""),
});

export type CharacterInputPayload = z.infer<typeof characterInputSchema>;

export function newCharacter(input: CharacterInputPayload): Character {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    ...input,
    createdAt: now,
    updatedAt: now,
    analysis: null,
    analysisHash: null,
    analysisModel: null,
    analysisError: null,
    analyzedAt: null,
  };
}

export async function listCharacters(): Promise<Character[]> {
  return getStore().listCharacters();
}

export async function getCharacter(id: string): Promise<Character | null> {
  return getStore().getCharacter(id);
}

export async function saveCharacter(character: Character): Promise<void> {
  await getStore().saveCharacter(character);
}

export async function deleteCharacter(id: string): Promise<void> {
  await getStore().deleteCharacter(id);
}
