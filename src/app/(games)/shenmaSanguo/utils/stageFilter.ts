import { MapConfig } from "../types";
import { stageDataProblem } from "./stagePlayability";
import { isStageUnlocked } from "./stageUtils";

/**
 * 關卡的搜尋、章節與狀態篩選（主頁的關卡選擇視窗、獨立的關卡頁共用）
 * - 只影響畫面顯示：不改玩家進度、解鎖規則或關卡設定，不發 API、不寫存檔；條件由呼叫端放在元件的 state
 * - 條件之間是「而且」；章節分組照原本的順序（章節由小到大），同一章裡照設定的順序
 * - 狀態和兩個入口的卡片同一套判斷：資料未完成優先（utils/stagePlayability），其他再依進度分可出征／未解鎖（utils/stageUtils）
 * - 篩選不改變能不能出征：卡片上的按鈕照原本的規則
 */

/** 狀態：全部／可出征／未解鎖／資料未完成 */
export type StageStatusFilter = "all" | "playable" | "locked" | "incomplete";
/** 一關的狀態（卡片的 data-access 也是這三種） */
export type StageCardStatus = Exclude<StageStatusFilter, "all">;

export interface StageFilterCriteria {
  /** 名稱或 map_id 的部分文字；比對前去掉頭尾空白、英文字母不分大小寫 */
  query: string;
  /** null＝全部章節；其他是設定裡已有的章節 */
  chapter: number | null;
  status: StageStatusFilter;
}

export const DEFAULT_STAGE_FILTER: StageFilterCriteria = {
  query: "",
  chapter: null,
  status: "all",
};

export const STAGE_STATUS_OPTIONS: {
  value: StageStatusFilter;
  label: string;
}[] = [
  { value: "all", label: "全部" },
  { value: "playable", label: "可出征" },
  { value: "locked", label: "未解鎖" },
  { value: "incomplete", label: "資料未完成" },
];

export const isDefaultStageFilter = (c: StageFilterCriteria) =>
  c.query.trim() === "" && c.chapter === null && c.status === "all";

/**
 * 一關的狀態：資料未完成優先，其他依玩家進度分可出征／未解鎖。
 * 玩家進度還沒讀到（maxStage 不是文字）時，資料完整的關卡回傳 null：不能判斷，不能當成未解鎖
 */
export function stageCardStatus(
  map: MapConfig,
  maxStage: string | null | undefined
): StageCardStatus | null {
  if (stageDataProblem(map)) return "incomplete";
  if (typeof maxStage !== "string") return null;
  return isStageUnlocked(map.map_id, maxStage) ? "playable" : "locked";
}

/** 有效的章節：有限的數字（設定裡沒有的章節不補造） */
const isChapter = (c: unknown): c is number =>
  typeof c === "number" && Number.isFinite(c);

/** 篩選選單的章節：設定裡已有的有效章節（去掉重複、由小到大） */
export function stageChapters(maps: readonly MapConfig[]): number[] {
  return [
    ...new Set(maps.filter((m) => isChapter(m?.chapter)).map((m) => m.chapter)),
  ].sort((a, b) => a - b);
}

export interface StageGroup {
  /** 分組的章節（和原本的畫面相同，用設定裡的值） */
  chapter: MapConfig["chapter"];
  maps: MapConfig[];
}

export interface StageFilterResult {
  /** 有符合關卡的章節（順序和原本的畫面相同） */
  groups: StageGroup[];
  /** 符合條件的關卡數 */
  matched: number;
  /** 設定裡的關卡總數 */
  total: number;
  /** 選了可出征／未解鎖，但還沒讀到玩家進度（不能判斷）：這時資料完整的關卡都不符合，畫面要說明原因 */
  statusUnknown: boolean;
}

/** 章節分組：和兩個入口原本的分組相同（依章節數字由小到大，同一章照設定的順序） */
export function groupStagesByChapter(maps: readonly MapConfig[]): StageGroup[] {
  const by: Record<string, MapConfig[]> = {};
  const keys: Record<string, MapConfig["chapter"]> = {};
  for (const m of maps) {
    const k = String(m.chapter);
    if (!by[k]) {
      by[k] = [];
      keys[k] = m.chapter;
    }
    by[k].push(m);
  }
  return Object.entries(by)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([k, list]) => ({ chapter: keys[k], maps: list }));
}

/** 篩選關卡；maps 不是陣列（設定還沒讀到）時沒有任何關卡 */
export function filterStages(
  maps: readonly MapConfig[] | null | undefined,
  criteria: StageFilterCriteria,
  maxStage: string | null | undefined
): StageFilterResult {
  const list = Array.isArray(maps)
    ? maps.filter((m) => m && typeof m === "object")
    : [];
  const q = criteria.query.trim().toLowerCase();
  const statusUnknown =
    (criteria.status === "playable" || criteria.status === "locked") &&
    typeof maxStage !== "string";
  const matched = list.filter(
    (m) =>
      (criteria.chapter === null || m.chapter === criteria.chapter) &&
      (criteria.status === "all" ||
        stageCardStatus(m, maxStage) === criteria.status) &&
      (q === "" ||
        String(m.name ?? "")
          .toLowerCase()
          .includes(q) ||
        String(m.map_id ?? "")
          .toLowerCase()
          .includes(q))
  );
  return {
    groups: groupStagesByChapter(matched),
    matched: matched.length,
    total: list.length,
    statusUnknown,
  };
}
