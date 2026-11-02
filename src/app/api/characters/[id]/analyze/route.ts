import { NextRequest, NextResponse } from "next/server";
import { aiErrorResponse, isAiNotConfigured, requireAi } from "@/lib/api";
import { analyzeCharacter, analysisHash, needsAnalysis } from "@/lib/engine/analysis";
import { getCharacter, saveCharacter } from "@/lib/service/characters";
import { errorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const character = await getCharacter(id);
  if (!character) return errorResponse("キャラクターが見つかりません。", 404);
  const body = await req.json().catch(() => ({}));
  const force = Boolean(body?.force);
  if (!force && !needsAnalysis(character)) {
    return NextResponse.json({ character, cached: true });
  }
  try {
    const { client } = await requireAi();
    const started = Date.now();
    const { analysis, model } = await analyzeCharacter(client, character);
    const updated = {
      ...character,
      analysis,
      analysisHash: analysisHash(character),
      analysisModel: model,
      analysisError: null,
      analyzedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveCharacter(updated);
    return NextResponse.json({ character: updated, ms: Date.now() - started });
  } catch (error) {
    if (!isAiNotConfigured(error)) {
      const message = error instanceof Error ? error.message : String(error);
      await saveCharacter({
        ...character,
        analysisError: message.slice(0, 500),
        updatedAt: new Date().toISOString(),
      });
    }
    return aiErrorResponse(error);
  }
}
