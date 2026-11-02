"use client";

import { useState } from "react";

type State =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; model: string; ms: number; note: string }
  | { kind: "error"; message: string; code?: string; detail?: string };

export function AiDiagnosticButton() {
  const [state, setState] = useState<State>({ kind: "idle" });

  const run = async () => {
    setState({ kind: "running" });
    try {
      const res = await fetch("/api/ai/test", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        model?: string;
        ms?: number;
        note?: string;
        error?: string;
        code?: string;
        detail?: string;
      };
      if (!res.ok || !data.ok) {
        setState({
          kind: "error",
          message: data.error ?? "接続テストに失敗しました。",
          code: data.code,
          detail: data.detail,
        });
        return;
      }
      setState({ kind: "ok", model: data.model ?? "", ms: data.ms ?? 0, note: data.note ?? "" });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "接続テストに失敗しました。",
      });
    }
  };

  return (
    <div className="stack" style={{ marginTop: 16 }}>
      <div>
        <button type="button" className="btn" onClick={run} disabled={state.kind === "running"}>
          {state.kind === "running" ? (
            <>
              <span className="spinner" /> 診断中…
            </>
          ) : (
            "接続診断を実行"
          )}
        </button>
      </div>
      {state.kind === "ok" && (
        <div className="banner banner-ok">
          <div>
            <div className="banner-title">接続OK</div>
            <p>
              {state.model} / {state.ms}ms{state.note ? ` / ${state.note}` : ""}
            </p>
          </div>
        </div>
      )}
      {state.kind === "error" && (
        <div className="banner banner-danger">
          <div>
            <div className="banner-title">接続できませんでした</div>
            <p>
              {state.message}
              {state.code ? `（${state.code}）` : ""}
              {state.detail && <span className="dim"> — {state.detail}</span>}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
