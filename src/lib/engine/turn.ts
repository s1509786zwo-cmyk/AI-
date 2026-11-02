import type { AiClient } from "@/lib/ai/client";
import {
  actionMessages,
  adjudicationMessages,
  auditMessages,
  closingMessages,
  narrationMessages,
  type NarrationFacts,
} from "@/lib/ai/prompts";
import { applyTurn } from "./apply";
import { checkAdjudication, sanitizePlan } from "./validate";
import {
  actionPlanSchema,
  adjudicationSchema,
  auditSchema,
  closingSchema,
  narrationSchema,
  normalizeAction,
  normalizeAdjudication,
} from "./schema";
import type {
  ActionPlan,
  Battle,
  BattleClosing,
  LedgerEvent,
  ModelCallTrace,
  NarrationAudit,
  Side,
  TurnAdjudication,
  TurnLedger,
  TurnRecord,
} from "./types";
import { ACTION_LABEL } from "./types";

export type TurnPhaseName =
  | "actions"
  | "adjudication"
  | "apply"
  | "narration"
  | "audit"
  | "closing"
  | "complete";

export interface TurnPhase {
  phase: TurnPhaseName;
  message: string;
  side?: Side;
}

export interface ResolveTurnOptions {
  battle: Battle;
  ai: AiClient;
  onPhase?: (phase: TurnPhase) => void;
}

export class TurnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TurnError";
  }
}

const other = (side: Side): Side => (side === "A" ? "B" : "A");

export async function resolveTurn({ battle, ai, onPhase }: ResolveTurnOptions): Promise<{ battle: Battle; turn: TurnRecord }> {
  if (battle.status !== "active") throw new TurnError("この対戦はすでに終了しています。");
  if (battle.turns.length >= 40) throw new TurnError("対戦記録が上限に達しました。");

  const trace: ModelCallTrace[] = [];
  const phase = (name: TurnPhaseName, message: string, side?: Side) => onPhase?.({ phase: name, message, side });
  const sideNames: Record<Side, string> = { A: battle.fighters.A.name, B: battle.fighters.B.name };
  const analyses = { A: battle.fighters.A.analysis, B: battle.fighters.B.analysis };
  const round = battle.state.round;

  /* ───── 1. 行動選択（双方独立・並列） ───── */
  phase("actions", "両者が次の一手を選択中…");
  const planAdjustments: string[] = [];

  const choose = async (side: Side): Promise<ActionPlan> => {
    const opponent = other(side);
    const messages = actionMessages({
      side,
      self: battle.fighters[side],
      selfState: battle.state.sides[side],
      opponentName: sideNames[opponent],
      opponentAnalysis: analyses[opponent],
      state: battle.state,
      turns: battle.turns,
      arenaName: battle.arena.name,
    });
    const label = `行動選択 ${side}`;
    const started = Date.now();
    try {
      let result = await ai.json({
        system: messages.system,
        user: messages.user,
        schema: actionPlanSchema,
        label,
        tier: "fast",
        maxTokens: 1400,
      });
      trace.push({ label, model: result.model, ms: Date.now() - started, ok: true });
      let plan = normalizeAction(result.data, side);
      let check = sanitizePlan({ plan, side, analysis: analyses[side], state: battle.state });

      if (check.issues.length) {
        const revision = `${messages.user}\n\n【前回の提案の問題】\n${check.issues
          .map((issue) => `- ${issue}`)
          .join("\n")}\n前回の提案（${plan.action}${plan.abilityId ? `: ${plan.abilityId}` : ""}）は現在の状態では実行できません。制限・スタミナ・封印・使用回数を守り、実行可能な行動を1つ選び直してください。`;
        const startedRetry = Date.now();
        result = await ai.json({
          system: messages.system,
          user: revision,
          schema: actionPlanSchema,
          label: `${label}（再考）`,
          tier: "fast",
          maxTokens: 1400,
        });
        trace.push({ label: `${label}（再考）`, model: result.model, ms: Date.now() - startedRetry, ok: true });
        plan = normalizeAction(result.data, side);
        check = sanitizePlan({ plan, side, analysis: analyses[side], state: battle.state });
        if (check.issues.length) {
          planAdjustments.push(`AIの行動提案を補正: ${check.issues.join(" / ")}`);
        }
      }
      return check.plan;
    } catch (error) {
      trace.push({
        label,
        model: ai.fastModel,
        ms: Date.now() - started,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new TurnError(
        `${sideNames[side]}の行動選択に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const [planA, planB] = await Promise.all([choose("A"), choose("B")]);
  const plans: Record<Side, ActionPlan> = { A: planA, B: planB };
  phase("actions", `A: ${ACTION_LABEL[planA.action]} / B: ${ACTION_LABEL[planB.action]}`, undefined);

  /* ───── 2. 裁定（意味レベルの自己修正つき） ───── */
  phase("adjudication", "審判が両者の行動を裁定中…");
  const adjudicationPrompt = adjudicationMessages({
    sideNames,
    analyses,
    plans,
    state: battle.state,
    turns: battle.turns,
    arenaName: battle.arena.name,
    arenaDescription: battle.arena.description,
  });

  let adjudication: TurnAdjudication | null = null;
  let semanticRepairs = 0;
  let check = null as ReturnType<typeof checkAdjudication> | null;
  let adjMs = 0;
  let adjModel = ai.judgeModel;
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const user =
        attempt === 0 || !adjudication
          ? adjudicationPrompt.user
          : `${adjudicationPrompt.user}\n\n【前回の裁定の問題（必ず修正すること）】\n${check?.errors
              .map((error) => `- ${error}`)
              .join("\n")}\n前回の裁定JSON:\n${JSON.stringify(adjudication)}\n上記の問題を解消し、指定スキーマに従った修正版の裁定だけを出力してください。`;
      const started = Date.now();
      const result = await ai.json({
        system: adjudicationPrompt.system,
        user,
        schema: adjudicationSchema,
        label: attempt === 0 ? "裁定" : `裁定（修正${attempt}）`,
        tier: "judge",
        maxTokens: 5000,
      });
      adjMs += Date.now() - started;
      adjModel = result.model;
      adjudication = normalizeAdjudication(result.data);
      check = checkAdjudication({ adjudication, analyses, plans, state: battle.state });
      if (check.ok) break;
      semanticRepairs += 1;
    }
  } catch (error) {
    trace.push({
      label: "裁定",
      model: adjModel,
      ms: adjMs,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TurnError(
      `審判の裁定に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!adjudication || !check) throw new TurnError("審判の裁定を取得できませんでした。");
  trace.push({ label: "裁定", model: adjModel, ms: adjMs, ok: true });
  if (!check.ok) {
    throw new TurnError(
      `審判の裁定に一貫性の問題が残りました: ${check.errors.slice(0, 3).join(" / ")}`,
    );
  }
  phase("adjudication", `裁定確定（修正${semanticRepairs}回）`);

  /* ───── 3. 状態への適用（決定論） ───── */
  phase("apply", "審判の裁定を戦闘状態に反映中…");
  const applied = applyTurn({
    state: battle.state,
    analyses,
    plans,
    adjudication: check.adjudication,
    sideNames,
  });
  const ledger: TurnLedger = applied.ledger;
  ledger.adjustments = [
    ...planAdjustments,
    ...check.adjustments,
    ...ledger.adjustments,
  ];
  const nextState = applied.state;

  /* ───── 4. 描写生成（確定事実のみ） ───── */
  phase("narration", "確定した戦況から描写を生成中…");
  const facts = buildNarrationFacts({
    round,
    sideNames,
    adjudication: check.adjudication,
    ledger,
    battle,
    nextState,
  });
  const narrationPrompt = narrationMessages(facts);
  let narration = "";
  let highlight = "";
  let quotes: { side: Side; line: string }[] = [];
  let narrMs = 0;
  let narrModel = ai.model;
  try {
    const started = Date.now();
    const result = await ai.json({
      system: narrationPrompt.system,
      user: narrationPrompt.user,
      schema: narrationSchema,
      label: "描写",
      tier: "narration",
      maxTokens: 2200,
    });
    narrMs += Date.now() - started;
    narrModel = result.model;
    narration = result.data.narration;
    highlight = result.data.highlight;
    quotes = result.data.quotes;
    trace.push({ label: "描写", model: result.model, ms: Date.now() - started, ok: true });
  } catch (error) {
    trace.push({
      label: "描写",
      model: narrModel,
      ms: narrMs,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TurnError(
      `戦闘描写の生成に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  /* ───── 5. 整合性監査と判決理由（並列） ───── */
  const abilityNames = [...analyses.A.abilities, ...analyses.B.abilities].map((ability) => ability.name);
  const auditTask = (async (): Promise<NarrationAudit> => {
    if (!ai.audit) {
      return { consistent: true, issues: [], repaired: false };
    }
    phase("audit", "描写と裁定の整合性を監査中…");
    const started = Date.now();
    try {
      const result = await ai.json({
        system: auditMessages({ narration, facts, abilityNames }).system,
        user: auditMessages({ narration, facts, abilityNames }).user,
        schema: auditSchema,
        label: "整合性監査",
        tier: "judge",
        maxTokens: 2400,
      });
      trace.push({ label: "整合性監査", model: result.model, ms: Date.now() - started, ok: true });
      const audit = result.data;
      if (audit.consistent) return { consistent: true, issues: [], repaired: false };
      if (audit.correctedNarration) {
        narration = audit.correctedNarration;
        quotes = [];
        return { consistent: true, issues: audit.issues, repaired: true };
      }
      // 修正文が無い場合は、指摘を制約として描写を一度だけ再生成する
      const regenStarted = Date.now();
      const regen = await ai.json({
        system: narrationPrompt.system,
        user: `${narrationPrompt.user}\n\n【前回の描写の問題（必ず修正すること）】\n${audit.issues
          .map((issue) => `- ${issue}`)
          .join("\n")}\n前回の描写:\n${narration}\n事実に反する箇所を修正し、同じスキーマで描写を再生成してください。`,
        schema: narrationSchema,
        label: "描写（修正）",
        tier: "narration",
        maxTokens: 2200,
      });
      trace.push({
        label: "描写（修正）",
        model: regen.model,
        ms: Date.now() - regenStarted,
        ok: true,
      });
      narration = regen.data.narration;
      highlight = regen.data.highlight;
      quotes = regen.data.quotes.filter((quote) => quote.side === "A" || quote.side === "B");
      return { consistent: true, issues: audit.issues, repaired: true };
    } catch (error) {
      trace.push({
        label: "整合性監査",
        model: ai.judgeModel,
        ms: Date.now() - started,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        consistent: false,
        issues: [`整合性監査を実行できませんでした: ${error instanceof Error ? error.message : String(error)}`],
        repaired: false,
      };
    }
  })();

  // 判決理由は「このラウンドを含む」全記録で書かせる（最終ラウンドの欠落を防ぐ）
  const closingTurn: TurnRecord = {
    index: battle.turns.length + 1,
    plans,
    adjudication: check.adjudication,
    ledger,
    narration,
    highlight,
    quotes,
    audit: { consistent: true, issues: [], repaired: false },
    stateAfter: {
      sides: structuredClone(nextState.sides),
      field: structuredClone(nextState.field),
      persistentFacts: [...nextState.persistentFacts],
    },
    createdAt: new Date().toISOString(),
    trace: [],
  };

  const closingTask = (async (): Promise<BattleClosing | null> => {
    if (!ledger.finished) return null;
    phase("closing", "首席審判が判決理由を執筆中…");
    const started = Date.now();
    try {
      const prompt = closingMessages({
        sideNames,
        winner: ledger.winner ?? "draw",
        reason: ledger.endingReason ?? "",
        method: endingMethod(ledger),
        analyses,
        turns: [...battle.turns, closingTurn],
        state: nextState,
      });
      const result = await ai.json({
        system: prompt.system,
        user: prompt.user,
        schema: closingSchema,
        label: "判決理由",
        tier: "judge",
        maxTokens: 2200,
      });
      trace.push({ label: "判決理由", model: result.model, ms: Date.now() - started, ok: true });
      return result.data;
    } catch (error) {
      trace.push({
        label: "判決理由",
        model: ai.judgeModel,
        ms: Date.now() - started,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  })();

  const [audit, closing] = await Promise.all([auditTask, closingTask]);

  // 監査で置き換えられた描写に合わせて引用を検証
  quotes = quotes.filter((quote) => quote.side === "A" || quote.side === "B").slice(0, 2);
  if (!highlight.trim()) {
    highlight = ledger.finished ? "決着" : `第${round}ラウンド`;
  }

  const turnIndex = battle.turns.length + 1;
  const turn: TurnRecord = {
    index: turnIndex,
    plans,
    adjudication: check.adjudication,
    ledger,
    narration,
    highlight,
    quotes,
    audit,
    stateAfter: {
      sides: structuredClone(nextState.sides),
      field: structuredClone(nextState.field),
      persistentFacts: [...nextState.persistentFacts],
    },
    createdAt: new Date().toISOString(),
    trace,
  };

  const now = new Date().toISOString();
  const updated: Battle = {
    ...battle,
    state: nextState,
    turns: [...battle.turns, turn],
    status: ledger.finished ? "finished" : "active",
    outcome: ledger.finished
      ? {
          winner: ledger.winner ?? "draw",
          method: endingMethod(ledger),
          reason: ledger.endingReason ?? "状態変化により決着",
          round: turnIndex,
        }
      : null,
    closing: closing ?? battle.closing,
    updatedAt: now,
    error: null,
  };

  phase("complete", ledger.finished ? "決着" : `第${round}ラウンド終了`);
  return { battle: updated, turn };
}

function endingMethod(ledger: TurnLedger): string {
  if (!ledger.finished) return "";
  if (ledger.winner === "draw") return "相打ち・同時決着";
  if (ledger.endingReason?.includes("規定ラウンド")) return "規定ラウンド判定";
  if (ledger.events.some((event) => event.effects.some((effect) => effect.lethal))) return "決定的効果";
  return "戦闘不能";
}

function summarizeEffects(event: LedgerEvent): { label: string; description: string; damage: number; severity: number }[] {
  return event.effects
    .filter((effect) => !(effect.kind === "damage" && effect.damage <= 0))
    .map((effect) => ({
      label: effect.label,
      description: effect.note,
      damage: effect.damage,
      severity: effect.severity,
    }));
}

export function buildNarrationFacts(params: {
  round: number;
  sideNames: Record<Side, string>;
  adjudication: TurnAdjudication;
  ledger: TurnLedger;
  battle: Battle;
  nextState: Battle["state"];
}): NarrationFacts {
  const { round, sideNames, adjudication, ledger, battle, nextState } = params;
  const initiative =
    ledger.initiative === "simultaneous"
      ? "同時"
      : `${ledger.initiative}（${sideNames[ledger.initiative]}）→${other(ledger.initiative)}`;
  return {
    round,
    sideNames,
    initiative,
    events: ledger.events.map((event) => ({
      side: event.side,
      actionLabel: ACTION_LABEL[event.action],
      abilityName: event.abilityName,
      conditionStatus: event.conditionStatus,
      counterplay: event.counterplay,
      tempo: event.tempo,
      interrupted: event.interrupted,
      success: event.success,
      damageDealt: event.damageDealt,
      damageTaken: event.damageTaken,
      summary: event.summary,
      beats: event.beats,
      effects: summarizeEffects(event),
      adjustments: event.adjustments,
    })),
    integrity: {
      A: nextState.sides.A.integrity,
      B: nextState.sides.B.integrity,
    },
    stamina: {
      A: nextState.sides.A.stamina,
      B: nextState.sides.B.stamina,
    },
    statuses: {
      A: nextState.sides.A.statuses.map((status) => ({
        label: status.label,
        description: status.description,
        remaining: status.remaining,
      })),
      B: nextState.sides.B.statuses.map((status) => ({
        label: status.label,
        description: status.description,
        remaining: status.remaining,
      })),
    },
    down: { A: nextState.sides.A.down, B: nextState.sides.B.down },
    fieldNotes: adjudication.fieldNotes,
    finished: ledger.finished,
    winner: ledger.winner,
    endingReason: ledger.endingReason,
    refereeNote: adjudication.refereeNote,
  };
}
