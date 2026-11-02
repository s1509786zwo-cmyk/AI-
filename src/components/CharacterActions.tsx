"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CharacterActions({
  characterId,
  characterName,
  hasAnalysis,
}: {
  characterId: string;
  characterName: string;
  hasAnalysis: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"" | "analyze" | "copy" | "delete">("");
  const [error, setError] = useState("");

  const analyze = async () => {
    setBusy("analyze");
    setError("");
    try {
      const res = await fetch(`/api/characters/${characterId}/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "AI解析に失敗しました。");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI解析に失敗しました。");
    } finally {
      setBusy("");
    }
  };

  const duplicate = async () => {
    setBusy("copy");
    setError("");
    try {
      const res = await fetch(`/api/characters/${characterId}/duplicate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "複製に失敗しました。");
      router.push(`/characters/${data.character.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "複製に失敗しました。");
      setBusy("");
    }
  };

  const remove = async () => {
    if (!window.confirm(`「${characterName}」を削除します。よろしいですか？`)) return;
    setBusy("delete");
    setError("");
    try {
      const res = await fetch(`/api/characters/${characterId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "削除に失敗しました。");
      router.push("/characters");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました。");
      setBusy("");
    }
  };

  return (
    <div className="stack-sm" style={{ alignItems: "flex-end" }}>
      <div className="btn-row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-sm" onClick={analyze} disabled={busy !== ""}>
          {busy === "analyze" ? (
            <>
              <span className="spinner" /> 解析中…
            </>
          ) : hasAnalysis ? (
            "再解析"
          ) : (
            "AI解析を実行"
          )}
        </button>
        <button type="button" className="btn btn-sm" onClick={duplicate} disabled={busy !== ""}>
          {busy === "copy" ? "複製中…" : "複製"}
        </button>
        <button type="button" className="btn btn-danger btn-sm" onClick={remove} disabled={busy !== ""}>
          {busy === "delete" ? "削除中…" : "削除"}
        </button>
      </div>
      {error && <div className="inline-error" style={{ maxWidth: 420 }}>{error}</div>}
    </div>
  );
}
