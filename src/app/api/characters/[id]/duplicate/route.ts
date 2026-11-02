import { NextResponse } from "next/server";
import { getCharacter, saveCharacter } from "@/lib/service/characters";
import { errorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const source = await getCharacter(id);
    if (!source) return errorResponse("キャラクターが見つかりません。", 404);
    const now = new Date().toISOString();
    const baseName = source.name.replace(/（複製\d*）$/, "");
    const copyName = `${baseName}（複製）`.slice(0, 60);
    const copy = {
      ...source,
      id: crypto.randomUUID(),
      name: copyName,
      createdAt: now,
      updatedAt: now,
      analysis: null,
      analysisHash: null,
      analysisModel: null,
      analyzedAt: null,
      analysisError: null,
    };
    await saveCharacter(copy);
    return NextResponse.json({ character: copy }, { status: 201 });
  } catch (error) {
    console.error(error);
    return errorResponse("複製に失敗しました。", 500);
  }
}
