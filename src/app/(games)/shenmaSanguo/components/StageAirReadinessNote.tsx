"use client";

import { flightProblemText } from "../utils/stagePreview";
import {
  InvalidFlyingInfo,
  StageAirReadiness,
  TeamAirState,
} from "../utils/stageAirReadiness";
import styles from "../styles/shenmaSanguo.module.css";

/** 目前隊伍的對空說明（card：關卡卡片上的一行；panel：敵軍預覽裡的完整說明） */
function teamText(team: TeamAirState, compact: boolean): string {
  switch (team.status) {
    case "unknown":
      return compact
        ? "隊伍資料尚未載入，無法確認對空能力"
        : "隊伍或武將資料尚未載入，無法確認目前隊伍能不能對空。";
    case "empty":
      return compact
        ? "沒有上陣武將：可編排弓兵、法師或在戰場建弓兵塔"
        : "目前沒有上陣的武將。能對空的是弓兵、法師武將；也可以在戰場建弓兵塔（文士塔只能對飛行敵人減速）。";
    case "ready": {
      const unknown =
        team.unknownHeroes.length > 0
          ? `有 ${team.unknownHeroes.length} 名上陣武將找不到設定（${team.unknownHeroes.join("、")}），無法確認能不能對空`
          : "";
      if (team.airHeroes.length > 0) {
        return compact
          ? `隊伍能對空：${team.airHeroes.join("、")}`
          : `目前上陣能對空的武將：${team.airHeroes.join("、")}。${unknown ? unknown + "。" : ""}戰場上也可以建弓兵塔補強；文士塔只能對飛行敵人減速。`;
      }
      if (unknown) {
        return compact
          ? `${team.unknownHeroes.length} 名上陣武將找不到設定，無法確認能不能對空`
          : `${unknown}；其他上陣武將都打不到飛行敵人。可以調整隊伍（弓兵、法師能對空），或在戰場建弓兵塔；文士塔只能對飛行敵人減速。`;
      }
      return compact
        ? "隊伍沒有能對空的武將：可調整隊伍或在戰場建弓兵塔"
        : "目前上陣的武將都打不到飛行敵人：可以調整隊伍（弓兵、法師能對空），或在戰場建弓兵塔；文士塔只能對飛行敵人減速。";
    }
  }
}

/** 隊伍準備好了（有能對空的武將） */
const teamHasAir = (team: TeamAirState) =>
  team.status === "ready" && team.airHeroes.length > 0;

const groupText = (g: { name: string; count: number | null }) =>
  g.count === null ? `${g.name}（數量無法確定）` : `${g.name} ×${g.count}`;

const invalidText = (g: InvalidFlyingInfo) =>
  `第 ${g.wave} 波 ${g.name}（${flightProblemText(g.reason)}，路線 ${g.path}）`;

/**
 * 出征前的對空準備提醒（規則見 utils/stageAirReadiness）。確定沒有飛行敵人、也沒有路線無效的飛行組的關卡不顯示。
 * 只是提醒：不阻擋出征、不寫入任何東西
 */
export default function StageAirReadinessNote({
  readiness: r,
  variant,
}: {
  readiness: StageAirReadiness;
  variant: "card" | "panel";
}) {
  const invalid = r.invalidFlying.length > 0;
  if (r.kind === "ground" && !invalid) return null;
  const tone =
    r.kind !== "flying"
      ? styles.airReadyUnclear
      : teamHasAir(r.team)
        ? styles.airReadyOk
        : styles.airReadyWarn;
  const data = {
    "data-testid": "air-readiness",
    "data-variant": variant,
    "data-kind": r.kind,
    "data-team": r.team.status,
    "data-air-heroes":
      r.team.status === "ready" ? r.team.airHeroes.join("、") : "",
    "data-invalid-flying": String(r.invalidFlying.length),
  };

  if (variant === "card") {
    return (
      <div className={`${styles.airReadyCard} ${tone}`} {...data}>
        {r.kind === "flying" ? (
          <>
            <div className="fw-bold">✈ 本關有飛行敵人</div>
            <div>{teamText(r.team, true)}</div>
            {r.incomplete.length > 0 && (
              <div>敵軍資料不完整，飛行敵人可能不只這些</div>
            )}
          </>
        ) : r.kind === "unclear" ? (
          <div>敵軍資料不完整，無法確認有沒有飛行敵人</div>
        ) : null}
        {invalid && (
          <div data-testid="air-readiness-invalid">
            有 {r.invalidFlying.length}{" "}
            組飛行敵人的路線無效，遊戲不會出兵（見敵軍預覽）
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`${styles.airReadyPanel} ${tone}`}
      role="note"
      aria-label="出征前的對空準備"
      {...data}
    >
      <div className="fw-bold mb-1">出征前的對空準備</div>
      {r.kind === "flying" ? (
        <>
          <div data-testid="air-readiness-waves">
            本關有飛行敵人：
            {r.flyingWaves
              .map(
                (w) => `第 ${w.wave} 波 ${w.groups.map(groupText).join("、")}`
              )
              .join("；")}
            {r.flyingTotal !== null && `（共 ${r.flyingTotal} 隻）`}
          </div>
          <div data-testid="air-readiness-team">{teamText(r.team, false)}</div>
        </>
      ) : r.kind === "unclear" ? (
        <div data-testid="air-readiness-team">
          如果有飛行敵人：{teamText(r.team, false)}
        </div>
      ) : null}
      {invalid && (
        <div data-testid="air-readiness-invalid">
          路線無效、遊戲不會出兵的飛行敵人：
          {r.invalidFlying.map(invalidText).join("；")}
          。飛行敵人從路線的起點直線飛到終點，這些組不算進本關的飛行敵人。
        </div>
      )}
      {r.incomplete.length > 0 && (
        <div data-testid="air-readiness-incomplete">
          敵軍資料不完整（{r.incomplete.join("；")}）：
          {r.kind === "flying"
            ? "飛行敵人可能不只這些。"
            : "無法確認本關有沒有飛行敵人。"}
        </div>
      )}
      <div className={styles.airReadyFoot}>
        這是出征前的戰術提醒，不是戰力評分，也不保證能獲勝；不影響出征。
      </div>
    </div>
  );
}
