import Link from "next/link";
import { notFound } from "next/navigation";
import { AiNotice } from "@/components/AiNotice";
import { AnalysisView } from "@/components/AnalysisView";
import { CharacterActions } from "@/components/CharacterActions";
import { getCharacter } from "@/lib/service/characters";
import { needsAnalysis } from "@/lib/engine/analysis";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ analysis?: string }>;
};

export default async function CharacterDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { analysis: analysisParam } = await searchParams;
  const character = await getCharacter(id);
  if (!character) notFound();
  const stale = Boolean(character.analysis) && needsAnalysis(character);

  return (
    <main className="main">
      <AiNotice compact />

      {analysisParam === "done" && (
        <div className="banner banner-ok">
          <div>
            <div className="banner-title">AI解析が完了しました</div>
            <p>下の裁定仕様を確認してください。意図と違う場合は本文を編集して再解析できます。</p>
          </div>
        </div>
      )}
      {analysisParam === "failed" && (
        <div className="banner banner-danger">
          <div>
            <div className="banner-title">AI解析に失敗しました</div>
            <p>
              キャラクター自体は保存されています。「再解析」を実行するか、時間をおいて再試行してください。
              {character.analysisError && <span className="dim">（{character.analysisError}）</span>}
            </p>
          </div>
        </div>
      )}
      {analysisParam === "config" && (
        <div className="banner banner-danger">
          <div>
            <div className="banner-title">AI APIが未設定です</div>
            <p>AI審判に接続できませんでした。時間をおいて再試行してください。</p>
          </div>
        </div>
      )}

      <div className="page-head">
        <div>
          <div className="eyebrow">Character dossier</div>
          <h1>{character.name}</h1>
          <div className="tag-row" style={{ marginTop: 10 }}>
            {character.analysis ? (
              <span className="tag tag-ok">AI解析済み</span>
            ) : (
              <span className={`tag ${character.analysisError ? "tag-danger" : ""}`}>
                {character.analysisError ? "解析エラー" : "未解析"}
              </span>
            )}
            {stale && <span className="tag tag-danger">本文が更新されています（再解析が必要）</span>}
            <span className="tag">作成 {new Date(character.createdAt).toLocaleDateString("ja-JP")}</span>
            {character.analysis && <span className="tag">解析 {character.analysis.abilities.length} 能力</span>}
          </div>
        </div>
        <div className="stack-sm" style={{ alignItems: "flex-end" }}>
          <div className="btn-row" style={{ justifyContent: "flex-end" }}>
            <Link href={`/battle/new?A=${character.id}`} className="btn btn-primary btn-sm">
              このキャラで対戦
            </Link>
            <Link href={`/characters/${character.id}/edit`} className="btn btn-sm">
              編集
            </Link>
            <Link href="/characters" className="btn btn-ghost btn-sm">
              一覧
            </Link>
          </div>
          <CharacterActions
            characterId={character.id}
            characterName={character.name}
            hasAnalysis={Boolean(character.analysis)}
          />
        </div>
      </div>

      {!character.analysis && (
        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-head">
            <h3>AI解析がまだありません</h3>
            <span className="panel-label">Analysis required</span>
          </div>
          <p className="small muted">
            AI審判が能力を裁定するには、まず本文を構造化された仕様へ翻訳する必要があります。
            右上の「AI解析を実行」を押してください。設定済みであれば30〜60秒ほどで完了します。
          </p>
          {character.analysisError && <div className="inline-error">{character.analysisError}</div>}
        </div>
      )}

      <div className="analysis-hero">
        <div>
          {character.analysis ? (
            <AnalysisView analysis={character.analysis} />
          ) : (
            <div className="panel">
              <div className="panel-label">Raw input</div>
              <p className="identity pre-wrap" style={{ marginTop: 8 }}>
                {character.abilityText}
              </p>
            </div>
          )}
        </div>

        <aside className="stack">
          <div className="panel">
            <div className="panel-label">Original text</div>
            <div className="divider" style={{ margin: "10px 0 14px" }} />
            <dl className="kv-list">
              <div>
                <dt>能力（原文）</dt>
                <dd className="pre-wrap">{character.abilityText}</dd>
              </div>
              <div>
                <dt>性格</dt>
                <dd className="pre-wrap">{character.personality || "記載なし"}</dd>
              </div>
              <div>
                <dt>弱点</dt>
                <dd className="pre-wrap" style={{ color: "var(--accent)" }}>
                  {character.weakness || "記載なし"}
                </dd>
              </div>
              <div>
                <dt>設定・背景</dt>
                <dd className="pre-wrap">{character.background || "記載なし"}</dd>
              </div>
            </dl>
          </div>
          <div className="panel">
            <div className="panel-label">Interpretation policy</div>
            <p className="tiny muted" style={{ marginTop: 8, lineHeight: 1.9 }}>
              解析結果は本文に忠実であるほど強い裁定になります。書かれていない効果は追加されず、曖昧な点は狭く解釈されます。
              弱点は審判が対抗手段として必ず検討します。
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
