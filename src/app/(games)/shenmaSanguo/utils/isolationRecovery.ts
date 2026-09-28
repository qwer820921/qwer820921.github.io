import type { SiteIsolationRecoveryEntry } from "@/utils/siteIsolation/boot";
import { SessionPlayerState, SyncStatus } from "../types";

/**
 * 網站移除全站跨來源隔離時，無法確認新舊、沒有自動採用的神馬三國暫存（見 utils/siteIsolation/boot.ts）
 * - 只看這個分頁、這個帳號的項目：其他分頁或其他帳號的暫存不顯示也不採用，7 天後由開機腳本清除
 * - 有這種暫存的分頁一定是遷移狀態不明（寫入限制，見 types 的 MigrationHold）：只顯示摘要、可以下載，
 *   不提供「改用這份暫存」（會繞過限制覆蓋雲端）
 * - dirty：有未同步的修改或待確認的升級；沒有未同步內容的暫存只是當時雲端資料的副本
 */
export interface IsolationRecoveryItem {
  /** 這個分頁、這個帳號所有相關項目（處理後一起移除） */
  ids: string[];
  /** 最新一筆的原始內容（下載時使用，不寫回 session） */
  value: string;
  dirty: boolean;
  nickname: string;
  team: string[];
  gold: number;
  pendingUpgrade: boolean;
}

export function findIsolationRecovery(
  entries: SiteIsolationRecoveryEntry[],
  tabId: string | null,
  sessionKey: string,
  playerKey: string | null
): IsolationRecoveryItem | null {
  if (!tabId || !playerKey) return null;
  let found: IsolationRecoveryItem | null = null;
  const ids: string[] = [];
  for (const e of entries) {
    if (e.reason !== "unverified" || e.key !== sessionKey || e.tab !== tabId) {
      continue;
    }
    let s: Partial<SessionPlayerState> | null = null;
    try {
      s = JSON.parse(e.value) as Partial<SessionPlayerState>;
    } catch {
      s = null;
    }
    if (!s || s.key !== playerKey) continue;
    ids.push(e.id);
    // 和 readSession 相同的判斷：沒有版本號的舊格式，Idle 以外都當作可能有未送出的修改
    const unsynced =
      typeof s.rev === "number" && typeof s.syncedRev === "number"
        ? s.rev !== s.syncedRev
        : s.syncStatus !== SyncStatus.Idle;
    const pendingUpgrade = !!s.pendingUpgrade;
    found = {
      ids,
      value: e.value,
      dirty: unsynced || pendingUpgrade,
      nickname: typeof s.nickname === "string" ? s.nickname : "",
      team: Array.isArray(s.team) ? s.team.map((t) => t.hero_id) : [],
      gold: typeof s.gold === "number" ? s.gold : 0,
      pendingUpgrade,
    };
  }
  return found;
}
