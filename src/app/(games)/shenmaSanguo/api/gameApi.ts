// 神馬三國 GAS API Wrapper v2
// GAS 不支援 CORS preflight，所以不設定 Content-Type header
// body 傳純字串，GAS 用 e.postData.contents 讀取

// 建置時可用環境變數 NEXT_PUBLIC_SHENMA_GAS_URL 改成測試用的部署（例如試算表副本的 exec 網址）；沒有設定時是正式的後端。
// 網址會包進前端程式，只能放公開的部署網址，不能放任何密碼
export const SHENMA_SANGUO_GAS_URL =
  process.env.NEXT_PUBLIC_SHENMA_GAS_URL ||
  "https://script.google.com/macros/s/AKfycbwp4fh9r832zzUwY6x1HnvxrhuKxGAb0cluL_89ydsqSLQAwHHxMkUt_8mJQO1xDpue/exec";

const GAS_URL = SHENMA_SANGUO_GAS_URL;

/**
 * GAS 已處理請求並回傳錯誤（status ≠ 200）。
 * 和網路錯誤、無法解析的回應不同：這代表伺服器明確拒絕，而不是結果不明。
 * response 是後端回應的完整內容（例如版本衝突時附上雲端目前的 rev 與 data）
 */
export class GasError extends Error {
  readonly response: Record<string, unknown>;
  constructor(code: string, response: Record<string, unknown> = {}) {
    super(code);
    this.response = response;
  }
}

/** 完整結算獎勵的契約版本：請求與後端的回應都帶這個值才算新契約（見 saveResult） */
export const SETTLE_CONTRACT = 2;

/** 有數字時才帶 base_rev（舊版後端或版本不明時不帶） */
const withBase = (payload: object, baseRev?: number | null) =>
  typeof baseRev === "number" ? { ...payload, base_rev: baseRev } : payload;

async function callGAS(action: string, key?: string, payload?: object) {
  const res = await fetch(GAS_URL, {
    method: "POST",
    // 不設 Content-Type，避免 CORS preflight（GAS 不處理 OPTIONS）
    body: JSON.stringify({ action, key, payload }),
  });
  const data = await res.json();
  if (data.status !== 200) {
    throw new GasError(data.error || "GAS_ERROR", data);
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
   * baseRev：這份資料根據的雲端版本；雲端在這之後被改過時後端回 REV_CONFLICT（附雲端目前的 rev 與 data），不寫入
   * 回傳：{ status: 200, success: true, rev?, prev_rev? }（舊版後端沒有 rev）
   */
  saveProfile: (key: string, data: object, baseRev?: number | null) =>
    callGAS("save_profile", key, withBase({ data }, baseRev)),

  // ── 存檔 ──

  /**
   * 戰鬥結算：GAS 伺服器端更新存檔並寫入 battle_logs
   * requestId：這一場的識別碼；新版後端用它辨識重送（同一場只記錄一次），舊版後端忽略
   * baseRev：送出時本機的雲端版本；新版後端只在它等於寫入前的版本時才回傳新的 rev
   * fullReward：帶 settle_contract: 2，要求後端在同一次寫入保存完整獎勵（點數、經驗、等級、容量、進度）。
   *   支援的後端回應也帶 settle_contract: 2（附 request_id、reward、after）；舊後端不認得，照舊只記進度
   * 回傳：{ status: 200, success: true, log_id, prev_rev?, rev?, base_mismatch?, duplicate?, settle_contract?, reward?, after? }
   */
  saveResult: (
    key: string,
    result: object,
    requestId?: string,
    baseRev?: number | null,
    fullReward = false
  ) =>
    callGAS(
      "save_result",
      key,
      withBase(
        {
          ...result,
          ...(requestId ? { request_id: requestId } : {}),
          ...(fullReward ? { settle_contract: SETTLE_CONTRACT } : {}),
        },
        baseRev
      )
    ),

  // ── 武將升級 ──

  /**
   * 武將升級：GAS 伺服器端計算費用、扣金幣、更新屬性
   * baseRev：送出時本機的雲端版本；新版後端在雲端版本不同時回 REV_CONFLICT，不扣點數
   * 回傳：{ status: 200, hero: {...}, gold_remaining: number, cost?, rev?, prev_rev? }
   * 失敗：{ status: 400, error: "GOLD_NOT_ENOUGH" }
   */
  upgradeHero: (key: string, heroId: string, baseRev?: number | null) =>
    callGAS("upgrade_hero", key, withBase({ hero_id: heroId }, baseRev)),

  // ── 靜態設定（讀取）──

  getSettings: () => callGAS("get_settings"),
  getHeroesConfig: () => callGAS("get_heroes_config"),
  getEnemiesConfig: () => callGAS("get_enemies_config"),
  getAllMaps: () => callGAS("get_all_maps"),
  getMapConfig: (mapId: string) =>
    callGAS("get_map_config", undefined, { map_id: mapId }),

  // ── 靜態設定（寫入）──

  /**
   * 批次覆寫整張 enemies_config sheet（需要管理密碼；密碼錯誤或後端沒設定時回 ADMIN_REQUIRED）
   */
  saveEnemiesConfig: (enemies: object[], adminToken: string) =>
    callGAS("save_enemies_config", undefined, {
      enemies,
      admin_token: adminToken,
    }),

  /**
   * 批次覆寫整張 heroes_config sheet（需要管理密碼；密碼錯誤或後端沒設定時回 ADMIN_REQUIRED）
   */
  saveHeroesConfig: (heroes: object[], adminToken: string) =>
    callGAS("save_heroes_config", undefined, {
      heroes,
      admin_token: adminToken,
    }),
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
