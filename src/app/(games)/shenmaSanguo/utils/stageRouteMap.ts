import { GridPoint, StagePreview, stagePathPoints } from "./stagePreview";

/**
 * 敵軍預覽的「路線預覽」（唯讀小地圖）：路點只用 utils/stagePreview 的 stagePathPoints（和遊戲 GameMap._parse_path_json
 * 相同的解析：paths 物件、paths 陣列視為 path_a、舊版 waypoints），地圖尺寸讀 path_json 的 cols／rows。只畫能確定的格子座標：
 * - 尺寸要是 1～MAX_ROUTE_MAP_SIDE 的整數，否則不畫格子、只留文字說明（不補造預設尺寸；遊戲缺尺寸時會依路點推算，這裡不跟著推算）
 * - 無法判讀的路點（null）與超出地圖的路點會把折線切斷，不把前後兩點直接連成一條路線
 * - 起點／終點是路線的第一個／最後一個路點（有效且在地圖內才標），不代表所有敵人共同的出生點或城池位置
 */

/** 小地圖每邊最多幾格：超過時視為異常尺寸，不建立格子（正式關卡是 14×11、14×14） */
export const MAX_ROUTE_MAP_SIDE = 40;

export type Cell = readonly [number, number];

export interface RouteLine {
  id: string;
  /** 路點數（含無法判讀的） */
  points: number;
  /** 依序連續的有效路點（遇到無法判讀或超出地圖的路點就斷開）；只有一點的段落畫成一個點 */
  segments: Cell[][];
  /** 第一個路點（無法判讀或超出地圖時是 null） */
  start: Cell | null;
  /** 最後一個路點（無法判讀或超出地圖時是 null） */
  end: Cell | null;
  /** 無法判讀的路點數 */
  unreadable: number;
  /** 超出地圖的路點數（尺寸無效時不判斷，是 0） */
  outside: number;
}

export interface StageRouteMap {
  /** 有效的地圖尺寸；無效時是 null */
  cols: number | null;
  rows: number | null;
  /** 尺寸的問題（缺少、無法判讀、過大）；可以畫格子時是 null */
  sizeProblem: string | null;
  /** 有路點的路線（順序和 stagePathPoints 相同） */
  routes: RouteLine[];
}

/** 和遊戲 int() 相同的整數：數字取整數部分、純整數字串；其他是 null */
function toInt(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : null;
  if (typeof v === "string" && /^\s*[+-]?\d+\s*$/.test(v))
    return parseInt(v, 10);
  return null;
}

function parsePathJson(pathJson: unknown): Record<string, unknown> | null {
  let pj = pathJson;
  if (typeof pj === "string") {
    try {
      pj = JSON.parse(pj);
    } catch {
      return null;
    }
  }
  return pj && typeof pj === "object" && !Array.isArray(pj)
    ? (pj as Record<string, unknown>)
    : null;
}

function mapSize(pj: Record<string, unknown> | null): {
  cols: number | null;
  rows: number | null;
  sizeProblem: string | null;
} {
  if (!pj || pj.cols === undefined || pj.rows === undefined)
    return {
      cols: null,
      rows: null,
      sizeProblem: "關卡設定沒有地圖尺寸（cols／rows），不畫格子",
    };
  const cols = toInt(pj.cols);
  const rows = toInt(pj.rows);
  if (cols === null || rows === null || cols < 1 || rows < 1)
    return {
      cols: null,
      rows: null,
      sizeProblem: "關卡設定的地圖尺寸（cols／rows）無法判讀，不畫格子",
    };
  if (cols > MAX_ROUTE_MAP_SIDE || rows > MAX_ROUTE_MAP_SIDE)
    return {
      cols: null,
      rows: null,
      sizeProblem: `關卡設定的地圖尺寸 ${cols}×${rows} 超過預覽上限（每邊 ${MAX_ROUTE_MAP_SIDE} 格），不畫格子`,
    };
  return { cols, rows, sizeProblem: null };
}

function routeLine(
  id: string,
  pts: GridPoint[],
  cols: number | null,
  rows: number | null
): RouteLine {
  const inMap = (p: Cell) =>
    cols === null ||
    rows === null ||
    (p[0] >= 0 && p[0] < cols && p[1] >= 0 && p[1] < rows);
  const segments: Cell[][] = [];
  let current: Cell[] = [];
  let unreadable = 0;
  let outside = 0;
  for (const p of pts) {
    const ok = p !== null && inMap(p);
    if (p === null) unreadable += 1;
    else if (!ok) outside += 1;
    if (ok) current.push(p);
    else if (current.length > 0) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length > 0) segments.push(current);
  const first = pts[0] ?? null;
  const last = pts[pts.length - 1] ?? null;
  return {
    id,
    points: pts.length,
    segments,
    start: first !== null && inMap(first) ? first : null,
    end: last !== null && inMap(last) ? last : null,
    unreadable,
    outside,
  };
}

/** 關卡的路線小地圖資料（只讀設定，不改輸入） */
export function stageRouteMap(pathJson: unknown): StageRouteMap {
  const size = mapSize(parsePathJson(pathJson));
  const routes = Object.entries(stagePathPoints(pathJson)).map(([id, pts]) =>
    routeLine(id, pts, size.cols, size.rows)
  );
  return { ...size, routes };
}

const cellText = (p: Cell) => `(${p[0]}, ${p[1]})`;

/** 一條路線的文字說明：路點數、起點與終點（地圖畫不出來時也看得到） */
export function routeSummary(r: RouteLine): string {
  if (r.points === 1)
    return r.start ? `只有一個路點 ${cellText(r.start)}` : "只有一個路點";
  return `${r.points} 個路點，路線起點 ${r.start ? cellText(r.start) : "無法標示"} → 路線終點 ${r.end ? cellText(r.end) : "無法標示"}`;
}

/** 一條路線的資料問題（可讀說明）；沒有問題時是空陣列 */
export function routeProblems(r: RouteLine, map: StageRouteMap): string[] {
  const out: string[] = [];
  if (r.unreadable > 0)
    out.push(
      `有 ${r.unreadable} 個路點的座標無法判讀：路線在那裡斷開，不把前後兩點直接連起來`
    );
  if (r.outside > 0)
    out.push(
      `有 ${r.outside} 個路點超出地圖（${map.cols}×${map.rows}）：路線在那裡斷開`
    );
  if (!r.start)
    out.push(
      r.points === 1 ? "唯一的路點無法標示" : "第一個路點無法標示，不畫路線起點"
    );
  if (r.points > 1 && !r.end) out.push("最後一個路點無法標示，不畫路線終點");
  return out;
}

/**
 * 有飛行敵人會走的路線（遊戲不會拒絕的波次裡、不會被略過的飛行組；和 buildStagePreview 的 flying 同一套判讀）：
 * 這些路線另外說明飛行敵人從起點直線飛到終點，不沿折線
 */
export function flyingRouteIds(preview: StagePreview): string[] {
  const ids = new Set<string>();
  for (const w of preview.waves) {
    if (w.rejected) continue;
    for (const g of w.groups)
      if (g.outcome !== "skip" && g.movement?.value === "flying")
        ids.add(g.path);
  }
  return [...ids];
}
