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
