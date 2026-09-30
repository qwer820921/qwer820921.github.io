import { MapConfig, StaticConfig } from "../types";
import { buildStagePreview } from "./stagePreview";
import { isStageUnlocked, stageToNum } from "./stageUtils";

/**
 * 關卡能不能出征：兩個關卡選擇入口（主頁的關卡視窗、獨立的關卡頁）、主頁的出征／重玩／切換關卡、
 * 獨立戰鬥頁直接進入都用這一份判斷，不能出征的關卡不送關卡資料、不開新的一場（不取戰鬥票）。
 * - loading：遊戲設定或玩家資料還沒載入，還不知道能不能出征
 * - config_failed：遊戲設定讀取失敗（沒有可用的設定）：可以重試
 * - not_found：設定裡沒有這一關
 * - incomplete：已經取得設定，但這一關的資料未完成（沒有有效的路線，或沒有波次），顯示「尚未開放」與原因。
 *   判讀照敵軍預覽（utils/stagePreview），和遊戲一致：沒有任何有路點的路線時每一組都會被略過（路線沒有路點）；
 *   沒有任何編號 1 以上的波次時遊戲沒有波次可打（會拒絕第 1 波）。這不是「還沒通關」，不改進度
 * - locked：資料完整，但玩家的進度還沒到（utils/stageUtils 的 isStageUnlocked）
 * - playable：可以出征
 * 只在整關缺路線或缺波次時擋下。第 1 波沒有可以出兵的組、之後某一波缺資料或無效，照舊由遊戲打到那一波時拒絕（wave_rejected）；
 * 同一波混合有效與無效的組照舊只略過無效的組
 */

/** 關卡資料缺的部分：路線、波次 */
export type StageDataGap = "route" | "waves";

export interface StageDataProblem {
  gaps: StageDataGap[];
  /** 玩家看得懂的原因（依 gaps 的順序） */
  reasons: string[];
}

export type StageAccess =
  | { status: "loading" }
  | { status: "config_failed"; error: string }
  | { status: "not_found"; mapId: string }
  | {
      status: "incomplete";
      map: MapConfig;
      problem: StageDataProblem;
      /** 同時也還沒解鎖（玩家資料還沒載入時是 false） */
      locked: boolean;
    }
  | { status: "locked"; map: MapConfig }
  | { status: "playable"; map: MapConfig };

/** 路線資料的問題（沒有任何有路點的路線時才有） */
function routeReason(pathJson: unknown): string {
  if (pathJson === undefined || pathJson === null || pathJson === "") {
    return "沒有路線資料";
  }
  if (typeof pathJson === "string") {
    try {
      JSON.parse(pathJson);
    } catch {
      return "路線資料的格式無法解析";
    }
    return "沒有可用的路線";
  }
  if (typeof pathJson !== "object" || Array.isArray(pathJson)) {
    return "路線資料的格式不對";
  }
  return "沒有可用的路線";
}

/** 波次資料的問題（沒有任何編號 1 以上的波次時才有） */
function wavesReason(waves: unknown): string {
  if (!Array.isArray(waves)) {
    return waves === undefined || waves === null
      ? "沒有波次資料"
      : "波次資料的格式不對";
  }
  return waves.length === 0 ? "沒有波次資料" : "沒有編號 1 以上的有效波次";
}

/**
 * 這一關的資料缺了什麼：沒有有效的路線、沒有波次。資料完整時回傳 null。
 * 用敵軍預覽的判讀（路線：有路點的路線；波次：編號 1 以上的波次），不另外定一套規則
 */
export function stageDataProblem(
  map: MapConfig | null | undefined
): StageDataProblem | null {
  if (!map) return null;
  const preview = buildStagePreview(map, []);
  const gaps: StageDataGap[] = [];
  const reasons: string[] = [];
  if (preview.pathIds.length === 0) {
    gaps.push("route");
    reasons.push(routeReason((map as { path_json?: unknown }).path_json));
  }
  if (preview.waves.length === 0) {
    gaps.push("waves");
    reasons.push(wavesReason((map as { waves?: unknown }).waves));
  }
  return gaps.length > 0 ? { gaps, reasons } : null;
}

/** 關卡資料未完成的一行說明（卡片、提示、戰鬥頁共用） */
export function stageDataProblemText(problem: StageDataProblem): string {
  return `關卡資料未完成：${problem.reasons.join("、")}`;
}

export function stageAccess(input: {
  mapId: string | null | undefined;
  config: StaticConfig | null | undefined;
  configError?: string | null;
  /** 玩家目前的進度；玩家資料還沒載入時是 null */
  maxStage: string | null | undefined;
}): StageAccess {
  const { mapId, config, configError, maxStage } = input;
  if (!config) {
    return configError
      ? { status: "config_failed", error: configError }
      : { status: "loading" };
  }
  const maps = Array.isArray(config.maps) ? config.maps : [];
  const map = mapId ? maps.find((m) => m && m.map_id === mapId) : undefined;
  if (!map) return { status: "not_found", mapId: mapId ?? "" };
  const unlocked =
    typeof maxStage === "string" ? isStageUnlocked(map.map_id, maxStage) : null;
  const problem = stageDataProblem(map);
  if (problem) {
    return { status: "incomplete", map, problem, locked: unlocked === false };
  }
  if (unlocked === null) return { status: "loading" };
  return unlocked ? { status: "playable", map } : { status: "locked", map };
}

/** 能出征 */
export const isPlayable = (
  a: StageAccess
): a is { status: "playable"; map: MapConfig } => a.status === "playable";

/**
 * 進度內最後一個可以出征的關卡（關卡編號最大的；編號相同時取設定裡較前面的）：
 * 目前這一關不能出征時，提示裡「改打這一關」的建議。沒有時回傳 null
 */
export function latestPlayableStage(
  maps: MapConfig[] | null | undefined,
  maxStage: string | null | undefined
): MapConfig | null {
  if (!Array.isArray(maps) || typeof maxStage !== "string") return null;
  let best: MapConfig | null = null;
  for (const m of maps) {
    if (!m || typeof m.map_id !== "string") continue;
    if (!isStageUnlocked(m.map_id, maxStage) || stageDataProblem(m)) continue;
    if (!best || stageToNum(m.map_id) > stageToNum(best.map_id)) best = m;
  }
  return best;
}

/** 不能出征時給玩家的說明（主頁與獨立戰鬥頁共用）：標題與說明行 */
export function stageAccessMessage(
  access: StageAccess,
  opts: { progressName?: string | null } = {}
): { title: string; lines: string[] } | null {
  switch (access.status) {
    case "incomplete":
      return {
        title: `「${access.map.name || access.map.map_id}」尚未開放`,
        lines: [
          stageDataProblemText(access.problem) + "。",
          "這一關的資料還沒完成，暫時不能出征；這不是還沒通關，進度沒有改變。",
          ...(access.locked ? ["這一關也還沒解鎖。"] : []),
        ],
      };
    case "locked":
      return {
        title: `「${access.map.name || access.map.map_id}」尚未解鎖`,
        lines: [
          `打贏前一關才能出征這一關${opts.progressName ? `（目前進度：${opts.progressName}）` : ""}。`,
        ],
      };
    case "not_found":
      return {
        title: "找不到這一關",
        lines: [`遊戲設定裡沒有「${access.mapId}」。`],
      };
    case "config_failed":
      return {
        title: "遊戲設定讀取失敗",
        lines: [
          `無法取得關卡資料（${access.error}），所以還不能出征。`,
          "可以重試；讀取成功後就能繼續。",
        ],
      };
    default:
      return null;
  }
}
