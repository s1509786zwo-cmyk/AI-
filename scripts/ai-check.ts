/**
 * AI接続の診断。APIキーそのものは表示しない。
 *
 *   npm run ai:check
 *
 * 表示された provider / endpoint / model / エラーコードを見て原因を切り分ける。
 */
import path from "node:path";
import { AiError, createAiClient } from "@/lib/ai/client";
import { resolveAiConfig } from "@/lib/ai/config";
import { connectionProbeSchema } from "@/lib/engine/schema";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(process.cwd(), file));
  } catch {
    /* optional */
  }
}

function mask(value: string): string {
  return value ? `set (${value.length} chars)` : "NOT SET";
}

function endpoint(config: Awaited<ReturnType<typeof resolveAiConfig>>): string {
  const base = config.baseUrl.replace(/\/+$/, "");
  if (config.provider === "gemini") {
    return `${base}/models/${config.model}:generateContent`;
  }
  if (config.provider === "anthropic") {
    return base.endsWith("/v1") ? `${base}/messages` : `${base}/v1/messages`;
  }
  return `${base}/chat/completions`;
}

async function main() {
  const config = await resolveAiConfig();
  console.log("=== AI connection check ===");
  console.log(`configured : ${config.configured}`);
  console.log(`source     : ${config.source}`);
  console.log(`provider   : ${config.provider}`);
  console.log(`model      : ${config.model}`);
  console.log(`judgeModel : ${config.judgeModel}`);
  console.log(`endpoint   : ${endpoint(config)}`);
  console.log(`apiKey     : ${mask(config.apiKey)}`);
  console.log(`timeout    : ${config.timeoutMs} ms`);
  console.log(`audit      : ${config.audit}`);
  if (config.warning) console.log(`warning    : ${config.warning}`);

  if (!config.configured) {
    console.error("\nAIが未設定です。.env.local に GEMINI_API_KEY=... を設定し、サーバーを再起動してください。");
    process.exit(2);
  }

  const started = Date.now();
  try {
    const client = await createAiClient(config);
    const result = await client.json({
      system:
        "あなたは接続診断用の応答器である。指定されたJSONだけを返す。余計な説明は禁止。" +
        "出力は {\"ok\": true, \"model\": \"実際のモデル名\", \"note\": \"短い日本語の挨拶\"} の形式に厳密に従うこと。",
      user: "接続テストです。JSONのみで応答してください。",
      schema: connectionProbeSchema,
      label: "接続診断",
      tier: "fast",
      temperature: 0,
      maxTokens: 1024,
      maxRepairs: 1,
    });
    console.log(`\nOK: ${Date.now() - started} ms / model=${result.model} / note=${result.data.note}`);
  } catch (error) {
    console.error(`\nNG: ${Date.now() - started} ms`);
    if (error instanceof AiError) {
      console.error(`code   : ${error.code}`);
      console.error(`status : ${error.status ?? "-"}`);
      console.error(`message: ${error.message}`);
      if (error.detail) console.error(`detail : ${error.detail}`);
      switch (error.code) {
        case "auth":
          console.error("\n→ APIキーが拒否されています。Google AI Studio (https://aistudio.google.com/apikey) で");
          console.error("  新しいキーを発行し、.env.local の GEMINI_API_KEY を更新してください。");
          console.error("  キーの前後に空白・引用符が入っていないかも確認してください。");
          break;
        case "model":
          console.error("\n→ モデルまたはURLがこのキーでは使えません。");
          console.error("  1) AI_BASE_URL を設定している場合は削除する（GeminiはネイティブURLが既定）");
          console.error("  2) npm run ai:models で利用可能なモデルを確認する");
          console.error("  3) 表示されたモデル名を AI_MODEL に設定して再実行する");
          break;
        case "network":
          console.error("\n→ この環境からAI APIへ接続できません。");
          console.error("  URLが app.github.dev（Codespaces）または localhost になっているか確認してください。");
          console.error("  e2b.app のArenaプレビューは外部通信が遮断されているため、必ず失敗します。");
          break;
        case "rate_limit":
          console.error("\n→ レート制限です。1分ほど待って再実行してください。");
          break;
        default:
          break;
      }
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
