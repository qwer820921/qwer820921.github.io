/**
 * 波次保存的判斷：送出前濾掉沒有選敵人的組（與濾完沒有組的波次），保存後以讀回的波次為「已保存」的基準。
 * - 後端（save_waves_config）每一組存成一列：enemy_id 去掉前後空白、數量與間隔轉成數字、路線空白時是 path_a；
 *   讀取（get_map_config）時依波次編號分組、由小到大排列。這裡用同一套規則算出「送出後設定裡應該是什麼」
 * - 不補敵人、不補空波、不重新編號：濾掉的組只在畫面說明，保存的內容和送出的一樣
 */
import type { WaveEnemy, WaveRow } from "../types";

/** 送出的波次：濾掉沒有選敵人的組，以及濾完沒有任何組的波次 */
export function cleanWavesForSave(waves: WaveRow[]): WaveRow[] {
  return waves
    .map((w) => ({
      ...w,
      enemies: w.enemies.filter((e) => String(e.enemy_id ?? "").trim() !== ""),
    }))
    .filter((w) => w.enemies.length > 0);
}

/** 新地圖或匯入時沿用畫面上的波次：照原樣複製（沒有選敵人的組也保留，不補、不重新編號），和原本的畫面不共用物件 */
export function copyWaves(waves: WaveRow[]): WaveRow[] {
  return waves.map((w) => ({
    ...w,
    enemies: w.enemies.map((e) => ({ ...e })),
  }));
}

/** 被濾掉（沒有保存）的組的說明，例如「波次 1（整波）、波次 3 的 1 組」；沒有濾掉時是空字串 */
export function droppedGroupsText(waves: WaveRow[]): string {
  const parts: string[] = [];
  waves.forEach((w) => {
    const empty = w.enemies.filter(
      (e) => String(e.enemy_id ?? "").trim() === ""
    ).length;
    if (empty === 0) return;
    parts.push(
      empty === w.enemies.length
        ? `波次 ${w.wave}（整波）`
        : `波次 ${w.wave} 的 ${empty} 組`
    );
  });
  return parts.join("、");
}

function normalizeEnemy(e: Partial<WaveEnemy>): WaveEnemy {
  return {
    enemy_id: String(e.enemy_id ?? "").trim(),
    count: Number(e.count),
    interval: Number(e.interval),
    path: e.path || "path_a",
  };
}

/** 波次的內容（型別統一，保留原本的順序與分組）：比對畫面和設定是否相同 */
export function normalizeWaves(waves: unknown): WaveRow[] {
  if (!Array.isArray(waves)) return [];
  return waves.map((w) => ({
    wave: Number(w?.wave),
    enemies: (Array.isArray(w?.enemies) ? w.enemies : []).map(normalizeEnemy),
  }));
}

/** 比對用的字串 */
export function wavesSig(waves: unknown): string {
  return JSON.stringify(normalizeWaves(waves));
}

/** 送出這些波次後，設定讀回應該得到的內容（和後端相同的分組與排序） */
export function expectedSavedWaves(sent: WaveRow[]): WaveRow[] {
  const byWave = new Map<number, WaveEnemy[]>();
  normalizeWaves(sent).forEach((w) => {
    const list = byWave.get(w.wave) ?? [];
    list.push(...w.enemies);
    byWave.set(w.wave, list);
  });
  return [...byWave.keys()]
    .sort((a, b) => a - b)
    .map((wave) => ({ wave, enemies: byWave.get(wave) ?? [] }));
}
