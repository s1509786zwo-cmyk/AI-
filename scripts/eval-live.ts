/**
 * 実AIモデルを使った品質検証スクリプト。
 *
 * 使い方:
 *   npm run eval:live                  # 全6シナリオ
 *   npm run eval:live -- --turns=8     # ラウンド上限
 *   npm run eval:live -- --scenario=2  # 個別シナリオ
 *
 * 事前に .env.local へ GEMINI_API_KEY などを設定しておくこと。
 * 結果は .data/eval-report.json に保存される。
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createAiClient } from "@/lib/ai/client";
import { resolveAiConfig } from "@/lib/ai/config";
import { analyzeCharacter } from "@/lib/engine/analysis";
import { ARENAS, createBattle } from "@/lib/engine/battle";
import { resolveTurn } from "@/lib/engine/turn";
import type { Battle, Character, CharacterInput, Side, TurnRecord } from "@/lib/engine/types";
import { CHARACTER_TEMPLATES } from "@/lib/content/templates";

try {
  process.loadEnvFile(path.join(process.cwd(), ".env.local"));
} catch {
  try {
    process.loadEnvFile(path.join(process.cwd(), ".env"));
  } catch {
    /* env file is optional */
  }
}

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

const MAX_TURNS = Math.max(1, Math.min(20, Number(arg("turns") ?? 10)));
const ONLY = arg("scenario") ? Number(arg("scenario")) : null;

const custom: Record<string, CharacterInput> = {
  water: {
    name: "水瀬 みなも",
    abilityText:
      "水を操り、あらゆる炎を打ち消す。濡れた場所では力が増す。水の膜で身を守り、傷を塞ぐこともできる。ただし乾燥した環境では水を生み出せず、自分の体の水分を削ってしまう。",
    personality: "穏やかだが頑固。火を見ると反射的に消そうとする。",
    background: "水の理を継いだ最後の継承者。",
    weakness: "乾燥した場所では水を生み出せない。炎を消すことに意識が向くと攻撃が疎かになる。",
  },
  omega: {
    name: "終眼 ゼロ",
    abilityText:
      "相手の目を見て、その名を三度呼ぶと、相手を概念ごと消滅させる。三度目の名を呼び終えるまでに相手が視界から消えるか、名を忘れさせれば発動しない。発動には自分の声が必要で、喉を潰されると使えない。",
    personality: "儀式めいた手順を守る。急ぐことを嫌う。",
    background: "名を数えることを生業とする終末の観測者。",
    weakness: "三度名を呼ぶ前に視界を奪われると発動できない。声を封じられると無力。",
  },
  fog: {
    name: "霧生 かすみ",
    abilityText:
      "濃い霧を発生させ、あらゆる視認を遮る。霧の中では自分の気配も消える。霧は風で流され、強い光で晴れる。霧の中では自分も相手を正確に見られない。",
    personality: "消極的だが執念深い。相手の能力の手順を潰すことを好む。",
    background: "霧の谷に捨てられた観測者。",
    weakness: "強い光と風に弱い。霧の中では自分も狙いを定められない。",
  },
  nullify: {
    name: "無効院 ゆい",
    abilityText:
      "あらゆる能力の発動を無効化する。ただし、無効化できるのは自分が実際に認識した能力だけで、認識していない能力には効かない。無効化している間は自分も能力を使えない。",
    personality: "慎重で疑い深い。まず相手の手を見る。",
    background: "能力犯罪を取り締まる裁定局の局員。",
    weakness: "認識できない能力には無効化が効かない。無効化中は自分も能力を使えない。",
  },
  deny: {
    name: "否定家 あらた",
    abilityText:
      "「無効化」という概念そのものを否定する規則を戦場に貼る。この規則の前では、いかなる無効化も成立しない。規則は自分にも作用し、自分が無効化の言葉を口にすると喉が焼ける。",
    personality: "理屈屋。言葉の定義に異常にこだわる。",
    background: "概念法廷の書記。",
    weakness: "規則は自分の行動も縛る。物理的な攻撃には直接の防御手段がない。",
  },
};

const template = (label: string): CharacterInput => {
  const found = CHARACTER_TEMPLATES.find((item) => item.label === label);
  if (!found) throw new Error(`template not found: ${label}`);
  return found;
};

const scenarios: {
  id: number;
  title: string;
  purpose: string;
  a: CharacterInput;
  b: CharacterInput;
  arena: string;
}[] = [
  {
    id: 1,
    title: "単純な能力同士",
    purpose: "基本的な攻撃能力同士で、条件・損耗・決着が破綻しないか",
    a: template("炎の操作"),
    b: template("物理無効"),
    arena: "白い無限平面",
  },
  {
    id: 2,
    title: "極端に強い能力",
    purpose: "即死級の概念能力が、条件と対抗手段で必ずしも勝てないか",
    a: custom.omega,
    b: custom.fog,
    arena: "霧の森",
  },
  {
    id: 3,
    title: "相性が重要な対戦",
    purpose: "炎と水の相性が、数値ではなく出来事として裁定されるか",
    a: template("炎の操作"),
    b: custom.water,
    arena: "灼熱の溶岩窟",
  },
  {
    id: 4,
    title: "複雑な発動条件",
    purpose: "時間停止の条件・代償・連続使用の制限が守られるか",
    a: template("時間停止（3秒）"),
    b: template("因果逆転"),
    arena: "崩れかけた都市",
  },
  {
    id: 5,
    title: "矛盾する能力",
    purpose: "無効化と無効化の否定という矛盾を、範囲解釈で一貫して裁けるか",
    a: custom.nullify,
    b: custom.deny,
    arena: "白い無限平面",
  },
  {
    id: 6,
    title: "途中で状況が変化する対戦",
    purpose: "拘束・視界・消耗により条件が反転し、戦況が変わるか",
    a: template("時間停止（3秒）"),
    b: custom.fog,
    arena: "霧の森",
  },
];

function asCharacter(input: CharacterInput, analysis: Character["analysis"], id: string): Character {
  const now = new Date().toISOString();
  return {
    id,
    ...input,
    createdAt: now,
    updatedAt: now,
    analysis,
    analysisHash: "eval",
    analysisModel: analysis?.model ?? null,
    analysisError: null,
    analyzedAt: analysis?.analyzedAt ?? null,
  };
}

interface InvariantIssue {
  round: number;
  message: string;
}

function checkTurn(battle: Battle, turn: TurnRecord): InvariantIssue[] {
  const issues: InvariantIssue[] = [];
  for (const side of ["A", "B"] as const) {
    const analysis = battle.fighters[side].analysis;
    const state = turn.stateAfter.sides[side];
    for (const [abilityId, uses] of Object.entries(state.abilityUses)) {
      const ability = analysis.abilities.find((item) => item.id === abilityId);
      if (!ability) {
        issues.push({ round: turn.index, message: `${side}: 未知の能力ID ${abilityId} が使用記録に残った` });
        continue;
      }
      if (ability.usesPerBattle !== null && uses > ability.usesPerBattle) {
        issues.push({ round: turn.index, message: `${side}: ${ability.name} の使用回数が上限を超過` });
      }
    }
    for (const event of turn.ledger.events.filter((item) => item.side === side)) {
      if (!event.abilityId) continue;
      const ability = analysis.abilities.find((item) => item.id === event.abilityId);
      if (!ability) {
        issues.push({ round: turn.index, message: `${side}: 解析にない能力 ${event.abilityId} が裁定された` });
        continue;
      }
      const allowedKinds = new Set(ability.effects.map((effect) => effect.kind));
      for (const applied of event.effects) {
        if (!allowedKinds.has(applied.kind)) {
          issues.push({ round: turn.index, message: `${side}: ${ability.name} にない効果 ${applied.kind} が適用された` });
        }
      }
    }
    if (turn.ledger.damageTo[side] > 100) {
      issues.push({ round: turn.index, message: `${side}: 1ラウンドの損耗が100を超えた` });
    }
  }
  if (turn.ledger.finished && !turn.ledger.winner) {
    issues.push({ round: turn.index, message: "決着したのに勝者が存在しない" });
  }
  if (turn.narration.length < 80) {
    issues.push({ round: turn.index, message: "描写が短すぎる" });
  }
  if (!turn.audit.consistent) {
    issues.push({ round: turn.index, message: `描写の整合性監査に失敗: ${turn.audit.issues.join(" / ")}` });
  }
  return issues;
}

async function main() {
  const config = await resolveAiConfig();
  if (!config.configured) {
    console.error("AI APIが未設定です。.env.local または画面のAI設定で接続情報を設定してください。");
    console.error("例: AI_API_KEY=... AI_MODEL=gpt-4.1");
    process.exit(2);
  }
  const client = await createAiClient(config);
  console.log(`モデル: ${config.model}（裁定: ${config.judgeModel}） / 上限 ${MAX_TURNS} ラウンド`);
  const selected = scenarios.filter((scenario) => (ONLY ? scenario.id === ONLY : true));
  const report: Record<string, unknown>[] = [];
  let failures = 0;

  for (const scenario of selected) {
    console.log(`\n=== シナリオ${scenario.id}: ${scenario.title} — ${scenario.purpose} ===`);
    const started = Date.now();
    const [analysisA, analysisB] = await Promise.all([
      analyzeCharacter(client, scenario.a),
      analyzeCharacter(client, scenario.b),
    ]);
    console.log(`能力解析: A=${analysisA.analysis.abilities.length}件 / B=${analysisB.analysis.abilities.length}件（${Date.now() - started}ms）`);
    for (const [side, result] of [["A", analysisA], ["B", analysisB]] as const) {
      console.log(
        `  ${side}: ${result.analysis.abilities.map((ability) => `${ability.name}[${ability.tempo}/${ability.effects.map((effect) => `${effect.kind}:${effect.severity}`).join(",")}]`).join(" / ")}`,
      );
    }
    let battle = createBattle({
      fighterA: asCharacter(scenario.a, analysisA.analysis, `eval-${scenario.id}-a`),
      fighterB: asCharacter(scenario.b, analysisB.analysis, `eval-${scenario.id}-b`),
      arena: ARENAS.find((arena) => arena.name === scenario.arena) ?? ARENAS[0],
      id: `eval-${scenario.id}`,
    });
    const issues: InvariantIssue[] = [];
    let round = 0;
    while (battle.status === "active" && round < MAX_TURNS) {
      round += 1;
      const { battle: updated } = await resolveTurn({ battle, ai: client });
      battle = updated;
      const turn = battle.turns[battle.turns.length - 1];
      issues.push(...checkTurn(battle, turn));
      const audit = turn.audit.consistent ? "OK" : "要確認";
      console.log(
        `  R${turn.index}: ${turn.highlight} / A ${Math.round(battle.state.sides.A.integrity)} - B ${Math.round(battle.state.sides.B.integrity)} / 監査:${audit}`,
      );
    }
    const winner =
      battle.outcome?.winner === "draw"
        ? "引き分け"
        : battle.outcome
          ? battle.fighters[battle.outcome.winner].name
          : "未決着";
    const validFinish =
      battle.status === "finished" &&
      battle.outcome !== null &&
      (battle.outcome.winner === "draw" ||
        battle.state.sides[battle.outcome.winner === "A" ? "B" : "A"].down ||
        battle.outcome.method === "規定ラウンド判定");
    if (!validFinish) {
      issues.push({ round, message: battle.status === "active" ? `上限${MAX_TURNS}ラウンド内に決着しなかった` : "勝敗と状態が一致しない" });
    }
    console.log(`  結果: ${winner} / ${battle.outcome?.method ?? "未決着"} / ${round}ラウンド / 問題 ${issues.length}件`);
    if (issues.length) {
      failures += issues.length;
      for (const issue of issues.slice(0, 6)) console.log(`    ! R${issue.round}: ${issue.message}`);
    }
    report.push({
      id: scenario.id,
      title: scenario.title,
      model: config.judgeModel,
      arena: scenario.arena,
      abilities: { A: analysisA.analysis.abilities, B: analysisB.analysis.abilities },
      finish: battle.outcome,
      status: battle.status,
      rounds: battle.turns.length,
      issues,
      turns: battle.turns.map((turn) => ({
        index: turn.index,
        narration: turn.narration,
        audit: turn.audit,
        ledger: turn.ledger,
        adjudication: turn.adjudication,
        plans: turn.plans,
      })),
    });
  }

  const dir = process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "eval-report.json");
  await writeFile(
    file,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        provider: config.provider,
        model: config.model,
        judgeModel: config.judgeModel,
        maxTurns: MAX_TURNS,
        failures,
        scenarios: report,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`\nレポート: ${file}`);
  if (failures > 0) {
    console.error(`品質検証で ${failures} 件の問題が検出されました。`);
    process.exit(1);
  }
  console.log("すべてのシナリオで整合性チェックに合格しました。");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
