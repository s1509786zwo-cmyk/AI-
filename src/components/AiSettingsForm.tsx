"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AiProvider } from "@/lib/ai/config";

export interface PublicSettings {
  configured: boolean;
  source: "env" | "settings" | "none";
  provider: AiProvider;
  baseUrl: string;
  baseHost: string;
  model: string;
  fastModel: string;
  judgeModel: string;
  audit: boolean;
  maskedKey: string;
  envLocked: boolean;
  warning: string | null;
}

type TestState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; model: string; ms: number; note: string }
  | { kind: "error"; message: string };

export function AiSettingsForm({ initial }: { initial: PublicSettings }) {
  const router = useRouter();
  const [provider, setProvider] = useState<AiProvider>(initial.provider);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [model, setModel] = useState(initial.model);
  const [judgeModel, setJudgeModel] = useState(initial.judgeModel);
  const [fastModel, setFastModel] = useState(initial.fastModel);
  const [audit, setAudit] = useState(initial.audit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [test, setTest] = useState<TestState>({ kind: "idle" });

  const save = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/ai/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey,
          baseUrl,
          model,
          judgeModel,
          fastModel,
          audit,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "設定の保存に失敗しました。");
      setNotice(
        data.warning ??
          (data.ai?.configured
            ? `設定を保存しました（${data.ai.provider} / ${data.ai.model}）。`
            : "設定を保存しましたが、まだ接続が確認できていません。"),
      );
      setApiKey("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "設定の保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTest({ kind: "running" });
    try {
      const res = await fetch("/api/ai/test", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTest({ kind: "error", message: data.error ?? "接続テストに失敗しました。" });
        return;
      }
      setTest({ kind: "ok", model: data.model, ms: data.ms, note: data.note ?? "" });
      router.refresh();
    } catch (e) {
      setTest({ kind: "error", message: e instanceof Error ? e.message : "接続テストに失敗しました。" });
    }
  };

  const clear = async () => {
    if (!window.confirm("画面から保存したAI設定を削除します。よろしいですか？")) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/ai/settings", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "設定の削除に失敗しました。");
      setApiKey("");
      setNotice("保存した設定を削除しました。");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "設定の削除に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  const providerHint =
    provider === "gemini"
      ? "Google Gemini のOpenAI互換API。ベースURLは通常 https://generativelanguage.googleapis.com/v1beta/openai のまま。"
      : provider === "anthropic"
        ? "Anthropic Messages API。ベースURLは通常 https://api.anthropic.com のまま。"
        : "OpenAI Chat Completions 互換API。OpenAI / OpenRouter / Groq / vLLM / LM Studio など。";

  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-head">
          <h3>接続設定</h3>
          <span className="panel-label">Server-side only</span>
        </div>

        <div className="form">
          <div className="field-row">
            <div className="field">
              <label htmlFor="provider">プロバイダ</label>
              <select
                id="provider"
                className="select"
                value={provider}
                onChange={(event) => {
                  const next = event.target.value as AiProvider;
                  setProvider(next);
                  if (!apiKey) {
                    setBaseUrl(
                      next === "gemini"
                        ? "https://generativelanguage.googleapis.com/v1beta/openai"
                        : next === "anthropic"
                          ? "https://api.anthropic.com"
                          : "https://api.openai.com/v1",
                    );
                  }
                }}
              >
                <option value="openai">OpenAI / OpenAI互換</option>
                <option value="gemini">Google Gemini</option>
                <option value="anthropic">Anthropic</option>
              </select>
              <p className="hint">{providerHint}</p>
            </div>
            <div className="field">
              <label htmlFor="apiKey">
                APIキー
                {initial.configured && initial.source === "settings" && (
                  <span className="counter">保存済み: {initial.maskedKey}</span>
                )}
              </label>
              <input
                id="apiKey"
                className="input"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={initial.configured ? "変更しない場合は空欄" : "sk-..."}
              />
              <p className="hint">ブラウザへ返送されることはありません。サーバー側で暗号化して保存します。</p>
            </div>
          </div>

          <div className="field">
            <label htmlFor="baseUrl">ベースURL</label>
            <input
              id="baseUrl"
              className="input"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder={
                provider === "gemini"
                  ? "https://generativelanguage.googleapis.com/v1beta/openai"
                  : provider === "anthropic"
                    ? "https://api.anthropic.com"
                    : "https://api.openai.com/v1"
              }
            />
            <p className="hint">互換APIを利用する場合のみ変更します。OpenAI系は末尾の /v1 まで含めてください。</p>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="model">モデル（描写・行動選択）</label>
              <input id="model" className="input" value={model} onChange={(event) => setModel(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="judgeModel">モデル（審判・能力解析）</label>
              <input
                id="judgeModel"
                className="input"
                value={judgeModel}
                onChange={(event) => setJudgeModel(event.target.value)}
              />
              <p className="hint">未入力なら上のモデルを使用します。</p>
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="fastModel">モデル（軽量タスク）</label>
              <input
                id="fastModel"
                className="input"
                value={fastModel}
                onChange={(event) => setFastModel(event.target.value)}
              />
              <p className="hint">未入力ならメインモデルを使用します。</p>
            </div>
            <div className="field">
              <label htmlFor="audit">整合性監査</label>
              <select
                id="audit"
                className="select"
                value={audit ? "on" : "off"}
                onChange={(event) => setAudit(event.target.value === "on")}
              >
                <option value="on">有効（推奨）</option>
                <option value="off">無効（高速化）</option>
              </select>
              <p className="hint">描写と裁定の矛盾を検出し、必要なら修正します。ラウンドあたり1回の追加入力。</p>
            </div>
          </div>
        </div>

        {initial.warning && <div className="inline-ok">{initial.warning}</div>}
        {initial.envLocked && (
          <div className="inline-ok">
            環境変数にAPIキーが設定されています。環境変数が画面からの設定より優先されます。
          </div>
        )}
        {error && <div className="inline-error">{error}</div>}
        {notice && <div className="inline-ok">{notice}</div>}

        <div className="divider" />
        <div className="spread">
          <div className="status-line">
            {test.kind === "running" && (
              <>
                <span className="spinner" /> 実際のAIに接続しています…
              </>
            )}
            {test.kind === "ok" && (
              <>
                <span className="dot ok" /> 接続成功: {test.model} / {test.ms}ms / {test.note}
              </>
            )}
            {test.kind === "error" && (
              <>
                <span className="dot err" /> {test.message}
              </>
            )}
            {test.kind === "idle" && <span className="muted small">設定後、実際のモデルで疎通確認できます。</span>}
          </div>
          <div className="btn-row">
            <button type="button" className="btn" onClick={runTest} disabled={saving || test.kind === "running"}>
              接続テスト
            </button>
            <button type="button" className="btn" onClick={clear} disabled={saving || !initial.source || initial.source === "env"}>
              保存設定を削除
            </button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? "保存中…" : "設定を保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
