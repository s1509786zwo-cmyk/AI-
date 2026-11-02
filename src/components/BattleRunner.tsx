"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

interface PhaseLine {
  phase: string;
  message: string;
  state: "active" | "done";
}

interface DonePayload {
  type: "done";
  turnIndex: number;
  status: string;
  audit?: { consistent: boolean; issues: string[]; repaired: boolean };
}

export function BattleRunner({
  battleId,
  active,
  initialError,
  round,
}: {
  battleId: string;
  active: boolean;
  initialError: string | null;
  round: number;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<PhaseLine[]>([]);
  const [error, setError] = useState(initialError ?? "");
  const [warnings, setWarnings] = useState<string[]>([]);
  const finishedRef = useRef(false);

  const pushPhase = useCallback((message: string) => {
    setLines((prev) => {
      const next = prev.map((line) => (line.state === "active" ? { ...line, state: "done" as const } : line));
      return [...next, { phase: "phase", message, state: "active" }];
    });
  }, []);

  const start = async () => {
    if (running || !active) return;
    setRunning(true);
    setError("");
    setWarnings([]);
    setLines([]);
    finishedRef.current = false;
    try {
      const res = await fetch(`/api/battles/${battleId}/turn`, {
        method: "POST",
        headers: { accept: "text/event-stream" },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "ラウンドの開始に失敗しました。");
      }
      if (!res.body) throw new Error("ストリームを受信できませんでした。");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let doneReceived = false;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const chunk = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const dataLine = chunk.split("\n").find((line) => line.startsWith("data:"));
          if (dataLine) {
            const payload = JSON.parse(dataLine.slice(5).trim()) as
              | { type: "phase"; message: string }
              | DonePayload
              | { type: "error"; message: string; detail?: string };
            if (payload.type === "phase") {
              pushPhase(payload.message);
            } else if (payload.type === "done") {
              doneReceived = true;
              finishedRef.current = true;
              setLines((prev) => prev.map((line) => ({ ...line, state: "done" as const })));
              const audit = payload.audit;
              const notices: string[] = [];
              if (audit && !audit.consistent) notices.push("整合性監査で確認事項が残りました。判断根拠を確認してください。");
              else if (audit?.repaired) notices.push("描写の整合性を監査し、矛盾箇所を修正しました。");
              setWarnings(notices);
              router.refresh();
              setTimeout(() => {
                document.getElementById("latest-turn")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }, 700);
            } else if (payload.type === "error") {
              setError(payload.message);
              setLines((prev) => prev.map((line) => ({ ...line, state: "done" as const })));
            }
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
      if (!doneReceived && !finishedRef.current) {
        setError((prev) => prev || "接続が終了しました。結果が保存されているか、このページを再読み込みして確認してください。");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "ラウンドの開始に失敗しました。");
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="round-control">
      <div className="round-control-head">
        <div>
          <div className="panel-label">Round control</div>
          <h2>{active ? `第${round}ラウンドを開始` : "この対戦は終了しています"}</h2>
        </div>
        <div className="btn-row">
          {active ? (
            <button type="button" className="btn btn-primary btn-lg" onClick={start} disabled={running}>
              {running ? (
                <>
                  <span className="spinner" /> AI審判が裁定中…
                </>
              ) : (
                "次のラウンドへ"
              )}
            </button>
          ) : (
            <a href="#outcome" className="btn btn-lg">
              判決を見る
            </a>
          )}
        </div>
      </div>

      {active && (
        <p className="small muted" style={{ marginTop: 8 }}>
          行動選択（2回）→ 裁定 → 状態適用 → 描写 → 整合性監査 の順に実行します。1ラウンドあたり30〜90秒ほどかかります。
        </p>
      )}

      {lines.length > 0 && (
        <div className="phase-list" aria-live="polite">
          {lines.map((line, index) => (
            <div className={`phase ${line.state}`} key={`${index}-${line.message}`}>
              <span className="phase-dot" />
              {line.message}
            </div>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="inline-ok">{warnings.join(" / ")}</div>
      )}

      {error && (
        <div className="inline-error" role="alert">
          {error}
          {active && (
            <div className="mt-sm">
              <button type="button" className="btn btn-sm" onClick={start} disabled={running}>
                再試行
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
