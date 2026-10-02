import type { MapConfig } from "@/app/(games)/shenmaSanguo/types";
import {
  StageDataProblem,
  stageDataProblem,
} from "@/app/(games)/shenmaSanguo/utils/stagePlayability";

/**
 * 地圖資料完整性（地圖編輯器的檢查清單用）：直接用遊戲判斷「關卡資料未完成」的同一份規則（utils/stagePlayability 的
 * stageDataProblem：沒有任何有路點的路線、沒有編號 1 以上的波次），不另外定一套。
 * - 「資料完整」只代表路線與波次都有資料，和玩家「已解鎖」無關（解鎖看玩家進度），
 *   也不保證每一波都能出兵：某一波沒有可出兵的組時，照舊由遊戲打到那一波時拒絕
 * - 每一波的出兵判讀用敵軍預覽（utils/stagePreview 的 buildStagePreview），需要敵人設定
 */

/** 地圖的資料狀態：完整、只缺波次、只缺路線、路線與波次都缺 */
export type MapIntegrityKind = "complete" | "waves" | "route" | "both";

export interface MapIntegrity {
  kind: MapIntegrityKind;
  /** 缺資料時的原因（和遊戲「尚未開放」的說明相同）；資料完整時是 null */
  problem: StageDataProblem | null;
}

export function mapIntegrity(map: MapConfig): MapIntegrity {
  const problem = stageDataProblem(map);
  if (!problem) return { kind: "complete", problem: null };
  const route = problem.gaps.includes("route");
  const waves = problem.gaps.includes("waves");
  return {
    kind: route && waves ? "both" : route ? "route" : "waves",
    problem,
  };
}

export const INTEGRITY_LABEL: Record<MapIntegrityKind, string> = {
  complete: "資料完整",
  waves: "缺波次",
  route: "缺路線",
  both: "缺路線與波次",
};

export interface IntegritySummary {
  total: number;
  complete: number;
  /** 待補資料（缺路線、缺波次或兩者都缺） */
  incomplete: number;
  waves: number;
  route: number;
  both: number;
}

export function integritySummary(maps: MapConfig[]): IntegritySummary {
  const s: IntegritySummary = {
    total: 0,
    complete: 0,
    incomplete: 0,
    waves: 0,
    route: 0,
    both: 0,
  };
  for (const m of maps) {
    const { kind } = mapIntegrity(m);
    s.total += 1;
    s[kind] += 1;
    if (kind !== "complete") s.incomplete += 1;
  }
  return s;
}

/** 清單篩選：全部、資料完整、待補資料 */
export type IntegrityFilter = "all" | "complete" | "incomplete";

export function filterByIntegrity(
  maps: MapConfig[],
  filter: IntegrityFilter
): MapConfig[] {
  if (filter === "all") return maps;
  return maps.filter(
    (m) => (mapIntegrity(m).kind === "complete") === (filter === "complete")
  );
}

/** 摘要的一行文字（清單已讀取成功時用） */
export function integritySummaryText(s: IntegritySummary): string {
  if (s.total === 0) return "設定裡沒有任何地圖";
  const parts: string[] = [];
  if (s.waves) parts.push(`有路線缺波次 ${s.waves}`);
  if (s.route) parts.push(`有波次缺路線 ${s.route}`);
  if (s.both) parts.push(`路線與波次都缺 ${s.both}`);
  return (
    `共 ${s.total} 張：資料完整 ${s.complete}、待補資料 ${s.incomplete}` +
    (parts.length ? `（${parts.join("、")}）` : "")
  );
}
