import { MovementInfo } from "./antiAir";
import { PreviewGroup, PreviewWave, StagePreview } from "./stagePreview";

/**
 * 敵軍預覽的「敵軍組成」（唯讀）：從 buildStagePreview 的結果計算，不另外解析出兵規則。
 * - 只算預計會出兵、數量確定的組（outcome＝spawn）：遊戲會略過的組、數量無法確定的組、缺資料的波次都不算（不當成 0）
 * - 同一波有多筆資料時預覽已經只用第一筆（和遊戲相同）
 * - 依 enemy_id 合計（名稱相同但 id 不同的分開），順序是第一次出現的位置（波次、組的順序）；不排難度、不估戰力
 * - 全關的出兵都能確定時（preview.total 不是 null）合計就是全關總數；否則只是已確認的部分，畫面要寫明不是全關總數
 * - 找不到敵人設定的 enemy_id 列為資料問題，不造敵人、不用預設屬性
 * - 每一列另記逐波的已確認隻數（perWave）：同一波的多組相加，沒有已確認出兵的波次不列、不補 0
 */

/** 一個敵人在某一波已確認會出兵的隻數（同一波的多組相加） */
export interface WaveCount {
  wave: number;
  count: number;
}

export interface CompositionRow {
  enemyId: string;
  /** 敵人設定的名稱 */
  name: string;
  /** 已確認會出兵的隻數合計 */
  count: number;
  /** 移動方式（遊戲的判讀） */
  movement: MovementInfo | null;
  /** 第一次出現的波次 */
  firstWave: number;
  /** 逐波已確認的隻數（依波次編號；加起來就是 count） */
  perWave: WaveCount[];
}

/**
 * 一列在它的範圍（全關或選的路線）最後一次已確認出兵的波次：逐波隻數（perWave，依波次編號）的最後一筆。
 * 沒有已確認的筆數時回傳 null；不用全關的最後一波、最後一筆資料的波次或波數推估，不改傳入的列
 */
export function lastConfirmedWave(
  row: Pick<CompositionRow, "perWave">
): number | null {
  const last = row.perWave[row.perWave.length - 1];
  return last ? last.wave : null;
}

/** 一列在它的範圍單波最多的已確認隻數，以及所有並列的波次（依波次編號） */
export interface WavePeak {
  count: number;
  waves: number[];
}

/**
 * 一列在它的範圍（全關或選的路線）單波最多的已確認隻數：逐波隻數（perWave）的最大值與所有同為最大值的波次。
 * 沒有已確認的筆數時回傳 null（不寫成 0）；不用波號、合計或平均推估，不改傳入的列
 */
export function compositionWavePeak(
  row: Pick<CompositionRow, "perWave">
): WavePeak | null {
  if (row.perWave.length === 0) return null;
  const count = Math.max(...row.perWave.map((x) => x.count));
  return {
    count,
    waves: row.perWave.filter((x) => x.count === count).map((x) => x.wave),
  };
}

/** 把一組已確認的出兵加進逐波隻數：預覽的波次依編號由小到大，同一波一定接在最後一筆，相加 */
function addWaveCount(perWave: WaveCount[], wave: number, count: number) {
  const last = perWave[perWave.length - 1];
  if (last && last.wave === wave) last.count += count;
  else perWave.push({ wave, count });
}

export interface StageComposition {
  rows: CompositionRow[];
  /** 已確認會出兵的隻數合計 */
  confirmed: number;
  /** 全關的出兵都能確定：confirmed 就是全關總數 */
  complete: boolean;
  /** 讓全關數量無法確定的原因（complete 時是空的） */
  gaps: string[];
  /** 找不到敵人設定的 enemy_id（依第一次出現的順序） */
  unknownIds: string[];
  /** 遊戲會略過、不列入組成的組數（找不到設定的也算在內；原因見逐波內容） */
  skipped: number;
}

const waveList = (ns: number[]) => ns.map((n) => `第 ${n} 波`).join("、");

export function stageComposition(preview: StagePreview): StageComposition {
  const rows: CompositionRow[] = [];
  const byId = new Map<string, CompositionRow>();
  const unknownIds: string[] = [];
  const missing: number[] = [];
  const rejected: number[] = [];
  const undetermined: number[] = [];
  let skipped = 0;
  for (const w of preview.waves) {
    if (w.missing) missing.push(w.wave);
    else if (w.rejected) rejected.push(w.wave);
    if (w.groups.some((g) => g.outcome === "unknown"))
      undetermined.push(w.wave);
    for (const g of w.groups) {
      if (g.outcome === "skip") {
        skipped += 1;
        if (g.name === null && !unknownIds.includes(g.enemyId))
          unknownIds.push(g.enemyId);
        continue;
      }
      if (g.outcome !== "spawn" || g.count === null || g.name === null)
        continue;
      const row = byId.get(g.enemyId);
      if (row) {
        row.count += g.count;
        addWaveCount(row.perWave, w.wave, g.count);
      } else {
        const r: CompositionRow = {
          enemyId: g.enemyId,
          name: g.name,
          count: g.count,
          movement: g.movement,
          firstWave: w.wave,
          perWave: [{ wave: w.wave, count: g.count }],
        };
        byId.set(g.enemyId, r);
        rows.push(r);
      }
    }
  }
  const complete = preview.total !== null;
  const gaps: string[] = [];
  if (!complete) {
    gaps.push(...preview.problems);
    if (missing.length) gaps.push(`${waveList(missing)}沒有資料`);
    if (rejected.length)
      gaps.push(`${waveList(rejected)}沒有可以出兵的組（遊戲會拒絕這一波）`);
    if (undetermined.length)
      gaps.push(`${waveList(undetermined)}有無法確定能不能出兵或數量的組`);
    if (gaps.length === 0) gaps.push("有資料不完整的波次");
  }
  return {
    rows,
    confirmed: rows.reduce((s, r) => s + r.count, 0),
    complete,
    gaps,
    unknownIds,
    skipped,
  };
}

export interface RouteCompositionRow extends CompositionRow {
  /** 這個敵人在這條路線上已確認出兵的波次（依編號） */
  waves: number[];
}

export interface RouteComposition {
  pathId: string;
  rows: RouteCompositionRow[];
  /** 這條路線上已確認會出兵的隻數合計 */
  confirmed: number;
  /** 全關的出兵都能確定：confirmed 就是這條路線的全部（否則只是已確認的部分） */
  complete: boolean;
  /** 這條路線有已確認出兵的波次（依編號） */
  waves: number[];
  /** 這條路線上有無法確定能不能出兵或數量的組的波次 */
  undeterminedWaves: number[];
  /** 這條路線上遊戲會略過的組數 */
  skipped: number;
  /** 這條路線上找不到敵人設定的 enemy_id */
  unknownIds: string[];
  /** 這條路線的數量不是全部的原因（complete 時是空的）：這條路線自己的、全關的 */
  gaps: string[];
}

/**
 * 依路線的敵軍組成（唯讀）：和 stageComposition 同一套規則，只看 path 等於 pathId 的組，依 enemy_id 合計、第一次出現的順序。
 * 路線 ID 由呼叫端從 preview.pathIds（和路線預覽同一個解析）選，不另外解析路線；沒有路點的路線上的組遊戲會略過，
 * 不屬於任何可選的路線（不造出虛構的路線）。
 * 全關的出兵都能確定時（preview.total 不是 null）這條路線的合計才是它的全部：有缺資料、遊戲會拒絕或無法確定的波次時，
 * 那一波之後可能不會開始、無法確定的組可能在這條路線上，所以只能寫「已確認」，不補 0、不當成這條路線的全部
 */
export function routeComposition(
  preview: StagePreview,
  pathId: string,
  whole: StageComposition = stageComposition(preview)
): RouteComposition {
  const rows: RouteCompositionRow[] = [];
  const byId = new Map<string, RouteCompositionRow>();
  const unknownIds: string[] = [];
  const waves: number[] = [];
  const undeterminedWaves: number[] = [];
  let skipped = 0;
  for (const w of preview.waves) {
    for (const g of w.groups) {
      if (g.path !== pathId) continue;
      if (g.outcome === "skip") {
        skipped += 1;
        if (g.name === null && !unknownIds.includes(g.enemyId))
          unknownIds.push(g.enemyId);
        continue;
      }
      if (g.outcome !== "spawn" || g.count === null || g.name === null) {
        if (!undeterminedWaves.includes(w.wave)) undeterminedWaves.push(w.wave);
        continue;
      }
      if (!waves.includes(w.wave)) waves.push(w.wave);
      const row = byId.get(g.enemyId);
      if (row) {
        row.count += g.count;
        if (!row.waves.includes(w.wave)) row.waves.push(w.wave);
        addWaveCount(row.perWave, w.wave, g.count);
      } else {
        const r: RouteCompositionRow = {
          enemyId: g.enemyId,
          name: g.name,
          count: g.count,
          movement: g.movement,
          firstWave: w.wave,
          waves: [w.wave],
          perWave: [{ wave: w.wave, count: g.count }],
        };
        byId.set(g.enemyId, r);
        rows.push(r);
      }
    }
  }
  const complete = whole.complete;
  const gaps: string[] = [];
  if (!complete) {
    if (undeterminedWaves.length)
      gaps.push(
        `這條路線在${waveList(undeterminedWaves)}有無法確定能不能出兵或數量的組`
      );
    gaps.push(...whole.gaps.map((g) => `全關：${g}`));
  }
  return {
    pathId,
    rows,
    confirmed: rows.reduce((s, r) => s + r.count, 0),
    complete,
    waves,
    undeterminedWaves,
    skipped,
    unknownIds,
    gaps,
  };
}

export interface WaveRouteView {
  pathId: string;
  /** 這一波在這條路線上的組：原本的組序（index）與順序都不變，含遊戲會略過或無法確定的組 */
  groups: PreviewGroup[];
  /** 這條路線已確認會出兵的隻數（outcome＝spawn、數量與敵人設定都確定的組） */
  confirmed: number;
  /** 這條路線已確認會出兵的組數 */
  confirmedGroups: number;
  /** 這條路線上無法確定能不能出兵或數量的組數 */
  undetermined: number;
  /**
   * 其他路線上有資料問題的組（遊戲會略過、無法確定，或有資料不完整的註記；含沒有路點、不能選的路線）：
   * 全波資料提醒，原內容照列，和這條路線的組不重複
   */
  otherProblems: PreviewGroup[];
  /** 其他路線上沒有資料問題、不在這裡列出的組數 */
  otherHidden: number;
}

/**
 * 一波依路線查看（唯讀）：只從 buildStagePreview 的組篩選，不重新解析關卡資料、不改組序與內容。
 * 已確認的隻數只算 outcome＝spawn 的組；數量無法確定、遊戲會略過的組不補 0。
 * 其他路線的問題組不藏起來（otherProblems）；缺波、拒絕、重複與空白列是整波的事，由呼叫端照原樣顯示
 */
export function waveRouteView(
  wave: PreviewWave,
  pathId: string
): WaveRouteView {
  const groups = wave.groups.filter((g) => g.path === pathId);
  const confirmedList = groups.filter(
    (g) => g.outcome === "spawn" && g.count !== null && g.name !== null
  );
  const others = wave.groups.filter((g) => g.path !== pathId);
  const otherProblems = others.filter(
    (g) => g.outcome !== "spawn" || g.notes.length > 0
  );
  return {
    pathId,
    groups,
    confirmed: confirmedList.reduce((s, g) => s + (g.count ?? 0), 0),
    confirmedGroups: confirmedList.length,
    undetermined: groups.filter((g) => g.outcome === "unknown").length,
    otherProblems,
    otherHidden: others.length - otherProblems.length,
  };
}

/**
 * 敵軍組成的排列：first＝首次出現（預設，就是組成原本的順序）、count＝已確認隻數由多到少（同數量維持首次出現的順序）、
 * waves＝已確認出兵的波數由多到少（列的 perWave 筆數，同一波的多組只算一波；同波數維持首次出現的順序）。
 * 只排目前顯示的列（全關或選的路線），不估戰力或難度
 */
export type CompositionSort = "first" | "count" | "waves";

/** 依排列方式回傳新的陣列（不改傳入的列與陣列；Array.prototype.sort 是穩定排序，同數量或同波數保持原本的先後） */
export function sortCompositionRows<T extends CompositionRow>(
  rows: readonly T[],
  sort: CompositionSort
): T[] {
  const copy = rows.slice();
  if (sort === "count") copy.sort((a, b) => b.count - a.count);
  else if (sort === "waves")
    copy.sort((a, b) => b.perWave.length - a.perWave.length);
  return copy;
}

/**
 * 敵軍組成的搜尋：敵人名稱或 enemy_id 包含查詢文字（去掉前後空白、不分大小寫）的列，順序不變。
 * 只從傳入的列（目前的範圍、已排列）篩選，不重算、不改列；同名不同 id 各自比對、不合併；空白的查詢回傳全部的列
 */
export function filterCompositionRows<T extends CompositionRow>(
  rows: readonly T[],
  query: string
): T[] {
  const q = query.trim().toLowerCase();
  if (q === "") return rows.slice();
  return rows.filter(
    (r) =>
      r.name.toLowerCase().includes(q) || r.enemyId.toLowerCase().includes(q)
  );
}

/** 波次編號的清單文字（第 1、3、5 波） */
export const waveListText = (ns: number[]) => `第 ${ns.join("、")} 波`;
