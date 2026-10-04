import { MovementInfo } from "./antiAir";
import { StagePreview } from "./stagePreview";

/**
 * 敵軍預覽的「敵軍組成」（唯讀）：從 buildStagePreview 的結果計算，不另外解析出兵規則。
 * - 只算預計會出兵、數量確定的組（outcome＝spawn）：遊戲會略過的組、數量無法確定的組、缺資料的波次都不算（不當成 0）
 * - 同一波有多筆資料時預覽已經只用第一筆（和遊戲相同）
 * - 依 enemy_id 合計（名稱相同但 id 不同的分開），順序是第一次出現的位置（波次、組的順序）；不排難度、不估戰力
 * - 全關的出兵都能確定時（preview.total 不是 null）合計就是全關總數；否則只是已確認的部分，畫面要寫明不是全關總數
 * - 找不到敵人設定的 enemy_id 列為資料問題，不造敵人、不用預設屬性
 */

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
      if (row) row.count += g.count;
      else {
        const r: CompositionRow = {
          enemyId: g.enemyId,
          name: g.name,
          count: g.count,
          movement: g.movement,
          firstWave: w.wave,
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
