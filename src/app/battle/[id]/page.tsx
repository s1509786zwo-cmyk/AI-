import Link from "next/link";
import { notFound } from "next/navigation";
import { AiNotice } from "@/components/AiNotice";
import { BattleRunner } from "@/components/BattleRunner";
import { BattleOutcome } from "@/components/BattleOutcome";
import { FighterPanel } from "@/components/FighterPanel";
import { TurnCard } from "@/components/TurnCard";
import { AnalysisView } from "@/components/AnalysisView";
import { getBattle } from "@/lib/service/battles";
import { ARBITRATION_PROTOCOL } from "@/lib/engine/rules";
import type { Side } from "@/lib/engine/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function BattlePage({ params }: Props) {
  const { id } = await params;
  const battle = await getBattle(id);
  if (!battle) notFound();

  const sideNames = { A: battle.fighters.A.name, B: battle.fighters.B.name };
  const abilities = { A: battle.fighters.A.analysis.abilities, B: battle.fighters.B.analysis.abilities };
  const finished = battle.status === "finished";

  return (
    <main className="main">
      <AiNotice compact />

      <div className="battle-top">
        <div>
          <div className="eyebrow">Adjudicated match</div>
          <h1>{battle.title}</h1>
          <div className="battle-sub">
            {battle.arena.name} ／ RULESET v{battle.rulesetVersion} ／ {battle.turns.length} ROUNDS
          </div>
        </div>
        <div className="btn-row">
          <span className={`badge ${finished ? "badge-done" : battle.status === "active" ? "badge-live" : "badge-err"}`}>
            {finished ? "FINAL" : battle.status === "active" ? "IN PROGRESS" : "ERROR"}
          </span>
          <Link href="/battles" className="btn btn-sm">
            履歴
          </Link>
        </div>
      </div>

      {battle.error && (
        <div className="banner banner-danger">
          <div>
            <div className="banner-title">直前のラウンドでエラーが発生しました</div>
            <p>{battle.error}</p>
          </div>
        </div>
      )}

      <section className="combatants" aria-label="対戦者">
        <FighterPanel
          side="A"
          name={battle.fighters.A.name}
          state={battle.state.sides.A}
          abilityNames={abilities.A}
        />
        <div className="vs-divider">VS</div>
        <FighterPanel
          side="B"
          name={battle.fighters.B.name}
          state={battle.state.sides.B}
          abilityNames={abilities.B}
        />
      </section>

      <div className="arena-note">
        <strong>{battle.arena.name}</strong> — {battle.arena.description}
        {battle.state.field.hazards.length > 0 && (
          <div className="mt-sm">戦場の変化: {battle.state.field.hazards.join(" ／ ")}</div>
        )}
      </div>

      {(battle.state.persistentFacts.length > 0 || battle.state.chronicle.length > 0) && (
        <details className="judge" style={{ marginBottom: 18 }}>
          <summary>
            <span>審判が保持している戦況メモ</span>
            <span>
              {battle.state.persistentFacts.length} FACTS / {battle.state.chronicle.length} ROUNDS
            </span>
          </summary>
          <div className="judge-body">
            {battle.state.persistentFacts.length > 0 && (
              <div>
                <div className="panel-label" style={{ marginBottom: 6 }}>
                  永続事実（以後の裁定を拘束する）
                </div>
                <div className="note-list">
                  {battle.state.persistentFacts.map((fact, index) => (
                    <div className="note-item" key={`fact-${index}`}>
                      {fact}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {battle.state.chronicle.length > 0 && (
              <div>
                <div className="panel-label" style={{ marginBottom: 6 }}>
                  戦況年表
                </div>
                <div className="note-list">
                  {battle.state.chronicle.map((line, index) => (
                    <div className="note-item" key={`chronicle-${index}`}>
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </details>
      )}

      <BattleRunner
        battleId={battle.id}
        active={battle.status === "active"}
        initialError={battle.error}
        round={battle.state.round}
      />

      {battle.turns.length === 0 && (
        <div className="empty" style={{ marginTop: 12 }}>
          まだ第1ラウンドは開始されていません。
          <br />
          両者の能力は互いに公開されています。行動は独立に選ばれ、審判が裁定します。
        </div>
      )}

      <section className="timeline" aria-label="ラウンド記録">
        {battle.turns.map((turn, index) => (
          <TurnCard
            key={turn.index}
            turn={turn}
            sideNames={sideNames}
            abilities={abilities}
            latest={index === battle.turns.length - 1 && battle.status === "active"}
          />
        ))}
      </section>

      <BattleOutcome battle={battle} />

      <div className="section-title">
        <h2>審判が参照した能力仕様</h2>
        <span>Structured interpretation</span>
      </div>
      <div className="split">
        {(["A", "B"] as Side[]).map((side) => (
          <details className="judge" key={side} open={false}>
            <summary>
              <span>
                {side} ／ {sideNames[side]} の解析
              </span>
              <span>{abilities[side].length} abilities</span>
            </summary>
            <div className="judge-body">
              <AnalysisView analysis={battle.fighters[side].analysis} />
            </div>
          </details>
        ))}
      </div>

      <div className="section-title">
        <h2>審判プロトコル</h2>
        <span>Rules of adjudication</span>
      </div>
      <div className="panel">
        <pre className="pre-wrap small dim" style={{ fontFamily: "var(--font-sans)", lineHeight: 1.95, whiteSpace: "pre-wrap" }}>
          {ARBITRATION_PROTOCOL}
        </pre>
      </div>
    </main>
  );
}
