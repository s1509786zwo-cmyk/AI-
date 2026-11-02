"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CHARACTER_TEMPLATES } from "@/lib/content/templates";
import type { CharacterInput } from "@/lib/engine/types";

type Props = {
  mode: "create" | "edit";
  initial?: CharacterInput & { id: string; hasAnalysis: boolean };
};

type Stage = "idle" | "saving" | "analyzing" | "done";

const EMPTY: CharacterInput = { name: "", abilityText: "", personality: "", background: "", weakness: "" };

export function CharacterForm({ mode, initial }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<CharacterInput>(
    initial
      ? {
          name: initial.name,
          abilityText: initial.abilityText,
          personality: initial.personality,
          background: initial.background,
          weakness: initial.weakness,
        }
      : EMPTY,
  );
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [configMissing, setConfigMissing] = useState(false);

  const set =
    (key: keyof CharacterInput) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [key]: event.target.value }));
    };

  const applyTemplate = (index: number) => {
    const template = CHARACTER_TEMPLATES[index];
    setForm({
      name: template.name,
      abilityText: template.abilityText,
      personality: template.personality,
      background: template.background,
      weakness: template.weakness,
    });
    setNotice(`例「${template.label}」を入力しました。内容は自由に書き換えてください。`);
    setError("");
  };

  const busy = stage === "saving" || stage === "analyzing";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    setNotice("");
    setConfigMissing(false);
    if (!form.name.trim()) {
      setError("名前を入力してください。");
      return;
    }
    if (form.abilityText.trim().length < 10) {
      setError("能力は10文字以上で入力してください。");
      return;
    }

    setStage("saving");
    let characterId = initial?.id ?? "";
    try {
      const res = await fetch(mode === "create" ? "/api/characters" : `/api/characters/${initial?.id}`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました。");
      characterId = data.character.id;

      setStage("analyzing");
      const analyzeRes = await fetch(`/api/characters/${characterId}/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const analyzeData = await analyzeRes.json().catch(() => ({}));
      if (!analyzeRes.ok) {
        if (analyzeData.code === "NOT_CONFIGURED") {
          setConfigMissing(true);
          setError("AI APIが未設定のため、能力を解析できません。設定方法を確認してください。");
          setStage("idle");
          router.push(`/characters/${characterId}?analysis=config`);
          return;
        }
        setError(analyzeData.error ?? "AI解析に失敗しました。キャラクターは保存されています。詳細画面から再解析できます。");
        setStage("idle");
        router.push(`/characters/${characterId}?analysis=failed`);
        return;
      }
      setStage("done");
      router.push(`/characters/${characterId}?analysis=done`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました。");
      setStage("idle");
      if (characterId) router.push(`/characters/${characterId}?analysis=failed`);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="panel panel-tight">
        <div className="spread">
          <div>
            <div className="panel-label">Input example</div>
            <p className="small muted" style={{ marginTop: 4 }}>
              入力例から始めて、自由に書き換えられます。
            </p>
          </div>
          <div className="templates">
            {CHARACTER_TEMPLATES.map((template, index) => (
              <button
                type="button"
                className="template-chip"
                key={template.label}
                onClick={() => applyTemplate(index)}
                disabled={busy}
                title={template.note}
              >
                {template.label}
              </button>
            ))}
          </div>
        </div>
        {notice && <p className="tiny muted mt-sm">{notice}</p>}
      </div>

      <div className="field">
        <label htmlFor="name">
          <span>
            名前 <span className="req">必須</span>
          </span>
          <span className="counter">{form.name.length} / 60</span>
        </label>
        <input
          id="name"
          className="input"
          value={form.name}
          onChange={set("name")}
          maxLength={60}
          placeholder="例: 刻野 しずく"
          disabled={busy}
        />
      </div>

      <div className="field">
        <label htmlFor="abilityText">
          <span>
            能力 <span className="req">必須</span>
          </span>
          <span className="counter">{form.abilityText.length} / 6000</span>
        </label>
        <textarea
          id="abilityText"
          className="textarea tall"
          value={form.abilityText}
          onChange={set("abilityText")}
          maxLength={6000}
          placeholder={
            "能力の効果・発動条件・代償・射程・制限を自由文で書いてください。\n例: 指を鳴らすと相手の影が縛られ、動けなくなる。影のない場所では発動しない。発動後は自分の影が薄くなる。"
          }
          disabled={busy}
        />
        <p className="hint">
          魔法・物理・時間・空間・概念・ルール改変など、種類は問いません。書かれていない効果は審判が追加しません。
          曖昧な点は最も狭く合理的に解釈され、解釈内容は解析結果に記録されます。
        </p>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="personality">
            <span>性格</span>
            <span className="counter">{form.personality.length} / 2000</span>
          </label>
          <textarea
            id="personality"
            className="textarea"
            value={form.personality}
            onChange={set("personality")}
            maxLength={2000}
            placeholder="戦闘中の判断傾向や美学。AIの行動選択に反映されます。"
            disabled={busy}
          />
        </div>
        <div className="field">
          <label htmlFor="weakness">
            <span>弱点</span>
            <span className="counter">{form.weakness.length} / 2000</span>
          </label>
          <textarea
            id="weakness"
            className="textarea"
            value={form.weakness}
            onChange={set("weakness")}
            maxLength={2000}
            placeholder="能力的な空隙、性格的な隙、発動の妨げになる条件。審判が対抗手段として扱います。"
            disabled={busy}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="background">
          <span>設定・背景</span>
          <span className="counter">{form.background.length} / 6000</span>
        </label>
        <textarea
          id="background"
          className="textarea"
          value={form.background}
          onChange={set("background")}
          maxLength={6000}
          placeholder="出自、世界観、能力の由来、譲れないもの。能力の解釈と戦い方に文脈を与えます。"
          disabled={busy}
        />
      </div>

      {mode === "edit" && initial?.hasAnalysis && (
        <p className="hint">内容を変更して保存すると、以前のAI解析は破棄され、再解析されます。</p>
      )}
      {error && (
        <div className="inline-error" role="alert">
          {error}
          {configMissing && (
            <>
              {" "}
              <Link href="/characters" style={{ textDecoration: "underline" }}>
                キャラクター一覧へ
              </Link>
            </>
          )}
        </div>
      )}

      <div className="spread">
        <div className="status-line">
          {stage === "saving" && (
            <>
              <span className="spinner" /> 保存しています…
            </>
          )}
          {stage === "analyzing" && (
            <>
              <span className="spinner" /> AIが能力を解釈しています（30〜60秒ほどかかります）
            </>
          )}
          {stage === "done" && (
            <>
              <span className="dot ok" /> 解析が完了しました。画面を移動しています…
            </>
          )}
          {stage === "idle" && <span className="muted small">保存後、AIが能力を解析します。</span>}
        </div>
        <div className="btn-row">
          <Link href={initial ? `/characters/${initial.id}` : "/characters"} className="btn">
            キャンセル
          </Link>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "処理中…" : mode === "create" ? "保存してAI解析へ" : "更新して再解析"}
          </button>
        </div>
      </div>
    </form>
  );
}
