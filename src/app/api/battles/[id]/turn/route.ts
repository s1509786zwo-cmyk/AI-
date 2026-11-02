import { NextRequest, NextResponse } from "next/server";
import { AiError, describeAiError } from "@/lib/ai/client";
import { aiErrorResponse, requireAi } from "@/lib/api";
import { getBattle, saveBattle } from "@/lib/service/battles";
import { resolveTurn } from "@/lib/engine/turn";
import { isLocked, tryLock, unlock } from "@/lib/engine/lock";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const initial = await getBattle(id);
  if (!initial) return NextResponse.json({ error: "対戦記録が見つかりません。" }, { status: 404 });
  if (initial.status !== "active") {
    return NextResponse.json({ error: "この対戦はすでに終了しています。", code: "FINISHED" }, { status: 409 });
  }
  let client;
  try {
    ({ client } = await requireAi());
  } catch (error) {
    return aiErrorResponse(error);
  }
  if (!tryLock(id)) {
    return NextResponse.json(
      { error: "この対戦はすでに進行中です。完了までお待ちください。", code: "BUSY" },
      { status: 409 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          closed = true;
        }
      }, 10000);

      try {
        const fresh = await getBattle(id);
        if (!fresh) throw new Error("対戦記録が見つかりません。");
        if (fresh.status !== "active") throw new Error("この対戦はすでに終了しています。");
        const result = await resolveTurn({
          battle: fresh,
          ai: client,
          onPhase: (phase) => send({ type: "phase", ...phase }),
        });
        await saveBattle(result.battle);
        send({
          type: "done",
          turnIndex: result.turn.index,
          status: result.battle.status,
          outcome: result.battle.outcome,
          audit: result.turn.audit,
        });
      } catch (error) {
        const message =
          error instanceof AiError || error instanceof Error
            ? describeAiError(error)
            : "ラウンドの解決に失敗しました。";
        try {
          const current = await getBattle(id);
          if (current) {
            await saveBattle({ ...current, error: message, updatedAt: new Date().toISOString() });
          }
        } catch {
          /* 保存失敗は無視してクライアントへ通知 */
        }
        send({
          type: "error",
          message,
          detail: error instanceof Error ? error.message : String(error),
          code: error instanceof AiError ? error.code : "TURN_FAILED",
        });
      } finally {
        clearInterval(heartbeat);
        closed = true;
        unlock(id);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return NextResponse.json({ resolving: isLocked(id) });
}
