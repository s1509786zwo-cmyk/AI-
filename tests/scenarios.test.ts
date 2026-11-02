import test from "node:test";
import assert from "node:assert/strict";
import type { Battle, Character } from "@/lib/engine/types";
import {
  ability,
  character,
  effect,
  judgeEffect,
  makeBattle,
  plan,
} from "./fixtures";
import { runScriptedBattle, ScriptedAi, scriptedTurn, type ScriptedTurn } from "./harness";

function buildBattle(a: Character, b: Character): Battle {
  return makeBattle(a, b);
}

function damage(severity: number) {
  return judgeEffect("damage", severity);
}

function makeActionTurn(params: Parameters<typeof scriptedTurn>[0]): ScriptedTurn {
  return scriptedTurn(params);
}

/** 戦闘記録の不変条件を検証する */
function assertConsistency(battle: Battle) {
  for (const turn of battle.turns) {
    assert.ok(turn.narration.length >= 40, "描写が空でない");
    assert.equal(turn.ledger.integrityAfter.A >= 0, true);
    assert.equal(turn.ledger.integrityAfter.B >= 0, true);
    for (const side of ["A", "B"] as const) {
      assert.ok(turn.ledger.damageTo[side] <= 100, `${side}の1ラウンド損耗が過大でない`);
      for (const event of turn.ledger.events) {
        if (!event.abilityId) continue;
        const abilities = battle.fighters[event.side].analysis.abilities;
        assert.ok(
          abilities.some((ability) => ability.id === event.abilityId),
          "使用能力は解析結果に存在する",
        );
      }
    }
    if (turn.ledger.finished) {
      assert.ok(turn.ledger.winner !== null, "決着には勝者が伴う");
    }
  }
  if (battle.status === "finished" && battle.outcome) {
    if (battle.outcome.winner !== "draw") {
      const loser = battle.outcome.winner === "A" ? "B" : "A";
      const down = battle.state.sides[loser].down;
      const roundCap = battle.outcome.method === "規定ラウンド判定";
      assert.ok(down || roundCap, "勝敗は戦闘不能または規定ラウンド判定に基づく");
    }
    assert.ok(battle.outcome.reason.length > 0);
    assert.ok(battle.closing !== null, "決着には判決理由が付く");
  }
}

test("シナリオ1: 単純な能力同士の対戦", async () => {
  const fire = ability({ id: "fire", name: "火球", tempo: "fast", effects: [effect("damage", 3)] });
  const ice = ability({
    id: "ice",
    name: "氷弾",
    tempo: "normal",
    effects: [effect("damage", 2)],
  });
  const a = character("a", "アカリ", [fire]);
  const b = character("b", "ヒナタ", [ice]);
  const battle = buildBattle(a, b);

  const turns: ScriptedTurn[] = [
    ...Array.from({ length: 4 }, () =>
      makeActionTurn({
        actionA: plan("A", "activate", "fire"),
        actionB: plan("B", "activate", "ice"),
        events: [
          { side: "A", effects: [damage(3)] },
          { side: "B", effects: [damage(2)] },
        ],
      }),
    ),
    makeActionTurn({
      actionA: plan("A", "strike"),
      actionB: plan("B", "activate", "ice"),
      events: [{ side: "A" }, { side: "B", effects: [damage(2)] }],
    }),
  ];
  const ai = new ScriptedAi(turns);
  const finished = await runScriptedBattle(battle, ai, 6);

  assert.equal(finished.status, "finished");
  assert.equal(finished.outcome?.winner, "A");
  assert.equal(finished.state.sides.B.down, true);
  assert.equal(finished.turns.length, 5);
  assert.ok(finished.state.sides.A.integrity > 30);
  assert.equal(finished.turns[0].plans.A.abilityId, "fire");
  assert.ok(finished.turns[0].ledger.damageTo.B > 26);
  assertConsistency(finished);
});

test("シナリオ2: 極端に強い即死能力でも、条件と対抗手段で勝てないことがある", async () => {
  const gaze = ability({
    id: "gaze",
    name: "終焉の視線",
    tempo: "instant",
    effects: [effect("damage", 4, { lethal: true })],
    conditions: [{ text: "相手の目を見て名前を理解している", evidence: "視線と真名" }],
  });
  const mist = ability({
    id: "mist",
    name: "閉ざす霧",
    tempo: "fast",
    effects: [effect("damage", 3), effect("evasion", 2, { target: "self", duration: "battle" })],
    weaknesses: ["視界を奪う霧は自分にも味方を失わせる"],
  });
  const a = character("a", "終眼", [gaze]);
  const b = character("b", "霧生", [mist]);
  const battle = buildBattle(a, b);

  const turns: ScriptedTurn[] = Array.from({ length: 4 }, (_, index) =>
    makeActionTurn({
      actionA: plan("A", "activate", "gaze"),
      actionB: plan("B", "activate", "mist"),
      events: [
        {
          side: "A",
          conditionStatus: index === 0 ? "unmet" : "partial",
          counterplay: "strong",
          effects: [judgeEffect("damage", 4, { lethal: true })],
          summary: "霧に視界を遮られ、終焉の視線は対象を捉えきれない",
        },
        {
          side: "B",
          effects: [damage(3), judgeEffect("evasion", 2, { target: "self", duration: "battle" })],
        },
      ],
    }),
  );
  const ai = new ScriptedAi(turns);
  const finished = await runScriptedBattle(battle, ai, 5);

  assert.equal(finished.outcome?.winner, "B");
  assert.equal(finished.state.sides.A.down, true);
  assert.ok(finished.state.sides.B.integrity > 90);
  const allEffects = finished.turns.flatMap((turn) => turn.ledger.events.flatMap((event) => event.effects));
  assert.equal(allEffects.some((effect) => effect.lethal), false, "決定的効果は成立していない");
  const firstEvent = finished.turns[0].adjudication.events.find((event) => event.side === "A");
  assert.equal(firstEvent?.conditionStatus, "unmet");
  assert.equal(firstEvent?.counterplay, "strong");
  assertConsistency(finished);
});

test("シナリオ3: 能力の相性が勝敗を決める", async () => {
  const fire = ability({ id: "fire", name: "業火", tempo: "fast", effects: [effect("damage", 3)] });
  const water = ability({
    id: "water",
    name: "水鏡",
    tempo: "normal",
    effects: [
      effect("barrier", 3, { target: "self", duration: "short" }),
      effect("heal", 2, { target: "self" }),
      effect("damage", 4),
    ],
  });
  const a = character("a", "焔田", [fire]);
  const b = character("b", "水瀬", [water]);
  const battle = buildBattle(a, b);

  const turns: ScriptedTurn[] = Array.from({ length: 3 }, () =>
    makeActionTurn({
      actionA: plan("A", "activate", "fire"),
      actionB: plan("B", "activate", "water"),
      events: [
        { side: "A", counterplay: "strong", effects: [damage(3)] },
        {
          side: "B",
          effects: [
            judgeEffect("barrier", 3, { target: "self", duration: "short" }),
            judgeEffect("heal", 2, { target: "self" }),
            damage(4),
          ],
        },
      ],
    }),
  );
  const ai = new ScriptedAi(turns);
  const finished = await runScriptedBattle(battle, ai, 4);

  assert.equal(finished.outcome?.winner, "B");
  assert.equal(finished.state.sides.A.down, true);
  assert.ok(finished.state.sides.B.integrity >= 99.9);
  const fireDamage = finished.turns.map((turn) => turn.ledger.events.find((event) => event.side === "A")?.damageDealt ?? 0);
  assert.ok(fireDamage.every((value) => value < 6), "炎は水の対抗でほぼ無効化される");
  assertConsistency(finished);
});

test("シナリオ4: 複雑な発動条件を満たすまで効果が発生しない", async () => {
  const trueName = ability({
    id: "true-name",
    name: "真名開放",
    tempo: "slow",
    effects: [effect("damage", 3)],
    conditions: [
      { text: "相手の真名を三度呼び終えている", evidence: "三度その名を呼べば" },
      { text: "対象の姿を視認している", evidence: "見えた者にのみ" },
    ],
  });
  const recoil = ability({
    id: "recoil",
    name: "反動撃",
    tempo: "normal",
    effects: [effect("damage", 1), effect("damage", 1, { target: "self" })],
    weaknesses: ["自身の損耗を代償にする"],
  });
  const a = character("a", "識無", [trueName]);
  const b = character("b", "殻守", [recoil]);
  const battle = buildBattle(a, b);

  const turns: ScriptedTurn[] = Array.from({ length: 5 }, (_, index) =>
    makeActionTurn({
      actionA: plan("A", "activate", "true-name"),
      actionB: plan("B", "activate", "recoil"),
      events: [
        {
          side: "A",
          conditionStatus: index < 2 ? "unmet" : "met",
          effects: index < 2 ? [damage(3)] : [damage(3)],
          summary: index < 2 ? "真名を呼び終えておらず、何も起きない" : "真名が響き、対象を捉えた",
        },
        {
          side: "B",
          effects: [damage(1), judgeEffect("damage", 1, { target: "self", label: "反動" })],
        },
      ],
    }),
  );
  const ai = new ScriptedAi(turns);
  const finished = await runScriptedBattle(battle, ai, 6);

  assert.equal(finished.turns[0].ledger.events.find((event) => event.side === "A")?.damageDealt, 0, "条件未達では損耗しない");
  assert.equal(finished.turns[1].ledger.events.find((event) => event.side === "A")?.damageDealt, 0);
  assert.ok(
    (finished.turns[2].ledger.events.find((event) => event.side === "A")?.damageDealt ?? 0) > 20,
    "条件充足後は効果が発生する",
  );
  assert.equal(finished.outcome?.winner, "A");
  assert.equal(finished.state.sides.B.down, true);
  const recoilDamage = finished.turns.reduce((sum, turn) => {
    const event = turn.ledger.events.find((item) => item.side === "B");
    return sum + (event?.effects.filter((effect) => effect.target === "self").reduce((acc, effect) => acc + effect.damage, 0) ?? 0);
  }, 0);
  assert.ok(recoilDamage > 0, "自己反動が状態に反映される");
  assertConsistency(finished);
});

test("シナリオ5: 互いに矛盾する能力は審判の範囲解釈で処理される", async () => {
  const nullifyAll = ability({
    id: "nullify-all",
    name: "万物無効",
    tempo: "fast",
    effects: [
      effect("nullify", 3, { duration: "battle" }),
      effect("barrier", 2, { target: "self", duration: "short" }),
    ],
    conditions: [{ text: "対象の能力を認識している", evidence: "認識した能力は無効" }],
  });
  const denyNullify = ability({
    id: "deny-nullify",
    name: "無効の否定",
    tempo: "normal",
    effects: [effect("rule", 3, { duration: "battle" }), effect("damage", 3)],
    conditions: [{ text: "無効化の宣言を聞いている", evidence: "その宣言は無効と告げる" }],
  });
  const a = character("a", "無効院", [nullifyAll]);
  const b = character("b", "否定家", [denyNullify]);
  const battle = buildBattle(a, b);

  const turns: ScriptedTurn[] = Array.from({ length: 4 }, () =>
    makeActionTurn({
      actionA: plan("A", "activate", "nullify-all"),
      actionB: plan("B", "activate", "deny-nullify"),
      events: [
        {
          side: "A",
          counterplay: "strong",
          conditionStatus: "met",
          effects: [],
          summary: "無効化の宣言は、無効を否定する規則の前で効力を失う",
        },
        {
          side: "B",
          effects: [judgeEffect("rule", 3, { duration: "battle" }), damage(3)],
        },
      ],
    }),
  );
  const ai = new ScriptedAi(turns);
  const finished = await runScriptedBattle(battle, ai, 5);

  assert.equal(finished.outcome?.winner, "B");
  const aEvents = finished.turns.map((turn) => turn.ledger.events.find((event) => event.side === "A"));
  assert.ok(
    aEvents.every((event) => (event?.effects.length ?? 0) === 0),
    "否定された無効化は効果を持たない",
  );
  assert.ok(
    finished.turns.every(
      (turn) => turn.stateAfter.sides.B.statuses.every((status) => !(status.tags ?? []).includes("nullify")),
    ),
    "無効化状態は付与されない",
  );
  assert.equal(finished.status, "finished");
  assertConsistency(finished);
});

test("シナリオ6: 戦闘途中で状態が変化し、条件が反転する", async () => {
  const timeMark = ability({
    id: "time-mark",
    name: "刻符",
    tempo: "fast",
    effects: [
      effect("mental", 3, { duration: "short" }),
      effect("damage", 1),
    ],
  });
  const counter = ability({
    id: "counter",
    name: "反撃の理",
    tempo: "normal",
    effects: [effect("damage", 3)],
    conditions: [{ text: "硬直・拘束から解放されている", evidence: "自由な身体でのみ" }],
  });
  const a = character("a", "刻野", [timeMark]);
  const b = character("b", "逆瀬", [counter]);
  const battle = buildBattle(a, b);

  const turns: ScriptedTurn[] = [
    makeActionTurn({
      actionA: plan("A", "activate", "time-mark"),
      actionB: plan("B", "activate", "counter"),
      events: [
        { side: "A", effects: [judgeEffect("mental", 3, { duration: "short" }), damage(1)] },
        { side: "B", conditionStatus: "unmet", success: false, effects: [damage(3)] },
      ],
    }),
    makeActionTurn({
      actionA: plan("A", "activate", "time-mark"),
      actionB: plan("B", "recover"),
      events: [
        { side: "A", effects: [judgeEffect("mental", 3, { duration: "short" }), damage(1)] },
        { side: "B" },
      ],
    }),
    makeActionTurn({
      actionA: plan("A", "strike"),
      actionB: plan("B", "recover"),
      events: [{ side: "A" }, { side: "B" }],
    }),
    ...Array.from({ length: 3 }, () =>
      makeActionTurn({
        actionA: plan("A", "strike"),
        actionB: plan("B", "activate", "counter"),
        events: [{ side: "A" }, { side: "B", conditionStatus: "met", effects: [damage(3)] }],
      }),
    ),
    makeActionTurn({
      actionA: plan("A", "strike"),
      actionB: plan("B", "recover"),
      events: [{ side: "A" }, { side: "B", conditionStatus: "na" }],
    }),
    makeActionTurn({
      actionA: plan("A", "strike"),
      actionB: plan("B", "activate", "counter"),
      events: [{ side: "A" }, { side: "B", conditionStatus: "met", effects: [damage(3)] }],
    }),
  ];
  const ai = new ScriptedAi(turns);
  const finished = await runScriptedBattle(battle, ai, 10);

  assert.equal(finished.turns[0].ledger.damageTo.A, 0, "硬直中は反撃条件を満たさない");
  assert.equal(finished.turns[2].ledger.damageTo.A, 0);
  assert.ok(finished.turns[3].ledger.damageTo.A > 20, "硬直解除後は反撃が成立する");
  assert.equal(finished.state.sides.A.down, true);
  assert.equal(finished.outcome?.winner, "B");
  assertConsistency(finished);
});
