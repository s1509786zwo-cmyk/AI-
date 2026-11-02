import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import {
  envKeyPresent,
  readStoredSettings,
  resetSettingsCache,
  resolveAiConfig,
  toPublicConfig,
  writeStoredSettings,
} from "@/lib/ai/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const settingsSchema = z.object({
  provider: z.enum(["openai", "gemini", "anthropic"]).default("openai"),
  apiKey: z.string().trim().max(400).optional().default(""),
  baseUrl: z
    .string()
    .trim()
    .max(400)
    .optional()
    .default("")
    .refine((value) => !value || /^https?:\/\//i.test(value), "ベースURLは http(s):// で始めてください"),
  model: z.string().trim().min(1, "モデル名を入力してください").max(160),
  fastModel: z.string().trim().max(160).optional().default(""),
  judgeModel: z.string().trim().max(160).optional().default(""),
  audit: z.boolean().default(true),
});

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message ?? "設定内容を確認してください。", 400, "INVALID_SETTINGS");
    }
    const existing = await readStoredSettings();
    const apiKey = parsed.data.apiKey || existing?.apiKey || "";
    if (!apiKey) {
      return errorResponse("APIキーを入力してください。", 400, "MISSING_KEY");
    }
    await writeStoredSettings({
      provider: parsed.data.provider,
      apiKey,
      baseUrl: parsed.data.baseUrl,
      model: parsed.data.model,
      fastModel: parsed.data.fastModel || parsed.data.model,
      judgeModel: parsed.data.judgeModel || parsed.data.model,
      audit: parsed.data.audit,
      updatedAt: new Date().toISOString(),
    });
    resetSettingsCache();
    const config = await resolveAiConfig();
    return NextResponse.json({
      ai: toPublicConfig(config),
      warning: envKeyPresent()
        ? "サーバーの環境変数にAPIキーが設定されているため、保存した設定より環境変数が優先されます。"
        : null,
    });
  } catch (error) {
    console.error(error);
    return errorResponse("AI設定の保存に失敗しました。", 500);
  }
}

export async function DELETE() {
  try {
    await writeStoredSettings(null);
    resetSettingsCache();
    const config = await resolveAiConfig();
    return NextResponse.json({ ai: toPublicConfig(config) });
  } catch (error) {
    console.error(error);
    return errorResponse("AI設定の削除に失敗しました。", 500);
  }
}
