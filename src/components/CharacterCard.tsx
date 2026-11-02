"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Character } from "@/lib/engine/types";

export function CharacterCard({ character }: { character: Character }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"" | "copy" | "delete">("");
  const [error, setError] = useState("");

  const duplicate = async () => {
    setBusy("copy");
    setError("");
    try {
      const res = await fetch(`/api/characters/${character.id}/duplicate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "複製に失敗しました。");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "複製に失敗しました。");
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    if (!window.confirm(`「${character.name}」を削除します。よろしいですか？\n対戦履歴は残ります。`)) return;
    setBusy("delete");
    setError("");
    try {
      const res = await fetch(`/api/characters/${character.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "削除に失敗しました。");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました。");
      setBusy("");
    }
  };

  const analyzed = Boolean(character.analysis);
  return (
    <article className="card char-card">
      <div className="char-card-top">
        <div>
          <Link href={`/characters/${character.id}`} className="char-name">
            {character.name}
          </Link>
          <div className="tag-row mt-sm">
            <span className={`tag ${analyzed ? "tag-ok" : character.analysisError ? "tag-danger" : ""}`}>
              {analyzed ? "AI解析済み" : character.analysisError ? "解析エラー" : "未解析"}
            </span>
            {analyzed && character.analysis?.abilities.slice(0, 2).map((ability) => (
              <span className="tag" key={ability.id}>
                {ability.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="char-ability">{character.abilityText}</p>
      {character.personality && <p className="char-personality">性格: {character.personality}</p>}
      {character.weakness && <p className="char-personality">弱点: {character.weakness}</p>}
      {error && <div className="inline-error">{error}</div>}

      <div className="char-card-foot">
        <div className="char-actions">
          <Link href={`/characters/${character.id}/edit`} className="btn btn-ghost btn-sm">
            編集
          </Link>
          <button type="button" className="btn btn-ghost btn-sm" onClick={duplicate} disabled={busy !== ""}>
            {busy === "copy" ? "複製中…" : "複製"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={remove} disabled={busy !== ""}>
            {busy === "delete" ? "削除中…" : "削除"}
          </button>
        </div>
        <Link href={`/battle/new?A=${character.id}`} className="btn btn-sm">
          このキャラで対戦
        </Link>
      </div>
    </article>
  );
}
