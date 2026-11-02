import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getStore } from "@/lib/store";

export type AiProvider = "openai" | "anthropic" | "gemini";

export interface StoredAiSettings {
  provider: AiProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  fastModel: string;
  judgeModel: string;
  audit: boolean;
  updatedAt: string;
}

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
  source: "env" | "settings" | "none";
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
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_BASE = "https://api.openai.com/v1";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
const SETTINGS_KEY = "ai.settings.v1";

const globalForSecret = globalThis as typeof globalThis & { __abSecret?: string; __abSettings?: StoredAiSettings | null };

async function loadSecret(): Promise<string> {
  if (process.env.SETTINGS_SECRET && process.env.SETTINGS_SECRET.length >= 8) {
    return process.env.SETTINGS_SECRET;
  }
  if (globalForSecret.__abSecret) return globalForSecret.__abSecret;
  const dir = process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
  const file = path.join(dir, "secret");
  await mkdir(dir, { recursive: true });
  try {
    const existing = (await readFile(file, "utf8")).trim();
    if (existing.length >= 16) {
      globalForSecret.__abSecret = existing;
      return existing;
    }
  } catch {
    /* create below */
  }
  const generated = randomBytes(32).toString("hex");
  await writeFile(file, generated, { encoding: "utf8", mode: 0o600 });
  globalForSecret.__abSecret = generated;
  return generated;
}

function keyFromSecret(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export async function encryptSettings(settings: StoredAiSettings): Promise<string> {
  const secret = await loadSecret();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  const plaintext = JSON.stringify(settings);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export async function decryptSettings(payload: string): Promise<StoredAiSettings | null> {
  try {
    if (!payload.startsWith("v1.")) return null;
    const [, ivB64, tagB64, dataB64] = payload.split(".");
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const secret = await loadSecret();
    const decipher = createDecipheriv("aes-256-gcm", keyFromSecret(secret), Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(decrypted) as StoredAiSettings;
    if (!parsed || typeof parsed !== "object" || typeof parsed.apiKey !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function readStoredSettings(): Promise<StoredAiSettings | null> {
  if (globalForSecret.__abSettings !== undefined) return globalForSecret.__abSettings;
  const raw = await getStore().getSetting(SETTINGS_KEY);
  if (!raw) {
    globalForSecret.__abSettings = null;
    return null;
  }
  const decoded = await decryptSettings(raw);
  globalForSecret.__abSettings = decoded;
  return decoded;
}

export async function writeStoredSettings(settings: StoredAiSettings | null): Promise<void> {
  globalForSecret.__abSettings = settings;
  await getStore().setSetting(SETTINGS_KEY, settings ? await encryptSettings(settings) : "");
}

function normalizeBaseUrl(url: string, provider: AiProvider): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) {
    if (provider === "gemini") return GEMINI_BASE;
    return provider === "openai" ? DEFAULT_BASE : "https://api.anthropic.com";
  }
  return trimmed;
}

function envSettings(): { settings: StoredAiSettings | null; warning: string | null } {
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
    warning = "AI_BASE_URL が別プロバイダ向けのままです。Gemini 利用時は未設定にするか Gemini の互換URLを指定してください。";
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
      updatedAt: new Date().toISOString(),
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
  const stored = await readStoredSettings();
  const active = env.settings ?? stored;
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS ?? 120000);
  if (!active) {
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
    source: env.settings ? "env" : "settings",
    warning: env.warning,
  };
}

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
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
    maskedKey: config.source === "env" ? "••••" : maskKey(config.apiKey),
    warning: config.warning,
    envLocked: envConfigured(),
  };
}

/** 環境変数が設定されていれば、UIからの保存設定より優先される */
export function envKeyPresent(): boolean {
  return envConfigured();
}

export function resetSettingsCache(): void {
  globalForSecret.__abSettings = undefined;
}

export { DEFAULT_MODEL, DEFAULT_GEMINI_MODEL, GEMINI_BASE, SETTINGS_KEY };
