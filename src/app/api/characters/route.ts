import { NextRequest, NextResponse } from "next/server";
import { characterInputSchema, listCharacters, newCharacter, saveCharacter } from "@/lib/service/characters";
import { errorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const characters = await listCharacters();
    return NextResponse.json({ characters });
  } catch (error) {
    console.error(error);
    return errorResponse("キャラクター一覧の取得に失敗しました。", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = characterInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message ?? "入力内容を確認してください。", 400, "INVALID_INPUT");
    }
    const character = newCharacter(parsed.data);
    await saveCharacter(character);
    return NextResponse.json({ character }, { status: 201 });
  } catch (error) {
    console.error(error);
    return errorResponse("キャラクターの保存に失敗しました。", 500);
  }
}
