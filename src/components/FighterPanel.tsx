import { CONDITION_LABEL, type Side, type SideState } from "@/lib/engine/types";
import { conditionBand } from "@/lib/engine/rules";
import { STATUS_TONE } from "@/lib/engine/labels";

export function FighterPanel({
  side,
  name,
  state,
  abilityNames,
}: {
  side: Side;
  name: string;
  state: SideState;
  abilityNames: { id: string; name: string }[];
}) {
  const band = conditionBand(state.integrity);
  const used = Object.entries(state.abilityUses);
  const sideLabel = side === "A" ? "SIDE A" : "SIDE B";
  return (
    <article className={`fighter-panel ${side === "A" ? "side-a" : "side-b"} ${state.down ? "down" : ""}`}>
      <div className="fighter-name">
        <span>{name}</span>
        <span className={`condition ${band}`}>{state.down ? "戦闘不能" : CONDITION_LABEL[band]}</span>
      </div>
      <div className="mono" style={{ fontSize: 9, letterSpacing: "0.16em", color: "var(--muted-2)", marginTop: 2 }}>
        {sideLabel}
      </div>

      <div className="bars">
        <div className="bar-row">
          <span>損耗</span>
          <div className="bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.integrity)} aria-label={`${name}の残存戦力`}>
            <div
              className={`bar-fill integrity ${state.integrity <= 30 ? "low" : ""}`}
              style={{ width: `${Math.max(0, Math.min(100, state.integrity))}%` }}
            />
          </div>
          <span className="bar-value">{Math.round(state.integrity)}</span>
        </div>
        <div className="bar-row">
          <span>スタミナ</span>
          <div className="bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.stamina)} aria-label={`${name}のスタミナ`}>
            <div className="bar-fill stamina" style={{ width: `${Math.max(0, Math.min(100, state.stamina))}%` }} />
          </div>
          <span className="bar-value">{Math.round(state.stamina)}</span>
        </div>
      </div>

      <div className="status-row">
        {state.statuses.length ? (
          <div className="tag-row">
            {state.statuses.map((status) => (
              <span className={`tag ${STATUS_TONE[status.kind] ?? ""}`} key={status.id} title={status.description}>
                {status.label}
                {status.remaining !== null ? ` 残${status.remaining}R` : ""}
              </span>
            ))}
          </div>
        ) : (
          <span className="tiny" style={{ color: "var(--muted-2)" }}>
            状態異常なし
          </span>
        )}
      </div>

      {used.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary className="tiny muted" style={{ cursor: "pointer" }}>
            能力の使用履歴
          </summary>
          <div className="tag-row" style={{ marginTop: 6 }}>
            {used.map(([abilityId, count]) => {
              const ability = abilityNames.find((candidate) => candidate.id === abilityId);
              const cooldown = state.cooldowns[abilityId];
              return (
                <span className="tag" key={abilityId}>
                  {ability?.name ?? abilityId} ×{count}
                  {cooldown && cooldown > 0 ? ` / 次R${cooldown}` : ""}
                </span>
              );
            })}
          </div>
        </details>
      )}
    </article>
  );
}
