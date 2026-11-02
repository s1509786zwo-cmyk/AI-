import type { AiClient, JsonCallOptions, JsonCallResult } from "@/lib/ai/client";
import type { ActionPlan, Battle, JudgeEffect, Side, TurnAdjudication } from "@/lib/engine/types";
import { resolveTurn } from "@/lib/engine/turn";
import { adjudication as makeAdjudication, DEFAULT_ARENA, judgeEvent } from "./fixtures";

export { DEFAULT_ARENA };

export interface ScriptedTurn {
  actionA: ActionPlan;
  actionB: ActionPlan;
  adjudication: TurnAdjudication;
  repairedAdjudication?: TurnAdjudication;
  revisionA?: ActionPlan;
  revisionB?: ActionPlan;
  narration?: { narration: string; highlight: string; quotes: { side: Side; line: string }[] };
  audit?: { consistent: boolean; issues: string[]; correctedNarration: string | null };
}

/** 指定された台本どおりに応答するAI。スキーマ検証は実クライアントと同じ経路で行う。 */
export class ScriptedAi implements AiClient {
  model = "fake-model";
  fastModel = "fake-model";
  judgeModel = "fake-model";
  audit = true;
  provider = "scripted";
  turn = 0;
  calls: string[] = [];
  failOnLabel: string | null = null;

  constructor(
    public script: ScriptedTurn[],
    public onCall?: (label: string, turn: number) => void,
  ) {}

  async json<T>(options: JsonCallOptions<T>): Promise<JsonCallResult<T>> {
    this.calls.push(options.label);
    this.onCall?.(options.label, this.turn);
    if (this.failOnLabel && options.label.includes(this.failOnLabel)) {
      throw new Error(`scripted failure: ${options.label}`);
    }
    const turn = this.script[Math.min(this.turn, this.script.length - 1)];
    let payload: unknown;
    if (options.label.startsWith("行動選択 A")) {
      payload = toRawPlan(options.label.includes("再考") && turn.revisionA ? turn.revisionA : turn.actionA);
    } else if (options.label.startsWith("行動選択 B")) {
      payload = toRawPlan(options.label.includes("再考") && turn.revisionB ? turn.revisionB : turn.actionB);
    } else if (options.label.startsWith("裁定")) {
      payload =
        options.label.includes("修正") && turn.repairedAdjudication
          ? turn.repairedAdjudication
          : turn.adjudication;
    } else if (options.label.startsWith("描写")) {
      payload = turn.narration ?? {
        narration: `第${this.turn + 1}ラウンド、両者が間合いを測りながら動いた。\n\n攻撃が交差し、戦況はわずかに傾いた。互いに次の一手を探っている。`,
        highlight: "交戦",
        quotes: [],
      };
    } else if (options.label.startsWith("整合性監査")) {
      payload = turn.audit ?? { consistent: true, issues: [], correctedNarration: null };
    } else if (options.label.startsWith("判決理由")) {
      payload = {
        verdict: "テスト用の判決理由。能力の条件と対抗手段、そして双方の消耗が最終的な勝敗を分けた。審判は両者に同じ基準を適用した。",
        keyMoments: ["条件を満たした一撃"],
        lesson: "条件と対抗手段の噛み合わせが結果を決める。",
      };
    } else {
      throw new Error(`unexpected label: ${options.label}`);
    }
    const data = options.schema.parse(payload);
    return { data, raw: JSON.stringify(payload), model: this.model, ms: 1, repairs: 0 };
  }
}

export function toRawPlan(action: ActionPlan) {
  return {
    action: action.action,
    abilityId: action.abilityId,
    intent: action.intent,
    declaration: action.declaration,
    reasoning: action.reasoning,
    target: action.target,
  };
}

export interface ScriptedEventSpec {
  side: Side;
  conditionStatus?: "met" | "partial" | "unmet" | "na";
  counterplay?: "none" | "partial" | "strong";
  tempo?: "advantage" | "neutral" | "disadvantage";
  success?: boolean;
  effects?: JudgeEffect[];
  summary?: string;
}

/** 1ラウンド分の台本を組み立てる */
export function scriptedTurn(params: {
  actionA: ActionPlan;
  actionB: ActionPlan;
  events?: ScriptedEventSpec[];
  initiative?: Side | "simultaneous";
  finished?: boolean;
  winner?: Side | "draw" | null;
  endingReason?: string | null;
  narration?: ScriptedTurn["narration"];
  audit?: ScriptedTurn["audit"];
}): ScriptedTurn {
  const events = (params.events ?? []).map((spec) => {
    const planValue = spec.side === "A" ? params.actionA : params.actionB;
    return judgeEvent(spec.side, planValue, {
      conditionStatus: spec.conditionStatus ?? (planValue.abilityId ? "met" : "na"),
      counterplay: spec.counterplay ?? "none",
      tempo: spec.tempo ?? "neutral",
      success: spec.success ?? true,
      effects: spec.effects ?? [],
      summary: spec.summary ?? `${spec.side}の行動が成立`,
    });
  });
  return {
    actionA: params.actionA,
    actionB: params.actionB,
    adjudication: makeAdjudication(events, {
      initiative: { first: params.initiative ?? "A", reason: "テスト裁定" },
      finished: params.finished ?? false,
      winner: params.winner ?? null,
      endingReason: params.endingReason ?? null,
    }),
    narration: params.narration,
    audit: params.audit,
  };
}

export async function runScriptedBattle(battle: Battle, ai: ScriptedAi, maxTurns = 8): Promise<Battle> {
  let current = battle;
  for (let i = 0; i < maxTurns && current.status === "active"; i += 1) {
    ai.turn = i;
    const result = await resolveTurn({ battle: current, ai });
    current = result.battle;
  }
  return current;
}
