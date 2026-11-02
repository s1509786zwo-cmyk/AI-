import type { AbilitySpec, Side, TurnRecord } from "@/lib/engine/types";
import { CONDITION_LABEL } from "@/lib/engine/types";
import { conditionBand } from "@/lib/engine/rules";
import {
  ACTION_LABEL_JA,
  CONDITION_STATUS_LABEL,
  COUNTERPLAY_LABEL,
  EFFECT_LABEL,
  TEMPO_EDGE_LABEL,
} from "@/lib/engine/labels";

export function TurnCard({
  turn,
  sideNames,
  abilities,
  latest,
}: {
  turn: TurnRecord;
  sideNames: Record<Side, string>;
  abilities: Record<Side, AbilitySpec[]>;
  latest: boolean;
}) {
  const { ledger, audit } = turn;
  const showTurnId = latest ? "latest-turn" : undefined;

  return (
    <article className="turn" id={showTurnId}>
      <header className="turn-head">
        <span className="turn-index">ROUND {String(turn.index).padStart(2, "0")}</span>
        <span className="turn-highlight">{turn.highlight}</span>
        {audit.repaired ? (
          <span className="badge badge-done">描写修正済</span>
        ) : audit.consistent ? (
          <span className="badge badge-live">整合性 OK</span>
        ) : (
          <span className="badge badge-err">要確認</span>
        )}
      </header>

      <div className="turn-body">
        <div className="narration">
          {turn.narration.split(/\n{2,}/).map((paragraph, index) => (
            <p key={`p-${index}`}>{paragraph}</p>
          ))}
        </div>

        {turn.quotes.length > 0 && (
          <div className="quotes">
            {turn.quotes.map((quote, index) => (
              <p className="quote" key={`q-${index}`}>
                {sideNames[quote.side]}「{quote.line}」
              </p>
            ))}
          </div>
        )}

        <div className="action-summary">
          {(["A", "B"] as const).map((side) => {
            const plan = turn.plans[side];
            const ability = plan.abilityId ? abilities[side].find((candidate) => candidate.id === plan.abilityId) : null;
            return (
              <div className="action-chip" key={side}>
                <div className="side">
                  {side} ／ {sideNames[side]}
                </div>
                <div className="action-name">
                  {ACTION_LABEL_JA[plan.action] ?? plan.action}
                  {ability ? `「${ability.name}」` : ""}
                </div>
                <div className="intent">{plan.intent}</div>
                {plan.declaration && <div className="intent" style={{ color: "var(--ink-dim)" }}>「{plan.declaration}」</div>}
              </div>
            );
          })}
        </div>

        <details className="judge">
          <summary>
            <span>審判の判断根拠・状態変化</span>
            <span>
              {ledger.finished ? "決着" : `A -${Math.round(ledger.damageTo.A)} / B -${Math.round(ledger.damageTo.B)}`}
            </span>
          </summary>
          <div className="judge-body">
            <p className="judge-kv">
              <b>先手:</b>{" "}
              {ledger.initiative === "simultaneous" ? "同時" : `${sideNames[ledger.initiative]}（${ledger.initiative}）`} —{" "}
              {ledger.initiativeReason || "理由の記載なし"}
            </p>

            {ledger.events.map((event, index) => {
              const ability = event.abilityId ? abilities[event.side].find((candidate) => candidate.id === event.abilityId) : null;
              return (
                <div className="judge-event" key={`${event.side}-${index}`}>
                  <div className="judge-event-head">
                    <span className="judge-side">{event.side}</span>
                    <b style={{ fontWeight: 500, color: "var(--ink)" }}>
                      {ability?.name ?? ACTION_LABEL_JA[event.action] ?? event.action}
                    </b>
                    <span className={`tag ${event.success ? "tag-ok" : "tag-danger"}`}>{event.success ? "成立" : "不成立"}</span>
                    {event.conditionStatus !== "na" && (
                      <span className="tag">{CONDITION_STATUS_LABEL[event.conditionStatus]}</span>
                    )}
                    <span className="tag">{COUNTERPLAY_LABEL[event.counterplay]}</span>
                    <span className="tag">{TEMPO_EDGE_LABEL[event.tempo]}</span>
                    {event.interrupted && <span className="tag tag-danger">中断</span>}
                  </div>
                  {event.conditionStatus !== "na" && (
                    <p className="judge-kv">
                      <b>条件審査:</b>{" "}
                      {turn.adjudication.events.find((candidate) => candidate.side === event.side)?.conditionEvidence ||
                        "根拠記載なし"}
                    </p>
                  )}
                  <p className="judge-kv">
                    <b>対抗審査:</b>{" "}
                    {turn.adjudication.events.find((candidate) => candidate.side === event.side)?.counterplayDetail || "対抗手段なし"}
                  </p>
                  <p className="judge-kv">
                    <b>起きたこと:</b> {event.summary}
                  </p>
                  {event.effects.length > 0 && (
                    <table className="mini-table" style={{ marginTop: 6 }}>
                      <thead>
                        <tr>
                          <th>効果</th>
                          <th>強度</th>
                          <th>損耗</th>
                          <th>吸収</th>
                          <th>状態</th>
                        </tr>
                      </thead>
                      <tbody>
                        {event.effects.map((effect, effectIndex) => (
                          <tr key={`effect-${effectIndex}`}>
                            <td>
                              {effect.label}
                              {effect.lethal ? "（決定的）" : ""}
                              <span className="tiny" style={{ color: "var(--muted-2)" }}>
                                {" "}
                                {EFFECT_LABEL[effect.kind]}
                              </span>
                            </td>
                            <td className="num">{effect.severity}</td>
                            <td className="num">{Math.round(effect.damage)}</td>
                            <td className="num">{Math.round(effect.absorbed)}</td>
                            <td>{effect.statusApplied ? effect.statusApplied.label : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {event.adjustments.length > 0 && (
                    <p className="judge-kv" style={{ color: "var(--warn)" }}>
                      <b>エンジン補正:</b> {event.adjustments.join(" / ")}
                    </p>
                  )}
                  {event.beats.length > 0 && (
                    <p className="judge-kv" style={{ color: "var(--muted-2)" }}>
                      描写ビート: {event.beats.join(" ／ ")}
                    </p>
                  )}
                </div>
              );
            })}

            <div>
              <div className="panel-label" style={{ marginBottom: 6 }}>
                State delta
              </div>
              <table className="mini-table">
                <thead>
                  <tr>
                    <th>陣営</th>
                    <th>損耗</th>
                    <th>スタミナ</th>
                    <th>残存</th>
                    <th>状態</th>
                  </tr>
                </thead>
                <tbody>
                  {(["A", "B"] as const).map((side) => {
                    const after = turn.stateAfter.sides[side];
                    const band = conditionBand(after.integrity);
                    return (
                      <tr key={side}>
                        <td>{sideNames[side]}</td>
                        <td className="num">-{Math.round(ledger.damageTo[side])}</td>
                        <td className="num">
                          {Math.round(ledger.staminaBefore[side])} → {Math.round(ledger.staminaAfter[side])}
                        </td>
                        <td className="num">
                          {Math.round(after.integrity)}（{CONDITION_LABEL[band]}）
                        </td>
                        <td>{after.statuses.map((status) => status.label).join(" / ") || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="judge-note">{turn.adjudication.refereeNote}</p>

            {ledger.adjustments.length > 0 && (
              <p className="judge-kv" style={{ color: "var(--warn)" }}>
                <b>裁定の補正・注記:</b> {ledger.adjustments.join(" / ")}
              </p>
            )}
            {audit.issues.length > 0 && (
              <p className="judge-kv" style={{ color: audit.consistent ? "var(--muted)" : "var(--danger)" }}>
                <b>整合性監査:</b> {audit.issues.join(" / ")}
                {audit.repaired ? "（描写を修正済み）" : ""}
              </p>
            )}

            <div className="trace">
              {turn.trace.map((call, index) => (
                <span key={`${call.label}-${index}`} className={call.ok ? "" : "err"} title={call.error ?? ""}>
                  {call.label} / {call.model} / {Math.round(call.ms)}ms
                </span>
              ))}
            </div>
          </div>
        </details>
      </div>

      <footer className="turn-foot">
        <span className="tiny muted">
          ラウンド終了時 — A {Math.round(ledger.integrityAfter.A)} / B {Math.round(ledger.integrityAfter.B)}
        </span>
        <span className="tiny" style={{ color: "var(--muted-2)" }}>
          {new Date(turn.createdAt).toLocaleString("ja-JP")}
        </span>
      </footer>
    </article>
  );
}
