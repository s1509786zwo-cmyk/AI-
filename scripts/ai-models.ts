/**
 * Gemini の利用可能なモデル一覧を表示する。
 *
 *   npm run ai:models
 *
 * APIキーは表示しない。AI Studio の AQ. キーはネイティブ API で使う。
 */
import path from "node:path";
import { resolveAiConfig } from "@/lib/ai/config";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(process.cwd(), file));
  } catch {
    /* optional */
  }
}

interface GeminiModel {
  name?: string;
  displayName?: string;
  inputTokenLimit?: number;
  supportedGenerationMethods?: string[];
}

function redact(text: string, secret: string): string {
  return secret ? text.split(secret).join("[redacted]") : text;
}

async function main() {
  const config = await resolveAiConfig();
  if (!config.configured) {
    console.error("AIが未設定です。.env.local に GEMINI_API_KEY=... を設定してください。");
    process.exit(2);
  }
  if (config.provider !== "gemini") {
    console.error(`provider=${config.provider} のため、Geminiのモデル一覧は取得しません。`);
    process.exit(2);
  }
  const base = config.baseUrl.replace(/\/+$/, "");
  console.log(`endpoint: ${base}/models`);
  console.log(`current : ${config.model}\n`);

  const models: GeminiModel[] = [];
  let pageToken = "";
  for (let page = 0; page < 3; page += 1) {
    const url = `${base}/models?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const response = await fetch(url, {
      headers: { "x-goog-api-key": config.apiKey },
    });
    if (!response.ok) {
      const body = redact((await response.text()).slice(0, 800), config.apiKey);
      console.error(`HTTP ${response.status}: ${body}`);
      process.exit(1);
    }
    const data = (await response.json()) as { models?: GeminiModel[]; nextPageToken?: string };
    models.push(...(data.models ?? []));
    pageToken = data.nextPageToken ?? "";
    if (!pageToken) break;
  }

  const usable = models.filter((model) =>
    (model.supportedGenerationMethods ?? []).includes("generateContent"),
  );
  if (!usable.length) {
    console.error("generateContent に対応するモデルが見つかりませんでした。");
    console.error(JSON.stringify(models.slice(0, 5), null, 2));
    process.exit(1);
  }

  console.log("利用可能なモデル（generateContent）:");
  const current = `models/${config.model.replace(/^models\//, "")}`;
  for (const model of usable.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))) {
    const name = (model.name ?? "").replace(/^models\//, "");
    const mark = model.name === current ? "  ← 現在の AI_MODEL" : "";
    console.log(`- ${name}${mark}`);
    console.log(`    ${model.displayName ?? ""}${model.inputTokenLimit ? ` / input ${model.inputTokenLimit} tokens` : ""}`);
  }

  if (!usable.some((model) => model.name === current)) {
    console.log(`\n現在の AI_MODEL=${config.model} は一覧にありません。上の中から選んで .env.local を更新してください。`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
