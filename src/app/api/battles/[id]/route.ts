import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { deleteBattle, getBattle } from "@/lib/service/battles";
import { isLocked } from "@/lib/engine/lock";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const battle = await getBattle(id);
  if (!battle) return errorResponse("対戦記録が見つかりません。", 404);
  return NextResponse.json({ battle, resolving: isLocked(id) });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    if (isLocked(id)) return errorResponse("対戦の進行中は削除できません。", 409);
    const battle = await getBattle(id);
    if (!battle) return errorResponse("対戦記録が見つかりません。", 404);
    await deleteBattle(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return errorResponse("対戦記録の削除に失敗しました。", 500);
  }
}
