import type {
  AbilityEffectSpec,
  AbilitySpec,
  ActionPlan,
  Battle,
  Character,
  CharacterAnalysis,
  EffectKind,
  JudgeEffect,
  JudgeEvent,
  Side,
  Arena,
  SideState,
  TurnAdjudication,
} from "@/lib/engine/types";
import { createBattle, createSideState } from "@/lib/engine/battle";

export const DEFAULT_ARENA: Arena = { name: "テスト戦場", description: "検証用の白い平面" };

export function effect(kind: EffectKind, severity: number, extra: Partial<AbilityEffectSpec> = {}): AbilityEffectSpec {
  return {
    kind,
    severity,
    description: `${kind} effect`,
    duration: "instant",
    lethal: false,
    target: "opponent",
    targetAbilityId: null,
    ...extra,
  };
}

export function ability(partial: Partial<AbilitySpec> & { id: string; name: string }): AbilitySpec {
  return {
    summary: `${partial.name}の効果`,
    kinds: ["damage"],
    mode: "active",
    tempo: "normal",
    range: "mid",
    effects: [effect("damage", 2)],
    conditions: [],
    costs: [],
    limits: [],
    weaknesses: [],
    counterplay: [],
    observability: "",
    ambiguities: [],
    usesPerBattle: null,
    cooldownRounds: null,
    ...partial,
  };
}

export function analysis(name: string, abilities: AbilitySpec[]): CharacterAnalysis {
  return {
    version: 1,
    combatIdentity: `${name}の戦闘像`,
    abilities,
    behavior: "状況に応じて戦う",
    defense: "標準的",
    endurance: "標準的",
    winCondition: "相手を戦闘不能にする",
    lossCondition: "戦闘不能になる",
    fairnessNotes: [],
    unresolved: [],
    analyzedAt: new Date().toISOString(),
    model: "test-model",
  };
}

export function character(id: string, name: string, abilities: AbilitySpec[]): Character {
  const now = new Date().toISOString();
  return {
    id,
    name,
    abilityText: abilities.map((a) => a.summary).join("\n"),
    personality: "冷静",
    background: "",
    weakness: "標準的",
    createdAt: now,
    updatedAt: now,
    analysis: analysis(name, abilities),
    analysisHash: "test",
    analysisModel: "test-model",
    analysisError: null,
    analyzedAt: now,
  };
}

export function plan(side: Side, action: ActionPlan["action"], abilityId: string | null = null, target: ActionPlan["target"] = "opponent"): ActionPlan {
  return {
    side,
    action,
    abilityId,
    intent: abilityId ? `${abilityId}を使う` : action,
    declaration: "",
    reasoning: "テスト用の行動",
    target,
  };
}

export function judgeEffect(kind: EffectKind, severity: number, extra: Partial<JudgeEffect> = {}): JudgeEffect {
  return {
    kind,
    severity,
    target: "opponent",
    duration: "instant",
    lethal: false,
    label: `${kind}効果`,
    description: `${kind}が発生`,
    targetAbilityId: null,
    ...extra,
  };
}

export function judgeEvent(
  side: Side,
  planValue: ActionPlan,
  extra: Partial<JudgeEvent> = {},
): JudgeEvent {
  return {
    side,
    action: planValue.action,
    abilityId: planValue.abilityId,
    conditionStatus: planValue.abilityId ? "met" : "na",
    conditionEvidence: planValue.abilityId ? "条件を満たす" : "",
    counterplay: "none",
    counterplayDetail: "有効な対抗なし",
    tempo: "neutral",
    interrupted: false,
    success: true,
    effects: [],
    summary: `${side}の行動`,
    beats: [`${side}が動いた`],
    ...extra,
  };
}

export function adjudication(events: JudgeEvent[], extra: Partial<TurnAdjudication> = {}): TurnAdjudication {
  return {
    initiative: { first: "A", reason: "速度で上回る" },
    events,
    fieldNotes: [],
    persistentFacts: [],
    refereeNote: "両者に同じ基準を適用した",
    finished: false,
    winner: null,
    endingReason: null,
    ...extra,
  };
}

export function makeBattle(fighterA: Character, fighterB: Character): Battle {
  return createBattle({ fighterA, fighterB, arena: DEFAULT_ARENA, id: "test-battle" });
}

export function sideState(partial: Partial<SideState> = {}): SideState {
  return { ...createSideState(), ...partial };
}

export function narration(text = "両者が動き、戦況が動いた。\n\n次の瞬間には、距離が縮まっていた。") {
  return { narration: text, highlight: "交戦", quotes: [] };
}

export function auditOk() {
  return { consistent: true, issues: [], correctedNarration: null };
}

export function closing() {
  return {
    verdict: "テスト用の判決理由。能力の条件と対抗手段が勝敗を分けた。",
    keyMoments: ["先手を取ったこと"],
    lesson: "条件を満たすだけでは足りず、相手の対抗手段が勝敗を変える。",
  };
}
