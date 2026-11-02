import { NextResponse } from "next/server";
import { AiError, describeAiError } from "@/lib/ai/client";
import { createAiClient, type AiClient } from "@/lib/ai/client";
import { resolveAiConfig } from "@/lib/ai/config";

export function errorResponse(message: string, status = 400, code?: string, detail?: string): NextResponse {
  return NextResponse.json({ error: message, code, detail }, { status });
}

export function aiErrorResponse(error: unknown): NextResponse {
  if (error instanceof AiError) {
    const status = error.code === "not_configured" ? 503 : error.code === "auth" ? 502 : 502;
    return errorResponse(describeAiError(error), status, error.code.toUpperCase(), error.detail);
  }
  console.error("[api]", error);
  return errorResponse("サーバー内部エラーが発生しました。", 500);
}

export async function requireAi(): Promise<{ client: AiClient; config: Awaited<ReturnType<typeof resolveAiConfig>> }> {
  const config = await resolveAiConfig();
  if (!config.configured) {
    throw new AiError("not_configured", "AI APIが未設定です。");
  }
  const client = await createAiClient(config);
  return { client, config };
}

export function isAiNotConfigured(error: unknown): boolean {
  return error instanceof AiError && error.code === "not_configured";
}
