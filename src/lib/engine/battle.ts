import { INTEGRITY_MAX, MAX_ROUNDS, RULESET_VERSION, STAMINA_MAX } from "./rules";
import type {
  Arena,
  Battle,
  BattleState,
  Character,
  CharacterSnapshot,
  Side,
  SideState,
} from "./types";

export const ARENAS: Arena[] = [
  {
    name: "白い無限平面",
    description:
      "上下左右の感覚だけがある、継ぎ目のない白い平面。遮蔽物も足場の起伏もなく、外部から持ち込める要素は何もない。能力そのものの相性と駆け引きだけが残る。",
  },
  {
    name: "崩れかけた都市",
    description:
      "半壊したビルと瓦礫が視界を遮る街区。近距離では遮蔽が多く、遠距離の能力は射線を確保しづらい。崩落の物音が常に響き、気配を読む力を試される。",
  },
  {
    name: "霧の森",
    description:
      "数メートル先も霞む濃霧の森。視認を前提とする能力は狙いを定めにくく、不意打ちと気配の読み合いが支配する。木々は衝撃を吸い、音は歪んで届く。",
  },
  {
    name: "灼熱の溶岩窟",
    description:
      "天井から火の粉が降り、床の割れ目から熱気が噴き上がる洞窟。遮蔽は多いが、立っているだけで体力を削られる。長引くほど双方が消耗する。",
  },
  {
    name: "無重力の遺構",
    description:
      "重力の失われた巨大構造物の内部。壁や天井を足場にでき、三次元的な機動が可能になる。距離感覚と「上」の概念が通用しない。",
  },
  {
    name: "潮騒の断崖",
    description:
      "波が岩壁を叩く狭い断崖。足場は不安定で、大きく動けば落下の危険がある。風が強く、飛び道具や広範囲の効果は流される。",
  },
];

export function findArena(name: string | undefined): Arena {
  return ARENAS.find((arena) => arena.name === name) ?? ARENAS[0];
}

void MAX_ROUNDS;

export function createSideState(): SideState {
  return {
    integrity: INTEGRITY_MAX,
    stamina: STAMINA_MAX,
    statuses: [],
    abilityUses: {},
    cooldowns: {},
    down: false,
    revealed: [],
    notes: [],
  };
}

export function createInitialState(arena: Arena): BattleState {
  return {
    round: 1,
    turnsResolved: 0,
    sides: { A: createSideState(), B: createSideState() },
    field: {
      name: arena.name,
      description: arena.description,
      statuses: [],
      hazards: [],
    },
    persistentFacts: [],
    chronicle: [],
  };
}

export function toSnapshot(character: Character): CharacterSnapshot {
  if (!character.analysis) {
    throw new Error(`キャラクター「${character.name}」の能力解析が完了していません。`);
  }
  return {
    id: character.id,
    name: character.name,
    personality: character.personality,
    weakness: character.weakness,
    background: character.background,
    abilityText: character.abilityText,
    analysis: character.analysis,
  };
}

export function createBattle(params: {
  fighterA: Character;
  fighterB: Character;
  arena: Arena;
  title?: string;
  id?: string;
  now?: Date;
}): Battle {
  const { fighterA, fighterB, arena } = params;
  if (fighterA.id === fighterB.id) {
    throw new Error("同じキャラクター同士では対戦できません。");
  }
  const now = (params.now ?? new Date()).toISOString();
  const snapshotA = toSnapshot(fighterA);
  const snapshotB = toSnapshot(fighterB);
  return {
    id: params.id ?? crypto.randomUUID(),
    title: params.title?.trim() || `${fighterA.name} vs ${fighterB.name}`,
    arena,
    rulesetVersion: RULESET_VERSION,
    fighters: { A: snapshotA, B: snapshotB },
    state: createInitialState(arena),
    status: "active",
    outcome: null,
    closing: null,
    turns: [],
    createdAt: now,
    updatedAt: now,
    error: null,
  };
}

export function sideName(battle: Battle, side: Side): string {
  return battle.fighters[side].name;
}
