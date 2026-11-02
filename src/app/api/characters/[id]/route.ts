import { NextRequest, NextResponse } from "next/server";
import { deleteCharacter, getCharacter, saveCharacter } from "@/lib/service/characters";
import { characterInputSchema } from "@/lib/service/characters";
import { errorResponse } from "@/lib/api";
import { analysisHash } from "@/lib/engine/analysis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const character = await getCharacter(id);
  if (!character) return errorResponse("キャラクターが見つかりません。", 404);
  return NextResponse.json({ character });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const current = await getCharacter(id);
    if (!current) return errorResponse("キャラクターが見つかりません。", 404);
    const body = await req.json().catch(() => null);
    const parsed = characterInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message ?? "入力内容を確認してください。", 400, "INVALID_INPUT");
    }
    const changed = analysisHash(parsed.data) !== current.analysisHash;
    const updated = {
      ...current,
      ...parsed.data,
      updatedAt: new Date().toISOString(),
      analysis: changed ? null : current.analysis,
      analysisHash: changed ? null : current.analysisHash,
      analysisError: null,
      analyzedAt: changed ? null : current.analyzedAt,
    };
    await saveCharacter(updated);
    return NextResponse.json({ character: updated, needsAnalysis: changed });
  } catch (error) {
    console.error(error);
    return errorResponse("キャラクターの更新に失敗しました。", 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const current = await getCharacter(id);
    if (!current) return errorResponse("キャラクターが見つかりません。", 404);
    await deleteCharacter(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return errorResponse("キャラクターの削除に失敗しました。", 500);
  }
}
