import test from "node:test";
import assert from "node:assert/strict";
import { resolveTurn, TurnError } from "@/lib/engine/turn";
import { ability, character, effect, judgeEffect, judgeEvent, makeBattle, plan } from "./fixtures";
import { ScriptedAi, scriptedTurn } from "./harness";
import { adjudication } from "./fixtures";

const fire = ability({
  id: "fire",
  name: "火球",
  tempo: "fast",
  effects: [effect("damage", 3)],
});
const guard = ability({
  id: "guard",
  name: "障壁",
  effects: [effect("barrier", 2, { target: "self", duration: "short" })],
});

function battleWithFire() {
  return makeBattle(character("a", "アカリ", [fire]), character("b", "ヒナタ", [guard]));
}

test("1ラウンドを最後まで解決し、状態と記録を返す", async () => {
  const battle = battleWithFire();
  const turn = scriptedTurn({
    actionA: plan("A", "activate", "fire"),
    actionB: plan("B", "defend"),
    events: [
      { side: "A", effects: [judgeEffect("damage", 3)] },
      { side: "B" },
    ],
  });
  const ai = new ScriptedAi([turn]);
  const result = await resolveTurn({ battle, ai });
  assert.equal(battle.turns.length, 0, "入力の対戦記録は変更しない");
  assert.equal(result.battle.turns.length, 1);
  assert.equal(result.battle.turns[0].index, 1);
  assert.ok(Math.abs(result.battle.state.sides.B.integrity - 83.8) < 0.01);
  assert.ok(result.turn.narration.length > 0);
  assert.equal(result.turn.audit.consistent, true);
  assert.ok(result.turn.trace.length >= 4);
  assert.ok(ai.calls.includes("裁定"));
  assert.ok(ai.calls.includes("整合性監査"));
  assert.equal(result.battle.status, "active");
  assert.equal(result.battle.outcome, null);
});

test("裁定の意味エラーは修正呼び出しで解消される", async () => {
  const battle = battleWithFire();
  const actionA = plan("A", "activate", "fire");
  const actionB = plan("B", "defend");
  const broken = adjudication(
    [
      judgeEvent("A", actionA, {
        abilityId: "unknown-ability",
        conditionStatus: "met",
        effects: [judgeEffect("damage", 3)],
      }),
      judgeEvent("B", actionB),
    ],
    { initiative: { first: "A", reason: "先手" } },
  );
  const fixed = adjudication(
    [
      judgeEvent("A", actionA, {
        conditionStatus: "met",
        effects: [judgeEffect("damage", 3)],
      }),
      judgeEvent("B", actionB),
    ],
    { initiative: { first: "A", reason: "先手" } },
  );
  const turn = { ...scriptedTurn({ actionA, actionB }), adjudication: broken, repairedAdjudication: fixed };
  const ai = new ScriptedAi([turn]);
  const result = await resolveTurn({ battle, ai });
  assert.ok(ai.calls.some((label) => label.includes("修正")), "修正呼び出しが行われる");
  assert.equal(result.turn.adjudication.events.find((event) => event.side === "A")?.abilityId, "fire");
  assert.ok(result.turn.ledger.damageTo.B > 0);
});

test("描写監査の指摘により描写が差し替えられる", async () => {
  const battle = battleWithFire();
  const turn = scriptedTurn({
    actionA: plan("A", "activate", "fire"),
    actionB: plan("B", "maneuver"),
    events: [
      { side: "A", effects: [judgeEffect("damage", 3)] },
      { side: "B" },
    ],
    narration: { narration: "火球はヒナタの横をすり抜け、背後の壁を焦がした。ヒナタは無傷のまま、静かに構えを保っている。", highlight: "空振り", quotes: [] },
    audit: {
      consistent: false,
      issues: ["火球は命中しているが、描写では外れている"],
      correctedNarration: "火球がヒナタを捉え、防御の構えごと体勢が崩れた。焦げた空気が戦場に広がり、視界が歪む。",
    },
  });
  const ai = new ScriptedAi([turn]);
  const result = await resolveTurn({ battle, ai });
  assert.equal(result.turn.narration, "火球がヒナタを捉え、防御の構えごと体勢が崩れた。焦げた空気が戦場に広がり、視界が歪む。");
  assert.equal(result.turn.audit.repaired, true);
  assert.equal(result.turn.audit.consistent, true);
  assert.ok(result.turn.audit.issues.length > 0);
});

test("決定的効果で決着し、判決理由が保存される", async () => {
  const death = ability({
    id: "death",
    name: "終止",
    tempo: "instant",
    effects: [effect("damage", 4, { lethal: true })],
    conditions: [{ text: "視線が通る", evidence: "視線" }],
  });
  const battle = makeBattle(character("a", "シメ", [death]), character("b", "ヒナタ", [guard]));
  const actionA = plan("A", "activate", "death");
  const actionB = plan("B", "maneuver");
  const turn = scriptedTurn({
    actionA,
    actionB,
    events: [
      { side: "A", effects: [judgeEffect("damage", 4, { lethal: true })] },
      { side: "B" },
    ],
  });
  const ai = new ScriptedAi([turn]);
  const result = await resolveTurn({ battle, ai });
  assert.equal(result.battle.status, "finished");
  assert.equal(result.battle.outcome?.winner, "A");
  assert.equal(result.battle.outcome?.method, "決定的効果");
  assert.equal(result.battle.closing?.verdict.length! > 0, true);
  assert.equal(result.battle.state.sides.B.down, true);
});

test("不正な行動は再考され、それでも不正なら安全な行動へ補正される", async () => {
  const once = ability({
    id: "once",
    name: "一度だけ",
    usesPerBattle: 1,
    effects: [effect("damage", 2)],
  });
  const battle = makeBattle(character("a", "アカリ", [once]), character("b", "ヒナタ", [guard]));
  battle.state.sides.A.abilityUses = { once: 1 };
  const illegal = plan("A", "activate", "once");
  const turn = scriptedTurn({
    actionA: illegal,
    actionB: plan("B", "defend"),
    events: [{ side: "A", effects: [judgeEffect("damage", 2)] }, { side: "B" }],
  });
  const ai = new ScriptedAi([turn]);
  const result = await resolveTurn({ battle, ai });
  assert.ok(ai.calls.some((label) => label.includes("再考")));
  assert.equal(result.turn.plans.A.action, "maneuver");
  assert.ok(result.turn.ledger.adjustments.some((line) => line.includes("使用回数")));
});

test("描写生成に失敗した場合、ラウンドを保存せずエラーを返す", async () => {
  const battle = battleWithFire();
  const turn = scriptedTurn({
    actionA: plan("A", "activate", "fire"),
    actionB: plan("B", "defend"),
    events: [{ side: "A", effects: [judgeEffect("damage", 3)] }, { side: "B" }],
  });
  const ai = new ScriptedAi([turn]);
  ai.failOnLabel = "描写";
  await assert.rejects(() => resolveTurn({ battle, ai }), TurnError);
  assert.equal(battle.turns.length, 0);
});

test("監査自体が失敗しても、監査未完了として記録しラウンドは成立する", async () => {
  const battle = battleWithFire();
  const turn = scriptedTurn({
    actionA: plan("A", "activate", "fire"),
    actionB: plan("B", "defend"),
    events: [{ side: "A", effects: [judgeEffect("damage", 3)] }, { side: "B" }],
  });
  const ai = new ScriptedAi([turn]);
  ai.failOnLabel = "整合性監査";
  const result = await resolveTurn({ battle, ai });
  assert.equal(result.battle.turns.length, 1);
  assert.equal(result.turn.audit.consistent, false);
  assert.match(result.turn.audit.issues[0] ?? "", /監査/);
});
