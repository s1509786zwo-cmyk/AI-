import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { AiError, HttpAiClient, extractJsonObject } from "@/lib/ai/client";
import type { AiConfig } from "@/lib/ai/config";

const config: AiConfig = {
  configured: true,
  provider: "openai",
  apiKey: "test-secret-key",
  baseUrl: "https://example.invalid/v1",
  model: "model-a",
  fastModel: "model-b",
  judgeModel: "model-a",
  audit: true,
  timeoutMs: 5000,
  source: "env",
  warning: null,
};

const probeSchema = z.object({ ok: z.boolean(), model: z.string(), note: z.string() });

test("JSON抽出はコードフェンスや前後の文章を許容する", () => {
  assert.deepEqual(extractJsonObject('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJsonObject('結果は次のとおりです: {"a":{"b":2}} 以上。'), { a: { b: 2 } });
  assert.throws(() => extractJsonObject("JSONなし"), AiError);
});

test("不正なJSONはスキーマ修復のための再呼び出しで解決する", async () => {
  const calls: string[] = [];
  let count = 0;
  const fetcher = (async (_url: string, init: RequestInit) => {
    calls.push(String(init.body));
    count += 1;
    const content = count === 1 ? '{"ok":"yes"}' : '{"ok":true,"model":"model-a","note":"ok"}';
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  const client = new HttpAiClient({ config, fetcher });
  const result = await client.json({
    system: "JSONで応答",
    user: "テスト",
    schema: probeSchema,
    label: "probe",
    tier: "fast",
  });
  assert.equal(result.repairs, 1);
  assert.equal(result.data.ok, true);
  assert.equal(calls.length, 2);
  assert.match(calls[1], /スキーマ検証に失敗/);
  assert.match(calls[0], /response_format/);
});

test("認証エラーはAiError(auth)になり、キーを露出しない", async () => {
  const fetcher = (async () =>
    new Response('{"error":"invalid key test-secret-key"}', { status: 401 })) as unknown as typeof fetch;
  const client = new HttpAiClient({ config, fetcher });
  await assert.rejects(
    () =>
      client.json({
        system: "JSON",
        user: "x",
        schema: probeSchema,
        label: "probe",
        tier: "fast",
      }),
    (error: unknown) => {
      assert.ok(error instanceof AiError);
      assert.equal(error.code, "auth");
      assert.ok(!error.detail?.includes("test-secret-key"));
      return true;
    },
  );
});

test("未設定の構成では即座に失敗する", () => {
  assert.throws(
    () => new HttpAiClient({ config: { ...config, configured: false, apiKey: "" } }),
    (error: unknown) => error instanceof AiError && error.code === "not_configured",
  );
});

test("タイムアウトは専用のエラーコードになる", async () => {
  const fetcher = (async (_url: string, init: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });
  }) as unknown as typeof fetch;
  const client = new HttpAiClient({ config: { ...config, timeoutMs: 50 }, fetcher });
  await assert.rejects(
    () =>
      client.json({
        system: "JSON",
        user: "x",
        schema: probeSchema,
        label: "probe",
        tier: "fast",
      }),
    (error: unknown) => error instanceof AiError && error.code === "timeout",
  );
});

test("互換APIがmax_tokensを拒否した場合はmax_completion_tokensで再試行する", async () => {
  const bodies: string[] = [];
  let count = 0;
  const fetcher = (async (_url: string, init: RequestInit) => {
    bodies.push(String(init.body));
    count += 1;
    if (count === 1) {
      return new Response('{"error":"Unsupported parameter: max_tokens"}', { status: 400 });
    }
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '{"ok":true,"model":"model-a","note":"ok"}' } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;
  const client = new HttpAiClient({ config, fetcher });
  const result = await client.json({
    system: "JSON",
    user: "x",
    schema: probeSchema,
    label: "probe",
    tier: "fast",
  });
  assert.equal(result.data.ok, true);
  assert.equal(count, 2);
  assert.ok(bodies[0].includes("max_tokens"));
  assert.ok(!bodies[1].includes('"max_tokens"'));
  assert.ok(bodies[1].includes("max_completion_tokens"));
});

const geminiConfig: AiConfig = {
  ...config,
  provider: "gemini",
  apiKey: "AQ.test-key-123",
  baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  model: "gemini-2.5-flash",
  fastModel: "gemini-2.5-flash",
  judgeModel: "gemini-2.5-flash",
};

function geminiResponse(content: string, thought?: string): Response {
  const parts = [...(thought ? [{ text: thought, thought: true }] : []), { text: content }];
  return new Response(
    JSON.stringify({
      candidates: [{ content: { role: "model", parts }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

test("GeminiはネイティブgenerateContentをx-goog-api-keyで呼ぶ", async () => {
  let seenUrl = "";
  let seenInit: RequestInit | null = null;
  const fetcher = (async (url: string, init: RequestInit) => {
    seenUrl = String(url);
    seenInit = init;
    return geminiResponse('{"ok":true,"model":"gemini-2.5-flash","note":"native"}', "内部の思考は本文ではない");
  }) as unknown as typeof fetch;
  const client = new HttpAiClient({ config: geminiConfig, fetcher });
  const result = await client.json({
    system: "接続診断",
    user: "ping",
    schema: probeSchema,
    label: "probe",
    tier: "fast",
  });

  assert.equal(result.data.ok, true);
  assert.equal(result.raw, '{"ok":true,"model":"gemini-2.5-flash","note":"native"}');
  assert.equal(seenUrl, "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
  const init = seenInit as RequestInit | null;
  const headers = init?.headers as Record<string, string>;
  assert.equal(headers["x-goog-api-key"], "AQ.test-key-123");
  assert.equal(headers.authorization, undefined);
  const body = JSON.parse(String(init?.body));
  assert.equal(body.systemInstruction.parts[0].text, "接続診断");
  assert.equal(body.contents[0].role, "user");
  assert.equal(body.contents[0].parts[0].text, "ping");
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingBudget: 0 });
  assert.equal(body.model, undefined);
});

test("Geminiでモデルが見つからない場合は既知のモデルへフォールバックする", async () => {
  const urls: string[] = [];
  const fetcher = (async (url: string) => {
    urls.push(String(url));
    if (urls.length === 1) {
      return new Response(
        JSON.stringify({ error: { code: 404, message: "models/gemini-9-flash is not found" } }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }
    return geminiResponse('{"ok":true,"model":"gemini-2.5-flash","note":"fallback"}');
  }) as unknown as typeof fetch;
  const client = new HttpAiClient({
    config: { ...geminiConfig, model: "gemini-9-flash", fastModel: "gemini-9-flash" },
    fetcher,
  });
  const result = await client.json({
    system: "JSON",
    user: "x",
    schema: probeSchema,
    label: "probe",
    tier: "fast",
  });
  assert.equal(result.data.ok, true);
  assert.equal(urls.length, 2);
  assert.match(urls[0], /gemini-9-flash:generateContent$/);
  assert.match(urls[1], /gemini-flash-latest:generateContent$/);
});

test("Geminiが本文を返さない場合はinvalid_jsonとして報告する", async () => {
  const fetcher = (async () =>
    new Response(
      JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS" }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as unknown as typeof fetch;
  const client = new HttpAiClient({ config: geminiConfig, fetcher });
  await assert.rejects(
    () =>
      client.json({
        system: "JSON",
        user: "x",
        schema: probeSchema,
        label: "probe",
        tier: "fast",
      }),
    (error: unknown) => error instanceof AiError && error.code === "invalid_json",
  );
});
