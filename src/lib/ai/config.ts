/**
 * AI接続設定。
 *
 * ゲーム内に設定画面は無い。APIキーはサーバーの環境変数からのみ読み込み、
 * クライアントへはマスク済みの情報だけを返す。
 */
export type AiProvider = "openai" | "anthropic" | "gemini";

export interface AiConfig {
  configured: boolean;
  provider: AiProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  fastModel: string;
  judgeModel: string;
  audit: boolean;
  timeoutMs: number;
  source: "env" | "none";
  warning: string | null;
}

export interface PublicAiConfig {
  configured: boolean;
  source: AiConfig["source"];
  provider: AiProvider;
  baseHost: string;
  model: string;
  fastModel: string;
  judgeModel: string;
  audit: boolean;
  maskedKey: string;
  warning: string | null;
  envLocked: boolean;
}

const DEFAULT_MODEL = "gpt-4.1";
const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";
const DEFAULT_BASE = "https://api.openai.com/v1";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

interface EnvSettings {
  provider: AiProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  fastModel: string;
  judgeModel: string;
  audit: boolean;
}

function normalizeBaseUrl(url: string, provider: AiProvider): string {
  let trimmed = url.trim().replace(/\/+$/, "");
  if (provider === "gemini") {
    // Gemini はネイティブ API（x-goog-api-key）を使う。旧設定の /openai は取り除く。
    trimmed = trimmed.replace(/\/openai$/, "");
    return trimmed || GEMINI_BASE;
  }
  if (!trimmed) {
    return provider === "openai" ? DEFAULT_BASE : "https://api.anthropic.com";
  }
  return trimmed;
}

function envSettings(): { settings: EnvSettings | null; warning: string | null } {
  const providerEnv = (process.env.AI_PROVIDER ?? "").toLowerCase();
  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? "";
  const geminiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
  const openaiKey = process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.AI_GATEWAY_API_KEY ?? "";
  const provider: AiProvider =
    providerEnv === "anthropic" || providerEnv === "claude"
      ? "anthropic"
      : providerEnv === "gemini" || providerEnv === "google"
        ? "gemini"
        : providerEnv === "openai" || providerEnv === "openai-compatible"
          ? "openai"
          : geminiKey && !openaiKey && !anthropicKey
            ? "gemini"
            : anthropicKey && !openaiKey && !geminiKey
              ? "anthropic"
              : "openai";
  const apiKey =
    provider === "gemini"
      ? geminiKey || openaiKey
      : provider === "anthropic"
        ? anthropicKey || openaiKey
        : openaiKey || geminiKey || anthropicKey;
  if (!apiKey) return { settings: null, warning: null };
  const model =
    process.env.AI_MODEL?.trim() ||
    (provider === "gemini"
      ? process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL
      : provider === "anthropic"
        ? "claude-sonnet-4-5"
        : DEFAULT_MODEL);
  const rawBase = process.env.AI_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "";
  let warning: string | null = null;
  if (provider === "anthropic" && rawBase && /openai\.com|generativelanguage/.test(rawBase)) {
    warning = "AI_BASE_URL が別プロバイダ向けのままです。Anthropic 利用時は未設定にするか Anthropic のURLを指定してください。";
  }
  if (provider === "gemini" && rawBase && /openai\.com|anthropic\.com/.test(rawBase)) {
    warning = "AI_BASE_URL が別プロバイダ向けのままです。Gemini 利用時は未設定にするか Gemini のネイティブURLを指定してください。";
  }
  return {
    settings: {
      provider,
      apiKey,
      baseUrl: normalizeBaseUrl(rawBase, provider),
      model,
      fastModel: process.env.AI_FAST_MODEL?.trim() || model,
      judgeModel: process.env.AI_JUDGE_MODEL?.trim() || model,
      audit: (process.env.AI_AUDIT ?? "on").toLowerCase() !== "off",
    },
    warning,
  };
}

function envConfigured(): boolean {
  return Boolean(
    process.env.AI_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.AI_GATEWAY_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY,
  );
}

export async function resolveAiConfig(): Promise<AiConfig> {
  const env = envSettings();
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS ?? 120000);
  if (!env.settings) {
    return {
      configured: false,
      provider: "openai",
      apiKey: "",
      baseUrl: DEFAULT_BASE,
      model: DEFAULT_MODEL,
      fastModel: DEFAULT_MODEL,
      judgeModel: DEFAULT_MODEL,
      audit: true,
      timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 120000,
      source: "none",
      warning: env.warning,
    };
  }
  const active = env.settings;
  return {
    configured: true,
    provider: active.provider,
    apiKey: active.apiKey,
    baseUrl: normalizeBaseUrl(active.baseUrl, active.provider),
    model: active.model || DEFAULT_MODEL,
    fastModel: active.fastModel || active.model || DEFAULT_MODEL,
    judgeModel: active.judgeModel || active.model || DEFAULT_MODEL,
    audit: active.audit !== false,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 5000 ? timeoutMs : 120000,
    source: "env",
    warning: env.warning,
  };
}

export function toPublicConfig(config: AiConfig): PublicAiConfig {
  let baseHost = "";
  try {
    baseHost = new URL(config.baseUrl).host;
  } catch {
    baseHost = config.baseUrl.slice(0, 60);
  }
  return {
    configured: config.configured,
    source: config.source,
    provider: config.provider,
    baseHost,
    model: config.model,
    fastModel: config.fastModel,
    judgeModel: config.judgeModel,
    audit: config.audit,
    maskedKey: config.configured ? "••••" : "",
    warning: config.warning,
    envLocked: envConfigured(),
  };
}

export { DEFAULT_MODEL, DEFAULT_GEMINI_MODEL, GEMINI_BASE };
