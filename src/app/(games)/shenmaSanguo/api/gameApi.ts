// 神馬三國 GAS API Wrapper v2
// GAS 不支援 CORS preflight，所以不設定 Content-Type header
// body 傳純字串，GAS 用 e.postData.contents 讀取

export const SHENMA_SANGUO_GAS_URL =
  "https://script.google.com/macros/s/AKfycby9ihuxuXZgJRK6iRbO4sOOxsWGCeqwPaNTK0Dr3JybbdL6BHB_pcHDhZ_Vz6OISYDS/exec";

const GAS_URL = SHENMA_SANGUO_GAS_URL;

async function callGAS(action: string, key?: string, payload?: object) {
  const res = await fetch(GAS_URL, {
    method: "POST",
    // 不設 Content-Type，避免 CORS preflight（GAS 不處理 OPTIONS）
    body: JSON.stringify({ action, key, payload }),
  });
  const data = await res.json();
  if (data.status !== 200) {
    throw new Error(data.error || "GAS_ERROR");
  }
  return data;
}

export const gameApi = {
  // ── 玩家 ──

  /**
   * 建立新玩家存檔
   * GAS 會自動給予初始武將，不需從 Web 端傳入
   */
  createProfile: (key: string, nickname: string) =>
    callGAS("create_profile", key, { nickname }),

  /**
   * 讀取玩家完整資料
   * 回傳：{ status: 200, data: { nickname, level, gold, heroes, team, ... } }
   */
  getProfile: (key: string) => callGAS("get_profile", key),

  /**
   * 覆寫玩家完整 data（隊伍變更、debounce 同步時使用）
   */
  saveProfile: (key: string, data: object) =>
    callGAS("save_profile", key, { data }),

  // ── 存檔 ──

  /**
   * 戰鬥結算：GAS 伺服器端更新金幣與 max_stage，並寫入 battle_logs
   */
  saveResult: (key: string, result: object) =>
    callGAS("save_result", key, result),

  // ── 武將升級 ──

  /**
   * 武將升級：GAS 伺服器端計算費用、扣金幣、更新屬性
   * 回傳：{ status: 200, hero: {...}, gold_remaining: number }
   * 失敗：{ status: 400, error: "GOLD_NOT_ENOUGH" }
   */
  upgradeHero: (key: string, heroId: string) =>
    callGAS("upgrade_hero", key, { hero_id: heroId }),

  // ── 靜態設定（讀取）──

  getHeroesConfig: () => callGAS("get_heroes_config"),
  getEnemiesConfig: () => callGAS("get_enemies_config"),
  getAllMaps: () => callGAS("get_all_maps"),
  getMapConfig: (mapId: string) =>
    callGAS("get_map_config", undefined, { map_id: mapId }),

  // ── 靜態設定（寫入）──

  /**
   * 批次覆寫整張 enemies_config sheet
   */
  saveEnemiesConfig: (enemies: object[]) =>
    callGAS("save_enemies_config", undefined, { enemies }),

  /**
   * 批次覆寫整張 heroes_config sheet
   */
  saveHeroesConfig: (heroes: object[]) =>
    callGAS("save_heroes_config", undefined, { heroes }),
};

// ── localStorage key 管理 ──

/**
 * 讀取目前的玩家 key（玩家自行設定，由設定頁寫入）
 * 尚未設定時回傳 null
 */
export function getPlayerKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("shenma_player_key");
}

/**
 * 將玩家 key 寫入 localStorage（設定頁確認後呼叫）
 */
export function setPlayerKey(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("shenma_player_key", key);
}
