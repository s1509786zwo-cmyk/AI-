/**
 * 能力裁定エンジンのドメイン型。
 *
 * 設計原則:
 *  - AIは「出来事の分類・条件の充足・対抗手段・駆け引き」を判断する。
 *  - 数値（損耗・スタミナ・状態異常）はエンジンが決定論的に計算する。
 *  - 文章は確定した状態変化から生成され、文章が勝敗を決めることはない。
 */

export type Side = "A" | "B";
export type SideOrNeutral = Side | "field";

export const EFFECT_KINDS = [
  "damage",
  "bind",
  "disable",
  "weaken",
  "empower",
  "heal",
  "barrier",
  "evasion",
  "nullify",
  "copy",
  "field",
  "rule",
  "mental",
  "other",
] as const;
export type EffectKind = (typeof EFFECT_KINDS)[number];

export const EFFECT_DURATIONS = ["instant", "short", "battle", "permanent"] as const;
export type EffectDuration = (typeof EFFECT_DURATIONS)[number];

export const ABILITY_MODES = ["active", "passive", "reactive", "conditional"] as const;
export type AbilityMode = (typeof ABILITY_MODES)[number];

export const TEMPOS = ["instant", "fast", "normal", "slow", "charge"] as const;
export type Tempo = (typeof TEMPOS)[number];

export const RANGES = ["self", "melee", "mid", "far", "unlimited"] as const;
export type Range = (typeof RANGES)[number];

export const EFFECT_TARGETS = ["opponent", "self", "field"] as const;
export type EffectTarget = (typeof EFFECT_TARGETS)[number];

export const STATUS_KINDS = [
  "barrier",
  "evasion",
  "bind",
  "seal",
  "silence",
  "regen",
  "empower",
  "weaken",
  "mark",
  "stun",
  "field",
  "other",
] as const;
export type StatusKind = (typeof STATUS_KINDS)[number];

export const ACTIONS = [
  "activate",
  "strike",
  "defend",
  "evade",
  "maneuver",
  "recover",
  "observe",
  "break_free",
  "feint",
] as const;
export type ActionType = (typeof ACTIONS)[number];

export const ACTION_LABEL: Record<ActionType, string> = {
  activate: "能力発動",
  strike: "攻撃",
  defend: "防御",
  evade: "回避",
  maneuver: "機動",
  recover: "立て直し",
  observe: "観察",
  break_free: "拘束解除",
  feint: "牽制",
};

export const EFFECT_LABEL: Record<EffectKind, string> = {
  damage: "損耗",
  bind: "拘束",
  disable: "能力封じ",
  weaken: "弱体化",
  empower: "強化",
  heal: "回復",
  barrier: "防壁",
  evasion: "回避",
  nullify: "無効化",
  copy: "模倣",
  field: "環境操作",
  rule: "規則変更",
  mental: "精神干渉",
  other: "特殊",
};

export const STATUS_LABEL: Record<StatusKind, string> = {
  barrier: "防壁",
  evasion: "回避態勢",
  bind: "拘束",
  seal: "能力封印",
  silence: "発動不能",
  regen: "再生",
  empower: "強化",
  weaken: "弱体",
  mark: "標的",
  stun: "硬直",
  field: "環境",
  other: "特殊",
};

/* ────────────────────────── キャラクター ────────────────────────── */

export interface CharacterInput {
  name: string;
  abilityText: string;
  personality: string;
  background: string;
  weakness: string;
}

export interface Character extends CharacterInput {
  id: string;
  createdAt: string;
  updatedAt: string;
  analysis: CharacterAnalysis | null;
  analysisHash: string | null;
  analysisModel: string | null;
  analysisError: string | null;
  analyzedAt: string | null;
}

/* ────────────────────────── 能力解析 ────────────────────────── */

export interface ConditionSpec {
  text: string;
  /** キャラクター本文からの引用。引用なき条件は裁定に使わない */
  evidence: string;
}

export interface Ambiguity {
  point: string;
  resolution: string;
}

export interface AbilityEffectSpec {
  kind: EffectKind;
  /** 1=軽微 / 2=有効 / 3=重度 / 4=決定的 */
  severity: number;
  description: string;
  duration: EffectDuration;
  /** 本文が対象の戦闘不能・消滅を明確に含意する場合のみ true */
  lethal: boolean;
  target: EffectTarget;
  /** 対象を特定能力に限定する効果（disable など） */
  targetAbilityId?: string | null;
}

export interface AbilitySpec {
  id: string;
  name: string;
  summary: string;
  kinds: EffectKind[];
  mode: AbilityMode;
  tempo: Tempo;
  range: Range;
  effects: AbilityEffectSpec[];
  conditions: ConditionSpec[];
  costs: string[];
  limits: string[];
  weaknesses: string[];
  counterplay: string[];
  observability: string;
  ambiguities: Ambiguity[];
  /** 本文に明記された回数制限のみ。なければ null */
  usesPerBattle: number | null;
  /** 本文に明記されたクールダウンのみ。なければ null */
  cooldownRounds: number | null;
}

export interface CharacterAnalysis {
  version: number;
  combatIdentity: string;
  abilities: AbilitySpec[];
  /** 戦闘時の振る舞い・間合い・判断傾向 */
  behavior: string;
  defense: string;
  endurance: string;
  winCondition: string;
  lossCondition: string;
  /** 審判が一貫性のために保持するメモ */
  fairnessNotes: string[];
  unresolved: string[];
  analyzedAt: string;
  model: string;
}

/* ────────────────────────── 戦闘状態 ────────────────────────── */

export interface StatusEffect {
  id: string;
  label: string;
  kind: StatusKind;
  source: SideOrNeutral;
  severity: number;
  description: string;
  /** null = 決着まで持続 */
  remaining: number | null;
  /** barrier の残耐久 */
  absorb?: number;
  targetAbilityId?: string | null;
  /** 機械的なタグ（nullify など） */
  tags?: string[];
}

export interface SideState {
  integrity: number;
  stamina: number;
  statuses: StatusEffect[];
  /** abilityId -> 使用回数 */
  abilityUses: Record<string, number>;
  /** abilityId -> 再使用可能になるラウンド */
  cooldowns: Record<string, number>;
  down: boolean;
  /** 観客/相手に露見している情報 */
  revealed: string[];
  /** 審判が保持する側ごとの永続メモ */
  notes: string[];
}

export interface FieldState {
  name: string;
  description: string;
  statuses: StatusEffect[];
  hazards: string[];
}

export interface BattleState {
  round: number;
  /** これまでの解決済みラウンド数 */
  turnsResolved: number;
  sides: Record<Side, SideState>;
  field: FieldState;
  persistentFacts: string[];
  /** 圧縮された戦況年表（古い順） */
  chronicle: string[];
}

export interface CharacterSnapshot {
  id: string;
  name: string;
  personality: string;
  weakness: string;
  background: string;
  abilityText: string;
  analysis: CharacterAnalysis;
}

/* ────────────────────────── 行動計画 ────────────────────────── */

export interface ActionPlan {
  side: Side;
  action: ActionType;
  abilityId: string | null;
  intent: string;
  declaration: string;
  reasoning: string;
  target: "opponent" | "self" | "field";
}

/* ────────────────────────── 裁定（AI出力） ────────────────────────── */

export type ConditionStatus = "met" | "partial" | "unmet" | "na";
export type CounterplayLevel = "none" | "partial" | "strong";
export type TempoEdge = "advantage" | "neutral" | "disadvantage";

export interface JudgeEffect {
  kind: EffectKind;
  severity: number;
  target: EffectTarget;
  duration: EffectDuration;
  lethal: boolean;
  label: string;
  description: string;
  targetAbilityId?: string | null;
}

export interface JudgeEvent {
  side: Side;
  action: ActionType;
  abilityId: string | null;
  conditionStatus: ConditionStatus;
  conditionEvidence: string;
  counterplay: CounterplayLevel;
  counterplayDetail: string;
  tempo: TempoEdge;
  interrupted: boolean;
  success: boolean;
  effects: JudgeEffect[];
  summary: string;
  beats: string[];
}

export interface TurnAdjudication {
  initiative: { first: Side | "simultaneous"; reason: string };
  events: JudgeEvent[];
  fieldNotes: string[];
  persistentFacts: string[];
  refereeNote: string;
  finished: boolean;
  winner: Side | "draw" | null;
  endingReason: string | null;
}

/* ────────────────────────── エンジンによる適用結果 ────────────────────────── */

export interface AppliedEffect {
  kind: EffectKind;
  label: string;
  target: EffectTarget;
  severity: number;
  duration: EffectDuration;
  lethal: boolean;
  damage: number;
  absorbed: number;
  statusApplied: StatusEffect | null;
  note: string;
}

export interface LedgerEvent {
  side: Side;
  action: ActionType;
  abilityId: string | null;
  abilityName: string | null;
  conditionStatus: ConditionStatus;
  counterplay: CounterplayLevel;
  tempo: TempoEdge;
  interrupted: boolean;
  success: boolean;
  staminaCost: number;
  effects: AppliedEffect[];
  damageDealt: number;
  damageTaken: number;
  selfDamage: number;
  summary: string;
  beats: string[];
  adjustments: string[];
}

export interface TurnLedger {
  initiative: Side | "simultaneous";
  initiativeReason: string;
  events: LedgerEvent[];
  damageTo: Record<Side, number>;
  integrityBefore: Record<Side, number>;
  integrityAfter: Record<Side, number>;
  staminaBefore: Record<Side, number>;
  staminaAfter: Record<Side, number>;
  finished: boolean;
  winner: Side | "draw" | null;
  endingReason: string | null;
  adjustments: string[];
  fairnessFlags: string[];
}

export interface NarrationAudit {
  consistent: boolean;
  issues: string[];
  repaired: boolean;
}

export interface ModelCallTrace {
  label: string;
  model: string;
  ms: number;
  ok: boolean;
  error?: string;
}

export interface TurnRecord {
  index: number;
  plans: Record<Side, ActionPlan>;
  adjudication: TurnAdjudication;
  ledger: TurnLedger;
  narration: string;
  highlight: string;
  quotes: { side: Side; line: string }[];
  audit: NarrationAudit;
  stateAfter: {
    sides: Record<Side, SideState>;
    field: FieldState;
    persistentFacts: string[];
  };
  createdAt: string;
  trace: ModelCallTrace[];
}

export interface BattleOutcome {
  winner: Side | "draw";
  method: string;
  reason: string;
  round: number;
}

export interface Arena {
  name: string;
  description: string;
}

export interface BattleClosing {
  verdict: string;
  keyMoments: string[];
  lesson: string;
}

export interface Battle {
  id: string;
  title: string;
  arena: Arena;
  rulesetVersion: string;
  fighters: Record<Side, CharacterSnapshot>;
  state: BattleState;
  status: "active" | "finished" | "error";
  outcome: BattleOutcome | null;
  closing: BattleClosing | null;
  turns: TurnRecord[];
  createdAt: string;
  updatedAt: string;
  error: string | null;
}

export interface BattleSummary {
  id: string;
  title: string;
  arena: Arena;
  fighterNames: Record<Side, string>;
  status: Battle["status"];
  outcome: BattleOutcome | null;
  turnCount: number;
  createdAt: string;
  updatedAt: string;
}

/* ────────────────────────── 表示用 ────────────────────────── */

export interface SideSnapshot {
  name: string;
  integrity: number;
  stamina: number;
  integrityPercent: number;
  staminaPercent: number;
  condition: ConditionBand;
  statuses: StatusEffect[];
  down: boolean;
}

export type ConditionBand = "intact" | "wounded" | "critical" | "down";

export const CONDITION_LABEL: Record<ConditionBand, string> = {
  intact: "健在",
  wounded: "負傷",
  critical: "窮地",
  down: "戦闘不能",
};
