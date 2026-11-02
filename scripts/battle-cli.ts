/**
 * コマンドラインから1試合を実行する。
 *
 * 使い方:
 *   npm run battle:cli -- --a="時間停止（3秒）" --b="因果逆転" --arena=崩れかけた都市 --turns=12
 *   npm run battle:cli -- --a=<character-id> --b=<character-id> --no-save
 *
 * --a / --b にはテンプレート名、保存済みキャラクターのIDまたは名前を指定できる。
 * 進行と描写を表示し、--no-save を付けない限り対戦履歴に保存する。
 */
import path from "node:path";
import { createAiClient } from "@/lib/ai/client";
import { resolveAiConfig } from "@/lib/ai/config";
import { CHARACTER_TEMPLATES } from "@/lib/content/templates";
import { analysisHash, analyzeCharacter, needsAnalysis } from "@/lib/engine/analysis";
import { ARENAS, createBattle, findArena } from "@/lib/engine/battle";
import { resolveTurn } from "@/lib/engine/turn";
import type { Character, CharacterInput } from "@/lib/engine/types";
import { getCharacter, listCharacters } from "@/lib/service/characters";
import { saveBattle } from "@/lib/service/battles";

try {
  process.loadEnvFile(path.join(process.cwd(), ".env.local"));
} catch {
  try {
    process.loadEnvFile(path.join(process.cwd(), ".env"));
  } catch {
    /* optional */
  }
}

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

const help = `使い方:
  npm run battle:cli -- --a=<テンプレート名|キャラクターID|名前> --b=<...> [--arena=<戦場名>] [--turns=12] [--no-save]

テンプレート:
${CHARACTER_TEMPLATES.map((template) => `  - ${template.label}`).join("\n")}

戦場:
${ARENAS.map((arena) => `  - ${arena.name}`).join("\n")}`;

function fromTemplate(label: string): CharacterInput | null {
  return CHARACTER_TEMPLATES.find((template) => template.label === label) ?? null;
}

function makeCharacter(input: CharacterInput, id: string): Character {
  const now = new Date().toISOString();
  return {
    id,
    ...input,
    createdAt: now,
    updatedAt: now,
    analysis: null,
    analysisHash: null,
    analysisModel: null,
    analysisError: null,
    analyzedAt: null,
  };
}

async function resolveFighter(spec: string, slot: "A" | "B"): Promise<Character> {
  if (spec.startsWith("id:")) {
    const found = await getCharacter(spec.slice(3));
    if (!found) throw new Error(`キャラクターID「${spec.slice(3)}」が見つかりません。`);
    return found;
  }
  const template = fromTemplate(spec);
  if (template) return makeCharacter(template, `cli-${slot}-${crypto.randomUUID()}`);
  const characters = await listCharacters();
  const byName = characters.find((character) => character.name === spec);
  if (byName) return byName;
  const byId = characters.find((character) => character.id === spec);
  if (byId) return byId;
  throw new Error(`「${spec}」はテンプレート名・キャラクター名・IDのいずれにも一致しません。--help を確認してください。`);
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log(help);
    return;
  }
  const specA = arg("a");
  const specB = arg("b");
  if (!specA || !specB) {
    console.error(help);
    process.exit(2);
  }
  const config = await resolveAiConfig();
  if (!config.configured) {
    console.error("AI APIが未設定です。.env.local か画面のAI設定で接続情報を設定してください。");
    process.exit(2);
  }
  const client = await createAiClient(config);
  const maxTurns = Math.max(1, Math.min(20, Number(arg("turns") ?? 20)));
  const arena = findArena(arg("arena") ?? undefined);

  const [a0, b0] = await Promise.all([resolveFighter(specA, "A"), resolveFighter(specB, "B")]);
  if (a0.id === b0.id) throw new Error("同じキャラクター同士では対戦できません。");

  const analyze = async (character: Character): Promise<Character> => {
    if (!needsAnalysis(character)) return character;
    console.error(`能力を解析中: ${character.name}`);
    const { analysis, model } = await analyzeCharacter(client, character);
    return {
      ...character,
      analysis,
      analysisHash: analysisHash(character),
      analysisModel: model,
      analysisError: null,
      analyzedAt: new Date().toISOString(),
    };
  };
  const [a, b] = await Promise.all([analyze(a0), analyze(b0)]);

  let battle = createBattle({ fighterA: a, fighterB: b, arena });
  console.log(`${battle.fighters.A.name} vs ${battle.fighters.B.name} — ${arena.name}`);
  console.log(`モデル: ${config.model} / 裁定: ${config.judgeModel}\n`);

  while (battle.status === "active" && battle.turns.length < maxTurns) {
    const result = await resolveTurn({
      battle,
      ai: client,
      onPhase: (phase) => {
        if (phase.phase === "actions" || phase.phase === "adjudication" || phase.phase === "closing") {
          console.log(`  · ${phase.message}`);
        }
      },
    });
    battle = result.battle;
    const turn = result.turn;
    console.log(`\n── 第${turn.index}ラウンド: ${turn.highlight} ──`);
    console.log(turn.narration);
    console.log(
      `  [損耗] A ${Math.round(battle.state.sides.A.integrity)} / B ${Math.round(battle.state.sides.B.integrity)}` +
        `  [監査] ${turn.audit.consistent ? "OK" : "要確認"}${turn.audit.repaired ? "（修正済み）" : ""}`,
    );
  }

  if (battle.status === "active") {
    console.log(`\n${maxTurns}ラウンド上限に達しました（未決着）。--turns を増やしてください。`);
  } else if (battle.outcome) {
    const winner =
      battle.outcome.winner === "draw" ? "引き分け" : `${battle.fighters[battle.outcome.winner].name} の勝利`;
    console.log(`\n=== ${winner}（${battle.outcome.method} / 第${battle.outcome.round}ラウンド）===`);
    console.log(battle.outcome.reason);
    if (battle.closing) console.log(`\n${battle.closing.verdict}`);
  }

  if (!process.argv.includes("--no-save")) {
    await saveBattle(battle);
    console.log(`\n対戦履歴に保存しました: ${battle.id}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
