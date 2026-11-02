import {
  ACTION_STAMINA,
  ABILITY_STAMINA_PER_SEVERITY,
  BARRIER_PER_SEVERITY,
  CONDITION_MULTIPLIER,
  COUNTERPLAY_MULTIPLIER,
  DAMAGE_TO_STAMINA,
  DEFEND_MULTIPLIER,
  EVADE_MULTIPLIER,
  EXHAUSTED_MULTIPLIER,
  EXHAUSTION_THRESHOLD,
  HEAL_PER_SEVERITY,
  INTEGRITY_MAX,
  MAX_DAMAGE_PER_TURN,
  MAX_ROUNDS,
  RECOVER_STAMINA,
  SEVERITY_DAMAGE,
  STAMINA_MAX,
  TEMPO_MULTIPLIER,
  TEMPO_ORDER,
  ACTION_TEMPO,
  DURATION_ROUNDS,
  conditionBand,
  effectToStatusKind,
  statusLabelFor,
} from "./rules";
import type {
  AbilitySpec,
  ActionPlan,
  AppliedEffect,
  BattleState,
  CharacterAnalysis,
  EffectKind,
  JudgeEffect,
  JudgeEvent,
  LedgerEvent,
  Side,
  StatusEffect,
  TurnAdjudication,
  TurnLedger,
} from "./types";
import { ACTION_LABEL } from "./types";

const other = (side: Side): Side => (side === "A" ? "B" : "A");

export interface ApplyParams {
  state: BattleState;
  analyses: Record<Side, CharacterAnalysis>;
  plans: Record<Side, ActionPlan>;
  adjudication: TurnAdjudication;
  sideNames: Record<Side, string>;
}

export interface ApplyResult {
  state: BattleState;
  ledger: TurnLedger;
}

function abilityById(analysis: CharacterAnalysis, id: string | null): AbilitySpec | null {
  if (!id) return null;
  return analysis.abilities.find((ability) => ability.id === id) ?? null;
}

function declaredLethal(ability: AbilitySpec | null, effect: JudgeEffect): boolean {
  if (!ability) return false;
  return ability.effects.some(
    (spec) => spec.lethal && spec.kind === effect.kind && spec.severity >= 4,
  );
}

function declaredMaxSeverity(ability: AbilitySpec, kind: EffectKind): number {
  const relevant = ability.effects.filter((effect) => effect.kind === kind);
  if (!relevant.length) return 0;
  return Math.max(...relevant.map((effect) => effect.severity));
}

function hasStatus(side: BattleState["sides"][Side], kind: string): boolean {
  return side.statuses.some((status) => status.kind === kind);
}

function statusPower(side: BattleState["sides"][Side], kind: string): number {
  return side.statuses.filter((status) => status.kind === kind).reduce((sum, status) => sum + status.severity, 0);
}

function statusRaw(side: BattleState["sides"][Side], labels: string[]): boolean {
  return side.statuses.some((status) => labels.some((label) => status.label.includes(label)));
}

function addStatus(
  target: BattleState["sides"][Side] | { statuses: StatusEffect[] },
  effect: JudgeEffect,
  side: Side | "field",
  round: number,
  created: Set<string>,
): StatusEffect | null {
  if (effect.kind === "damage" || effect.kind === "heal" || effect.kind === "copy") return null;
  const kind = effectToStatusKind(effect.kind);
  const remaining = effect.duration === "instant" ? 1 : DURATION_ROUNDS[effect.duration as keyof typeof DURATION_ROUNDS] ?? null;
  const status: StatusEffect = {
    id: `${side}-${round}-${effect.kind}-${created.size}-${Math.random().toString(36).slice(2, 7)}`,
    label: effect.label || statusLabelFor(effect.kind),
    kind,
    source: side === "field" ? "field" : side,
    severity: effect.severity,
    description: effect.description,
    remaining,
    absorb: effect.kind === "barrier" ? effect.severity * BARRIER_PER_SEVERITY : undefined,
    targetAbilityId: effect.targetAbilityId ?? null,
    tags: [effect.kind],
  };
  target.statuses.push(status);
  created.add(status.id);
  return status;
}

function removeStatus(side: BattleState["sides"][Side], id: string): void {
  side.statuses = side.statuses.filter((status) => status.id !== id);
}

function tickStatuses(state: BattleState): string[] {
  const notes: string[] = [];
  const tick = (list: StatusEffect[]): StatusEffect[] =>
    list
      .map((status) => {
        if (status.remaining === null) return status;
        const next: StatusEffect = { ...status, remaining: status.remaining - 1 };
        if (next.remaining !== null && next.remaining <= 0) {
          notes.push(`${next.label}が解けた`);
          return null;
        }
        return next;
      })
      .filter((status): status is StatusEffect => Boolean(status));
  for (const side of ["A", "B"] as const) {
    state.sides[side].statuses = tick(state.sides[side].statuses);
  }
  state.field.statuses = tick(state.field.statuses);
  return notes;
}

function applyRegen(state: BattleState): string[] {
  const notes: string[] = [];
  for (const side of ["A", "B"] as const) {
    for (const status of state.sides[side].statuses) {
      if (status.kind === "regen") {
        const amount = status.severity * 4;
        state.sides[side].integrity = Math.min(INTEGRITY_MAX, state.sides[side].integrity + amount);
        notes.push(`${side}の再生が損耗を${amount}回復`);
      }
    }
  }
  return notes;
}

function syncExhaustion(state: BattleState): void {
  for (const side of ["A", "B"] as const) {
    const s = state.sides[side];
    const existing = s.statuses.find((status) => status.id === `exhausted-${side}`);
    if (s.stamina < EXHAUSTION_THRESHOLD && !existing) {
      s.statuses.push({
        id: `exhausted-${side}`,
        label: "疲弊",
        kind: "weaken",
        source: side,
        severity: 1,
        description: "消耗が限界に近く、あらゆる出力が落ちている",
        remaining: null,
        tags: ["exhaustion"],
      });
    } else if (s.stamina >= EXHAUSTION_THRESHOLD && existing) {
      s.statuses = s.statuses.filter((status) => status.id !== `exhausted-${side}`);
    }
  }
}

function tempoScore(plan: ActionPlan, analysis: CharacterAnalysis, side: BattleState["sides"][Side]): number {
  const ability = abilityById(analysis, plan.abilityId);
  const base = plan.action === "activate" && ability ? TEMPO_ORDER[ability.tempo] : TEMPO_ORDER[ACTION_TEMPO[plan.action]];
  let penalty = 0;
  if (hasStatus(side, "stun")) penalty += 2;
  if (hasStatus(side, "bind")) penalty += 1;
  return base - penalty;
}

function attackFactor(attacker: BattleState["sides"][Side]): number {
  let factor = 1;
  const empower = statusPower(attacker, "empower");
  const weaken = statusPower(attacker, "weaken");
  if (empower) factor *= 1 + Math.min(0.5, empower * 0.12);
  if (weaken) factor *= Math.max(0.4, 1 - weaken * 0.15);
  if (attacker.stamina < EXHAUSTION_THRESHOLD) factor *= EXHAUSTED_MULTIPLIER;
  return factor;
}

function defenseFactor(defender: BattleState["sides"][Side], plan: ActionPlan): number {
  let factor = 1;
  if (plan.action === "defend") factor *= DEFEND_MULTIPLIER;
  if (plan.action === "evade" || hasStatus(defender, "evasion")) factor *= EVADE_MULTIPLIER;
  return factor;
}

function absorbWithBarrier(defender: BattleState["sides"][Side], damage: number): { damage: number; absorbed: number; notes: string[] } {
  let remaining = damage;
  let absorbed = 0;
  const notes: string[] = [];
  for (const status of defender.statuses) {
    if (status.kind !== "barrier" || !status.absorb || status.absorb <= 0 || remaining <= 0) continue;
    const use = Math.min(status.absorb, remaining);
    status.absorb -= use;
    remaining -= use;
    absorbed += use;
    notes.push(`防壁「${status.label}」が${Math.round(use)}を吸収`);
    if (status.absorb <= 0) {
      status.remaining = 0;
      notes.push(`防壁「${status.label}」が砕けた`);
    }
  }
  defender.statuses = defender.statuses.filter((status) => status.remaining !== 0 || status.absorb === undefined);
  return { damage: remaining, absorbed, notes };
}

function consumeNullify(defender: BattleState["sides"][Side]): boolean {
  const index = defender.statuses.findIndex((status) => status.kind === "other" && (status.tags ?? []).includes("nullify"));
  if (index < 0) return false;
  defender.statuses.splice(index, 1);
  return true;
}

function checkDown(state: BattleState, side: Side): void {
  const s = state.sides[side];
  if (s.integrity <= 0) {
    s.integrity = 0;
    s.down = true;
  }
  if (s.statuses.some((status) => (status.tags ?? []).includes("lethal") && status.remaining !== 0)) {
    s.down = true;
  }
}

function damageCapRemaining(dealt: number): number {
  return Math.max(0, MAX_DAMAGE_PER_TURN - dealt);
}

/** 1ラウンド分のイベントを、状態へ決定論的に適用する */
export function applyTurn(params: ApplyParams): ApplyResult {
  const { analyses, plans, adjudication, sideNames } = params;
  const state: BattleState = structuredClone(params.state);
  const created = new Set<string>();
  const adjustments: string[] = [];
  const fairnessFlags: string[] = [];
  const integrityBefore = { A: state.sides.A.integrity, B: state.sides.B.integrity };
  const staminaBefore = { A: state.sides.A.stamina, B: state.sides.B.stamina };
  const damageDealtBy = { A: 0, B: 0 };

  // 防御・回避の構えは先手に関係なく同時に成立する
  const defendingPlan: Record<Side, ActionPlan> = { A: plans.A, B: plans.B };

  // 先手の決定（エンジン側の速度検証）
  let first: Side | "simultaneous" = adjudication.initiative.first;
  if (first !== "simultaneous") {
    const slowSide = other(first);
    const fastScore = tempoScore(plans[first], analyses[first], state.sides[first]);
    const slowScore = tempoScore(plans[slowSide], analyses[slowSide], state.sides[slowSide]);
    if (slowScore - fastScore >= 3) {
      first = slowSide;
      adjustments.push(
        `審判の先手判定が速度差と大きく矛盾していたため、速度（${fastScore}対${slowScore}）を優先して先手を${slowSide}に補正`,
      );
      fairnessFlags.push("initiative_override");
    }
  }
  if (first === "simultaneous") {
    // 同時進行では双方が同時に効果を通す。適用順はA→Bだが、防御・回避は両者に適用済み
    adjustments.push("先手同時のため、双方の効果を同時成立として処理");
  }

  const order: Side[] = first === "B" ? ["B", "A"] : ["A", "B"];
  const eventsBySide = new Map<Side, JudgeEvent>();
  for (const event of adjudication.events) {
    if (!eventsBySide.has(event.side)) eventsBySide.set(event.side, event);
  }

  const ledgerEvents: LedgerEvent[] = [];

  // 拘束・封じのチェックは、行動開始時点の状態で行う
  const initialStatuses = {
    A: state.sides.A.statuses.map((status) => ({ ...status })),
    B: state.sides.B.statuses.map((status) => ({ ...status })),
  };
  const downAtRoundStart = { A: state.sides.A.down, B: state.sides.B.down };

  for (const side of order) {
    const opposing = other(side);
    const plan = plans[side];
    const actor = state.sides[side];
    const defender = state.sides[opposing];
    const analysis = analyses[side];
    const event = eventsBySide.get(side);
    const ability = abilityById(analysis, event?.abilityId ?? plan.abilityId);
    const localAdjustments: string[] = [];
    const appliedEffects: AppliedEffect[] = [];
    const dealtStart = damageDealtBy[side];
    let selfDamageTotal = 0;

    const pushEvent = (data: Partial<LedgerEvent> & Pick<LedgerEvent, "success" | "summary">) => {
      ledgerEvents.push({
        side,
        action: plan.action,
        abilityId: ability?.id ?? null,
        abilityName: ability?.name ?? null,
        conditionStatus: event?.conditionStatus ?? "na",
        counterplay: event?.counterplay ?? "none",
        tempo: event?.tempo ?? "neutral",
        interrupted: event?.interrupted ?? false,
        staminaCost: 0,
        effects: appliedEffects,
        damageDealt: 0,
        damageTaken: 0,
        selfDamage: 0,
        beats: event?.beats ?? [],
        adjustments: localAdjustments,
        ...data,
      });
    };

    const simultaneousResolution = first === "simultaneous" && !downAtRoundStart[side];
    if (actor.down && !simultaneousResolution) {
      localAdjustments.push("戦闘不能のため行動できない");
      pushEvent({ success: false, summary: `${sideNames[side]}は戦闘不能で動けない`, staminaCost: 0 });
      continue;
    }
    if (actor.down && simultaneousResolution) {
      localAdjustments.push("同時進行のため、戦闘不能と行動成立が同一瞬間に処理される");
    }

    // 重度の朦朧・時間停止下では、解除か体勢の立て直ししかできない
    const stunned = actor.statuses.some((status) => status.kind === "stun" && status.severity >= 2);
    if (stunned && plan.action !== "break_free" && plan.action !== "recover") {
      localAdjustments.push("朦朧・時間停止のため行動できない");
      pushEvent({
        success: false,
        summary: `${sideNames[side]}は朦朧とし、狙った行動を取れなかった`,
        staminaCost: 0,
      });
      continue;
    }

    // nullify: 相手が無効化状態を保持している場合、最初の効果的な行動を打ち消す
    const nullified = consumeNullify(defender);
    if (nullified && plan.action !== "recover" && plan.action !== "observe") {
      localAdjustments.push("相手の無効化により行動が打ち消された");
      pushEvent({ success: false, summary: `${sideNames[side]}の行動は無効化された`, staminaCost: 0 });
      continue;
    }

    // スタミナ
    const maxSeverity = ability ? Math.max(...ability.effects.map((effect) => effect.severity)) : 1;
    const cost =
      plan.action === "activate"
        ? ACTION_STAMINA.activate + maxSeverity * ABILITY_STAMINA_PER_SEVERITY
        : ACTION_STAMINA[plan.action];
    if (plan.action === "recover") {
      actor.stamina = Math.min(STAMINA_MAX, actor.stamina + RECOVER_STAMINA);
    } else if (actor.stamina < cost) {
      localAdjustments.push(`スタミナ不足（必要${cost} / 残${Math.round(actor.stamina)}）`);
      pushEvent({ success: false, summary: `${sideNames[side]}は消耗し、狙った行動を取れなかった`, staminaCost: 0 });
      continue;
    } else {
      actor.stamina = Math.max(0, actor.stamina - cost);
    }

    if (plan.action === "recover") {
      pushEvent({ success: true, summary: `${sideNames[side]}は体勢を立て直し、呼吸を整えた`, staminaCost: 0 });
      continue;
    }

    if (plan.action === "observe") {
      defender.notes = Array.from(new Set([...defender.notes, "相手に観察されている"]));
      pushEvent({ success: true, summary: `${sideNames[side]}は相手の出方を観察した`, staminaCost: cost });
      continue;
    }

    if (plan.action === "break_free") {
      const before = actor.statuses.length;
      const removed = actor.statuses.filter(
        (status) => ["bind", "stun", "seal"].includes(status.kind) && status.severity <= 2,
      );
      actor.statuses = actor.statuses.filter((status) => !removed.includes(status));
      localAdjustments.push(
        removed.length ? `拘束・封じを${removed.length}件解除` : "解除できる拘束がなく、体勢を崩すに留まった",
      );
      pushEvent({
        success: removed.length > 0 || before === 0,
        summary: removed.length
          ? `${sideNames[side]}は拘束から抜け出した`
          : `${sideNames[side]}は拘束を振りほどこうとしたが、抜け出せなかった`,
        staminaCost: cost,
      });
      continue;
    }

    if (plan.action === "defend" || plan.action === "evade" || plan.action === "maneuver" || plan.action === "feint") {
      if (plan.action === "feint") {
        const opponentEvent = eventsBySide.get(opposing);
        if (opponentEvent) opponentEvent.tempo = opponentEvent.tempo === "advantage" ? "neutral" : "disadvantage";
        localAdjustments.push("相手の次の行動に揺さぶりをかけた");
      }
      const summary =
        plan.action === "defend"
          ? `${sideNames[side]}は身を固めて迎え撃つ`
          : plan.action === "evade"
            ? `${sideNames[side]}は間合いを外して回避に備える`
            : plan.action === "maneuver"
              ? `${sideNames[side]}は位置を取り直した`
              : `${sideNames[side]}は牽制で相手の出鼻をくじいた`;
      pushEvent({ success: true, summary, staminaCost: cost });
      continue;
    }

    if (plan.action === "strike") {
      const bind = initialStatuses[side].some((status) => status.kind === "bind" && status.severity >= 3);
      if (bind) {
        localAdjustments.push("重度の拘束下では打撃が届かない");
        pushEvent({ success: false, summary: `${sideNames[side]}は拘束され、打撃を繰り出せない`, staminaCost: cost });
        continue;
      }
      const condition = event?.conditionStatus === "unmet" ? "partial" : (event?.conditionStatus ?? "na");
      let damage = SEVERITY_DAMAGE[1];
      damage *= CONDITION_MULTIPLIER[condition === "na" ? "met" : condition] || 1;
      damage *= COUNTERPLAY_MULTIPLIER[event?.counterplay ?? "none"];
      damage *= TEMPO_MULTIPLIER[event?.tempo ?? "neutral"];
      damage *= attackFactor(actor);
      damage *= defenseFactor(defender, defendingPlan[opposing]);
      if (hasStatus(actor, "bind")) damage *= 0.6;
      damage = Math.min(damage, damageCapRemaining(damageDealtBy[side]));
      const barrier = absorbWithBarrier(defender, damage);
      const dealt = Math.max(0, barrier.damage);
      defender.integrity = Math.max(0, defender.integrity - dealt);
      defender.stamina = Math.max(0, defender.stamina - dealt * DAMAGE_TO_STAMINA);
      damageDealtBy[side] += dealt;
      if (dealt > 0) {
        appliedEffects.push({
          kind: "damage",
          label: "打撃",
          target: "opponent",
          severity: 1,
          duration: "instant",
          lethal: false,
          damage: dealt,
          absorbed: barrier.absorbed,
          statusApplied: null,
          note: barrier.notes.join(" / ") || "通常攻撃",
        });
      }
      if (dealt > 0 && defender.integrity <= 0) defender.down = true;
      localAdjustments.push(...barrier.notes);
      pushEvent({
        success: true,
        summary:
          dealt > 0
            ? `${sideNames[side]}の打撃が${sideNames[opposing]}を捉えた`
            : `${sideNames[side]}の打撃は届かなかった`,
        staminaCost: cost,
        damageDealt: dealt,
      });
      continue;
    }

    // ── 能力発動 ──
    if (plan.action !== "activate") {
      pushEvent({ success: false, summary: `${sideNames[side]}は行動できなかった`, staminaCost: cost });
      continue;
    }

    if (!ability) {
      localAdjustments.push("不明な能力IDのため不成立");
      pushEvent({ success: false, summary: `${sideNames[side]}の能力は発動しなかった`, staminaCost: cost });
      continue;
    }

    // 封印・発動不能
    const sealAll = actor.statuses.some((status) => status.kind === "seal" && !status.targetAbilityId);
    const sealTarget = actor.statuses.some(
      (status) => status.kind === "seal" && status.targetAbilityId === ability.id,
    );
    const silenced = hasStatus(actor, "silence");
    if (sealAll || sealTarget || silenced) {
      localAdjustments.push(
        sealAll || sealTarget ? `能力「${ability.name}」は封印されている` : "発動不能状態にある",
      );
      pushEvent({ success: false, summary: `${sideNames[side]}は能力を発動できなかった`, staminaCost: cost });
      continue;
    }

    if (event?.interrupted) {
      localAdjustments.push("発動を中断された");
      pushEvent({ success: false, summary: `${sideNames[side]}の能力発動は中断された`, staminaCost: cost });
      continue;
    }

    if (!event) {
      localAdjustments.push("審判の裁定が欠落していたため不成立");
      pushEvent({ success: false, summary: `${sideNames[side]}の能力は発動しなかった`, staminaCost: cost });
      continue;
    }

    if (event.conditionStatus === "unmet" || !event.success) {
      localAdjustments.push(
        event.conditionStatus === "unmet" ? "発動条件を満たさず不成立" : "審判により不成立と裁定",
      );
      pushEvent({ success: false, summary: `${sideNames[side]}の「${ability.name}」は発動しなかった`, staminaCost: cost });
      continue;
    }

    // 発動の記録（回数上限・クールダウンは次ラウンド以降の行動選択を拘束する）
    actor.abilityUses[ability.id] = (actor.abilityUses[ability.id] ?? 0) + 1;
    if (ability.cooldownRounds && ability.cooldownRounds > 0) {
      actor.cooldowns[ability.id] = state.round + ability.cooldownRounds + 1;
    }

    // 効果の適用
    let lethalApplied = false;
    const effectTargetSide = (effect: JudgeEffect): Side | "field" | null => {
      if (effect.target === "self") return side;
      if (effect.target === "field") return "field";
      return opposing;
    };

    for (const effect of event.effects) {
      const maxSev = declaredMaxSeverity(ability, effect.kind);
      const severity = Math.min(effect.severity, maxSev);
      if (severity < effect.severity) {
        localAdjustments.push(`${effect.label}の深刻度を解析上限${maxSev}に補正`);
        fairnessFlags.push("severity_clamped");
      }
      const targetSide = effectTargetSide(effect);
      if (!targetSide) continue;

      if (effect.kind === "damage") {
        if (targetSide === "field") continue;
        const tgt = state.sides[targetSide];
        let damage = SEVERITY_DAMAGE[severity];
        damage *= CONDITION_MULTIPLIER[event.conditionStatus] || 1;
        damage *= COUNTERPLAY_MULTIPLIER[event.counterplay];
        damage *= TEMPO_MULTIPLIER[event.tempo];
        if (targetSide !== side) {
          damage *= attackFactor(actor);
          damage *= defenseFactor(tgt, defendingPlan[targetSide]);
          if (hasStatus(actor, "bind")) damage *= 0.7;
        }
        const cap = targetSide === side ? Infinity : damageCapRemaining(damageDealtBy[side]);
        const lethalAllowed =
          effect.lethal &&
          severity === 4 &&
          event.conditionStatus === "met" &&
          event.counterplay === "none" &&
          event.tempo !== "disadvantage" &&
          declaredLethal(ability, effect) &&
          targetSide !== side &&
          !["defend", "evade"].includes(defendingPlan[targetSide].action) &&
          !tgt.statuses.some((status) => status.kind === "barrier" || status.kind === "evasion");
        if (lethalAllowed) {
          lethalApplied = true;
          damage = tgt.integrity;
        } else {
          damage = Math.min(damage, cap);
        }
        const barrier = targetSide === side ? { damage, absorbed: 0, notes: [] } : absorbWithBarrier(tgt, damage);
        const dealt = Math.max(0, barrier.damage);
        tgt.integrity = Math.max(0, tgt.integrity - dealt);
        if (targetSide !== side) {
          damageDealtBy[side] += dealt;
          tgt.stamina = Math.max(0, tgt.stamina - dealt * DAMAGE_TO_STAMINA);
        } else {
          selfDamageTotal += dealt;
        }
        appliedEffects.push({
          kind: "damage",
          label: effect.label,
          target: effect.target,
          severity,
          duration: effect.duration,
          lethal: lethalAllowed,
          damage: dealt,
          absorbed: barrier.absorbed,
          statusApplied: null,
          note: effect.description,
        });
        localAdjustments.push(...barrier.notes);
        if (lethalAllowed) {
          tgt.down = true;
          localAdjustments.push("決定的効果が成立し、戦闘不能");
        } else if (tgt.integrity <= 0) {
          tgt.down = true;
        }
        continue;
      }

      if (effect.kind === "heal") {
        if (targetSide === "field") continue;
        const tgt = state.sides[targetSide];
        const amount = severity * HEAL_PER_SEVERITY;
        const before = tgt.integrity;
        tgt.integrity = Math.min(INTEGRITY_MAX, tgt.integrity + amount);
        if (tgt.integrity > 0) tgt.down = false;
        appliedEffects.push({
          kind: "heal",
          label: effect.label || "再生",
          target: effect.target,
          severity,
          duration: effect.duration,
          lethal: false,
          damage: 0,
          absorbed: 0,
          statusApplied: null,
          note: `${effect.description}（${Math.round(tgt.integrity - before)}回復）`,
        });
        continue;
      }

      if (effect.kind === "disable" && targetSide !== "field") {
        const tgt = state.sides[targetSide];
        if (!effect.targetAbilityId) {
          const targetAbilities = analyses[targetSide].abilities;
          const strongest = [...targetAbilities].sort(
            (a, b) => Math.max(...b.effects.map((e) => e.severity)) - Math.max(...a.effects.map((e) => e.severity)),
          )[0];
          if (strongest) {
            effect.targetAbilityId = strongest.id;
            localAdjustments.push(`封印対象を相手の主要能力「${strongest.name}」に特定`);
          }
        }
      }

      const decisiveAllowed =
        effect.lethal &&
        severity === 4 &&
        event.conditionStatus === "met" &&
        event.counterplay === "none" &&
        event.tempo !== "disadvantage" &&
        declaredLethal(ability, effect) &&
        targetSide !== side &&
        targetSide !== "field" &&
        !["defend", "evade"].includes(defendingPlan[targetSide].action) &&
        !state.sides[targetSide].statuses.some(
          (status) => status.kind === "barrier" || status.kind === "evasion",
        );
      if (decisiveAllowed) {
        const tgt = state.sides[targetSide];
        tgt.down = true;
        lethalApplied = true;
        localAdjustments.push(`${effect.label}が成立し、${targetSide}は戦闘不能`);
      }

      if (targetSide === "field") {
        const status = addStatus(state.field, effect, "field", state.round, created);
        if (status) {
          appliedEffects.push({
            kind: effect.kind,
            label: effect.label || status.label,
            target: "field",
            severity,
            duration: effect.duration,
            lethal: false,
            damage: 0,
            absorbed: 0,
            statusApplied: status,
            note: effect.description,
          });
        }
        continue;
      }

      const tgt = state.sides[targetSide];
      const status = addStatus(tgt, effect, side, state.round, created);
      if (status) {
        appliedEffects.push({
          kind: effect.kind,
          label: effect.label || status.label,
          target: effect.target,
          severity,
          duration: effect.duration,
          lethal: false,
          damage: 0,
          absorbed: 0,
          statusApplied: status,
          note: effect.description,
        });
      }
    }

    checkDown(state, opposing);
    if (lethalApplied) checkDown(state, opposing);
    pushEvent({
      success: true,
      summary: event.summary,
      staminaCost: cost,
      damageDealt: damageDealtBy[side] - dealtStart,
      damageTaken: selfDamageTotal,
      selfDamage: selfDamageTotal,
    });
  }

  // 再生 → 状態異常の経過 → 疲弊の同期
  const regenNotes = applyRegen(state);
  const tickNotes = tickStatuses(state);
  syncExhaustion(state);
  checkDown(state, "A");
  checkDown(state, "B");

  state.turnsResolved += 1;
  state.round = state.turnsResolved + 1;

  // 決着判定
  let finished = false;
  let winner: Side | "draw" | null = null;
  let endingReason: string | null = null;

  if (state.sides.A.down && state.sides.B.down) {
    finished = true;
    winner = "draw";
    endingReason = "両者が同時に戦闘不能となった";
  } else if (state.sides.A.down || state.sides.B.down) {
    finished = true;
    winner = state.sides.A.down ? "B" : "A";
    endingReason = `${sideNames[state.sides.A.down ? "A" : "B"]}が戦闘不能となった`;
  } else if (state.turnsResolved >= MAX_ROUNDS) {
    finished = true;
    const a = state.sides.A;
    const b = state.sides.B;
    if (Math.abs(a.integrity - b.integrity) > 0.5) {
      winner = a.integrity > b.integrity ? "A" : "B";
      endingReason = `規定ラウンド（${MAX_ROUNDS}）終了時、残存戦力の差で${sideNames[winner]}の優勢勝ち`;
    } else if (Math.abs(a.stamina - b.stamina) > 0.5) {
      winner = a.stamina > b.stamina ? "A" : "B";
      endingReason = `規定ラウンド終了時、消耗の差で${sideNames[winner]}の優勢勝ち`;
    } else {
      winner = "draw";
      endingReason = "規定ラウンド終了時、両者の戦力・消耗が拮抗";
    }
  }

  // 審判の決着宣言との突き合わせ（状態が優先）
  if (adjudication.finished && !finished) {
    fairnessFlags.push("judge_finished_without_state");
    adjustments.push("審判は決着を宣言したが状態変化が決定的でないため、戦闘を継続");
  }
  if (finished && !adjudication.finished) {
    adjustments.push("審判の決着宣言はなかったが、状態変化により決着が成立");
  }
  if (finished && adjudication.winner && winner && adjudication.winner !== winner) {
    fairnessFlags.push("winner_mismatch");
    adjustments.push("審判の勝者宣言と状態から導かれる勝者が異なるため、状態を優先");
  }

  if (!finished) {
    // 状態の残りターンとフィールド変化を記録
    state.field.hazards = Array.from(new Set([...state.field.hazards, ...adjudication.fieldNotes])).slice(0, 12);
  }

  // 永続事実と年表
  const newFacts = adjudication.persistentFacts.filter(
    (fact) => fact && !state.persistentFacts.includes(fact),
  );
  state.persistentFacts = [...state.persistentFacts, ...newFacts].slice(-24);
  const chronicleLine = ledgerEvents
    .map((event) => {
      const verdict = event.success ? "成立" : "不成立";
      const damage = event.damageDealt > 0 ? `、相手に${Math.round(event.damageDealt)}損耗` : "";
      const self = event.selfDamage > 0 ? `、自傷${Math.round(event.selfDamage)}` : "";
      const status = event.effects.length
        ? `、${event.effects.map((effect) => effect.label).join("・")}`
        : "";
      return `${event.side}:${event.abilityName ?? ACTION_LABEL[event.action]}（${verdict}${damage}${self}${status}）`;
    })
    .join(" / ");
  state.chronicle = [...state.chronicle, `R${state.turnsResolved}: ${chronicleLine}`].slice(-24);

  const integrityAfter = { A: state.sides.A.integrity, B: state.sides.B.integrity };
  const damageTo = {
    A: Math.max(0, integrityBefore.A - integrityAfter.A),
    B: Math.max(0, integrityBefore.B - integrityAfter.B),
  };

  if (!finished && state.sides.A.integrity <= 0) {
    finished = true;
    winner = "B";
    endingReason = `${sideNames.A}が戦闘不能となった`;
  }
  if (!finished && state.sides.B.integrity <= 0) {
    finished = true;
    winner = "A";
    endingReason = `${sideNames.B}が戦闘不能となった`;
  }

  const ledger: TurnLedger = {
    initiative: first,
    initiativeReason: adjudication.initiative.reason,
    events: ledgerEvents,
    damageTo,
    integrityBefore,
    integrityAfter,
    staminaBefore,
    staminaAfter: { A: state.sides.A.stamina, B: state.sides.B.stamina },
    finished,
    winner,
    endingReason,
    adjustments: [...adjustments, ...regenNotes, ...tickNotes],
    fairnessFlags,
  };

  return { state, ledger };
}
