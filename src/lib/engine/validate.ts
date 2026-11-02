import {
  ABILITY_STAMINA_PER_SEVERITY,
  ACTION_STAMINA,
  MAX_ROUNDS,
} from "./rules";
import { ACTION_LABEL } from "./types";
import type {
  AbilitySpec,
  ActionPlan,
  BattleState,
  CharacterAnalysis,
  EffectKind,
  JudgeEffect,
  JudgeEvent,
  Side,
  TurnAdjudication,
} from "./types";

export interface PlanCheck {
  plan: ActionPlan;
  issues: string[];
}

export function abilityMaxSeverity(ability: AbilitySpec): number {
  return ability.effects.length ? Math.max(...ability.effects.map((effect) => effect.severity)) : 1;
}

function hasSeal(state: BattleState, side: Side, abilityId: string): boolean {
  return state.sides[side].statuses.some(
    (status) =>
      status.kind === "seal" && (!status.targetAbilityId || status.targetAbilityId === abilityId),
  ) || state.sides[side].statuses.some((status) => status.kind === "silence");
}

/**
 * 行動計画の合法性を検査し、違法ならエンジン側で合法な行動へ差し替える。
 * AIの提案をそのまま実行して矛盾を生むより、明示的に補正して記録する。
 */
export function sanitizePlan(params: {
  plan: ActionPlan;
  side: Side;
  analysis: CharacterAnalysis;
  state: BattleState;
}): PlanCheck {
  const { plan, side, analysis, state } = params;
  const issues: string[] = [];
  const sideState = state.sides[side];

  if (sideState.down) {
    if (plan.action !== "maneuver") issues.push("戦闘不能状態での行動を無効化");
    return {
      plan: { ...plan, action: "maneuver", abilityId: null, intent: "戦闘不能" },
      issues,
    };
  }

  const stun = sideState.statuses.find((status) => status.kind === "stun" && status.severity >= 2);
  if (stun && plan.action !== "break_free" && plan.action !== "recover") {
    const canBreak = stun.severity <= 2;
    issues.push(
      `朦朧・時間停止中のため「${ACTION_LABEL[plan.action]}」を${canBreak ? "拘束解除" : "立て直し"}に補正`,
    );
    return {
      plan: { ...plan, action: canBreak ? "break_free" : "recover", abilityId: null },
      issues,
    };
  }

  if (plan.action !== "activate") {
    if (plan.abilityId) {
      issues.push("非発動行動に能力IDが指定されていたため削除");
      return { plan: { ...plan, abilityId: null }, issues };
    }
    return { plan, issues };
  }

  if (!plan.abilityId) {
    issues.push("能力IDなしの発動を、間合いの取り直しに補正");
    return { plan: { ...plan, action: "maneuver", abilityId: null }, issues };
  }

  const ability = analysis.abilities.find((candidate) => candidate.id === plan.abilityId);
  if (!ability) {
    issues.push(`未知の能力ID「${plan.abilityId}」を間合いの取り直しに補正`);
    return { plan: { ...plan, action: "maneuver", abilityId: null }, issues };
  }

  if (ability.mode === "passive" || ability.mode === "reactive") {
    issues.push(
      `能力「${ability.name}」は${ability.mode === "passive" ? "常時" : "自動"}発動のため、行動としての発動を観察に補正`,
    );
    return { plan: { ...plan, action: "observe", abilityId: null }, issues };
  }

  if (hasSeal(state, side, ability.id)) {
    issues.push(`能力「${ability.name}」は封印中のため、立て直しに補正`);
    return { plan: { ...plan, action: "recover", abilityId: null }, issues };
  }

  const uses = sideState.abilityUses[ability.id] ?? 0;
  if (ability.usesPerBattle !== null && uses >= ability.usesPerBattle) {
    issues.push(`能力「${ability.name}」は使用回数上限に達しているため、別行動に補正`);
    return { plan: { ...plan, action: "maneuver", abilityId: null }, issues };
  }

  const cooldownUntil = sideState.cooldowns[ability.id] ?? 0;
  if (cooldownUntil > state.round) {
    issues.push(`能力「${ability.name}」は再使用可能ラウンド（R${cooldownUntil}）前のため、別行動に補正`);
    return { plan: { ...plan, action: "defend", abilityId: null }, issues };
  }

  const cost = ACTION_STAMINA.activate + abilityMaxSeverity(ability) * ABILITY_STAMINA_PER_SEVERITY;
  if (sideState.stamina < cost) {
    issues.push(`スタミナ不足（必要${cost}）のため発動を立て直しに補正`);
    return { plan: { ...plan, action: "recover", abilityId: null }, issues };
  }

  return { plan, issues };
}

export interface AdjudicationCheck {
  ok: boolean;
  errors: string[];
  adjustments: string[];
  adjudication: TurnAdjudication;
}

function abilityOf(analysis: CharacterAnalysis, id: string | null): AbilitySpec | null {
  if (!id) return null;
  return analysis.abilities.find((ability) => ability.id === id) ?? null;
}

function declaredKinds(ability: AbilitySpec): Set<EffectKind> {
  return new Set(ability.effects.map((effect) => effect.kind));
}

function maxSeverityFor(ability: AbilitySpec, kind: EffectKind): number {
  const list = ability.effects.filter((effect) => effect.kind === kind);
  return list.length ? Math.max(...list.map((effect) => effect.severity)) : 0;
}

function declaredLethal(ability: AbilitySpec, effect: JudgeEffect): boolean {
  return ability.effects.some(
    (spec) => spec.lethal && spec.kind === effect.kind && spec.severity >= 4,
  );
}

/**
 * 審判の裁定を意味レベルで検証する。
 *  - ハードエラー: 能力外の効果、未知の能力、行動の改変など → 再生成させる
 *  - ソフト補正: 深刻度の上限、条件未達時の効果除去など → 補正して記録
 */
export function checkAdjudication(params: {
  adjudication: TurnAdjudication;
  analyses: Record<Side, CharacterAnalysis>;
  plans: Record<Side, ActionPlan>;
  state: BattleState;
}): AdjudicationCheck {
  const { analyses, plans, state } = params;
  const adjudication: TurnAdjudication = structuredClone(params.adjudication);
  const errors: string[] = [];
  const adjustments: string[] = [];

  const seen = new Set<Side>();
  const deduped: JudgeEvent[] = [];
  for (const event of adjudication.events) {
    if (seen.has(event.side)) {
      adjustments.push(`${event.side}の裁定が重複していたため最初のものを採用`);
      continue;
    }
    seen.add(event.side);
    deduped.push(event);
  }
  for (const side of ["A", "B"] as const) {
    if (!seen.has(side)) errors.push(`${side}の裁定イベントが不足している`);
  }
  adjudication.events = deduped;

  for (const event of adjudication.events) {
    const plan = plans[event.side];
    const analysis = analyses[event.side];

    if (event.action !== plan.action) {
      // 計画側はエンジンが合法性を検査済み。裁定を計画に合わせ、発動でないなら効果を破棄する
      adjustments.push(
        `${event.side}: 裁定の行動（${event.action}）を確定済みの計画（${plan.action}）に補正`,
      );
      event.action = plan.action;
      if (plan.action !== "activate") {
        event.abilityId = null;
        event.effects = [];
        event.conditionStatus = "na";
        event.conditionEvidence = "";
      }
    }

    if (plan.action === "activate") {
      if (event.abilityId !== plan.abilityId) {
        errors.push(
          `${event.side}: 選択されていない能力（${event.abilityId ?? "null"}）を裁定している。選択された能力ID「${plan.abilityId}」で裁定すること`,
        );
        event.abilityId = plan.abilityId;
      }
      const ability = abilityOf(analysis, event.abilityId);
      if (!ability) {
        errors.push(`${event.side}: 能力ID「${event.abilityId ?? "null"}」が解析結果に存在しない`);
        continue;
      }
      if (event.conditionStatus === "na") {
        errors.push(`${event.side}: 能力発動には conditionStatus を met/partial/unmet のいずれかで示すこと`);
      }
      if (!ability.conditions.length && event.conditionStatus === "unmet") {
        errors.push(
          `${event.side}: 能力「${ability.name}」には明示された発動条件がない。条件を創作して unmet にしてはならない`,
        );
        event.conditionStatus = "met";
      }

      if (event.interrupted) {
        if (event.effects.length) adjustments.push(`${event.side}: 中断された効果を除去`);
        event.effects = [];
        event.success = false;
      }
      if (event.conditionStatus === "unmet") {
        if (event.effects.length) adjustments.push(`${event.side}: 条件未達の効果を除去`);
        event.effects = [];
        event.success = false;
      }

      const allowed = declaredKinds(ability);
      const kept: JudgeEffect[] = [];
      for (const effect of event.effects) {
        if (!allowed.has(effect.kind)) {
          errors.push(
            `${event.side}: 能力「${ability.name}」に存在しない効果kind「${effect.kind}」を適用しようとしている。解析済みの効果のみを使うこと`,
          );
          continue;
        }
        if (effect.kind === "disable" && effect.targetAbilityId) {
          const targetSide: Side = event.side === "A" ? "B" : "A";
          const exists = params.analyses[targetSide].abilities.some(
            (candidate) => candidate.id === effect.targetAbilityId,
          );
          if (!exists) {
            adjustments.push(`${event.side}: 存在しない封印対象「${effect.targetAbilityId}」を相手の主要能力に補正`);
            effect.targetAbilityId = null;
          }
        }
        const max = maxSeverityFor(ability, effect.kind);
        if (effect.severity > max) {
          adjustments.push(`${effect.label}: 深刻度${effect.severity}→解析上限${max}に補正`);
          effect.severity = max;
        }
        if (effect.lethal) {
          const allowedLethal =
            declaredLethal(ability, effect) &&
            effect.severity === 4 &&
            event.conditionStatus === "met" &&
            event.counterplay === "none" &&
            event.tempo !== "disadvantage";
          if (!allowedLethal) {
            adjustments.push(`${effect.label}: 条件・対抗・解析根拠が不足するため lethal を解除`);
            effect.lethal = false;
          }
        }
        kept.push(effect);
      }
      event.effects = kept.slice(0, 5);
    } else {
      if (event.abilityId) {
        adjustments.push(`${event.side}: 非発動行動から能力IDを除去`);
        event.abilityId = null;
      }
      if (event.effects.length) {
        adjustments.push(`${event.side}: 非発動行動の直接効果を除去（打撃はエンジンが処理）`);
        event.effects = [];
      }
      if (event.conditionStatus !== "na") {
        adjustments.push(`${event.side}: 非発動行動の条件判定を na に補正`);
        event.conditionStatus = "na";
      }
      if (event.interrupted) event.success = false;
    }

    if (!event.beats.length) {
      event.beats = [event.summary];
      adjustments.push(`${event.side}: 描写ビートが空だったため要約から補完`);
    }
    if (event.summary.length < 2) {
      errors.push(`${event.side}: summary が空。何が起きたかを書くこと`);
    }
  }

  // 決着宣言の整合（状態が優先されるため、ここでは警告のみ）
  if (adjudication.finished && adjudication.winner === null) {
    adjustments.push("決着宣言に勝者が無いため、状態による判定に委ねる");
  }
  if (!adjudication.finished && adjudication.winner) {
    adjustments.push("決着なしの裁定に勝者宣言があったため無視");
    adjudication.winner = null;
  }

  if (state.turnsResolved + 1 > MAX_ROUNDS) {
    adjustments.push("規定ラウンドを超えるため、このラウンドで判定する");
  }

  return { ok: errors.length === 0, errors, adjustments, adjudication };
}

/** 裁定の内容を人間可読な監査ログにする（UIの「審判の判断根拠」用） */
export function ledgerAuditLines(params: {
  adjudication: TurnAdjudication;
  analyses: Record<Side, CharacterAnalysis>;
}): string[] {
  const lines: string[] = [];
  for (const event of params.adjudication.events) {
    const ability = abilityOf(params.analyses[event.side], event.abilityId);
    if (!ability) continue;
    lines.push(
      `${event.side}・${ability.name}: 条件=${event.conditionStatus}（${event.conditionEvidence || "根拠記載なし"}） / 対抗=${event.counterplay}（${event.counterplayDetail || "なし"}） / 優劣=${event.tempo}`,
    );
  }
  return lines;
}
