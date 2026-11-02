import Link from "next/link";
import { AiNotice } from "@/components/AiNotice";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "対戦履歴 / ARBITER" };

export default async function BattlesPage() {
  const battles = await getStore().listBattles();
  return (
    <main className="main">
      <AiNotice compact />
      <div className="page-head">
        <div>
          <div className="eyebrow">Match archive</div>
          <h1>対戦履歴</h1>
          <p>すべての裁定は、能力解釈・各ラウンドの判断根拠・状態変化とともに保存されています。</p>
        </div>
        <Link href="/battle/new" className="btn btn-primary">
          新しい対戦
        </Link>
      </div>

      {battles.length === 0 ? (
        <div className="empty">
          まだ対戦履歴がありません。
          <div className="mt">
            <Link href="/battle/new" className="btn btn-primary btn-sm">
              対戦を組む
            </Link>
          </div>
        </div>
      ) : (
        <div className="panel" style={{ padding: 0, overflowX: "auto" }}>
          <table className="history">
            <thead>
              <tr>
                <th>対戦</th>
                <th>戦場</th>
                <th>ラウンド</th>
                <th>結果</th>
                <th>日時</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {battles.map((battle) => (
                <tr key={battle.id}>
                  <td>
                    <Link href={`/battle/${battle.id}`} className="title-cell">
                      {battle.fighterNames.A} <span className="muted">vs</span> {battle.fighterNames.B}
                    </Link>
                  </td>
                  <td className="muted small">{battle.arena.name}</td>
                  <td className="mono small">{battle.turnCount}</td>
                  <td>
                    {battle.status === "finished" && battle.outcome ? (
                      <span className={`tag ${battle.outcome.winner === "draw" ? "" : "tag-accent"}`}>
                        {battle.outcome.winner === "draw"
                          ? "引き分け"
                          : `${battle.fighterNames[battle.outcome.winner]} 勝利`}
                        <span style={{ opacity: 0.6 }}>／{battle.outcome.method}</span>
                      </span>
                    ) : battle.status === "active" ? (
                      <span className="tag tag-ok">交戦中</span>
                    ) : (
                      <span className="tag tag-danger">中断</span>
                    )}
                  </td>
                  <td className="mono tiny muted">{new Date(battle.updatedAt).toLocaleString("ja-JP")}</td>
                  <td>
                    <Link href={`/battle/${battle.id}`} className="btn btn-ghost btn-sm">
                      開く
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
