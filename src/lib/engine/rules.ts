import type {
  ActionType,
  ConditionBand,
  EffectDuration,
  EffectKind,
  Side,
  StatusKind,
  Tempo,
} from "./types";

export const RULESET_VERSION = "1.0.0";

/** 対称な基準値。両者に同じ基準を適用する */
export const INTEGRITY_MAX = 100;
export const STAMINA_MAX = 100;
export const MAX_ROUNDS = 20;
export const MAX_DAMAGE_PER_TURN = 46;
export const EXHAUSTION_THRESHOLD = 25;

export const SEVERITY_LABEL: Record<number, string> = {
  1: "軽微",
  2: "有効",
  3: "重度",
  4: "決定的",
};

export const SEVERITY_RUBRIC = `深刻度の基準（能力の文章ではなく、戦闘で実際に起きる出来事で判断する）:
1 = 軽微: 牽制、体勢を崩す、わずかな損耗、短い注意逸らし。
2 = 有効: 明確な損耗、数秒の行動不能、単一の有利を作る。戦闘は続行可能。
3 = 重度: 戦闘継続が危うくなる損耗、長期の拘束・能力封じ、戦況を大きく傾ける。
4 = 決定的: 条件が完全に満たされ対抗手段がない場合に、戦闘を終わらせうる。`;

/** 深刻度ごとの基礎損耗 */
export const SEVERITY_DAMAGE: Record<number, number> = { 1: 8, 2: 16, 3: 27, 4: 40 };

export const CONDITION_MULTIPLIER = { met: 1, partial: 0.5, unmet: 0, na: 1 } as const;
export const COUNTERPLAY_MULTIPLIER = { none: 1, partial: 0.55, strong: 0.18 } as const;
export const TEMPO_MULTIPLIER = { advantage: 1.15, neutral: 1, disadvantage: 0.85 } as const;

export const BARRIER_PER_SEVERITY = 18;
export const HEAL_PER_SEVERITY = 13;
export const DAMAGE_TO_STAMINA = 0.3;

export const ACTION_STAMINA: Record<ActionType, number> = {
  activate: 5,
  strike: 6,
  defend: 4,
  evade: 6,
  maneuver: 3,
  recover: 0,
  observe: 2,
  break_free: 8,
  feint: 4,
};

/** 能力発動の追加コスト（使用した効果の最大深刻度に比例） */
export const ABILITY_STAMINA_PER_SEVERITY = 4;

export const RECOVER_STAMINA = 16;
export const DEFEND_MULTIPLIER = 0.6;
export const EVADE_MULTIPLIER = 0.62;
export const EXHAUSTED_MULTIPLIER = 0.6;

export const TEMPO_ORDER: Record<Tempo, number> = {
  instant: 5,
  fast: 4,
  normal: 3,
  slow: 2,
  charge: 1,
};

export const ACTION_TEMPO: Record<ActionType, Tempo> = {
  activate: "normal",
  strike: "normal",
  defend: "normal",
  evade: "fast",
  maneuver: "fast",
  recover: "slow",
  observe: "fast",
  break_free: "slow",
  feint: "fast",
};

export const TEMPO_LABEL: Record<Tempo, string> = {
  instant: "即時",
  fast: "速い",
  normal: "標準",
  slow: "遅い",
  charge: "溜め",
};

export const DURATION_ROUNDS: Record<Exclude<EffectDuration, "instant">, number | null> = {
  short: 2,
  battle: null,
  permanent: null,
};

export function conditionBand(integrity: number): ConditionBand {
  if (integrity <= 0) return "down";
  if (integrity <= 30) return "critical";
  if (integrity <= 60) return "wounded";
  return "intact";
}

export function effectToStatusKind(kind: EffectKind): StatusKind {
  switch (kind) {
    case "bind":
      return "bind";
    case "disable":
      return "seal";
    case "weaken":
      return "weaken";
    case "empower":
      return "empower";
    case "barrier":
      return "barrier";
    case "evasion":
      return "evasion";
    case "mental":
      return "stun";
    case "field":
      return "field";
    default:
      return "other";
  }
}

export function statusLabelFor(kind: EffectKind): string {
  switch (kind) {
    case "damage":
      return "損耗";
    case "bind":
      return "拘束";
    case "disable":
      return "能力封じ";
    case "weaken":
      return "弱体";
    case "empower":
      return "強化";
    case "heal":
      return "再生";
    case "barrier":
      return "防壁";
    case "evasion":
      return "回避態勢";
    case "nullify":
      return "無効化";
    case "copy":
      return "模倣";
    case "field":
      return "環境操作";
    case "rule":
      return "規則変更";
    case "mental":
      return "精神干渉";
    default:
      return "特殊効果";
  }
}

/** 審判プロトコル。プロンプトとUIで同一の文面を使う */
export const ARBITRATION_PROTOCOL = `AI審判プロトコル v${RULESET_VERSION}

1. 本文至上: 能力として書かれていない効果・弱点・コスト・制限を新たに追加してはならない。
   曖昧な点は、その能力の文章から最も狭く合理的に解釈する。
2. 範囲の限定: 絶対性・全能性の主張も、本文が明示する対象・範囲・条件・手順の内側でのみ成立する。
   対象外のもの、条件を満たさない事象には効果がない。
3. 出来事で判断: 文章を強さの数値に変換しない。そのターン、実際に何が起きるか（届くか、防がれるか、
   中断されるか、代償を払えるか）を判断する。
4. 相互性: 両者の行動は同時に進行する。先手・間合い・速度・不意・情報は勝敗を分ける。
   一方的に行動できる保証はない。
5. 対称性: 両者に同一の基準を適用する。主人公補正・悪役補正・贔屓を一切行わない。
6. 対抗手段の検討: 決定的な効果を認める前に、相手の未使用の防御・回避・切り札・発動条件の隙を必ず検討する。
   少しでも有効な対抗手段があれば、決定的効果は成立しない（部分成功に留める）。
7. 代償と消耗: 発動には本文のコストと、共通のスタミナ・負傷規則が等しく適用される。
   大規模な効果ほど身体への負荷が大きい。
8. 継続性: 前ターンの拘束・封印・負傷・環境を無視した行動は認めない。
   戦闘状態として記録された事実は、審判の記憶より優先される。
9. 決着: 勝敗は状態変化の結果としてのみ成立する。文章を先に書いてはならない。
   戦闘不能・消滅・永続封殺が実際に適用されたとき、その時点で決着する。
10. 物語性: 強い能力でも、条件・速度・相性・消耗・隙により敗れることがある。
    弱い能力でも、読み合いと状況次第で勝機がある。`;

export function sideLabel(side: Side): string {
  return side === "A" ? "A" : "B";
}

/** 起動条件・対抗手段などをまとめた短い要約（プロンプト用） */
export function severitySummary(severities: number[]): string {
  if (!severities.length) return "なし";
  const max = Math.max(...severities);
  return `${max}（${SEVERITY_LABEL[max] ?? "不明"}）`;
}
