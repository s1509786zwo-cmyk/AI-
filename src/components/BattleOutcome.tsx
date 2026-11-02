import Link from "next/link";
import type { Battle } from "@/lib/engine/types";

export function BattleOutcome({ battle }: { battle: Battle }) {
  if (battle.status !== "finished" || !battle.outcome) return null;
  const { outcome, closing } = battle;
  const winnerName = outcome.winner === "draw" ? null : battle.fighters[outcome.winner].name;

  return (
    <section className="outcome" id="outcome">
      <div className="outcome-label">FINAL VERDICT</div>
      <h2>{outcome.winner === "draw" ? "引き分け" : `${winnerName} の勝利`}</h2>
      <div className="outcome-method">
        判定方法: {outcome.method} ／ 第{outcome.round}ラウンド
      </div>
      <p className="outcome-reason">{outcome.reason}</p>

      {closing && (
        <div className="verdict">
          <div className="panel-label">Chief judge statement</div>
          <h3 style={{ marginTop: 6 }}>判決理由</h3>
          <p>{closing.verdict}</p>
          {closing.keyMoments.length > 0 && (
            <div className="key-moments">
              {closing.keyMoments.map((moment, index) => (
                <span className="key-moment" key={`moment-${index}`}>
                  {moment}
                </span>
              ))}
            </div>
          )}
          {closing.lesson && <div className="lesson">{closing.lesson}</div>}
        </div>
      )}

      <div className="btn-row" style={{ justifyContent: "center", marginTop: 22 }}>
        <Link
          href={`/battle/new?A=${battle.fighters.A.id}`}
          className="btn btn-primary"
        >
          再戦を組む
        </Link>
        <Link href="/battles" className="btn">
          対戦履歴
        </Link>
        <Link href="/characters" className="btn btn-ghost">
          キャラクター一覧
        </Link>
      </div>
    </section>
  );
}
