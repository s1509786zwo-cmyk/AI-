import { EFFECT_LABEL, TEMPO_LABEL, RANGE_LABEL, MODE_LABEL, DURATION_LABEL } from "@/lib/engine/labels";
import type { CharacterAnalysis } from "@/lib/engine/types";

export function AnalysisView({ analysis }: { analysis: CharacterAnalysis }) {
  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-label">Combat identity</div>
        <p className="identity" style={{ marginTop: 8 }}>
          {analysis.combatIdentity}
        </p>
        <div className="divider" />
        <dl className="kv-list" style={{ gap: 14 }}>
          <div>
            <dt>戦い方</dt>
            <dd>{analysis.behavior}</dd>
          </div>
          <div>
            <dt>防御・回避</dt>
            <dd>{analysis.defense}</dd>
          </div>
          <div>
            <dt>耐久・消耗</dt>
            <dd>{analysis.endurance}</dd>
          </div>
          <div>
            <dt>勝利条件</dt>
            <dd>{analysis.winCondition}</dd>
          </div>
          <div>
            <dt>敗北条件</dt>
            <dd>{analysis.lossCondition}</dd>
          </div>
        </dl>
      </div>

      <div>
        <div className="panel-head">
          <h3>能力の裁定仕様</h3>
          <span className="panel-label">{analysis.abilities.length} ABILITIES</span>
        </div>
        {analysis.abilities.map((ability) => (
          <article className="ability-block" key={ability.id}>
            <div className="ability-head">
              <div>
                <div className="ability-name">{ability.name}</div>
                <div className="tag-row" style={{ marginTop: 6 }}>
                  <span className="tag tag-accent">{MODE_LABEL[ability.mode]}</span>
                  <span className="tag">速度: {TEMPO_LABEL[ability.tempo]}</span>
                  <span className="tag">間合い: {RANGE_LABEL[ability.range]}</span>
                  {ability.limits.map((limit, index) => (
                    <span className="tag" key={`limit-${index}`}>
                      制限: {limit}
                    </span>
                  ))}
                </div>
              </div>
              <span className="mono tiny" style={{ color: "var(--muted-2)" }}>
                {ability.id}
              </span>
            </div>
            <p className="ability-summary">{ability.summary}</p>

            <div className="ability-section">
              <div className="ability-section-label">Effects</div>
              {ability.effects.map((effect, index) => (
                <div className="effect-row" key={`effect-${index}`}>
                  <span className="sev">
                    SEV {effect.severity}
                    {effect.lethal ? " / LETHAL" : ""}
                  </span>
                  <span>
                    <b style={{ fontWeight: 500, color: "var(--ink-dim)" }}>
                      {EFFECT_LABEL[effect.kind]}
                      {effect.duration !== "instant" ? `（${DURATION_LABEL[effect.duration]}）` : ""}
                    </b>
                    <span className="dim"> — {effect.description}</span>
                  </span>
                  <span className="tiny muted">{effect.target === "opponent" ? "相手" : effect.target === "self" ? "自分" : "戦場"}</span>
                </div>
              ))}
            </div>

            {ability.conditions.length > 0 && (
              <div className="ability-section">
                <div className="ability-section-label">Activation conditions</div>
                <div className="note-list">
                  {ability.conditions.map((condition, index) => (
                    <div className="note-item" key={`condition-${index}`}>
                      {condition.text}
                      <div className="quote-source">本文: 「{condition.evidence}」</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="ability-section">
              <div className="ability-section-label">Cost / Limits / Weakness</div>
              <dl className="kv-list">
                <div>
                  <dt>コスト</dt>
                  <dd>{ability.costs.join(" / ") || "本文に明記なし（共通スタミナ規則のみ適用）"}</dd>
                </div>
                <div>
                  <dt>制限</dt>
                  <dd>{ability.limits.join(" / ") || "本文に明記なし"}</dd>
                </div>
                <div>
                  <dt>弱点</dt>
                  <dd>{ability.weaknesses.join(" / ") || "特になし"}</dd>
                </div>
                <div>
                  <dt>対抗されうる手段</dt>
                  <dd>{ability.counterplay.join(" / ") || "特になし"}</dd>
                </div>
                <div>
                  <dt>観測性</dt>
                  <dd>{ability.observability || "不明"}</dd>
                </div>
              </dl>
            </div>

            {ability.ambiguities.length > 0 && (
              <div className="ability-section">
                <div className="ability-section-label">Ambiguities / Narrow reading</div>
                <div className="note-list">
                  {ability.ambiguities.map((ambiguity, index) => (
                    <div className="note-item" key={`ambiguity-${index}`}>
                      {ambiguity.point}
                      <div className="quote-source">解釈: {ambiguity.resolution}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>
        ))}
      </div>

      <div className="split">
        <div className="panel">
          <div className="panel-label">Fairness notes</div>
          <div className="note-list mt-sm">
            {analysis.fairnessNotes.length ? (
              analysis.fairnessNotes.map((note, index) => (
                <div className="note-item" key={`fair-${index}`}>
                  {note}
                </div>
              ))
            ) : (
              <p className="muted small">特記事項なし</p>
            )}
          </div>
        </div>
        <div className="panel">
          <div className="panel-label">Unresolved</div>
          <div className="note-list mt-sm">
            {analysis.unresolved.length ? (
              analysis.unresolved.map((note, index) => (
                <div className="note-item" key={`unresolved-${index}`}>
                  {note}
                </div>
              ))
            ) : (
              <p className="muted small">本文から裁定可能。未解決点なし</p>
            )}
          </div>
        </div>
      </div>

      <p className="tiny" style={{ color: "var(--muted-2)" }}>
        解析モデル: {analysis.model} ／ {new Date(analysis.analyzedAt).toLocaleString("ja-JP")}
      </p>
    </div>
  );
}
