import test from "node:test";
import assert from "node:assert/strict";
import { applyTurn } from "@/lib/engine/apply";
import { checkAdjudication, sanitizePlan } from "@/lib/engine/validate";
import { createInitialState } from "@/lib/engine/battle";
import type { AbilitySpec, ActionPlan, BattleState, CharacterAnalysis, TurnAdjudication } from "@/lib/engine/types";
import {
  ability,
  adjudication,
  analysis,
  DEFAULT_ARENA,
  effect,
  judgeEffect,
  judgeEvent,
  plan,
} from "./fixtures";

function setup(params: {
  abilityA: AbilitySpec;
  abilityB?: AbilitySpec;
  state?: BattleState;
  planA?: ActionPlan;
  planB?: ActionPlan;
  adjudication: TurnAdjudication;
}) {
  const analysisA = analysis("A", [params.abilityA]);
  const analysisB = analysis("B", [params.abilityB ?? ability({ id: "b-basic", name: "Bの基本" })]);
  const initialState = params.state ?? createInitialState(DEFAULT_ARENA);
  const plans = {
    A: params.planA ?? plan("A", "activate", params.abilityA.id),
    B: params.planB ?? plan("B", "maneuver"),
  };
  const result = applyTurn({
    state: initialState,
    analyses: { A: analysisA, B: analysisB },
    plans,
    adjudication: params.adjudication,
    sideNames: { A: "A", B: "B" },
  });
  return { ...result, analysisA, analysisB, plans };
}

const fire: AbilitySpec = ability({
  id: "fire",
  name: "炎",
  effects: [effect("damage", 3)],
  tempo: "fast",
});

const instantKill: AbilitySpec = ability({
  id: "gaze",
  name: "死の視線",
  effects: [effect("damage", 4, { lethal: true })],
  tempo: "instant",
  conditions: [{ text: "相手の目を見る", evidence: "視線が通る" }],
});

test("条件未達の発動は損耗を発生させない", () => {
  const adj = adjudication([
    judgeEvent("A", plan("A", "activate", "fire"), {
      conditionStatus: "unmet",
      success: false,
      effects: [judgeEffect("damage", 3)],
      summary: "炎は発動しなかった",
    }),
    judgeEvent("B", plan("B", "maneuver")),
  ]);
  const { state, ledger } = setup({ abilityA: fire, adjudication: adj });
  assert.equal(state.sides.B.integrity, 100);
  assert.equal(ledger.damageTo.B, 0);
  assert.equal(ledger.events.find((event) => event.side === "A")?.success, false);
});

test("強い対抗手段は損耗を大幅に減らす", () => {
  const makeAdj = (counterplay: "none" | "strong") =>
    adjudication([
      judgeEvent("A", plan("A", "activate", "fire"), {
        conditionStatus: "met",
        counterplay,
        effects: [judgeEffect("damage", 3)],
      }),
      judgeEvent("B", plan("B", "maneuver")),
    ]);

  const none = setup({ abilityA: fire, adjudication: makeAdj("none") });
  assert.equal(Math.round(none.ledger.damageTo.B), 27);

  const strong = setup({ abilityA: fire, adjudication: makeAdj("strong") });
  assert.ok(strong.ledger.damageTo.B < 6, `expected < 6, got ${strong.ledger.damageTo.B}`);
});

test("防御・回避の構えは同時に成立する", () => {
  const adj = adjudication([
    judgeEvent("A", plan("A", "activate", "fire"), {
      conditionStatus: "met",
      effects: [judgeEffect("damage", 3)],
    }),
    judgeEvent("B", plan("B", "defend")),
  ]);
  const { ledger } = setup({ abilityA: fire, planB: plan("B", "defend"), adjudication: adj });
  // 27 * 0.6 = 16.2
  assert.ok(Math.abs(ledger.damageTo.B - 16.2) < 0.01, `got ${ledger.damageTo.B}`);
});

test("決定的効果は条件充足・対抗なし・防御なしでのみ成立する", () => {
  const base = adjudication([
    judgeEvent("A", plan("A", "activate", "gaze"), {
      conditionStatus: "met",
      counterplay: "none",
      effects: [judgeEffect("damage", 4, { lethal: true })],
    }),
    judgeEvent("B", plan("B", "maneuver")),
  ]);
  const lethal = setup({ abilityA: instantKill, adjudication: base });
  assert.equal(lethal.state.sides.B.down, true);
  assert.equal(lethal.ledger.finished, true);
  assert.equal(lethal.ledger.winner, "A");

  const partial = adjudication([
    judgeEvent("A", plan("A", "activate", "gaze"), {
      conditionStatus: "met",
      counterplay: "partial",
      effects: [judgeEffect("damage", 4, { lethal: true })],
    }),
    judgeEvent("B", plan("B", "maneuver")),
  ]);
  const survived = setup({ abilityA: instantKill, adjudication: partial });
  assert.equal(survived.state.sides.B.down, false);
  assert.equal(survived.ledger.finished, false);

  const defended = adjudication([
    judgeEvent("A", plan("A", "activate", "gaze"), {
      conditionStatus: "met",
      counterplay: "none",
      effects: [judgeEffect("damage", 4, { lethal: true })],
    }),
    judgeEvent("B", plan("B", "defend")),
  ]);
  const blocked = setup({ abilityA: instantKill, planB: plan("B", "defend"), adjudication: defended });
  assert.equal(blocked.state.sides.B.down, false);
});

test("防壁は損耗を吸収し、決定的効果を阻害する", () => {
  const state = createInitialState(DEFAULT_ARENA);
  state.sides.B.statuses.push({
    id: "barrier-1",
    label: "障壁",
    kind: "barrier",
    source: "B",
    severity: 2,
    description: "防壁",
    remaining: 2,
    absorb: 36,
    tags: ["barrier"],
  });
  const adj = adjudication([
    judgeEvent("A", plan("A", "activate", "gaze"), {
      conditionStatus: "met",
      counterplay: "none",
      effects: [judgeEffect("damage", 4, { lethal: true })],
    }),
    judgeEvent("B", plan("B", "maneuver")),
  ]);
  const { state: after, ledger } = setup({ abilityA: instantKill, state, adjudication: adj });
  assert.equal(after.sides.B.down, false);
  assert.ok(ledger.damageTo.B <= 4.01);
});

test("スタミナ不足の発動は不成立になる", () => {
  const state = createInitialState(DEFAULT_ARENA);
  state.sides.A.stamina = 10;
  const adj = adjudication([
    judgeEvent("A", plan("A", "activate", "fire"), {
      conditionStatus: "met",
      effects: [judgeEffect("damage", 3)],
    }),
    judgeEvent("B", plan("B", "maneuver")),
  ]);
  const { state: after, ledger } = setup({ abilityA: fire, state, adjudication: adj });
  assert.equal(after.sides.B.integrity, 100);
  assert.match(ledger.events.find((event) => event.side === "A")?.adjustments.join(" ") ?? "", /スタミナ不足/);
});

test("封印された能力は発動できない", () => {
  const state = createInitialState(DEFAULT_ARENA);
  state.sides.A.statuses.push({
    id: "seal-1",
    label: "能力封じ",
    kind: "seal",
    source: "B",
    severity: 3,
    description: "能力を封じる",
    remaining: 2,
    targetAbilityId: "fire",
    tags: ["disable"],
  });
  const adj = adjudication([
    judgeEvent("A", plan("A", "activate", "fire"), {
      conditionStatus: "met",
      effects: [judgeEffect("damage", 3)],
    }),
    judgeEvent("B", plan("B", "maneuver")),
  ]);
  const { state: after } = setup({ abilityA: fire, state, adjudication: adj });
  assert.equal(after.sides.B.integrity, 100);
});

test("無効化状態は相手の行動を1回打ち消す", () => {
  const state = createInitialState(DEFAULT_ARENA);
  state.sides.B.statuses.push({
    id: "nullify-1",
    label: "無効化",
    kind: "other",
    source: "B",
    severity: 3,
    description: "次の効果を無効化",
    remaining: 1,
    tags: ["nullify"],
  });
  const adj = adjudication([
    judgeEvent("A", plan("A", "activate", "fire"), {
      conditionStatus: "met",
      effects: [judgeEffect("damage", 3)],
    }),
    judgeEvent("B", plan("B", "maneuver")),
  ]);
  const { state: after } = setup({ abilityA: fire, state, adjudication: adj });
  assert.equal(after.sides.B.integrity, 100);
  assert.equal(after.sides.B.statuses.some((status) => (status.tags ?? []).includes("nullify")), false);
});

test("状態異常の残りターンはラウンド終了ごとに減少する", () => {
  const state = createInitialState(DEFAULT_ARENA);
  state.sides.B.statuses.push({
    id: "stun-1",
    label: "硬直",
    kind: "stun",
    source: "A",
    severity: 2,
    description: "硬直",
    remaining: 2,
    tags: ["mental"],
  });
  const adj = adjudication([judgeEvent("A", plan("A", "maneuver")), judgeEvent("B", plan("B", "maneuver"))]);
  const first = setup({
    abilityA: fire,
    state,
    planA: plan("A", "maneuver"),
    planB: plan("B", "maneuver"),
    adjudication: adj,
  });
  assert.equal(first.state.sides.B.statuses.find((status) => status.id === "stun-1")?.remaining, 1);
  const second = setup({
    abilityA: fire,
    state: first.state,
    planA: plan("A", "maneuver"),
    planB: plan("B", "maneuver"),
    adjudication: adj,
  });
  assert.equal(second.state.sides.B.statuses.some((status) => status.id === "stun-1"), false);
});

test("規定ラウンド到達時は残存戦力で決着する", () => {
  const state = createInitialState(DEFAULT_ARENA);
  state.turnsResolved = 19;
  state.sides.A.integrity = 72;
  state.sides.B.integrity = 41;
  const adj = adjudication([judgeEvent("A", plan("A", "maneuver")), judgeEvent("B", plan("B", "maneuver"))]);
  const { state: after, ledger } = setup({
    abilityA: fire,
    state,
    planA: plan("A", "maneuver"),
    planB: plan("B", "maneuver"),
    adjudication: adj,
  });
  assert.equal(after.turnsResolved, 20);
  assert.equal(ledger.finished, true);
  assert.equal(ledger.winner, "A");
  assert.match(ledger.endingReason ?? "", /規定ラウンド/);
});

test("審判の先手判定が速度と大きく矛盾する場合は補正される", () => {
  const slow = ability({ id: "slow", name: "遅い一撃", tempo: "slow", effects: [effect("damage", 1)] });
  const adj = adjudication(
    [
      judgeEvent("A", plan("A", "activate", "gaze")),
      judgeEvent("B", plan("B", "activate", "slow")),
    ],
    { initiative: { first: "B", reason: "審判の判断" } },
  );
  const { ledger } = setup({
    abilityA: instantKill,
    abilityB: slow,
    planB: plan("B", "activate", "slow"),
    adjudication: adj,
  });
  assert.equal(ledger.initiative, "A");
  assert.ok(ledger.adjustments.some((line) => line.includes("先手")));
});

test("審判の裁定は能力にない効果を拒否する", () => {
  const onlyBind = ability({
    id: "bind-only",
    name: "縛り",
    effects: [effect("bind", 2)],
  });
  const adj = adjudication([
    judgeEvent("A", plan("A", "activate", "bind-only"), {
      conditionStatus: "met",
      effects: [judgeEffect("damage", 3)],
    }),
    judgeEvent("B", plan("B", "maneuver")),
  ]);
  const check = checkAdjudication({
    adjudication: adj,
    analyses: { A: analysis("A", [onlyBind]), B: analysis("B", [fire]) },
    plans: { A: plan("A", "activate", "bind-only"), B: plan("B", "maneuver") },
    state: createInitialState(DEFAULT_ARENA),
  });
  assert.equal(check.ok, false);
  assert.ok(check.errors.some((error) => error.includes("存在しない効果")));
});

test("深刻度は解析上限に補正される", () => {
  const weak = ability({ id: "weak", name: "弱い炎", effects: [effect("damage", 1)] });
  const adj = adjudication([
    judgeEvent("A", plan("A", "activate", "weak"), {
      conditionStatus: "met",
      effects: [judgeEffect("damage", 4, { label: "大火" })],
    }),
    judgeEvent("B", plan("B", "maneuver")),
  ]);
  const check = checkAdjudication({
    adjudication: adj,
    analyses: { A: analysis("A", [weak]), B: analysis("B", [fire]) },
    plans: { A: plan("A", "activate", "weak"), B: plan("B", "maneuver") },
    state: createInitialState(DEFAULT_ARENA),
  });
  assert.equal(check.ok, true);
  assert.equal(check.adjudication.events[0].effects[0].severity, 1);
});

test("行動計画の合法性が検査される", () => {
  const state = createInitialState(DEFAULT_ARENA);
  const limited = ability({
    id: "limited",
    name: "一度きり",
    usesPerBattle: 1,
    effects: [effect("damage", 2)],
  });
  state.sides.A.abilityUses = { limited: 1 };
  const checked = sanitizePlan({
    plan: plan("A", "activate", "limited"),
    side: "A",
    analysis: analysis("A", [limited]),
    state,
  });
  assert.equal(checked.plan.action, "maneuver");
  assert.ok(checked.issues.length > 0);

  const cooled = ability({
    id: "cool",
    name: "クールダウン",
    cooldownRounds: 3,
    effects: [effect("damage", 2)],
  });
  state.sides.A.cooldowns = { cool: 5 };
  const coolCheck = sanitizePlan({
    plan: plan("A", "activate", "cool"),
    side: "A",
    analysis: analysis("A", [cooled]),
    state,
  });
  assert.equal(coolCheck.plan.action, "defend");
});

test("不正な能力IDの裁定は再生成を要求する", () => {
  const adj = adjudication([
    judgeEvent("A", plan("A", "activate", "fire"), {
      abilityId: "unknown",
      conditionStatus: "met",
      effects: [judgeEffect("damage", 2)],
    }),
    judgeEvent("B", plan("B", "maneuver")),
  ]);
  const check = checkAdjudication({
    adjudication: adj,
    analyses: { A: analysis("A", [fire]), B: analysis("B", [fire]) },
    plans: { A: plan("A", "activate", "fire"), B: plan("B", "maneuver") },
    state: createInitialState(DEFAULT_ARENA),
  });
  assert.equal(check.ok, false);
});

test("朦朧状態では能力発動がブロックされる", () => {
  const state = createInitialState(DEFAULT_ARENA);
  state.sides.B.statuses.push({
    id: "daze-1",
    label: "時間停止の余波",
    kind: "stun",
    source: "A",
    severity: 3,
    description: "時間の流れから切り離されている",
    remaining: 2,
    tags: ["mental"],
  });
  const adj = adjudication([
    judgeEvent("A", plan("A", "maneuver")),
    judgeEvent("B", plan("B", "activate", "b-basic"), {
      conditionStatus: "met",
      effects: [judgeEffect("damage", 3)],
      summary: "Bの能力が発動した",
    }),
  ]);
  const { state: after, ledger } = setup({
    abilityA: fire,
    state,
    planA: plan("A", "maneuver"),
    planB: plan("B", "activate", "b-basic"),
    adjudication: adj,
  });
  assert.equal(after.sides.A.integrity, 100);
  assert.equal(ledger.events.find((event) => event.side === "B")?.success, false);
});

test("同ラウンドで付与された朦朧は後手の行動を止める", () => {
  const timeStop = ability({
    id: "stop",
    name: "時間停止",
    tempo: "instant",
    effects: [effect("mental", 3, { duration: "short" })],
  });
  const adj = adjudication([
    judgeEvent("A", plan("A", "activate", "stop"), {
      conditionStatus: "met",
      effects: [judgeEffect("mental", 3, { duration: "short" })],
    }),
    judgeEvent("B", plan("B", "activate", "b-basic"), {
      conditionStatus: "met",
      effects: [judgeEffect("damage", 3)],
    }),
  ]);
  const { state: after, ledger } = setup({
    abilityA: timeStop,
    planB: plan("B", "activate", "b-basic"),
    adjudication: adj,
  });
  assert.equal(after.sides.A.integrity, 100, "止められた側の攻撃は成立しない");
  assert.equal(ledger.events.find((event) => event.side === "B")?.success, false);
});

test("発動回数とクールダウンは次ラウンドの行動選択を拘束する", () => {
  const limited = ability({
    id: "limited",
    name: "一撃の秘術",
    effects: [effect("damage", 2)],
    usesPerBattle: 1,
    cooldownRounds: 1,
  });
  const adj = adjudication([
    judgeEvent("A", plan("A", "activate", "limited"), {
      conditionStatus: "met",
      effects: [judgeEffect("damage", 2)],
    }),
    judgeEvent("B", plan("B", "maneuver")),
  ]);
  const first = setup({ abilityA: limited, adjudication: adj });
  assert.equal(first.state.sides.A.abilityUses.limited, 1);
  assert.equal(first.state.sides.A.cooldowns.limited, 3);
  for (let round = 2; round <= 3; round += 1) {
    const check = sanitizePlan({
      side: "A",
      analysis: first.analysisA,
      state: { ...first.state, round },
      plan: plan("A", "activate", "limited"),
    });
    assert.notEqual(check.plan.action, "activate");
    assert.ok(check.issues.some((issue) => issue.includes("使用回数上限")));
  }
  const later = sanitizePlan({
    side: "A",
    analysis: first.analysisA,
    state: { ...first.state, round: 4, sides: { ...first.state.sides, A: { ...first.state.sides.A, abilityUses: {} } } },
    plan: plan("A", "activate", "limited"),
  });
  assert.equal(later.plan.action, "activate");
});

test("クールダウン中は再使用できない", () => {
  const cool = ability({
    id: "cool",
    name: "大技",
    effects: [effect("damage", 3)],
    cooldownRounds: 2,
  });
  const adj = adjudication([
    judgeEvent("A", plan("A", "activate", "cool"), {
      conditionStatus: "met",
      effects: [judgeEffect("damage", 3)],
    }),
    judgeEvent("B", plan("B", "maneuver")),
  ]);
  const first = setup({ abilityA: cool, adjudication: adj });
  assert.equal(first.state.sides.A.cooldowns.cool, 4);
  const during = sanitizePlan({
    side: "A",
    analysis: first.analysisA,
    state: { ...first.state, round: 3 },
    plan: plan("A", "activate", "cool"),
  });
  assert.notEqual(during.plan.action, "activate");
  assert.ok(during.issues.some((issue) => issue.includes("再使用可能ラウンド")));
  const after = sanitizePlan({
    side: "A",
    analysis: first.analysisA,
    state: { ...first.state, round: 4 },
    plan: plan("A", "activate", "cool"),
  });
  assert.equal(after.plan.action, "activate");
});

test("朦朧中の行動提案は解除・立て直しに補正される", () => {
  const state = createInitialState(DEFAULT_ARENA);
  state.sides.A.statuses.push({
    id: "daze-2",
    label: "硬直",
    kind: "stun",
    source: "B",
    severity: 2,
    description: "体が動かない",
    remaining: 2,
    tags: ["mental"],
  });
  const analysisA = analysis("A", [fire]);
  const soft = sanitizePlan({ side: "A", analysis: analysisA, state, plan: plan("A", "activate", "fire") });
  assert.equal(soft.plan.action, "break_free");
  state.sides.A.statuses[0].severity = 4;
  const hard = sanitizePlan({ side: "A", analysis: analysisA, state, plan: plan("A", "strike") });
  assert.equal(hard.plan.action, "recover");
});

test("常時・自動能力は行動として発動できない", () => {
  const passive = ability({
    id: "aura",
    name: "常時展開する障壁",
    mode: "passive",
    effects: [effect("barrier", 2, { target: "self", duration: "battle" })],
  });
  const analysisA = analysis("A", [passive]);
  const state = createInitialState(DEFAULT_ARENA);
  const check = sanitizePlan({ side: "A", analysis: analysisA, state, plan: plan("A", "activate", "aura") });
  assert.equal(check.plan.action, "observe");
  assert.ok(check.issues.length > 0);
});

test("同時進行では相打ちが成立する", () => {
  const lethalA = ability({
    id: "kill-a",
    name: "終止符A",
    tempo: "instant",
    effects: [effect("damage", 4, { lethal: true })],
  });
  const lethalB = ability({
    id: "kill-b",
    name: "終止符B",
    tempo: "instant",
    effects: [effect("damage", 4, { lethal: true })],
  });
  const analysisA = analysis("A", [lethalA]);
  const analysisB = analysis("B", [lethalB]);
  const plans = { A: plan("A", "activate", "kill-a"), B: plan("B", "activate", "kill-b") };
  const adj = adjudication(
    [
      judgeEvent("A", plans.A, {
        conditionStatus: "met",
        counterplay: "none",
        effects: [judgeEffect("damage", 4, { lethal: true })],
      }),
      judgeEvent("B", plans.B, {
        conditionStatus: "met",
        counterplay: "none",
        effects: [judgeEffect("damage", 4, { lethal: true })],
      }),
    ],
    { initiative: { first: "simultaneous", reason: "同時着弾" } },
  );
  const result = applyTurn({
    state: createInitialState(DEFAULT_ARENA),
    analyses: { A: analysisA, B: analysisB },
    plans,
    adjudication: adj,
    sideNames: { A: "A", B: "B" },
  });
  assert.equal(result.state.sides.A.down, true);
  assert.equal(result.state.sides.B.down, true);
  assert.equal(result.ledger.winner, "draw");
});
