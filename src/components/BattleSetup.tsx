"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Arena, Character } from "@/lib/engine/types";

export function BattleSetup({
  characters,
  arenas,
  initialA,
}: {
  characters: Character[];
  arenas: Arena[];
  initialA?: string;
}) {
  const router = useRouter();
  const [sideA, setSideA] = useState<string>(initialA ?? characters[0]?.id ?? "");
  const [sideB, setSideB] = useState<string>(
    characters.find((character) => character.id !== (initialA ?? characters[0]?.id))?.id ?? "",
  );
  const [arenaName, setArenaName] = useState<string>(arenas[0]?.name ?? "");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const pick = (side: "A" | "B", id: string) => {
    if (side === "A") {
      setSideA(id);
      if (id === sideB) setSideB(characters.find((character) => character.id !== id)?.id ?? "");
    } else {
      setSideB(id);
      if (id === sideA) setSideA(characters.find((character) => character.id !== id)?.id ?? "");
    }
  };

  const ready = Boolean(sideA && sideB && sideA !== sideB && arenaName);

  const start = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    setStatus("対戦を準備しています。未解析の能力があればAIが解釈します…");
    try {
      const res = await fetch("/api/battles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fighterAId: sideA, fighterBId: sideB, arenaName, title: title.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === "NOT_CONFIGURED") {
          throw new Error("AI審判に接続できませんでした。時間をおいて再試行してください。");
        }
        throw new Error(data.error ?? "対戦の作成に失敗しました。");
      }
      router.push(`/battle/${data.battle.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "対戦の作成に失敗しました。");
      setStatus("");
      setBusy(false);
    }
  };

  if (characters.length < 2) {
    return (
      <div className="empty">
        対戦には2体以上のキャラクターが必要です。
        <div className="mt">
          <Link href="/characters/new" className="btn btn-primary btn-sm">
            キャラクターを作成
          </Link>
        </div>
      </div>
    );
  }

  const card = (character: Character, side: "A" | "B") => {
    const selected = side === "A" ? sideA === character.id : sideB === character.id;
    return (
      <button
        key={`${side}-${character.id}`}
        type="button"
        className={`select-card ${selected ? (side === "A" ? "selected" : "selected-b") : ""}`}
        onClick={() => pick(side, character.id)}
        aria-pressed={selected}
      >
        <div className="spread">
          <span className="name">{character.name}</span>
          <span className={`tag ${character.analysis ? "tag-ok" : "tag-danger"}`}>
            {character.analysis ? "解析済" : "要解析"}
          </span>
        </div>
        <div className="meta">{character.abilityText.slice(0, 90)}</div>
      </button>
    );
  };

  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-head">
          <h3>対戦相手を選択</h3>
          <span className="panel-label">A / B</span>
        </div>
        <div className="selector-grid">
          <div>
            <div className="panel-label" style={{ color: "var(--a)", marginBottom: 8 }}>
              SIDE A
            </div>
            <div className="selector-col">{characters.map((character) => card(character, "A"))}</div>
          </div>
          <div className="vs-mark">VS</div>
          <div>
            <div className="panel-label" style={{ color: "var(--b)", marginBottom: 8 }}>
              SIDE B
            </div>
            <div className="selector-col">{characters.map((character) => card(character, "B"))}</div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>戦場</h3>
          <span className="panel-label">Arena</span>
        </div>
        <div className="arena-list">
          {arenas.map((arena) => (
            <button
              key={arena.name}
              type="button"
              className={`arena-card ${arenaName === arena.name ? "selected" : ""}`}
              onClick={() => setArenaName(arena.name)}
            >
              <div className="name">{arena.name}</div>
              <div className="desc">{arena.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>開始</h3>
          <span className="panel-label">Ready</span>
        </div>
        <div className="field">
          <label htmlFor="title">
            <span>対戦タイトル（任意）</span>
            <span className="counter">{title.length} / 80</span>
          </label>
          <input
            id="title"
            className="input"
            value={title}
            maxLength={80}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="未入力なら「A vs B」"
          />
        </div>
        <div className="divider" />
        <div className="spread">
          <p className="small muted">
            {characters.some((character) => !character.analysis)
              ? "未解析のキャラクターは、開始時にAIが能力を解釈します（最大1分ほど）。"
              : "両者の能力は公開情報として裁定されます。行動は互いの選択を知らずに決まります。"}
          </p>
          <button type="button" className="btn btn-primary btn-lg" onClick={start} disabled={!ready || busy}>
            {busy ? (
              <>
                <span className="spinner" /> 準備中…
              </>
            ) : (
              "対戦を開始"
            )}
          </button>
        </div>
        {status && (
          <div className="status-line mt-sm">
            <span className="spinner" /> {status}
          </div>
        )}
        {error && (
          <div className="inline-error">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
