import { NextResponse } from "next/server";
import { aiErrorResponse, requireAi } from "@/lib/api";
import { connectionProbeSchema } from "@/lib/engine/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  try {
    const { client, config } = await requireAi();
    const started = Date.now();
    const result = await client.json({
      system:
        "あなたは接続診断用の応答器である。指定されたJSONだけを返す。余計な説明は禁止。" +
        "出力は {\"ok\": true, \"model\": \"実際のモデル名\", \"note\": \"短い日本語の挨拶\"} の形式に厳密に従うこと。",
      user: "接続テストです。JSONのみで応答してください。",
      schema: connectionProbeSchema,
      label: "接続テスト",
      tier: "fast",
      temperature: 0,
      maxTokens: 300,
      maxRepairs: 1,
    });
    return NextResponse.json({
      ok: true,
      model: result.model,
      provider: config.provider,
      ms: Date.now() - started,
      note: result.data.note,
      repairs: result.repairs,
    });
  } catch (error) {
    return aiErrorResponse(error);
  }
}
