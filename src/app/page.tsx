import Link from "next/link";
import { AiNotice } from "@/components/AiNotice";
import { getStore } from "@/lib/store";
import { ARBITRATION_PROTOCOL, MAX_ROUNDS } from "@/lib/engine/rules";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const store = getStore();
  const [characters, battles] = await Promise.all([store.listCharacters(), store.listBattles()]);
  const recent = battles.slice(0, 4);

  return (
    <main className="main">
      <AiNotice />

      <section className="hero">
        <div>
          <div className="eyebrow">Free-form characters ／ AI adjudication</div>
          <h1>
            能力は、自由に。
            <br />
            裁定は、<span className="accent">厳格に。</span>
          </h1>
          <p className="hero-lead">
            魔法、時間操作、概念改変、ルールの書き換え。数値も種類も固定しない自由文の能力を、AI審判が読み解き、
            条件・代償・対抗手段まで構造化する。勝敗は文章の前に、戦闘状態として決まる。
          </p>
          <div className="hero-actions">
            <Link href="/characters/new" className="btn btn-primary btn-lg">
              キャラクターを作成
            </Link>
            <Link href="/battle/new" className="btn btn-lg">
              対戦を組む
            </Link>
            <a href="#system" className="btn btn-ghost btn-lg">
              仕組みを見る
            </a>
          </div>
          <div className="hero-meta">
            <span>CHARACTERS: {String(characters.length).padStart(2, "0")}</span>
            <span>BATTLES: {String(battles.length).padStart(2, "0")}</span>
            <span>ROUND LIMIT: {MAX_ROUNDS}</span>
            <span>RULESET v1.0</span>
          </div>
        </div>

        <aside className="proof-card">
          <div className="panel-label">Adjudication pipeline</div>
          <div style={{ marginTop: 10 }}>
            {[
              ["01", "能力解析", "条件・効果・代償を抽出"],
              ["02", "行動選択", "両者が独立に一手を選ぶ"],
              ["03", "裁定", "条件・対抗・速度を審査"],
              ["04", "状態適用", "損耗・状態を決定論で計算"],
              ["05", "描写生成", "確定事実だけから執筆"],
              ["06", "整合性監査", "矛盾を検出し修正"],
            ].map(([num, title, desc]) => (
              <div className="proof-line" key={num}>
                <span>
                  <span className="mono" style={{ color: "var(--accent)", fontSize: 10, marginRight: 8 }}>
                    {num}
                  </span>
                  {title}
                </span>
                <span>{desc}</span>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <div className="section-title" id="system">
        <h2>審判は、文章を書く前に勝敗を決める</h2>
        <span>System architecture</span>
      </div>

      <section className="feature-grid">
        <article className="feature">
          <div className="feature-num">01 / INTERPRETATION</div>
          <h3>能力を「点数」にしない</h3>
          <p>
            「時間を止める」「概念を消す」といった文章は、発動条件・対象範囲・持続・代償・観測性に分解されます。
            数値の強さではなく、その戦闘で実際に何が起きるかで裁定します。書かれていない効果は追加しません。
          </p>
        </article>
        <article className="feature">
          <div className="feature-num">02 / STATE</div>
          <h3>戦況は構造化して引き継ぐ</h3>
          <p>
            損耗・スタミナ・拘束・封印・防壁・再使用制限・永続事実をラウンドごとに保存します。
            審判の記憶ではなく、記録された状態が次の裁定を拘束します。前のターンと矛盾する行動は通りません。
          </p>
        </article>
        <article className="feature">
          <div className="feature-num">03 / AUDIT</div>
          <h3>出力を自己検証する</h3>
          <p>
            裁定は能力の解析範囲と条件充足を機械検証し、違反は再生成します。描写は確定事実と照合する監査を通過しなければ
            記録されません。文章と勝敗判定が食い違えば、修正されるのは文章です。
          </p>
        </article>
      </section>

      <div className="section-title">
        <h2>裁定プロトコル</h2>
        <span>Non-negotiable rules</span>
      </div>

      <section className="split">
        <div className="panel">
          <pre className="pre-wrap small dim" style={{ fontFamily: "var(--font-sans)", lineHeight: 1.95, whiteSpace: "pre-wrap" }}>
            {ARBITRATION_PROTOCOL.split("\n\n").slice(0, 7).join("\n\n")}
          </pre>
          <div className="notice">
            全文は各対戦の「審判プロトコル」から確認できます。能力の解釈に迷った場合は、この基準に立ち返って裁定します。
          </div>
        </div>

        <div>
          <div className="panel">
            <div className="panel-head">
              <h3>直近の対戦</h3>
              <Link href="/battles" className="btn btn-ghost btn-sm">
                すべて見る
              </Link>
            </div>
            {recent.length === 0 ? (
              <div className="empty">
                まだ対戦記録がありません。
                <br />
                キャラクターを2体作成し、対戦を組んでください。
              </div>
            ) : (
              <div className="recent-list">
                {recent.map((battle) => (
                  <article key={battle.id}>
                    <div>
                      <Link href={`/battle/${battle.id}`} className="recent-title">
                        {battle.fighterNames.A} <span className="muted">vs</span> {battle.fighterNames.B}
                      </Link>
                      <div className="recent-meta">
                        {battle.status === "finished" && battle.outcome
                          ? battle.outcome.winner === "draw"
                            ? "引き分け"
                            : `勝者 ${battle.fighterNames[battle.outcome.winner]} ／ ${battle.outcome.method}`
                          : battle.status === "active"
                            ? "交戦中"
                            : "中断"}{" "}
                        ／ {battle.turnCount} ROUNDS
                      </div>
                    </div>
                    <span className={`badge ${battle.status === "finished" ? "badge-done" : "badge-live"}`}>
                      {battle.status === "finished" ? "FINAL" : battle.status === "active" ? "LIVE" : "ERROR"}
                    </span>
                  </article>
                ))}
              </div>
            )}
          </div>

          {characters.length > 0 && (
            <div className="panel mt">
              <div className="panel-head">
                <h3>登録キャラクター</h3>
                <Link href="/characters" className="btn btn-ghost btn-sm">
                  一覧
                </Link>
              </div>
              <div className="stack-sm">
                {characters.slice(0, 3).map((character) => (
                  <Link key={character.id} href={`/characters/${character.id}`} className="spread">
                    <span className="char-name" style={{ fontSize: 15 }}>
                      {character.name}
                    </span>
                    <span className={`tag ${character.analysis ? "tag-ok" : "tag-danger"}`}>
                      {character.analysis ? "解析済" : "未解析"}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="section-title">
        <h2>始め方</h2>
        <span>Three steps</span>
      </div>

      <div className="feature-grid">
        <article className="feature">
          <div className="feature-num">STEP 1</div>
          <h3>自由文でキャラクターを書く</h3>
          <p>名前・能力・性格・設定・弱点を入力します。能力は魔法でも概念操作でも構いません。AIが裁定可能な仕様へ翻訳します。</p>
        </article>
        <article className="feature">
          <div className="feature-num">STEP 2</div>
          <h3>解釈を確認する</h3>
          <p>抽出された条件・効果・代償・弱点・曖昧点を確認できます。解釈が意図と違えば本文を書き直して再解析できます。</p>
        </article>
        <article className="feature">
          <div className="feature-num">STEP 3</div>
          <h3>AI審判と対戦する</h3>
          <p>両者が独立に行動を選び、審判が裁定します。ラウンドは戦況に応じて進み、決着は状態変化としてのみ訪れます。</p>
        </article>
      </div>

      <div className="center mt" style={{ marginTop: 46 }}>
        <Link href="/characters/new" className="btn btn-primary btn-lg">
          最初のキャラクターを作成する
        </Link>
      </div>
    </main>
  );
}
