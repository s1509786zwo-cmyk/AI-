import type { z } from "zod";
import type { AiConfig } from "./config";

export class AiError extends Error {
  code: "not_configured" | "auth" | "rate_limit" | "model" | "network" | "timeout" | "http" | "invalid_json" | "invalid_schema" | "server";
  status?: number;
  detail?: string;

  constructor(
    code: AiError["code"],
    message: string,
    options?: { status?: number; detail?: string },
  ) {
    super(message);
    this.name = "AiError";
    this.code = code;
    this.status = options?.status;
    this.detail = options?.detail;
  }
}

export interface AiUsage {
  promptTokens?: number;
  completionTokens?: number;
}

export interface JsonCallOptions<T> {
  system: string;
  user: string;
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  label: string;
  tier?: "judge" | "analysis" | "fast" | "narration";
  temperature?: number;
  maxTokens?: number;
  maxRepairs?: number;
}

export interface JsonCallResult<T> {
  data: T;
  raw: string;
  model: string;
  ms: number;
  repairs: number;
  usage?: AiUsage;
}

export interface AiClient {
  readonly model: string;
  readonly fastModel: string;
  readonly judgeModel: string;
  readonly audit: boolean;
  readonly provider: string;
  json<T>(options: JsonCallOptions<T>): Promise<JsonCallResult<T>>;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const TIER_TEMPERATURE: Record<NonNullable<JsonCallOptions<unknown>["tier"]>, number> = {
  judge: 0.15,
  analysis: 0.2,
  fast: 0.65,
  narration: 0.9,
};

const TIER_MAX_TOKENS: Record<NonNullable<JsonCallOptions<unknown>["tier"]>, number> = {
  judge: 5000,
  analysis: 6500,
  fast: 1600,
  narration: 2200,
};

/** モデル出力から最初の完全なJSONオブジェクトを取り出す */
export function extractJsonObject(raw: string): unknown {
  const cleaned = raw
    .replace(/^\uFEFF/, "")
    .replace(/```(?:json)?/gi, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* scan below */
  }
  const start = cleaned.indexOf("{");
  if (start < 0) throw new AiError("invalid_json", "AIの応答にJSONオブジェクトが含まれていません。", { detail: raw.slice(0, 400) });
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        const candidate = cleaned.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch (error) {
          throw new AiError("invalid_json", "AIのJSON応答を解釈できませんでした。", {
            detail: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }
  throw new AiError("invalid_json", "AIのJSON応答が途中で切れています。", { detail: raw.slice(0, 400) });
}

function zodIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 12).map((issue) => {
    const where = issue.path.length ? issue.path.join(".") : "(root)";
    return `${where}: ${issue.message}`;
  });
}

export function describeAiError(error: unknown): string {
  if (error instanceof AiError) {
    switch (error.code) {
      case "not_configured":
        return "AI APIが未設定です。サーバー側の接続設定を確認してください。";
      case "auth":
        return "AI APIの認証に失敗しました。サーバー側のAPIキーを確認してください。";
      case "rate_limit":
        return "AI APIのレート制限に達しました。少し待って再試行してください。";
      case "model":
        return "指定されたAIモデルが利用できません。モデル名を確認してください。";
      case "network":
        return "AI APIに接続できませんでした。サーバーの外部通信が許可されているか確認してください。";
      case "timeout":
        return "AI APIの応答がタイムアウトしました。モデルまたはネットワークを確認してください。";
      case "invalid_json":
      case "invalid_schema":
        return `AIの応答形式が不正です（${error.message}）。再試行してください。`;
      default:
        return `AI APIの呼び出しに失敗しました（${error.message}）。`;
    }
  }
  return error instanceof Error ? error.message : "AI APIの呼び出しに失敗しました。";
}

function redact(text: string, secret: string): string {
  if (!secret) return text;
  return text.split(secret).join("[redacted]");
}

async function fetchWithRetry(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  attempts = 2,
  secret = "",
): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (response.status === 429 || response.status >= 500) {
        if (attempt < attempts - 1) {
          const retryAfter = Number(response.headers.get("retry-after") ?? 0);
          const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1200 * (attempt + 1);
          await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 8000)));
          lastError = response;
          continue;
        }
      }
      return response;
    } catch (error) {
      clearTimeout(timer);
      const aborted = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
      if (aborted) {
        throw new AiError("timeout", "AI APIが時間内に応答しませんでした。", { detail: `timeout=${timeoutMs}ms` });
      }
      lastError = error;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 900 * (attempt + 1)));
        continue;
      }
    }
  }
  if (lastError instanceof Response) {
    throw await responseToError(lastError, secret);
  }
  throw new AiError("network", "AI APIに接続できませんでした。", {
    detail: lastError instanceof Error ? lastError.message : String(lastError),
  });
}

async function responseToError(response: Response, secret = ""): Promise<AiError> {
  let detail = "";
  try {
    detail = redact((await response.text()).slice(0, 700), secret);
  } catch {
    detail = response.statusText;
  }
  if (response.status === 401 || response.status === 403) {
    return new AiError("auth", "APIキーが拒否されました。", { status: response.status, detail });
  }
  if (response.status === 404) {
    return new AiError("model", "モデルまたはエンドポイントが見つかりません。", { status: response.status, detail });
  }
  if (response.status === 429) {
    return new AiError("rate_limit", "レート制限に達しました。", { status: response.status, detail });
  }
  return new AiError("http", `AI APIがエラーを返しました (HTTP ${response.status})。`, {
    status: response.status,
    detail,
  });
}

export interface HttpAiClientOptions {
  config: AiConfig;
  /** テストやCLIで fetch を差し替える */
  fetcher?: typeof fetch;
}

export class HttpAiClient implements AiClient {
  readonly model: string;
  readonly fastModel: string;
  readonly judgeModel: string;
  readonly audit: boolean;
  readonly provider: string;
  private config: AiConfig;
  private fetcher: typeof fetch;

  constructor({ config, fetcher }: HttpAiClientOptions) {
    if (!config.configured || !config.apiKey) {
      throw new AiError("not_configured", "AI APIが未設定です。");
    }
    this.config = config;
    this.model = config.model;
    this.fastModel = config.fastModel;
    this.judgeModel = config.judgeModel;
    this.audit = config.audit;
    this.provider = config.provider;
    this.fetcher = fetcher ?? fetch;
  }

  private modelFor(tier: JsonCallOptions<unknown>["tier"]): string {
    if (tier === "judge" || tier === "analysis") return this.config.judgeModel || this.config.model;
    if (tier === "fast") return this.config.fastModel || this.config.model;
    return this.config.model;
  }

  async json<T>(options: JsonCallOptions<T>): Promise<JsonCallResult<T>> {
    const started = Date.now();
    const model = this.modelFor(options.tier);
    const temperature = options.temperature ?? TIER_TEMPERATURE[options.tier ?? "fast"];
    const maxTokens = options.maxTokens ?? TIER_MAX_TOKENS[options.tier ?? "fast"];
    const maxRepairs = options.maxRepairs ?? 2;

    const messages: ChatMessage[] = [
      { role: "system", content: options.system },
      { role: "user", content: options.user },
    ];
    let repairs = 0;
    let lastRaw = "";
    let lastError: string | null = null;
    let usage: AiUsage | undefined;

    for (let attempt = 0; attempt <= maxRepairs; attempt += 1) {
      const { text, usage: attemptUsage } = await this.callModel(messages, {
        model,
        temperature,
        maxTokens,
      });
      lastRaw = text;
      usage = attemptUsage ?? usage;
      let parsed: unknown;
      try {
        parsed = extractJsonObject(text);
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        repairs += 1;
        if (attempt >= maxRepairs) {
          throw new AiError("invalid_json", `${options.label}: JSONを取得できませんでした。`, { detail: lastError });
        }
        messages.push(
          { role: "assistant", content: text.slice(0, 6000) },
          {
            role: "user",
            content: `出力をJSONとして解析できませんでした（${lastError}）。\nJSON以外の文章・コードフェンス・注釈を一切含めず、指定スキーマに厳密に従ったJSONオブジェクトだけを再出力してください。`,
          },
        );
        continue;
      }

      const result = options.schema.safeParse(parsed);
      if (result.success) {
        return {
          data: result.data,
          raw: text,
          model,
          ms: Date.now() - started,
          repairs,
          usage,
        };
      }

      const issues = zodIssues(result.error);
      lastError = issues.join(" / ");
      repairs += 1;
      if (attempt >= maxRepairs) {
        throw new AiError("invalid_schema", `${options.label}: 応答がスキーマに一致しません。`, {
          detail: lastError,
        });
      }
      messages.push(
        { role: "assistant", content: text.slice(0, 6000) },
        {
          role: "user",
          content: `前回のJSONはスキーマ検証に失敗しました。以下の問題をすべて修正し、修正後のJSONオブジェクトのみを出力してください（説明文は不要）。\n${issues
            .map((issue) => `- ${issue}`)
            .join("\n")}`,
        },
      );
    }

    throw new AiError("invalid_schema", `${options.label}: 有効な応答を得られませんでした。`, {
      detail: lastError ?? undefined,
    });
  }

  private async callModel(
    messages: ChatMessage[],
    params: { model: string; temperature: number; maxTokens: number },
  ): Promise<{ text: string; usage?: AiUsage }> {
    if (this.config.provider === "anthropic") {
      return this.callAnthropic(messages, params);
    }
    return this.callOpenAi(messages, params);
  }

  private async callOpenAi(
    messages: ChatMessage[],
    params: { model: string; temperature: number; maxTokens: number },
  ): Promise<{ text: string; usage?: AiUsage }> {
    const url = `${this.config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const body: Record<string, unknown> = {
      model: params.model,
      messages,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      response_format: { type: "json_object" },
    };
    let response = await fetchWithRetry(
      this.fetcher,
      url,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
      },
      this.config.timeoutMs,
      2,
      this.config.apiKey,
    );

    // 互換APIの差異を吸収する（response_format / max_tokens / temperature）
    for (let attempt = 0; attempt < 3 && response.status === 400; attempt += 1) {
      const text = await response.clone().text();
      let changed = false;
      if (/response_format|json_object/i.test(text) && "response_format" in body) {
        delete body.response_format;
        changed = true;
      } else if (/max_tokens/i.test(text) && "max_tokens" in body) {
        body.max_completion_tokens = body.max_tokens;
        delete body.max_tokens;
        changed = true;
      } else if (/temperature/i.test(text) && "temperature" in body) {
        delete body.temperature;
        changed = true;
      }
      if (!changed) break;
      response = await fetchWithRetry(
        this.fetcher,
        url,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(body),
        },
        this.config.timeoutMs,
        2,
        this.config.apiKey,
      );
    }
    if (!response.ok) throw await responseToError(response, this.config.apiKey);
    const data = (await response.json()) as {
      choices?: { message?: { content?: string | { type?: string; text?: string }[] } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const rawContent = data.choices?.[0]?.message?.content;
    const text =
      typeof rawContent === "string"
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent.map((part) => part?.text ?? "").join("")
          : rawContent
            ? JSON.stringify(rawContent)
            : "";
    if (!text.trim()) {
      throw new AiError("invalid_json", "AIが空の応答を返しました。");
    }
    return {
      text,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
      },
    };
  }

  private async callAnthropic(
    messages: ChatMessage[],
    params: { model: string; temperature: number; maxTokens: number },
  ): Promise<{ text: string; usage?: AiUsage }> {
    const base = this.config.baseUrl.replace(/\/+$/, "");
    const url = base.endsWith("/v1") ? `${base}/messages` : `${base}/v1/messages`;
    const system = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");
    const conversation = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({ role: message.role, content: message.content }));
    const response = await fetchWithRetry(
      this.fetcher,
      url,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: params.model,
          system,
          messages: conversation,
          temperature: params.temperature,
          max_tokens: params.maxTokens,
        }),
      },
      this.config.timeoutMs,
      2,
      this.config.apiKey,
    );
    if (!response.ok) throw await responseToError(response, this.config.apiKey);
    const data = (await response.json()) as {
      content?: { type?: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = (data.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");
    if (!text.trim()) throw new AiError("invalid_json", "AIが空の応答を返しました。");
    return {
      text,
      usage: {
        promptTokens: data.usage?.input_tokens,
        completionTokens: data.usage?.output_tokens,
      },
    };
  }
}

export async function createAiClient(config: AiConfig): Promise<AiClient> {
  if (!config.configured) throw new AiError("not_configured", "AI APIが未設定です。");
  return new HttpAiClient({ config });
}
