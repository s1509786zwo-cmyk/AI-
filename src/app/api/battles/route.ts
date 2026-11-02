import { NextRequest, NextResponse } from "next/server";
import { aiErrorResponse, errorResponse, requireAi } from "@/lib/api";
import { battleCreateSchema, createBattleFromCharacters, listBattles } from "@/lib/service/battles";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  try {
    return NextResponse.json({ battles: await listBattles() });
  } catch (error) {
    console.error(error);
    return errorResponse("対戦履歴の取得に失敗しました。", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = battleCreateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message ?? "入力内容を確認してください。", 400, "INVALID_INPUT");
    }
    const { client } = await requireAi();
    const battle = await createBattleFromCharacters({ ...parsed.data, ai: client });
    return NextResponse.json({ battle }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /キャラクター|対戦/.test(error.message)) {
      return errorResponse(error.message, 400);
    }
    return aiErrorResponse(error);
  }
}
