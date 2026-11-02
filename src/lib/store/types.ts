import type { Battle, BattleSummary, Character } from "@/lib/engine/types";

export interface Store {
  readonly kind: "postgres" | "file";
  init(): Promise<void>;
  listCharacters(): Promise<Character[]>;
  getCharacter(id: string): Promise<Character | null>;
  saveCharacter(character: Character): Promise<void>;
  deleteCharacter(id: string): Promise<void>;
  listBattles(): Promise<BattleSummary[]>;
  getBattle(id: string): Promise<Battle | null>;
  saveBattle(battle: Battle): Promise<void>;
  deleteBattle(id: string): Promise<void>;
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
}

export function toBattleSummary(battle: Battle): BattleSummary {
  return {
    id: battle.id,
    title: battle.title,
    arena: battle.arena,
    fighterNames: { A: battle.fighters.A.name, B: battle.fighters.B.name },
    status: battle.status,
    outcome: battle.outcome,
    turnCount: battle.turns.length,
    createdAt: battle.createdAt,
    updatedAt: battle.updatedAt,
  };
}
